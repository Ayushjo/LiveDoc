import type { ContentBlock } from './notion.service';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum tokens per chunk.
 * text-embedding-3-small supports 8191 tokens, but smaller chunks produce
 * better retrieval precision. 512 is the industry-standard sweet spot.
 */
const MAX_TOKENS = 512;

/**
 * Minimum tokens for a standalone chunk.
 * Chunks below this threshold are merged with a neighbour to avoid
 * embedding near-empty vectors that hurt retrieval quality.
 */
const MIN_TOKENS = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawChunk {
  content: string;
  tokenCount: number;
  metadata: {
    headingPath: string[];
    [key: string]: unknown;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Character-based token count approximation.
 * 1 token ≈ 4 characters for English text — accurate within ~15%,
 * which is more than sufficient for chunking boundary decisions.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits text on sentence boundaries while avoiding false positives on
 * abbreviations (e.g. "Dr. Smith", "U.S.A.").
 *
 * Strategy: split on [.!?] followed by whitespace + uppercase letter,
 * but only when the character before the period is NOT a single uppercase
 * letter (which would indicate an abbreviation).
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[^A-Z][.!?])\s+(?=[A-Z"'])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Tracks the current heading path as we walk through blocks.
 * Heading hierarchy: h1 resets everything; h2 keeps h1; h3 keeps h1+h2.
 */
function updateHeadingPath(current: string[], block: ContentBlock): string[] {
  if (block.type === 'h1') return [block.text];
  if (block.type === 'h2') return current[0] ? [current[0], block.text] : [block.text];
  if (block.type === 'h3') {
    if (current[0] && current[1]) return [current[0], current[1], block.text];
    if (current[0]) return [current[0], block.text];
    return [block.text];
  }
  return current;
}

/**
 * Converts a paragraph (possibly very long) into sentence-level sub-chunks,
 * filling each sub-chunk up to MAX_TOKENS before starting a new one.
 */
function chunkParagraphBySentence(
  para: string,
  headingPath: string[],
): RawChunk[] {
  const sentences = splitSentences(para);
  const chunks: RawChunk[] = [];
  let buffer = '';
  let bufferTokens = 0;

  for (const sentence of sentences) {
    const sentTokens = estimateTokens(sentence);

    if (buffer && bufferTokens + sentTokens > MAX_TOKENS) {
      chunks.push({
        content: buffer.trim(),
        tokenCount: bufferTokens,
        metadata: { headingPath: [...headingPath] },
      });
      buffer = '';
      bufferTokens = 0;
    }

    buffer += (buffer ? ' ' : '') + sentence;
    bufferTokens += sentTokens;
  }

  if (buffer.trim()) {
    chunks.push({
      content: buffer.trim(),
      tokenCount: bufferTokens,
      metadata: { headingPath: [...headingPath] },
    });
  }

  return chunks;
}

/**
 * Converts the paragraphs of one section into chunks, respecting MAX_TOKENS.
 * Large paragraphs are broken further by sentence.
 */
function chunkSection(headingPath: string[], paragraphs: string[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let buffer = '';
  let bufferTokens = 0;

  const flushBuffer = () => {
    if (buffer.trim()) {
      chunks.push({
        content: buffer.trim(),
        tokenCount: bufferTokens,
        metadata: { headingPath: [...headingPath] },
      });
      buffer = '';
      bufferTokens = 0;
    }
  };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (paraTokens > MAX_TOKENS) {
      // Paragraph too large — flush current buffer, then split by sentence
      flushBuffer();
      chunks.push(...chunkParagraphBySentence(para, headingPath));
    } else if (buffer && bufferTokens + paraTokens > MAX_TOKENS) {
      // Adding this paragraph would overflow — flush first, then start fresh
      flushBuffer();
      buffer = para;
      bufferTokens = paraTokens;
    } else {
      // Accumulate — separate paragraphs with a blank line for readability
      buffer += (buffer ? '\n\n' : '') + para;
      bufferTokens += paraTokens;
    }
  }

  flushBuffer();
  return chunks;
}

/**
 * Merges chunks below MIN_TOKENS with an adjacent chunk in the same section.
 * Pass that traverses forward: if a chunk is tiny, absorb the next chunk
 * into it (or this chunk into the previous one).
 *
 * Cross-section merging is intentionally not done — heading boundaries are
 * meaningful and should not be collapsed for retrieval quality.
 */
function mergeSmallChunks(chunks: RawChunk[]): RawChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: RawChunk[] = [];

  for (const chunk of chunks) {
    const prev = result[result.length - 1];
    const sameSection =
      prev &&
      JSON.stringify(prev.metadata.headingPath) ===
        JSON.stringify(chunk.metadata.headingPath);

    if (
      prev &&
      sameSection &&
      (prev.tokenCount < MIN_TOKENS || chunk.tokenCount < MIN_TOKENS) &&
      prev.tokenCount + chunk.tokenCount <= MAX_TOKENS
    ) {
      // Merge into previous chunk
      prev.content += '\n\n' + chunk.content;
      prev.tokenCount += chunk.tokenCount;
    } else {
      result.push({ ...chunk, metadata: { ...chunk.metadata } });
    }
  }

  return result;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const chunkerService = {
  /**
   * Converts a page's ContentBlock[] (from notion.service) into an ordered
   * array of RawChunks ready to be persisted and embedded.
   *
   * Algorithm:
   *  1. Walk blocks, using h1/h2/h3 as section boundaries — each heading
   *     updates the running headingPath.
   *  2. Accumulate text blocks into sections.
   *  3. For each section, fill chunks up to MAX_TOKENS (paragraph-first,
   *     sentence-fallback for oversized paragraphs).
   *  4. Post-pass: merge chunks below MIN_TOKENS with their neighbour.
   *  5. Assign final chunkIndex (0-based, document-ordered).
   */
  chunk(blocks: ContentBlock[]): RawChunk[] {
    if (blocks.length === 0) return [];

    // ── 1 & 2: Walk blocks and group into sections ───────────────────────────
    type Section = { headingPath: string[]; paragraphs: string[] };
    const sections: Section[] = [];
    let currentPath: string[] = [];
    let currentParagraphs: string[] = [];

    const pushSection = () => {
      if (currentParagraphs.length > 0) {
        sections.push({
          headingPath: [...currentPath],
          paragraphs: [...currentParagraphs],
        });
        currentParagraphs = [];
      }
    };

    for (const block of blocks) {
      if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
        pushSection();
        currentPath = updateHeadingPath(currentPath, block);
      } else if (block.text.trim()) {
        currentParagraphs.push(block.text.trim());
      }
    }
    pushSection();

    // ── 3: Chunk each section ─────────────────────────────────────────────────
    const allChunks: RawChunk[] = sections.flatMap(({ headingPath, paragraphs }) =>
      chunkSection(headingPath, paragraphs),
    );

    // ── 4: Merge tiny chunks ──────────────────────────────────────────────────
    const merged = mergeSmallChunks(allChunks);

    // ── 5: Assign chunkIndex ─────────────────────────────────────────────────
    return merged.map((chunk, index) => ({
      ...chunk,
      metadata: { ...chunk.metadata, chunkIndex: index },
    }));
  },
};
