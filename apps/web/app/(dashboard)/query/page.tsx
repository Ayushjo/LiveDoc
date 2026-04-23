'use client';

import { QueryInterface } from '@/components/query-interface';

export default function QueryPage() {
  return (
    <div className="h-full flex flex-col items-center animate-fade-in-up">
      <div className="w-full max-w-3xl flex flex-col h-full">
        <div className="text-center mb-8 shrink-0">
          <h1 className="text-3xl font-bold tracking-tight">Query Room</h1>
          <p className="text-muted-foreground mt-1">
            Ask questions across all your integrated data sources in real time.
          </p>
        </div>
        
        <div className="flex-1 bg-card border border-border shadow-sm rounded-xl overflow-hidden flex flex-col">
          <QueryInterface />
        </div>
      </div>
    </div>
  );
}
