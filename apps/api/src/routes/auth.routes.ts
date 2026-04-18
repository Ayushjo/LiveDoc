/**
 * Auth routes are handled entirely by Better Auth via toNodeHandler(auth).
 * They are mounted in index.ts as:  app.all('/api/auth/*', toNodeHandler(auth))
 *
 * Better Auth exposes these endpoints automatically:
 *   POST  /api/auth/sign-up/email
 *   POST  /api/auth/sign-in/email
 *   POST  /api/auth/sign-in/social          (Google OAuth redirect)
 *   GET   /api/auth/callback/google         (Google OAuth callback)
 *   GET   /api/auth/session                 (get current session)
 *   POST  /api/auth/sign-out
 *   POST  /api/auth/forget-password
 *   POST  /api/auth/reset-password
 *
 * No custom route code is needed here — this file is kept for documentation.
 */
