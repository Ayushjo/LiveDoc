import { db } from '../db';
import { embedTexts, EMBEDDING_MODEL, EMBEDDING_DIMS } from '../lib/ai';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Voyage AI `voyage-large-2` max inputs per request.
 * We conservatively cap at 100 (well under the 128 API limit) to leave
 * headroom for large token counts within a single batch.
 */
const VOYAGE_BATCH_LIMIT = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Writes a pgvector embedding to a single Chunk row via raw SQL.
 *
 * Prisma does not natively support the `vector` type, so we use $executeRaw
 * with a cast. pgvector expects the literal format: '[0.1,0.2,...]'
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
    SET    embedding        = ${vectorLiteral}::vector,
           "embeddingModel" = ${EMBEDDING_MODEL},
           "updatedAt"      = NOW()
    WHERE  id = ${chunkId}
  `;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const embedService = {
  /**
   * Embeds a batch of chunks (max VOYAGE_BATCH_LIMIT) in a single Voyage AI
   * API call, then writes each vector to the Chunk table via raw SQL.
   *
   * Caller is responsible for ensuring chunkIds.length <= VOYAGE_BATCH_LIMIT.
   * The embed worker splits larger sets into batches before calling this.
   *
   * @param chunkIds  IDs of Chunk records to embed (content already stored in DB)
   */
  async embedBatch(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;
    if (chunkIds.length > VOYAGE_BATCH_LIMIT) {
      throw new Error(
        `embedBatch received ${chunkIds.length} chunks — max is ${VOYAGE_BATCH_LIMIT}. Split into batches first.`,
      );
    }

    // Fetch chunk content
    const chunks = await db.chunk.findMany({
      where: { id: { in: chunkIds } },
      select: { id: true, content: true },
    });

    if (chunks.length === 0) return;

    // Single batched Voyage AI call — far cheaper than N individual calls.
    // input_type: 'document' tells Voyage to optimise for storage/retrieval.
    const embeddings = await embedTexts(
      chunks.map((c) => c.content),
      'document',
    );

    // Write vectors concurrently for throughput
    await Promise.all(
      chunks.map((chunk, i) => {
        const embedding = embeddings[i];
        if (!embedding) {
          throw new Error(
            `Missing embedding at index ${i} for chunk ${chunk.id}`,
          );
        }
        return writeEmbedding(chunk.id, embedding);
      }),
    );
  },

  /**
   * Splits an arbitrary-size list of chunk IDs into VOYAGE_BATCH_LIMIT-sized
   * batches and embeds them sequentially (respects Voyage rate limits).
   */
  async embedAll(chunkIds: string[]): Promise<void> {
    for (let i = 0; i < chunkIds.length; i += VOYAGE_BATCH_LIMIT) {
      const batch = chunkIds.slice(i, i + VOYAGE_BATCH_LIMIT);
      await embedService.embedBatch(batch);
    }
  },
};
