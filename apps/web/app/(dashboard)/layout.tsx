'use client';

import { useSession, signOut } from '@/lib/auth-client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, Database, MessageSquareText, LogOut,
  ChevronsUpDown, Loader2, Settings, Sun, Moon,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace-context';

// ─── Logo mark ────────────────────────────────────────────────────────────────

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="currentColor" fillOpacity="0.12" />
      <path
        d="M9 8h9.5a5.5 5.5 0 0 1 0 11H9V8Zm0 11h2v5H9v-5Z"
        fill="currentColor"
        fillOpacity="1"
      />
      <circle cx="23" cy="22" r="3" fill="currentColor" fillOpacity="0.65" />
    </svg>
  );
}

// ─── Create-workspace gate ─────────────────────────────────────────────────────

function CreateWorkspaceScreen() {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugify = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 48);

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await createWorkspace(name.trim(), slug.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <LogoMark className="w-9 h-9 text-foreground" />
          <span className="font-bold text-xl tracking-tight">LiveDoc</span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-8 shadow-card">
          <h1 className="text-xl font-bold mb-1 tracking-tight">Create your workspace</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Workspaces group your sources, documents, and team members.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Workspace name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Engineering"
                className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all placeholder:text-muted-foreground/60"
                required
                disabled={isCreating}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">URL slug</label>
              <div className="flex items-center">
                <span className="h-10 px-3 flex items-center bg-muted border border-border border-r-0 rounded-l-lg text-sm text-muted-foreground shrink-0">
                  livedoc.app/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="acme-engineering"
                  className="flex-1 h-10 px-3 bg-background border border-border rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all placeholder:text-muted-foreground/60"
                  required
                  disabled={isCreating}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={isCreating || !name.trim() || !slug.trim()}
              className="w-full h-10 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-1"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              {isCreating ? 'Creating…' : 'Create Workspace'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '/dashboard', label: 'Overview',     icon: LayoutDashboard },
  { href: '/sources',   label: 'Data Sources', icon: Database },
  { href: '/query',     label: 'Query Room',   icon: MessageSquareText },
  { href: '/settings',  label: 'Settings',     icon: Settings },
];

// ─── Inner layout ─────────────────────────────────────────────────────────────

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { workspaces, activeWorkspace, setActiveWorkspaceId, isLoading: wsLoading } = useWorkspace();

  // ── Dark mode ──────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.push('/login');
  }, [session, isPending, router]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isPending || (wsLoading && !session)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <LogoMark className="w-10 h-10 text-foreground/40 animate-pulse" />
          <p className="text-xs text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!session) return null;
  if (!wsLoading && workspaces.length === 0) return <CreateWorkspaceScreen />;

  const userInitial = session.user.name?.[0]?.toUpperCase() ?? 'U';

  return (
    <div className="min-h-screen flex bg-background text-foreground">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-[220px] border-r border-border sidebar-bg flex flex-col shrink-0">

        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <LogoMark className="w-7 h-7 text-foreground" />
            <span className="font-bold tracking-tight text-[15px]">LiveDoc</span>
          </Link>
        </div>

        {/* Workspace selector */}
        {workspaces.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-b border-border shrink-0">
            {workspaces.length === 1 ? (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                <div className="w-5 h-5 rounded-[4px] bg-foreground/10 flex items-center justify-center text-[9px] font-bold uppercase shrink-0 border border-border">
                  {activeWorkspace?.name?.[0] ?? 'W'}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground leading-none">Workspace</p>
                  <p className="text-xs font-semibold truncate mt-0.5">{activeWorkspace?.name}</p>
                </div>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={activeWorkspace?.id ?? ''}
                  onChange={(e) => setActiveWorkspaceId(e.target.value)}
                  className="w-full appearance-none px-2.5 h-9 pr-7 rounded-lg bg-muted/60 border border-border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring/20 cursor-pointer"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
                <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 py-3 px-2.5 space-y-px overflow-y-auto">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-100 ${
                  isActive
                    ? 'bg-foreground text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-[15px] h-[15px] shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-2.5 border-t border-border space-y-px shrink-0">
          <Link
            href="/settings"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="w-6 h-6 rounded-full bg-foreground/10 border border-border flex items-center justify-center text-[10px] font-bold shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold truncate leading-none">{session.user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5 leading-none">{session.user.email}</p>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={async () => { await signOut(); router.push('/login'); }}
              className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        <div className="p-8 max-w-5xl mx-auto w-full flex-1 flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </WorkspaceProvider>
  );
}
