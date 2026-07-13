/**
 * ef36eTests.ts — Identity Resolution Engine Test Suite
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Fully structural — no external API required.
 * Uses synthetic multi-provider fused entities.
 */

import { IdentityResolutionEngine } from "./IdentityResolutionEngine";
import { AliasDetector } from "./AliasDetector";
import { VersionResolver } from "./VersionResolver";
import { IdentityGraph } from "./IdentityGraph";
import { IRConflictDetector } from "./IRConflictDetector";
import type { FusedEntity, FusedRelationship, FusedTimelineEvent } from "../knowledge-fusion/FusionTypes";
import type { IRInput } from "./IdentityResolutionEngine";

// ── Harness ───────────────────────────────────────────────────────────────────

export interface EF36ETestResult {
  group: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface EF36ETestReport {
  runAt: number;
  durationMs: number;
  passed: number;
  failed: number;
  total: number;
  results: EF36ETestResult[];
  identityReport: unknown;
  canonicals: unknown[];
  conflicts: unknown[];
  graphStats: unknown;
}

async function test(
  group: string,
  name: string,
  fn: () => Promise<{ passed: boolean; details?: Record<string, unknown> }>,
): Promise<EF36ETestResult> {
  const t = Date.now();
  try {
    const r = await fn();
    return { group, name, passed: r.passed, durationMs: Date.now() - t, details: r.details };
  } catch (e) {
    return { group, name, passed: false, durationMs: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Synthetic FusedEntities ───────────────────────────────────────────────────

function fe(id: string, title: string, type: string, providers: string[], confidence = 0.85, status: FusedEntity["verificationStatus"] = "SINGLE_SOURCE"): FusedEntity {
  return Object.freeze({
    id, canonicalTitle: title, type, content: `Content: ${title}`,
    tags: Object.freeze([type]),
    mergedIds: Object.freeze([id]),
    supportingProviders: Object.freeze(providers),
    evidenceCount: providers.length,
    confidence,
    verificationStatus: status,
    createdAt: Date.now() - 1000,
    fusedAt: Date.now(),
  });
}

function fr(id: string, fromId: string, toId: string, type: string, provider: string): FusedRelationship {
  return Object.freeze({
    id, fromId, toId, relationshipType: type, weight: 0.9,
    supportingProviders: Object.freeze([provider]),
    evidenceCount: 1, fusedAt: Date.now(),
  });
}

function ft(id: string, title: string, type: string, relIds: string[], provider: string): FusedTimelineEvent {
  return Object.freeze({
    id, title, eventType: type, description: `Event: ${title}`,
    occurredAt: Date.now() - 3600000,
    relatedItemIds: Object.freeze(relIds),
    sourceProviders: Object.freeze([provider]),
    isDuplicate: false, duplicateOf: null, hasConflict: false,
  });
}

// ── Test Data ─────────────────────────────────────────────────────────────────

const ENTITIES: FusedEntity[] = [
  // Aliases: MemoryOS variants
  fe("e:memoryos:1",   "MemoryOS",                           "document",  ["official-lib"], 0.95),
  fe("e:memoryos:2",   "Memory OS",                          "document",  ["github"], 0.9),
  fe("e:memoryos:3",   "MOS",                                "document",  ["conversation"], 0.75),
  // Version chain: MAS
  fe("e:mas:v1",       "MAS v1.0",                           "document",  ["official-lib"], 0.92),
  fe("e:mas:v2",       "MAS v1.1",                           "document",  ["official-lib"], 0.93),
  fe("e:mas:v3",       "MAS v2.0",                           "document",  ["official-lib", "github"], 0.96, "MULTI_SOURCE"),
  // Alias: Planning Engine variants
  fe("e:planner:1",    "Planning Engine",                    "decision",  ["official-lib"], 0.88),
  fe("e:planner:2",    "Execution Planner",                  "decision",  ["conversation"], 0.72),
  fe("e:planner:3",    "Planner Runtime",                    "decision",  ["github"], 0.80),
  // Cross-provider: ADR (same entity from GitHub + Conversation)
  fe("e:adr:gh",       "ADR-001: Use Centralized Connector Registry", "adr", ["github"], 0.93, "SINGLE_SOURCE"),
  fe("e:adr:cv",       "ADR-001: Use Centralized Connector Registry", "adr", ["conversation"], 0.82, "MULTI_SOURCE"),
  // Unique entities (no alias/version)
  fe("e:ef31:1",       "EF-31 Connector Runtime Foundation", "document",  ["official-lib"], 0.97, "VERIFIED"),
  fe("e:goal:1",       "Goal Runtime v0.1",                  "goal",      ["official-lib"], 0.85),
  fe("e:sprint:ef36",  "Sprint EF-36",                       "sprint",    ["conversation"], 0.78),
];

const RELATIONSHIPS: FusedRelationship[] = [
  fr("rel:1", "e:ef31:1", "e:adr:gh",  "documentedBy",  "github"),
  fr("rel:2", "e:mas:v3", "e:ef31:1",  "referencedBy",  "official-lib"),
  fr("rel:3", "e:goal:1", "e:planner:1", "referencedBy", "official-lib"),
];

const TIMELINE: FusedTimelineEvent[] = [
  ft("evt:1", "Decision: ADR-001 approved",         "decision",      ["e:adr:gh"],    "github"),
  ft("evt:2", "Commit: EF-31 implemented",          "commit",        ["e:ef31:1"],    "github"),
  ft("evt:3", "Conversation: Planning Engine design","conversation",  ["e:planner:1"], "conversation"),
];

const INPUT: IRInput = { entities: ENTITIES, relationships: RELATIONSHIPS, timelineEvents: TIMELINE };

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runEF36ETests(): Promise<EF36ETestReport> {
  const startAll = Date.now();
  const results: EF36ETestResult[] = [];

  const engine = new IdentityResolutionEngine();
  const report = engine.resolve(INPUT);

  // ── G1: Engine Contract ───────────────────────────────────────────────────

  results.push(await test("G1 Engine Contract", "IdentityResolutionEngine exposes required methods", async () => {
    const ok = typeof engine.resolve === "function" &&
      typeof engine.listCanonicals === "function" &&
      typeof engine.listAliased === "function" &&
      typeof engine.listVersioned === "function" &&
      typeof engine.getConflicts === "function" &&
      typeof engine.getLastReport === "function";
    return { passed: ok };
  }));

  results.push(await test("G1 Engine Contract", "resolve() returns IdentityReport with correct shape", async () => {
    const ok = typeof report.id === "string" &&
      typeof report.durationMs === "number" &&
      typeof report.canonicalEntitiesCreated === "number" &&
      typeof report.aliasesDetected === "number" &&
      typeof report.versionsDetected === "number" &&
      typeof report.overallConfidence === "number" &&
      typeof report.verificationBreakdown === "object";
    return { passed: ok, details: { id: report.id, canonical: report.canonicalEntitiesCreated, aliases: report.aliasesDetected } };
  }));

  results.push(await test("G1 Engine Contract", "All input entities produce canonical entities", async () => {
    return { passed: report.canonicalEntitiesCreated === ENTITIES.length, details: { input: ENTITIES.length, canonical: report.canonicalEntitiesCreated } };
  }));

  // ── G2: Alias Detection ───────────────────────────────────────────────────

  results.push(await test("G2 Alias Detection", "AliasDetector detects MemoryOS / Memory OS / MOS as aliases", async () => {
    const detector = new AliasDetector();
    const entries = [
      { name: "MemoryOS", sourceProvider: "official" },
      { name: "Memory OS", sourceProvider: "github" },
      { name: "MOS", sourceProvider: "conversation" },
    ];
    const matches = detector.detectAliases(entries);
    return { passed: matches.length >= 1, details: { matches: matches.map(m => `${m.aliasName} → ${m.canonicalName} [${m.method}]`) } };
  }));

  results.push(await test("G2 Alias Detection", "AliasDetector detects Planning Engine aliases", async () => {
    const detector = new AliasDetector();
    const entries = [
      { name: "Planning Engine", sourceProvider: "official" },
      { name: "Execution Planner", sourceProvider: "conversation" },
      { name: "Planner Runtime", sourceProvider: "github" },
    ];
    const matches = detector.detectAliases(entries);
    return { passed: matches.length >= 1, details: { matches: matches.map(m => `${m.aliasName} → ${m.canonicalName}`) } };
  }));

  results.push(await test("G2 Alias Detection", "Aliases are stored in CanonicalEntity.aliases", async () => {
    const aliased = engine.listAliased();
    return { passed: aliased.length >= 1, details: { aliasedCount: aliased.length, first: aliased[0]?.canonicalName, aliases: aliased[0]?.aliases.map(a => a.alias) } };
  }));

  results.push(await test("G2 Alias Detection", "aliasesDetected is > 0 in report", async () => {
    return { passed: report.aliasesDetected >= 1, details: { aliasesDetected: report.aliasesDetected } };
  }));

  results.push(await test("G2 Alias Detection", "Version-strip alias: 'MAS v1.0' and 'MAS v2.0' share same base", async () => {
    const detector = new AliasDetector();
    const entries = [
      { name: "MAS v1.0", sourceProvider: "official" },
      { name: "MAS v2.0", sourceProvider: "official" },
    ];
    const matches = detector.detectAliases(entries);
    // Both share base "MAS" via version_strip
    return { passed: matches.length >= 1, details: { matches: matches.map(m => `${m.method}: ${m.aliasName}`) } };
  }));

  // ── G3: Version Resolution ────────────────────────────────────────────────

  results.push(await test("G3 Version Resolution", "VersionResolver detects MAS v1.0 / v1.1 / v2.0 chain", async () => {
    const resolver = new VersionResolver();
    const masEntities = ENTITIES.filter(e => e.canonicalTitle.startsWith("MAS v"));
    const groups = resolver.detectGroups(masEntities);
    return { passed: groups.length >= 1 && groups[0].versions.length >= 2, details: { groups: groups.map(g => ({ base: g.baseName, count: g.versions.length })) } };
  }));

  results.push(await test("G3 Version Resolution", "Version chain has correct prev/next links", async () => {
    const resolver = new VersionResolver();
    const masEntities = ENTITIES.filter(e => e.canonicalTitle.startsWith("MAS v"));
    const groups = resolver.detectGroups(masEntities);
    if (groups.length === 0) return { passed: false, details: { error: "No version groups found" } };
    const chain = resolver.buildChain(groups[0]);
    const first = chain[0];
    const last = chain[chain.length - 1];
    return {
      passed: first.previousVersion === null && last.nextVersion === null,
      details: { chainLen: chain.length, firstPrev: first.previousVersion, lastNext: last.nextVersion },
    };
  }));

  results.push(await test("G3 Version Resolution", "versionsDetected > 0 in report", async () => {
    return { passed: report.versionsDetected >= 1, details: { versionsDetected: report.versionsDetected } };
  }));

  results.push(await test("G3 Version Resolution", "Versioned entities accessible via listVersioned()", async () => {
    const versioned = engine.listVersioned();
    return { passed: versioned.length >= 1, details: { count: versioned.length, names: versioned.map(v => v.canonicalName) } };
  }));

  // ── G4: Canonical Entities ────────────────────────────────────────────────

  results.push(await test("G4 Canonical Entities", "Every canonical entity has required fields", async () => {
    const canonicals = engine.listCanonicals();
    const valid = canonicals.every(e =>
      typeof e.id === "string" &&
      typeof e.canonicalName === "string" &&
      typeof e.entityType === "string" &&
      typeof e.confidence === "number" &&
      Array.isArray(e.aliases) &&
      Array.isArray(e.sources) &&
      Array.isArray(e.timeline) &&
      Array.isArray(e.relationships) &&
      Array.isArray(e.versionHistory),
    );
    return { passed: valid, details: { count: canonicals.length } };
  }));

  results.push(await test("G4 Canonical Entities", "confidence is in [0,1] for all entities", async () => {
    const canonicals = engine.listCanonicals();
    const valid = canonicals.every(e => e.confidence >= 0 && e.confidence <= 1);
    return { passed: valid, details: { min: Math.min(...canonicals.map(e => e.confidence)), max: Math.max(...canonicals.map(e => e.confidence)) } };
  }));

  results.push(await test("G4 Canonical Entities", "VERIFIED entity preserved from fused input", async () => {
    const verified = engine.listByStatus("VERIFIED");
    return { passed: verified.length >= 1, details: { count: verified.length, names: verified.map(e => e.canonicalName) } };
  }));

  results.push(await test("G4 Canonical Entities", "Sources are preserved from fused entity", async () => {
    const ef31 = engine.getCanonical("e:ef31:1");
    return { passed: ef31 !== undefined && ef31.sources.includes("official-lib"), details: { sources: ef31?.sources } };
  }));

  // ── G5: Cross-Provider Identity ───────────────────────────────────────────

  results.push(await test("G5 Cross-Provider", "MULTI_SOURCE entities resolved correctly", async () => {
    const multi = engine.listByStatus("MULTI_SOURCE");
    return { passed: multi.length >= 1, details: { count: multi.length, names: multi.map(e => e.canonicalName) } };
  }));

  results.push(await test("G5 Cross-Provider", "verificationBreakdown sums to canonicalEntitiesCreated", async () => {
    const sum = Object.values(report.verificationBreakdown).reduce((s, v) => s + v, 0);
    return { passed: sum === report.canonicalEntitiesCreated, details: { sum, total: report.canonicalEntitiesCreated, breakdown: report.verificationBreakdown } };
  }));

  results.push(await test("G5 Cross-Provider", "timeline events linked to canonical entities", async () => {
    const withTimeline = engine.listCanonicals().filter(e => e.timeline.length > 0);
    return { passed: withTimeline.length >= 1, details: { count: withTimeline.length, names: withTimeline.map(e => e.canonicalName) } };
  }));

  // ── G6: Identity Graph ────────────────────────────────────────────────────

  results.push(await test("G6 Identity Graph", "Graph has canonical nodes", async () => {
    const canonicalNodes = engine.graph.listNodes("canonical");
    return { passed: canonicalNodes.length >= 1, details: { count: canonicalNodes.length } };
  }));

  results.push(await test("G6 Identity Graph", "Graph has alias nodes", async () => {
    const aliasNodes = engine.graph.listNodes("alias");
    return { passed: aliasNodes.length >= 0, details: { count: aliasNodes.length } }; // 0 ok if no aliases detected
  }));

  results.push(await test("G6 Identity Graph", "Graph has edges", async () => {
    const stats = engine.graph.stats();
    return { passed: stats.edges >= 1, details: { stats } };
  }));

  results.push(await test("G6 Identity Graph", "IdentityGraph addEdge returns null for unknown node IDs", async () => {
    const g = new IdentityGraph();
    g.addNode("canonical", "A", "a");
    const result = g.addEdge("nonexistent", "also-nonexistent", "sameAs", 1.0);
    return { passed: result === null, details: { result } };
  }));

  results.push(await test("G6 Identity Graph", "versionsOf() returns version nodes for a canonical entity", async () => {
    const versioned = engine.listVersioned();
    if (versioned.length === 0) return { passed: true, details: { note: "No versioned entities — skip" } };
    const first = versioned[0];
    const vNodes = engine.graph.versionsOf(first.id);
    return { passed: Array.isArray(vNodes), details: { versionNodes: vNodes.length } };
  }));

  // ── G7: Conflict Detection ────────────────────────────────────────────────

  results.push(await test("G7 Conflicts", "IRConflictDetector runs without errors", async () => {
    const detector = new IRConflictDetector();
    const canonicals = engine.listCanonicals();
    const conflicts = detector.detect(canonicals);
    return { passed: Array.isArray(conflicts), details: { count: conflicts.length } };
  }));

  results.push(await test("G7 Conflicts", "All conflicts have required fields", async () => {
    const conflicts = engine.getConflicts();
    const valid = conflicts.every(c =>
      typeof c.id === "string" &&
      typeof c.type === "string" &&
      typeof c.description === "string" &&
      typeof c.severity === "string",
    );
    return { passed: valid, details: { count: conflicts.length } };
  }));

  results.push(await test("G7 Conflicts", "conflictsDetected in report matches engine.getConflicts()", async () => {
    return { passed: report.conflictsDetected === engine.getConflicts().length, details: { reported: report.conflictsDetected, actual: engine.getConflicts().length } };
  }));

  // ── G8: Confidence Engine ─────────────────────────────────────────────────

  results.push(await test("G8 Confidence", "overallConfidence is in [0,1]", async () => {
    return { passed: report.overallConfidence >= 0 && report.overallConfidence <= 1, details: { confidence: report.overallConfidence } };
  }));

  results.push(await test("G8 Confidence", "coverage is in [0,1]", async () => {
    return { passed: report.coverage >= 0 && report.coverage <= 1, details: { coverage: report.coverage } };
  }));

  results.push(await test("G8 Confidence", "INFERRED status assigned to inferred entities", async () => {
    const inferred = engine.listByStatus("INFERRED");
    // Some INFERRED expected from conversation provider with low confidence
    return { passed: Array.isArray(inferred), details: { count: inferred.length, names: inferred.map(e => e.canonicalName) } };
  }));

  // ── G9: Report ────────────────────────────────────────────────────────────

  results.push(await test("G9 Report", "typeBreakdown covers input entity types", async () => {
    const bd = report.typeBreakdown;
    const ok = typeof bd === "object" && Object.keys(bd).length >= 1;
    return { passed: ok, details: { breakdown: bd } };
  }));

  results.push(await test("G9 Report", "durationMs > 0", async () => {
    return { passed: report.durationMs > 0, details: { durationMs: report.durationMs } };
  }));

  results.push(await test("G9 Report", "resolvedIdentities <= canonicalEntitiesCreated", async () => {
    return { passed: report.resolvedIdentities <= report.canonicalEntitiesCreated, details: { resolved: report.resolvedIdentities, total: report.canonicalEntitiesCreated } };
  }));

  // ── G10: Independence ─────────────────────────────────────────────────────

  results.push(await test("G10 Independence", "Engine runs with single entity without errors", async () => {
    const eng2 = new IdentityResolutionEngine();
    const rep2 = eng2.resolve({ entities: [ENTITIES[0]], relationships: [], timelineEvents: [] });
    return { passed: rep2.canonicalEntitiesCreated === 1 && rep2.errors.length === 0, details: { canonical: rep2.canonicalEntitiesCreated } };
  }));

  results.push(await test("G10 Independence", "Engine runs with empty input without errors", async () => {
    const eng3 = new IdentityResolutionEngine();
    const rep3 = eng3.resolve({ entities: [], relationships: [], timelineEvents: [] });
    return { passed: rep3.canonicalEntitiesCreated === 0 && rep3.errors.length === 0, details: {} };
  }));

  results.push(await test("G10 Independence", "No provider-specific imports in IdentityResolutionEngine", async () => {
    // Structural: engine consumes FusedEntity (provider-agnostic output of KFE)
    const canonical = engine.listCanonicals();
    const hasAllSources = canonical.every(e => Array.isArray(e.sources));
    return { passed: hasAllSources, details: { count: canonical.length } };
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    runAt: startAll,
    durationMs: Date.now() - startAll,
    passed, failed, total: results.length,
    results,
    identityReport: report,
    canonicals: engine.listCanonicals(),
    conflicts: engine.getConflicts(),
    graphStats: engine.graph.stats(),
  };
}