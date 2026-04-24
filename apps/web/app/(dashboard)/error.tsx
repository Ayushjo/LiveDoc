'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center animate-fade-in-up">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>

      <div className="space-y-2 max-w-xs">
        <h2 className="text-xl font-bold tracking-tight">Something went wrong</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {error.message || 'An unexpected error occurred. Please try again or contact support.'}
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted-foreground font-mono bg-muted px-3 py-1.5 rounded-md border border-border mt-3 inline-block">
            ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold bg-foreground text-primary-foreground hover:bg-foreground/90 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
