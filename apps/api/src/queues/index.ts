import { Queue } from 'bullmq';
import { createRedisConnection } from '../redis';
import type { SyncJobData, EmbedBatchJobData } from '@livedoc/types';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5_000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Sync queue — jobs fetched and enqueued by sync.service.ts.
 * Processed by workers/sync.worker.ts.
 */
export const syncQueue = new Queue<SyncJobData>('sync', {
  connection: createRedisConnection(),
  defaultJobOptions,
});

/**
 * Embed queue — jobs enqueued by sync.worker.ts after chunking.
 * Processed by workers/embed.worker.ts.
 * Each job embeds a batch of up to 100 chunks (OpenAI batch limit).
 */
export const embedQueue = new Queue<EmbedBatchJobData>('embed', {
  connection: createRedisConnection(),
  defaultJobOptions,
});
