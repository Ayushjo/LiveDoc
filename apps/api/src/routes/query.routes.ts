import { Router } from 'express';
import { z } from 'zod';
import { queryService } from '../services/query.service';
import { requireAuth } from '../middleware/auth.middleware';
import { db } from '../db';
import { ForbiddenError, ValidationError } from '../lib/errors';

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

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * POST /api/query
 *
 * RAG query endpoint — returns a Server-Sent Events (SSE) stream.
 *
 * Request body:
 *   { query: string, workspaceId: string }
 *
 * SSE event sequence:
 *   { type: "delta",     content: "..."  }  — one or more streaming text tokens
 *   { type: "citations", citations: [...] } — sent once after stream finishes
 *   { type: "done"                        } — stream closed
 *   { type: "error",     message: "..."  } — on failure (headers may already be sent)
 *
 * Auth: session cookie required. Workspace membership enforced.
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

  // ── 2. Membership check (tenant isolation) ───────────────────────────────────
  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: res.locals.user.id },
    },
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
  // Disable proxy/nginx buffering so tokens reach the client immediately
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let clientAborted = false;
  req.on('close', () => {
    clientAborted = true;
  });

  try {
    // ── 4. Retrieve context via pgvector ────────────────────────────────────────
    const { contextText, citations, isEmpty } = await queryService.retrieve(
      workspaceId,
      query,
    );

    if (isEmpty) {
      // Knowledge base has no embedded content yet
      sendSSE(res, {
        type: 'delta',
        content:
          "Your knowledge base doesn't have any indexed content yet. Connect a source and trigger a sync first.",
      });
      sendSSE(res, { type: 'citations', citations: [] });
      sendSSE(res, { type: 'done' });
      res.end();
      return;
    }

    // ── 5. Stream Claude response ────────────────────────────────────────────────
    const stream = await queryService.createStream(contextText, query);

    for await (const event of stream) {
      if (clientAborted) break;

      // Claude SSE emits 'content_block_delta' events with 'text_delta' deltas
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text
      ) {
        sendSSE(res, { type: 'delta', content: event.delta.text });
      }
    }

    if (clientAborted) {
      res.end();
      return;
    }

    // ── 6. Send citations then close ─────────────────────────────────────────────
    sendSSE(res, { type: 'citations', citations });
    sendSSE(res, { type: 'done' });
    res.end();
  } catch (err) {
    if (res.headersSent) {
      // SSE stream already open — send an error event and close gracefully
      const message = err instanceof Error ? err.message : 'Query failed';
      sendSSE(res, { type: 'error', message });
      res.end();
    } else {
      // Headers not sent yet — let Express error handler respond normally
      next(err);
    }
  }
});
