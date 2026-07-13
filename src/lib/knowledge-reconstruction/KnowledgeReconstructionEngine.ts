/**
 * KnowledgeReconstructionEngine.ts — Core Engine
 * EF-36A · Project Independence · Foundation v1.0
 *
 * Responsibilities:
 *   - Register knowledge providers (IKnowledgeSource)
 *   - Execute scans and loads
 *   - Merge information from all sources
 *   - Detect duplicates and conflicts
 *   - Build the Knowledge Graph
 *   - Build the Timeline
 *   - Track provenance of every item
 *   - Generate Cognitive Snapshots
 *   - Generate Reconstruction Reports
 */

import type { IKnowledgeSource } from "./IKnowledgeSource";
import type {
  KnowledgeItem, KnowledgeRelationship, KnowledgeSnapshot,
  ReconstructionReport, KREHealthReport, ReconstructionStatus,
  GraphNodeType, KnowledgeSourceHealth,
} from "./KRETypes";
import { makeKREId } from "./KRETypes";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { TimelineBuilder } from "./TimelineBuilder";
import { ConflictDetector } from "./ConflictDetector";
import { ProvenanceTracker } from "./ProvenanceTracker";

export class KnowledgeReconstructionEngine {
  // ── Sub-systems ────────────────────────────────────────────────────────────
  readonly graph = new KnowledgeGraph();
  readonly timeline = new TimelineBuilder();
  readonly conflicts = new ConflictDetector();
  readonly provenance = new ProvenanceTracker();

  // ── State ──────────────────────────────────────────────────────────────────
  private readonly sources = new Map<string, IKnowledgeSource>();
  private readonly items = new Map<string, KnowledgeItem>();
  private readonly relationships = new Map<string, KnowledgeRelationship>();
  private readonly snapshots: KnowledgeSnapshot[] = [];
  private status: ReconstructionStatus = "idle";
  private lastReconstructionAt: number | null = null;
  private lastReport: ReconstructionReport | null = null;

  // ── Source Registration ────────────────────────────────────────────────────

  registerSource(source: IKnowledgeSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`KRE: duplicate source id "${source.id}"`);
    }
    this.sources.set(source.id, source);
  }

  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  getSource(sourceId: string): IKnowledgeSource | undefined {
    return this.sources.get(sourceId);
  }

  listSources(): IKnowledgeSource[] {
    return Array.from(this.sources.values());
  }

  // ── Full Reconstruction ────────────────────────────────────────────────────

  async reconstruct(): Promise<ReconstructionReport> {
    const startMs = Date.now();
    const errors: string[] = [];
    const sourcesSummary: { sourceId: string; name: string; itemsLoaded: number; errors: number }[] = [];
    let totalItemsExtracted = 0;
    let totalRelationships = 0;

    // ── Phase 1: Scan all sources ──────────────────────────────────────────
    this.status = "scanning";
    const availableSources: IKnowledgeSource[] = [];
    for (const source of this.sources.values()) {
      try {
        const health = await source.isAvailable();
        if (health === "available" || health === "degraded") {
          availableSources.push(source);
        }
      } catch (e) {
        errors.push(`Source "${source.id}" scan failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── Phase 2: Load all available sources ────────────────────────────────
    this.status = "loading";
    for (const source of availableSources) {
      let itemsLoaded = 0;
      let sourceErrors = 0;
      try {
        const loadResult = await source.load();
        sourceErrors = loadResult.errors.length;
        errors.push(...loadResult.errors);

        for (const item of loadResult.items) {
          this.items.set(item.id, item);
          this.provenance.track(item.id, item.provenance);
          itemsLoaded++;
          totalItemsExtracted++;
        }

        for (const rel of loadResult.relationships) {
          this.relationships.set(rel.id, rel);
          totalRelationships++;
        }

        const added = this.timeline.mergeFrom(loadResult.timelineEvents);
        totalItemsExtracted += 0; // events don't count as knowledge items

      } catch (e) {
        sourceErrors++;
        errors.push(`Source "${source.id}" load failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      sourcesSummary.push({ sourceId: source.id, name: source.name, itemsLoaded, errors: sourceErrors });
    }

    // ── Phase 3: Merge — build unified item list ───────────────────────────
    this.status = "merging";
    const allItems = Array.from(this.items.values());

    // ── Phase 4: Conflict detection ────────────────────────────────────────
    this.status = "detecting_conflicts";
    const newConflicts = this.conflicts.detect(allItems);
    // Mark conflicting items in provenance tracker
    for (const conflict of newConflicts) {
      this.provenance.markConflict(conflict.itemAId);
      this.provenance.markConflict(conflict.itemBId);
    }

    // ── Phase 5: Build Knowledge Graph ─────────────────────────────────────
    this.status = "building_graph";
    this._buildGraph(allItems);

    // ── Phase 6: Build Timeline ────────────────────────────────────────────
    this.status = "building_timeline";
    // Timeline was already merged during load; add graph-derived events
    this._deriveTimelineFromItems(allItems);

    // ── Phase 7: Cognitive Snapshot ────────────────────────────────────────
    this.status = "snapshotting";
    const snapshot = this._captureSnapshot();
    this.snapshots.push(snapshot);

    // ── Phase 8: Report ────────────────────────────────────────────────────
    this.status = "complete";
    this.lastReconstructionAt = Date.now();

    const confidenceScore = this.provenance.stats().avgConfidence;
    const coverage = this.sources.size > 0
      ? availableSources.length / this.sources.size
      : 0;

    const missingInformation: string[] = [];
    if (availableSources.length < this.sources.size) {
      const unavailable = Array.from(this.sources.values()).filter(s => !availableSources.includes(s));
      for (const s of unavailable) missingInformation.push(`Source "${s.name}" was unavailable`);
    }
    if (this.conflicts.count > 0) {
      missingInformation.push(`${this.conflicts.count} conflict(s) require resolution`);
    }

    const report: ReconstructionReport = Object.freeze({
      id: makeKREId("report"),
      generatedAt: Date.now(),
      durationMs: Date.now() - startMs,
      status: "complete",
      sourcesScanned: availableSources.length,
      knowledgeExtracted: totalItemsExtracted,
      conflictsDetected: this.conflicts.count,
      relationshipsCreated: totalRelationships,
      timelineEvents: this.timeline.count,
      snapshotsGenerated: this.snapshots.length,
      graphNodes: this.graph.nodeCount,
      graphEdges: this.graph.edgeCount,
      confidenceScore,
      coverage,
      missingInformation: Object.freeze(missingInformation),
      errors: Object.freeze(errors),
      sourcesSummary: Object.freeze(sourcesSummary),
    });

    this.lastReport = report;
    return report;
  }

  // ── Graph Building ─────────────────────────────────────────────────────────

  private _buildGraph(items: KnowledgeItem[]): void {
    const typeMap: Record<string, GraphNodeType> = {
      document: "document", decision: "decision", artifact: "artifact",
      requirement: "requirement", conversation: "conversation", commit: "commit",
      implementation: "implementation", sprint: "sprint", goal: "goal",
      rfc: "rfc", adr: "adr", connector: "connector", specialist: "specialist",
      architecture: "project", timeline_event: "document", snapshot: "document",
    };

    for (const item of items) {
      const nodeType = typeMap[item.type] ?? "document";
      if (!this.graph.hasNode(item.id)) {
        this.graph.addNode(
          nodeType,
          item.title,
          { type: item.type, provenance: item.provenance.sourceName, confidence: item.provenance.confidence },
          item.provenance.sourceId,
          item.id,
        );
      }
    }

    // Add edges from relationships
    for (const rel of this.relationships.values()) {
      if (this.graph.hasNode(rel.fromId) && this.graph.hasNode(rel.toId)) {
        this.graph.addEdge(rel.fromId, rel.toId, rel.relationshipType, rel.weight);
      }
    }

    // Add source provenance edges (item → source node)
    const sourceNodes = new Map<string, string>(); // sourceId → nodeId
    for (const item of items) {
      const sid = item.provenance.sourceId;
      if (!sourceNodes.has(sid)) {
        const sNode = this.graph.addNode(
          "project",
          item.provenance.sourceName,
          { sourceType: item.provenance.sourceType, provider: item.provenance.provider },
          sid,
        );
        sourceNodes.set(sid, sNode.id);
      }
      const sourceNodeId = sourceNodes.get(sid)!;
      if (this.graph.hasNode(item.id) && this.graph.hasNode(sourceNodeId)) {
        this.graph.addEdge(sourceNodeId, item.id, "provides", 1.0);
      }
    }
  }

  // ── Timeline Derivation ────────────────────────────────────────────────────

  private _deriveTimelineFromItems(items: KnowledgeItem[]): void {
    for (const item of items) {
      // Only add if not already present via load
      const existing = this.timeline.getRelatedTo(item.id);
      if (existing.length === 0) {
        this.timeline.addEvent(
          "creation",
          `Created: ${item.title}`,
          `${item.type} created from source ${item.provenance.sourceName}`,
          item.provenance.importedAt,
          [item.id],
          item.provenance,
        );
      }
    }
  }

  // ── Cognitive Snapshot ─────────────────────────────────────────────────────

  private _captureSnapshot(): KnowledgeSnapshot {
    const allItems = Array.from(this.items.values());
    const decisions = allItems.filter(i => i.type === 'decision').map(i => i.title);
    const artifacts = allItems.filter(i => i.type === 'artifact').map(i => i.id);
    const pending = this.conflicts.getAll().filter(c => !c.resolved).map(c => c.description);
    const risks = this.conflicts.getBySeverity('critical').map(c => c.description)
      .concat(this.conflicts.getBySeverity('high').map(c => `[HIGH] ${c.description}`));
    const sprints = allItems.filter(i => i.type === 'sprint').map(i => i.title);

    // architecture = adr + rfc titles
    const architecture = allItems
      .filter(i => i.type === 'adr' || i.type === 'rfc' || i.type === 'architecture')
      .map(i => i.title);

    const dependencies = Array.from(this.relationships.values())
      .filter(r => r.relationshipType === 'depends_on')
      .map(r => r.id);

    const confidence = this.provenance.stats().avgConfidence;

    return Object.freeze({
      id: makeKREId("snap"),
      capturedAt: Date.now(),
      activeSprint: sprints[sprints.length - 1] ?? null,
      architecture: Object.freeze(architecture),
      implementedArtifacts: Object.freeze(artifacts),
      pendingWork: Object.freeze(pending),
      openRisks: Object.freeze(risks),
      dependencies: Object.freeze(dependencies),
      relatedDecisions: Object.freeze(decisions),
      confidence,
      itemCount: this.items.size,
      nodeCount: this.graph.nodeCount,
      edgeCount: this.graph.edgeCount,
    });
  }

  // ── Quick Snapshot ─────────────────────────────────────────────────────────

  captureSnapshot(): KnowledgeSnapshot {
    const snap = this._captureSnapshot();
    this.snapshots.push(snap);
    return snap;
  }

  getSnapshots(): KnowledgeSnapshot[] { return [...this.snapshots]; }
  getLatestSnapshot(): KnowledgeSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getItem(id: string): KnowledgeItem | undefined { return this.items.get(id); }
  listItems(): KnowledgeItem[] { return Array.from(this.items.values()); }
  listItemsByType(type: string): KnowledgeItem[] {
    return Array.from(this.items.values()).filter(i => i.type === type);
  }
  listRelationships(): KnowledgeRelationship[] { return Array.from(this.relationships.values()); }
  getLastReport(): ReconstructionReport | null { return this.lastReport; }
  getStatus(): ReconstructionStatus { return this.status; }

  // ── Health ─────────────────────────────────────────────────────────────────

  async health(): Promise<KREHealthReport> {
    let availableSources = 0;
    for (const s of this.sources.values()) {
      try {
        const h = await s.isAvailable();
        if (h === "available" || h === "degraded") availableSources++;
      } catch { /* unavailable */ }
    }
    return {
      status: availableSources > 0 ? "available" : (this.sources.size > 0 ? "unavailable" : "available"),
      checkedAt: Date.now(),
      registeredSources: this.sources.size,
      availableSources,
      totalItems: this.items.size,
      totalNodes: this.graph.nodeCount,
      totalEdges: this.graph.edgeCount,
      totalConflicts: this.conflicts.count,
      lastReconstructionAt: this.lastReconstructionAt,
      details: `${this.items.size} items · ${this.graph.nodeCount} nodes · ${this.graph.edgeCount} edges · ${this.conflicts.count} conflicts`,
    };
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  reset(): void {
    this.items.clear();
    this.relationships.clear();
    this.graph.clear();
    this.timeline.clear();
    this.conflicts.clear();
    this.provenance.clear();
    this.snapshots.length = 0;
    this.status = "idle";
    this.lastReport = null;
    this.lastReconstructionAt = null;
  }
}