import { db } from '../db';
import { notionService, type NotionPageSummary } from './notion.service';
import { githubService } from './github.service';
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

    // Create new chunks, then embed inline immediately
    const created = await db.$transaction(
      rawChunks.map((rc, idx) =>
        db.chunk.create({
          data: {
            documentId: existingDoc.id,
            workspaceId,
            content: rc.content,
            chunkIndex: idx,
            tokenCount: rc.tokenCount,
            metadata: rc.metadata as object,
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

  await embedInline(created.map((c) => c.id));

  await db.syncJob.update({
    where: { id: syncJobId },
    data: { chunksCreated: { increment: created.length } },
  });

  return { skipped: false, chunksCreated: created.length };
}

// ─── Notion sync helper ───────────────────────────────────────────────────────

/**
 * Full Notion sync: fetches all pages accessible to the integration and
 * runs two-level delta detection (lastEditedAt → contentHash) for each.
 */
async function runNotionSync(
  sourceId: string,
  workspaceId: string,
  syncJobId: string,
): Promise<void> {
  const accessToken = await sourceService.getDecryptedAccessToken(sourceId);
  const pages = await notionService.listAllPages(accessToken);

  console.log(`[SyncService:Notion] found ${pages.length} pages to sync`);

  let documentsProcessed = 0;

  for (const page of pages) {
    try {
      await processPage(accessToken, sourceId, workspaceId, page, syncJobId);
    } catch (pageErr) {
      console.error(
        `[SyncService:Notion] failed to process page ${page.id} (${page.title}):`,
        pageErr,
      );
    }

    documentsProcessed++;
    await db.syncJob.update({
      where: { id: syncJobId },
      data: { documentsProcessed },
    });
  }
}

// ─── GitHub sync helpers ──────────────────────────────────────────────────────

/**
 * Processes a single GitHub file (Markdown/MDX) against the local database.
 *
 * Delta strategy:
 *  1. Compare git blob SHA (stored as contentHash) — if unchanged, skip.
 *  2. If changed, fetch + parse + re-chunk + re-embed.
 */
async function processGitHubFile(
  accessToken: string,
  sourceId: string,
  workspaceId: string,
  summary: import('./github.service').GitHubFileSummary,
  repoUpdatedAt: Date,
  syncJobId: string,
): Promise<PageSyncResult> {
  const externalId = summary.id;

  const existingDoc = await db.document.findUnique({
    where: { sourceId_externalId: { sourceId, externalId } },
    select: { id: true, contentHash: true },
  });

  // The git blob SHA acts as contentHash — only fetch if SHA changed
  if (existingDoc && existingDoc.contentHash === summary.sha) {
    return { skipped: true, chunksCreated: 0 };
  }

  // Fetch + parse the file
  const fileDoc = await githubService.getFileDocument(accessToken, summary);

  // Check full content hash in case blob SHA collided (extremely rare but safe)
  if (existingDoc && existingDoc.contentHash === fileDoc.contentHash) {
    await db.document.update({
      where: { id: existingDoc.id },
      data: { lastEditedAt: repoUpdatedAt },
    });
    return { skipped: true, chunksCreated: 0 };
  }

  const rawChunks = chunkerService.chunk(fileDoc.blocks);

  if (existingDoc) {
    await db.chunk.deleteMany({ where: { documentId: existingDoc.id } });
    await db.document.update({
      where: { id: existingDoc.id },
      data: {
        title: fileDoc.title,
        url: fileDoc.url,
        contentHash: fileDoc.contentHash,
        lastEditedAt: repoUpdatedAt,
      },
    });

    if (rawChunks.length === 0) return { skipped: false, chunksCreated: 0 };

    const created = await db.$transaction(
      rawChunks.map((rc, idx) =>
        db.chunk.create({
          data: {
            documentId: existingDoc.id,
            workspaceId,
            content: rc.content,
            chunkIndex: idx,
            tokenCount: rc.tokenCount,
            metadata: rc.metadata as object,
          },
          select: { id: true },
        }),
      ),
    );
    await embedInline(created.map((c) => c.id));
    await db.syncJob.update({
      where: { id: syncJobId },
      data: { chunksCreated: { increment: created.length } },
    });
    return { skipped: false, chunksCreated: created.length };
  }

  const newDoc = await db.document.create({
    data: {
      sourceId,
      workspaceId,
      externalId,
      title: fileDoc.title,
      url: fileDoc.url,
      contentHash: fileDoc.contentHash,
      lastEditedAt: repoUpdatedAt,
      metadata: { owner: summary.owner, repo: summary.repo, path: summary.path, type: 'file' },
    },
    select: { id: true },
  });

  if (rawChunks.length === 0) return { skipped: false, chunksCreated: 0 };

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
  await embedInline(created.map((c) => c.id));
  await db.syncJob.update({
    where: { id: syncJobId },
    data: { chunksCreated: { increment: created.length } },
  });
  return { skipped: false, chunksCreated: created.length };
}

/**
 * Processes a single GitHub issue (including comments) against the local DB.
 */
async function processGitHubIssue(
  accessToken: string,
  sourceId: string,
  workspaceId: string,
  summary: import('./github.service').GitHubIssueSummary,
  syncJobId: string,
): Promise<PageSyncResult> {
  const externalId = summary.id;

  const existingDoc = await db.document.findUnique({
    where: { sourceId_externalId: { sourceId, externalId } },
    select: { id: true, lastEditedAt: true, contentHash: true },
  });

  // Level 1: updatedAt timestamp
  if (existingDoc && existingDoc.lastEditedAt.getTime() === summary.updatedAt.getTime()) {
    return { skipped: true, chunksCreated: 0 };
  }

  const issueDoc = await githubService.getIssueDocument(accessToken, summary);

  // Level 2: full content hash
  if (existingDoc && existingDoc.contentHash === issueDoc.contentHash) {
    await db.document.update({
      where: { id: existingDoc.id },
      data: { lastEditedAt: issueDoc.lastEditedAt },
    });
    return { skipped: true, chunksCreated: 0 };
  }

  const rawChunks = chunkerService.chunk(issueDoc.blocks);

  if (existingDoc) {
    await db.chunk.deleteMany({ where: { documentId: existingDoc.id } });
    await db.document.update({
      where: { id: existingDoc.id },
      data: {
        title: issueDoc.title,
        url: issueDoc.url,
        contentHash: issueDoc.contentHash,
        lastEditedAt: issueDoc.lastEditedAt,
      },
    });

    if (rawChunks.length === 0) return { skipped: false, chunksCreated: 0 };

    const created = await db.$transaction(
      rawChunks.map((rc, idx) =>
        db.chunk.create({
          data: {
            documentId: existingDoc.id,
            workspaceId,
            content: rc.content,
            chunkIndex: idx,
            tokenCount: rc.tokenCount,
            metadata: rc.metadata as object,
          },
          select: { id: true },
        }),
      ),
    );
    await embedInline(created.map((c) => c.id));
    await db.syncJob.update({
      where: { id: syncJobId },
      data: { chunksCreated: { increment: created.length } },
    });
    return { skipped: false, chunksCreated: created.length };
  }

  const newDoc = await db.document.create({
    data: {
      sourceId,
      workspaceId,
      externalId,
      title: issueDoc.title,
      url: issueDoc.url,
      contentHash: issueDoc.contentHash,
      lastEditedAt: issueDoc.lastEditedAt,
      metadata: { owner: summary.owner, repo: summary.repo, issueNumber: summary.number, type: 'issue' },
    },
    select: { id: true },
  });

  if (rawChunks.length === 0) return { skipped: false, chunksCreated: 0 };

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
  await embedInline(created.map((c) => c.id));
  await db.syncJob.update({
    where: { id: syncJobId },
    data: { chunksCreated: { increment: created.length } },
  });
  return { skipped: false, chunksCreated: created.length };
}

/**
 * Full GitHub sync: iterates all repos → markdown files + open issues.
 */
async function runGitHubSync(
  sourceId: string,
  workspaceId: string,
  syncJobId: string,
): Promise<void> {
  const accessToken = await sourceService.getDecryptedAccessToken(sourceId);
  const repos = await githubService.listRepositories(accessToken);

  console.log(`[SyncService:GitHub] found ${repos.length} repos to sync`);

  let documentsProcessed = 0;

  for (const repo of repos) {
    const owner = repo.owner.login;
    const repoName = repo.name;
    const repoUpdatedAt = new Date(repo.pushed_at || repo.updated_at);

    try {
      // Sync markdown files
      const files = await githubService.listMarkdownFiles(
        accessToken,
        owner,
        repoName,
        repo.default_branch,
      );

      for (const file of files) {
        try {
          await processGitHubFile(
            accessToken,
            sourceId,
            workspaceId,
            file,
            repoUpdatedAt,
            syncJobId,
          );
          documentsProcessed++;
          await db.syncJob.update({
            where: { id: syncJobId },
            data: { documentsProcessed },
          });
        } catch (fileErr) {
          console.error(`[SyncService:GitHub] failed to process file ${file.path} in ${owner}/${repoName}:`, fileErr);
        }
      }

      // Sync open issues
      const issues = await githubService.listOpenIssues(accessToken, owner, repoName);

      for (const issue of issues) {
        try {
          await processGitHubIssue(accessToken, sourceId, workspaceId, issue, syncJobId);
          documentsProcessed++;
          await db.syncJob.update({
            where: { id: syncJobId },
            data: { documentsProcessed },
          });
        } catch (issueErr) {
          console.error(`[SyncService:GitHub] failed to process issue #${issue.number} in ${owner}/${repoName}:`, issueErr);
        }
      }
    } catch (repoErr) {
      console.error(`[SyncService:GitHub] failed to process repo ${owner}/${repoName}:`, repoErr);
    }
  }
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

    // Create the SyncJob record and respond immediately (202 Accepted)
    const syncJob = await db.syncJob.create({
      data: { sourceId, triggeredBy, status: 'PENDING' },
    });

    // Run the full sync pipeline in-process (background, non-blocking).
    // setImmediate defers until after the current HTTP response is flushed,
    // so the route handler returns the SyncJob immediately while the work
    // runs in the background within the same Node.js process.
    //
    // For production at scale, swap this back to a BullMQ queue + worker.
    setImmediate(() => {
      syncService
        .runSync(source.id, source.workspaceId, syncJob.id)
        .catch((err) =>
          console.error(`[SyncService] background sync failed for ${sourceId}:`, err),
        );
    });

    return syncJob;
  },

  /**
   * The core sync logic — dispatches to the correct provider based on source type.
   * Runs the full fetch → delta-detect → chunk → embed pipeline.
   */
  async runSync(
    sourceId: string,
    workspaceId: string,
    syncJobId: string,
  ): Promise<void> {
    // Fetch source type for dispatch
    const sourceRecord = await db.source.findUnique({
      where: { id: sourceId },
      select: { type: true },
    });

    if (!sourceRecord) {
      throw new Error(`Source ${sourceId} not found`);
    }

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
      // ── Dispatch to provider-specific sync ───────────────────────────────
      if (sourceRecord.type === 'NOTION') {
        await runNotionSync(sourceId, workspaceId, syncJobId);
      } else if (sourceRecord.type === 'GITHUB') {
        await runGitHubSync(sourceId, workspaceId, syncJobId);
      } else {
        throw new Error(`Unsupported source type: ${sourceRecord.type}`);
      }

      // ── Backfill any chunks still missing embeddings ──────────────────────
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
      const finalJob = await db.syncJob.findUnique({
        where: { id: syncJobId },
        select: { documentsProcessed: true },
      });

      await Promise.all([
        db.syncJob.update({
          where: { id: syncJobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        }),
        db.source.update({
          where: { id: sourceId },
          data: { syncStatus: 'IDLE', lastSyncedAt: new Date() },
        }),
      ]);

      console.log(`[SyncService] sync completed for ${sourceId} — ${finalJob?.documentsProcessed ?? 0} documents processed`);
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

      throw err;
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
