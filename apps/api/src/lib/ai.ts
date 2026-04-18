import Anthropic from '@anthropic-ai/sdk';

// ─── Env guards ───────────────────────────────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is not set');
}
if (!process.env.VOYAGE_API_KEY) {
  throw new Error('VOYAGE_API_KEY environment variable is not set');
}

// ─── Anthropic client (Claude) ────────────────────────────────────────────────

/**
 * Shared Anthropic client singleton.
 * Used for all chat / RAG generation calls.
 */
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Claude model used for streaming RAG answers. */
export const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022' as const;

// ─── Voyage AI (embeddings) ───────────────────────────────────────────────────

/**
 * Voyage AI embedding model.
 * `voyage-large-2` produces 1536-dimensional vectors — an exact match for our
 * existing pgvector(1536) schema, so no DB migration is needed.
 */
export const EMBEDDING_MODEL = 'voyage-large-2' as const;

/** Dimension count MUST match the schema: `embedding Unsupported("vector(1536)")` */
export const EMBEDDING_DIMS = 1536 as const;

interface VoyageEmbeddingResponse {
  object: 'list';
  data: Array<{ object: 'embedding'; embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Calls the Voyage AI embeddings REST API.
 *
 * @param inputs     Text strings to embed (max 128 per call for voyage-large-2)
 * @param inputType  'document' when indexing chunks; 'query' when embedding a search query.
 *                   Voyage AI uses asymmetric embedding — optimising separately improves recall.
 */
export async function embedTexts(
  inputs: string[],
  inputType: 'document' | 'query' = 'document',
): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Voyage AI embeddings failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as VoyageEmbeddingResponse;

  // Return embeddings in input order (Voyage guarantees index ordering)
  return body.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
