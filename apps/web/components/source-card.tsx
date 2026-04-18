import { RefreshCw, Database, AlertCircle, Settings, CheckCircle2 } from 'lucide-react';
import type { Source } from '@livedoc/types';

interface SourceCardProps {
  source: Source;
}

export function SourceCard({ source }: SourceCardProps) {
  const isSyncing = source.syncStatus === 'SYNCING';
  const hasError = source.syncStatus === 'ERROR';

  return (
    <div className="p-5 border border-border rounded-xl bg-card shadow-sm flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
            <Database className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              {source.name}
              {hasError && <AlertCircle className="w-4 h-4 text-destructive" />}
            </h3>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">
              {source.type.toLowerCase().replace('_', ' ')}
            </p>
          </div>
        </div>
        <button className="p-2 text-muted-foreground hover:bg-muted rounded-md transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex flex-col">
           <span className="text-xs text-muted-foreground mb-1">Status</span>
           <div className="flex items-center gap-1.5">
             {isSyncing ? (
               <>
                 <RefreshCw className="w-3.5 h-3.5 text-orange-500 animate-spin" />
                 <span className="text-xs font-medium text-orange-500">Syncing...</span>
               </>
             ) : hasError ? (
               <>
                 <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                 <span className="text-xs font-medium text-destructive">Sync Failed</span>
               </>
             ) : (
               <>
                 <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                 <span className="text-xs font-medium text-green-500">Idle (Synced)</span>
               </>
             )}
           </div>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground mb-1">Last Synced</span>
          <span className="text-xs font-medium">
            {source.lastSyncedAt 
              ? new Date(source.lastSyncedAt).toLocaleString(undefined, { 
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                }) 
              : 'Never'}
          </span>
        </div>
      </div>
    </div>
  );
}
