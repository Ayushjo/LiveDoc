'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader2, AlertTriangle,
  History, X, ChevronDown, ChevronUp, CornerDownLeft,
} from 'lucide-react';
import { CitationBlock } from './citation-block';
import type { Citation } from '@livedoc/types';
import { useSession } from '@/lib/auth-client';
import { useWorkspace } from '@/lib/workspace-context';

// ─── Types ─────────────────────────────────────────────────────────────────────

type SSEEvent =
  | { type: 'delta';     content: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'done' }
  | { type: 'error';     message: string };

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  isError?: boolean;
};

type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  sources: Citation[];
  createdAt: string;
  userId: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7)  return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── History panel ─────────────────────────────────────────────────────────────

interface HistoryPanelProps {
  items: HistoryItem[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
}

function HistoryPanel({ items, isLoading, hasMore, onLoadMore, onClose, onSelect }: HistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="w-72 border-l border-border flex flex-col shrink-0 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Query History</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Close history"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <History className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1">No history yet</p>
            <p className="text-xs text-muted-foreground">
              Your queries will appear here after you ask questions.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id}>
                  {/* Row header (always visible, clickable) */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-start gap-2 w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                        {item.question}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    }
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-muted/30 border-t border-border/50 space-y-3">
                      {/* Answer preview */}
                      <p className="text-[11px] leading-relaxed text-foreground/80 pt-3 line-clamp-6">
                        {item.answer}
                      </p>

                      {/* Source badges */}
                      {item.sources && item.sources.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                            Sources
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {item.sources.slice(0, 3).map((src, i) => (
                              <span
                                key={src.chunkId}
                                className="inline-flex items-center text-[10px] px-2 py-0.5 bg-background border border-border rounded-full text-muted-foreground"
                              >
                                [{i + 1}] {src.title ? src.title.slice(0, 18) : 'Source'}
                                {src.title && src.title.length > 18 ? '…' : ''}
                              </span>
                            ))}
                            {item.sources.length > 3 && (
                              <span className="inline-flex items-center text-[10px] px-2 py-0.5 bg-background border border-border rounded-full text-muted-foreground">
                                +{item.sources.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Load into chat */}
                      <button
                        onClick={() => onSelect(item)}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/70 transition-colors"
                      >
                        <CornerDownLeft className="w-3 h-3" />
                        Load into chat
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="p-3 border-t border-border">
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function QueryInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { data: session } = useSession();
  const { activeWorkspace } = useWorkspace();

  // ── History state ──────────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Keep a ref so async handlers can read the latest showHistory without capturing stale closures
  const showHistoryRef = useRef(showHistory);
  useEffect(() => { showHistoryRef.current = showHistory; }, [showHistory]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clean up any in-flight request when the component unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Fetch history ──────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async (cursor?: string) => {
    if (!activeWorkspace) return;
    setIsLoadingHistory(true);
    try {
      const params = new URLSearchParams({
        workspaceId: activeWorkspace.id,
        take: '15',
      });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`${API_URL}/api/query/history?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load history');

      const json = (await res.json()) as {
        data: { items: HistoryItem[]; nextCursor: string | null };
      };
      const { items, nextCursor } = json.data;

      setHistoryItems((prev) => (cursor ? [...prev, ...items] : items));
      setHistoryCursor(nextCursor);
      setHasMoreHistory(!!nextCursor);
    } catch {
      // Non-critical — history load failure is silent
    } finally {
      setIsLoadingHistory(false);
    }
  }, [activeWorkspace]);

  // Reset + reload history whenever the panel is opened or workspace changes
  useEffect(() => {
    if (!showHistory) return;
    setHistoryItems([]);
    setHistoryCursor(null);
    fetchHistory();
  }, [showHistory, activeWorkspace]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load history item into chat ────────────────────────────────────────────
  const handleSelectHistory = useCallback((item: HistoryItem) => {
    setMessages([
      { id: `hist-user-${item.id}`, role: 'user', content: item.question },
      {
        id: `hist-asst-${item.id}`,
        role: 'assistant',
        content: item.answer,
        citations: item.sources,
      },
    ]);
    setShowHistory(false);
  }, []);

  // ── Submit query ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !activeWorkspace) return;

    const query = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantId = `asst-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', isStreaming: true },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let finalContent = '';
    let finalCitations: Citation[] = [];

    try {
      const response = await fetch(`${API_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, workspaceId: activeWorkspace.id }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            `Request failed: ${response.status}`,
        );
      }

      // ── SSE stream reader ────────────────────────────────────────────────────
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw) as SSEEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case 'delta':
              finalContent += event.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: msg.content + event.content }
                    : msg,
                ),
              );
              break;

            case 'citations':
              finalCitations = event.citations;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, citations: event.citations }
                    : msg,
                ),
              );
              break;

            case 'done':
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, isStreaming: false } : msg,
                ),
              );
              // If history panel is open, prepend the new entry optimistically
              if (showHistoryRef.current && finalContent) {
                const optimistic: HistoryItem = {
                  id: `optimistic-${Date.now()}`,
                  question: query,
                  answer: finalContent,
                  sources: finalCitations,
                  createdAt: new Date().toISOString(),
                  userId: '',
                };
                setHistoryItems((prev) => [optimistic, ...prev]);
              }
              break;

            case 'error':
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: event.message, isStreaming: false, isError: true }
                    : msg,
                ),
              );
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;

      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: message, isStreaming: false, isError: true }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── No workspace guard ─────────────────────────────────────────────────────
  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
        <AlertTriangle className="w-8 h-8 mb-3 text-amber-500" />
        <p className="text-sm text-center">
          No workspace selected. Create or select a workspace from the sidebar.
        </p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-card">
        <span className="text-xs font-medium text-muted-foreground">
          {activeWorkspace.name}
        </span>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            showHistory
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title={showHistory ? 'Close history' : 'View query history'}
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
      </div>

      {/* ── Content row: messages + optional history panel ──────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-foreground" />
              </div>
              <p className="text-sm font-medium">Start asking questions.</p>
              <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
                Answers stream in real time from{' '}
                <span className="font-semibold text-foreground">{activeWorkspace.name}</span>{' '}
                and include source citations.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded shrink-0 bg-primary/10 flex items-center justify-center mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}

                <div
                  className={`flex flex-col gap-2 max-w-[85%] ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`p-4 rounded-xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-foreground text-background rounded-tr-sm'
                        : msg.isError
                          ? 'bg-destructive/10 text-destructive rounded-tl-sm border border-destructive/20'
                          : 'bg-muted/50 rounded-tl-sm border border-border'
                    }`}
                  >
                    {msg.content || (msg.isStreaming ? null : (
                      <span className="italic text-muted-foreground">Empty response</span>
                    ))}
                    {msg.isStreaming && (
                      <span className="ml-1 inline-block w-2 h-4 bg-current opacity-70 animate-pulse align-text-bottom" />
                    )}
                  </div>

                  {/* Citations */}
                  {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                    <div className="w-full mt-1 space-y-2">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                        Sources
                      </span>
                      <div className="flex flex-col gap-2">
                        {msg.citations.map((cite, i) => (
                          <CitationBlock key={cite.chunkId} citation={cite} index={i + 1} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full shrink-0 bg-muted flex items-center justify-center text-xs font-bold mt-1">
                    {session?.user?.name ? (
                      session.user.name.charAt(0).toUpperCase()
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* History panel (conditional) */}
        {showHistory && (
          <HistoryPanel
            items={historyItems}
            isLoading={isLoadingHistory}
            hasMore={hasMoreHistory}
            onLoadMore={() => fetchHistory(historyCursor ?? undefined)}
            onClose={() => setShowHistory(false)}
            onSelect={handleSelectHistory}
          />
        )}
      </div>

      {/* ── Input area ──────────────────────────────────────────────────────── */}
      <div className="p-4 border-t border-border bg-card shrink-0">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            placeholder={`Ask about ${activeWorkspace.name}…`}
            className="w-full pl-4 pr-12 py-3.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm shadow-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
        <p className="text-center text-[10px] text-muted-foreground mt-2">
          LiveDoc AI can make mistakes. Verify important information with the cited sources.
        </p>
      </div>
    </div>
  );
}
