// ─── Enums (mirrored from Prisma schema) ─────────────────────────────────────

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type SourceType = 'NOTION' | 'GITHUB' | 'LINEAR' | 'GOOGLE_DRIVE';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'ERROR';

export type SyncInterval = 'MANUAL' | 'HOURLY' | 'EVERY_6H' | 'DAILY' | 'WEEKLY';

export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type TriggerType = 'MANUAL' | 'WEBHOOK' | 'SCHEDULED';

// ─── Core entities ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

/**
 * Source as exposed by the API — tokens are never returned to the client.
 */
export interface Source {
  id: string;
  workspaceId: string;
  type: SourceType;
  name: string;
  metadata: Record<string, unknown>;
  lastSyncedAt: Date | null;
  syncStatus: SyncStatus;
  syncInterval: SyncInterval;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueryHistory {
  id: string;
  workspaceId: string;
  userId: string;
  question: string;
  answer: string;
  sources: Citation[];
  createdAt: Date;
}

export interface Document {
  id: string;
  sourceId: string;
  workspaceId: string;
  externalId: string;
  title: string;
  url: string;
  contentHash: string;
  lastEditedAt: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChunkMetadata {
  /** Ordered list of heading labels leading to this chunk, e.g. ["Intro", "How it works"] */
  headingPath: string[];
  pageNumber?: number;
  [key: string]: unknown;
}

export interface Chunk {
  id: string;
  documentId: string;
  workspaceId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  embeddingModel: string;
  metadata: ChunkMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncJob {
  id: string;
  sourceId: string;
  status: SyncJobStatus;
  triggeredBy: TriggerType;
  documentsProcessed: number;
  chunksCreated: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// ─── API response envelope ────────────────────────────────────────────────────

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string; code: string } };

// ─── Query pipeline ───────────────────────────────────────────────────────────

export interface QueryRequest {
  query: string;
  workspaceId: string;
}

export interface Citation {
  /** 1-based position in the context block list (used for [N] inline citations). */
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  /** May be empty string for sources without a direct URL. */
  documentUrl: string;
  content: string;
  headingPath: string[];
  /** Cosine similarity score 0–1. Higher = more relevant. */
  similarity: number;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
}

// ─── BullMQ job payloads ──────────────────────────────────────────────────────

export interface SyncJobData {
  sourceId: string;
  workspaceId: string;
  syncJobId: string;
  triggeredBy: TriggerType;
}

export interface EmbedBatchJobData {
  /** Chunk IDs to embed in this batch (max 100 per OpenAI batch limit) */
  chunkIds: string[];
  workspaceId: string;
}

// ─── Workspace + source creation inputs ──────────────────────────────────────

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

export interface NotionOAuthCallbackInput {
  code: string;
  workspaceId: string;
}
