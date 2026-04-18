import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import { workspaceRouter } from './routes/workspace.routes';
import { sourceRouter } from './routes/source.routes';
import { syncRouter } from './routes/sync.routes';
import { queryRouter } from './routes/query.routes';
import { errorHandler } from './lib/errors';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

// ── CORS ──────────────────────────────────────────────────────────────────────
// Must be FIRST — before the Better Auth handler — so that auth routes
// (e.g. /api/auth/sign-in/social) also receive the correct CORS headers.
// Without this, the browser blocks the preflight OPTIONS request before
// Better Auth even sees it, producing the "CORS error" on social sign-in.
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,             // allow cookies (session) cross-origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Handle all OPTIONS pre-flight requests immediately (belt-and-suspenders)
app.options('*', cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Better Auth handler ───────────────────────────────────────────────────────
// Must be mounted BEFORE express.json() — Better Auth reads its own body.
app.all('/api/auth/*', toNodeHandler(auth));

// ── Body parsing + other middleware ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/workspaces', workspaceRouter);
app.use('/api/sources', sourceRouter);
app.use('/api/sync', syncRouter);
app.use('/api/query', queryRouter);

// ── Central error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[API] LiveDoc running on http://localhost:${PORT}`);
});

export { app };
