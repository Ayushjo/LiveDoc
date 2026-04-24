'use client';

import { useState, Suspense } from 'react';
import { signIn } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';

// ─── Brand SVG logos ──────────────────────────────────────────────────────────

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.12" />
      <path
        d="M9 8h9.5a5.5 5.5 0 0 1 0 11H9V8Zm0 11h2v5H9v-5Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <circle cx="23" cy="22" r="3" fill="currentColor" fillOpacity="0.7" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ─── Left panel ───────────────────────────────────────────────────────────────

const FEATURES = [
  'Connect Notion, GitHub & more in minutes',
  'Ask questions across all your docs in real time',
  'AI answers stream with inline source citations',
  'Auto-sync schedules keep your knowledge fresh',
];

function AuthPanel() {
  return (
    <div className="hidden lg:flex w-[46%] bg-[#0b0f1a] relative overflow-hidden flex-col justify-between p-12 shrink-0">
      {/* Dot-grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }}
      />
      {/* Gradient fade at edges */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0f1a] via-transparent to-[#0b0f1a] opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f1a] via-transparent to-[#0b0f1a] opacity-40" />

      {/* Logo */}
      <div className="relative flex items-center gap-2.5">
        <LogoMark className="w-8 h-8 text-white" />
        <span className="text-white font-bold text-lg tracking-tight">LiveDoc</span>
      </div>

      {/* Tagline + features */}
      <div className="relative space-y-8">
        <div>
          <h2 className="text-[2rem] font-bold text-white leading-[1.2] tracking-tight">
            Your team's knowledge,<br />always at hand.
          </h2>
          <p className="mt-3 text-[#8b9ab3] text-sm leading-relaxed max-w-xs">
            Connect your tools, sync your docs, and get instant AI-powered answers — built for engineering teams.
          </p>
        </div>

        <ul className="space-y-3">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#4f87f0] shrink-0" />
              <span className="text-sm text-[#c4cfe4]">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Testimonial */}
      <div className="relative bg-white/[0.05] border border-white/10 rounded-xl p-5 backdrop-blur-sm">
        <p className="text-sm text-[#a0b3cc] italic leading-relaxed">
          &ldquo;The fastest way to make your documentation actually useful to the whole team.&rdquo;
        </p>
        <div className="flex items-center gap-2 mt-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">A</div>
          <span className="text-xs text-[#6b7f99]">Engineering teams everywhere</span>
        </div>
      </div>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function LoginForm() {
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      await signIn.social({
        provider: 'google',
        callbackURL: invite
          ? `${window.location.origin}/invite/${invite}`
          : `${window.location.origin}/dashboard`,
      });
    } catch {
      setError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error } = await signIn.email({
        email,
        password,
        callbackURL: invite
          ? `${window.location.origin}/invite/${invite}`
          : `${window.location.origin}/dashboard`,
      });
      if (error) {
        setError(error.message ?? 'Invalid email or password.');
        setLoading(false);
      }
    } catch {
      setError('Cannot reach the server. Make sure the API is running on port 3001.');
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-background overflow-y-auto">
      <div className="w-full max-w-[360px]">
        {/* Mobile logo */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <LogoMark className="w-7 h-7 text-foreground" />
          <span className="font-bold text-lg tracking-tight">LiveDoc</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {invite ? 'Sign in to accept your invitation' : 'Welcome back'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {invite ? 'You need an account to join this workspace.' : "Don't have an account?"}
            {!invite && (
              <Link href="/signup" className="ml-1 font-medium text-foreground hover:underline underline-offset-4">
                Sign up free
              </Link>
            )}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-destructive/8 border border-destructive/20 rounded-lg text-sm text-destructive">
            <span className="shrink-0 mt-px">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-2.5 h-10 px-4 border border-border rounded-lg text-sm font-medium bg-card hover:bg-muted/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-card"
        >
          {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </button>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-3 bg-background text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              or
            </span>
          </div>
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email address</label>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="w-full h-10 px-3 border border-border rounded-lg bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-foreground/30 transition-all shadow-card placeholder:text-muted-foreground/60"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">Password</label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full h-10 px-3 border border-border rounded-lg bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-foreground/30 transition-all shadow-card"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold text-primary-foreground bg-foreground hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-card"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {invite && (
          <p className="text-center text-sm text-muted-foreground mt-5">
            New to LiveDoc?{' '}
            <Link href={`/signup?invite=${invite}`} className="font-medium text-foreground hover:underline underline-offset-4">
              Create an account
            </Link>
          </p>
        )}

        <p className="text-center text-[11px] text-muted-foreground mt-8">
          By signing in, you agree to our{' '}
          <span className="underline cursor-pointer">Terms of Service</span> and{' '}
          <span className="underline cursor-pointer">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      <AuthPanel />
      <Suspense fallback={<div className="flex-1 bg-background animate-pulse" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
