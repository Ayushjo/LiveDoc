import { randomBytes } from 'crypto';
import { db } from '../db';
import { redis } from '../redis';
import { encrypt, decrypt } from '../lib/crypto';
import { notionService } from './notion.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors';

// ─── Redis key helpers ────────────────────────────────────────────────────────

const OAUTH_STATE_PREFIX = 'notion:oauth:state:';
const OAUTH_STATE_TTL_SEC = 600; // 10 minutes

function stateKey(nonce: string): string {
  return `${OAUTH_STATE_PREFIX}${nonce}`;
}

interface OAuthStatePayload {
  workspaceId: string;
  userId: string;
}

// ─── Source service ───────────────────────────────────────────────────────────

export const sourceService = {
  // ── Notion OAuth ────────────────────────────────────────────────────────────

  /**
   * Step 1 — Initiates the Notion OAuth flow.
   *
   * Verifies the user is an ADMIN or OWNER of the workspace, generates a
   * cryptographically random state nonce, stores it in Redis (TTL 10 min),
   * and returns the Notion authorization URL.
   */
  async initiateNotionOAuth(
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    // Verify the user has permission to connect sources (ADMIN+)
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });

    if (!member) throw new NotFoundError('Workspace');
    if (member.role === 'MEMBER') {
      throw new ForbiddenError('Only ADMINs and OWNERs can connect new sources');
    }

    // Generate a random nonce and persist state in Redis
    const nonce = randomBytes(32).toString('hex');
    const payload: OAuthStatePayload = { workspaceId, userId };
    await redis.set(stateKey(nonce), JSON.stringify(payload), 'EX', OAUTH_STATE_TTL_SEC);

    return notionService.buildOAuthUrl(nonce);
  },

  /**
   * Step 2 — Handles the Notion OAuth callback.
   *
   * Validates the state nonce against Redis, exchanges the code for an
   * access token, encrypts it, then creates or updates the Source record.
   * Returns the created/updated Source (tokens excluded).
   */
  async handleNotionCallback(
    code: string,
    state: string,
  ) {
    // Validate state — guards against CSRF
    const raw = await redis.get(stateKey(state));
    if (!raw) {
      throw new BadRequestError(
        'OAuth state expired or invalid. Please start the connection flow again.',
      );
    }

    const { workspaceId, userId } = JSON.parse(raw) as OAuthStatePayload;

    // Consume state immediately — one-time use
    await redis.del(stateKey(state));

    // Exchange code for Notion access token
    const token = await notionService.exchangeOAuthCode(code);

    // Prevent connecting the same Notion workspace twice
    const existingSource = await db.source.findFirst({
      where: {
        workspaceId,
        type: 'NOTION',
        metadata: {
          path: ['notionWorkspaceId'],
          equals: token.workspaceId,
        },
      },
      select: { id: true },
    });

    if (existingSource) {
      throw new ConflictError(
        'This Notion workspace is already connected. Disconnect it first to reconnect.',
      );
    }

    // Encrypt token before persistence — never store plaintext
    const encryptedAccessToken = encrypt(token.accessToken);

    const source = await db.source.create({
      data: {
        workspaceId,
        type: 'NOTION',
        name: token.workspaceName,
        encryptedAccessToken,
        // Notion tokens don't expire and have no refresh token
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        syncStatus: 'IDLE',
        metadata: {
          notionWorkspaceId: token.workspaceId,
          notionWorkspaceName: token.workspaceName,
          notionWorkspaceIcon: token.workspaceIcon,
          botId: token.botId,
          connectedBy: userId,
        },
      },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        name: true,
        syncStatus: true,
        lastSyncedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        // Never select encryptedAccessToken / encryptedRefreshToken
      },
    });

    return source;
  },

  // ── Source CRUD ─────────────────────────────────────────────────────────────

  /**
   * Lists all sources for a workspace.
   * Tokens are never returned.
   */
  async listSources(workspaceId: string, userId: string) {
    // Verify membership
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!member) throw new NotFoundError('Workspace');

    return db.source.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        name: true,
        syncStatus: true,
        lastSyncedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Returns a single source by ID.
   * Verifies the requesting user is a member of the source's workspace.
   * Tokens are never returned.
   */
  async getSource(sourceId: string, userId: string) {
    const source = await db.source.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        name: true,
        syncStatus: true,
        lastSyncedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { documents: true } },
      },
    });

    if (!source) throw new NotFoundError('Source');

    // Workspace membership check — enforces tenant isolation
    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: source.workspaceId, userId },
      },
      select: { id: true },
    });
    if (!member) throw new NotFoundError('Source');

    return source;
  },

  /**
   * Disconnects a source and deletes all associated documents and chunks.
   * Requires ADMIN or OWNER role.
   */
  async deleteSource(sourceId: string, userId: string): Promise<void> {
    const source = await db.source.findUnique({
      where: { id: sourceId },
      select: { id: true, workspaceId: true },
    });

    if (!source) throw new NotFoundError('Source');

    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: source.workspaceId, userId },
      },
      select: { role: true },
    });

    if (!member) throw new NotFoundError('Source');
    if (member.role === 'MEMBER') {
      throw new ForbiddenError('Only ADMINs and OWNERs can disconnect sources');
    }

    // Cascading delete — documents, chunks all deleted via Prisma onDelete: Cascade
    await db.source.delete({ where: { id: sourceId } });
  },

  /**
   * Returns the decrypted access token for a source.
   * Internal use only — never expose this via an API response.
   */
  async getDecryptedAccessToken(sourceId: string): Promise<string> {
    const source = await db.source.findUnique({
      where: { id: sourceId },
      select: { encryptedAccessToken: true },
    });

    if (!source) throw new NotFoundError('Source');
    return decrypt(source.encryptedAccessToken);
  },
};
