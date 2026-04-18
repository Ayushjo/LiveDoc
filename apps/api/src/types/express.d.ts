import type { User, WorkspaceMember, Workspace } from '@prisma/client';

/**
 * Augments Express's res.locals with typed fields that our middleware attaches.
 *
 * - res.locals.user          set by requireAuth
 * - res.locals.workspaceMember + workspace  set by requireWorkspaceMember
 */
declare global {
  namespace Express {
    interface Locals {
      /** Authenticated user — populated by requireAuth middleware. */
      user: Pick<User, 'id' | 'name' | 'email' | 'image' | 'emailVerified'>;

      /**
       * The WorkspaceMember row for (user, workspace) — populated by
       * requireWorkspaceMember middleware. Includes the parent workspace.
       */
      workspaceMember: WorkspaceMember & { workspace: Workspace };
    }
  }
}
