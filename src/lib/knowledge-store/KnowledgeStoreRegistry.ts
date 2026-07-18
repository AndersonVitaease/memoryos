// KnowledgeStoreRegistry.ts — Sprint EF-38.1
// Stores metadata about available engine identifiers.
// No concrete classes — metadata only.

export type EngineId =
  | "memory" | "sqlite" | "postgres" | "neo4j"
  | "vector" | "cloud" | "distributed";

export type EngineEnvironment = "development" | "testing" | "production" | "enterprise";

export interface EngineMetadata {
  readonly id:           EngineId;
  readonly displayName:  string;
  readonly description:  string;
  readonly environments: readonly EngineEnvironment[];
  readonly persistent:   boolean;
  readonly experimental: boolean;
  readonly minVersion:   string;
}

const REGISTRY: Record<EngineId, EngineMetadata> = {
  memory: Object.freeze({
    id: "memory", displayName: "In-Memory Store",
    description: "Fast ephemeral store for development and testing. No persistence.",
    environments: Object.freeze(["development", "testing"] as const),
    persistent: false, experimental: false, minVersion: "EF-38.0",
  }),
  sqlite: Object.freeze({
    id: "sqlite", displayName: "SQLite Store",
    description: "Single-file persistent store. Good for single-user deployments.",
    environments: Object.freeze(["development"] as const),
    persistent: true, experimental: false, minVersion: "EF-39.0",
  }),
  postgres: Object.freeze({
    id: "postgres", displayName: "PostgreSQL Store",
    description: "Production-grade relational store with full ACID compliance.",
    environments: Object.freeze(["production"] as const),
    persistent: true, experimental: false, minVersion: "EF-39.0",
  }),
  neo4j: Object.freeze({
    id: "neo4j", displayName: "Neo4j Graph Store",
    description: "Graph database. Best for knowledge graph queries.",
    environments: Object.freeze(["production", "enterprise"] as const),
    persistent: true, experimental: true, minVersion: "EF-40.0",
  }),
  vector: Object.freeze({
    id: "vector", displayName: "Vector Store",
    description: "Optimized for semantic similarity search.",
    environments: Object.freeze(["production", "enterprise"] as const),
    persistent: true, experimental: true, minVersion: "EF-40.0",
  }),
  cloud: Object.freeze({
    id: "cloud", displayName: "Cloud Store",
    description: "Managed cloud storage with CDN and global replication.",
    environments: Object.freeze(["production", "enterprise"] as const),
    persistent: true, experimental: true, minVersion: "EF-41.0",
  }),
  distributed: Object.freeze({
    id: "distributed", displayName: "Distributed Store",
    description: "Distributed multi-region store. Highest resilience and scalability.",
    environments: Object.freeze(["enterprise"] as const),
    persistent: true, experimental: true, minVersion: "EF-42.0",
  }),
};

export const KnowledgeStoreRegistry = {
  get(id: EngineId): EngineMetadata {
    return REGISTRY[id];
  },

  getAll(): EngineMetadata[] {
    return Object.values(REGISTRY);
  },

  getForEnvironment(env: EngineEnvironment): EngineMetadata[] {
    return Object.values(REGISTRY).filter(m => m.environments.includes(env));
  },

  isRegistered(id: string): id is EngineId {
    return id in REGISTRY;
  },

  isStable(id: EngineId): boolean {
    return !REGISTRY[id].experimental;
  },
};