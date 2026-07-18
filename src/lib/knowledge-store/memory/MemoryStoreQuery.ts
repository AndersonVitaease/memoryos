// MemoryStoreQuery.ts — Sprint EF-39
// Deterministic structured query with filters and pagination.

import type { KnowledgeRecord, KnowledgeQuery, QueryResult } from "../KnowledgeStoreTypes";

export const MemoryStoreQuery = {
  execute(records: KnowledgeRecord[], q: KnowledgeQuery): QueryResult {
    let results = records;

    if (q.types && q.types.length > 0) {
      const types = new Set(q.types);
      results = results.filter(r => types.has(r.type));
    }
    if (q.status && q.status.length > 0) {
      const statuses = new Set(q.status);
      results = results.filter(r => statuses.has(r.status));
    }
    if (q.tags && q.tags.length > 0) {
      results = results.filter(r => q.tags!.every(t => r.tags.includes(t)));
    }
    if (q.sourceTypes && q.sourceTypes.length > 0) {
      const sources = new Set(q.sourceTypes);
      results = results.filter(r => sources.has(r.evidence.source));
    }
    if (q.conversationIds && q.conversationIds.length > 0) {
      const convs = new Set(q.conversationIds);
      results = results.filter(r => convs.has(r.evidence.conversationId));
    }
    if (q.minConfidence !== undefined) {
      results = results.filter(r => r.evidence.confidence >= q.minConfidence!);
    }
    if (q.createdAfter !== undefined) {
      results = results.filter(r => r.createdAt >= q.createdAfter!);
    }
    if (q.createdBefore !== undefined) {
      results = results.filter(r => r.createdAt <= q.createdBefore!);
    }

    // Deterministic sort: newest first by createdAt, then id for tie-breaking
    results = [...results].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));

    const total  = results.length;
    const offset = q.offset ?? 0;
    const limit  = q.limit  ?? 50;
    const page   = results.slice(offset, offset + limit);

    return Object.freeze({
      ok:      true,
      records: Object.freeze(page),
      total,
      hasMore: offset + limit < total,
    });
  },
};