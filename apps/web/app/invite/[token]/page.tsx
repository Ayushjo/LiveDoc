'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import Link from 'next/link';
import { Star, Loader2, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@livedoc/types';

interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  workspaceId: string;
  workspaceName: string;
  expiresAt: string;
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Fetch invitation details (public — works without auth)
  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<ApiResponse<InvitationDetails>>(`/api/invitations/${token}`);
        if (res.error) throw new Error(res.error.message);
        setInvitation(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid or expired invitation.');
      } finally {
        setLoadingInvite(false);
      }
    }
    load();
  }, [token]);

  const handleAccept = async () => {
    if (!session) return;
    setAccepting(true);
    setError('');
    try {
      const res = await api.post<ApiResponse<{ workspaceId: string; workspaceName: string }>>(
        `/api/invitations/${token}/accept`,
        {},
      );
      if (res.error) throw new Error(res.error.message);
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation.');
      setAccepting(false);
    }
  };

  // Loading states
  if (loadingInvite || isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Star className="w-6 h-6 fill-foreground text-foreground" />
          <span className="font-semibold text-xl tracking-tight">LiveDoc</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm space-y-6">
          {/* Error state */}
          {error && !done && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Invitation unavailable</h1>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              </div>
              <Link href="/dashboard" className="text-sm font-medium text-foreground hover:underline">
                Go to Dashboard
              </Link>
            </div>
          )}

          {/* Success state */}
          {done && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold">You&apos;re in!</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Welcome to <strong>{invitation?.workspaceName}</strong>. Redirecting…
                </p>
              </div>
            </div>
          )}

          {/* Main invite view */}
          {invitation && !done && !error && (
            <>
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">You&apos;re invited</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Join <strong>{invitation.workspaceName}</strong> as a{' '}
                    <strong>{invitation.role.toLowerCase()}</strong> on LiveDoc.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Invite sent to {invitation.email}
                  </p>
                </div>
              </div>

              {/* Logged in — show accept button */}
              {session ? (
                <>
                  {session.user.email.toLowerCase() !== invitation.email.toLowerCase() && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                      You&apos;re signed in as <strong>{session.user.email}</strong>, but this invite was sent to <strong>{invitation.email}</strong>. Sign in with the correct account to accept.
                    </div>
                  )}

                  <button
                    onClick={handleAccept}
                    disabled={accepting || session.user.email.toLowerCase() !== invitation.email.toLowerCase()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-background bg-foreground hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {accepting ? 'Joining…' : `Join ${invitation.workspaceName}`}
                  </button>

                  <p className="text-center text-xs text-muted-foreground">
                    Not you?{' '}
                    <Link href="/login" className="underline text-foreground">
                      Sign in with a different account
                    </Link>
                  </p>
                </>
              ) : (
                /* Not logged in — prompt to sign up / log in */
                <div className="space-y-3">
                  <Link
                    href={`/signup?invite=${token}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-background bg-foreground hover:bg-foreground/90 transition-all"
                  >
                    Create account & join
                  </Link>
                  <Link
                    href={`/login?invite=${token}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-all"
                  >
                    Sign in to accept
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
