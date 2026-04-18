import { ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ─── Base error class ─────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    // Restore prototype chain (needed when extending built-ins in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Typed subclasses ─────────────────────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, 'BAD_REQUEST', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(500, 'INTERNAL_ERROR', message);
  }
}

// ─── Central error handler middleware ────────────────────────────────────────
// Must be registered LAST in Express (4 params = error middleware).

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      data: null,
      error: { message: err.message, code: err.code },
    });
    return;
  }

  // Zod validation errors (thrown directly from safeParse or parse)
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const message = first
      ? `${first.path.join('.')}: ${first.message}`
      : 'Validation error';
    res.status(400).json({
      data: null,
      error: { message, code: 'VALIDATION_ERROR' },
    });
    return;
  }

  // Unknown errors — log and return generic 500
  console.error('[Unhandled error]', err);
  res.status(500).json({
    data: null,
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
  });
}
