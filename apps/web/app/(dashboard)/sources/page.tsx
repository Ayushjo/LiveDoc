'use client';

import { useState } from 'react';
import { SourceCard } from '@/components/source-card';
import { Database, Plus } from 'lucide-react';
import type { Source, SourceType, SyncStatus } from '@livedoc/types';

// Mock connected sources
const MOCK_SOURCES: Source[] = [
  {
    id: 'src_1',
    workspaceId: 'ws_1',
    type: 'NOTION',
    name: 'Notion Workspace (Engineering)',
    metadata: {},
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 5), // 5 mins ago
    syncStatus: 'IDLE',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: 'src_2',
    workspaceId: 'ws_1',
    type: 'GITHUB',
    name: 'github.com/livedoc/livedoc',
    metadata: {},
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    syncStatus: 'SYNCING',
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>(MOCK_SOURCES);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectNotion = async () => {
    setIsConnecting(true);
    // Real implementation would redirect to Notion OAuth URL provided by API
    // e.g., const res = await api.get('/sources/notion/oauth-url');
    // window.location.href = res.url;
    
    // For fast simulation
    setTimeout(() => {
      alert('Redirecting to Notion OAuth flow... (Simulated)');
      setIsConnecting(false);
    }, 1000);
  };

  return (
    <div className="space-y-8 animate-fade-in-up" style={{ opacity: 0 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
          <p className="text-muted-foreground mt-1">
            Manage your connected tools and sync settings.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Add New Source</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={handleConnectNotion}
            disabled={isConnecting}
            className="flex flex-col items-center justify-center p-6 border border-border rounded-xl bg-card hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
               <Database className="w-6 h-6 text-primary" />
            </div>
            <span className="font-medium text-sm">Connect Notion</span>
          </button>

          <button disabled className="flex flex-col items-center justify-center p-6 border border-border border-dashed rounded-xl opacity-50 cursor-not-allowed">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
               <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">GitHub (Coming Soon)</span>
          </button>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-border">
        <h2 className="text-xl font-semibold">Connected Sources</h2>
        {sources.length === 0 ? (
          <div className="p-8 text-center border border-border rounded-xl bg-card">
            <p className="text-muted-foreground">No sources connected yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sources.map(source => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
