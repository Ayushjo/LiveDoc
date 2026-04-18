'use client';

import { useSession, signOut } from '@/lib/auth-client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Database, MessageSquareText, LogOut, Star, ChevronsUpDown, Loader2 } from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace-context';

// ─── Create-workspace gate ─────────────────────────────────────────────────────

function CreateWorkspaceScreen() {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 48);

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
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Star className="w-6 h-6 fill-foreground text-foreground" />
          <span className="font-semibold text-xl tracking-tight">LiveDoc</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-1">Create your workspace</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Workspaces group your data sources, documents, and team members.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Workspace name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Engineering"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                required
                disabled={isCreating}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">URL slug</label>
              <div className="flex items-center gap-0">
                <span className="px-3 py-2.5 bg-muted border border-border border-r-0 rounded-l-lg text-sm text-muted-foreground">
                  livedoc.app/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="acme-engineering"
                  className="flex-1 px-3 py-2.5 bg-background border border-border rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                  disabled={isCreating}
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <button
              type="submit"
              disabled={isCreating || !name.trim() || !slug.trim()}
              className="w-full py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              {isCreating ? 'Creating...' : 'Create Workspace'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Inner layout (inside WorkspaceProvider) ───────────────────────────────────

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { workspaces, activeWorkspace, setActiveWorkspaceId, isLoading: wsLoading } = useWorkspace();

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [session, isPending, router]);

  // ── Auth loading / unauthenticated ─────────────────────────────────────────
  if (isPending || (wsLoading && !session)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <Star className="w-8 h-8 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!session) return null;

  // ── No workspace yet — show creation screen ────────────────────────────────
  if (!wsLoading && workspaces.length === 0) {
    return <CreateWorkspaceScreen />;
  }

  const NAV_LINKS = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/sources', label: 'Data Sources', icon: Database },
    { href: '/query', label: 'Query Room', icon: MessageSquareText },
  ];

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Star className="w-5 h-5 fill-foreground text-foreground" />
            <span className="font-semibold tracking-tight text-lg">LiveDoc</span>
          </Link>
        </div>

        {/* Workspace selector */}
        {workspaces.length > 0 && (
          <div className="px-4 pt-4 pb-2">
            {workspaces.length === 1 ? (
              <div className="px-3 py-2 rounded-md bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wider font-medium">Workspace</p>
                <p className="text-sm font-semibold truncate">{activeWorkspace?.name}</p>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={activeWorkspace?.id ?? ''}
                  onChange={(e) => setActiveWorkspaceId(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 pr-8 rounded-md bg-muted/50 border border-border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 py-4 px-4 space-y-1">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {session.user.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut();
              router.push('/login');
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto bg-muted/30">
        <div className="p-8 max-w-5xl mx-auto w-full flex-1 flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}

// ─── Exported layout (wraps everything in WorkspaceProvider) ──────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </WorkspaceProvider>
  );
}
