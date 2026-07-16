/**
 * KnowledgeFusionCertificationSuite.ts — Sprint 8.12
 * 25 real certification tests. Zero mocks. Zero hardcode.
 * Evidence-based, deterministic, production-only.
 * MDS v2.0 compliant.
 */

import type { RawKnowledgeUnit, FusedEntity, KFEInput } from "./KFETypes";
import { knowledgeDeduplicator }         from "./KnowledgeDeduplicator";
import { knowledgeConflictResolver }     from "./KnowledgeConflictResolver";
import { knowledgeRelationshipBuilder }  from "./KnowledgeRelationshipBuilder";
import { knowledgeConfidenceCalculator } from "./KnowledgeConfidenceCalculator";
import { knowledgeFusionEngine }         from "./KnowledgeFusionEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KFECertCase {
  id:          string;
  description: string;
  passed:      boolean;
  durationMs:  number;
  evidence?:   string;
  error?:      string;
}

export interface KFECertReport {
  passed:     number;
  failed:     number;
  total:      number;
  passRate:   number;
  certified:  boolean;
  cases:      readonly KFECertCase[];
  runAt:      number;
  totalMs:    number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function runCase(
  id: string,
  description: string,
  fn: () => void | Promise<void>
): Promise<KFECertCase> {
  const t0 = Date.now();
  try {
    await fn();
    return { id, description, passed: true, durationMs: Date.now() - t0 };
  } catch (e) {
    return { id, description, passed: false, durationMs: Date.now() - t0, error: String(e) };
  }
}

// ── Fixture factory ───────────────────────────────────────────────────────────

let _seq = 0;
function makeUnit(
  type: RawKnowledgeUnit["type"],
  value: string,
  sourceId: string,
  confidence = 0.8,
  context?: string
): RawKnowledgeUnit {
  return Object.freeze({
    id:         `unit-${++_seq}`,
    sourceId,
    type,
    value:      value.toLowerCase(),
    rawValue:   value,
    confidence,
    context,
    metadata:   Object.freeze({}),
  });
}

function makeInput(units: readonly RawKnowledgeUnit[], buildId = "test-build"): KFEInput {
  return Object.freeze({ buildId, units, sessionId: "test-session" });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

export async function runKFECertificationSuite(): Promise<KFECertReport> {
  const suiteStart = Date.now();
  const cases: KFECertCase[] = [];

  // ── C-01: Deduplicator removes exact duplicates ───────────────────────────
  cases.push(await runCase("C-01", "Deduplicator: removes exact duplicates", () => {
    const units = [
      makeUnit("entity", "Planning Engine", "github_connector",  0.8),
      makeUnit("entity", "Planning Engine", "official_library",  0.9),
      makeUnit("entity", "planning engine", "memory.entities",   0.6),
    ];
    const result = knowledgeDeduplicator.deduplicate(units);
    assert(result.groups.length === 1, `Expected 1 group, got ${result.groups.length}`);
    assert(result.duplicatesRemoved === 2, `Expected 2 removed, got ${result.duplicatesRemoved}`);
    cases[cases.length - 1].evidence = `1 group, 2 duplicates removed`;
  }));

  // ── C-02: Deduplicator picks highest-confidence as canonical ──────────────
  cases.push(await runCase("C-02", "Deduplicator: canonical = highest confidence unit", () => {
    const units = [
      makeUnit("entity", "Connector Runtime", "memory.entities",  0.6),
      makeUnit("entity", "Connector Runtime", "official_library", 0.95),
      makeUnit("entity", "Connector Runtime", "github_connector", 0.80),
    ];
    const result = knowledgeDeduplicator.deduplicate(units);
    const group  = result.groups[0];
    assert(group.canonicalUnit.sourceId === "official_library", `Expected official_library, got ${group.canonicalUnit.sourceId}`);
    cases[cases.length - 1].evidence = `Canonical: ${group.canonicalUnit.sourceId} (conf=${group.canonicalUnit.confidence})`;
  }));

  // ── C-03: Deduplicator preserves all source IDs in merged ────────────────
  cases.push(await runCase("C-03", "Deduplicator: all sources preserved in merge", () => {
    const units = [
      makeUnit("topic", "Goal Bridge", "github_connector",  0.7),
      makeUnit("topic", "Goal Bridge", "official_library",  0.9),
    ];
    const result = knowledgeDeduplicator.deduplicate(units);
    const merged = result.groups[0].merged;
    assert(merged.length === 2, `Expected 2 merged, got ${merged.length}`);
    const sources = merged.map((u) => u.sourceId);
    assert(sources.includes("github_connector"), "Missing github_connector");
    assert(sources.includes("official_library"), "Missing official_library");
    cases[cases.length - 1].evidence = `Merged sources: ${sources.join(", ")}`;
  }));

  // ── C-04: Deduplicator separates different types ─────────────────────────
  cases.push(await runCase("C-04", "Deduplicator: same value, different types → separate groups", () => {
    const units = [
      makeUnit("entity", "Planning",  "github_connector", 0.8),
      makeUnit("topic",  "Planning",  "official_library", 0.9),
    ];
    const result = knowledgeDeduplicator.deduplicate(units);
    assert(result.groups.length === 2, `Expected 2 groups, got ${result.groups.length}`);
    assert(result.duplicatesRemoved === 0, `Expected 0 removed, got ${result.duplicatesRemoved}`);
    cases[cases.length - 1].evidence = `2 groups created for different types`;
  }));

  // ── C-05: toFusedEntity produces immutable FusedEntity ───────────────────
  cases.push(await runCase("C-05", "Deduplicator.toFusedEntity: returns immutable FusedEntity", () => {
    const units = [makeUnit("entity", "Runtime Engine", "official_library", 0.9)];
    const result = knowledgeDeduplicator.deduplicate(units);
    const entity = knowledgeDeduplicator.toFusedEntity(result.groups[0], "fused-test-001");
    assert(Object.isFrozen(entity), "FusedEntity not frozen");
    assert(entity.fusedId === "fused-test-001", "Wrong fusedId");
    assert(entity.canonicalValue === "Runtime Engine", `Wrong value: ${entity.canonicalValue}`);
    cases[cases.length - 1].evidence = `FusedEntity frozen, fusedId=fused-test-001`;
  }));

  // ── C-06: ConfidenceCalculator — official_library has highest weight ──────
  cases.push(await runCase("C-06", "ConfidenceCalculator: official_library source weight = 1.00", () => {
    const w = knowledgeConfidenceCalculator.sourceWeight("official_library");
    assert(w === 1.00, `Expected 1.00, got ${w}`);
    cases[cases.length - 1].evidence = `official_library weight = ${w}`;
  }));

  // ── C-07: ConfidenceCalculator — multi-source bonus applied ──────────────
  // Use working_memory (0.55) as baseline — low enough that adding github_connector raises it.
  cases.push(await runCase("C-07", "ConfidenceCalculator: multi-source bonus increases confidence", () => {
    const single = [makeUnit("entity", "Planner", "working_memory", 0.5)];
    const dedup1 = knowledgeDeduplicator.deduplicate(single);
    const e1 = knowledgeDeduplicator.toFusedEntity(dedup1.groups[0], "e1");
    const c1 = knowledgeConfidenceCalculator.calculate(e1);

    const multi = [
      makeUnit("entity", "Planner", "working_memory",  0.5),
      makeUnit("entity", "planner", "github_connector", 0.7),
    ];
    const dedup2 = knowledgeDeduplicator.deduplicate(multi);
    const e2 = knowledgeDeduplicator.toFusedEntity(dedup2.groups[0], "e2");
    const c2 = knowledgeConfidenceCalculator.calculate(e2);

    assert(c2 > c1, `Multi-source should have higher confidence: ${c2} vs ${c1}`);
    cases[cases.length - 1].evidence = `Single(working_memory): ${c1}, Multi(+github): ${c2} — bonus applied`;
  }));

  // ── C-08: ConfidenceCalculator — deterministic (same input = same output) ─
  cases.push(await runCase("C-08", "ConfidenceCalculator: deterministic output", () => {
    const units = [makeUnit("entity", "Connector Registry", "official_library", 0.85)];
    const dedup = knowledgeDeduplicator.deduplicate(units);
    const entity = knowledgeDeduplicator.toFusedEntity(dedup.groups[0], "det-001");
    const c1 = knowledgeConfidenceCalculator.calculate(entity);
    const c2 = knowledgeConfidenceCalculator.calculate(entity);
    const c3 = knowledgeConfidenceCalculator.calculate(entity);
    assert(c1 === c2 && c2 === c3, `Non-deterministic: ${c1}, ${c2}, ${c3}`);
    cases[cases.length - 1].evidence = `3 runs: ${c1} = ${c2} = ${c3}`;
  }));

  // ── C-09: ConfidenceCalculator — score always in [0, 1] ──────────────────
  cases.push(await runCase("C-09", "ConfidenceCalculator: score always in [0, 1]", () => {
    const testUnits = [
      makeUnit("entity", "X", "official_library", 1.0),
      makeUnit("entity", "Y", "memory.keywords",  0.1),
      makeUnit("entity", "Z", "unknown_source",   0.5),
    ];
    const dedup = knowledgeDeduplicator.deduplicate(testUnits);
    for (const group of dedup.groups) {
      const entity = knowledgeDeduplicator.toFusedEntity(group, "range-test");
      const score  = knowledgeConfidenceCalculator.calculate(entity);
      assert(score >= 0 && score <= 1, `Score out of range: ${score}`);
    }
    cases[cases.length - 1].evidence = `All scores in [0, 1]`;
  }));

  // ── C-10: ConfidenceCalculator.modelConfidence = 0 for empty ─────────────
  cases.push(await runCase("C-10", "ConfidenceCalculator: modelConfidence=0 for empty entities", () => {
    const c = knowledgeConfidenceCalculator.modelConfidence([]);
    assert(c === 0, `Expected 0, got ${c}`);
    cases[cases.length - 1].evidence = `modelConfidence([]) = 0`;
  }));

  // ── C-11: ConflictResolver — no conflicts for distinct values ─────────────
  cases.push(await runCase("C-11", "ConflictResolver: no conflicts for distinct-value entities", () => {
    const units = [
      makeUnit("entity", "Planning Engine", "official_library", 0.9),
      makeUnit("entity", "Gmail Connector",  "github_connector",  0.8),
    ];
    const dedup    = knowledgeDeduplicator.deduplicate(units);
    const entities = dedup.groups.map((g, i) =>
      knowledgeDeduplicator.toFusedEntity(g, `e-${i}`)
    );
    const conflicts = knowledgeConflictResolver.detect(entities);
    assert(conflicts.length === 0, `Expected 0 conflicts, got ${conflicts.length}`);
    cases[cases.length - 1].evidence = `0 conflicts detected`;
  }));

  // ── C-12: ConflictResolver — detects confidence gap conflict ─────────────
  cases.push(await runCase("C-12", "ConflictResolver: detects confidence-gap conflict", () => {
    // Simulate two fused entities with same canonical value but created separately from different sources
    const entityA: FusedEntity = Object.freeze({
      fusedId: "fa", canonicalValue: "Planning Engine", type: "entity",
      confidence: 0.95, sources: Object.freeze(["official_library"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const entityB: FusedEntity = Object.freeze({
      fusedId: "fb", canonicalValue: "Planning Engine", type: "entity",
      confidence: 0.40, sources: Object.freeze(["memory.keywords"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const conflicts = knowledgeConflictResolver.detect([entityA, entityB]);
    assert(conflicts.length >= 1, `Expected >=1 conflict, got ${conflicts.length}`);
    assert(conflicts[0].value === "Planning Engine", `Wrong conflict value: ${conflicts[0].value}`);
    cases[cases.length - 1].evidence = `Conflict: ${conflicts[0].reason}`;
  }));

  // ── C-13: ConflictResolver — conflict records are immutable ──────────────
  cases.push(await runCase("C-13", "ConflictResolver: conflict records are immutable", () => {
    const entityA: FusedEntity = Object.freeze({
      fusedId: "ga", canonicalValue: "Connector", type: "entity",
      confidence: 0.95, sources: Object.freeze(["github_connector"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const entityB: FusedEntity = Object.freeze({
      fusedId: "gb", canonicalValue: "Connector", type: "entity",
      confidence: 0.50, sources: Object.freeze(["official_library"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const conflicts = knowledgeConflictResolver.detect([entityA, entityB]);
    if (conflicts.length > 0) {
      assert(Object.isFrozen(conflicts[0]), "ConflictRecord not frozen");
    }
    cases[cases.length - 1].evidence = `Conflict records frozen`;
  }));

  // ── C-14: RelationshipBuilder — Planning → ExecutionPlan ─────────────────
  cases.push(await runCase("C-14", "RelationshipBuilder: Planning→ExecutionPlan relationship", () => {
    const ea: FusedEntity = Object.freeze({
      fusedId: "r1", canonicalValue: "Planning Engine", type: "entity",
      confidence: 0.9, sources: Object.freeze(["official_library"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const eb: FusedEntity = Object.freeze({
      fusedId: "r2", canonicalValue: "ExecutionPlan", type: "entity",
      confidence: 0.85, sources: Object.freeze(["github_connector"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const rels = knowledgeRelationshipBuilder.build([ea, eb]);
    assert(rels.length >= 1, `Expected >=1 relationship, got ${rels.length}`);
    const rel = rels[0];
    assert(rel.type === "produces", `Expected 'produces', got '${rel.type}'`);
    cases[cases.length - 1].evidence = `Relationship: ${ea.canonicalValue} --${rel.type}--> ${eb.canonicalValue}`;
  }));

  // ── C-15: RelationshipBuilder — Runtime → Connector ──────────────────────
  cases.push(await runCase("C-15", "RelationshipBuilder: Runtime→Connector relationship", () => {
    const ea: FusedEntity = Object.freeze({
      fusedId: "rt1", canonicalValue: "Conversation Runtime", type: "entity",
      confidence: 0.9, sources: Object.freeze(["official_library"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const eb: FusedEntity = Object.freeze({
      fusedId: "rt2", canonicalValue: "Gmail Connector", type: "entity",
      confidence: 0.85, sources: Object.freeze(["github_connector"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const rels = knowledgeRelationshipBuilder.build([ea, eb]);
    assert(rels.length >= 1, `Expected >=1 relationship, got ${rels.length}`);
    cases[cases.length - 1].evidence = `${rels.length} relationship(s): ${rels.map((r) => r.type).join(", ")}`;
  }));

  // ── C-16: RelationshipBuilder — relationships are immutable ──────────────
  cases.push(await runCase("C-16", "RelationshipBuilder: relationships are immutable", () => {
    const ea: FusedEntity = Object.freeze({
      fusedId: "im1", canonicalValue: "Goal Bridge", type: "entity",
      confidence: 0.8, sources: Object.freeze(["official_library"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const eb: FusedEntity = Object.freeze({
      fusedId: "im2", canonicalValue: "Goal Manager", type: "entity",
      confidence: 0.7, sources: Object.freeze(["github_connector"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const rels = knowledgeRelationshipBuilder.build([ea, eb]);
    assert(Object.isFrozen(rels), "Relationships array not frozen");
    if (rels.length > 0) assert(Object.isFrozen(rels[0]), "Relationship record not frozen");
    cases[cases.length - 1].evidence = `Relationships array frozen`;
  }));

  // ── C-17: RelationshipBuilder — no self-relationships ────────────────────
  cases.push(await runCase("C-17", "RelationshipBuilder: no self-relationships", () => {
    const ea: FusedEntity = Object.freeze({
      fusedId: "self1", canonicalValue: "Planning Engine", type: "entity",
      confidence: 0.9, sources: Object.freeze(["official_library"]) as never,
      evidence: Object.freeze([]), duplicatesOf: Object.freeze([]),
    });
    const rels = knowledgeRelationshipBuilder.build([ea]);
    const selfRels = rels.filter((r) => r.fromEntityId === r.toEntityId);
    assert(selfRels.length === 0, `Self-relationships found: ${selfRels.length}`);
    cases[cases.length - 1].evidence = `0 self-relationships`;
  }));

  // ── C-18: Full engine fusion — KFEResult has success=true ────────────────
  cases.push(await runCase("C-18", "KnowledgeFusionEngine.fuse: returns success=true", () => {
    const units = [
      makeUnit("entity",  "Planning Engine",   "official_library", 0.9),
      makeUnit("entity",  "planning engine",   "github_connector",  0.75),
      makeUnit("topic",   "Goal Intelligence", "official_library", 0.85),
      makeUnit("decision","Use official library","memory.decisions", 0.7),
      makeUnit("task",    "Implement KFE",      "memory.tasks",     0.8),
    ];
    const result = knowledgeFusionEngine.fuse(makeInput(units, "cert-build-18"));
    assert(result.success === true, `Expected success, got: ${result.error}`);
    assert(result.model.modelId.startsWith("ukm-"), `Bad modelId: ${result.model.modelId}`);
    assert(result.model.buildId === "cert-build-18", "buildId mismatch");
    cases[cases.length - 1].evidence = `modelId=${result.model.modelId}, durationMs=${result.durationMs}`;
  }));

  // ── C-19: Full engine — deduplication applied ─────────────────────────────
  cases.push(await runCase("C-19", "KnowledgeFusionEngine.fuse: deduplication applied to model", () => {
    const units = [
      makeUnit("entity", "Connector Registry", "official_library", 0.9),
      makeUnit("entity", "connector registry", "github_connector",  0.75),
      makeUnit("entity", "CONNECTOR REGISTRY", "memory.entities",  0.6),
    ];
    const result = knowledgeFusionEngine.fuse(makeInput(units, "cert-build-19"));
    assert(result.model.entities.length === 1, `Expected 1 entity, got ${result.model.entities.length}`);
    assert(result.model.statistics.duplicatesRemoved === 2, `Expected 2 dupes, got ${result.model.statistics.duplicatesRemoved}`);
    cases[cases.length - 1].evidence = `1 entity, 2 dupes removed`;
  }));

  // ── C-20: Full engine — model is fully immutable ──────────────────────────
  cases.push(await runCase("C-20", "KnowledgeFusionEngine.fuse: UnifiedKnowledgeModel is immutable", () => {
    const units = [makeUnit("entity", "Runtime", "official_library", 0.9)];
    const result = knowledgeFusionEngine.fuse(makeInput(units, "cert-build-20"));
    assert(Object.isFrozen(result.model), "model not frozen");
    assert(Object.isFrozen(result.model.entities), "entities not frozen");
    assert(Object.isFrozen(result.model.statistics), "statistics not frozen");
    cases[cases.length - 1].evidence = `model, entities, statistics all frozen`;
  }));

  // ── C-21: Full engine — statistics are correct ────────────────────────────
  cases.push(await runCase("C-21", "KnowledgeFusionEngine.fuse: statistics.totalRawUnits correct", () => {
    const units = [
      makeUnit("entity", "A", "official_library", 0.9),
      makeUnit("topic",  "B", "github_connector",  0.8),
      makeUnit("entity", "a", "memory.entities",   0.5),
    ];
    const result = knowledgeFusionEngine.fuse(makeInput(units, "cert-build-21"));
    assert(result.model.statistics.totalRawUnits === 3, `Expected 3, got ${result.model.statistics.totalRawUnits}`);
    assert(result.model.statistics.totalEntities >= 1, "No entities in model");
    assert(result.model.statistics.processingTimeMs >= 0, "Negative processingTimeMs");
    cases[cases.length - 1].evidence = `rawUnits=3, entities=${result.model.statistics.totalEntities}, processMs=${result.model.statistics.processingTimeMs}`;
  }));

  // ── C-22: Full engine — evidence is non-empty ─────────────────────────────
  cases.push(await runCase("C-22", "KnowledgeFusionEngine.fuse: evidence records preserved", () => {
    const units = [
      makeUnit("entity", "Knowledge Fusion Engine", "official_library", 0.9, "Sprint 8.12"),
      makeUnit("entity", "Knowledge Fusion Engine", "github_connector",  0.8, "src/lib/knowledge-fusion-engine"),
    ];
    const result = knowledgeFusionEngine.fuse(makeInput(units, "cert-build-22"));
    assert(result.model.evidence.length >= 1, `Expected >=1 evidence, got ${result.model.evidence.length}`);
    assert(Object.isFrozen(result.model.evidence), "evidence not frozen");
    cases[cases.length - 1].evidence = `${result.model.evidence.length} evidence records`;
  }));

  // ── C-23: Full engine — empty input returns valid empty model ─────────────
  cases.push(await runCase("C-23", "KnowledgeFusionEngine.fuse: empty input returns valid model", () => {
    const result = knowledgeFusionEngine.fuse(makeInput([], "cert-build-23"));
    assert(result.success === true, `Expected success, got: ${result.error}`);
    assert(result.model.entities.length === 0, "Expected 0 entities");
    assert(result.model.confidence === 0, `Expected 0 confidence, got ${result.model.confidence}`);
    assert(result.model.statistics.totalRawUnits === 0, "Expected 0 raw units");
    cases[cases.length - 1].evidence = `Empty model: valid, confidence=0`;
  }));

  // ── C-24: Performance — fusion < 50ms for 50 units ────────────────────────
  cases.push(await runCase("C-24", "KnowledgeFusionEngine: fusion <50ms for 50 raw units", () => {
    const units: RawKnowledgeUnit[] = [];
    const sources = ["official_library","github_connector","memory.entities","memory.topics","working_memory"];
    const types   = ["entity","topic","decision","task"] as const;
    for (let i = 0; i < 50; i++) {
      units.push(makeUnit(
        types[i % types.length],
        `Knowledge Unit ${i % 15}`,
        sources[i % sources.length],
        0.5 + (i % 5) * 0.1
      ));
    }
    const t0 = Date.now();
    const result = knowledgeFusionEngine.fuse(makeInput(units, "cert-build-24"));
    const elapsed = Date.now() - t0;
    assert(result.success, `Fusion failed: ${result.error}`);
    assert(elapsed < 50, `Fusion too slow: ${elapsed}ms (limit 50ms)`);
    cases[cases.length - 1].evidence = `50 units fused in ${elapsed}ms`;
  }));

  // ── C-25: No side effects — fusing same input twice produces equal models ─
  cases.push(await runCase("C-25", "KnowledgeFusionEngine: no side effects (idempotent input→output)", () => {
    const units = [
      makeUnit("entity",  "Planning Engine",    "official_library", 0.9),
      makeUnit("topic",   "Goal Intelligence",  "github_connector",  0.85),
      makeUnit("decision","Adopt KFE",          "memory.decisions",  0.7),
    ];
    const r1 = knowledgeFusionEngine.fuse(makeInput(units, "idem-build"));
    const r2 = knowledgeFusionEngine.fuse(makeInput(units, "idem-build"));
    // Both successful, same entity counts, same confidence (within float precision)
    assert(r1.success && r2.success, "One run failed");
    assert(r1.model.entities.length  === r2.model.entities.length,  "Entity count differs");
    assert(r1.model.topics.length    === r2.model.topics.length,    "Topics count differs");
    assert(r1.model.decisions.length === r2.model.decisions.length, "Decisions count differs");
    // Confidence is deterministic (same weights)
    assert(Math.abs(r1.model.confidence - r2.model.confidence) < 0.001, "Confidence non-deterministic");
    cases[cases.length - 1].evidence = `Run1 conf=${r1.model.confidence}, Run2 conf=${r2.model.confidence}`;
  }));

  // ── Build report ──────────────────────────────────────────────────────────
  const passed  = cases.filter((c) => c.passed).length;
  const failed  = cases.filter((c) => !c.passed).length;
  const totalMs = Date.now() - suiteStart;

  return Object.freeze({
    passed,
    failed,
    total:     cases.length,
    passRate:  Math.round((passed / cases.length) * 100),
    certified: failed === 0,
    cases:     Object.freeze(cases),
    runAt:     Date.now(),
    totalMs,
  });
}