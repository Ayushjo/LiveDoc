import { Router } from 'express';
import { z } from 'zod';
import { workspaceService } from '../services/workspace.service';
import { requireAuth } from '../middleware/auth.middleware';
import {
  requireWorkspaceMember,
  requireWorkspaceRole,
} from '../middleware/workspace.middleware';
import { ValidationError } from '../lib/errors';

export const workspaceRouter = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must be lowercase alphanumeric with hyphens (e.g. "my-workspace")',
  );

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(64),
  slug: slugSchema.optional(),
});

const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    slug: slugSchema.optional(),
  })
  .refine((d) => d.name !== undefined || d.slug !== undefined, {
    message: 'Provide at least one field to update',
  });

const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']), // OWNERship transfer is a separate operation
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/workspaces
 * Create a new workspace. The caller becomes the OWNER.
 */
workspaceRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input');
    }

    const workspace = await workspaceService.create(
      res.locals.user.id,
      parsed.data,
    );

    res.status(201).json({ data: workspace, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/workspaces
 * List all workspaces the authenticated user belongs to.
 */
workspaceRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const workspaces = await workspaceService.listForUser(res.locals.user.id);
    res.json({ data: workspaces, error: null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/workspaces/:workspaceId
 * Get a single workspace (user must be a member).
 */
workspaceRouter.get(
  '/:workspaceId',
  requireAuth,
  requireWorkspaceMember,
  async (req, res, next) => {
    try {
      const workspace = await workspaceService.getById(
        req.params.workspaceId,
        res.locals.user.id,
      );
      res.json({ data: workspace, error: null });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/workspaces/:workspaceId
 * Update workspace name/slug. Requires ADMIN or OWNER role.
 */
workspaceRouter.patch(
  '/:workspaceId',
  requireAuth,
  requireWorkspaceMember,
  requireWorkspaceRole('ADMIN'),
  async (req, res, next) => {
    try {
      const parsed = updateWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const workspace = await workspaceService.update(
        req.params.workspaceId,
        res.locals.user.id,
        parsed.data,
      );
      res.json({ data: workspace, error: null });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/workspaces/:workspaceId
 * Permanently delete a workspace. Requires OWNER role.
 */
workspaceRouter.delete(
  '/:workspaceId',
  requireAuth,
  requireWorkspaceMember,
  requireWorkspaceRole('OWNER'),
  async (req, res, next) => {
    try {
      await workspaceService.delete(req.params.workspaceId, res.locals.user.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/workspaces/:workspaceId/stats
 *
 * Returns real-time counts and recent sync activity for the dashboard.
 * Auth: session + workspace membership required.
 */
workspaceRouter.get(
  '/:workspaceId/stats',
  requireAuth,
  requireWorkspaceMember,
  async (req, res, next) => {
    try {
      const { workspaceId } = req.params;
      const { db } = await import('../db');

      // Run all count queries in parallel for speed
      const [
        totalDocuments,
        totalSources,
        totalChunks,
        embeddedChunks,
        recentSources,
      ] = await Promise.all([
        db.document.count({ where: { workspaceId } }),
        db.source.count({ where: { workspaceId } }),
        db.chunk.count({ where: { workspaceId } }),
        // Raw query needed — Prisma can't filter on Unsupported vector type IS NOT NULL
        db.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) AS count
          FROM "Chunk"
          WHERE "workspaceId" = ${workspaceId}
            AND embedding IS NOT NULL
        `.then((r) => Number(r[0]?.count ?? 0)),
        db.source.findMany({
          where: { workspaceId },
          orderBy: { lastSyncedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            type: true,
            syncStatus: true,
            lastSyncedAt: true,
            syncJobs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true, createdAt: true, documentsProcessed: true },
            },
          },
        }),
      ]);

      res.json({
        data: {
          totalDocuments,
          totalSources,
          totalChunks,
          embeddedChunks,
          recentActivity: recentSources.map((s) => ({
            sourceId: s.id,
            sourceName: s.name,
            sourceType: s.type,
            syncStatus: s.syncStatus,
            lastSyncedAt: s.lastSyncedAt,
            lastJob: s.syncJobs[0] ?? null,
          })),
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Member sub-routes ────────────────────────────────────────────────────────

/**
 * GET /api/workspaces/:workspaceId/members?cursor=<id>&take=<n>
 * List members with cursor pagination. Any workspace member can view.
 * Returns { members, nextCursor } — nextCursor is null on the last page.
 */
workspaceRouter.get(
  '/:workspaceId/members',
  requireAuth,
  requireWorkspaceMember,
  async (req, res, next) => {
    try {
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const take = req.query.take ? parseInt(req.query.take as string, 10) : 20;

      const result = await workspaceService.listMembers(req.params.workspaceId, {
        cursor,
        take: isNaN(take) ? 20 : take,
      });
      res.json({ data: result, error: null });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/workspaces/:workspaceId/members/:userId/role
 * Update a member's role. Requires OWNER.
 */
workspaceRouter.patch(
  '/:workspaceId/members/:userId/role',
  requireAuth,
  requireWorkspaceMember,
  requireWorkspaceRole('OWNER'),
  async (req, res, next) => {
    try {
      const parsed = updateMemberRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const member = await workspaceService.updateMemberRole(
        req.params.workspaceId,
        res.locals.user.id,
        req.params.userId,
        parsed.data.role,
      );
      res.json({ data: member, error: null });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/workspaces/:workspaceId/members/:userId
 * Remove a member (or leave the workspace). See service for role rules.
 */
workspaceRouter.delete(
  '/:workspaceId/members/:userId',
  requireAuth,
  requireWorkspaceMember,
  async (req, res, next) => {
    try {
      await workspaceService.removeMember(
        req.params.workspaceId,
        res.locals.user.id,
        req.params.userId,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
