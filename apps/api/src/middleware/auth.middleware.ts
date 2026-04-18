import type { Request, Response, NextFunction } from 'express';
import { auth } from '../auth';
import { UnauthorizedError } from '../lib/errors';

/**
 * requireAuth — validates the Better Auth session cookie / bearer token.
 *
 * On success:  attaches the authenticated user to res.locals.user, then calls next().
 * On failure:  passes an UnauthorizedError to Express's error handler (next(err)).
 *
 * Usage: apply to any route that requires a logged-in user.
 *   router.get('/me', requireAuth, handler)
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Better Auth accepts the raw Node IncomingHttpHeaders object.
    // It reads the session cookie or Authorization: Bearer <token> header.
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    });

    if (!session?.user) {
      next(new UnauthorizedError());
      return;
    }

    res.locals.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
      emailVerified: session.user.emailVerified,
    };

    next();
  } catch {
    next(new UnauthorizedError());
  }
}
