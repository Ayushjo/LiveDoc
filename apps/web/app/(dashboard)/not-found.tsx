import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      {/* Large 404 text */}
      <div className="relative">
        <p className="text-[120px] font-black leading-none text-muted/60 select-none tracking-tighter">
          404
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center shadow-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-muted-foreground">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="space-y-2 max-w-xs -mt-4">
        <h2 className="text-xl font-bold tracking-tight">Page not found</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold bg-foreground text-primary-foreground hover:bg-foreground/90 transition-all"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Dashboard
      </Link>
    </div>
  );
}
