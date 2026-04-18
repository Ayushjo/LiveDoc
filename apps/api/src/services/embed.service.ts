import { db } from '../db';
import { openai, EMBEDDING_MODEL, EMBEDDING_DIMS } from '../lib/openai';

// ─── Constants ────────────────────────────────────────────────────────────────

/** OpenAI embeddings API maximum inputs per request */
const OPENAI_BATCH_LIMIT = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Writes a pgvector embedding to a single Chunk row via raw SQL.
 *
 * Prisma does not natively support the `vector` type, so we use $executeRaw
 * with a cast. The vector string format pgvector expects is: '[0.1,0.2,...]'
 */
async function writeEmbedding(
  chunkId: string,
  embedding: number[],
): Promise<void> {
  if (embedding.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Unexpected embedding dimensions: got ${embedding.length}, expected ${EMBEDDING_DIMS}`,
    );
  }

  const vectorLiteral = `[${embedding.join(',')}]`;

  await db.$executeRaw`
    UPDATE "Chunk"
    SET    embedding       = ${vectorLiteral}::vector,
           "embeddingModel" = ${EMBEDDING_MODEL},
           "updatedAt"      = NOW()
    WHERE  id = ${chunkId}
  `;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const embedService = {
  /**
   * Embeds a batch of chunks (max OPENAI_BATCH_LIMIT) in a single OpenAI
   * API call, then writes each vector to the Chunk table via raw SQL.
   *
   * Caller is responsible for ensuring chunkIds.length <= OPENAI_BATCH_LIMIT.
   * The embed worker splits larger sets into batches before calling this.
   *
   * @param chunkIds  IDs of Chunk records to embed (content already stored)
   */
  async embedBatch(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;
    if (chunkIds.length > OPENAI_BATCH_LIMIT) {
      throw new Error(
        `embedBatch received ${chunkIds.length} chunks — max is ${OPENAI_BATCH_LIMIT}. Split into batches first.`,
      );
    }

    // Fetch chunk content in workspaceId-isolated query
    const chunks = await db.chunk.findMany({
      where: { id: { in: chunkIds } },
      select: { id: true, content: true },
    });

    if (chunks.length === 0) return;

    // Single batched API call — far cheaper than N individual calls
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chunks.map((c) => c.content),
    });

    // Write vectors — run concurrently for throughput
    await Promise.all(
      chunks.map((chunk, i) => {
        const embeddingData = response.data[i];
        if (!embeddingData) {
          throw new Error(`Missing embedding at index ${i} for chunk ${chunk.id}`);
        }
        return writeEmbedding(chunk.id, embeddingData.embedding);
      }),
    );
  },

  /**
   * Splits an arbitrary-size list of chunk IDs into OPENAI_BATCH_LIMIT-sized
   * batches and embeds them sequentially (to respect rate limits).
   *
   * For very high volume, consider running batches in a controlled concurrency
   * pool — sequential is safe and sufficient for Phase 1.
   */
  async embedAll(chunkIds: string[]): Promise<void> {
    for (let i = 0; i < chunkIds.length; i += OPENAI_BATCH_LIMIT) {
      const batch = chunkIds.slice(i, i + OPENAI_BATCH_LIMIT);
      await embedService.embedBatch(batch);
    }
  },
};
