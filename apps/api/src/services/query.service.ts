// Phase 1 — RAG query pipeline.
// Embeds query → pgvector cosine search (<=> operator) → builds context → streams gpt-4o via SSE.
// All queries filtered by workspaceId for tenant isolation.
// TODO: implement when instructed.
