// Phase 1 — BullMQ worker: calls OpenAI embeddings API for a batch of chunks,
// writes vectors to Chunk.embedding via raw SQL (pgvector).
// TODO: implement when instructed.
import { Worker } from 'bullmq';
import { createRedisConnection } from '../redis';
import type { EmbedBatchJobData } from '@livedoc/types';

export const embedWorker = new Worker<EmbedBatchJobData>(
  'embed',
  async (job) => {
    console.log(`[EmbedWorker] processing job ${job.id} — ${job.data.chunkIds.length} chunks`);
    // TODO: call embed.service.ts
  },
  {
    connection: createRedisConnection(),
    concurrency: 10,
  },
);

embedWorker.on('failed', (job, err) => {
  console.error(`[EmbedWorker] job ${job?.id} failed:`, err.message);
});
