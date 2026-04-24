import { createHash } from 'crypto';
import { db } from '../db';
import { chunkerService, type RawChunk } from './chunker.service';
import { embedService } from './embed.service';
import type { ContentBlock } from './notion.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB hard limit

export const ACCEPTED_MIMETYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

// ─── Text extractors ──────────────────────────────────────────────────────────

/**
 * Extracts plain text from a PDF buffer using pdf-parse.
 * Returns empty string if extraction fails (e.g. image-only PDFs).
 */
async function extractPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text ?? '';
}

/**
 * Extracts plain text from a DOCX buffer using mammoth.
 * Returns the raw text value (no HTML).
 */
async function extractDocx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as {
    extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? '';
}

/**
 * Converts raw text into ContentBlock[] for the chunker.
 *
 * Heuristic:
 * - Lines starting with "# " → h1
 * - Lines starting with "## " → h2
 * - Lines starting with "### " → h3
 * - Blank lines separate paragraphs
 * - Everything else → text paragraph
 *
 * This works for Markdown and for well-structured plain-text files.
 * PDFs/DOCXs typically have no markdown headings, so everything becomes `text`.
 */
function textToBlocks(raw: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = raw.split('\n');

  let paraBuffer: string[] = [];

  const flushPara = () => {
    const text = paraBuffer.join(' ').trim();
    if (text) blocks.push({ type: 'text', text });
    paraBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushPara();
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
    } else if (trimmed.startsWith('## ')) {
      flushPara();
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith('# ')) {
      flushPara();
      blocks.push({ type: 'h1', text: trimmed.slice(2).trim() });
    } else {
      paraBuffer.push(trimmed);
    }
  }

  flushPara();
  return blocks;
}

// ─── Inline embed helper (mirrors sync.service.ts) ───────────────────────────

async function embedInline(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;
  try {
    await embedService.embedAll(chunkIds);
    console.log(`[UploadService] embedded ${chunkIds.length} chunk(s)`);
  } catch (err) {
    console.error('[UploadService] inline embed failed (non-fatal):', err);
  }
}

// ─── Public service ───────────────────────────────────────────────────────────

export interface UploadResult {
  documentId: string;
  title: string;
  chunksCreated: number;
  skipped: boolean;
}

export const uploadService = {
  /**
   * Processes a single uploaded file:
   * 1. Extracts text by MIME type
   * 2. Converts text → ContentBlock[] → RawChunk[]
   * 3. Upserts the workspace's UPLOAD source (one per workspace)
   * 4. Dedup by content SHA-256 — skips unchanged files
   * 5. Creates Document + Chunks, then embeds inline
   */
  async processUpload(opts: {
    workspaceId: string;
    userId: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<UploadResult> {
    const { workspaceId, filename, mimetype, buffer } = opts;

    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error(`File exceeds maximum size of ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    }

    // ── 1. Extract text ──────────────────────────────────────────────────────
    let rawText = '';

    if (mimetype === 'application/pdf') {
      rawText = await extractPdf(buffer);
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      rawText = await extractDocx(buffer);
    } else {
      // text/plain, text/markdown
      rawText = buffer.toString('utf-8');
    }

    rawText = rawText.trim();
    if (!rawText) {
      throw new Error('Could not extract any text from this file. It may be image-based or empty.');
    }

    // ── 2. Hash for dedup ────────────────────────────────────────────────────
    const contentHash = createHash('sha256').update(rawText).digest('hex');
    // externalId = filename slug + content hash prefix for readability + uniqueness
    const externalId = `${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}_${contentHash.slice(0, 12)}`;

    // ── 3. Find or create the workspace UPLOAD source (one per workspace) ────
    let uploadSource = await db.source.findFirst({
      where: { workspaceId, type: 'UPLOAD' },
      select: { id: true },
    });

    if (!uploadSource) {
      uploadSource = await db.source.create({
        data: {
          workspaceId,
          type: 'UPLOAD',
          name: 'Uploaded Files',
          encryptedAccessToken: '',
          metadata: {},
          syncStatus: 'IDLE',
          syncInterval: 'MANUAL',
        },
      });
    }

    // ── 4. Dedup: check if this exact content already exists ─────────────────
    const existingDoc = await db.document.findUnique({
      where: { sourceId_externalId: { sourceId: uploadSource.id, externalId } },
      select: { id: true, contentHash: true },
    });

    if (existingDoc && existingDoc.contentHash === contentHash) {
      return {
        documentId: existingDoc.id,
        title: filename,
        chunksCreated: 0,
        skipped: true,
      };
    }

    // ── 5. Chunk ─────────────────────────────────────────────────────────────
    const blocks = textToBlocks(rawText);
    const rawChunks: RawChunk[] = chunkerService.chunk(blocks);

    if (rawChunks.length === 0) {
      throw new Error('File produced no indexable content after chunking.');
    }

    // ── 6. Upsert Document (delete old chunks if content changed) ────────────
    const title = filename.replace(/\.[^.]+$/, ''); // strip extension
    const now = new Date();

    let documentId: string;

    if (existingDoc) {
      // Content changed — delete old chunks and update doc
      await db.chunk.deleteMany({ where: { documentId: existingDoc.id } });
      await db.document.update({
        where: { id: existingDoc.id },
        data: { title, contentHash, lastEditedAt: now },
      });
      documentId = existingDoc.id;
    } else {
      const doc = await db.document.create({
        data: {
          sourceId: uploadSource.id,
          workspaceId,
          externalId,
          title,
          url: '',        // Local files have no URL
          contentHash,
          lastEditedAt: now,
          metadata: { filename, mimetype, uploadedAt: now.toISOString() },
        },
      });
      documentId = doc.id;
    }

    // ── 7. Insert chunks ─────────────────────────────────────────────────────
    const createdChunks = await db.$transaction(
      rawChunks.map((rc, i) =>
        db.chunk.create({
          data: {
            documentId,
            workspaceId,
            content: rc.content,
            chunkIndex: i,
            tokenCount: rc.tokenCount,
            metadata: rc.metadata,
          },
        }),
      ),
    );

    // ── 8. Embed inline ──────────────────────────────────────────────────────
    const chunkIds = createdChunks.map((c) => c.id);
    await embedInline(chunkIds);

    // ── 9. Bump source lastSyncedAt ──────────────────────────────────────────
    await db.source.update({
      where: { id: uploadSource.id },
      data: { lastSyncedAt: now },
    });

    return {
      documentId,
      title,
      chunksCreated: createdChunks.length,
      skipped: false,
    };
  },
};
