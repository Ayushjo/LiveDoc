'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { SourceCard } from '@/components/source-card';
import { Database, Github, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { Source } from '@livedoc/types';
import type { ApiResponse } from '@livedoc/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace-context';

// ─── Banner ────────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type BannerState =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }
  | null;

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const { activeWorkspace } = useWorkspace();
  const searchParams = useSearchParams();

  const [sources, setSources] = useState<Source[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isConnecting, setIsConnecting] = useState<'notion' | 'github' | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);

  // ── Handle OAuth callback redirect params ──────────────────────────────────
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'notion') {
      setBanner({ type: 'success', message: 'Notion workspace connected successfully.' });
      window.history.replaceState(null, '', '/sources');
      fetchSources();
    } else if (connected === 'github') {
      setBanner({ type: 'success', message: 'GitHub account connected successfully.' });
      window.history.replaceState(null, '', '/sources');
      fetchSources();
    } else if (error) {
      setBanner({ type: 'error', message: decodeURIComponent(error) });
      window.history.replaceState(null, '', '/sources');
    }
  }, [searchParams, fetchSources]);

  // Auto-dismiss banner after 6 seconds
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  // ── Fetch sources ──────────────────────────────────────────────────────────
  const fetchSources = useCallback(async () => {
    if (!activeWorkspace) return;
    setIsLoadingSources(true);
    try {
      const res = await api.get<ApiResponse<Source[]>>(
        `/api/sources?workspaceId=${activeWorkspace.id}`,
      );
      if (res.error) throw new Error(res.error.message);
      if (res.data) setSources(res.data);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load sources.',
      });
    } finally {
      setIsLoadingSources(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // ── OAuth connect handlers (browser redirect, not fetch) ──────────────────
  const handleConnectNotion = () => {
    if (!activeWorkspace) return;
    setIsConnecting('notion');
    window.location.href = `${API_URL}/api/sources/notion/connect?workspaceId=${activeWorkspace.id}`;
  };

  const handleConnectGitHub = () => {
    if (!activeWorkspace) return;
    setIsConnecting('github');
    window.location.href = `${API_URL}/api/sources/github/connect?workspaceId=${activeWorkspace.id}`;
  };

  // ── Trigger manual sync + poll until completed ─────────────────────────────
  const handleSync = useCallback(async (sourceId: string) => {
    try {
      await api.post(`/api/sync/${sourceId}`, {});
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, syncStatus: 'SYNCING' } : s)),
      );
      setBanner({ type: 'success', message: 'Sync started — embedding may take 30–60 seconds.' });

      // Poll every 4 s until the source is no longer SYNCING
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await fetchSources();
        // Stop polling after source leaves SYNCING state or after 5 min (75 × 4s)
        setSources((prev) => {
          const src = prev.find((s) => s.id === sourceId);
          if (!src || src.syncStatus !== 'SYNCING' || attempts >= 75) {
            clearInterval(poll);
          }
          return prev;
        });
      }, 4000);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to trigger sync.',
      });
    }
  }, [fetchSources]);

  // ── Disconnect source ─────────────────────────────────────────────────────
  const handleDelete = useCallback(async (sourceId: string) => {
    if (!confirm('Disconnect this source? All synced documents and embeddings will be permanently deleted.')) return;
    try {
      await api.delete(`/api/sources/${sourceId}`);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      setBanner({ type: 'success', message: 'Source disconnected.' });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to disconnect source.',
      });
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in-up" style={{ opacity: 0 }}>
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
        <p className="text-muted-foreground mt-1">
          Manage your connected tools and sync settings
          {activeWorkspace && (
            <span className="font-medium text-foreground">
              {' '}for <span className="text-primary">{activeWorkspace.name}</span>
            </span>
          )}
          .
        </p>
      </div>

      {/* Status banner */}
      {banner && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
            banner.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{banner.message}</span>
        </div>
      )}

      {/* Add new source */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Add New Source</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Notion */}
          <button
            onClick={handleConnectNotion}
            disabled={isConnecting !== null || !activeWorkspace}
            className="flex flex-col items-center justify-center p-6 border border-border rounded-xl bg-card hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="w-12 h-12 bg-primary/10 group-hover:bg-primary/20 rounded-full flex items-center justify-center mb-3 transition-colors">
              {isConnecting === 'notion' ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : (
                <Database className="w-6 h-6 text-primary" />
              )}
            </div>
            <span className="font-medium text-sm">
              {isConnecting === 'notion' ? 'Redirecting…' : 'Connect Notion'}
            </span>
          </button>

          {/* GitHub */}
          <button
            onClick={handleConnectGitHub}
            disabled={isConnecting !== null || !activeWorkspace}
            className="flex flex-col items-center justify-center p-6 border border-border rounded-xl bg-card hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="w-12 h-12 bg-primary/10 group-hover:bg-primary/20 rounded-full flex items-center justify-center mb-3 transition-colors">
              {isConnecting === 'github' ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : (
                <Github className="w-6 h-6 text-primary" />
              )}
            </div>
            <span className="font-medium text-sm">
              {isConnecting === 'github' ? 'Redirecting…' : 'Connect GitHub'}
            </span>
          </button>

          {/* Placeholder: Google Drive */}
          <button
            disabled
            className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-xl opacity-40 cursor-not-allowed"
          >
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">Google Drive (Soon)</span>
          </button>

          {/* Placeholder: Linear */}
          <button
            disabled
            className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-xl opacity-40 cursor-not-allowed"
          >
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">Linear (Soon)</span>
          </button>
        </div>
      </div>

      {/* Connected sources */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h2 className="text-xl font-semibold">Connected Sources</h2>

        {isLoadingSources ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading sources…</span>
          </div>
        ) : sources.length === 0 ? (
          <div className="p-10 text-center border border-dashed border-border rounded-xl bg-card">
            <Database className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No sources connected</p>
            <p className="text-xs text-muted-foreground">
              Connect a source above to start syncing your documents.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onSync={handleSync}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
