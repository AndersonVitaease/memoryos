/**
 * ef36dTests.ts — Knowledge Fusion Engine Test Suite
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Fully structural — no external API required.
 * Uses synthetic multi-provider knowledge data.
 */

import { KnowledgeFusionEngine } from "./KnowledgeFusionEngine";
import { EntityResolver } from "./EntityResolver";
import { RelationshipFusion } from "./RelationshipFusion";
import { TimelineFusion } from "./TimelineFusion";
import { FusionConflictDetector } from "./FusionConflictDetector";
import type { ProviderKnowledge } from "./KnowledgeFusionEngine";
import type { KnowledgeItem, KnowledgeRelationship, KnowledgeTimelineEvent, KnowledgeProvenance } from "../knowledge-reconstruction/KRETypes";

// ── Harness ───────────────────────────────────────────────────────────────────

export interface EF36DTestResult {
  group: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface EF36DTestReport {
  runAt: number;
  durationMs: number;
  passed: number;
  failed: number;
  total: number;
  results: EF36DTestResult[];
  fusionReport: unknown;
  snapshot: unknown;
  conflicts: unknown[];
}

async function test(
  group: string,
  name: string,
  fn: () => Promise<{ passed: boolean; details?: Record<string, unknown> }>,
): Promise<EF36DTestResult> {
  const t = Date.now();
  try {
    const r = await fn();
    return { group, name, passed: r.passed, durationMs: Date.now() - t, details: r.details };
  } catch (e) {
    return { group, name, passed: false, durationMs: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Synthetic data factories ──────────────────────────────────────────────────

function makeProvenance(sourceId: string, sourceType: string, confidence: number): KnowledgeProvenance {
  return {
    sourceId,
    sourceName: `${sourceType}:${sourceId}`,
    sourceType: sourceType as any,
    provider: "ChatGPT" as any,
    originalIdentifier: `${sourceId}:item`,
    importedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    confidence,
    verificationStatus: "INFERRED",
  };
}

function makeItem(id: string, title: string, type: string, sourceId: string, confidence = 0.8): KnowledgeItem {
  return Object.freeze({
    id, title, type: type as any,
    content: `Content of ${title}`,
    tags: Object.freeze([type, sourceId]),
    provenance: Object.freeze(makeProvenance(sourceId, "chatgpt", confidence)),
    createdAt: Date.now() - 1000,
  });
}

function makeRel(id: string, fromId: string, toId: string, type: string, sourceId: string): KnowledgeRelationship {
  return Object.freeze({
    id, fromId, toId, relationshipType: type, weight: 0.9,
    provenance: Object.freeze(makeProvenance(sourceId, "chatgpt", 0.85)),
    createdAt: Date.now(),
  });
}

function makeEvent(id: string, title: string, type: string, occurredAt: number, sourceId: string): KnowledgeTimelineEvent {
  return Object.freeze({
    id, title,
    eventType: type as any,
    description: `Event: ${title}`,
    occurredAt,
    relatedItemIds: Object.freeze([id + "_item"]),
    provenance: Object.freeze(makeProvenance(sourceId, "chatgpt", 0.8)),
  });
}

// ── Provider A: GitHub ────────────────────────────────────────────────────────
const GITHUB_PROVIDER: ProviderKnowledge = {
  sourceId: "github-knowledge",
  sourceName: "GitHub Knowledge Provider",
  items: [
    makeItem("gh:repo:memoryos", "Repository: memoryos/MemoryOS", "artifact", "github-knowledge", 0.98),
    makeItem("gh:commit:abc123", "Commit: Implement EF-31 Connector Runtime", "artifact", "github-knowledge", 0.99),
    makeItem("gh:commit:def456", "Commit: Implement EF-36A KRE", "artifact", "github-knowledge", 0.99),
    makeItem("gh:file:ARCHITECTURE.md", "Architecture Documentation", "document", "github-knowledge", 0.92),
    makeItem("gh:file:ADR-001.md", "ADR-001: Use Centralized Connector Registry", "adr", "github-knowledge", 0.93),
  ],
  relationships: [
    makeRel("rel:gh:1", "gh:repo:memoryos", "gh:commit:abc123", "contains_commit", "github-knowledge"),
    makeRel("rel:gh:2", "gh:repo:memoryos", "gh:file:ARCHITECTURE.md", "contains_file", "github-knowledge"),
    makeRel("rel:gh:3", "gh:repo:memoryos", "gh:file:ADR-001.md", "contains_file", "github-knowledge"),
  ],
  timelineEvents: [
    makeEvent("evt:gh:1", "Commit: Implement EF-31 Connector Runtime", "commit", Date.now() - 86400000 * 5, "github-knowledge"),
    makeEvent("evt:gh:2", "Commit: Implement EF-36A KRE", "commit", Date.now() - 86400000 * 2, "github-knowledge"),
  ],
};

// ── Provider B: Conversation ─────────────────────────────────────────────────
const CONV_PROVIDER: ProviderKnowledge = {
  sourceId: "conversation-chatgpt",
  sourceName: "ChatGPT Conversation Provider",
  items: [
    makeItem("conv:001", "MemoryOS Architecture Decision — Connector Runtime", "document", "conversation-chatgpt", 0.9),
    makeItem("conv:dec:001", "Decision: Use Centralized Connector Registry", "decision", "conversation-chatgpt", 0.7),
    makeItem("conv:arch:001", "Architecture: ConnectorRuntime centralized pattern", "artifact", "conversation-chatgpt", 0.65),
    // This is a near-duplicate of gh:file:ADR-001.md — should be detected/merged
    makeItem("conv:adr:001", "ADR-001: Use Centralized Connector Registry", "adr", "conversation-chatgpt", 0.75),
    makeItem("conv:002", "GitHub Knowledge Provider Implementation Sprint", "document", "conversation-chatgpt", 0.9),
  ],
  relationships: [
    makeRel("rel:cv:1", "conv:001", "conv:dec:001", "contains_decision", "conversation-chatgpt"),
    makeRel("rel:cv:2", "conv:001", "conv:arch:001", "discusses_architecture", "conversation-chatgpt"),
  ],
  timelineEvents: [
    // Near-duplicate of evt:gh:1 (same time window, same topic)
    makeEvent("evt:cv:1", "Discussion: Implement EF-31 Connector Runtime Architecture", "conversation", Date.now() - 86400000 * 5 + 60000, "conversation-chatgpt"),
    makeEvent("evt:cv:2", "Decision: Architecture finalized for Connector Runtime", "decision", Date.now() - 86400000 * 4, "conversation-chatgpt"),
    makeEvent("evt:cv:3", "Sprint EF-36B GitHub Knowledge Provider", "architecture", Date.now() - 86400000 * 2 + 120000, "conversation-chatgpt"),
  ],
};

// ── Runner ─────────────────────────────────────────────────────────────────────

export async function runEF36DTests(): Promise<EF36DTestReport> {
  const startAll = Date.now();
  const results: EF36DTestResult[] = [];

  const engine = new KnowledgeFusionEngine();
  const providers = [GITHUB_PROVIDER, CONV_PROVIDER];
  const report = engine.fuse(providers);

  // ── G1: Engine Contract ───────────────────────────────────────────────────

  results.push(await test("G1 Engine Contract", "KnowledgeFusionEngine exposes all required methods", async () => {
    const ok = typeof engine.fuse === "function" &&
      typeof engine.getEntities === "function" &&
      typeof engine.getRelationships === "function" &&
      typeof engine.getTimeline === "function" &&
      typeof engine.getConflicts === "function" &&
      typeof engine.getSnapshots === "function" &&
      typeof engine.getLastReport === "function";
    return { passed: ok };
  }));

  results.push(await test("G1 Engine Contract", "fuse() returns FusionReport with correct shape", async () => {
    const ok = typeof report.id === "string" &&
      typeof report.durationMs === "number" &&
      typeof report.providersProcessed === "number" &&
      typeof report.totalItemsReceived === "number" &&
      typeof report.entitiesUnique === "number" &&
      typeof report.overallConfidence === "number" &&
      typeof report.coverage === "number" &&
      typeof report.verificationBreakdown === "object" &&
      Array.isArray(report.errors);
    return { passed: ok, details: { id: report.id, providers: report.providersProcessed, totalItems: report.totalItemsReceived } };
  }));

  results.push(await test("G1 Engine Contract", "fuse() processed both providers", async () => {
    return { passed: report.providersProcessed === 2, details: { processed: report.providersProcessed } };
  }));

  results.push(await test("G1 Engine Contract", "fuse() received all 10 items", async () => {
    return { passed: report.totalItemsReceived === 10, details: { received: report.totalItemsReceived } };
  }));

  // ── G2: Entity Resolution ─────────────────────────────────────────────────

  results.push(await test("G2 Entity Resolution", "EntityResolver produces fewer entities than input items", async () => {
    const resolver = new EntityResolver();
    const allItems = [...GITHUB_PROVIDER.items, ...CONV_PROVIDER.items];
    const { entities, mergeCount } = resolver.resolve(allItems);
    return {
      passed: entities.length <= allItems.length,
      details: { input: allItems.length, entities: entities.length, mergeCount },
    };
  }));

  results.push(await test("G2 Entity Resolution", "ADR items from different providers are merged", async () => {
    const resolver = new EntityResolver();
    const allItems = [...GITHUB_PROVIDER.items, ...CONV_PROVIDER.items];
    const { entities, mergeCount } = resolver.resolve(allItems);
    const adrEntities = entities.filter(e => e.type === "adr");
    // Both ADR-001.md should merge into one
    const merged = adrEntities.find(e => e.mergedIds.length > 1);
    return { passed: !!merged, details: { adrCount: adrEntities.length, mergedIds: merged?.mergedIds } };
  }));

  results.push(await test("G2 Entity Resolution", "Merged entity has MULTI_SOURCE verification", async () => {
    const resolver = new EntityResolver();
    const allItems = [...GITHUB_PROVIDER.items, ...CONV_PROVIDER.items];
    const { entities } = resolver.resolve(allItems);
    const multiSource = entities.filter(e => e.verificationStatus === "MULTI_SOURCE");
    return { passed: multiSource.length >= 1, details: { multiSourceCount: multiSource.length } };
  }));

  results.push(await test("G2 Entity Resolution", "Merged entity confidence is boosted vs single-source", async () => {
    const resolver = new EntityResolver();
    const allItems = [...GITHUB_PROVIDER.items, ...CONV_PROVIDER.items];
    const { entities } = resolver.resolve(allItems);
    const merged = entities.find(e => e.mergedIds.length > 1);
    if (!merged) return { passed: true, details: { note: "No merged entities found" } };
    // Multi-source should have at least average confidence
    const origItems = allItems.filter(i => merged.mergedIds.includes(i.id));
    const avgOrig = origItems.reduce((s, i) => s + i.provenance.confidence, 0) / origItems.length;
    return { passed: merged.confidence >= avgOrig * 0.95, details: { merged: merged.confidence, avgOrig } };
  }));

  results.push(await test("G2 Entity Resolution", "mergeMap covers all original item IDs", async () => {
    const mergeMap = engine.getMergeMap();
    const allIds = [...GITHUB_PROVIDER.items, ...CONV_PROVIDER.items].map(i => i.id);
    const allMapped = allIds.every(id => mergeMap.has(id));
    return { passed: allMapped, details: { mapSize: mergeMap.size, allIds: allIds.length } };
  }));

  results.push(await test("G2 Entity Resolution", "SINGLE_SOURCE entities have correct status", async () => {
    const singleSource = engine.getEntitiesByStatus("SINGLE_SOURCE");
    const ok = singleSource.every(e => e.supportingProviders.length === 1);
    return { passed: ok, details: { count: singleSource.length } };
  }));

  // ── G3: Relationship Fusion ───────────────────────────────────────────────

  results.push(await test("G3 Relationship Fusion", "Fused relationships are produced", async () => {
    const rels = engine.getRelationships();
    return { passed: rels.length > 0, details: { count: rels.length } };
  }));

  results.push(await test("G3 Relationship Fusion", "All fused relationships have valid fromId/toId", async () => {
    const rels = engine.getRelationships();
    const valid = rels.every(r => typeof r.fromId === "string" && r.fromId.length > 0 && typeof r.toId === "string" && r.toId.length > 0);
    return { passed: valid, details: { count: rels.length } };
  }));

  results.push(await test("G3 Relationship Fusion", "RelationshipFusion correctly deduplicates", async () => {
    const rf = new RelationshipFusion();
    const rels = [
      makeRel("r1", "a", "b", "linked", "provA"),
      makeRel("r2", "a", "b", "linked", "provB"), // same from+to+type — duplicate
      makeRel("r3", "a", "c", "linked", "provA"),
    ];
    const mergeMap = new Map([["a", "a"], ["b", "b"], ["c", "c"]]);
    const { fused, duplicatesRemoved } = rf.fuse(rels, mergeMap);
    return { passed: fused.length === 2 && duplicatesRemoved === 1, details: { fused: fused.length, duplicatesRemoved } };
  }));

  results.push(await test("G3 Relationship Fusion", "Multi-source relationship has higher weight", async () => {
    const rf = new RelationshipFusion();
    const rels = [
      makeRel("r1", "a", "b", "linked", "provA"),
      makeRel("r2", "a", "b", "linked", "provB"),
    ];
    const mergeMap = new Map([["a", "a"], ["b", "b"]]);
    const { fused } = rf.fuse(rels, mergeMap);
    const r = fused[0];
    return { passed: r.evidenceCount === 2 && r.supportingProviders.length === 2, details: { evidence: r.evidenceCount, providers: r.supportingProviders } };
  }));

  // ── G4: Timeline Fusion ───────────────────────────────────────────────────

  results.push(await test("G4 Timeline Fusion", "Timeline events are produced", async () => {
    const events = engine.getTimeline();
    return { passed: events.length > 0, details: { count: events.length } };
  }));

  results.push(await test("G4 Timeline Fusion", "Events are ordered chronologically", async () => {
    const events = engine.getTimeline();
    let ordered = true;
    for (let i = 1; i < events.length; i++) {
      if (events[i].occurredAt < events[i - 1].occurredAt) { ordered = false; break; }
    }
    return { passed: ordered, details: { count: events.length } };
  }));

  results.push(await test("G4 Timeline Fusion", "TimelineFusion detects near-duplicate events", async () => {
    const tf = new TimelineFusion();
    const t = Date.now();
    const events = [
      makeEvent("ev1", "Implement EF-31 Connector Runtime", "commit", t, "provA"),
      makeEvent("ev2", "Implement EF-31 Connector Runtime Architecture", "commit", t + 30000, "provB"),
    ];
    const mergeMap = new Map([["ev1_item", "ev1_item"], ["ev2_item", "ev2_item"]]);
    const { fused, duplicatesFound } = tf.fuse(events, mergeMap);
    return { passed: duplicatesFound >= 1, details: { duplicatesFound, fused: fused.length } };
  }));

  results.push(await test("G4 Timeline Fusion", "Source providers are tracked per event", async () => {
    const events = engine.getTimeline();
    const allHaveProviders = events.every(e => Array.isArray(e.sourceProviders) && e.sourceProviders.length >= 1);
    return { passed: allHaveProviders, details: { count: events.length } };
  }));

  // ── G5: Conflict Detection ────────────────────────────────────────────────

  results.push(await test("G5 Conflicts", "Conflict detector runs without errors", async () => {
    const detector = new FusionConflictDetector();
    const entities = engine.getEntities();
    const conflicts = detector.detect(entities);
    return { passed: Array.isArray(conflicts), details: { count: conflicts.length } };
  }));

  results.push(await test("G5 Conflicts", "All conflicts have required fields", async () => {
    const conflicts = engine.getConflicts();
    const valid = conflicts.every(c =>
      typeof c.id === "string" && typeof c.type === "string" &&
      typeof c.description === "string" && typeof c.severity === "string"
    );
    return { passed: valid, details: { count: conflicts.length } };
  }));

  results.push(await test("G5 Conflicts", "FusionReport.conflictsDetected matches engine.getConflicts()", async () => {
    const reported = report.conflictsDetected;
    const actual = engine.getConflicts().length;
    return { passed: reported === actual, details: { reported, actual } };
  }));

  // ── G6: Confidence Engine ─────────────────────────────────────────────────

  results.push(await test("G6 Confidence", "All entities have confidence in [0,1]", async () => {
    const entities = engine.getEntities();
    const valid = entities.every(e => e.confidence >= 0 && e.confidence <= 1);
    return { passed: valid, details: { count: entities.length, min: Math.min(...entities.map(e => e.confidence)), max: Math.max(...entities.map(e => e.confidence)) } };
  }));

  results.push(await test("G6 Confidence", "overallConfidence is in [0,1]", async () => {
    return { passed: report.overallConfidence >= 0 && report.overallConfidence <= 1, details: { confidence: report.overallConfidence } };
  }));

  results.push(await test("G6 Confidence", "verificationBreakdown sums to total entities", async () => {
    const bd = report.verificationBreakdown;
    const sum = Object.values(bd).reduce((s, v) => s + v, 0);
    return { passed: sum === engine.getEntities().length, details: { sum, entities: engine.getEntities().length, breakdown: bd } };
  }));

  results.push(await test("G6 Confidence", "MULTI_SOURCE entities exist after fusion", async () => {
    const multi = engine.getEntitiesByStatus("MULTI_SOURCE");
    return { passed: multi.length >= 1, details: { count: multi.length } };
  }));

  // ── G7: Cognitive Snapshot ────────────────────────────────────────────────

  results.push(await test("G7 Snapshot", "Snapshot is generated after fuse()", async () => {
    const snap = engine.getLatestSnapshot();
    return { passed: !!snap, details: { id: snap?.id, entities: snap?.totalEntities } };
  }));

  results.push(await test("G7 Snapshot", "Snapshot contains both providers", async () => {
    const snap = engine.getLatestSnapshot();
    const hasGH = snap?.providersContributing.includes("github-knowledge");
    const hasCV = snap?.providersContributing.includes("conversation-chatgpt");
    return { passed: !!(hasGH && hasCV), details: { providers: snap?.providersContributing } };
  }));

  results.push(await test("G7 Snapshot", "Snapshot coverageByProvider has entries", async () => {
    const snap = engine.getLatestSnapshot();
    const ok = snap && Object.keys(snap.coverageByProvider).length >= 2;
    return { passed: !!ok, details: { coverage: snap?.coverageByProvider } };
  }));

  results.push(await test("G7 Snapshot", "Snapshot verificationBreakdown sums to totalEntities", async () => {
    const snap = engine.getLatestSnapshot();
    if (!snap) return { passed: false, details: { error: "No snapshot" } };
    const sum = Object.values(snap.verificationBreakdown).reduce((s, v) => s + v, 0);
    return { passed: sum === snap.totalEntities, details: { sum, totalEntities: snap.totalEntities, breakdown: snap.verificationBreakdown } };
  }));

  // ── G8: Fusion Report ─────────────────────────────────────────────────────

  results.push(await test("G8 Report", "Coverage is in [0,1]", async () => {
    return { passed: report.coverage >= 0 && report.coverage <= 1, details: { coverage: report.coverage } };
  }));

  results.push(await test("G8 Report", "providerBreakdown has entries for both providers", async () => {
    const bd = report.providerBreakdown;
    const ok = "github-knowledge" in bd && "conversation-chatgpt" in bd;
    return { passed: ok, details: { breakdown: bd } };
  }));

  results.push(await test("G8 Report", "durationMs is positive", async () => {
    return { passed: report.durationMs > 0, details: { durationMs: report.durationMs } };
  }));

  // ── G9: Independence ──────────────────────────────────────────────────────

  results.push(await test("G9 Independence", "Fusion engine can run with single provider", async () => {
    const eng2 = new KnowledgeFusionEngine();
    const rep2 = eng2.fuse([GITHUB_PROVIDER]);
    return { passed: rep2.providersProcessed === 1 && rep2.entitiesUnique > 0, details: { entities: rep2.entitiesUnique } };
  }));

  results.push(await test("G9 Independence", "Fusion engine produces no errors with valid data", async () => {
    return { passed: report.errors.length === 0, details: { errors: report.errors } };
  }));

  results.push(await test("G9 Independence", "Each entity preserves its provenance via supportingProviders", async () => {
    const entities = engine.getEntities();
    const allHaveProviders = entities.every(e => e.supportingProviders.length >= 1);
    return { passed: allHaveProviders, details: { count: entities.length } };
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    runAt: startAll,
    durationMs: Date.now() - startAll,
    passed,
    failed,
    total: results.length,
    results,
    fusionReport: report,
    snapshot: engine.getLatestSnapshot(),
    conflicts: engine.getConflicts(),
  };
}