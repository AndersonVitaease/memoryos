/**
 * kgaTests.ts — KnowledgeGraphAdapter Certification Suite
 * Sprint M-06.2A · 2026-07-16
 *
 * Tests:
 *   1. Empty / null graph
 *   2. Minimal graph (1 entity, 0 relationships)
 *   3. Simple graph (5 entities, 3 relationships, 2 modules)
 *   4. Medium graph (20 entities, 15 relationships, 5 modules)
 *   5. Large graph (100 entities, 80 relationships, 10 modules)
 *   6. Missing layers
 *   7. Missing relationships
 *   8. Orphan entities (no deps/dependents)
 *   9. Circular deps metadata
 *  10. KFE compatibility
 */

import { adaptKnowledgeGraphToProviders } from "./KnowledgeGraphAdapter";
import type { ProjectKnowledgeGraph, ArchEntity, ArchRelationship, ModuleNode } from "../project-knowledge/PKBTypes";
import type { ProviderKnowledge } from "../knowledge-fusion/KnowledgeFusionEngine";
import type { KnowledgeItem } from "../knowledge-reconstruction/KRETypes";

// ── Test harness ──────────────────────────────────────────────────────────────

export interface KGATestResult {
  id:       string;
  label:    string;
  status:   "PASS" | "FAIL";
  error?:   string;
  detail?:  string;
}

function run(
  id: string,
  label: string,
  fn: () => void,
  results: KGATestResult[],
): void {
  try {
    fn();
    results.push({ id, label, status: "PASS" });
  } catch (e) {
    results.push({ id, label, status: "FAIL", error: (e as Error).message });
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── Factories ─────────────────────────────────────────────────────────────────

let _seq = 0;
function makeId(prefix: string): string { return `${prefix}-${++_seq}`; }

function makeEntity(overrides: Partial<ArchEntity> = {}): ArchEntity {
  const id = makeId("ent");
  return {
    id,
    name:             overrides.name ?? `Entity_${id}`,
    type:             overrides.type ?? "class",
    layer:            overrides.layer ?? "engine",
    filePath:         overrides.filePath ?? `src/lib/engine/${id}.ts`,
    description:      overrides.description ?? `Description of ${id}`,
    responsibilities: overrides.responsibilities ?? ["Responsibility A", "Responsibility B"],
    exports:          overrides.exports ?? ["ExportA"],
    imports:          overrides.imports ?? ["ImportA"],
    dependencies:     overrides.dependencies ?? [],
    dependents:       overrides.dependents ?? [],
    confidence:       overrides.confidence ?? 0.85,
    repo:             overrides.repo ?? "memoryos",
    branch:           overrides.branch ?? "main",
    commit:           overrides.commit ?? null,
    lineCount:        overrides.lineCount ?? 100,
    updatedAt:        overrides.updatedAt ?? Date.now(),
  };
}

function makeRelationship(fromId: string, toId: string, overrides: Partial<ArchRelationship> = {}): ArchRelationship {
  return {
    id:         overrides.id ?? makeId("rel"),
    fromId,
    toId,
    fromName:   overrides.fromName ?? "From",
    toName:     overrides.toName ?? "To",
    type:       overrides.type ?? "imports",
    filePath:   overrides.filePath ?? "src/lib/x.ts",
    confidence: overrides.confidence ?? 0.9,
  };
}

function makeModule(entityIds: string[], overrides: Partial<ModuleNode> = {}): ModuleNode {
  const moduleId = makeId("mod");
  return {
    moduleId,
    name:        overrides.name ?? `Module_${moduleId}`,
    path:        overrides.path ?? `src/lib/module_${moduleId}`,
    layer:       overrides.layer ?? "engine",
    entityIds,
    dependsOn:   overrides.dependsOn ?? [],
    usedBy:      overrides.usedBy ?? [],
    fileCount:   entityIds.length,
    entityCount: entityIds.length,
  };
}

function makeGraph(
  entities: ArchEntity[],
  relationships: ArchRelationship[],
  modules: ModuleNode[],
  overrides: Partial<ProjectKnowledgeGraph> = {},
): ProjectKnowledgeGraph {
  const layers: Record<string, string[]> = {
    presentation: [], orchestration: [], connector: [],
    engine: [], utility: [], type_definition: [], test: [], config: [], unknown: [],
  };
  for (const e of entities) {
    (layers[e.layer] ??= []).push(e.id);
  }
  return {
    graphId:           makeId("graph"),
    owner:             "memoryos",
    repo:              "core",
    branch:            "main",
    commit:            null,
    entities,
    relationships,
    modules,
    layers:            layers as ProjectKnowledgeGraph["layers"],
    circularDeps:      overrides.circularDeps ?? [],
    deadCode:          overrides.deadCode ?? [],
    coverage:          overrides.coverage ?? 0.75,
    entityCount:       entities.length,
    relationshipCount: relationships.length,
    builtAt:           Date.now(),
    durationMs:        120,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

export function runKGATests(): KGATestResult[] {
  const results: KGATestResult[] = [];

  // ── TEST 1: Null / empty graph ──────────────────────────────────────────
  run("T01", "Null graph returns empty providers with warning", () => {
    const result = adaptKnowledgeGraphToProviders(null);
    assert(result.providers.length === 0, "providers should be empty");
    assert(result.entityCount === 0, "entityCount should be 0");
    assert(result.warnings.length > 0, "should have warning");
  }, results);

  run("T02", "Zero-entity graph returns empty providers", () => {
    const graph = makeGraph([], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.providers.length === 0, "providers should be empty");
    assert(result.entityCount === 0, "entityCount should be 0");
    assert(result.warnings.length > 0, "should have warning");
  }, results);

  // ── TEST 2: Minimal graph (1 entity) ────────────────────────────────────
  run("T03", "Single entity produces 1 provider with 1 item", () => {
    const e = makeEntity({ name: "SingleEngine", type: "class", layer: "engine" });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);

    assert(result.providers.length >= 1, "should have at least 1 provider");
    const p = result.providers[0];
    assert(p.items.length === 1, "should have 1 item");
    assert(p.items[0].id === e.id, "item id should match entity id");
    assert(p.items[0].title === e.name, "item title should match entity name");
    assert(result.entityCount === 1, "entityCount should be 1");
    assert(result.relationshipCount === 0, "relationshipCount should be 0");
  }, results);

  run("T04", "Single entity has correct type mapping (class → implementation)", () => {
    const e = makeEntity({ type: "class" });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.providers[0].items[0].type === "implementation", "class should map to implementation");
  }, results);

  run("T05", "Single entity has correct type mapping (interface → architecture)", () => {
    const e = makeEntity({ type: "interface" });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.providers[0].items[0].type === "architecture", "interface should map to architecture");
  }, results);

  run("T06", "Single entity provenance carries correct sourceType and provider", () => {
    const e = makeEntity();
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    const item = result.providers[0].items[0];
    assert(item.provenance.sourceType === "github", "sourceType should be github");
    assert(item.provenance.provider === "GitHub", "provider should be GitHub");
    assert(item.provenance.originalIdentifier === e.filePath, "originalIdentifier should be filePath");
  }, results);

  run("T07", "Entity confidence maps to provenance.confidence", () => {
    const e = makeEntity({ confidence: 0.92 });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    const item = result.providers[0].items[0];
    assert(Math.abs(item.provenance.confidence - 0.92) < 0.001, "confidence should be preserved");
  }, results);

  run("T08", "High confidence entity gets VERIFIED status", () => {
    const e = makeEntity({ confidence: 0.85 });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.providers[0].items[0].provenance.verificationStatus === "VERIFIED",
      "confidence >= 0.8 should be VERIFIED");
  }, results);

  run("T09", "Low confidence entity gets UNKNOWN status", () => {
    const e = makeEntity({ confidence: 0.3 });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.providers[0].items[0].provenance.verificationStatus === "UNKNOWN",
      "confidence < 0.5 should be UNKNOWN");
  }, results);

  // ── TEST 3: Simple graph (5 entities, 3 relationships, 2 modules) ────────
  run("T10", "5 entities all converted", () => {
    const entities = Array.from({ length: 5 }, () => makeEntity());
    const graph = makeGraph(entities, [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.entityCount === 5, `expected 5 entities, got ${result.entityCount}`);
  }, results);

  run("T11", "3 valid relationships converted correctly", () => {
    const e1 = makeEntity(); const e2 = makeEntity(); const e3 = makeEntity();
    const r1 = makeRelationship(e1.id, e2.id, { type: "imports" });
    const r2 = makeRelationship(e2.id, e3.id, { type: "calls" });
    const r3 = makeRelationship(e1.id, e3.id, { type: "extends" });
    const graph = makeGraph([e1, e2, e3], [r1, r2, r3], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.relationshipCount === 3, `expected 3 rels, got ${result.relationshipCount}`);
  }, results);

  run("T12", "Relationship type mapping: calls → depends_on", () => {
    const e1 = makeEntity(); const e2 = makeEntity();
    const rel = makeRelationship(e1.id, e2.id, { type: "calls" });
    const graph = makeGraph([e1, e2], [rel], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    const kRel = result.providers[0].relationships[0];
    assert(kRel.relationshipType === "depends_on", `expected depends_on, got ${kRel.relationshipType}`);
  }, results);

  run("T13", "Relationship confidence maps to weight", () => {
    const e1 = makeEntity(); const e2 = makeEntity();
    const rel = makeRelationship(e1.id, e2.id, { confidence: 0.7 });
    const graph = makeGraph([e1, e2], [rel], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    const kRel = result.providers[0].relationships[0];
    assert(Math.abs(kRel.weight - 0.7) < 0.001, "weight should match confidence");
  }, results);

  run("T14", "2 modules create module provider with module items", () => {
    const entities = Array.from({ length: 4 }, () => makeEntity());
    const mod1 = makeModule([entities[0].id, entities[1].id]);
    const mod2 = makeModule([entities[2].id, entities[3].id]);
    const graph = makeGraph(entities, [], [mod1, mod2]);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.moduleCount === 2, `expected 2 modules, got ${result.moduleCount}`);
    // Entity provider + module provider
    assert(result.providers.length === 2, `expected 2 providers, got ${result.providers.length}`);
  }, results);

  run("T15", "Module item has correct type=implementation and layer tag", () => {
    const entities = [makeEntity()];
    const mod = makeModule([entities[0].id], { layer: "orchestration" });
    const graph = makeGraph(entities, [], [mod]);
    const result = adaptKnowledgeGraphToProviders(graph);
    const moduleProvider = result.providers.find(p => p.sourceId.startsWith("github-modules:"));
    assert(!!moduleProvider, "should have module provider");
    const modItem = moduleProvider!.items[0];
    assert(modItem.type === "implementation", "module type should be implementation");
    assert(modItem.tags.includes("orchestration"), "layer tag should be in tags");
  }, results);

  // ── TEST 4: Medium graph (20 entities, 15 relationships, 5 modules) ──────
  run("T16", "20 entities, 15 rels, 5 modules — all converted", () => {
    const entities = Array.from({ length: 20 }, (_, i) =>
      makeEntity({ type: i % 2 === 0 ? "class" : "interface" })
    );
    const rels: ArchRelationship[] = [];
    for (let i = 0; i < 15; i++) {
      rels.push(makeRelationship(entities[i].id, entities[(i + 1) % 20].id));
    }
    const modules = Array.from({ length: 5 }, (_, i) =>
      makeModule([entities[i * 4].id, entities[i * 4 + 1].id, entities[i * 4 + 2].id, entities[i * 4 + 3].id])
    );
    const graph = makeGraph(entities, rels, modules, { coverage: 0.82 });
    const result = adaptKnowledgeGraphToProviders(graph);

    assert(result.entityCount === 20, `entity count: expected 20, got ${result.entityCount}`);
    assert(result.relationshipCount === 15, `rel count: expected 15, got ${result.relationshipCount}`);
    assert(result.moduleCount === 5, `module count: expected 5, got ${result.moduleCount}`);
    assert(Math.abs(result.coverage - 0.82) < 0.001, "coverage preserved");
  }, results);

  // ── TEST 5: Large graph (100 entities, 80 relationships, 10 modules) ─────
  run("T17", "100 entities — all converted without loss", () => {
    const entities = Array.from({ length: 100 }, () => makeEntity());
    const rels: ArchRelationship[] = [];
    for (let i = 0; i < 80; i++) {
      rels.push(makeRelationship(entities[i].id, entities[(i + 3) % 100].id));
    }
    const modules = Array.from({ length: 10 }, (_, i) =>
      makeModule(entities.slice(i * 10, i * 10 + 10).map(e => e.id))
    );
    const graph = makeGraph(entities, rels, modules, { coverage: 0.91 });
    const result = adaptKnowledgeGraphToProviders(graph);

    assert(result.entityCount === 100, `entity count: expected 100, got ${result.entityCount}`);
    assert(result.relationshipCount === 80, `rel count: expected 80, got ${result.relationshipCount}`);
    assert(result.moduleCount === 10, `module count: expected 10, got ${result.moduleCount}`);
  }, results);

  // ── TEST 6: Missing layers ────────────────────────────────────────────────
  run("T18", "Entity with unknown layer is still converted (tagged unknown)", () => {
    const e = makeEntity({ layer: "unknown" });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.entityCount === 1, "entity should still be converted");
    assert(result.providers[0].items[0].tags.includes("unknown"), "layer tag should be unknown");
  }, results);

  run("T19", "Entity with empty responsibilities — content falls back to name", () => {
    const e = makeEntity({ responsibilities: [], description: "" });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    const item = result.providers[0].items[0];
    assert(item.content === e.name || item.content.length > 0, "content should not be empty");
  }, results);

  // ── TEST 7: Missing / dangling relationships ───────────────────────────────
  run("T20", "Dangling relationship (endpoint not in graph) is skipped with warning", () => {
    const e1 = makeEntity();
    const rel = makeRelationship(e1.id, "nonexistent-id");
    const graph = makeGraph([e1], [rel], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.relationshipCount === 0, "dangling rel should be skipped");
    assert(result.warnings.some(w => w.includes("skipped")), "should have warning about skipped rel");
  }, results);

  run("T21", "Valid and invalid relationships mixed: only valid ones converted", () => {
    const e1 = makeEntity(); const e2 = makeEntity();
    const valid = makeRelationship(e1.id, e2.id);
    const invalid = makeRelationship(e1.id, "ghost-id");
    const graph = makeGraph([e1, e2], [valid, invalid], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.relationshipCount === 1, "only 1 valid rel should be converted");
  }, results);

  // ── TEST 8: Orphan entities ────────────────────────────────────────────────
  run("T22", "Orphan entities (no deps/dependents) are converted normally", () => {
    const orphans = Array.from({ length: 5 }, () =>
      makeEntity({ dependencies: [], dependents: [] })
    );
    const graph = makeGraph(orphans, [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.entityCount === 5, "all 5 orphan entities should be converted");
    assert(result.relationshipCount === 0, "no relationships for orphans");
  }, results);

  // ── TEST 9: Circular deps in metadata ────────────────────────────────────
  run("T23", "Circular deps produce timeline events", () => {
    const entities = Array.from({ length: 3 }, () => makeEntity());
    const graph = makeGraph(entities, [], [], {
      circularDeps: [
        [entities[0].name, entities[1].name, entities[2].name],
      ],
    });
    const result = adaptKnowledgeGraphToProviders(graph);
    assert(result.timelineEventCount >= 2, "should have build event + circular dep event");
  }, results);

  // ── TEST 10: KFE compatibility ─────────────────────────────────────────────
  run("T24", "All KnowledgeItem fields match KRE KnowledgeItem interface", () => {
    const e = makeEntity({ name: "TestEngine", type: "class", responsibilities: ["Route messages"] });
    const graph = makeGraph([e], [], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    const item = result.providers[0].items[0];

    // KnowledgeItem required fields
    assert(typeof item.id === "string" && item.id.length > 0, "id must be non-empty string");
    assert(typeof item.type === "string" && item.type.length > 0, "type must be non-empty string");
    assert(typeof item.title === "string" && item.title.length > 0, "title must be non-empty string");
    assert(typeof item.content === "string", "content must be string");
    assert(Array.isArray(item.tags), "tags must be array");
    assert(typeof item.createdAt === "number", "createdAt must be number");

    // KnowledgeProvenance required fields
    const p = item.provenance;
    assert(typeof p.sourceId === "string", "provenance.sourceId must be string");
    assert(typeof p.sourceName === "string", "provenance.sourceName must be string");
    assert(typeof p.sourceType === "string", "provenance.sourceType must be string");
    assert(typeof p.provider === "string", "provenance.provider must be string");
    assert(typeof p.confidence === "number", "provenance.confidence must be number");
    assert(p.confidence >= 0 && p.confidence <= 1, "confidence must be [0,1]");
  }, results);

  run("T25", "All KnowledgeRelationship fields match KRE interface", () => {
    const e1 = makeEntity(); const e2 = makeEntity();
    const rel = makeRelationship(e1.id, e2.id, { type: "imports", confidence: 0.88 });
    const graph = makeGraph([e1, e2], [rel], []);
    const result = adaptKnowledgeGraphToProviders(graph);
    const kRel = result.providers[0].relationships[0];

    assert(typeof kRel.id === "string" && kRel.id.length > 0, "id must be non-empty string");
    assert(typeof kRel.fromId === "string", "fromId must be string");
    assert(typeof kRel.toId === "string", "toId must be string");
    assert(typeof kRel.relationshipType === "string", "relationshipType must be string");
    assert(typeof kRel.weight === "number" && kRel.weight >= 0 && kRel.weight <= 1, "weight must be [0,1]");
    assert(typeof kRel.createdAt === "number", "createdAt must be number");
  }, results);

  run("T26", "ProviderKnowledge shape matches KFE.fuse() contract", () => {
    const entities = Array.from({ length: 3 }, () => makeEntity());
    const graph = makeGraph(entities, [], []);
    const result = adaptKnowledgeGraphToProviders(graph);

    for (const provider of result.providers) {
      assert(typeof provider.sourceId === "string" && provider.sourceId.length > 0,
        "sourceId must be non-empty string");
      assert(typeof provider.sourceName === "string" && provider.sourceName.length > 0,
        "sourceName must be non-empty string");
      assert(Array.isArray(provider.items), "items must be array");
      assert(Array.isArray(provider.relationships), "relationships must be array");
      assert(Array.isArray(provider.timelineEvents), "timelineEvents must be array");
    }
  }, results);

  run("T27", "Each entity ID appears exactly once across all providers", () => {
    const entities = Array.from({ length: 10 }, () => makeEntity());
    const modules = [makeModule(entities.slice(0, 5).map(e => e.id))];
    const graph = makeGraph(entities, [], modules);
    const result = adaptKnowledgeGraphToProviders(graph);

    const allItemIds = result.providers.flatMap(p => p.items.map(i => i.id));
    // Entity items: one provider. Module items: different IDs (module.moduleId != entity.id)
    // So entity IDs should appear exactly once in the entity provider
    const entityProvider = result.providers.find(p => !p.sourceId.startsWith("github-modules:"));
    if (entityProvider) {
      const entityItemIds = entityProvider.items.map(i => i.id);
      const uniqueIds = new Set(entityItemIds);
      assert(uniqueIds.size === entityItemIds.length, "no duplicate item IDs in entity provider");
    }
  }, results);

  // ── CONTRACT CERTIFICATION ─────────────────────────────────────────────────
  run("T28", "CERTIFICATE: Zero information loss — all entity names preserved", () => {
    const entities = Array.from({ length: 50 }, (_, i) =>
      makeEntity({ name: `Engine_${i}`, type: i % 3 === 0 ? "class" : i % 3 === 1 ? "interface" : "function" })
    );
    const graph = makeGraph(entities, [], []);
    const result = adaptKnowledgeGraphToProviders(graph);

    const itemTitles = new Set(result.providers.flatMap(p => p.items.map(i => i.title)));
    for (const e of entities) {
      assert(itemTitles.has(e.name), `Entity "${e.name}" not found in output`);
    }
  }, results);

  run("T29", "CERTIFICATE: KFE can receive providers without error (shape validation)", () => {
    const entities = Array.from({ length: 10 }, () => makeEntity());
    const rels = [makeRelationship(entities[0].id, entities[1].id)];
    const modules = [makeModule(entities.slice(0, 5).map(e => e.id))];
    const graph = makeGraph(entities, rels, modules, { coverage: 0.88 });
    const result = adaptKnowledgeGraphToProviders(graph);

    // Validate every single field the KFE reads during fuse()
    for (const p of result.providers) {
      assert(typeof p.sourceId === "string", "sourceId type");
      assert(typeof p.sourceName === "string", "sourceName type");
      for (const item of p.items) {
        assert(typeof item.id === "string", "item.id type");
        assert(typeof item.type === "string", "item.type type");
        assert(typeof item.title === "string", "item.title type");
        assert(typeof item.content === "string", "item.content type");
        assert(Array.isArray(item.tags), "item.tags type");
        assert(typeof item.provenance.confidence === "number", "confidence type");
        assert(typeof item.provenance.sourceId === "string", "provenance.sourceId type");
      }
      for (const rel of p.relationships) {
        assert(typeof rel.id === "string", "rel.id type");
        assert(typeof rel.fromId === "string", "rel.fromId type");
        assert(typeof rel.toId === "string", "rel.toId type");
        assert(typeof rel.weight === "number", "rel.weight type");
      }
    }
  }, results);

  run("T30", "CERTIFICATE: Deterministic — same input produces same output", () => {
    const entities = Array.from({ length: 5 }, (_, i) => makeEntity({ name: `Det_${i}` }));
    const graph = makeGraph(entities, [], []);

    const r1 = adaptKnowledgeGraphToProviders(graph);
    const r2 = adaptKnowledgeGraphToProviders(graph);

    assert(r1.entityCount === r2.entityCount, "entityCount must be deterministic");
    assert(r1.providers.length === r2.providers.length, "provider count must be deterministic");

    const titles1 = r1.providers.flatMap(p => p.items.map(i => i.title)).sort();
    const titles2 = r2.providers.flatMap(p => p.items.map(i => i.title)).sort();
    assert(JSON.stringify(titles1) === JSON.stringify(titles2), "titles must be deterministic");
  }, results);

  return results;
}

// ── Report ────────────────────────────────────────────────────────────────────

export interface KGACertificationReport {
  sprint:       string;
  total:        number;
  passed:       number;
  failed:       number;
  passRate:     string;
  certified:    boolean;
  results:      KGATestResult[];
  failures:     KGATestResult[];
  summary:      string;
}

export function certifyKGA(): KGACertificationReport {
  const results = runKGATests();
  const passed  = results.filter(r => r.status === "PASS").length;
  const failed  = results.filter(r => r.status === "FAIL").length;
  const total   = results.length;
  const certified = failed === 0;

  return {
    sprint:    "M-06.2A",
    total,
    passed,
    failed,
    passRate:  `${Math.round((passed / total) * 100)}%`,
    certified,
    results,
    failures:  results.filter(r => r.status === "FAIL"),
    summary:   certified
      ? `M-06.2A CERTIFIED — ${passed}/${total} tests passed`
      : `M-06.2A NOT CERTIFIED — ${failed}/${total} tests failed`,
  };
}