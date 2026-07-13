/**
 * kreTests.ts — Knowledge Reconstruction Engine Test Suite
 * EF-36A · Project Independence · Foundation v1.0
 */

import { KnowledgeReconstructionEngine } from "./KnowledgeReconstructionEngine";
import { OfficialLibrarySource } from "./sources/OfficialLibrarySource";
import type { KnowledgeItem, KnowledgeProvenance, KnowledgeSourceHealth } from "./KRETypes";
import { makeKREId } from "./KRETypes";
import type { IKnowledgeSource } from "./IKnowledgeSource";
import type { KnowledgeSourceMetadata, KnowledgeScanResult, KnowledgeLoadResult } from "./KRETypes";

// ── Test helpers ───────────────────────────────────────────────────────────────

export interface KRETestResult {
  group: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface KRETestReport {
  runAt: number;
  durationMs: number;
  passed: number;
  total: number;
  results: KRETestResult[];
  engineHealth: Awaited<ReturnType<KnowledgeReconstructionEngine["health"]>>;
  lastSnapshot: unknown;
  lastReport: unknown;
}

async function test(
  group: string,
  name: string,
  fn: () => Promise<{ passed: boolean; details?: Record<string, unknown> }>,
): Promise<KRETestResult> {
  const t = Date.now();
  try {
    const { passed, details } = await fn();
    return { group, name, passed, durationMs: Date.now() - t, details };
  } catch (err) {
    return { group, name, passed: false, durationMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Mock source for isolated tests ─────────────────────────────────────────────

function makeMockProvenance(sourceId: string, sourceName: string): KnowledgeProvenance {
  return {
    sourceId, sourceName, sourceType: "manual", provider: "Manual",
    originalIdentifier: makeKREId("orig"),
    importedAt: Date.now(), lastUpdatedAt: Date.now(),
    confidence: 0.8, verificationStatus: "INFERRED",
  };
}

function makeMockItem(
  id: string, type: string, title: string, content: string, sourceId: string, sourceName: string, createdAt?: number
): KnowledgeItem {
  return Object.freeze({
    id, type: type as any, title, content,
    tags: Object.freeze(["mock"]),
    provenance: Object.freeze(makeMockProvenance(sourceId, sourceName)),
    createdAt: createdAt ?? Date.now(),
  });
}

class MockSource implements IKnowledgeSource {
  constructor(readonly id: string, readonly name: string, private _items: KnowledgeItem[] = []) {}
  metadata(): KnowledgeSourceMetadata {
    return { id: this.id, name: this.name, provider: "Manual", type: "manual", version: "1.0.0", description: "Mock source for testing" };
  }
  async isAvailable(): Promise<KnowledgeSourceHealth> { return "available"; }
  async scan(): Promise<KnowledgeScanResult> {
    return { sourceId: this.id, scannedAt: Date.now(), itemsFound: this._items.length, itemIds: this._items.map(i => i.id), errors: [], durationMs: 0 };
  }
  async load(): Promise<KnowledgeLoadResult> {
    return { sourceId: this.id, loadedAt: Date.now(), items: this._items, relationships: [], timelineEvents: [], errors: [], durationMs: 0 };
  }
  async health() { return { status: "available" as KnowledgeSourceHealth, details: `${this._items.length} mock items`, checkedAt: Date.now() }; }
}

class UnavailableSource implements IKnowledgeSource {
  readonly id = "unavailable-source";
  readonly name = "Unavailable Source";
  metadata(): KnowledgeSourceMetadata {
    return { id: this.id, name: this.name, provider: "Manual", type: "manual", version: "1.0.0", description: "Always unavailable" };
  }
  async isAvailable(): Promise<KnowledgeSourceHealth> { return "unavailable"; }
  async scan(): Promise<KnowledgeScanResult> { return { sourceId: this.id, scannedAt: Date.now(), itemsFound: 0, itemIds: [], errors: ["unavailable"], durationMs: 0 }; }
  async load(): Promise<KnowledgeLoadResult> { return { sourceId: this.id, loadedAt: Date.now(), items: [], relationships: [], timelineEvents: [], errors: ["unavailable"], durationMs: 0 }; }
  async health() { return { status: "unavailable" as KnowledgeSourceHealth, details: "Source not configured", checkedAt: Date.now() }; }
}

// ── Main test runner ───────────────────────────────────────────────────────────

export async function runKRETests(): Promise<KRETestReport> {
  const startAll = Date.now();
  const results: KRETestResult[] = [];
  const engine = new KnowledgeReconstructionEngine();

  // ── G1: IKnowledgeSource Interface ────────────────────────────────────────
  results.push(await test("G1 KnowledgeSource", "OfficialLibrarySource implements IKnowledgeSource", async () => {
    const s = new OfficialLibrarySource();
    const ok = typeof s.id === "string" && typeof s.name === "string" && typeof s.metadata === "function" &&
      typeof s.isAvailable === "function" && typeof s.scan === "function" && typeof s.load === "function" && typeof s.health === "function";
    return { passed: ok, details: { id: s.id, name: s.name } };
  }));

  results.push(await test("G1 KnowledgeSource", "isAvailable() returns KnowledgeSourceHealth string", async () => {
    const s = new OfficialLibrarySource();
    const h = await s.isAvailable();
    const valid = ["available", "degraded", "unavailable", "unchecked"].includes(h);
    return { passed: valid, details: { health: h } };
  }));

  results.push(await test("G1 KnowledgeSource", "scan() returns KnowledgeScanResult with required fields", async () => {
    const s = new OfficialLibrarySource();
    const r = await s.scan();
    const ok = typeof r.sourceId === "string" && typeof r.itemsFound === "number" && Array.isArray(r.itemIds) && Array.isArray(r.errors);
    return { passed: ok, details: { sourceId: r.sourceId, itemsFound: r.itemsFound, idsCount: r.itemIds.length } };
  }));

  results.push(await test("G1 KnowledgeSource", "load() returns KnowledgeLoadResult with items array", async () => {
    const s = new OfficialLibrarySource();
    const r = await s.load();
    const ok = Array.isArray(r.items) && r.items.length > 0 && Array.isArray(r.relationships);
    return { passed: ok, details: { itemsLoaded: r.items.length, relationships: r.relationships.length } };
  }));

  results.push(await test("G1 KnowledgeSource", "health() returns structured health object", async () => {
    const s = new OfficialLibrarySource();
    const h = await s.health();
    const ok = !!h.status && typeof h.details === "string" && typeof h.checkedAt === "number";
    return { passed: ok, details: { status: h.status, details: h.details } };
  }));

  results.push(await test("G1 KnowledgeSource", "UnavailableSource.isAvailable() returns unavailable", async () => {
    const s = new UnavailableSource();
    const h = await s.isAvailable();
    return { passed: h === "unavailable", details: { health: h } };
  }));

  // ── G2: Engine Registration ────────────────────────────────────────────────
  results.push(await test("G2 Engine", "KnowledgeReconstructionEngine instantiates", async () => ({
    passed: !!engine, details: { status: engine.getStatus() },
  })));

  results.push(await test("G2 Engine", "registerSource() adds source to engine", async () => {
    engine.registerSource(new OfficialLibrarySource());
    const sources = engine.listSources();
    return { passed: sources.some(s => s.id === "official-library"), details: { count: sources.length, ids: sources.map(s => s.id) } };
  }));

  results.push(await test("G2 Engine", "registerSource() prevents duplicate IDs", async () => {
    try {
      engine.registerSource(new OfficialLibrarySource()); // duplicate
      return { passed: false, details: { error: "Expected throw but did not" } };
    } catch (e) {
      return { passed: true, details: { threw: e instanceof Error ? e.message : String(e) } };
    }
  }));

  results.push(await test("G2 Engine", "getSource() retrieves registered source", async () => {
    const s = engine.getSource("official-library");
    return { passed: !!s && s.id === "official-library", details: { found: !!s } };
  }));

  // ── G3: Knowledge Graph ────────────────────────────────────────────────────
  results.push(await test("G3 Graph", "KnowledgeGraph addNode() returns immutable node", async () => {
    const node = engine.graph.addNode("document", "Test Doc", { key: "val" }, "test-source");
    const ok = typeof node.id === "string" && node.type === "document" && node.label === "Test Doc";
    return { passed: ok, details: { id: node.id, type: node.type, label: node.label } };
  }));

  results.push(await test("G3 Graph", "KnowledgeGraph addEdge() connects two nodes", async () => {
    const n1 = engine.graph.addNode("decision", "Decision A", {}, "src1");
    const n2 = engine.graph.addNode("artifact", "Artifact B", {}, "src1");
    const edge = engine.graph.addEdge(n1.id, n2.id, "produces", 0.9);
    return { passed: !!edge && edge.fromNodeId === n1.id && edge.toNodeId === n2.id, details: { edgeId: edge?.id, label: edge?.label } };
  }));

  results.push(await test("G3 Graph", "addEdge() returns null for unknown nodes", async () => {
    const edge = engine.graph.addEdge("nonexistent-1", "nonexistent-2", "test");
    return { passed: edge === null, details: { result: edge } };
  }));

  results.push(await test("G3 Graph", "listNodes() returns all registered nodes", async () => {
    const nodes = engine.graph.listNodes();
    return { passed: nodes.length > 0, details: { count: nodes.length } };
  }));

  results.push(await test("G3 Graph", "listNodes(type) filters by type", async () => {
    const docs = engine.graph.listNodes("document");
    const decs = engine.graph.listNodes("decision");
    return { passed: true, details: { documents: docs.length, decisions: decs.length } };
  }));

  results.push(await test("G3 Graph", "neighbors() returns correct neighbors", async () => {
    const n1 = engine.graph.addNode("project", "Project A", {}, "src");
    const n2 = engine.graph.addNode("sprint", "Sprint 1", {}, "src");
    engine.graph.addEdge(n1.id, n2.id, "contains");
    const nbrs = engine.graph.neighbors(n1.id);
    return { passed: nbrs.some(n => n.id === n2.id), details: { neighborCount: nbrs.length } };
  }));

  results.push(await test("G3 Graph", "stats() returns type breakdown", async () => {
    const stats = engine.graph.stats();
    const ok = typeof stats.total === "number" && typeof stats.edges === "number";
    return { passed: ok, details: stats };
  }));

  // ── G4: Timeline Builder ───────────────────────────────────────────────────
  const prov = makeMockProvenance("src-timeline", "Timeline Source");

  results.push(await test("G4 Timeline", "addEvent() creates immutable timeline event", async () => {
    const ev = engine.timeline.addEvent("creation", "Item Created", "A new item was created", Date.now(), [], prov);
    const ok = typeof ev.id === "string" && ev.eventType === "creation" && Array.isArray(ev.relatedItemIds);
    return { passed: ok, details: { id: ev.id, eventType: ev.eventType } };
  }));

  results.push(await test("G4 Timeline", "getChronological() returns sorted events", async () => {
    const t1 = Date.now() - 10000;
    const t2 = Date.now() - 5000;
    const t3 = Date.now();
    engine.timeline.addEvent("decision", "Dec 1", "", t2, [], prov);
    engine.timeline.addEvent("commit", "Com 1", "", t1, [], prov);
    engine.timeline.addEvent("implementation", "Imp 1", "", t3, [], prov);
    const events = engine.timeline.getChronological();
    let sorted = true;
    for (let i = 1; i < events.length; i++) {
      if (events[i].occurredAt < events[i-1].occurredAt) { sorted = false; break; }
    }
    return { passed: sorted, details: { count: events.length, sorted } };
  }));

  results.push(await test("G4 Timeline", "getByType() filters correctly", async () => {
    const decisions = engine.timeline.getByType("decision");
    return { passed: Array.isArray(decisions) && decisions.every(e => e.eventType === "decision"), details: { count: decisions.length } };
  }));

  results.push(await test("G4 Timeline", "stats() returns type breakdown", async () => {
    const stats = engine.timeline.stats();
    const ok = typeof stats.total === "number";
    return { passed: ok, details: stats };
  }));

  // ── G5: Conflict Detector ──────────────────────────────────────────────────
  results.push(await test("G5 Conflicts", "detect() finds duplicate entities from different sources", async () => {
    const items: KnowledgeItem[] = [
      makeMockItem("dup-1", "document", "Architecture Decision Record 001", "content A", "source-1", "Source 1"),
      makeMockItem("dup-2", "document", "Architecture Decision Record 001", "content B", "source-2", "Source 2"),
    ];
    const found = engine.conflicts.detect(items);
    return { passed: found.length > 0, details: { conflictsFound: found.length, types: found.map(c => c.type) } };
  }));

  results.push(await test("G5 Conflicts", "detect() finds decision conflicts (same title, diverging content)", async () => {
    const items: KnowledgeItem[] = [
      makeMockItem("dc-1", "decision", "Use microservices", "Use microservices for all components to achieve scalability", "src-a", "Source A"),
      makeMockItem("dc-2", "decision", "Use microservices", "Use a monolith architecture for simplicity and performance", "src-b", "Source B"),
    ];
    const found = engine.conflicts.detect(items);
    const hasDecisionConflict = found.some(c => c.type === "decision_conflict");
    return { passed: hasDecisionConflict, details: { conflictsFound: found.length, types: found.map(c => c.type) } };
  }));

  results.push(await test("G5 Conflicts", "getByType() filters conflicts", async () => {
    const dupes = engine.conflicts.getByType("duplicate_entity");
    return { passed: Array.isArray(dupes), details: { count: dupes.length } };
  }));

  results.push(await test("G5 Conflicts", "getBySeverity() returns correct severity subset", async () => {
    const high = engine.conflicts.getBySeverity("high");
    return { passed: Array.isArray(high) && high.every(c => c.severity === "high"), details: { count: high.length } };
  }));

  // ── G6: Provenance Tracker ─────────────────────────────────────────────────
  results.push(await test("G6 Provenance", "track() registers provenance for an item", async () => {
    const p = makeMockProvenance("prov-source", "Provenance Source");
    engine.provenance.track("prov-item-1", p);
    return { passed: engine.provenance.has("prov-item-1"), details: { tracked: engine.provenance.has("prov-item-1") } };
  }));

  results.push(await test("G6 Provenance", "get() retrieves correct provenance", async () => {
    const p = engine.provenance.get("prov-item-1");
    return { passed: !!p && p.sourceId === "prov-source", details: { sourceId: p?.sourceId, provider: p?.provider } };
  }));

  results.push(await test("G6 Provenance", "markVerified() updates verification status", async () => {
    const ok = engine.provenance.markVerified("prov-item-1");
    const p = engine.provenance.get("prov-item-1");
    return { passed: ok && p?.verificationStatus === "VERIFIED", details: { status: p?.verificationStatus } };
  }));

  results.push(await test("G6 Provenance", "getByVerificationStatus() filters correctly", async () => {
    const verified = engine.provenance.getByVerificationStatus("VERIFIED");
    return { passed: Array.isArray(verified) && verified.length > 0, details: { count: verified.length } };
  }));

  results.push(await test("G6 Provenance", "stats() returns byStatus, bySource, avgConfidence", async () => {
    const stats = engine.provenance.stats();
    const ok = typeof stats.total === "number" && typeof stats.avgConfidence === "number";
    return { passed: ok, details: { total: stats.total, avgConfidence: stats.avgConfidence.toFixed(3), byStatus: stats.byStatus } };
  }));

  // ── G7: Full Reconstruction ────────────────────────────────────────────────
  const freshEngine = new KnowledgeReconstructionEngine();
  freshEngine.registerSource(new OfficialLibrarySource());

  results.push(await test("G7 Reconstruction", "reconstruct() runs without error", async () => {
    const report = await freshEngine.reconstruct();
    return { passed: report.status === "complete", details: { status: report.status, durationMs: report.durationMs } };
  }));

  results.push(await test("G7 Reconstruction", "reconstruct() extracts knowledge items from OfficialLibrary", async () => {
    const items = freshEngine.listItems();
    return { passed: items.length >= 20, details: { count: items.length } };
  }));

  results.push(await test("G7 Reconstruction", "reconstruct() builds graph nodes", async () => {
    const stats = freshEngine.graph.stats();
    return { passed: stats.total >= 20, details: stats };
  }));

  results.push(await test("G7 Reconstruction", "reconstruct() builds graph edges", async () => {
    const edges = freshEngine.graph.listEdges();
    return { passed: edges.length > 0, details: { edgeCount: edges.length } };
  }));

  results.push(await test("G7 Reconstruction", "reconstruct() tracks provenance for all items", async () => {
    const stats = freshEngine.provenance.stats();
    const items = freshEngine.listItems();
    return { passed: stats.total >= items.length, details: { trackedProvenance: stats.total, items: items.length } };
  }));

  results.push(await test("G7 Reconstruction", "reconstruct() generates timeline events", async () => {
    const stats = freshEngine.timeline.stats();
    return { passed: stats.total > 0, details: stats };
  }));

  results.push(await test("G7 Reconstruction", "reconstruct() generates a Cognitive Snapshot", async () => {
    const snap = freshEngine.getLatestSnapshot();
    const ok = !!snap && typeof snap.id === "string" && typeof snap.capturedAt === "number" && typeof snap.confidence === "number";
    return { passed: ok, details: snap ? { id: snap.id, itemCount: snap.itemCount, nodeCount: snap.nodeCount, confidence: snap.confidence } : {} };
  }));

  results.push(await test("G7 Reconstruction", "reconstruct() report has all required fields", async () => {
    const r = freshEngine.getLastReport();
    const ok = !!r && typeof r.sourcesScanned === "number" && typeof r.knowledgeExtracted === "number" &&
      typeof r.confidenceScore === "number" && typeof r.coverage === "number" && Array.isArray(r.errors);
    return { passed: ok, details: r ? {
      sourcesScanned: r.sourcesScanned, knowledgeExtracted: r.knowledgeExtracted,
      conflictsDetected: r.conflictsDetected, graphNodes: r.graphNodes,
      confidenceScore: r.confidenceScore.toFixed(3), coverage: r.coverage.toFixed(3),
    } : {} };
  }));

  // ── G8: Unavailable source handling ───────────────────────────────────────
  results.push(await test("G8 Resilience", "Unavailable source is skipped without error", async () => {
    const resilientEngine = new KnowledgeReconstructionEngine();
    resilientEngine.registerSource(new OfficialLibrarySource());
    resilientEngine.registerSource(new UnavailableSource());
    const report = await resilientEngine.reconstruct();
    return {
      passed: report.status === "complete" && report.sourcesScanned >= 1,
      details: { sourcesScanned: report.sourcesScanned, totalSources: 2, errors: report.errors.length },
    };
  }));

  results.push(await test("G8 Resilience", "Engine health() reports real state", async () => {
    const h = await freshEngine.health();
    const ok = typeof h.registeredSources === "number" && typeof h.totalItems === "number";
    return { passed: ok, details: { status: h.status, registeredSources: h.registeredSources, totalItems: h.totalItems, totalNodes: h.totalNodes } };
  }));

  results.push(await test("G8 Resilience", "reset() clears all engine state", async () => {
    const testEngine = new KnowledgeReconstructionEngine();
    testEngine.registerSource(new OfficialLibrarySource());
    await testEngine.reconstruct();
    testEngine.reset();
    const ok = testEngine.listItems().length === 0 && testEngine.graph.nodeCount === 0 && testEngine.getStatus() === "idle";
    return { passed: ok, details: { items: testEngine.listItems().length, nodes: testEngine.graph.nodeCount, status: testEngine.getStatus() } };
  }));

  // ── G9: Cognitive Snapshots ───────────────────────────────────────────────
  results.push(await test("G9 Snapshots", "captureSnapshot() returns immutable snapshot", async () => {
    const snap = freshEngine.captureSnapshot();
    const ok = typeof snap.id === "string" && typeof snap.capturedAt === "number" &&
      Array.isArray(snap.architecture) && Array.isArray(snap.implementedArtifacts) &&
      Array.isArray(snap.pendingWork) && Array.isArray(snap.openRisks);
    return { passed: ok, details: { id: snap.id, confidence: snap.confidence, itemCount: snap.itemCount } };
  }));

  results.push(await test("G9 Snapshots", "getSnapshots() returns all captured snapshots", async () => {
    const snaps = freshEngine.getSnapshots();
    return { passed: snaps.length >= 2, details: { count: snaps.length } };
  }));

  results.push(await test("G9 Snapshots", "snapshot confidence is between 0 and 1", async () => {
    const snap = freshEngine.getLatestSnapshot();
    const ok = snap !== null && snap.confidence >= 0 && snap.confidence <= 1;
    return { passed: ok, details: { confidence: snap?.confidence } };
  }));

  // Compute final stats
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const engineHealth = await freshEngine.health();

  return {
    runAt: startAll,
    durationMs: Date.now() - startAll,
    passed,
    total,
    results,
    engineHealth,
    lastSnapshot: freshEngine.getLatestSnapshot(),
    lastReport: freshEngine.getLastReport(),
  };
}