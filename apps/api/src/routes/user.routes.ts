import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth.middleware';
import { ValidationError, ForbiddenError } from '../lib/errors';

export const userRouter = Router();

/**
 * GET /api/users/me
 * Returns the authenticated user's profile.
 */
userRouter.get('/me', requireAuth, async (_req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: res.locals.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ data: user, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/users/me
 * Updates the authenticated user's display name.
 */
userRouter.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'Name is required').max(64).trim(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input');
    }

    const user = await db.user.update({
      where: { id: res.locals.user.id },
      data: { name: parsed.data.name },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ data: user, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/me
 * Permanently deletes the user's account.
 * Blocked if the user is the OWNER of any workspace (must transfer first).
 */
userRouter.delete('/me', requireAuth, async (_req, res, next) => {
  try {
    const userId = res.locals.user.id;

    // Check if user is an OWNER of any workspace
    const ownedWorkspaces = await db.workspaceMember.findMany({
      where: { userId, role: 'OWNER' },
      select: { workspace: { select: { name: true } } },
    });

    if (ownedWorkspaces.length > 0) {
      const names = ownedWorkspaces.map((m) => m.workspace.name).join(', ');
      throw new ForbiddenError(
        `Transfer ownership of "${names}" before deleting your account.`,
      );
    }

    // Cascade: Better Auth's DB adapter handles Session/Account deletion
    await db.user.delete({ where: { id: userId } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
