'use client';

import { FileText, Database, Activity, GitCommit } from 'lucide-react';

export default function DashboardOverviewPage() {
  const STATS = [
    { label: 'Total Documents', value: '1,248', icon: FileText, change: '+12% from last week' },
    { label: 'Active Sources', value: '3', icon: Database, change: 'Notion, GitHub, Drive' },
    { label: 'Vector Chunks', value: '14,092', icon: GitCommit, change: 'pgvector 1536 dims' },
    { label: 'Queries Run', value: '254', icon: Activity, change: '+3% this month' },
  ];

  return (
    <div className="space-y-8 animate-fade-in-up" style={{ opacity: 0 }}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">
          Welcome to your LiveDoc workspace. Here is a summary of your synced data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-card p-6 rounded-xl border border-border shadow-sm">
              <div className="flex flex-row items-center justify-between pb-2">
                <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{stat.label}</h3>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-semibold">Recent Sync Activity</h3>
        </div>
        <div className="divide-y divide-border">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium">Notion Engineering Docs</span>
            </div>
            <span className="text-sm text-muted-foreground">Synced 2 mins ago</span>
          </div>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium">GitHub / livedoc-monorepo</span>
            </div>
            <span className="text-sm text-muted-foreground">Synced 45 mins ago</span>
          </div>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium">Google Drive (Marketing)</span>
            </div>
            <span className="text-sm text-muted-foreground">Syncing vectors... (67%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
