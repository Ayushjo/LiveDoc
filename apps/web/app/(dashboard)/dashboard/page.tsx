'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileText, Database, GitCommit, Layers, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
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
  lastJob: {
    status: string;
    createdAt: string;
    documentsProcessed: number;
  } | null;
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

function syncStatusDot(status: SyncStatus) {
  if (status === 'SYNCING') return <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />;
  if (status === 'ERROR')   return <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />;
}

// ─── Skeleton card ──────────────────────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm animate-pulse">
      <div className="flex items-center justify-between pb-2">
        <div className="h-3 w-28 bg-muted rounded" />
        <div className="w-4 h-4 bg-muted rounded" />
      </div>
      <div className="h-8 w-20 bg-muted rounded mt-2 mb-1" />
      <div className="h-3 w-24 bg-muted rounded" />
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

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

  const STAT_CARDS = stats
    ? [
        {
          label: 'Total Documents',
          value: formatNumber(stats.totalDocuments),
          icon: FileText,
          sub: stats.totalDocuments === 0 ? 'Sync a source to populate' : 'Pages indexed from all sources',
        },
        {
          label: 'Connected Sources',
          value: formatNumber(stats.totalSources),
          icon: Database,
          sub: stats.totalSources === 0 ? 'No sources connected yet' : `${stats.totalSources} active integration${stats.totalSources !== 1 ? 's' : ''}`,
        },
        {
          label: 'Total Chunks',
          value: formatNumber(stats.totalChunks),
          icon: GitCommit,
          sub: 'Semantic chunks stored in DB',
        },
        {
          label: 'Embedded Chunks',
          value: formatNumber(stats.embeddedChunks),
          icon: Layers,
          sub: stats.totalChunks > 0
            ? `${Math.round((stats.embeddedChunks / stats.totalChunks) * 100)}% vectorised in pgvector`
            : 'Trigger a sync to start embedding',
        },
      ]
    : [];

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">
            {activeWorkspace
              ? `Live stats for ${activeWorkspace.name}`
              : 'Welcome to your LiveDoc workspace.'}
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : STAT_CARDS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-card p-6 rounded-xl border border-border shadow-sm">
                  <div className="flex flex-row items-center justify-between pb-2">
                    <h3 className="tracking-tight text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </h3>
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                </div>
              );
            })}
      </div>

      {/* Recent Sync Activity */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Recent Sync Activity</h3>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {!isLoading && (!stats || stats.recentActivity.length === 0) ? (
          <div className="px-6 py-10 text-center text-muted-foreground">
            <Database className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No sources connected yet</p>
            <p className="text-xs mt-1">
              Go to{' '}
              <a href="/sources" className="underline text-foreground">
                Data Sources
              </a>{' '}
              and connect Notion to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(stats?.recentActivity ?? []).map((item) => (
              <div key={item.sourceId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {syncStatusDot(item.syncStatus)}
                  <div>
                    <p className="text-sm font-medium">{item.sourceName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {item.sourceType.toLowerCase()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    {item.syncStatus === 'SYNCING' ? (
                      <span className="text-xs font-medium text-amber-500 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Syncing…
                      </span>
                    ) : item.syncStatus === 'ERROR' ? (
                      <span className="text-xs font-medium text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Sync failed
                      </span>
                    ) : item.lastSyncedAt ? (
                      <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Synced {relativeTime(item.lastSyncedAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Never synced</span>
                    )}
                    {item.lastJob && (
                      <p className="text-[11px] text-muted-foreground">
                        {item.lastJob.documentsProcessed} docs processed
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
