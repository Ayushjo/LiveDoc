import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes (mounted as Phase 1 progresses) ────────────────────────────────────
// import { authRouter } from './routes/auth.routes';
// import { workspaceRouter } from './routes/workspace.routes';
// import { sourceRouter } from './routes/source.routes';
// import { syncRouter } from './routes/sync.routes';
// import { queryRouter } from './routes/query.routes';
//
// app.all('/api/auth/*', (req, res) => auth.handler(req, res));
// app.use('/api/workspaces', workspaceRouter);
// app.use('/api/sources', sourceRouter);
// app.use('/api/sync', syncRouter);
// app.use('/api/query', queryRouter);

app.listen(PORT, () => {
  console.log(`[API] LiveDoc running on http://localhost:${PORT}`);
});

export { app };
