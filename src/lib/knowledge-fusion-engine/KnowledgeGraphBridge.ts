/**
 * KnowledgeGraphBridge.ts — Sprint M-03
 *
 * SRP: transform an UnifiedKnowledgeModel (KFE output) into a
 *      ProjectKnowledgeGraph (KGS input) and persist it via
 *      KnowledgeGraphStore.set().
 *
 * This is the OFFICIAL second writer of KnowledgeGraphStore.
 * The first writer is RepositoryKnowledgeBuilder (structural/file-level graph).
 * This bridge writes the CONVERSATIONAL knowledge graph derived from
 * user sessions, memory, decisions, topics, and connector knowledge.
 *
 * Architecture rules:
 *   - Never throws — all failures are caught and logged silently.
 *   - Pure conversion: no LLM, no network, no connectors, no async I/O.
 *   - Only writes to KGS when the model has entities (>0).
 *   - Does NOT overwrite a structural graph built by RepositoryKnowledgeBuilder
 *     if it is fresher than 10 minutes — conversational knowledge is additive.
 *   - Caller identity: "KnowledgeGraphBridge.M03"
 *
 * Consumes:  UnifiedKnowledgeModel (from KnowledgeFusionEngine)
 * Produces:  KnowledgeGraphStore update
 *
 * MDS v2.0 compliant. Singleton via globalThis.
 */

import type { UnifiedKnowledgeModel, FusedEntity } from "./KFETypes";
import type {
  ProjectKnowledgeGraph,
  ArchEntity,
  ArchRelationship,
  ModuleNode,
  ArchitecturalLayer,
  EntityType,
  RelationshipType,
} from "@/lib/project-knowledge/PKBTypes";
import { KnowledgeGraphStore } from "@/lib/project-knowledge/KnowledgeGraphStore";
import { makePKBId }           from "@/lib/project-knowledge/PKBTypes";

// ── Caller constant ───────────────────────────────────────────────────────────

const CALLER = "KnowledgeGraphBridge.M03";

// ── Type mapping helpers ──────────────────────────────────────────────────────

function toEntityType(kfeType: string): EntityType {
  switch (kfeType) {
    case "entity":   return "class";
    case "topic":    return "module";
    case "decision": return "constant";
    case "task":     return "function";
    case "keyword":  return "type";
    case "fact":     return "file";
    default:         return "file";
  }
}

function toLayer(kfeType: string): ArchitecturalLayer {
  switch (kfeType) {
    case "entity":   return "engine";
    case "topic":    return "orchestration";
    case "decision": return "utility";
    case "task":     return "utility";
    default:         return "unknown";
  }
}

function toRelType(idx: number): RelationshipType {
  // Cycle through meaningful relationship types for the knowledge model
  const types: RelationshipType[] = [
    "depends_on", "connected_to", "used_by", "belongs_to", "imports",
  ];
  return types[idx % types.length];
}

// ── Conversion ────────────────────────────────────────────────────────────────

function fusedEntityToArchEntity(fe: FusedEntity, sessionId: string): ArchEntity {
  return {
    id:               fe.fusedId,
    name:             fe.canonicalValue,
    type:             toEntityType(fe.type),
    layer:            toLayer(fe.type),
    filePath:         `session://${sessionId}/${fe.type}/${fe.fusedId}`,
    description:      fe.context ?? `${fe.type}: ${fe.canonicalValue}`,
    responsibilities: fe.context ? [fe.context] : [],
    exports:          [],
    imports:          [],
    dependencies:     [],  // filled from KnowledgeRelationship below
    dependents:       [],
    confidence:       fe.confidence,
    repo:             "conversational-memory",
    branch:           "session",
    commit:           null,
    lineCount:        0,
    updatedAt:        Date.now(),
  };
}

// ── KnowledgeGraphBridge ──────────────────────────────────────────────────────

export interface BridgeResult {
  readonly persisted:    boolean;
  readonly reason:       string;
  readonly entityCount:  number;
  readonly durationMs:   number;
}

class KnowledgeGraphBridgeClass {
  private _totalPersisted = 0;
  private _totalSkipped   = 0;

  /**
   * Convert a UnifiedKnowledgeModel to ProjectKnowledgeGraph and persist it.
   * Non-blocking: call with `.catch(() => {})` from the pipeline.
   * Never throws.
   */
  persist(model: UnifiedKnowledgeModel, sessionId: string): BridgeResult {
    const t0 = Date.now();

    try {
      // Guard: skip empty models
      const totalEntities =
        model.entities.length + model.topics.length +
        model.decisions.length + model.tasks.length;

      if (totalEntities === 0) {
        this._totalSkipped++;
        return {
          persisted:   false,
          reason:      "model has zero entities — skip",
          entityCount: 0,
          durationMs:  Date.now() - t0,
        };
      }

      // Guard: do NOT overwrite a fresh structural graph built by RKB
      // (< 10 minutes old) — conversational knowledge writes only when
      // the structural graph is stale or absent.
      if (KnowledgeGraphStore.isReady() && KnowledgeGraphStore.ageMs() < 10 * 60 * 1000) {
        this._totalSkipped++;
        return {
          persisted:   false,
          reason:      "structural graph is fresh (< 10min) — skip conversational write",
          entityCount: totalEntities,
          durationMs:  Date.now() - t0,
        };
      }

      // ── Build ArchEntity[] from all fused entity types ─────────────────

      const allFused: FusedEntity[] = [
        ...model.entities,
        ...model.topics,
        ...model.decisions,
        ...model.tasks,
      ];

      const archEntities: ArchEntity[] = allFused.map((fe) =>
        fusedEntityToArchEntity(fe, sessionId)
      );

      // Build an ID → ArchEntity index for relationship wiring
      const entityIndex = new Map<string, ArchEntity>(
        archEntities.map((e) => [e.id, e])
      );

      // ── Build ArchRelationship[] from KFE relationships ───────────────

      const archRelationships: ArchRelationship[] = [];
      let relIdx = 0;

      for (const rel of model.relationships) {
        const fromEnt = entityIndex.get(rel.fromEntityId);
        const toEnt   = entityIndex.get(rel.toEntityId);
        if (!fromEnt || !toEnt) continue;

        const archRel: ArchRelationship = {
          id:         makePKBId("kgb-rel"),
          fromId:     fromEnt.id,
          toId:       toEnt.id,
          fromName:   fromEnt.name,
          toName:     toEnt.name,
          type:       toRelType(relIdx++),
          filePath:   `session://${sessionId}`,
          confidence: rel.confidence,
        };
        archRelationships.push(archRel);

        // Wire dependencies / dependents on entities
        if (!fromEnt.dependencies.includes(toEnt.id)) {
          (fromEnt.dependencies as string[]).push(toEnt.id);
        }
        if (!toEnt.dependents.includes(fromEnt.id)) {
          (toEnt.dependents as string[]).push(fromEnt.id);
        }
      }

      // ── Build ModuleNode[] — one module per KFE entity type ────────────

      const moduleGroups: Record<string, FusedEntity[]> = {
        entities:  [...model.entities],
        topics:    [...model.topics],
        decisions: [...model.decisions],
        tasks:     [...model.tasks],
      };

      const modules: ModuleNode[] = Object.entries(moduleGroups)
        .filter(([, items]) => items.length > 0)
        .map(([groupName, items]) => ({
          moduleId:    makePKBId(`kgb-mod-${groupName}`),
          name:        groupName,
          path:        `session://${sessionId}/${groupName}`,
          layer:       toLayer(groupName.slice(0, -1)) as ArchitecturalLayer,
          entityIds:   items.map((e) => e.fusedId),
          dependsOn:   [],
          usedBy:      [],
          fileCount:   items.length,
          entityCount: items.length,
        }));

      // ── Build layer map ────────────────────────────────────────────────

      const layers: Record<ArchitecturalLayer, string[]> = {
        presentation:    [],
        orchestration:   [],
        connector:       [],
        engine:          [],
        utility:         [],
        type_definition: [],
        test:            [],
        config:          [],
        unknown:         [],
      };
      for (const e of archEntities) {
        layers[e.layer].push(e.id);
      }

      // ── Dead code & circular deps: none in conversational graph ────────

      const circularDeps: string[][] = [];
      const deadCode: string[] = archEntities
        .filter((e) => e.dependents.length === 0 && e.type !== "module")
        .map((e) => e.name)
        .slice(0, 20);

      // ── Coverage: ratio of entities with confidence > 0.5 ──────────────

      const highConf = archEntities.filter((e) => e.confidence > 0.5).length;
      const coverage = archEntities.length > 0 ? highConf / archEntities.length : 0;

      // ── Assemble ProjectKnowledgeGraph ─────────────────────────────────

      const graph: ProjectKnowledgeGraph = {
        graphId:           makePKBId("kgb-graph"),
        owner:             "conversational-memory",
        repo:              sessionId,
        branch:            "session",
        commit:            model.modelId,
        entities:          archEntities,
        relationships:     archRelationships,
        modules,
        layers,
        circularDeps,
        deadCode,
        coverage,
        entityCount:       archEntities.length,
        relationshipCount: archRelationships.length,
        builtAt:           Date.now(),
        durationMs:        Date.now() - t0,
      };

      // ── Persist ────────────────────────────────────────────────────────

      KnowledgeGraphStore.set(graph, CALLER);
      KnowledgeGraphStore.recordIncrementalUpdate();

      this._totalPersisted++;

      return {
        persisted:   true,
        reason:      `persisted ${archEntities.length} entities, ${archRelationships.length} relationships`,
        entityCount: archEntities.length,
        durationMs:  Date.now() - t0,
      };

    } catch (err) {
      this._totalSkipped++;
      return {
        persisted:   false,
        reason:      `error: ${String(err)}`,
        entityCount: 0,
        durationMs:  Date.now() - t0,
      };
    }
  }

  // ── Observability ──────────────────────────────────────────────────────────

  getMetrics() {
    return {
      totalPersisted: this._totalPersisted,
      totalSkipped:   this._totalSkipped,
      kgsReady:       KnowledgeGraphStore.isReady(),
      kgsDiagnostics: KnowledgeGraphStore.diagnostics(),
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__KGB_BRIDGE__";
const _g   = globalThis as Record<string, unknown>;
if (!_g[_KEY]) _g[_KEY] = new KnowledgeGraphBridgeClass();

export const knowledgeGraphBridge = _g[_KEY] as KnowledgeGraphBridgeClass;
export { KnowledgeGraphBridgeClass };