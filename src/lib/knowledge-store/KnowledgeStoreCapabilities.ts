// KnowledgeStoreCapabilities.ts — Sprint EF-38.0
// Declares what each storage engine can and cannot do
// Used for runtime feature detection — no concrete implementation

export type StorageEngine =
  | "memory" | "sqlite" | "postgres" | "vector" | "neo4j" | "cloud" | "distributed";

export interface KnowledgeStoreCapability {
  readonly engine:            StorageEngine;
  readonly supportsSearch:    boolean;   // full-text or semantic search
  readonly supportsSemanticSearch: boolean; // vector/embedding search
  readonly supportsVersioning:boolean;   // keeps version history
  readonly supportsArchive:   boolean;   // soft delete
  readonly supportsBulkWrite: boolean;   // efficient batch operations
  readonly supportsTransactions: boolean;
  readonly supportsGraphQueries: boolean;
  readonly maxRecords?:       number;    // undefined = unlimited
  readonly persistsAcrossReloads: boolean;
  readonly notes:             string;
}

export const STORE_CAPABILITIES: Record<StorageEngine, KnowledgeStoreCapability> = {
  memory: {
    engine: "memory",
    supportsSearch: true, supportsSemanticSearch: false, supportsVersioning: true,
    supportsArchive: true, supportsBulkWrite: true, supportsTransactions: false,
    supportsGraphQueries: false, maxRecords: 10_000, persistsAcrossReloads: false,
    notes: "Fast, ephemeral. Development and testing only.",
  },
  sqlite: {
    engine: "sqlite",
    supportsSearch: true, supportsSemanticSearch: false, supportsVersioning: true,
    supportsArchive: true, supportsBulkWrite: true, supportsTransactions: true,
    supportsGraphQueries: false, persistsAcrossReloads: true,
    notes: "Single-file persistent store. Good for single-user deployments.",
  },
  postgres: {
    engine: "postgres",
    supportsSearch: true, supportsSemanticSearch: false, supportsVersioning: true,
    supportsArchive: true, supportsBulkWrite: true, supportsTransactions: true,
    supportsGraphQueries: false, persistsAcrossReloads: true,
    notes: "Production-grade relational store with full ACID compliance.",
  },
  vector: {
    engine: "vector",
    supportsSearch: true, supportsSemanticSearch: true, supportsVersioning: false,
    supportsArchive: false, supportsBulkWrite: true, supportsTransactions: false,
    supportsGraphQueries: false, persistsAcrossReloads: true,
    notes: "Optimized for semantic similarity search. Pairs with postgres for metadata.",
  },
  neo4j: {
    engine: "neo4j",
    supportsSearch: true, supportsSemanticSearch: false, supportsVersioning: true,
    supportsArchive: true, supportsBulkWrite: true, supportsTransactions: true,
    supportsGraphQueries: true, persistsAcrossReloads: true,
    notes: "Graph database. Best for knowledge graph queries and relationship traversal.",
  },
  cloud: {
    engine: "cloud",
    supportsSearch: true, supportsSemanticSearch: true, supportsVersioning: true,
    supportsArchive: true, supportsBulkWrite: true, supportsTransactions: false,
    supportsGraphQueries: false, persistsAcrossReloads: true,
    notes: "Managed cloud storage with CDN and global replication.",
  },
  distributed: {
    engine: "distributed",
    supportsSearch: true, supportsSemanticSearch: true, supportsVersioning: true,
    supportsArchive: true, supportsBulkWrite: true, supportsTransactions: true,
    supportsGraphQueries: true, persistsAcrossReloads: true,
    notes: "Distributed multi-region store. Highest resilience and scalability.",
  },
};

export const KnowledgeStoreCapabilities = {
  get(engine: StorageEngine): KnowledgeStoreCapability {
    return STORE_CAPABILITIES[engine];
  },
  getAll(): KnowledgeStoreCapability[] {
    return Object.values(STORE_CAPABILITIES);
  },
  supports(engine: StorageEngine, feature: keyof Omit<KnowledgeStoreCapability, "engine" | "maxRecords" | "notes">): boolean {
    return !!STORE_CAPABILITIES[engine]?.[feature];
  },
};