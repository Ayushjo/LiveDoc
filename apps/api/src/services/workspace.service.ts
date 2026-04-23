import { db } from '../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import type { WorkspaceRole } from '@prisma/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a display name to a URL-safe slug.
 * "My Workspace!" → "my-workspace"
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Ensures a slug is unique. If the base slug is taken, appends a short
 * random suffix and retries — avoids silent collisions on auto-generated slugs.
 */
async function resolveUniqueSlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = base;

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === excludeId) return candidate;

    // Append a 4-char random suffix on collision
    const suffix = Math.random().toString(36).slice(2, 6);
    candidate = `${base.slice(0, 43)}-${suffix}`;
  }

  throw new ConflictError(
    `Could not generate a unique slug from "${base}". Please provide one explicitly.`,
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const workspaceService = {
  /**
   * Creates a new workspace and adds the creator as OWNER in one transaction.
   */
  async create(
    userId: string,
    input: { name: string; slug?: string },
  ) {
    const baseSlug = input.slug ?? toSlug(input.name);

    // If the user supplied a slug, check uniqueness immediately and error clearly.
    if (input.slug) {
      const existing = await db.workspace.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError(`Slug "${input.slug}" is already taken`);
      }
    }

    const finalSlug = input.slug ?? (await resolveUniqueSlug(baseSlug));

    return db.workspace.create({
      data: {
        name: input.name,
        slug: finalSlug,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        _count: { select: { members: true, sources: true } },
      },
    });
  },

  /**
   * Lists every workspace the user belongs to, ordered by most recently joined.
   * Returns each workspace augmented with the user's role and joinedAt.
   */
  async listForUser(userId: string) {
    const memberships = await db.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true, sources: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map(({ workspace, role, joinedAt }) => ({
      ...workspace,
      role,
      joinedAt,
    }));
  },

  /**
   * Returns a single workspace the user is a member of.
   * Throws 404 if the workspace doesn't exist or user isn't a member.
   */
  async getById(workspaceId: string, userId: string) {
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true, sources: true } },
          },
        },
      },
    });

    if (!member) throw new NotFoundError('Workspace');

    return { ...member.workspace, role: member.role };
  },

  /**
   * Updates workspace name and/or slug. Requires ADMIN or OWNER role.
   */
  async update(
    workspaceId: string,
    userId: string,
    input: { name?: string; slug?: string },
  ) {
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });

    if (!member) throw new NotFoundError('Workspace');
    if (member.role === 'MEMBER') {
      throw new ForbiddenError('Only ADMINs and OWNERs can update workspace settings');
    }

    if (input.slug) {
      const existing = await db.workspace.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existing && existing.id !== workspaceId) {
        throw new ConflictError(`Slug "${input.slug}" is already taken`);
      }
    }

    return db.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
      },
    });
  },

  /**
   * Permanently deletes the workspace. Requires OWNER role.
   * Cascades to all members, sources, documents, and chunks.
   */
  async delete(workspaceId: string, userId: string) {
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });

    if (!member) throw new NotFoundError('Workspace');
    if (member.role !== 'OWNER') {
      throw new ForbiddenError('Only the workspace OWNER can delete it');
    }

    await db.workspace.delete({ where: { id: workspaceId } });
  },

  /**
   * Lists members of a workspace with cursor-based pagination.
   * Default page size: 20. Returns nextCursor = null when no more pages.
   */
  async listMembers(
    workspaceId: string,
    opts: { cursor?: string; take?: number } = {},
  ) {
    const take = Math.min(opts.take ?? 20, 100); // hard cap at 100

    const rows = await db.workspaceMember.findMany({
      where: { workspaceId },
      take: take + 1, // fetch one extra to detect next page
      ...(opts.cursor
        ? { cursor: { id: opts.cursor }, skip: 1 }
        : {}),
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: [
        { role: 'asc' },  // OWNER → ADMIN → MEMBER
        { joinedAt: 'asc' },
      ],
    });

    const hasMore = rows.length > take;
    const members = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? (members[members.length - 1]?.id ?? null) : null;

    return { members, nextCursor };
  },

  /**
   * Updates a member's role. Only OWNER can change roles.
   * An OWNER cannot demote themselves (must transfer ownership first).
   */
  async updateMemberRole(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
    newRole: WorkspaceRole,
  ) {
    const [actor, target] = await Promise.all([
      db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: actorId } },
        select: { role: true },
      }),
      db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        select: { role: true },
      }),
    ]);

    if (!actor) throw new NotFoundError('Workspace');
    if (!target) throw new NotFoundError('Member');
    if (actor.role !== 'OWNER') {
      throw new ForbiddenError('Only the workspace OWNER can change member roles');
    }
    if (actorId === targetUserId && newRole !== 'OWNER') {
      throw new ForbiddenError(
        'Transfer ownership to another member before changing your own role',
      );
    }

    return db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: newRole },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  },

  /**
   * Removes a member from the workspace.
   * OWNERs cannot remove themselves.
   * Any member can remove themselves (leave). ADMIN/OWNER can remove others.
   */
  async removeMember(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
  ) {
    const [actor, target] = await Promise.all([
      db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: actorId } },
        select: { role: true },
      }),
      db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        select: { role: true },
      }),
    ]);

    if (!actor) throw new NotFoundError('Workspace');
    if (!target) throw new NotFoundError('Member');

    const isSelf = actorId === targetUserId;

    if (isSelf && actor.role === 'OWNER') {
      throw new ForbiddenError(
        'Transfer ownership before leaving the workspace',
      );
    }

    if (!isSelf && actor.role === 'MEMBER') {
      throw new ForbiddenError('You do not have permission to remove other members');
    }

    await db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
  },
};
