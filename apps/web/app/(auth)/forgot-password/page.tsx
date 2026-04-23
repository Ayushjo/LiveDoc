'use client';

import { useState } from 'react';
import { forgetPassword } from '@/lib/auth-client';
import Link from 'next/link';
import { Star, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await forgetPassword({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
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
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Check your email</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We sent a password reset link to <strong>{email}</strong>. The link expires in 1 hour.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Forgot password?</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your email and we&apos;ll send a reset link.
                </p>
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm border border-destructive/20">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-background bg-foreground hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
