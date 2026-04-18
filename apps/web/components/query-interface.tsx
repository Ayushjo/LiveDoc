'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { CitationBlock } from './citation-block';
import type { Citation } from '@livedoc/types';
import { useSession } from '@/lib/auth-client';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
};

export function QueryInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    
    // Create an initial empty assistant message to stream into
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', isStreaming: true }
    ]);

    try {
      // Simulate real-time streaming response from RAG API
      const mockAnswer = "Based on the synced documents, the system uses `text-embedding-3-small` in combination with pgvector for precise vector search across your data. It also leverages Reciprocal Rank Fusion (RRF) to merge BM25 scores.";
      const mockCitations: Citation[] = [
        {
          chunkId: 'chk_1',
          documentId: 'doc_1',
          documentTitle: 'LiveDoc Architecture Spec',
          documentUrl: 'https://notion.so/livedoc-arch',
          content: 'We use pgvector with text-embedding-3-small for low latency vector lookups.',
          headingPath: ['Phase 1', 'Vector Database'],
          similarity: 0.92
        }
      ];

      // Simulate streaming chunks
      const words = mockAnswer.split(' ');
      let streamedResponse = '';
      
      for (let i = 0; i < words.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        streamedResponse += (i === 0 ? '' : ' ') + words[i];
        
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === assistantId ? { ...msg, content: streamedResponse } : msg
          )
        );
      }

      // Finalize message with citations
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === assistantId ? { ...msg, content: streamedResponse, isStreaming: false, citations: mockCitations } : msg
        )
      );

    } catch (err) {
      console.error(err);
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === assistantId ? { ...msg, content: 'Sorry, I encountered an error. Please try again.', isStreaming: false } : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
             <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
               <Bot className="w-8 h-8 text-foreground" />
             </div>
             <p className="text-sm">Start asking questions. Answers will update live.</p>
           </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded shrink-0 bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}

              <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                 <div className={`p-4 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-foreground text-background rounded-tr-sm' 
                      : 'bg-muted/50 rounded-tl-sm border border-border'
                  }`}>
                    {msg.content}
                    {msg.isStreaming && <span className="ml-1 inline-block w-2 h-4 bg-foreground animate-pulse" />}
                 </div>

                 {/* Render Citations if Assistant has them */}
                 {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                   <div className="w-full mt-2 space-y-2">
                     <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">Sources</span>
                     <div className="flex flex-col gap-2">
                       {msg.citations.map((cite, i) => (
                         <CitationBlock key={i} citation={cite} index={i + 1} />
                       ))}
                     </div>
                   </div>
                 )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full shrink-0 bg-muted flex items-center justify-center text-xs font-bold font-mono">
                  {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card">
        <form 
          onSubmit={handleSubmit}
          className="relative flex items-center"
        >
          <input
            type="text"
            placeholder="Ask about your synced documents..."
            className="w-full pl-4 pr-12 py-3.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm shadow-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
          </button>
        </form>
        <p className="text-center text-[10px] text-muted-foreground mt-2">
          LiveDoc AI can make mistakes. Consider verifying important information.
        </p>
      </div>
    </div>
  );
}
