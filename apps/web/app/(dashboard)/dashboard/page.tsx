'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText, Database, Layers, RefreshCw, AlertCircle,
  CheckCircle2, Loader2, Zap, ArrowRight, GitCommit,
} from 'lucide-react';
import { useWorkspace } from '@/lib/workspace-context';
import { api } from '@/lib/api';
import type { ApiResponse, SyncStatus, SourceType } from '@livedoc/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RecentActivity {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  lastJob: { status: string; createdAt: string; documentsProcessed: number } | null;
}

interface WorkspaceStats {
  totalDocuments: number;
  totalSources: number;
  totalChunks: number;
  embeddedChunks: number;
  recentActivity: RecentActivity[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <div className="h-0.5 animate-shimmer" />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          <div className="w-8 h-8 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="h-7 w-16 bg-muted rounded animate-pulse" />
        <div className="h-2.5 w-32 bg-muted rounded animate-pulse" />
      </div>
    </div>
  );
}

// ─── Source type icon ─────────────────────────────────────────────────────────

function SourceTypeIcon({ type }: { type: SourceType }) {
  if (type === 'GITHUB') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    );
  }
  return <Database className="w-4 h-4" />;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const STAT_CONFIG = [
  {
    key: 'totalDocuments',
    label: 'Documents',
    icon: FileText,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    bar: 'bg-blue-500',
    sub: (v: number) =>
      v === 0 ? 'Sync a source to populate' : `${v === 1 ? 'page' : 'pages'} indexed`,
  },
  {
    key: 'totalSources',
    label: 'Connected Sources',
    icon: Database,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    bar: 'bg-violet-500',
    sub: (v: number) =>
      v === 0 ? 'No sources yet' : `${v} active integration${v !== 1 ? 's' : ''}`,
  },
  {
    key: 'totalChunks',
    label: 'Total Chunks',
    icon: GitCommit,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    bar: 'bg-cyan-500',
    sub: () => 'Semantic text chunks stored',
  },
  {
    key: 'embeddedChunks',
    label: 'Vectorised',
    icon: Layers,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    bar: 'bg-emerald-500',
    sub: (v: number, stats: WorkspaceStats) =>
      stats.totalChunks > 0
        ? `${Math.round((v / stats.totalChunks) * 100)}% embedded in pgvector`
        : 'Trigger a sync to embed',
  },
] as const;

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!activeWorkspace) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<WorkspaceStats>>(
        `/api/workspaces/${activeWorkspace.id}/stats`,
      );
      if (res.error) throw new Error(res.error.message);
      setStats(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats.');
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-8 animate-fade-in-up">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeWorkspace
              ? `Workspace stats for ${activeWorkspace.name}`
              : 'Welcome to your LiveDoc workspace.'}
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 h-8 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50 border border-border"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 p-4 bg-destructive/8 border border-destructive/20 rounded-xl text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : STAT_CONFIG.map((cfg) => {
              const value = stats ? stats[cfg.key as keyof WorkspaceStats] as number : 0;
              const Icon = cfg.icon;
              return (
                <div
                  key={cfg.label}
                  className="bg-card rounded-xl border border-border shadow-card overflow-hidden group hover:shadow-card-hover transition-shadow duration-200"
                >
                  {/* Top accent bar */}
                  <div className={`h-0.5 ${cfg.bar}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-xs font-medium text-muted-foreground">{cfg.label}</p>
                      <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold tracking-tight">{formatNumber(value)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {stats
                        ? (cfg.key === 'embeddedChunks'
                          ? (cfg.sub as (v: number, s: WorkspaceStats) => string)(value, stats)
                          : (cfg.sub as (v: number) => string)(value))
                        : '—'}
                    </p>
                  </div>
                </div>
              );
            })}
      </div>

      {/* ── Recent Sync Activity ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Recent Sync Activity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Latest sync status across all sources</p>
          </div>
          <div className="flex items-center gap-3">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <Link
              href="/sources"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Manage sources
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {!isLoading && (!stats || stats.recentActivity.length === 0) ? (
          <div className="px-6 py-14 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Zap className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">No sources connected</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Connect Notion or GitHub to start syncing your knowledge base.
            </p>
            <Link
              href="/sources"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-foreground text-primary-foreground hover:bg-foreground/90 transition-all"
            >
              Add your first source
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(stats?.recentActivity ?? []).map((item) => (
              <Link
                key={item.sourceId}
                href={`/sources/${item.sourceId}`}
                className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  {/* Status dot */}
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      item.syncStatus === 'SYNCING'
                        ? 'bg-amber-500 animate-pulse'
                        : item.syncStatus === 'ERROR'
                          ? 'bg-destructive'
                          : 'bg-emerald-500'
                    }`}
                  />
                  <div className={`w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground shrink-0 bg-muted/40`}>
                    <SourceTypeIcon type={item.sourceType} />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-none">{item.sourceName}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                      {item.sourceType.toLowerCase().replace('_', ' ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {item.syncStatus === 'SYNCING' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Syncing…
                      </span>
                    ) : item.syncStatus === 'ERROR' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <AlertCircle className="w-3 h-3" />
                        Sync failed
                      </span>
                    ) : item.lastSyncedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        {relativeTime(item.lastSyncedAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Never synced</span>
                    )}
                    {item.lastJob && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 text-right">
                        {item.lastJob.documentsProcessed} docs
                      </p>
                    )}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
