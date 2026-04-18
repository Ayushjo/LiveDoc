import { Router } from 'express';
import { z } from 'zod';
import { syncService } from '../services/sync.service';
import { requireAuth } from '../middleware/auth.middleware';
import { ValidationError } from '../lib/errors';

export const syncRouter = Router();

/**
 * POST /api/sync/:sourceId
 *
 * Triggers a manual sync for the given source. Returns the SyncJob record
 * immediately — actual sync runs in the background via BullMQ.
 *
 * Auth: session required. ADMIN or OWNER role required (enforced in service).
 */
syncRouter.post('/:sourceId', requireAuth, async (req, res, next) => {
  try {
    const syncJob = await syncService.triggerSync(
      req.params.sourceId,
      res.locals.user.id,
      'MANUAL',
    );

    res.status(202).json({ data: syncJob, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sync/jobs/:syncJobId
 *
 * Returns the current status and progress of a single sync job.
 * Poll this to show live progress in the UI.
 *
 * Auth: session + workspace membership (enforced in service).
 */
syncRouter.get('/jobs/:syncJobId', requireAuth, async (req, res, next) => {
  try {
    const syncJob = await syncService.getSyncJob(
      req.params.syncJobId,
      res.locals.user.id,
    );
    res.json({ data: syncJob, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sync/:sourceId/jobs
 *
 * Lists the 20 most recent sync jobs for a source, newest first.
 * Useful for the sync history panel in the UI.
 *
 * Auth: session + workspace membership (enforced in service).
 */
syncRouter.get('/:sourceId/jobs', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      sourceId: z.string().min(1),
    });
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid sourceId');
    }

    const jobs = await syncService.listSyncJobs(
      parsed.data.sourceId,
      res.locals.user.id,
    );
    res.json({ data: jobs, error: null });
  } catch (err) {
    next(err);
  }
});
