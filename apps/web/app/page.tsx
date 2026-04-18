'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Star,
  Database,
  RefreshCw,
  MessageSquareText,
  Zap,
  CheckCircle2,
} from 'lucide-react';

const TABS = [
  { id: 'connect', label: 'Connect Tools', icon: Database },
  { id: 'sync', label: 'Live Sync', icon: RefreshCw },
  { id: 'query', label: 'RAG Queries', icon: MessageSquareText },
  { id: 'insights', label: 'AI Insights', icon: Zap },
];

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<string>('connect');

  useEffect(() => {
    const cycleTabs = setInterval(() => {
      setActiveTab((current) => {
        const currentIndex = TABS.findIndex((t) => t.id === current);
        const nextIndex = (currentIndex + 1) % TABS.length;
        return TABS[nextIndex].id;
      });
    }, 4000);
    return () => clearInterval(cycleTabs);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav
        className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto animate-fade-in-up"
        style={{ animationDelay: '0.1s', opacity: 0 }}
      >
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 fill-foreground text-foreground" />
          <span className="text-lg font-semibold tracking-tight">LiveDoc</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8">
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group">
            Solutions <ChevronDown className="w-4 h-4 group-hover:rotate-180 transition-transform" />
          </button>
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group">
            For Teams <ChevronDown className="w-4 h-4 group-hover:rotate-180 transition-transform" />
          </button>
          <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            About Us
          </Link>
          <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Learn Hub
          </Link>
        </div>

        <div className="flex items-center gap-4 border-l border-border pl-6">
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-foreground text-background px-5 py-2.5 rounded-full text-sm font-medium hover:bg-foreground/90 transition-colors shadow-sm"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="px-6 pt-24 pb-32 max-w-7xl mx-auto text-center">
        <div
          className="inline-flex items-center gap-2 mb-8 animate-fade-in-up"
          style={{ animationDelay: '0.2s', opacity: 0 }}
        >
          <div className="w-6 h-6 border border-border shadow-sm rounded flex items-center justify-center bg-card">
            <Star className="w-3.5 h-3.5 fill-foreground" />
          </div>
          <span className="text-sm font-medium">4.9 rating from cutting-edge teams</span>
        </div>

        <h1
          className="text-6xl md:text-7xl lg:text-[80px] font-normal leading-[1.1] tracking-tight mb-5 animate-fade-in-up"
          style={{ animationDelay: '0.3s', opacity: 0 }}
        >
          Work Smarter. Move Faster.<br />
          <span className="bg-gradient-to-r from-foreground via-muted-foreground to-border bg-clip-text text-transparent font-medium">
            LiveDoc Powers You Up.
          </span>
        </h1>

        <p
          className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in-up"
          style={{ animationDelay: '0.4s', opacity: 0 }}
        >
          Intelligent real-time RAG syncs with Notion, GitHub, Linear, and Drive to streamline your knowledge, boost output, and save hours.
        </p>

        <div
          className="animate-fade-in-up mb-16"
          style={{ animationDelay: '0.5s', opacity: 0 }}
        >
          <Link
            href="/signup"
            className="inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-3 rounded-full text-base font-medium shadow-xl hover:bg-primary/90 transition-colors ring-1 ring-primary/20 hover:ring-primary/40"
          >
            Begin Free Trial
          </Link>
        </div>

        {/* Tab Bar */}
        <div
          className="flex justify-center animate-fade-in-up mb-12"
          style={{ animationDelay: '0.6s', opacity: 0 }}
        >
          <div className="bg-muted rounded-xl p-1 inline-flex w-full md:w-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1 w-full relative">
              {TABS.map((tab, idx) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <div key={tab.id} className="relative flex items-center">
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 z-10 ${
                        isActive
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border shadow-black/5'
                          : 'text-muted-foreground hover:text-foreground hover:bg-black/5'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                      {tab.label}
                    </button>
                    {idx < TABS.length - 1 && (
                      <div className="hidden md:block w-px h-5 bg-border absolute right-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Video & Overlays Section */}
        <div
          className="relative rounded-[2rem] overflow-hidden h-[400px] md:h-[600px] shadow-2xl ring-1 ring-border animate-fade-in-up bg-card flex items-center justify-center"
          style={{ animationDelay: '0.7s', opacity: 0 }}
        >
          <video
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_165750_358b1e72-c921-48b7-aaac-f200994f32fb.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Connect Sources Overlay */}
          {activeTab === 'connect' && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in-overlay flex items-center justify-center">
              <div className="bg-background/95 backdrop-blur shadow-2xl rounded-2xl w-[90%] max-w-sm p-6 border border-white/10 animate-slide-up-overlay absolute top-1/2 left-1/2">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-500" /> Connect Data Sources
                </h3>
                <div className="space-y-4">
                  {['Notion', 'GitHub', 'Linear', 'Google Drive'].map((tool, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                      <span className="font-medium">{tool}</span>
                      <CheckCircle2 className={`w-5 h-5 ${i < 2 ? 'text-green-500' : 'text-muted-foreground/30'}`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sync Overlay */}
          {activeTab === 'sync' && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in-overlay flex items-center justify-center">
              <div className="bg-background/95 backdrop-blur shadow-2xl rounded-2xl w-[90%] max-w-sm p-6 border border-white/10 animate-slide-up-overlay absolute top-1/2 left-1/2">
                 <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-orange-500" /> Vector Indexing
                </h3>
                <div className="mb-2 flex justify-between text-sm font-medium">
                  <span>Delta Patching...</span>
                  <span className="text-orange-600">67%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-6">
                  <div className="h-full bg-orange-500 w-[67%] transition-all duration-1000" />
                </div>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Fetched 5.4K pages</li>
                  <li className="flex items-center gap-2 animate-pulse"><RefreshCw className="w-4 h-4 text-orange-400" /> Embedding 12,042 chunks</li>
                </ul>
              </div>
            </div>
          )}

          {/* Query Overlay */}
          {activeTab === 'query' && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in-overlay flex items-center justify-center">
               <div className="bg-background/95 backdrop-blur shadow-2xl rounded-2xl w-[90%] max-w-md p-6 border border-white/10 animate-slide-up-overlay absolute top-1/2 left-1/2">
                 <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-border pb-3">
                  <MessageSquareText className="w-5 h-5 text-green-500" /> Real-time Query Room
                </h3>
                <div className="space-y-4">
                  <div className="bg-muted p-3 rounded-lg rounded-tl-none inline-block max-w-[85%] text-sm">
                    How is the new embedding engine integrated?
                  </div>
                  <div className="bg-primary/5 border border-primary/20 text-foreground p-3 rounded-lg rounded-tr-none ml-auto text-sm">
                    Based on Notion and GitHub:<br/><br/>
                    The embedding engine uses pgvector directly to store `text-embedding-3-small` outputs...
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Insights Overlay */}
          {activeTab === 'insights' && (
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in-overlay flex items-center justify-center">
              <div className="bg-background/95 backdrop-blur shadow-2xl rounded-2xl w-[90%] max-w-sm p-6 border border-white/10 animate-slide-up-overlay absolute top-1/2 left-1/2">
                 <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-500" /> Reciprocal Rank Fusion
                </h3>
                 <div className="space-y-3">
                  {[
                    { label: 'Sparse BM25 Index', value: 'Ready' },
                    { label: 'Dense Vectors', value: 'Ready' },
                    { label: 'Neo4j Knowledge Graph', value: 'Syncing...' }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded bg-muted text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-semibold">{item.value}</span>
                    </div>
                  ))}
                  <button className="w-full mt-4 bg-foreground text-background py-2 rounded-lg text-sm font-semibold">
                    View Network Graph
                  </button>
                </div>
              </div>
             </div>
          )}
        </div>

        {/* Brand Logos */}
        <div
          className="mt-24 pt-12 border-t border-border animate-fade-in-up"
          style={{ animationDelay: '0.8s', opacity: 0 }}
        >
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-8">Trusted by data-driven teams</p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale">
             <span className="text-xl font-bold tracking-tighter">INTERSCOPE</span>
             <span className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-black">SPOTIFY</span>
             <span className="text-xl font-bold flex items-center gap-1"><Zap className="w-5 h-5" /> Nexera</span>
             <span className="text-xl font-serif italic font-bold">M3</span>
             <span className="text-lg font-bold border-2 border-black rounded-full px-2 py-0.5">LC</span>
             <span className="text-xl font-medium tracking-wide">vertex</span>
          </div>
        </div>
      </main>
    </div>
  );
}
