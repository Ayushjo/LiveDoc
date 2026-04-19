import { db } from '../db';
import { notionService, type NotionPageSummary } from './notion.service';
import { sourceService } from './source.service';
import { chunkerService } from './chunker.service';
import { embedService } from './embed.service';
import { NotFoundError, ForbiddenError } from '../lib/errors';
import type { TriggerType } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageSyncResult {
  skipped: boolean;
  chunksCreated: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Embeds newly created chunks inline (no separate worker needed).
 *
 * Runs embedService.embedAll() directly in the sync worker process so that
 * vectors are written to pgvector before the sync job completes.
 * Errors are caught and logged — a failed embed must not abort the whole sync.
 */
async function embedInline(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;
  try {
    await embedService.embedAll(chunkIds);
    console.log(`[SyncService] embedded ${chunkIds.length} chunk(s) inline`);
  } catch (err) {
    // Non-fatal — chunks still exist in DB; user can re-sync to retry embedding
    console.error('[SyncService] inline embed failed (non-fatal):', err);
  }
}

/**
 * Processes a single Notion page against the local database.
 *
 * Delta strategy (two-level):
 *  1. Compare lastEditedAt — if unchanged, skip without fetching content (fast).
 *  2. If changed, fetch full content and compare contentHash (SHA-256).
 *     — Catches edge cases where Notion updates metadata without changing content.
 *     — If hash matches, update lastEditedAt only (no re-embed).
 *     — If hash differs, delete old chunks, re-chunk, re-embed.
 */
async function processPage(
  accessToken: string,
  sourceId: string,
  workspaceId: string,
  pageSummary: NotionPageSummary,
  syncJobId: string,
): Promise<PageSyncResult> {
  const existingDoc = await db.document.findUnique({
    where: { sourceId_externalId: { sourceId, externalId: pageSummary.id } },
    select: {
      id: true,
      contentHash: true,
      lastEditedAt: true,
    },
  });

  // ── Level 1 delta: lastEditedAt ───────────────────────────────────────────
  if (
    existingDoc &&
    existingDoc.lastEditedAt.getTime() === pageSummary.lastEditedAt.getTime()
  ) {
    return { skipped: true, chunksCreated: 0 };
  }

  // ── Fetch full content ────────────────────────────────────────────────────
  const pageContent = await notionService.getPageContent(accessToken, pageSummary.id);

  // ── Level 2 delta: contentHash ────────────────────────────────────────────
  if (existingDoc && existingDoc.contentHash === pageContent.contentHash) {
    // Metadata changed (e.g. page moved) but content identical — no re-embed
    await db.document.update({
      where: { id: existingDoc.id },
      data: { lastEditedAt: pageContent.lastEditedAt, title: pageContent.title },
    });
    return { skipped: true, chunksCreated: 0 };
  }

  // ── Content changed — chunk and re-embed ──────────────────────────────────
  const rawChunks = chunkerService.chunk(pageContent.blocks);

  if (existingDoc) {
    // Delete old chunks first — vectors would be stale after content change
    await db.chunk.deleteMany({ where: { documentId: existingDoc.id } });

    // Update document metadata + contentHash
    await db.document.update({
      where: { id: existingDoc.id },
      data: {
        title: pageContent.title,
        url: pageContent.url,
        contentHash: pageContent.contentHash,
        lastEditedAt: pageContent.lastEditedAt,
      },
    });

    if (rawChunks.length === 0) {
      return { skipped: false, chunksCreated: 0 };
    }

    // Create new chunks (without embeddings — embed worker fills those in)
    const created = await db.$transaction(
      rawChunks.map((rc, idx) =>
        db.chunk.create({
          data: {
            documentId: existingDoc.id,
            workspaceId,
            content: rc.content,
            chunkIndex: idx,
            tokenCount: rc.tokenCount,
            metadata: rc.metadata,
          },
          select: { id: true },
        }),
      ),
    );

    await embedInline(created.map((c) => c.id));

    // Increment chunksCreated on the SyncJob
    await db.syncJob.update({
      where: { id: syncJobId },
      data: { chunksCreated: { increment: created.length } },
    });

    return { skipped: false, chunksCreated: created.length };
  }

  // ── New document ──────────────────────────────────────────────────────────
  const newDoc = await db.document.create({
    data: {
      sourceId,
      workspaceId,
      externalId: pageSummary.id,
      title: pageContent.title,
      url: pageContent.url,
      contentHash: pageContent.contentHash,
      lastEditedAt: pageContent.lastEditedAt,
      metadata: {},
    },
    select: { id: true },
  });

  if (rawChunks.length === 0) {
    return { skipped: false, chunksCreated: 0 };
  }

  const created = await db.$transaction(
    rawChunks.map((rc, idx) =>
      db.chunk.create({
        data: {
          documentId: newDoc.id,
          workspaceId,
          content: rc.content,
          chunkIndex: idx,
          tokenCount: rc.tokenCount,
          metadata: rc.metadata,
        },
        select: { id: true },
      }),
    ),
  );

  await enqueueEmbedBatches(created.map((c) => c.id), workspaceId);

  await db.syncJob.update({
    where: { id: syncJobId },
    data: { chunksCreated: { increment: created.length } },
  });

  return { skipped: false, chunksCreated: created.length };
}

// ─── Public service ───────────────────────────────────────────────────────────

export const syncService = {
  /**
   * Creates a SyncJob record and enqueues a sync job into BullMQ.
   * The actual sync runs in sync.worker.ts — this returns immediately.
   *
   * Requires ADMIN or OWNER role.
   */
  async triggerSync(
    sourceId: string,
    userId: string,
    triggeredBy: TriggerType,
  ) {
    const source = await db.source.findUnique({
      where: { id: sourceId },
      select: { id: true, workspaceId: true, syncStatus: true },
    });

    if (!source) throw new NotFoundError('Source');

    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: source.workspaceId, userId },
      },
      select: { role: true },
    });

    if (!member) throw new NotFoundError('Source');
    if (member.role === 'MEMBER') {
      throw new ForbiddenError('Only ADMINs and OWNERs can trigger a sync');
    }

    if (source.syncStatus === 'SYNCING') {
      throw new ForbiddenError(
        'A sync is already in progress for this source. Wait for it to complete.',
      );
    }

    // Create the SyncJob record first so we have its ID for the worker
    const syncJob = await db.syncJob.create({
      data: {
        sourceId,
        triggeredBy,
        status: 'PENDING',
      },
    });

    // Import here to avoid circular dependency at module load time
    const { syncQueue } = await import('../queues');

    await syncQueue.add(
      'sync-source',
      {
        sourceId,
        workspaceId: source.workspaceId,
        syncJobId: syncJob.id,
        triggeredBy,
      },
      { jobId: `sync-${sourceId}-${syncJob.id}` },
    );

    return syncJob;
  },

  /**
   * The core sync logic — called by sync.worker.ts.
   * Runs the full fetch → delta-detect → chunk → enqueue-embed pipeline.
   */
  async runSync(
    sourceId: string,
    workspaceId: string,
    syncJobId: string,
  ): Promise<void> {
    // Mark job + source as running
    await Promise.all([
      db.syncJob.update({
        where: { id: syncJobId },
        data: { status: 'RUNNING', startedAt: new Date() },
      }),
      db.source.update({
        where: { id: sourceId },
        data: { syncStatus: 'SYNCING' },
      }),
    ]);

    try {
      const accessToken = await sourceService.getDecryptedAccessToken(sourceId);
      const pages = await notionService.listAllPages(accessToken);

      let documentsProcessed = 0;

      for (const page of pages) {
        try {
          await processPage(accessToken, sourceId, workspaceId, page, syncJobId);
        } catch (pageErr) {
          // One failed page must not abort the whole sync — log and continue
          console.error(
            `[SyncService] failed to process page ${page.id} (${page.title}):`,
            pageErr,
          );
        }

        documentsProcessed++;

        // Persist progress after each page so the UI stays responsive
        await db.syncJob.update({
          where: { id: syncJobId },
          data: { documentsProcessed },
        });
      }

      // ── Backfill any chunks that are still missing embeddings ─────────────
      // This covers chunks created by a previous sync that ran before the
      // embed worker was started — re-syncing will embed them now.
      const unembedded = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Chunk"
        WHERE  "workspaceId" = ${workspaceId}
          AND  embedding IS NULL
        LIMIT  500
      `;
      if (unembedded.length > 0) {
        console.log(`[SyncService] backfilling ${unembedded.length} un-embedded chunk(s)`);
        await embedInline(unembedded.map((r) => r.id));
      }

      // ── Mark completed ────────────────────────────────────────────────────
      await Promise.all([
        db.syncJob.update({
          where: { id: syncJobId },
          data: { status: 'COMPLETED', completedAt: new Date(), documentsProcessed },
        }),
        db.source.update({
          where: { id: sourceId },
          data: { syncStatus: 'IDLE', lastSyncedAt: new Date() },
        }),
      ]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error during sync';

      await Promise.all([
        db.syncJob.update({
          where: { id: syncJobId },
          data: { status: 'FAILED', completedAt: new Date(), errorMessage },
        }),
        db.source.update({
          where: { id: sourceId },
          data: { syncStatus: 'ERROR' },
        }),
      ]);

      throw err; // Re-throw so BullMQ marks the job as failed and applies retry backoff
    }
  },

  /**
   * Returns a SyncJob by ID, verifying the requesting user is a workspace member.
   */
  async getSyncJob(syncJobId: string, userId: string) {
    const syncJob = await db.syncJob.findUnique({
      where: { id: syncJobId },
      include: { source: { select: { workspaceId: true } } },
    });

    if (!syncJob) throw new NotFoundError('SyncJob');

    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: syncJob.source.workspaceId,
          userId,
        },
      },
      select: { id: true },
    });

    if (!member) throw new NotFoundError('SyncJob');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { source: _source, ...job } = syncJob;
    return job;
  },

  /**
   * Lists sync jobs for a source, newest first.
   */
  async listSyncJobs(sourceId: string, userId: string) {
    const source = await db.source.findUnique({
      where: { id: sourceId },
      select: { workspaceId: true },
    });

    if (!source) throw new NotFoundError('Source');

    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: source.workspaceId, userId },
      },
      select: { id: true },
    });

    if (!member) throw new NotFoundError('Source');

    return db.syncJob.findMany({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  },
};
