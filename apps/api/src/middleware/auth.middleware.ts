// Phase 1 — validates Better Auth session on protected routes.
// TODO: implement when instructed.
import type { Request, Response, NextFunction } from 'express';

export function requireAuth(_req: Request, _res: Response, _next: NextFunction): void {
  // TODO: validate session via auth.api.getSession()
}
