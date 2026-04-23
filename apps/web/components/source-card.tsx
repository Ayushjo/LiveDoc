'use client';

import { RefreshCw, Database, Github, AlertCircle, CheckCircle2, Trash2, FileText, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { Source, SyncInterval } from '@livedoc/types';

const INTERVAL_LABELS: Record<SyncInterval, string> = {
  MANUAL:   'Manual',
  HOURLY:   'Hourly',
  EVERY_6H: 'Every 6h',
  DAILY:    'Daily',
  WEEKLY:   'Weekly',
};

interface SourceCardProps {
  source: Source & { _count?: { documents: number } };
  onSync?: (sourceId: string) => void;
  onDelete?: (sourceId: string) => void;
  onScheduleChange?: (sourceId: string, interval: SyncInterval) => void;
}

function SourceIcon({ type }: { type: Source['type'] }) {
  const cls = 'w-5 h-5 text-foreground';
  switch (type) {
    case 'GITHUB':  return <Github className={cls} />;
    case 'NOTION':  return <Database className={cls} />;
    default:        return <Database className={cls} />;
  }
}

export function SourceCard({ source, onSync, onDelete, onScheduleChange }: SourceCardProps) {
  const isSyncing = source.syncStatus === 'SYNCING';
  const hasError  = source.syncStatus === 'ERROR';
  const docCount  = (source as SourceCardProps['source'])._count?.documents;

  return (
    <div className="p-5 border border-border rounded-xl bg-card shadow-sm flex flex-col gap-4 hover:border-border/80 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
            <SourceIcon type={source.type} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              {source.name}
              {hasError && <AlertCircle className="w-4 h-4 text-destructive" />}
            </h3>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">
              {source.type.toLowerCase().replace('_', ' ')}
              {docCount !== undefined && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {docCount} {docCount === 1 ? 'doc' : 'docs'}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* View details */}
          <Link
            href={`/sources/${source.id}`}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="View source details"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>

          {onDelete && (
            <button
              onClick={() => onDelete(source.id)}
              title="Disconnect source"
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Auto-sync schedule */}
      {onScheduleChange && (
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Auto-sync:</span>
          <select
            value={source.syncInterval}
            onChange={(e) => onScheduleChange(source.id, e.target.value as SyncInterval)}
            disabled={isSyncing}
            className="text-xs font-medium bg-transparent border-none outline-none cursor-pointer text-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            {(Object.keys(INTERVAL_LABELS) as SyncInterval[]).map((key) => (
              <option key={key} value={key}>
                {INTERVAL_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        {/* Status */}
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">Status</span>
          <div className="flex items-center gap-1.5">
            {isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span className="text-xs font-medium text-amber-500">Syncing…</span>
              </>
            ) : hasError ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs font-medium text-destructive">Sync Failed</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-medium text-green-500">
                  {source.lastSyncedAt ? 'Synced' : 'Ready'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Last synced */}
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground mb-1">Last Synced</span>
            <span className="text-xs font-medium">
              {source.lastSyncedAt
                ? new Date(source.lastSyncedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never'}
            </span>
          </div>

          {/* Sync trigger button */}
          {onSync && (
            <button
              onClick={() => onSync(source.id)}
              disabled={isSyncing}
              title="Trigger manual sync"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-muted hover:bg-foreground hover:text-background rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
