import rateLimit from 'express-rate-limit';

// ─── Shared options ───────────────────────────────────────────────────────────

const baseOptions = {
  standardHeaders: true,   // Return RateLimit-* headers per RFC 6585
  legacyHeaders: false,     // Disable X-RateLimit-* legacy headers
  handler: (_req: never, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(429).json({
      data: null,
      error: {
        message: 'Too many requests. Please slow down and try again.',
        code: 'RATE_LIMITED',
      },
    });
  },
};

// ─── Route-specific limiters ──────────────────────────────────────────────────

/**
 * General API limiter — 120 requests per minute per IP.
 * Applied to all /api/* routes as a baseline.
 */
export const generalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60_000,
  max: 120,
  message: 'Too many requests',
});

/**
 * Auth limiter — 20 requests per 15 minutes per IP.
 * Applied to sign-in / sign-up routes to prevent brute-force attacks.
 */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60_000,
  max: 20,
  skipSuccessfulRequests: true, // Only count failed attempts
});

/**
 * Query limiter — 30 requests per minute per IP.
 * AI queries are expensive; this prevents cost abuse.
 */
export const queryLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60_000,
  max: 30,
});

/**
 * Sync limiter — 10 requests per minute per IP.
 * Syncs spawn background jobs and external API calls.
 */
export const syncLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60_000,
  max: 10,
});

/**
 * Invite limiter — 20 per hour per IP.
 * Prevents invite spam / email abuse.
 */
export const inviteLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60_000,
  max: 20,
});
