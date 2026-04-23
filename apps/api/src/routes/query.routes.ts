import { Router } from 'express';
import { z } from 'zod';
import { queryService } from '../services/query.service';
import { requireAuth } from '../middleware/auth.middleware';
import { db } from '../db';
import { ForbiddenError, ValidationError } from '../lib/errors';
import type { Citation } from '@livedoc/types';

export const queryRouter = Router();

// ─── SSE helpers ──────────────────────────────────────────────────────────────

type SSEEvent =
  | { type: 'delta'; content: string }
  | { type: 'citations'; citations: unknown[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

function sendSSE(res: import('express').Response, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ─── POST /api/query ──────────────────────────────────────────────────────────

/**
 * POST /api/query
 *
 * RAG query endpoint — returns a Server-Sent Events (SSE) stream.
 * After streaming completes, saves the Q&A pair to QueryHistory.
 *
 * SSE event sequence:
 *   { type: "delta",     content: "..."  }  — streaming text tokens
 *   { type: "citations", citations: [...] } — sent once after stream finishes
 *   { type: "done"                        } — stream closed
 *   { type: "error",     message: "..."  } — on failure
 */
queryRouter.post('/', requireAuth, async (req, res, next) => {
  // ── 1. Validate input ────────────────────────────────────────────────────────
  const schema = z.object({
    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .max(2000, 'Query too long (max 2000 chars)'),
    workspaceId: z.string().min(1, 'workspaceId is required'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    next(new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input'));
    return;
  }

  const { query, workspaceId } = parsed.data;
  const userId = res.locals.user.id;

  // ── 2. Membership check (tenant isolation) ───────────────────────────────────
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });

  if (!member) {
    next(new ForbiddenError('You are not a member of this workspace'));
    return;
  }

  // ── 3. Open SSE stream ───────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let clientAborted = false;
  req.on('close', () => { clientAborted = true; });

  try {
    // ── 4. Retrieve context via pgvector ─────────────────────────────────────
    const { contextText, citations, isEmpty } = await queryService.retrieve(
      workspaceId,
      query,
    );

    if (isEmpty) {
      const answer = "Your knowledge base doesn't have any indexed content yet. Connect a source and trigger a sync first.";
      sendSSE(res, { type: 'delta', content: answer });
      sendSSE(res, { type: 'citations', citations: [] });
      sendSSE(res, { type: 'done' });
      res.end();
      return;
    }

    // ── 5. Stream Claude response ─────────────────────────────────────────────
    const stream = await queryService.createStream(contextText, query);
    let fullAnswer = '';

    for await (const event of stream) {
      if (clientAborted) break;

      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text
      ) {
        fullAnswer += event.delta.text;
        sendSSE(res, { type: 'delta', content: event.delta.text });
      }
    }

    if (clientAborted) {
      res.end();
      return;
    }

    // ── 6. Send citations then close ──────────────────────────────────────────
    sendSSE(res, { type: 'citations', citations });
    sendSSE(res, { type: 'done' });
    res.end();

    // ── 7. Persist query history (fire-and-forget, non-blocking) ─────────────
    if (fullAnswer) {
      db.queryHistory
        .create({
          data: {
            workspaceId,
            userId,
            question: query,
            answer: fullAnswer,
            sources: citations as object[],
          },
        })
        .catch((err) =>
          console.error('[QueryHistory] failed to persist:', err),
        );
    }
  } catch (err) {
    if (res.headersSent) {
      const message = err instanceof Error ? err.message : 'Query failed';
      sendSSE(res, { type: 'error', message });
      res.end();
    } else {
      next(err);
    }
  }
});

// ─── GET /api/query/history ───────────────────────────────────────────────────

/**
 * GET /api/query/history?workspaceId=<id>&cursor=<id>&take=<n>
 *
 * Returns paginated query history for a workspace, newest first.
 * Auth: session + workspace membership.
 */
queryRouter.get('/history', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      workspaceId: z.string().min(1, 'workspaceId is required'),
      cursor: z.string().optional(),
      take: z.coerce.number().int().min(1).max(50).default(20),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid query');
    }

    const { workspaceId, cursor, take } = parsed.data;

    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: res.locals.user.id } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenError('Not a workspace member');

    const rows = await db.queryHistory.findMany({
      where: { workspaceId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        question: true,
        answer: true,
        sources: true,
        createdAt: true,
        userId: true,
      },
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    res.json({ data: { items, nextCursor }, error: null });
  } catch (err) {
    next(err);
  }
});
