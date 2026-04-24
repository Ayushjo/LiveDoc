/**
 * Anthropic / Claude client singleton.
 * Only imported by query.service.ts — keep embed paths Claude-free
 * so the sync + embed pipeline works without @anthropic-ai/sdk installed.
 */
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is not set');
}

/** Shared Anthropic client. Import this everywhere you need Claude. */
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Model used for streaming RAG answers. */
export const CLAUDE_MODEL = 'claude-3-5-haiku-20241022' as const;

// Re-export Voyage helpers so existing imports of lib/ai still work
export { embedTexts, EMBEDDING_MODEL, EMBEDDING_DIMS } from './voyage';
