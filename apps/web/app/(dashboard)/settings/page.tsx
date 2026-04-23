'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from '@/lib/auth-client';
import { useWorkspace } from '@/lib/workspace-context';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse } from '@livedoc/types';
import {
  User, Building2, Users, Shield, Loader2, Check,
  AlertCircle, Trash2, LogOut, Send, X, Crown, UserCog,
  ChevronDown,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
  user: { id: string; name: string; email: string; image: string | null };
}

interface Invitation {
  id: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  expiresAt: string;
  createdAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function roleIcon(role: string) {
  if (role === 'OWNER') return <Crown className="w-3.5 h-3.5 text-amber-500" />;
  if (role === 'ADMIN') return <Shield className="w-3.5 h-3.5 text-blue-500" />;
  return <User className="w-3.5 h-3.5 text-muted-foreground" />;
}

function roleBadge(role: string) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium';
  if (role === 'OWNER') return <span className={`${base} bg-amber-500/10 text-amber-600 dark:text-amber-400`}>{roleIcon(role)} Owner</span>;
  if (role === 'ADMIN') return <span className={`${base} bg-blue-500/10 text-blue-600 dark:text-blue-400`}>{roleIcon(role)} Admin</span>;
  return <span className={`${base} bg-muted text-muted-foreground`}>{roleIcon(role)} Member</span>;
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-16 h-16 text-2xl' };
  return (
    <div className={`${sizes[size]} rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0`}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <h2 className="font-semibold text-base">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
      type === 'success'
        ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400'
        : 'bg-destructive/10 border-destructive/20 text-destructive'
    }`}>
      {type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {message}
    </div>
  );
}

// ─── Tab: Profile ──────────────────────────────────────────────────────────────

function ProfileTab({ onToast }: { onToast: (m: string, t: 'success' | 'error') => void }) {
  const { data: session, isPending } = useSession();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (session?.user.name) setName(session.user.name);
  }, [session]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await api.patch<ApiResponse<{ name: string }>>('/api/users/me', { name: name.trim() });
      if (res.error) throw new Error(res.error.message);
      onToast('Profile updated successfully', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Permanently delete your account? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.delete('/api/users/me');
      await signOut();
      router.push('/login');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to delete account', 'error');
      setDeleting(false);
    }
  };

  if (isPending) return <div className="animate-pulse h-40 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6">
      <SectionCard title="Your Profile" description="Update your display name.">
        <div className="flex items-start gap-5">
          <Avatar name={session?.user.name ?? '?'} size="lg" />
          <form onSubmit={handleSave} className="flex-1 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Display name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                  maxLength={64}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Email address</label>
                <input
                  value={session?.user.email ?? ''}
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-muted/50 text-sm text-muted-foreground cursor-not-allowed"
                  disabled
                  readOnly
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !name.trim() || name === session?.user.name}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </SectionCard>

      <SectionCard title="Account Info">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Member since</span>
            <span className="font-medium">
              {session?.user.createdAt
                ? new Date(session.user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Email verified</span>
            <span className={`font-medium ${session?.user.emailVerified ? 'text-green-600' : 'text-amber-600'}`}>
              {session?.user.emailVerified ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Danger Zone">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete account</p>
            <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all your data. This cannot be undone.</p>
          </div>
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete account
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Workspace ────────────────────────────────────────────────────────────

function WorkspaceTab({ onToast }: { onToast: (m: string, t: 'success' | 'error') => void }) {
  const { activeWorkspace, refetch } = useWorkspace();
  const { data: session } = useSession();
  const router = useRouter();

  const [name, setName] = useState(activeWorkspace?.name ?? '');
  const [slug, setSlug] = useState(activeWorkspace?.slug ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const userRole = (activeWorkspace as unknown as { role?: string })?.role;

  useEffect(() => {
    setName(activeWorkspace?.name ?? '');
    setSlug(activeWorkspace?.slug ?? '');
  }, [activeWorkspace]);

  const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 48);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    setSaving(true);
    try {
      const res = await api.patch<ApiResponse<unknown>>(`/api/workspaces/${activeWorkspace.id}`, { name: name.trim(), slug: slug.trim() });
      if (res.error) throw new Error(res.error.message);
      await refetch();
      onToast('Workspace updated', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update workspace', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeWorkspace) return;
    if (!confirm(`Permanently delete "${activeWorkspace.name}"? All sources, documents, and embeddings will be lost.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/api/workspaces/${activeWorkspace.id}`);
      await refetch();
      router.push('/dashboard');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to delete workspace', 'error');
      setDeleting(false);
    }
  };

  const handleLeave = async () => {
    if (!activeWorkspace || !session) return;
    if (!confirm(`Leave "${activeWorkspace.name}"?`)) return;
    setLeaving(true);
    try {
      await api.delete(`/api/workspaces/${activeWorkspace.id}/members/${session.user.id}`);
      await refetch();
      router.push('/dashboard');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to leave workspace', 'error');
      setLeaving(false);
    }
  };

  if (!activeWorkspace) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  const canEdit = userRole === 'OWNER' || userRole === 'ADMIN';
  const isOwner = userRole === 'OWNER';

  return (
    <div className="space-y-6">
      <SectionCard title="Workspace Settings" description="Update the name and URL slug for this workspace.">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Workspace name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:bg-muted/50 disabled:cursor-not-allowed"
                required
                maxLength={64}
                disabled={!canEdit || saving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">URL slug</label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 bg-muted border border-border border-r-0 rounded-l-lg text-sm text-muted-foreground text-nowrap">
                  livedoc.app/
                </span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  className="flex-1 px-3 py-2.5 border border-border rounded-r-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:bg-muted/50 disabled:cursor-not-allowed"
                  required
                  disabled={!canEdit || saving}
                />
              </div>
            </div>
          </div>
          {canEdit && (
            <button
              type="submit"
              disabled={saving || (!name.trim() || !slug.trim())}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </form>
      </SectionCard>

      <SectionCard title="Danger Zone">
        <div className="space-y-4">
          {!isOwner && (
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Leave workspace</p>
                <p className="text-xs text-muted-foreground mt-0.5">You will lose access to all shared resources.</p>
              </div>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:bg-muted disabled:opacity-50 transition-all"
              >
                {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Leave
              </button>
            </div>
          )}
          {isOwner && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete workspace</p>
                <p className="text-xs text-muted-foreground mt-0.5">Permanently deletes all sources, documents, and embeddings.</p>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 disabled:opacity-50 transition-all"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Members ──────────────────────────────────────────────────────────────

function MembersTab({ onToast }: { onToast: (m: string, t: 'success' | 'error') => void }) {
  const { activeWorkspace, refetch: refetchWorkspace } = useWorkspace();
  const { data: session } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const userRole = (activeWorkspace as unknown as { role?: string })?.role;
  const isOwner = userRole === 'OWNER';
  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';

  const fetchAll = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [membRes, invRes] = await Promise.all([
        api.get<ApiResponse<Member[]>>(`/api/workspaces/${activeWorkspace.id}/members`),
        api.get<ApiResponse<Invitation[]>>(`/api/workspaces/${activeWorkspace.id}/invitations`),
      ]);
      if (membRes.data) setMembers(membRes.data);
      if (invRes.data) setInvitations(invRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await api.post<ApiResponse<Invitation>>(
        `/api/workspaces/${activeWorkspace.id}/invitations`,
        { email: inviteEmail.trim(), role: inviteRole },
      );
      if (res.error) throw new Error(res.error.message);
      setInviteEmail('');
      onToast(`Invitation sent to ${inviteEmail}`, 'success');
      await fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to send invitation', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (member: Member) => {
    if (!activeWorkspace || !session) return;
    const isSelf = member.user.id === session.user.id;
    if (!confirm(isSelf ? 'Leave this workspace?' : `Remove ${member.user.name}?`)) return;
    setRemovingId(member.user.id);
    try {
      await api.delete(`/api/workspaces/${activeWorkspace.id}/members/${member.user.id}`);
      onToast(isSelf ? 'You left the workspace' : `${member.user.name} removed`, 'success');
      await fetchAll();
      if (isSelf) await refetchWorkspace();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to remove member', 'error');
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (member: Member, newRole: 'ADMIN' | 'MEMBER') => {
    if (!activeWorkspace) return;
    try {
      const res = await api.patch<ApiResponse<unknown>>(
        `/api/workspaces/${activeWorkspace.id}/members/${member.user.id}/role`,
        { role: newRole },
      );
      if (res.error) throw new Error(res.error.message);
      onToast(`${member.user.name} is now ${newRole.toLowerCase()}`, 'success');
      await fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update role', 'error');
    }
  };

  const handleCancelInvite = async (invitation: Invitation) => {
    if (!activeWorkspace) return;
    setCancellingId(invitation.id);
    try {
      await api.delete(`/api/workspaces/${activeWorkspace.id}/invitations/${invitation.id}`);
      onToast('Invitation cancelled', 'success');
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to cancel invitation', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  if (!activeWorkspace) return null;

  return (
    <div className="space-y-6">
      {/* Invite form */}
      {canManage && (
        <SectionCard title="Invite Member" description="Send an email invitation to a new team member.">
          <form onSubmit={handleInvite} className="flex gap-3 flex-wrap">
            <input
              type="email"
              required
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 min-w-48 px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              disabled={inviting}
            />
            <div className="relative">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')}
                className="appearance-none pl-3 pr-8 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                disabled={inviting}
              >
                <option value="MEMBER">Member</option>
                {isOwner && <option value="ADMIN">Admin</option>}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        </SectionCard>
      )}

      {/* Members list */}
      <SectionCard title={`Members (${members.length})`}>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted" />
                <div className="flex-1">
                  <div className="h-3.5 w-32 bg-muted rounded mb-1.5" />
                  <div className="h-3 w-44 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {members.map((m) => {
              const isSelf = m.user.id === session?.user.id;
              const canRemove = canManage && !(m.role === 'OWNER') && (isOwner || isSelf);
              const canChangeRole = isOwner && !isSelf && m.role !== 'OWNER';

              return (
                <div key={m.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <Avatar name={m.user.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.user.name} {isSelf && <span className="text-muted-foreground font-normal">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canChangeRole ? (
                      <div className="relative">
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m, e.target.value as 'ADMIN' | 'MEMBER')}
                          className="appearance-none pl-2 pr-7 py-1 border border-border rounded-md bg-background text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Member</option>
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    ) : (
                      roleBadge(m.role)
                    )}
                    {canRemove && (
                      <button
                        onClick={() => handleRemove(m)}
                        disabled={removingId === m.user.id}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                        title={isSelf ? 'Leave workspace' : 'Remove member'}
                      >
                        {removingId === m.user.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : isSelf ? <LogOut className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <SectionCard title={`Pending Invitations (${invitations.length})`} description="These people have been invited but haven't accepted yet.">
          <div className="space-y-1">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <UserCog className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {roleBadge(inv.role)}
                  {canManage && (
                    <button
                      onClick={() => handleCancelInvite(inv)}
                      disabled={cancellingId === inv.id}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                      title="Cancel invitation"
                    >
                      {cancellingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'members', label: 'Members', icon: Users },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile, workspace, and team.</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 w-72">
          <Toast message={toast.message} type={toast.type} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'profile' && <ProfileTab onToast={showToast} />}
        {activeTab === 'workspace' && <WorkspaceTab onToast={showToast} />}
        {activeTab === 'members' && <MembersTab onToast={showToast} />}
      </div>
    </div>
  );
}
