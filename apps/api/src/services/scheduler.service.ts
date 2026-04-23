/**
 * Scheduler Service
 *
 * Manages BullMQ repeatable jobs for automatic source syncing.
 * Jobs are stored in Redis and survive server restarts — on boot,
 * `rescheduleAll()` re-registers all active schedules from the DB.
 */

import { syncQueue } from '../queues';
import { db } from '../db';
import type { SyncInterval } from '@livedoc/types';

// ─── Interval → milliseconds ──────────────────────────────────────────────────

const INTERVAL_MS: Record<Exclude<SyncInterval, 'MANUAL'>, number> = {
  HOURLY:   1  * 60 * 60 * 1000,
  EVERY_6H: 6  * 60 * 60 * 1000,
  DAILY:    24 * 60 * 60 * 1000,
  WEEKLY:   7  * 24 * 60 * 60 * 1000,
};

export const INTERVAL_LABELS: Record<SyncInterval, string> = {
  MANUAL:   'Manual only',
  HOURLY:   'Every hour',
  EVERY_6H: 'Every 6 hours',
  DAILY:    'Every day',
  WEEKLY:   'Every week',
};

/** Deterministic BullMQ job name for a source's scheduled sync. */
function jobName(sourceId: string): string {
  return `scheduled:${sourceId}`;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const schedulerService = {
  /**
   * Removes any existing repeatable job for `sourceId`, then (if interval ≠
   * MANUAL) creates a new one in Redis.
   */
  async schedule(
    sourceId: string,
    workspaceId: string,
    interval: SyncInterval,
  ): Promise<void> {
    // Always clear first to avoid duplicate repeatable jobs
    await this.unschedule(sourceId);

    if (interval === 'MANUAL') return;

    const every = INTERVAL_MS[interval];

    await syncQueue.add(
      jobName(sourceId),
      { sourceId, workspaceId, triggeredBy: 'SCHEDULED' as const },
      { repeat: { every } },
    );

    console.log(
      `[Scheduler] ${sourceId} scheduled every ${every / 60_000}m`,
    );
  },

  /**
   * Removes the repeatable job for `sourceId` from Redis (if present).
   * Safe to call even if no job exists.
   */
  async unschedule(sourceId: string): Promise<void> {
    const repeatable = await syncQueue.getRepeatableJobs();
    const job = repeatable.find((j) => j.name === jobName(sourceId));
    if (job) {
      await syncQueue.removeRepeatableByKey(job.key);
      console.log(`[Scheduler] removed schedule for ${sourceId}`);
    }
  },

  /**
   * Called once on API startup.
   * Reads all sources with a non-MANUAL interval and re-registers their
   * repeatable jobs in Redis (idempotent — unschedule runs first).
   */
  async rescheduleAll(): Promise<void> {
    const sources = await db.source.findMany({
      where: { syncInterval: { not: 'MANUAL' } },
      select: { id: true, workspaceId: true, syncInterval: true },
    });

    console.log(
      `[Scheduler] restoring ${sources.length} active schedule(s) on startup`,
    );

    for (const source of sources) {
      await this.schedule(source.id, source.workspaceId, source.syncInterval);
    }
  },
};
