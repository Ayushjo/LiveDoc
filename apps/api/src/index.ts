import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import { workspaceRouter } from './routes/workspace.routes';
import { sourceRouter } from './routes/source.routes';
import { syncRouter } from './routes/sync.routes';
import { queryRouter } from './routes/query.routes';
import { userRouter } from './routes/user.routes';
import { invitationRouter, publicInvitationRouter } from './routes/invitation.routes';
import { errorHandler } from './lib/errors';
import { generalLimiter, authLimiter, queryLimiter, syncLimiter } from './lib/rate-limit';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

// ── CORS ──────────────────────────────────────────────────────────────────────
// Must be FIRST — before the Better Auth handler — so that auth routes
// also receive the correct CORS headers on preflight.
const corsOptions = {
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Better Auth handler ───────────────────────────────────────────────────────
// authLimiter applied first (brute-force protection), then the Better Auth handler.
// Better Auth reads its own body so it must come before express.json().
app.use('/api/auth', authLimiter);
app.all('/api/auth/*', toNodeHandler(auth));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Apply general limiter to all API routes as baseline
app.use('/api/', generalLimiter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/users', userRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/workspaces', invitationRouter);
app.use('/api/invitations', publicInvitationRouter);
app.use('/api/sources', sourceRouter);
app.use('/api/sync', syncLimiter, syncRouter);
app.use('/api/query', queryLimiter, queryRouter);

// ── Central error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[API] LiveDoc running on http://localhost:${PORT}`);
});

export { app };
