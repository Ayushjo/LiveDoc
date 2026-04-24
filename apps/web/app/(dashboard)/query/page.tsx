'use client';

import { QueryInterface } from '@/components/query-interface';

export default function QueryPage() {
  return (
    <div className="flex flex-col h-full animate-fade-in-up">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Query Room</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions across all your connected sources in real time.
        </p>
      </div>
      <div className="flex-1 bg-card border border-border shadow-card rounded-xl overflow-hidden flex flex-col min-h-0">
        <QueryInterface />
      </div>
    </div>
  );
}
