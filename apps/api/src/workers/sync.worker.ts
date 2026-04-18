import { Worker } from 'bullmq';
import { createRedisConnection } from '../redis';
import { syncService } from '../services/sync.service';
import type { SyncJobData } from '@livedoc/types';

/**
 * Sync worker — consumes jobs from the 'sync' queue.
 *
 * Each job runs the full Notion fetch → delta-detect → chunk → enqueue-embed
 * pipeline for one source. Per-page errors are caught inside syncService.runSync
 * so a single bad page never aborts the whole sync.
 *
 * Concurrency: 5 — allows syncing 5 sources simultaneously.
 * BullMQ retries up to 3× with exponential backoff on unhandled errors.
 */
export const syncWorker = new Worker<SyncJobData>(
  'sync',
  async (job) => {
    const { sourceId, workspaceId, syncJobId } = job.data;

    console.log(
      `[SyncWorker] starting job=${job.id} source=${sourceId} syncJob=${syncJobId}`,
    );

    await syncService.runSync(sourceId, workspaceId, syncJobId);

    console.log(
      `[SyncWorker] completed job=${job.id} source=${sourceId} syncJob=${syncJobId}`,
    );
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  },
);

syncWorker.on('failed', (job, err) => {
  console.error(
    `[SyncWorker] job=${job?.id} source=${job?.data.sourceId} FAILED:`,
    err.message,
  );
});

syncWorker.on('error', (err) => {
  console.error('[SyncWorker] worker error:', err.message);
});
