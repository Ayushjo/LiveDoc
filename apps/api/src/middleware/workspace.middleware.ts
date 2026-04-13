// Phase 1 — verifies the requesting user is a member of :workspaceId.
// Attaches workspace to res.locals for downstream route handlers.
// TODO: implement when instructed.
import type { Request, Response, NextFunction } from 'express';

export function requireWorkspaceMember(
  _req: Request,
  _res: Response,
  _next: NextFunction,
): void {
  // TODO: check WorkspaceMember record, enforce role if needed
}
