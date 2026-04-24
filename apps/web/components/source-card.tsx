'use client';

import { RefreshCw, AlertCircle, CheckCircle2, Trash2, FileText, Clock, ChevronRight, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import type { Source, SyncInterval } from '@livedoc/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INTERVAL_LABELS: Record<SyncInterval, string> = {
  MANUAL:   'Manual',
  HOURLY:   'Hourly',
  EVERY_6H: 'Every 6h',
  DAILY:    'Daily',
  WEEKLY:   'Weekly',
};

// ─── Brand SVGs ───────────────────────────────────────────────────────────────

function NotionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Source['syncStatus'] }) {
  if (status === 'SYNCING') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <RefreshCw className="w-3 h-3 animate-spin" />
        Syncing
      </span>
    );
  }
  if (status === 'ERROR') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
        <AlertCircle className="w-3 h-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" />
      {status === 'IDLE' ? 'Ready' : 'Synced'}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SourceCardProps {
  source: Source & { _count?: { documents: number } };
  onSync?: (sourceId: string) => void;
  onDelete?: (sourceId: string) => void;
  onScheduleChange?: (sourceId: string, interval: SyncInterval) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SourceCard({ source, onSync, onDelete, onScheduleChange }: SourceCardProps) {
  const isSyncing = source.syncStatus === 'SYNCING';
  const hasError  = source.syncStatus === 'ERROR';
  const docCount  = (source as SourceCardProps['source'])._count?.documents;

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden flex flex-col hover:shadow-card-hover hover:border-border/80 transition-all duration-200">

      {/* Top accent strip */}
      <div className={`h-0.5 ${
        source.type === 'GITHUB'   ? 'bg-foreground/80' :
        source.type === 'UPLOAD'   ? 'bg-blue-500/60'   :
        'bg-foreground/40'
      }`} />

      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
            {source.type === 'GITHUB'
              ? <GitHubIcon className="w-[18px] h-[18px] text-foreground" />
              : source.type === 'UPLOAD'
              ? <FolderOpen className="w-[18px] h-[18px] text-blue-500" />
              : <NotionIcon className="w-[18px] h-[18px] text-foreground" />
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm leading-none truncate">{source.name}</h3>
              {hasError && <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-[11px] text-muted-foreground capitalize">
                {source.type.toLowerCase().replace('_', ' ')}
              </p>
              {docCount !== undefined && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <span>·</span>
                  <FileText className="w-3 h-3" />
                  {docCount} {docCount === 1 ? 'doc' : 'docs'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          <Link
            href={`/sources/${source.id}`}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="View details"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          {onDelete && (
            <button
              onClick={() => onDelete(source.id)}
              title="Disconnect source"
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Schedule row — hidden for UPLOAD sources (no server-side sync) */}
      {onScheduleChange && source.type !== 'UPLOAD' && (
        <div className="flex items-center gap-2 px-5 py-2 bg-muted/20 border-t border-border">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground">Auto-sync:</span>
          <select
            value={source.syncInterval}
            onChange={(e) => onScheduleChange(source.id, e.target.value as SyncInterval)}
            disabled={isSyncing}
            className="text-[11px] font-semibold bg-transparent border-none outline-none cursor-pointer text-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            {(Object.keys(INTERVAL_LABELS) as SyncInterval[]).map((key) => (
              <option key={key} value={key}>{INTERVAL_LABELS[key]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3.5 border-t border-border mt-auto">
        <div>
          <StatusBadge status={source.syncStatus} />
          <p className="text-[10px] text-muted-foreground mt-1 pl-0.5">
            {source.lastSyncedAt
              ? new Date(source.lastSyncedAt).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })
              : 'Never synced'}
          </p>
        </div>

        {onSync && (
          <button
            onClick={() => onSync(source.id)}
            disabled={isSyncing}
            title="Trigger manual sync"
            className="flex items-center gap-1.5 px-3 h-8 text-xs font-semibold border border-border rounded-lg hover:bg-foreground hover:text-primary-foreground hover:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    </div>
  );
}
