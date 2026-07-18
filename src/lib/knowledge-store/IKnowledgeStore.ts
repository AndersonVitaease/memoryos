// IKnowledgeStore.ts — Sprint EF-38.0
// The ONLY authorized interface for persisting consolidated knowledge.
// No module may write memories without depending on this interface.

import type {
  KnowledgeRecord,
  KnowledgeRecordDraft,
  KnowledgeRecordPatch,
  KnowledgeQuery,
  KnowledgeSearchQuery,
  StoreResult,
  GetResult,
  QueryResult,
  SearchResult,
  ExistsResult,
  DeleteResult,
  ArchiveResult,
  RestoreResult,
  StoreStats,
  HealthResult,
} from "./KnowledgeStoreTypes";

/**
 * IKnowledgeStore — Universal Knowledge Store Contract
 *
 * Engineering principles:
 * - SRP: each method does exactly one thing
 * - OCP: new storage engines implement this interface without changing the pipeline
 * - LSP: any implementation is substitutable without breaking the pipeline
 * - ISP: consumers depend only on what they use
 * - DIP: KnowledgeIngestionPipeline depends on this abstraction, never on concrete stores
 *
 * Every operation:
 * - is deterministic (same input → same result shape)
 * - returns immutable objects (Object.freeze)
 * - is auditable (every write emits a KnowledgeStoreEvent)
 * - never throws — errors are returned in result.error
 */
export interface IKnowledgeStore {
  /**
   * Persist a new knowledge record.
   * Returns StoreResult with the assigned id and version.
   */
  store(draft: KnowledgeRecordDraft): Promise<StoreResult>;

  /**
   * Update an existing record by id.
   * Increments version. Archives the previous version.
   */
  update(id: string, patch: KnowledgeRecordPatch): Promise<StoreResult>;

  /**
   * Archive a record (soft delete — preserves history).
   * Archived records are excluded from default queries.
   */
  archive(id: string, reason?: string): Promise<ArchiveResult>;

  /**
   * Restore an archived record to active status.
   */
  restore(id: string): Promise<RestoreResult>;

  /**
   * Permanently delete a record and all its versions.
   * Irreversible — prefer archive() for traceability.
   */
  delete(id: string): Promise<DeleteResult>;

  /**
   * Check if a record with the given id exists (any status).
   */
  exists(id: string): Promise<ExistsResult>;

  /**
   * Retrieve a single record by id.
   * Returns GetResult.record = undefined if not found.
   */
  get(id: string): Promise<GetResult>;

  /**
   * Full-text or semantic search over active records.
   */
  search(query: KnowledgeSearchQuery): Promise<SearchResult>;

  /**
   * Structured query with filters, pagination.
   */
  query(query: KnowledgeQuery): Promise<QueryResult>;

  /**
   * Aggregate statistics about the store.
   */
  stats(): Promise<StoreStats>;

  /**
   * Health check — returns latency and availability.
   */
  health(): Promise<HealthResult>;
}

/**
 * IKnowledgeStoreFactory — creates concrete implementations.
 * Used by the DI root — never by domain logic.
 */
export interface IKnowledgeStoreFactory {
  create(config?: KnowledgeStoreConfig): IKnowledgeStore;
}

export interface KnowledgeStoreConfig {
  engine:       "memory" | "sqlite" | "postgres" | "vector" | "neo4j" | "cloud" | "distributed";
  namespace?:   string;
  maxRecords?:  number;
  ttlMs?:       number;
  readonly?:    boolean;
}