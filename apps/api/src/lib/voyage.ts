/**
 * Voyage AI embedding helper — pure fetch, no npm SDK required.
 *
 * voyage-large-2 produces 1536-dimensional vectors, matching our
 * pgvector(1536) schema exactly. No DB migration needed.
 *
 * Free tier: 50M tokens / month — more than enough for development.
 */

if (!process.env.VOYAGE_API_KEY) {
  throw new Error('VOYAGE_API_KEY environment variable is not set');
}

export const EMBEDDING_MODEL = 'voyage-large-2' as const;
export const EMBEDDING_DIMS  = 1536 as const;

interface VoyageResponse {
  object: 'list';
  data: Array<{ object: 'embedding'; embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Embeds one or more text strings using Voyage AI.
 *
 * @param inputs    Strings to embed (max 128 per call for voyage-large-2)
 * @param inputType 'document' when storing chunks; 'query' when embedding a search query.
 *                  Voyage uses asymmetric embedding — using the right type improves recall.
 */
export async function embedTexts(
  inputs: string[],
  inputType: 'document' | 'query' = 'document',
): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs, input_type: inputType }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Voyage AI embeddings failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as VoyageResponse;

  // Return in input order (Voyage guarantees index ordering)
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
