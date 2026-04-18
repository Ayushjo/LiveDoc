import type { Citation } from '@livedoc/types';
import { ExternalLink, ChevronRight, FileText } from 'lucide-react';

interface CitationBlockProps {
  citation: Citation;
  index: number;
}

export function CitationBlock({ citation, index }: CitationBlockProps) {
  return (
    <div className="p-3 bg-background border border-border rounded-lg shadow-sm hover:border-primary/30 transition-colors w-full text-left">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 max-w-[80%]">
          <div className="shrink-0 w-5 h-5 flex items-center justify-center bg-muted rounded-full text-[10px] font-bold text-foreground">
            {index}
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium truncate">
            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{citation.documentTitle}</span>
          </div>
        </div>
        
        <a 
          href={citation.documentUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          title="Open Source Document"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {citation.headingPath && citation.headingPath.length > 0 && (
        <div className="flex items-center flex-wrap gap-1 mb-2 px-1">
          {citation.headingPath.map((heading, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md border border-border">
                {heading}
              </span>
              {i < citation.headingPath.length - 1 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/50 line-clamp-2 italic">
        "{citation.content}"
      </p>
    </div>
  );
}
