import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import type { WorkspaceRole } from '@prisma/client';

/**
 * requireWorkspaceMember — verifies the authenticated user belongs to :workspaceId.
 *
 * Prerequisites: requireAuth must run before this middleware (needs res.locals.user).
 *
 * On success:  attaches workspaceMember + workspace to res.locals, then calls next().
 * On failure:  404 if workspace doesn't exist, 403 if user is not a member.
 *
 * Usage:
 *   router.get('/:workspaceId/foo', requireAuth, requireWorkspaceMember, handler)
 */
export async function requireWorkspaceMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { workspaceId } = req.params;
    const userId = res.locals.user.id;

    if (!workspaceId) {
      next(new NotFoundError('Workspace'));
      return;
    }

    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
      include: { workspace: true },
    });

    if (!member) {
      // Deliberately vague — don't reveal whether workspace exists to non-members
      next(new ForbiddenError('You are not a member of this workspace'));
      return;
    }

    res.locals.workspaceMember = member;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * requireWorkspaceRole — gates a route to members with at least the given role.
 *
 * Role hierarchy (least → most privileged): MEMBER < ADMIN < OWNER
 *
 * Prerequisites: requireAuth + requireWorkspaceMember must run first.
 *
 * Usage:
 *   router.delete('/:workspaceId', requireAuth, requireWorkspaceMember, requireWorkspaceRole('OWNER'), handler)
 */
const ROLE_RANK: Record<WorkspaceRole, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
};

export function requireWorkspaceRole(minimumRole: WorkspaceRole) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const { role } = res.locals.workspaceMember;

    if (ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
      next(
        new ForbiddenError(
          `This action requires the ${minimumRole} role or above`,
        ),
      );
      return;
    }

    next();
  };
}
