import { Router } from 'express';
import { z } from 'zod';
import { sourceService } from '../services/source.service';
import { requireAuth } from '../middleware/auth.middleware';
import { BadRequestError, ValidationError } from '../lib/errors';

export const sourceRouter = Router();

// ─── Notion OAuth ─────────────────────────────────────────────────────────────

/**
 * GET /api/sources/notion/connect?workspaceId=<id>
 *
 * Initiates the Notion OAuth flow. Redirects the browser to Notion's
 * authorization page. Must be visited directly (not via fetch) since
 * it sends a 302 redirect.
 *
 * Auth: session cookie required.
 */
sourceRouter.get(
  '/notion/connect',
  requireAuth,
  async (req, res, next) => {
    try {
      const schema = z.object({
        workspaceId: z.string().min(1, 'workspaceId is required'),
      });
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid query');
      }

      const authUrl = await sourceService.initiateNotionOAuth(
        parsed.data.workspaceId,
        res.locals.user.id,
      );

      res.redirect(authUrl);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/sources/notion/callback?code=<code>&state=<nonce>
 *
 * Notion redirects here after the user authorizes (or denies) the integration.
 * On success: creates the Source record and redirects to the frontend sources page.
 * On failure: redirects to the frontend with an error query param.
 *
 * No auth middleware — the state nonce stored in Redis acts as the CSRF guard.
 */
sourceRouter.get('/notion/callback', async (req, res, next) => {
  const frontendSourcesUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/sources`;

  try {
    // Notion sends `error` param when the user denies the request
    if (req.query.error) {
      const reason = String(req.query.error);
      return res.redirect(`${frontendSourcesUrl}?error=${encodeURIComponent(reason)}`);
    }

    const schema = z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Missing code or state parameter');
    }

    await sourceService.handleNotionCallback(parsed.data.code, parsed.data.state);

    // Redirect back to the frontend — success
    res.redirect(`${frontendSourcesUrl}?connected=notion`);
  } catch (err) {
    // Redirect to frontend with error instead of showing a raw API error page
    const message = err instanceof Error ? err.message : 'Connection failed';
    res.redirect(
      `${frontendSourcesUrl}?error=${encodeURIComponent(message)}`,
    );
    // Still propagate to the error handler for logging (don't call next)
    console.error('[Notion callback error]', err);
  }
});

// ─── GitHub OAuth ────────────────────────────────────────────────────────────

/**
 * GET /api/sources/github/connect?workspaceId=<id>
 *
 * Initiates the GitHub OAuth flow. Redirects the browser to GitHub's
 * authorization page. Must be visited directly (not via fetch).
 *
 * Auth: session cookie required.
 */
sourceRouter.get(
  '/github/connect',
  requireAuth,
  async (req, res, next) => {
    try {
      const schema = z.object({
        workspaceId: z.string().min(1, 'workspaceId is required'),
      });
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid query');
      }

      const authUrl = await sourceService.initiateGitHubOAuth(
        parsed.data.workspaceId,
        res.locals.user.id,
      );

      res.redirect(authUrl);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/sources/github/callback?code=<code>&state=<nonce>
 *
 * GitHub redirects here after the user authorizes (or denies) the integration.
 * On success: creates the Source record and redirects to the frontend sources page.
 * On failure: redirects to the frontend with an error query param.
 *
 * No auth middleware — the state nonce acts as the CSRF guard.
 */
sourceRouter.get('/github/callback', async (req, res) => {
  const frontendSourcesUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/sources`;

  try {
    if (req.query.error) {
      const reason = String(req.query.error);
      return res.redirect(`${frontendSourcesUrl}?error=${encodeURIComponent(reason)}`);
    }

    const schema = z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.redirect(
        `${frontendSourcesUrl}?error=${encodeURIComponent('Missing code or state parameter')}`,
      );
    }

    await sourceService.handleGitHubCallback(parsed.data.code, parsed.data.state);

    res.redirect(`${frontendSourcesUrl}?connected=github`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    console.error('[GitHub callback error]', err);
    res.redirect(`${frontendSourcesUrl}?error=${encodeURIComponent(message)}`);
  }
});

// ─── Source CRUD ──────────────────────────────────────────────────────────────

/**
 * GET /api/sources?workspaceId=<id>
 *
 * Lists all sources for a workspace.
 * Auth: session + workspace membership required.
 */
sourceRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      workspaceId: z.string().min(1, 'workspaceId query param is required'),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid query');
    }

    const sources = await sourceService.listSources(
      parsed.data.workspaceId,
      res.locals.user.id,
    );

    res.json({ data: sources, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sources/:sourceId
 *
 * Returns a single source. Membership check is done in the service layer.
 * Auth: session required.
 */
sourceRouter.get('/:sourceId', requireAuth, async (req, res, next) => {
  try {
    const source = await sourceService.getSource(
      req.params.sourceId,
      res.locals.user.id,
    );
    res.json({ data: source, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/sources/:sourceId
 *
 * Disconnects a source and cascades deletion of all documents and chunks.
 * Requires ADMIN or OWNER role — enforced in the service layer.
 * Auth: session required.
 */
sourceRouter.delete('/:sourceId', requireAuth, async (req, res, next) => {
  try {
    await sourceService.deleteSource(req.params.sourceId, res.locals.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
