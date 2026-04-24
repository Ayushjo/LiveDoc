import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { uploadService, ACCEPTED_MIMETYPES, ACCEPTED_EXTENSIONS } from '../services/upload.service';
import { BadRequestError, ForbiddenError, ValidationError } from '../lib/errors';
import { db } from '../db';

export const uploadRouter = Router();

// ─── Multer config ────────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
      if (ACCEPTED_EXTENSIONS.some((e) => e === `.${ext}`)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: PDF, DOCX, TXT, MD`));
      }
    }
  },
});

// ─── POST /api/upload ─────────────────────────────────────────────────────────

/**
 * POST /api/upload
 *
 * Multipart form upload. Accepts up to 5 files (PDF, DOCX, TXT, MD) at a time.
 * Body field: workspaceId (string)
 * File field: files[] (multipart)
 *
 * Processes each file: extract → chunk → embed → store.
 * Returns per-file results (documentId, title, chunksCreated, skipped).
 *
 * Auth: session cookie required + workspace membership.
 */
uploadRouter.post(
  '/',
  requireAuth,
  (req, res, next) => {
    // multer error handler needs to stay inside express middleware chain
    multerUpload.array('files', 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError('File exceeds 10 MB limit'));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new BadRequestError('Maximum 5 files per upload'));
        }
        return next(new BadRequestError(err.message));
      }
      if (err) return next(new BadRequestError(err.message));
      next();
    });
  },
  async (req, res, next) => {
    try {
      // ── Validate workspaceId ───────────────────────────────────────────────
      const schema = z.object({
        workspaceId: z.string().min(1, 'workspaceId is required'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid body');
      }
      const { workspaceId } = parsed.data;

      // ── Verify membership ──────────────────────────────────────────────────
      const member = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId, userId: res.locals.user.id },
        },
        select: { id: true },
      });
      if (!member) throw new ForbiddenError('Not a workspace member');

      // ── Validate files ─────────────────────────────────────────────────────
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No files uploaded');
      }

      // ── Process each file ──────────────────────────────────────────────────
      const results = await Promise.allSettled(
        files.map((file) =>
          uploadService.processUpload({
            workspaceId,
            userId: res.locals.user.id,
            filename: file.originalname,
            mimetype: file.mimetype,
            buffer: file.buffer,
          }),
        ),
      );

      const processed = results.map((result, i) => {
        const filename = files[i]!.originalname;
        if (result.status === 'fulfilled') {
          return { filename, success: true, ...result.value };
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          return { filename, success: false, error: msg };
        }
      });

      const allFailed = processed.every((r) => !r.success);
      if (allFailed) {
        const firstError = (processed[0] as { error: string }).error;
        throw new BadRequestError(`All uploads failed: ${firstError}`);
      }

      res.json({ data: { results: processed }, error: null });
    } catch (err) {
      next(err);
    }
  },
);
