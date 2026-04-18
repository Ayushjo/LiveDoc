import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

/**
 * Shared OpenAI client singleton.
 * Import from here everywhere — avoids duplicate instances and env checks.
 */
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const;
export const EMBEDDING_DIMS = 1536 as const;
export const CHAT_MODEL = 'gpt-4o' as const;
