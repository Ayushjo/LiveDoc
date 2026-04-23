import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

// ─── Shared 429 handler ───────────────────────────────────────────────────────

function rateLimitHandler(_req: Request, res: Response) {
  res.status(429).json({
    data: null,
    error: {
      message: 'Too many requests. Please slow down and try again.',
      code: 'RATE_LIMITED',
    },
  });
}

// ─── Route-specific limiters ──────────────────────────────────────────────────

/**
 * General API limiter — 120 requests per minute per IP.
 * Applied to all /api/* routes as a baseline.
 */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Auth limiter — 20 requests per 15 minutes per IP.
 * Applied to sign-in / sign-up routes to prevent brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler,
});

/**
 * Query limiter — 30 requests per minute per IP.
 * AI queries are expensive; this prevents cost abuse.
 */
export const queryLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Sync limiter — 10 requests per minute per IP.
 * Syncs spawn background jobs and external API calls.
 */
export const syncLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Invite limiter — 20 per hour per IP.
 * Prevents invite spam / email abuse.
 */
export const inviteLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
