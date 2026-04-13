// Phase 1 — renders a single citation: document title, heading path, content excerpt, link.
// TODO: implement when instructed.
import type { Citation } from '@livedoc/types';

interface CitationBlockProps {
  citation: Citation;
  index: number;
}

export function CitationBlock({ citation: _citation, index: _index }: CitationBlockProps) {
  return <div />;
}
