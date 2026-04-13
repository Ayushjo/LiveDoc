# LiveDoc

A production-grade, multi-source, real-time RAG (Retrieval-Augmented Generation) platform. Connect Notion, GitHub, Linear, and Google Drive — then ask natural language questions across all your data simultaneously.

## What makes LiveDoc different

- **Live data sync** — answers update as source data changes via webhooks and delta-patching, without full re-ingestion
- **Triple-index hybrid retrieval** — dense vectors (pgvector) + sparse BM25 + Neo4j knowledge graph, fused with Reciprocal Rank Fusion
- **Cross-source entity resolution** — "Ayush" in Linear = "Ayush" in GitHub commits, linked in the knowledge graph
- **Conflict detection** — when two sources contradict each other, the system surfaces the contradiction
- **Collaborative query rooms** — multiple users querying in a shared room in real time

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Frontend | Next.js 14 App Router, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma v6 |
| Database | Postgres on Neon (pgvector) |
| Cache / Queue | Redis on Upstash + BullMQ |
| Auth | Better Auth (Google OAuth + email/password) |
| AI | OpenAI (text-embedding-3-small + gpt-4o) |
| Email | Resend |

## Project structure

```
livedoc/
├── apps/
│   ├── api/          # Express API (port 3001)
│   └── web/          # Next.js frontend (port 3000)
└── packages/
    └── types/        # Shared TypeScript interfaces
```

## Getting started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# Start local infrastructure (Postgres + Redis)
docker compose up -d

# Push database schema
pnpm db:push

# Start development servers
pnpm dev:api   # terminal 1
pnpm dev:web   # terminal 2
```

## Phases

- **Phase 1 (MVP):** Notion sync, pgvector retrieval, SSE streaming, delta sync
- **Phase 2:** GitHub, BM25, Neo4j graph, cross-encoder reranker, RRF fusion, conflict detection, WebSocket rooms
- **Phase 3:** Linear, Google Drive, multi-tenant workspaces, analytics, launch
