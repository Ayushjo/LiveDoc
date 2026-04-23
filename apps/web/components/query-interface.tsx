'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, AlertTriangle } from 'lucide-react';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Component ────────────────────────────────────────────────────────────────

export function QueryInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { data: session } = useSession();
  const { activeWorkspace } = useWorkspace();

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

    // Create a new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
      let lineBuffer = ''; // buffer for incomplete SSE lines

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append new bytes to the line buffer and split on newlines
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        // The last element may be an incomplete line — keep it in the buffer
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw) as SSEEvent;
          } catch {
            continue; // malformed event — skip
          }

          switch (event.type) {
            case 'delta':
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: msg.content + event.content }
                    : msg,
                ),
              );
              break;

            case 'citations':
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
              break;

            case 'error':
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? {
                        ...msg,
                        content: event.message,
                        isStreaming: false,
                        isError: true,
                      }
                    : msg,
                ),
              );
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // user navigated away

      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
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
              <span className="font-semibold text-foreground">
                {activeWorkspace.name}
              </span>{' '}
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
                  {msg.content || (msg.isStreaming ? null : <span className="italic text-muted-foreground">Empty response</span>)}
                  {msg.isStreaming && (
                    <span className="ml-1 inline-block w-2 h-4 bg-current opacity-70 animate-pulse align-text-bottom" />
                  )}
                </div>

                {/* Citations */}
                {msg.role === 'assistant' &&
                  msg.citations &&
                  msg.citations.length > 0 && (
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
                <div className="w-8 h-8 rounded-full shrink-0 bg-muted flex items-center justify-center text-xs font-bold font-mono mt-1">
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

      {/* Input area */}
      <div className="p-4 border-t border-border bg-card">
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
          LiveDoc AI can make mistakes. Verify important information with the
          cited sources.
        </p>
      </div>
    </div>
  );
}
