'use client';

import { useState, useEffect, Suspense } from 'react';
import { resetPassword } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Star, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token. Please request a new link.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: resetError } = await resetPassword({ newPassword: password, token: token! });
      if (resetError) {
        setError(resetError.message ?? 'Reset failed. Your link may have expired.');
      } else {
        setDone(true);
        setTimeout(() => router.push('/login'), 3000);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Star className="w-6 h-6 fill-foreground text-foreground" />
          <span className="font-semibold text-xl tracking-tight">LiveDoc</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm space-y-6">
          {done ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Password updated</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your password has been reset. Redirecting you to sign in…
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a strong password with at least 8 characters.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-destructive/10 text-destructive p-3 rounded-lg text-sm border border-destructive/20">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="Min 8 characters"
                      className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading || !token}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Confirm password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    placeholder="Repeat your password"
                    className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={loading || !token}
                  />
                </div>

                {password && confirm && password !== confirm && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !token || !password || !confirm}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-background bg-foreground hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>

              <Link
                href="/login"
                className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
