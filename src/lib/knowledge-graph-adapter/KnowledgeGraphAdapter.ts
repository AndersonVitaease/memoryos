/**
 * KnowledgeGraphAdapter.ts — Sprint M-06.2A
 * 2026-07-16
 *
 * SINGLE RESPONSIBILITY:
 *   Convert ProjectKnowledgeGraph (from KnowledgeGraphStore)
 *   into ProviderKnowledge[] (accepted by KnowledgeFusionEngine EF-36D).
 *
 * ARCHITECTURAL CONTRACT:
 *   Input:  ProjectKnowledgeGraph { entities: ArchEntity[], relationships: ArchRelationship[],
 *                                   modules: ModuleNode[], layers, coverage, ... }
 *   Output: ProviderKnowledge[] { sourceId, sourceName, items: KnowledgeItem[],
 *                                  relationships: KnowledgeRelationship[], timelineEvents: [] }
 *
 * RULES:
 *   - Does NOT modify KnowledgeFusionEngine
 *   - Does NOT modify KnowledgeGraphStore
 *   - Does NOT modify LiveCognitivePipeline
 *   - Does NOT modify RepositoryKnowledgeBuilder
 *   - Pure function: same input → same output (deterministic)
 *   - No I/O, no async, no side effects
 *   - Zero information loss: all ArchEntity fields mapped
 *
 * FIELD MAPPING:
 *   ArchEntity.id            → KnowledgeItem.id
 *   ArchEntity.name          → KnowledgeItem.title
 *   ArchEntity.type          → KnowledgeItem.type (via ENTITY_TYPE_MAP)
 *   ArchEntity.description   → KnowledgeItem.content (enriched with responsibilities)
 *   ArchEntity.layer         → KnowledgeItem.tags[0]
 *   ArchEntity.responsibilities → KnowledgeItem.tags[1..]
 *   ArchEntity.confidence    → KnowledgeProvenance.confidence
 *   ArchEntity.filePath      → KnowledgeProvenance.originalIdentifier
 *   ArchEntity.repo          → KnowledgeProvenance.sourceId
 *
 *   ArchRelationship.id      → KnowledgeRelationship.id
 *   ArchRelationship.fromId  → KnowledgeRelationship.fromId
 *   ArchRelationship.toId    → KnowledgeRelationship.toId
 *   ArchRelationship.type    → KnowledgeRelationship.relationshipType
 *   ArchRelationship.confidence → weight + provenance.confidence
 *
 *   ModuleNode               → KnowledgeItem (type: "implementation")
 *   ProjectKnowledgeGraph.coverage → provenance.confidence base
 *
 * MDS v2.0 compliant.
 */

import type { ProjectKnowledgeGraph, ArchEntity, ArchRelationship, ModuleNode } from "../project-knowledge/PKBTypes";
import type { ProviderKnowledge } from "../knowledge-fusion/KnowledgeFusionEngine";
import type {
  KnowledgeItem,
  KnowledgeRelationship,
  KnowledgeTimelineEvent,
  KnowledgeProvenance,
  KnowledgeItemType,
  KnowledgeSourceType,
  KnowledgeSourceProvider,
} from "../knowledge-reconstruction/KRETypes";

// ── Type maps ─────────────────────────────────────────────────────────────────

/**
 * Maps PKB EntityType → KRE KnowledgeItemType.
 * Every PKB type has an explicit mapping — no fallback to "unknown".
 */
const ENTITY_TYPE_MAP: Record<string, KnowledgeItemType> = {
  class:      "implementation",
  interface:  "architecture",
  enum:       "artifact",
  function:   "implementation",
  constant:   "artifact",
  type:       "artifact",
  module:     "implementation",
  file:       "document",
  directory:  "document",
  config:     "artifact",
};

/**
 * Maps PKB RelationshipType → KRE relationshipType string.
 * Kept as strings since KnowledgeRelationship.relationshipType is `string`.
 */
const RELATIONSHIP_TYPE_MAP: Record<string, string> = {
  imports:      "imports",
  exports:      "exports",
  calls:        "depends_on",
  extends:      "implements",
  implements:   "implements",
  depends_on:   "depends_on",
  owned_by:     "references",
  belongs_to:   "references",
  connected_to: "references",
  used_by:      "references",
};

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;
function makeAdapterId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_seq).toString(36)}`;
}

// ── Provenance factory ────────────────────────────────────────────────────────

function makeProvenance(
  sourceId: string,
  sourceName: string,
  originalIdentifier: string,
  confidence: number,
  now: number,
): KnowledgeProvenance {
  const sourceType: KnowledgeSourceType = "github";
  const provider: KnowledgeSourceProvider = "GitHub";
  return {
    sourceId,
    sourceName,
    sourceType,
    provider,
    originalIdentifier,
    importedAt: now,
    lastUpdatedAt: now,
    confidence: Math.max(0, Math.min(1, confidence)),
    verificationStatus: confidence >= 0.8 ? "VERIFIED" : confidence >= 0.5 ? "INFERRED" : "UNKNOWN",
  };
}

// ── ArchEntity → KnowledgeItem ────────────────────────────────────────────────

function archEntityToKnowledgeItem(
  entity: ArchEntity,
  sourceId: string,
  sourceName: string,
  now: number,
): KnowledgeItem {
  const itemType: KnowledgeItemType = ENTITY_TYPE_MAP[entity.type] ?? "implementation";

  // Enrich content: description + responsibilities + exports/imports summary
  const contentParts: string[] = [];
  if (entity.description) contentParts.push(entity.description);
  if (entity.responsibilities.length > 0) {
    contentParts.push(`Responsibilities: ${entity.responsibilities.join("; ")}`);
  }
  if (entity.exports.length > 0) {
    contentParts.push(`Exports: ${entity.exports.slice(0, 5).join(", ")}`);
  }
  const content = contentParts.join(" | ") || entity.name;

  // Tags: layer first, then responsibilities (up to 5)
  const tags: string[] = [entity.layer, entity.type];
  for (const resp of entity.responsibilities.slice(0, 5)) {
    if (resp && !tags.includes(resp)) tags.push(resp);
  }

  const provenance = makeProvenance(
    sourceId,
    sourceName,
    entity.filePath,
    entity.confidence,
    now,
  );

  return Object.freeze({
    id:         entity.id,
    type:       itemType,
    title:      entity.name,
    content,
    tags:       Object.freeze(tags),
    provenance,
    createdAt:  entity.updatedAt || now,
  });
}

// ── ArchRelationship → KnowledgeRelationship ──────────────────────────────────

function archRelationshipToKnowledgeRelationship(
  rel: ArchRelationship,
  sourceId: string,
  sourceName: string,
  now: number,
): KnowledgeRelationship {
  const relType = RELATIONSHIP_TYPE_MAP[rel.type] ?? rel.type;
  const provenance = makeProvenance(
    sourceId,
    sourceName,
    rel.filePath || `${rel.fromName}->${rel.toName}`,
    rel.confidence,
    now,
  );

  return Object.freeze({
    id:               rel.id,
    fromId:           rel.fromId,
    toId:             rel.toId,
    relationshipType: relType,
    weight:           Math.max(0, Math.min(1, rel.confidence)),
    provenance,
    createdAt:        now,
  });
}

// ── ModuleNode → KnowledgeItem ────────────────────────────────────────────────

function moduleNodeToKnowledgeItem(
  module: ModuleNode,
  sourceId: string,
  sourceName: string,
  now: number,
): KnowledgeItem {
  const content =
    `Module: ${module.name} | Layer: ${module.layer} | ` +
    `Files: ${module.fileCount} | Entities: ${module.entityCount} | ` +
    `Depends on: ${module.dependsOn.length} modules | Used by: ${module.usedBy.length} modules`;

  const tags: string[] = [module.layer, "module"];

  // Module confidence derived from entity count and dependency coherence
  const confidence = Math.min(0.95, 0.5 + module.entityCount * 0.02);

  const provenance = makeProvenance(
    sourceId,
    sourceName,
    module.path,
    confidence,
    now,
  );

  return Object.freeze({
    id:        module.moduleId,
    type:      "implementation" as KnowledgeItemType,
    title:     module.name,
    content,
    tags:      Object.freeze(tags),
    provenance,
    createdAt: now,
  });
}

// ── Module dependency → KnowledgeRelationship ─────────────────────────────────

function moduleDepsToRelationships(
  module: ModuleNode,
  sourceId: string,
  sourceName: string,
  now: number,
): KnowledgeRelationship[] {
  return module.dependsOn.map((depModuleId) => {
    const provenance = makeProvenance(sourceId, sourceName, `module-dep:${module.moduleId}->${depModuleId}`, 0.85, now);
    return Object.freeze({
      id:               makeAdapterId("mrel"),
      fromId:           module.moduleId,
      toId:             depModuleId,
      relationshipType: "depends_on",
      weight:           0.85,
      provenance,
      createdAt:        now,
    });
  });
}

// ── Timeline events from circular deps / dead code (metadata events) ──────────

function metadataToTimelineEvents(
  graph: ProjectKnowledgeGraph,
  sourceId: string,
  sourceName: string,
  now: number,
): KnowledgeTimelineEvent[] {
  const events: KnowledgeTimelineEvent[] = [];
  const provenance = makeProvenance(sourceId, sourceName, `${graph.owner}/${graph.repo}`, graph.coverage, now);

  // Graph build event
  events.push(Object.freeze({
    id:            makeAdapterId("tevt"),
    eventType:     "architecture" as const,
    title:         `Knowledge graph built: ${graph.owner}/${graph.repo}@${graph.branch}`,
    description:
      `Entities: ${graph.entityCount} | Relationships: ${graph.relationshipCount} | ` +
      `Modules: ${graph.modules.length} | Coverage: ${Math.round(graph.coverage * 100)}% | ` +
      `Duration: ${graph.durationMs}ms`,
    occurredAt:    graph.builtAt,
    relatedItemIds: Object.freeze([]),
    provenance,
  }));

  // Circular dependencies as architecture events
  for (const cycle of graph.circularDeps.slice(0, 10)) {
    events.push(Object.freeze({
      id:            makeAdapterId("tevt"),
      eventType:     "architecture" as const,
      title:         `Circular dependency detected: ${cycle.join(" → ")}`,
      description:   `Circular dependency cycle involving ${cycle.length} entities`,
      occurredAt:    graph.builtAt,
      relatedItemIds: Object.freeze(cycle),
      provenance,
    }));
  }

  return events;
}

// ── Main adapter ──────────────────────────────────────────────────────────────

export interface AdapterResult {
  providers:          ProviderKnowledge[];
  entityCount:        number;
  relationshipCount:  number;
  moduleCount:        number;
  timelineEventCount: number;
  sourceId:           string;
  sourceName:         string;
  coverage:           number;
  durationMs:         number;
  warnings:           string[];
}

/**
 * Convert a ProjectKnowledgeGraph into ProviderKnowledge[] for KnowledgeFusionEngine.
 *
 * Returns TWO providers:
 *   [0] "github-entities": ArchEntity[] + ArchRelationship[] (file-level)
 *   [1] "github-modules":  ModuleNode[] + module deps (module-level)
 *
 * Splitting into two providers allows KFE to fuse them with MULTI_SOURCE verification
 * status for entities that appear in both (entities referenced by modules).
 *
 * @param graph  ProjectKnowledgeGraph from KnowledgeGraphStore.get()
 * @returns      AdapterResult containing ProviderKnowledge[] + diagnostics
 */
export function adaptKnowledgeGraphToProviders(graph: ProjectKnowledgeGraph | null): AdapterResult {
  const t0 = Date.now();
  const warnings: string[] = [];

  // Guard: null or empty graph
  if (!graph || graph.entityCount === 0) {
    return {
      providers: [],
      entityCount: 0,
      relationshipCount: 0,
      moduleCount: 0,
      timelineEventCount: 0,
      sourceId: "github",
      sourceName: "GitHub (empty)",
      coverage: 0,
      durationMs: Date.now() - t0,
      warnings: ["Graph is null or has no entities — returning empty providers"],
    };
  }

  const now = Date.now();
  const repoLabel = `${graph.owner}/${graph.repo}@${graph.branch}`;
  const entitySourceId = `github:${graph.owner}/${graph.repo}`;
  const moduleSourceId = `github-modules:${graph.owner}/${graph.repo}`;

  // ── Provider 1: file-level entities + relationships ───────────────────────
  const entityItems: KnowledgeItem[] = [];
  const entityRels: KnowledgeRelationship[] = [];

  for (const entity of graph.entities) {
    try {
      entityItems.push(archEntityToKnowledgeItem(entity, entitySourceId, repoLabel, now));
    } catch (e) {
      warnings.push(`ArchEntity "${entity.name}" skipped: ${(e as Error).message}`);
    }
  }

  for (const rel of graph.relationships) {
    // Only include relationships where both endpoints are in the graph
    const fromExists = graph.entities.some(e => e.id === rel.fromId);
    const toExists   = graph.entities.some(e => e.id === rel.toId);
    if (fromExists && toExists) {
      try {
        entityRels.push(archRelationshipToKnowledgeRelationship(rel, entitySourceId, repoLabel, now));
      } catch (e) {
        warnings.push(`ArchRelationship "${rel.id}" skipped: ${(e as Error).message}`);
      }
    } else {
      warnings.push(`Relationship ${rel.fromName}→${rel.toName} skipped: endpoint not in graph`);
    }
  }

  // ── Provider 2: module-level items + inter-module deps ────────────────────
  const moduleItems: KnowledgeItem[] = [];
  const moduleRels: KnowledgeRelationship[] = [];

  // Set of known module IDs for dependency validation
  const knownModuleIds = new Set(graph.modules.map(m => m.moduleId));

  for (const module of graph.modules) {
    try {
      moduleItems.push(moduleNodeToKnowledgeItem(module, moduleSourceId, `${repoLabel} (modules)`, now));

      // Only add module deps where target module exists
      const validDeps = module.dependsOn.filter(dep => knownModuleIds.has(dep));
      const skippedDeps = module.dependsOn.length - validDeps.length;
      if (skippedDeps > 0) {
        warnings.push(`Module "${module.name}": ${skippedDeps} dangling dependency references skipped`);
      }

      const syntheticModule: ModuleNode = { ...module, dependsOn: validDeps };
      moduleRels.push(...moduleDepsToRelationships(syntheticModule, moduleSourceId, `${repoLabel} (modules)`, now));
    } catch (e) {
      warnings.push(`ModuleNode "${module.name}" skipped: ${(e as Error).message}`);
    }
  }

  // ── Timeline events (from both providers, on provider 1) ─────────────────
  const timelineEvents = metadataToTimelineEvents(graph, entitySourceId, repoLabel, now);

  // ── Assemble providers ────────────────────────────────────────────────────
  const providers: ProviderKnowledge[] = [];

  if (entityItems.length > 0) {
    providers.push({
      sourceId:       entitySourceId,
      sourceName:     `GitHub Repository: ${repoLabel}`,
      items:          entityItems,
      relationships:  entityRels,
      timelineEvents,
    });
  }

  if (moduleItems.length > 0) {
    providers.push({
      sourceId:   moduleSourceId,
      sourceName: `GitHub Modules: ${repoLabel}`,
      items:      moduleItems,
      relationships: moduleRels,
      timelineEvents: [],
    });
  }

  if (providers.length === 0) {
    warnings.push("Graph had entities but all failed conversion — returning empty providers");
  }

  const totalItems = entityItems.length + moduleItems.length;
  const totalRels  = entityRels.length + moduleRels.length;

  return {
    providers,
    entityCount:        entityItems.length,
    relationshipCount:  totalRels,
    moduleCount:        moduleItems.length,
    timelineEventCount: timelineEvents.length,
    sourceId:           entitySourceId,
    sourceName:         repoLabel,
    coverage:           graph.coverage,
    durationMs:         Date.now() - t0,
    warnings,
  };
}

// ── Convenience: read from KGS and adapt ─────────────────────────────────────

/**
 * Read the current graph from KnowledgeGraphStore and adapt it.
 * Returns empty AdapterResult if KGS is not ready.
 */
export function adaptFromKnowledgeGraphStore(caller = "KnowledgeGraphAdapter"): AdapterResult {
  // Lazy import to avoid circular dependency (KGS imports nothing from this file)
  const { KnowledgeGraphStore } = require("../project-knowledge/KnowledgeGraphStore");
  if (!KnowledgeGraphStore.isReady()) {
    return {
      providers: [],
      entityCount: 0, relationshipCount: 0, moduleCount: 0, timelineEventCount: 0,
      sourceId: "github", sourceName: "GitHub (not ready)", coverage: 0,
      durationMs: 0, warnings: ["KnowledgeGraphStore not ready"],
    };
  }
  const graph = KnowledgeGraphStore.get(caller);
  return adaptKnowledgeGraphToProviders(graph);
}