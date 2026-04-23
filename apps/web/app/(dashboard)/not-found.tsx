import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <FileQuestion className="w-7 h-7 text-muted-foreground" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-bold">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-all"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
