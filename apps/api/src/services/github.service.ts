import { createHash } from 'crypto';
import type { ContentBlock } from './notion.service';

// ─── GitHub API constants ─────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';

// ─── GitHub API types ─────────────────────────────────────────────────────────

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  pushed_at: string;
  html_url: string;
  archived: boolean;
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTree {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeItem[];
}

interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  encoding: string;
  content: string; // base64 encoded
  html_url: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  pull_request?: unknown; // present if this is a PR
}

interface GitHubComment {
  id: number;
  body: string | null;
  user: { login: string } | null;
  created_at: string;
}

export interface GitHubOAuthToken {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export interface GitHubUserInfo {
  githubUserId: number;
  login: string;
  name: string | null;
}

export interface GitHubFileSummary {
  /** Path within the repository, e.g. "docs/setup.md" */
  path: string;
  /** Git blob SHA — used as a lightweight contentHash for delta detection */
  sha: string;
  /** Estimated size in bytes (0 if not available) */
  size: number;
  /** Full GitHub URL for the file */
  url: string;
  /** Owner login */
  owner: string;
  /** Repository name (without owner) */
  repo: string;
  /** Default branch */
  defaultBranch: string;
}

export interface GitHubFileDocument {
  /** Unique ID: "{owner}/{repo}/{path}" */
  id: string;
  title: string;
  url: string;
  /** Git blob SHA acts as contentHash */
  contentHash: string;
  lastEditedAt: Date;
  blocks: ContentBlock[];
  rawText: string;
}

export interface GitHubIssueSummary {
  id: string; // "{owner}/{repo}/issues/{number}"
  number: number;
  title: string;
  url: string;
  updatedAt: Date;
  owner: string;
  repo: string;
}

export interface GitHubIssueDocument {
  id: string;
  title: string;
  url: string;
  contentHash: string;
  lastEditedAt: Date;
  blocks: ContentBlock[];
  rawText: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...githubHeaders(accessToken),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 404) {
    throw new Error(`GitHub API 404: ${url}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(
      `GitHub API error ${res.status}: ${body.message ?? res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

/**
 * Paginates a GitHub list endpoint (Link header style), collecting all results.
 * Stops at maxPages to prevent runaway pagination on huge accounts.
 */
async function paginateAll<T>(
  baseUrl: string,
  accessToken: string,
  maxPages = 20,
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}per_page=100`;
  let page = 0;

  while (url && page < maxPages) {
    const res = await fetch(url, { headers: githubHeaders(accessToken) });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(`GitHub API error ${res.status}: ${body.message ?? res.statusText}`);
    }

    const data = await res.json() as T[];
    results.push(...data);
    page++;

    // Parse Link header for next page
    const linkHeader = res.headers.get('Link') ?? '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return results;
}

/**
 * Parses a Markdown string into semantic ContentBlock[].
 * Handles ATX headings (# ## ###) and paragraph text.
 * Skips HTML comments, YAML frontmatter, and bare image tags.
 */
function parseMarkdownToBlocks(markdown: string): ContentBlock[] {
  const lines = markdown.split('\n');
  const blocks: ContentBlock[] = [];
  let paragraphLines: string[] = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inCodeBlock = false;
  const codeLines: string[] = [];
  let codeLang = '';

  const flushParagraph = () => {
    const text = paragraphLines.join(' ').trim();
    if (text) blocks.push({ type: 'text', text });
    paragraphLines = [];
  };

  const flushCode = () => {
    const text = codeLines.join('\n').trim();
    if (text) blocks.push({ type: 'text', text: `\`\`\`${codeLang}\n${text}\n\`\`\`` });
    codeLines.length = 0;
    codeLang = '';
    inCodeBlock = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // YAML frontmatter (--- at start of file)
    if (i === 0 && line.trim() === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && !frontmatterDone) {
      if (line.trim() === '---' || line.trim() === '...') {
        inFrontmatter = false;
        frontmatterDone = true;
      }
      continue;
    }

    // Fenced code blocks
    if (line.startsWith('```') || line.startsWith('~~~')) {
      if (!inCodeBlock) {
        flushParagraph();
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      } else {
        flushCode();
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // ATX headings
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);

    if (h1Match) {
      flushParagraph();
      blocks.push({ type: 'h1', text: h1Match[1].trim() });
      continue;
    }
    if (h2Match) {
      flushParagraph();
      blocks.push({ type: 'h2', text: h2Match[1].replace(/^#/, '').trim() });
      continue;
    }
    if (h3Match) {
      flushParagraph();
      blocks.push({ type: 'h3', text: h3Match[1].replace(/^##/, '').trim() });
      continue;
    }

    // Setext headings (underline style)
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (/^=+$/.test(nextLine.trim()) && line.trim()) {
        flushParagraph();
        blocks.push({ type: 'h1', text: line.trim() });
        i++; // skip underline
        continue;
      }
      if (/^-+$/.test(nextLine.trim()) && line.trim()) {
        flushParagraph();
        blocks.push({ type: 'h2', text: line.trim() });
        i++;
        continue;
      }
    }

    // Blank line — flush accumulated paragraph
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    // HTML comments — skip
    if (line.trim().startsWith('<!--')) continue;

    // Bare image lines — skip (![...](url))
    if (/^!\[.*\]\(.*\)\s*$/.test(line.trim())) continue;

    // Horizontal rules — skip
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) continue;

    // Everything else — accumulate as paragraph
    // Strip markdown link syntax to plain text: [text](url) → text
    const cleaned = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images → alt text
      .replace(/\*\*([^*]+)\*\*/g, '$1')        // bold → plain
      .replace(/\*([^*]+)\*/g, '$1')             // italic → plain
      .replace(/`([^`]+)`/g, '$1')               // inline code → plain
      .replace(/~~([^~]+)~~/g, '$1')             // strikethrough → plain
      .trim();

    if (cleaned) {
      paragraphLines.push(cleaned);
    }
  }

  // Flush any remaining
  if (inCodeBlock) flushCode();
  flushParagraph();

  return blocks;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const githubService = {
  /**
   * Builds the GitHub OAuth authorization URL.
   * Scope `repo` grants access to public and private repos, issues, and discussions.
   */
  buildOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri: process.env.GITHUB_REDIRECT_URI!,
      scope: 'repo read:user',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },

  /**
   * Exchanges an OAuth authorization code for a GitHub access token.
   * GitHub personal tokens do not expire unless configured with an expiry.
   */
  async exchangeOAuthCode(code: string): Promise<GitHubOAuthToken> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_REDIRECT_URI,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub token exchange failed: ${res.statusText}`);
    }

    const data = await res.json() as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error || !data.access_token) {
      throw new Error(
        `GitHub OAuth error: ${data.error_description ?? data.error ?? 'No access token returned'}`,
      );
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type ?? 'bearer',
      scope: data.scope ?? '',
    };
  },

  /**
   * Fetches the authenticated user's GitHub profile.
   */
  async getAuthenticatedUser(accessToken: string): Promise<GitHubUserInfo> {
    const user = await githubFetch<GitHubUser>(`${GITHUB_API}/user`, accessToken);
    return {
      githubUserId: user.id,
      login: user.login,
      name: user.name,
    };
  },

  /**
   * Lists all repositories accessible to the authenticated user.
   * Returns non-archived repos only, sorted by most recently pushed.
   */
  async listRepositories(accessToken: string): Promise<GitHubRepo[]> {
    const repos = await paginateAll<GitHubRepo>(
      `${GITHUB_API}/user/repos?sort=pushed&direction=desc`,
      accessToken,
    );
    return repos.filter((r) => !r.archived);
  },

  /**
   * Returns all Markdown/MDX file paths in a repository's default branch.
   * Uses the Git Trees API (recursive=1) for a single-request directory listing.
   * Skips files > 500KB to avoid decode timeouts.
   */
  async listMarkdownFiles(
    accessToken: string,
    owner: string,
    repo: string,
    defaultBranch: string,
  ): Promise<GitHubFileSummary[]> {
    let tree: GitHubTree;
    try {
      tree = await githubFetch<GitHubTree>(
        `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
        accessToken,
      );
    } catch {
      // Repo might be empty or the branch might not exist yet — skip gracefully
      return [];
    }

    const MAX_FILE_SIZE = 500 * 1024; // 500 KB

    return tree.tree
      .filter(
        (item) =>
          item.type === 'blob' &&
          /\.(md|mdx|markdown)$/i.test(item.path) &&
          (item.size ?? 0) <= MAX_FILE_SIZE,
      )
      .map((item) => ({
        path: item.path,
        sha: item.sha,
        size: item.size ?? 0,
        url: `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${item.path}`,
        owner,
        repo,
        defaultBranch,
      }));
  },

  /**
   * Fetches and parses the full content of a single Markdown file.
   * Returns structured ContentBlock[] for chunking + the raw text for hashing.
   */
  async getFileDocument(
    accessToken: string,
    summary: GitHubFileSummary,
  ): Promise<GitHubFileDocument> {
    const file = await githubFetch<GitHubFileContent>(
      `${GITHUB_API}/repos/${summary.owner}/${summary.repo}/contents/${encodeURIComponent(summary.path)}?ref=${summary.defaultBranch}`,
      accessToken,
    );

    // Decode base64 content (GitHub pads with newlines)
    const rawText = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf-8');
    const blocks = parseMarkdownToBlocks(rawText);
    const contentHash = createHash('sha256').update(rawText).digest('hex');

    // Derive a clean title: filename without extension, last path segment
    const filename = summary.path.split('/').pop() ?? summary.path;
    const title = filename.replace(/\.(md|mdx|markdown)$/i, '').replace(/[-_]/g, ' ');

    return {
      id: `${summary.owner}/${summary.repo}/${summary.path}`,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      url: summary.url,
      contentHash,
      lastEditedAt: new Date(), // Will be overridden by repo's pushed_at in caller
      blocks,
      rawText,
    };
  },

  /**
   * Returns open issues for a repository (excludes PRs).
   * Fetches only open issues to keep the dataset current.
   */
  async listOpenIssues(
    accessToken: string,
    owner: string,
    repo: string,
  ): Promise<GitHubIssueSummary[]> {
    let issues: GitHubIssue[];
    try {
      issues = await paginateAll<GitHubIssue>(
        `${GITHUB_API}/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=desc`,
        accessToken,
        5, // max 500 issues per repo
      );
    } catch {
      return [];
    }

    // Filter out pull requests (GitHub issues API returns PRs too)
    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        id: `${owner}/${repo}/issues/${issue.number}`,
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        updatedAt: new Date(issue.updated_at),
        owner,
        repo,
      }));
  },

  /**
   * Fetches the full content of a GitHub issue including all comments.
   */
  async getIssueDocument(
    accessToken: string,
    summary: GitHubIssueSummary,
  ): Promise<GitHubIssueDocument> {
    const { owner, repo, number } = summary;

    // Fetch issue + comments in parallel
    const [issue, comments] = await Promise.all([
      githubFetch<GitHubIssue>(
        `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}`,
        accessToken,
      ),
      githubFetch<GitHubComment[]>(
        `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/comments`,
        accessToken,
      ),
    ]);

    // Build blocks: title → body paragraphs → comments
    const blocks: ContentBlock[] = [];
    blocks.push({ type: 'h1', text: issue.title });

    if (issue.body?.trim()) {
      const bodyBlocks = parseMarkdownToBlocks(issue.body);
      blocks.push(...bodyBlocks);
    }

    for (const comment of comments) {
      if (!comment.body?.trim()) continue;
      blocks.push({ type: 'h3', text: `Comment by ${comment.user?.login ?? 'unknown'}` });
      blocks.push(...parseMarkdownToBlocks(comment.body));
    }

    const rawText = blocks.map((b) => b.text).join('\n');
    const contentHash = createHash('sha256').update(rawText).digest('hex');

    return {
      id: summary.id,
      title: issue.title,
      url: issue.html_url,
      contentHash,
      lastEditedAt: new Date(issue.updated_at),
      blocks,
      rawText,
    };
  },
};
