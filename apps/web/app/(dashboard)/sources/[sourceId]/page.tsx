'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { ApiResponse, Source, SyncJob, SyncInterval } from '@livedoc/types';
import {
  ArrowLeft, RefreshCw, Database, Github, FileText, AlertCircle,
  CheckCircle2, Clock, Loader2, ExternalLink, Search, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DocSummary {
  id: string;
  title: string;
  url: string;
  lastEditedAt: string;
  updatedAt: string;
  _count: { chunks: number };
}

interface DocumentsPage {
  documents: DocSummary[];
  nextCursor: string | null;
  total: number;
}

const INTERVAL_LABELS: Record<SyncInterval, string> = {
  MANUAL: 'Manual only', HOURLY: 'Every hour',
  EVERY_6H: 'Every 6 hours', DAILY: 'Every day', WEEKLY: 'Every week',
};

function SourceIcon({ type }: { type: Source['type'] }) {
  const cls = 'w-5 h-5';
  if (type === 'GITHUB') return <Github className={cls} />;
  return <Database className={cls} />;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SyncJobRow({ job }: { job: SyncJob }) {
  const statusColors = {
    PENDING: 'text-muted-foreground', RUNNING: 'text-amber-500',
    COMPLETED: 'text-green-500', FAILED: 'text-destructive',
  };
  const StatusIcon = job.status === 'RUNNING'
    ? () => <RefreshCw className="w-3.5 h-3.5 animate-spin" />
    : job.status === 'COMPLETED'
      ? () => <CheckCircle2 className="w-3.5 h-3.5" />
      : job.status === 'FAILED'
        ? () => <AlertCircle className="w-3.5 h-3.5" />
        : () => <Clock className="w-3.5 h-3.5" />;

  const duration = job.startedAt && job.completedAt
    ? `${((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="flex items-start gap-4 py-4 border-b border-border last:border-0">
      <div className={`mt-0.5 shrink-0 ${statusColors[job.status]}`}>
        <StatusIcon />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium capitalize ${statusColors[job.status]}`}>
            {job.status.toLowerCase()}
          </span>
          <span className="text-xs text-muted-foreground">
            · {job.triggeredBy.toLowerCase()} trigger
          </span>
          {duration && (
            <span className="text-xs text-muted-foreground">· {duration}</span>
          )}
        </div>
        {job.status === 'COMPLETED' && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {job.documentsProcessed} docs · {job.chunksCreated} chunks created
          </p>
        )}
        {job.errorMessage && (
          <p className="text-xs text-destructive mt-0.5 truncate">{job.errorMessage}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {relativeTime(job.createdAt as unknown as string)}
      </span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SourceDetailPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const [source, setSource] = useState<Source | null>(null);
  const [tab, setTab] = useState<'documents' | 'sync-history'>('documents');
  const [loadingSource, setLoadingSource] = useState(true);

  // Documents state
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsNextCursor, setDocsNextCursor] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingMoreDocs, setLoadingMoreDocs] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Sync history state
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Syncing state
  const [syncing, setSyncing] = useState(false);

  // ── Load source ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingSource(true);
      try {
        const res = await api.get<ApiResponse<Source>>(`/api/sources/${sourceId}`);
        if (res.error) throw new Error(res.error.message);
        setSource(res.data);
      } catch {
        router.push('/sources');
      } finally {
        setLoadingSource(false);
      }
    }
    load();
  }, [sourceId, router]);

  // ── Load documents ───────────────────────────────────────────────────────
  const fetchDocs = useCallback(async (cursor?: string, searchTerm = search) => {
    if (!source) return;
    const isFirstPage = !cursor;
    isFirstPage ? setLoadingDocs(true) : setLoadingMoreDocs(true);
    try {
      const params = new URLSearchParams({ take: '20' });
      if (cursor) params.set('cursor', cursor);
      if (searchTerm) params.set('search', searchTerm);

      const res = await api.get<ApiResponse<DocumentsPage>>(
        `/api/sources/${sourceId}/documents?${params}`,
      );
      if (res.error) throw new Error(res.error.message);
      const page = res.data!;

      if (isFirstPage) {
        setDocs(page.documents);
      } else {
        setDocs((prev) => [...prev, ...page.documents]);
      }
      setDocsNextCursor(page.nextCursor);
      setDocsTotal(page.total);
    } catch {
      // ignore
    } finally {
      isFirstPage ? setLoadingDocs(false) : setLoadingMoreDocs(false);
    }
  }, [source, sourceId, search]);

  useEffect(() => {
    if (source && tab === 'documents') fetchDocs(undefined, search);
  }, [source, tab, search, fetchDocs]);

  // ── Load sync history ────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await api.get<ApiResponse<SyncJob[]>>(`/api/sync/${sourceId}/jobs`);
      if (res.error) throw new Error(res.error.message);
      setSyncJobs(res.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingJobs(false);
    }
  }, [sourceId]);

  useEffect(() => {
    if (tab === 'sync-history') fetchJobs();
  }, [tab, fetchJobs]);

  // ── Manual sync ──────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post(`/api/sync/${sourceId}`, {});
      setSource((prev) => prev ? { ...prev, syncStatus: 'SYNCING' } : prev);
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  };

  // ── Schedule change ──────────────────────────────────────────────────────
  const handleScheduleChange = async (interval: SyncInterval) => {
    try {
      await api.patch(`/api/sources/${sourceId}/schedule`, { interval });
      setSource((prev) => prev ? { ...prev, syncInterval: interval } : prev);
    } catch {
      // ignore
    }
  };

  // ── Search submit ─────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  if (loadingSource) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) return null;

  const isSyncing = source.syncStatus === 'SYNCING';

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Back + header */}
      <div>
        <Link
          href="/sources"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sources
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <SourceIcon type={source.type} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{source.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-3">
                <span className="capitalize">{source.type.toLowerCase().replace('_', ' ')}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {INTERVAL_LABELS[source.syncInterval]}
                </span>
                {source.lastSyncedAt && (
                  <>
                    <span>·</span>
                    <span>Synced {relativeTime(source.lastSyncedAt as unknown as string)}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Schedule selector */}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={source.syncInterval}
                onChange={(e) => handleScheduleChange(e.target.value as SyncInterval)}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {(Object.keys(INTERVAL_LABELS) as SyncInterval[]).map((k) => (
                  <option key={k} value={k}>{INTERVAL_LABELS[k]}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSync}
              disabled={isSyncing || syncing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 rounded-lg disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Status bar */}
      {source.syncStatus === 'ERROR' && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Last sync failed. Check the Sync History tab for details.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['documents', 'sync-history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'documents'
              ? `Documents${docsTotal > 0 ? ` (${docsTotal})` : ''}`
              : 'Sync History'}
          </button>
        ))}
      </div>

      {/* ── Documents tab ─────────────────────────────────────────────────── */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documents…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </form>

          {loadingDocs ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium text-muted-foreground">
                {search ? 'No documents match your search' : 'No documents synced yet'}
              </p>
              {!search && (
                <p className="text-xs text-muted-foreground mt-1">
                  Trigger a sync to index documents from this source.
                </p>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc._count.chunks} chunk{doc._count.chunks !== 1 ? 's' : ''} ·{' '}
                      last edited {relativeTime(doc.lastEditedAt)}
                    </p>
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Open in source"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}

              {docsNextCursor && (
                <div className="px-5 py-4 border-t border-border flex justify-center">
                  <button
                    onClick={() => fetchDocs(docsNextCursor)}
                    disabled={loadingMoreDocs}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {loadingMoreDocs && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {loadingMoreDocs ? 'Loading…' : 'Load more'}
                    {!loadingMoreDocs && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sync History tab ─────────────────────────────────────────────── */}
      {tab === 'sync-history' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">Sync Jobs</h3>
            <button
              onClick={fetchJobs}
              disabled={loadingJobs}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingJobs ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loadingJobs ? (
            <div className="px-5 py-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : syncJobs.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No sync jobs yet. Trigger a sync to get started.</p>
            </div>
          ) : (
            <div className="px-5">
              {syncJobs.map((job) => (
                <SyncJobRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
