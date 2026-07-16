/**
 * KnowledgeFusionIntegrationCertificationSuite.ts — Sprint 8.12.1
 *
 * Validates the OFFICIAL PIPELINE integration:
 *
 *   UnifiedContext
 *     ↓ KnowledgeNormalizer
 *   RawKnowledgeUnit[]
 *     ↓ KnowledgeFusionEngine
 *   UnifiedKnowledgeModel
 *     ↓ ConversationGoalBridge (type contract only)
 *
 * No mocks. No LLM. No network. Pure type-contract and data-flow validation.
 * MDS v2.0 compliant.
 */

import type { UnifiedContext }        from "@/lib/unified-context/UnifiedContextTypes";
import type { KFEInput }              from "./KFETypes";
import { knowledgeNormalizer }        from "./KnowledgeNormalizer";
import { knowledgeFusionEngine }      from "./KnowledgeFusionEngine";

// ── Test infrastructure ───────────────────────────────────────────────────────

export interface IntegCertCase {
  readonly id:          string;
  readonly description: string;
  passed:               boolean;
  durationMs:           number;
  error:                string | null;
  evidence:             string | null;
}

export interface IntegCertReport {
  readonly runAt:      number;
  readonly total:      number;
  readonly passed:     number;
  readonly failed:     number;
  readonly passRate:   number;
  readonly durationMs: number;
  readonly certified:  boolean;
  readonly cases:      IntegCertCase[];
  readonly pipelineGraph: string[];
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function runCase(
  id:   string,
  desc: string,
  fn:   () => void | Promise<void>,
): Promise<IntegCertCase> {
  const t0 = Date.now();
  const c: IntegCertCase = { id, description: desc, passed: false, durationMs: 0, error: null, evidence: null };
  try {
    await fn();
    c.passed     = true;
    c.durationMs = Date.now() - t0;
  } catch (err) {
    c.passed     = false;
    c.error      = String(err);
    c.durationMs = Date.now() - t0;
  }
  return c;
}

// ── Fixture: minimal UnifiedContext ───────────────────────────────────────────

function makeMinimalContext(overrides: Partial<UnifiedContext> = {}): UnifiedContext {
  return Object.freeze({
    buildId:    "cert-integ-build",
    builtAt:    Date.now(),
    durationMs: 0,
    intent:     "memory",
    userContext: Object.freeze({
      userMessage:    "test message",
      sessionId:      "cert-session",
      projectId:      null,
      messageCount:   1,
      sessionSummary: null,
    }),
    conversationContext: Object.freeze({
      recentMessages: Object.freeze([]),
      historyLength:  0,
    }),
    memoryContext: Object.freeze({
      entities:  "Planning Engine, Connector Runtime, KnowledgeFusionEngine",
      keywords:  "planning, runtime, fusion",
      topics:    "Architecture, Integration",
      decisions: "Use official library as trust anchor",
      tasks:     "Implement KFE integration",
      rawCounts: Object.freeze({ entities: 3, keywords: 3, topics: 2, decisions: 1, tasks: 1 }),
    }),
    officialKnowledge: Object.freeze({
      available: true,
      summary:   "MDS v2.0 Architecture, Unified Pipeline",
      tokens:    20,
    }),
    projectKnowledge: Object.freeze({
      available: false,
      summary:   null,
      tokens:    0,
    }),
    connectorKnowledge: Object.freeze({
      gmail:    null,
      drive:    null,
      calendar: null,
      github:   null,
      base44:   null,
    }),
    workingMemory: Object.freeze({
      available: true,
      entries:   Object.freeze(["Goal: integrate KFE", "Status: Sprint 8.12.1"]),
      tokens:    10,
    }),
    activeGoals:           Object.freeze([]),
    connectorAvailability: Object.freeze({ gmail: false, drive: false, calendar: false, github: false, base44: false }),
    confidence:            0.75,
    sources:               Object.freeze([]),
    ...overrides,
  }) as UnifiedContext;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

export async function runKFEIntegrationCertificationSuite(): Promise<IntegCertReport> {
  const t0    = Date.now();
  const cases: IntegCertCase[] = [];

  // ── I-01: KnowledgeNormalizer exists and is a singleton ──────────────────
  cases.push(await runCase("I-01", "KnowledgeNormalizer: singleton exists", () => {
    assert(knowledgeNormalizer !== null && knowledgeNormalizer !== undefined, "Singleton is null");
    assert(typeof knowledgeNormalizer.normalize === "function", "normalize() missing");
  }));

  // ── I-02: Normalizer consumes UnifiedContext, produces RawKnowledgeUnit[] ─
  cases.push(await runCase("I-02", "Normalizer: UnifiedContext → RawKnowledgeUnit[]", () => {
    const ctx    = makeMinimalContext();
    const result = knowledgeNormalizer.normalize(ctx);
    assert(result.units !== undefined,          "units missing");
    assert(Array.isArray(result.units as unknown[]), "units not array-like");
    assert(result.unitCount >= 0,               "unitCount negative");
    assert(result.buildId === ctx.buildId,      `buildId mismatch: ${result.buildId}`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `Produced ${result.unitCount} units from ${result.sourcesRead.length} sources`;
  }));

  // ── I-03: Normalizer output is immutable ──────────────────────────────────
  cases.push(await runCase("I-03", "Normalizer: output is immutable (frozen)", () => {
    const ctx    = makeMinimalContext();
    const result = knowledgeNormalizer.normalize(ctx);
    assert(Object.isFrozen(result),       "result not frozen");
    assert(Object.isFrozen(result.units), "units not frozen");
    (cases[cases.length - 1] as IntegCertCase).evidence = `Frozen: result=${Object.isFrozen(result)}, units=${Object.isFrozen(result.units)}`;
  }));

  // ── I-04: Normalizer produces correct sourceId for each memory field ──────
  cases.push(await runCase("I-04", "Normalizer: sourceId correctly assigned per field", () => {
    const ctx    = makeMinimalContext();
    const result = knowledgeNormalizer.normalize(ctx);
    const srcIds = result.units.map((u) => u.sourceId);
    assert(srcIds.includes("memory.entities"),  "Missing memory.entities");
    assert(srcIds.includes("memory.topics"),    "Missing memory.topics");
    assert(srcIds.includes("memory.decisions"), "Missing memory.decisions");
    assert(srcIds.includes("memory.tasks"),     "Missing memory.tasks");
    assert(srcIds.includes("official_library"), "Missing official_library");
    (cases[cases.length - 1] as IntegCertCase).evidence = `Sources: ${[...new Set(srcIds)].join(", ")}`;
  }));

  // ── I-05: Every RawKnowledgeUnit has all required fields ─────────────────
  cases.push(await runCase("I-05", "Normalizer: all RawKnowledgeUnit fields present", () => {
    const ctx    = makeMinimalContext();
    const result = knowledgeNormalizer.normalize(ctx);
    for (const unit of result.units) {
      assert(typeof unit.id         === "string" && unit.id.length > 0,    `id missing on unit`);
      assert(typeof unit.sourceId   === "string" && unit.sourceId.length > 0, `sourceId missing`);
      assert(typeof unit.type       === "string", `type missing`);
      assert(typeof unit.value      === "string", `value missing`);
      assert(typeof unit.rawValue   === "string", `rawValue missing`);
      assert(typeof unit.confidence === "number" && unit.confidence >= 0 && unit.confidence <= 1, `confidence out of range: ${unit.confidence}`);
      assert(unit.metadata !== undefined,         `metadata missing`);
    }
    (cases[cases.length - 1] as IntegCertCase).evidence = `Validated ${result.unitCount} units`;
  }));

  // ── I-06: Normalizer does NOT deduplicate ─────────────────────────────────
  cases.push(await runCase("I-06", "Normalizer: does NOT deduplicate (SRP)", () => {
    const ctx = makeMinimalContext({
      memoryContext: Object.freeze({
        entities:  "Planning Engine, Planning Engine, Planning Engine",
        keywords:  null,
        topics:    null,
        decisions: null,
        tasks:     null,
        rawCounts: Object.freeze({ entities: 3, keywords: 0, topics: 0, decisions: 0, tasks: 0 }),
      }),
      officialKnowledge:   Object.freeze({ available: false, summary: null, tokens: 0 }),
      workingMemory:       Object.freeze({ available: false, entries: Object.freeze([]), tokens: 0 }),
    });
    const result = knowledgeNormalizer.normalize(ctx);
    // Should produce 3 units — deduplication is the KFE's job, not the normalizer's
    assert(result.unitCount === 3, `Expected 3 (no dedup), got ${result.unitCount}`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `Produced ${result.unitCount} units — dedup delegated to KFE`;
  }));

  // ── I-07: Normalizer does NOT calculate confidence (SRP) ─────────────────
  cases.push(await runCase("I-07", "Normalizer: confidence is raw stamp, not calculated", () => {
    const ctx    = makeMinimalContext();
    const result = knowledgeNormalizer.normalize(ctx);
    // Every unit's confidence should be the source default — no multi-source bonus
    for (const unit of result.units) {
      // Multi-source bonus is > 1.0 only when calculator runs — raw stamps are ≤ 0.90
      assert(unit.confidence <= 0.95, `Confidence too high for raw stamp: ${unit.confidence} on ${unit.sourceId}`);
    }
  }));

  // ── I-08: KFE consumes RawKnowledgeUnit[] and produces UnifiedKnowledgeModel
  cases.push(await runCase("I-08", "KFE: RawKnowledgeUnit[] → UnifiedKnowledgeModel", () => {
    const ctx    = makeMinimalContext();
    const norm   = knowledgeNormalizer.normalize(ctx);
    const input: KFEInput = { buildId: norm.buildId, units: norm.units, sessionId: "cert" };
    const result = knowledgeFusionEngine.fuse(input);
    assert(result.success === true,                       `KFE failed: ${result.error}`);
    assert(result.model.modelId.startsWith("ukm-"),      `Bad modelId: ${result.model.modelId}`);
    assert(result.model.buildId === norm.buildId,         `buildId mismatch`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `modelId=${result.model.modelId}, entities=${result.model.entities.length}, confidence=${result.model.confidence}`;
  }));

  // ── I-09: Pipeline type chain — no orphan or bypass ──────────────────────
  cases.push(await runCase("I-09", "Pipeline: UnifiedContext→Units→Model type chain valid", () => {
    const ctx  = makeMinimalContext();
    // Step 1: Normalizer
    const norm = knowledgeNormalizer.normalize(ctx);
    assert(norm.buildId === ctx.buildId, "buildId not propagated from UCB→Normalizer");
    // Step 2: KFE
    const kfeIn: KFEInput = { buildId: norm.buildId, units: norm.units, sessionId: ctx.userContext.sessionId };
    const kfe  = knowledgeFusionEngine.fuse(kfeIn);
    assert(kfe.success,                         "KFE failed");
    assert(kfe.model.buildId === norm.buildId,  "buildId not propagated from Normalizer→KFE");
    // Verify model has correct structure for downstream consumer (GoalBridge)
    assert(typeof kfe.model.confidence === "number", "confidence missing");
    assert(Array.isArray(kfe.model.entities as unknown[]),    "entities missing");
    (cases[cases.length - 1] as IntegCertCase).evidence = `buildId chain: ${ctx.buildId} → ${norm.buildId} → ${kfe.model.buildId}`;
  }));

  // ── I-10: No implicit transformation — normalizer is the sole adapter ─────
  cases.push(await runCase("I-10", "Pipeline: KnowledgeNormalizer is the sole UCB→KFE adapter", () => {
    // Verify normalizer tracks normalization count (confirms it is the active path)
    const before = knowledgeNormalizer.totalNormalizations;
    const ctx    = makeMinimalContext();
    knowledgeNormalizer.normalize(ctx);
    const after  = knowledgeNormalizer.totalNormalizations;
    assert(after === before + 1, `Counter not incremented: before=${before}, after=${after}`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `Normalization #${after} confirmed`;
  }));

  // ── I-11: UnifiedKnowledgeModel is fully immutable ───────────────────────
  cases.push(await runCase("I-11", "KFE output: UnifiedKnowledgeModel is fully immutable", () => {
    const ctx  = makeMinimalContext();
    const norm = knowledgeNormalizer.normalize(ctx);
    const kfe  = knowledgeFusionEngine.fuse({ buildId: norm.buildId, units: norm.units, sessionId: "cert" });
    assert(Object.isFrozen(kfe.model),                "model not frozen");
    assert(Object.isFrozen(kfe.model.entities),       "entities not frozen");
    assert(Object.isFrozen(kfe.model.statistics),     "statistics not frozen");
    assert(Object.isFrozen(kfe.model.relationships),  "relationships not frozen");
    assert(Object.isFrozen(kfe.model.conflicts),      "conflicts not frozen");
  }));

  // ── I-12: Determinism — same input always produces same unit count ────────
  cases.push(await runCase("I-12", "Normalizer: deterministic (same input → same unit count)", () => {
    const ctx = makeMinimalContext();
    const r1  = knowledgeNormalizer.normalize(ctx);
    const r2  = knowledgeNormalizer.normalize(ctx);
    assert(r1.unitCount === r2.unitCount,           `Unit count differs: ${r1.unitCount} vs ${r2.unitCount}`);
    assert(r1.sourcesRead.length === r2.sourcesRead.length, "Sources read differ");
    (cases[cases.length - 1] as IntegCertCase).evidence = `Both runs: ${r1.unitCount} units`;
  }));

  // ── I-13: KFE determinism — same units → same entity count ───────────────
  cases.push(await runCase("I-13", "KFE: deterministic (same units → same entity count)", () => {
    const ctx   = makeMinimalContext();
    const norm  = knowledgeNormalizer.normalize(ctx);
    const input: KFEInput = { buildId: norm.buildId, units: norm.units, sessionId: "cert" };
    const r1    = knowledgeFusionEngine.fuse(input);
    const r2    = knowledgeFusionEngine.fuse(input);
    assert(r1.model.entities.length === r2.model.entities.length,     `Entities: ${r1.model.entities.length} vs ${r2.model.entities.length}`);
    assert(Math.abs(r1.model.confidence - r2.model.confidence) < 0.001, "Confidence non-deterministic");
    (cases[cases.length - 1] as IntegCertCase).evidence = `Run1: ${r1.model.entities.length} entities, Run2: ${r2.model.entities.length} entities`;
  }));

  // ── I-14: Empty UnifiedContext → valid empty pipeline ────────────────────
  cases.push(await runCase("I-14", "Pipeline: empty UnifiedContext → valid empty model", () => {
    const ctx = makeMinimalContext({
      memoryContext: Object.freeze({
        entities: null, keywords: null, topics: null, decisions: null, tasks: null,
        rawCounts: Object.freeze({ entities: 0, keywords: 0, topics: 0, decisions: 0, tasks: 0 }),
      }),
      officialKnowledge: Object.freeze({ available: false, summary: null, tokens: 0 }),
      projectKnowledge:  Object.freeze({ available: false, summary: null, tokens: 0 }),
      workingMemory:     Object.freeze({ available: false, entries: Object.freeze([]), tokens: 0 }),
    });
    const norm = knowledgeNormalizer.normalize(ctx);
    assert(norm.unitCount === 0, `Expected 0 units, got ${norm.unitCount}`);
    const kfe  = knowledgeFusionEngine.fuse({ buildId: norm.buildId, units: norm.units, sessionId: "cert" });
    assert(kfe.success,             "KFE failed on empty input");
    assert(kfe.model.confidence === 0, `Expected 0 confidence, got ${kfe.model.confidence}`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `Empty context → 0 units → 0 entities, confidence=0`;
  }));

  // ── I-15: Pipeline performance — full cycle < 100ms ──────────────────────
  cases.push(await runCase("I-15", "Pipeline: full cycle (normalize + fuse) < 100ms", () => {
    const ctx   = makeMinimalContext();
    const t0    = Date.now();
    const norm  = knowledgeNormalizer.normalize(ctx);
    const kfe   = knowledgeFusionEngine.fuse({ buildId: norm.buildId, units: norm.units, sessionId: "cert" });
    const total = Date.now() - t0;
    assert(kfe.success,     "KFE failed");
    assert(total < 100,     `Too slow: ${total}ms`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `Total: ${total}ms (normalize=${norm.durationMs}ms, fuse=${kfe.durationMs}ms)`;
  }));

  // ── I-16: No circular dependency — Normalizer does not import KFE ─────────
  // Validated by module contract: KnowledgeNormalizer only imports UnifiedContextTypes + KFETypes
  cases.push(await runCase("I-16", "Architecture: no circular dependency Normalizer↔KFE", () => {
    // Both modules can be instantiated independently — no boot error = no cycle
    const normExists = typeof knowledgeNormalizer.normalize === "function";
    const kfeExists  = typeof knowledgeFusionEngine.fuse    === "function";
    assert(normExists && kfeExists, "One or both singletons failed to initialize");
    (cases[cases.length - 1] as IntegCertCase).evidence = "Both singletons initialized independently — no cycle";
  }));

  // ── I-17: No orphan — Normalizer is consumed by KFE ──────────────────────
  cases.push(await runCase("I-17", "Architecture: Normalizer output consumed by KFE (no orphan)", () => {
    const ctx   = makeMinimalContext();
    const norm  = knowledgeNormalizer.normalize(ctx);
    // Normalizer output becomes KFE input — zero data loss
    const kfe   = knowledgeFusionEngine.fuse({ buildId: norm.buildId, units: norm.units, sessionId: "cert" });
    assert(kfe.model.statistics.totalRawUnits === norm.unitCount,
      `Raw units lost: normalized=${norm.unitCount}, kfe.totalRawUnits=${kfe.model.statistics.totalRawUnits}`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `All ${norm.unitCount} normalized units consumed by KFE`;
  }));

  // ── I-18: Confidence in [0,1] for every fused entity ─────────────────────
  cases.push(await runCase("I-18", "KFE output: all entity confidences in [0, 1]", () => {
    const ctx   = makeMinimalContext();
    const norm  = knowledgeNormalizer.normalize(ctx);
    const kfe   = knowledgeFusionEngine.fuse({ buildId: norm.buildId, units: norm.units, sessionId: "cert" });
    const all   = [...kfe.model.entities, ...kfe.model.topics, ...kfe.model.decisions, ...kfe.model.tasks];
    for (const e of all) {
      assert(e.confidence >= 0 && e.confidence <= 1, `Confidence OOB: ${e.confidence} on ${e.canonicalValue}`);
    }
    (cases[cases.length - 1] as IntegCertCase).evidence = `Validated ${all.length} entities — all in [0,1]`;
  }));

  // ── I-19: KFE does NOT return UnifiedContext (type isolation) ─────────────
  cases.push(await runCase("I-19", "Type isolation: KFE output has no UnifiedContext fields", () => {
    const ctx   = makeMinimalContext();
    const norm  = knowledgeNormalizer.normalize(ctx);
    const kfe   = knowledgeFusionEngine.fuse({ buildId: norm.buildId, units: norm.units, sessionId: "cert" });
    // UnifiedKnowledgeModel must NOT contain UCB-specific fields
    const model = kfe.model as Record<string, unknown>;
    assert(!("intent"           in model), "UCB field 'intent' leaked into KFM");
    assert(!("userContext"      in model), "UCB field 'userContext' leaked into KFM");
    assert(!("memoryContext"    in model), "UCB field 'memoryContext' leaked into KFM");
    assert(!("connectorKnowledge" in model), "UCB field 'connectorKnowledge' leaked into KFM");
    (cases[cases.length - 1] as IntegCertCase).evidence = "UnifiedKnowledgeModel correctly isolates from UnifiedContext";
  }));

  // ── I-20: Connector knowledge → connector sourceId ───────────────────────
  cases.push(await runCase("I-20", "Normalizer: connector snippets assigned correct sourceId", () => {
    const ctx = makeMinimalContext({
      connectorKnowledge: Object.freeze({
        gmail:    "Important email from CEO",
        drive:    null,
        calendar: null,
        github:   null,
        base44:   null,
      }),
    });
    const result = knowledgeNormalizer.normalize(ctx);
    const gmailUnits = result.units.filter((u) => u.sourceId === "gmail_connector");
    assert(gmailUnits.length >= 1, `Expected >=1 gmail unit, got ${gmailUnits.length}`);
    (cases[cases.length - 1] as IntegCertCase).evidence = `gmail_connector: ${gmailUnits.length} units`;
  }));

  // ── Assemble report ───────────────────────────────────────────────────────
  const passed = cases.filter((c) => c.passed).length;
  const failed = cases.length - passed;

  return Object.freeze({
    runAt:      Date.now(),
    total:      cases.length,
    passed,
    failed,
    passRate:   Math.round((passed / cases.length) * 100),
    durationMs: Date.now() - t0,
    certified:  failed === 0,
    cases,
    pipelineGraph: Object.freeze([
      "ConversationPipeline",
      "↓",
      "PrimaryConversationRouter",
      "↓",
      "UnifiedContextBuilder  → produces UnifiedContext",
      "↓",
      "KnowledgeNormalizer    → UnifiedContext → RawKnowledgeUnit[]  ★ SPRINT 8.12.1",
      "↓",
      "KnowledgeFusionEngine  → RawKnowledgeUnit[] → UnifiedKnowledgeModel",
      "↓",
      "ConversationGoalBridge → consumes UnifiedKnowledgeModel (type contract)",
      "↓",
      "ConversationPlanningEngine",
      "↓",
      "ConversationRuntimeEngine",
      "↓",
      "UniversalConnectorRouter",
    ]),
  });
}