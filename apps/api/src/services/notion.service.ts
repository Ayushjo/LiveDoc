import { createHash } from 'crypto';

// ─── Notion API constants ─────────────────────────────────────────────────────

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_BLOCK_DEPTH = 5; // prevent runaway recursion on deeply nested pages

// ─── Notion API types ─────────────────────────────────────────────────────────

interface NotionRichText {
  plain_text: string;
}

interface NotionListResponse<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  created_time: string;
  properties: Record<
    string,
    { type: string; title?: NotionRichText[] }
  >;
}

type NotionBlock = {
  id: string;
  type: string;
  has_children: boolean;
  paragraph?: { rich_text: NotionRichText[] };
  heading_1?: { rich_text: NotionRichText[] };
  heading_2?: { rich_text: NotionRichText[] };
  heading_3?: { rich_text: NotionRichText[] };
  bulleted_list_item?: { rich_text: NotionRichText[] };
  numbered_list_item?: { rich_text: NotionRichText[] };
  to_do?: { rich_text: NotionRichText[]; checked: boolean };
  toggle?: { rich_text: NotionRichText[] };
  quote?: { rich_text: NotionRichText[] };
  callout?: { rich_text: NotionRichText[]; icon?: unknown };
  code?: { rich_text: NotionRichText[]; language: string };
  child_page?: { title: string };
  table?: { has_column_header: boolean };
  table_row?: { cells: NotionRichText[][] };
};

export interface NotionOAuthToken {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string | null;
  botId: string;
  tokenType: string;
}

export interface NotionPageSummary {
  id: string;
  title: string;
  url: string;
  lastEditedAt: Date;
}

/** A single semantic unit returned from content extraction */
export interface ContentBlock {
  type: 'h1' | 'h2' | 'h3' | 'text';
  text: string;
}

export interface NotionPageContent {
  id: string;
  title: string;
  url: string;
  lastEditedAt: Date;
  /** Structured blocks — consumed directly by chunker.service.ts */
  blocks: ContentBlock[];
  /** Flat plaintext — used for SHA-256 contentHash */
  rawText: string;
  /** SHA-256 of rawText */
  contentHash: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function notionHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notionFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...notionHeaders(accessToken),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; code?: string };
    throw new Error(
      `Notion API error ${res.status}: ${body.message ?? res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

/** Paginates a Notion list endpoint, yielding all results across pages. */
async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<NotionListResponse<T>>,
): AsyncGenerator<T> {
  let cursor: string | undefined;

  do {
    const page = await fetchPage(cursor);
    yield* page.results;
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);
}

/** Extracts plain text from a Notion rich_text array. */
function richTextToString(rt: NotionRichText[] | undefined): string {
  return (rt ?? []).map((r) => r.plain_text).join('');
}

/** Extracts the page title from the page's properties. */
function extractTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title' && prop.title?.length) {
      return richTextToString(prop.title);
    }
  }
  return 'Untitled';
}

/**
 * Recursively fetches all child blocks for a given block / page ID.
 * Stops at MAX_BLOCK_DEPTH to prevent infinite recursion on pathological pages.
 */
async function fetchBlocksRecursive(
  accessToken: string,
  blockId: string,
  depth: number,
): Promise<NotionBlock[]> {
  if (depth > MAX_BLOCK_DEPTH) return [];

  const blocks: NotionBlock[] = [];

  const gen = paginate<NotionBlock>((cursor) => {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);

    return notionFetch<NotionListResponse<NotionBlock>>(
      url.toString(),
      accessToken,
    );
  });

  for await (const block of gen) {
    blocks.push(block);

    // Recurse into blocks that have children (toggles, list items, etc.)
    if (block.has_children) {
      const children = await fetchBlocksRecursive(
        accessToken,
        block.id,
        depth + 1,
      );
      blocks.push(...children);
    }
  }

  return blocks;
}

/**
 * Converts a flat Notion block list into semantic ContentBlock[].
 * Handles: headings, paragraphs, lists, todos, quotes, callouts, code, tables.
 * Ignores: dividers, images, embeds, unsupported types.
 */
function extractContentBlocks(blocks: NotionBlock[]): ContentBlock[] {
  const result: ContentBlock[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading_1': {
        const text = richTextToString(block.heading_1?.rich_text);
        if (text) result.push({ type: 'h1', text });
        break;
      }
      case 'heading_2': {
        const text = richTextToString(block.heading_2?.rich_text);
        if (text) result.push({ type: 'h2', text });
        break;
      }
      case 'heading_3': {
        const text = richTextToString(block.heading_3?.rich_text);
        if (text) result.push({ type: 'h3', text });
        break;
      }
      case 'paragraph': {
        const text = richTextToString(block.paragraph?.rich_text);
        if (text) result.push({ type: 'text', text });
        break;
      }
      case 'bulleted_list_item': {
        const text = richTextToString(block.bulleted_list_item?.rich_text);
        if (text) result.push({ type: 'text', text: `• ${text}` });
        break;
      }
      case 'numbered_list_item': {
        const text = richTextToString(block.numbered_list_item?.rich_text);
        if (text) result.push({ type: 'text', text });
        break;
      }
      case 'to_do': {
        const text = richTextToString(block.to_do?.rich_text);
        const checked = block.to_do?.checked ? '[x]' : '[ ]';
        if (text) result.push({ type: 'text', text: `${checked} ${text}` });
        break;
      }
      case 'toggle': {
        const text = richTextToString(block.toggle?.rich_text);
        if (text) result.push({ type: 'text', text });
        break;
      }
      case 'quote': {
        const text = richTextToString(block.quote?.rich_text);
        if (text) result.push({ type: 'text', text });
        break;
      }
      case 'callout': {
        const text = richTextToString(block.callout?.rich_text);
        if (text) result.push({ type: 'text', text });
        break;
      }
      case 'code': {
        const text = richTextToString(block.code?.rich_text);
        const lang = block.code?.language ?? '';
        if (text) result.push({ type: 'text', text: `\`\`\`${lang}\n${text}\n\`\`\`` });
        break;
      }
      case 'child_page': {
        // Reference to a sub-page — include its title as a text node for context
        const title = block.child_page?.title;
        if (title) result.push({ type: 'text', text: `Sub-page: ${title}` });
        break;
      }
      case 'table_row': {
        const cells = (block.table_row?.cells ?? [])
          .map((cell) => richTextToString(cell))
          .join(' | ');
        if (cells) result.push({ type: 'text', text: cells });
        break;
      }
      // divider, image, video, file, embed, bookmark, unsupported → skip
      default:
        break;
    }
  }

  return result;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const notionService = {
  /**
   * Builds the Notion OAuth authorization URL.
   * The caller is responsible for generating and storing the state nonce.
   */
  buildOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.NOTION_CLIENT_ID!,
      response_type: 'code',
      owner: 'user',
      redirect_uri: process.env.NOTION_REDIRECT_URI!,
      state,
    });
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  },

  /**
   * Exchanges an OAuth authorization code for an access token.
   * Notion tokens do not expire and have no refresh token.
   */
  async exchangeOAuthCode(code: string): Promise<NotionOAuthToken> {
    const credentials = Buffer.from(
      `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`,
    ).toString('base64');

    const res = await fetch(`${NOTION_API}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; error_description?: string };
      throw new Error(
        `Notion OAuth error: ${body.error_description ?? body.error ?? res.statusText}`,
      );
    }

    const data = await res.json() as {
      access_token: string;
      workspace_id: string;
      workspace_name: string;
      workspace_icon: string | null;
      bot_id: string;
      token_type: string;
    };

    return {
      accessToken: data.access_token,
      workspaceId: data.workspace_id,
      workspaceName: data.workspace_name,
      workspaceIcon: data.workspace_icon,
      botId: data.bot_id,
      tokenType: data.token_type,
    };
  },

  /**
   * Returns all pages the integration has access to, across all pagination cursors.
   */
  async listAllPages(accessToken: string): Promise<NotionPageSummary[]> {
    const pages: NotionPageSummary[] = [];

    const gen = paginate<NotionPage>((cursor) =>
      notionFetch<NotionListResponse<NotionPage>>(
        `${NOTION_API}/search`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            filter: { property: 'object', value: 'page' },
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {}),
          }),
        },
      ),
    );

    for await (const page of gen) {
      pages.push({
        id: page.id,
        title: extractTitle(page),
        url: page.url,
        lastEditedAt: new Date(page.last_edited_time),
      });
    }

    return pages;
  },

  /**
   * Fetches a single page's metadata (title, url, lastEditedAt).
   * Used during delta sync to check last_edited_time before fetching full content.
   */
  async getPage(accessToken: string, pageId: string): Promise<NotionPageSummary> {
    const page = await notionFetch<NotionPage>(
      `${NOTION_API}/pages/${pageId}`,
      accessToken,
    );

    return {
      id: page.id,
      title: extractTitle(page),
      url: page.url,
      lastEditedAt: new Date(page.last_edited_time),
    };
  },

  /**
   * Fetches the full content of a Notion page.
   * Recursively fetches all child blocks, extracts structured ContentBlocks,
   * computes the raw text and SHA-256 contentHash.
   */
  async getPageContent(
    accessToken: string,
    pageId: string,
  ): Promise<NotionPageContent> {
    // Fetch page metadata + all blocks in parallel
    const [page, blocks] = await Promise.all([
      notionFetch<NotionPage>(`${NOTION_API}/pages/${pageId}`, accessToken),
      fetchBlocksRecursive(accessToken, pageId, 0),
    ]);

    const title = extractTitle(page);
    const contentBlocks = extractContentBlocks(blocks);
    const rawText = contentBlocks.map((b) => b.text).join('\n');
    const contentHash = createHash('sha256').update(rawText).digest('hex');

    return {
      id: page.id,
      title,
      url: page.url,
      lastEditedAt: new Date(page.last_edited_time),
      blocks: contentBlocks,
      rawText,
      contentHash,
    };
  },
};
