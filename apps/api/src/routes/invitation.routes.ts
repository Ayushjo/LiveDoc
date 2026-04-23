import { Router } from 'express';
import { z } from 'zod';
import { invitationService } from '../services/invitation.service';
import { requireAuth } from '../middleware/auth.middleware';
import { requireWorkspaceMember } from '../middleware/workspace.middleware';
import { ValidationError } from '../lib/errors';
import { inviteLimiter } from '../lib/rate-limit';

export const invitationRouter = Router();

// ─── Workspace-scoped invitation routes ───────────────────────────────────────
// Mounted at /api/workspaces/:workspaceId/invitations

/**
 * GET /api/workspaces/:workspaceId/invitations
 * Lists all pending invitations for a workspace. Visible to any member.
 */
invitationRouter.get(
  '/:workspaceId/invitations',
  requireAuth,
  requireWorkspaceMember,
  async (req, res, next) => {
    try {
      const invitations = await invitationService.list(
        req.params.workspaceId,
        res.locals.user.id,
      );
      res.json({ data: invitations, error: null });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/workspaces/:workspaceId/invitations
 * Creates an invitation and sends the invite email. Requires ADMIN+.
 */
invitationRouter.post(
  '/:workspaceId/invitations',
  requireAuth,
  requireWorkspaceMember,
  inviteLimiter,
  async (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().email('Valid email required'),
        role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const invitation = await invitationService.invite(
        req.params.workspaceId,
        res.locals.user.id,
        parsed.data.email,
        parsed.data.role,
      );

      res.status(201).json({ data: invitation, error: null });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/workspaces/:workspaceId/invitations/:invitationId
 * Cancels a pending invitation. Requires ADMIN+.
 */
invitationRouter.delete(
  '/:workspaceId/invitations/:invitationId',
  requireAuth,
  requireWorkspaceMember,
  async (req, res, next) => {
    try {
      await invitationService.cancel(
        req.params.workspaceId,
        req.params.invitationId,
        res.locals.user.id,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── Public invitation routes ─────────────────────────────────────────────────
// Mounted at /api/invitations

export const publicInvitationRouter = Router();

/**
 * GET /api/invitations/:token
 * Returns invitation details (public — no auth required).
 * Used to render the accept-invitation page.
 */
publicInvitationRouter.get('/:token', async (req, res, next) => {
  try {
    const invitation = await invitationService.getByToken(req.params.token);
    res.json({ data: invitation, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/invitations/:token/accept
 * Accepts an invitation. The user must be authenticated.
 * Their email must match the invite email.
 */
publicInvitationRouter.post(
  '/:token/accept',
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await invitationService.accept(
        req.params.token,
        res.locals.user.id,
      );
      res.json({ data: result, error: null });
    } catch (err) {
      next(err);
    }
  },
);
