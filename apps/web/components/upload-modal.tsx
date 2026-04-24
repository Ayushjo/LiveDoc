'use client';

import { useCallback, useState, useRef, useId } from 'react';
import { X, Upload, FileText, FileType, CheckCircle2, AlertCircle, Loader2, CloudUpload } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error' | 'skipped';
  chunksCreated?: number;
  error?: string;
}

interface UploadModalProps {
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);
const ACCEPTED_EXTS = ['.pdf', '.docx', '.txt', '.md'];
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ mimetype }: { mimetype: string }) {
  if (mimetype === 'application/pdf') {
    return <FileType className="w-4 h-4 text-red-500" />;
  }
  return <FileText className="w-4 h-4 text-blue-500" />;
}

function isAccepted(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  return ACCEPTED_EXTS.includes(ext);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UploadModal({ workspaceId, onClose, onSuccess }: UploadModalProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputId = useId();
  const dropRef = useRef<HTMLDivElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setGlobalError(null);
    const arr = Array.from(incoming);
    const rejected: string[] = [];

    const valid = arr.filter((f) => {
      if (!isAccepted(f)) { rejected.push(f.name); return false; }
      if (f.size > MAX_BYTES) { rejected.push(`${f.name} (too large)`); return false; }
      return true;
    });

    setFiles((prev) => {
      const existing = new Set(prev.map((e) => e.file.name + e.file.size));
      const deduped = valid.filter((f) => !existing.has(f.name + f.size));
      const combined = [...prev, ...deduped.map((f) => ({
        id: `${f.name}-${f.size}-${Math.random()}`,
        file: f,
        status: 'pending' as const,
      }))];
      if (combined.length > MAX_FILES) {
        setGlobalError(`Maximum ${MAX_FILES} files per upload. Extra files were dropped.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });

    if (rejected.length > 0) {
      setGlobalError(`Skipped unsupported/oversized files: ${rejected.join(', ')}`);
    }
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // ── Drag and drop ──────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    setIsUploading(true);
    setGlobalError(null);

    // Mark all pending as uploading
    setFiles((prev) =>
      prev.map((f) => (f.status === 'pending' ? { ...f, status: 'uploading' } : f)),
    );

    try {
      const formData = new FormData();
      formData.append('workspaceId', workspaceId);
      pending.forEach((entry) => formData.append('files', entry.file));

      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const body = await res.json() as {
        data?: {
          results: Array<{
            filename: string;
            success: boolean;
            chunksCreated?: number;
            skipped?: boolean;
            error?: string;
          }>;
        };
        error?: { message: string };
      };

      if (!res.ok || body.error) {
        throw new Error(body.error?.message ?? `Upload failed (${res.status})`);
      }

      const results = body.data?.results ?? [];

      setFiles((prev) =>
        prev.map((entry) => {
          const result = results.find((r) => r.filename === entry.file.name);
          if (!result) return entry;
          if (result.success) {
            return {
              ...entry,
              status: result.skipped ? 'skipped' : 'done',
              chunksCreated: result.chunksCreated,
            };
          }
          return { ...entry, status: 'error', error: result.error };
        }),
      );

      // If at least one succeeded, notify parent
      const anySuccess = results.some((r) => r.success);
      if (anySuccess) onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setGlobalError(msg);
      setFiles((prev) =>
        prev.map((f) => (f.status === 'uploading' ? { ...f, status: 'error', error: msg } : f)),
      );
    } finally {
      setIsUploading(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const allDone = files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'skipped');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-2xl shadow-[0_20px_60px_0_rgb(0_0_0_/_0.25)] flex flex-col max-h-[90vh] animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Upload Documents</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              PDF, DOCX, TXT, MD · up to {MAX_FILES} files · max 10 MB each
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drop zone */}
        <div className="px-6 shrink-0">
          <div
            ref={dropRef}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-150 cursor-pointer ${
              isDragging
                ? 'border-foreground/40 bg-muted/50 scale-[0.99]'
                : 'border-border hover:border-foreground/20 hover:bg-muted/20'
            }`}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            <input
              id={inputId}
              type="file"
              multiple
              accept={ACCEPTED_EXTS.join(',')}
              className="sr-only"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
            />
            <div className="flex flex-col items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isDragging ? 'bg-foreground/10' : 'bg-muted'}`}>
                <CloudUpload className={`w-6 h-6 transition-colors ${isDragging ? 'text-foreground' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {isDragging ? 'Drop to add files' : 'Drop files here or click to browse'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  PDF, DOCX, TXT, Markdown
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="flex-1 overflow-y-auto px-6 mt-4 space-y-2 min-h-0">
            {files.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20"
              >
                <FileIcon mimetype={entry.file.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{entry.file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(entry.file.size)}
                    {entry.status === 'done' && entry.chunksCreated !== undefined && (
                      <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                        · {entry.chunksCreated} chunks indexed
                      </span>
                    )}
                    {entry.status === 'skipped' && (
                      <span className="ml-1.5 text-muted-foreground">· already indexed</span>
                    )}
                    {entry.status === 'error' && entry.error && (
                      <span className="ml-1.5 text-destructive">· {entry.error}</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {entry.status === 'uploading' && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                  {entry.status === 'done' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                  {entry.status === 'skipped' && (
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                  )}
                  {entry.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                  {(entry.status === 'pending') && (
                    <button
                      onClick={() => removeFile(entry.id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {globalError && (
          <div className="mx-6 mt-3 flex items-start gap-2 p-3 rounded-lg bg-destructive/8 border border-destructive/20 text-xs text-destructive shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            {globalError}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-6 pt-4 border-t border-border mt-4 shrink-0">
          <p className="text-xs text-muted-foreground">
            {files.length === 0
              ? 'No files selected'
              : `${files.length} file${files.length > 1 ? 's' : ''} selected`}
          </p>
          <div className="flex items-center gap-2">
            {allDone ? (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold bg-foreground text-primary-foreground hover:bg-foreground/90 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 h-9 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={pendingCount === 0 || isUploading}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold bg-foreground text-primary-foreground hover:bg-foreground/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload {pendingCount > 0 ? `${pendingCount} file${pendingCount > 1 ? 's' : ''}` : ''}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
