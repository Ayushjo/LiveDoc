import { db } from '../db';
import { anthropic, embedTexts, CLAUDE_MODEL } from '../lib/ai';
import type { Citation } from '@livedoc/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of chunks to retrieve from pgvector. */
const TOP_K = 12;

/**
 * Minimum cosine similarity to include a chunk in context.
 * voyage-large-2 produces normalised vectors: similarity 1.0 = identical,
 * 0.0 = orthogonal. 0.25 removes clearly irrelevant chunks without being
 * too aggressive on shorter queries.
 */
const SIMILARITY_THRESHOLD = 0.25;

// ─── Internal types ───────────────────────────────────────────────────────────

interface ChunkSearchRow {
  id: string;
  content: string;
  documentId: string;
  chunkIndex: number;
  metadata: unknown;
  similarity: number;
}

export interface RetrievedContext {
  /** Formatted context string injected into the system prompt. */
  contextText: string;
  /** Structured citations returned alongside the streamed answer. */
  citations: Citation[];
  /** True when the workspace has no embedded chunks yet. */
  isEmpty: boolean;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are a precise, helpful assistant with access to the user's knowledge base.

Rules:
- Answer ONLY using information from the provided context blocks. Do not use prior knowledge.
- Cite every claim using [N] notation, where N matches the context block number.
- If multiple blocks support a point, cite all relevant ones: [1][3].
- If the context does not contain enough information to answer, say exactly:
  "The knowledge base doesn't contain enough information to answer this question."
- Be concise and direct. Do not pad your answer with filler phrases.
- Format your answer in Markdown where appropriate (lists, bold, code blocks).`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Embeds a query string using the same model used for chunk embeddings. */
async function embedQuery(query: string): Promise<number[]> {
  // input_type: 'query' — Voyage uses asymmetric embedding; this improves recall
  const [embedding] = await embedTexts([query], 'query');
  if (!embedding) throw new Error('Voyage AI returned no embedding for the query');
  return embedding;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const queryService = {
  /**
   * Retrieves the top-K most relevant chunks for a query using pgvector
   * cosine similarity (`<=>` operator). Filters by workspaceId for tenant
   * isolation — no cross-workspace data ever leaks into context.
   */
  async retrieve(workspaceId: string, query: string): Promise<RetrievedContext> {
    const embedding = await embedQuery(query);
    const queryVector = `[${embedding.join(',')}]`;

    // ── pgvector cosine similarity search ────────────────────────────────────
    // <=> is the cosine distance operator. similarity = 1 - distance.
    // We skip chunks with embedding IS NULL (embed worker not yet finished).
    const rows = await db.$queryRaw<ChunkSearchRow[]>`
      SELECT
        c.id,
        c.content,
        c."documentId",
        c."chunkIndex",
        c.metadata,
        1 - (c.embedding <=> ${queryVector}::vector) AS similarity
      FROM   "Chunk" c
      WHERE  c."workspaceId" = ${workspaceId}
        AND  c.embedding IS NOT NULL
      ORDER  BY c.embedding <=> ${queryVector}::vector
      LIMIT  ${TOP_K}
    `;

    if (rows.length === 0) {
      return { contextText: '', citations: [], isEmpty: true };
    }

    // Filter below threshold
    const relevant = rows.filter((r) => r.similarity >= SIMILARITY_THRESHOLD);
    if (relevant.length === 0) {
      return { contextText: '', citations: [], isEmpty: false };
    }

    // ── Fetch document metadata for citations ────────────────────────────────
    const documentIds = [...new Set(relevant.map((r) => r.documentId))];
    const documents = await db.document.findMany({
      where: { id: { in: documentIds }, workspaceId },
      select: { id: true, title: true, url: true },
    });

    const docMap = new Map(documents.map((d) => [d.id, d]));

    // ── Build numbered context blocks ─────────────────────────────────────────
    const contextBlocks = relevant.map((chunk, i) => {
      const doc = docMap.get(chunk.documentId);
      const meta = chunk.metadata as { headingPath?: string[] } | null;
      const headingPath = meta?.headingPath ?? [];

      const lines: string[] = [`[${i + 1}] Document: "${doc?.title ?? 'Untitled'}"`];
      if (headingPath.length > 0) {
        lines.push(`Path: ${headingPath.join(' › ')}`);
      }
      lines.push('---', chunk.content);

      return lines.join('\n');
    });

    const contextText = contextBlocks.join('\n\n');

    // ── Build typed citations array ───────────────────────────────────────────
    const citations: Citation[] = relevant.map((chunk, i) => {
      const doc = docMap.get(chunk.documentId);
      const meta = chunk.metadata as { headingPath?: string[] } | null;
      return {
        index: i + 1,
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: doc?.title ?? 'Untitled',
        documentUrl: doc?.url ?? '',
        content: chunk.content,
        headingPath: meta?.headingPath ?? [],
        similarity: Math.round(chunk.similarity * 1000) / 1000,
      };
    });

    return { contextText, citations, isEmpty: false };
  },

  /** Builds the user turn injected into the Claude message. */
  buildUserMessage(contextText: string, query: string): string {
    if (!contextText) {
      return `Question: ${query}\n\n(Note: No relevant documents were found in the knowledge base.)`;
    }
    return `Context:\n${contextText}\n\nQuestion: ${query}`;
  },

  /**
   * Creates a streaming Claude message.
   * Returns the Anthropic stream — the route handler pipes it to SSE.
   *
   * Using `stream: true` on `messages.create` returns an async iterable of
   * `MessageStreamEvent` objects — no extra library needed.
   */
  async createStream(contextText: string, query: string) {
    return anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      stream: true,
      temperature: 0.2, // low temp for factual RAG — reduces hallucination
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: queryService.buildUserMessage(contextText, query),
        },
      ],
    });
  },
};
