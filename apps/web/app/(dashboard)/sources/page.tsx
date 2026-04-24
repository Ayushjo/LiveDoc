'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { SourceCard } from '@/components/source-card';
import { UploadModal } from '@/components/upload-modal';
import { Plus, CheckCircle2, AlertCircle, Loader2, Zap, FileUp } from 'lucide-react';
import type { Source, SyncInterval } from '@livedoc/types';
import type { ApiResponse } from '@livedoc/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type BannerState = { type: 'success'; message: string } | { type: 'error'; message: string } | null;

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

// ─── Connector card ───────────────────────────────────────────────────────────

interface ConnectorCardProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
}

function ConnectorCard({ icon, name, description, onClick, isLoading, disabled, comingSoon }: ConnectorCardProps) {
  if (comingSoon) {
    return (
      <div className="relative flex flex-col gap-3 p-5 border border-dashed border-border rounded-xl bg-card opacity-45 cursor-not-allowed select-none">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
        <span className="absolute top-3 right-3 text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
          Soon
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className="flex flex-col gap-3 p-5 border border-border rounded-xl bg-card hover:bg-muted/30 hover:border-foreground/15 hover:shadow-card-hover transition-all duration-150 text-left disabled:opacity-60 disabled:cursor-not-allowed group"
    >
      <div className="w-10 h-10 rounded-xl bg-muted group-hover:bg-muted/70 flex items-center justify-center transition-colors shrink-0">
        {isLoading
          ? <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          : icon}
      </div>
      <div>
        <p className="text-sm font-semibold">{isLoading ? 'Redirecting…' : name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const { activeWorkspace } = useWorkspace();
  const searchParams = useSearchParams();

  const [sources, setSources] = useState<Source[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isConnecting, setIsConnecting] = useState<'notion' | 'github' | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

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
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load sources.' });
    } finally {
      setIsLoadingSources(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

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

  const handleSync = useCallback(async (sourceId: string) => {
    try {
      await api.post(`/api/sync/${sourceId}`, {});
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, syncStatus: 'SYNCING' } : s)));
      setBanner({ type: 'success', message: 'Sync started — embedding may take 30–60 seconds.' });
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await fetchSources();
        setSources((prev) => {
          const src = prev.find((s) => s.id === sourceId);
          if (!src || src.syncStatus !== 'SYNCING' || attempts >= 75) clearInterval(poll);
          return prev;
        });
      }, 4000);
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Failed to trigger sync.' });
    }
  }, [fetchSources]);

  const handleScheduleChange = useCallback(async (sourceId: string, interval: SyncInterval) => {
    try {
      await api.patch(`/api/sources/${sourceId}/schedule`, { interval });
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, syncInterval: interval } : s)));
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update schedule.' });
    }
  }, []);

  const handleDelete = useCallback(async (sourceId: string) => {
    if (!confirm('Disconnect this source? All synced documents and embeddings will be permanently deleted.')) return;
    try {
      await api.delete(`/api/sources/${sourceId}`);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      setBanner({ type: 'success', message: 'Source disconnected.' });
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Failed to disconnect source.' });
    }
  }, []);

  return (
    <div className="space-y-8 animate-fade-in-up">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Sources</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage connected integrations and auto-sync schedules
          {activeWorkspace && (
            <> for <span className="font-semibold text-foreground">{activeWorkspace.name}</span></>
          )}.
        </p>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm animate-fade-in ${
            banner.type === 'success'
              ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-destructive/8 border-destructive/20 text-destructive'
          }`}
        >
          {banner.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {banner.message}
        </div>
      )}

      {/* Connect */}
      <section>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Connect a source
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ConnectorCard
            icon={<NotionIcon className="w-5 h-5 text-foreground" />}
            name="Connect Notion"
            description="Sync pages and databases from your workspace."
            onClick={handleConnectNotion}
            isLoading={isConnecting === 'notion'}
            disabled={isConnecting !== null || !activeWorkspace}
          />
          <ConnectorCard
            icon={<GitHubIcon className="w-5 h-5 text-foreground" />}
            name="Connect GitHub"
            description="Sync repos, READMEs, and markdown docs."
            onClick={handleConnectGitHub}
            isLoading={isConnecting === 'github'}
            disabled={isConnecting !== null || !activeWorkspace}
          />
          <ConnectorCard
            icon={<FileUp className="w-5 h-5 text-foreground" />}
            name="Upload Files"
            description="Upload PDFs, DOCX, TXT, or Markdown to index locally."
            onClick={() => setShowUploadModal(true)}
            disabled={!activeWorkspace}
          />
          <ConnectorCard
            icon={
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12.48 10.92v2.33h6.84c-.28 1.47-1.07 2.77-2.28 3.62-1.04.7-2.37 1.1-3.73 1.1-3.69 0-6.79-2.5-7.91-5.87H2.8v2.44C4.77 18.25 8.33 21 12.48 21c2.62 0 4.9-.87 6.52-2.35l1.58 1.55c.23.22.58.22.82 0l.74-.73a.58.58 0 0 0 0-.83l-1.56-1.53C21.62 15.83 22 14.18 22 12.37V11.5a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.02-.08z" />
                <path d="M12 3a9 9 0 0 0-9 9c0 1.66.45 3.22 1.24 4.55L6 14.8A7 7 0 1 1 19 12h2a9 9 0 0 0-9-9z" />
              </svg>
            }
            name="Google Drive"
            description="Import Docs, Sheets, and Slides."
            comingSoon
          />
          <ConnectorCard
            icon={<Plus className="w-5 h-5" />}
            name="Linear"
            description="Sync issues, projects, and team docs."
            comingSoon
          />
        </div>
      </section>

      {/* Connected */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Connected{sources.length > 0 && <span className="ml-1.5 text-foreground">{sources.length}</span>}
          </p>
          {isLoadingSources && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>

        {isLoadingSources ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl overflow-hidden shadow-card">
                <div className="h-0.5 animate-shimmer" />
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-3 w-28 bg-muted rounded animate-pulse" />
                      <div className="h-2.5 w-16 bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                    <div className="h-7 w-20 bg-muted rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl bg-card text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Zap className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">No sources connected yet</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
              Connect Notion or GitHub above to start syncing your team's knowledge base.
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
                onScheduleChange={handleScheduleChange}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
