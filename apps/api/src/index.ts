import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import { workspaceRouter } from './routes/workspace.routes';
import { errorHandler } from './lib/errors';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Better Auth handler ───────────────────────────────────────────────────────
// Must be mounted BEFORE express.json() — Better Auth reads its own body.
// Handles: sign-up, sign-in, sign-out, session, OAuth callbacks, password reset.
app.all('/api/auth/*', toNodeHandler(auth));

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true, // required for session cookies
  }),
);
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/workspaces', workspaceRouter);

// Placeholders — uncommented as each feature is built:
// app.use('/api/sources', sourceRouter);
// app.use('/api/sync', syncRouter);
// app.use('/api/query', queryRouter);

// ── Central error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[API] LiveDoc running on http://localhost:${PORT}`);
});

export { app };
