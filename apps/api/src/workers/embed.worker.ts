import { Worker } from 'bullmq';
import { createRedisConnection } from '../redis';
import { embedService } from '../services/embed.service';
import type { EmbedBatchJobData } from '@livedoc/types';

/**
 * Embed worker — consumes jobs from the 'embed' queue.
 *
 * Each job embeds a batch of up to 100 chunks in a single OpenAI API call,
 * then writes the resulting vectors to the Chunk table via raw pgvector SQL.
 *
 * Concurrency: 10 — allows parallelising embedding across sources.
 * Each job is already capped at 100 chunks so we don't blow the rate limit.
 * BullMQ retries up to 3× with exponential backoff on OpenAI transient errors.
 */
export const embedWorker = new Worker<EmbedBatchJobData>(
  'embed',
  async (job) => {
    const { chunkIds } = job.data;

    console.log(
      `[EmbedWorker] starting job=${job.id} chunks=${chunkIds.length}`,
    );

    await embedService.embedBatch(chunkIds);

    console.log(
      `[EmbedWorker] completed job=${job.id} chunks=${chunkIds.length}`,
    );
  },
  {
    connection: createRedisConnection(),
    concurrency: 10,
  },
);

embedWorker.on('failed', (job, err) => {
  console.error(
    `[EmbedWorker] job=${job?.id} chunks=${job?.data.chunkIds.length} FAILED:`,
    err.message,
  );
});

embedWorker.on('error', (err) => {
  console.error('[EmbedWorker] worker error:', err.message);
});
