// Phase 1 — BullMQ worker: fetches Notion pages, creates Document + Chunk records,
// then enqueues embed-batch jobs into embedQueue.
// TODO: implement when instructed.
import { Worker } from 'bullmq';
import { createRedisConnection } from '../redis';
import type { SyncJobData } from '@livedoc/types';

export const syncWorker = new Worker<SyncJobData>(
  'sync',
  async (job) => {
    console.log(`[SyncWorker] processing job ${job.id}`, job.data);
    // TODO: call sync.service.ts
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  },
);

syncWorker.on('failed', (job, err) => {
  console.error(`[SyncWorker] job ${job?.id} failed:`, err.message);
});
