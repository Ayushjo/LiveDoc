import { Worker } from 'bullmq';
import { createRedisConnection } from '../redis';
import { syncService } from '../services/sync.service';
import { db } from '../db';
import type { SyncJobData } from '@livedoc/types';

/**
 * Sync worker — consumes jobs from the 'sync' queue.
 *
 * Handles two cases:
 *  - Manual/webhook: syncJobId is present (pre-created by triggerSync).
 *  - Scheduled:      syncJobId is absent — worker creates the DB record first.
 *
 * Concurrency: 5 — allows syncing 5 sources simultaneously.
 * BullMQ retries up to 3× with exponential backoff on unhandled errors.
 */
export const syncWorker = new Worker<SyncJobData>(
  'sync',
  async (job) => {
    const { sourceId, workspaceId, triggeredBy } = job.data;
    let { syncJobId } = job.data;

    console.log(
      `[SyncWorker] starting job=${job.id} source=${sourceId} trigger=${triggeredBy}`,
    );

    // Scheduled jobs don't carry a syncJobId — create the DB record now
    if (!syncJobId) {
      // Guard: skip if a sync is already running for this source
      const source = await db.source.findUnique({
        where: { id: sourceId },
        select: { syncStatus: true },
      });

      if (source?.syncStatus === 'SYNCING') {
        console.log(
          `[SyncWorker] skipping scheduled job for ${sourceId} — already syncing`,
        );
        return;
      }

      const dbJob = await db.syncJob.create({
        data: { sourceId, triggeredBy: 'SCHEDULED', status: 'PENDING' },
      });
      syncJobId = dbJob.id;
    }

    await syncService.runSync(sourceId, workspaceId, syncJobId);

    console.log(
      `[SyncWorker] completed job=${job.id} source=${sourceId}`,
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
