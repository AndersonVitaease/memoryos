/**
 * IdentityResolutionEngine.ts — Semantic Identity Resolution
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * RESPONSIBILITIES:
 *   - Receive FusedEntity list from KnowledgeFusionEngine
 *   - Detect semantic aliases across providers
 *   - Detect version evolution chains
 *   - Build CanonicalEntity objects
 *   - Build IdentityGraph (sameAs, versionOf, aliasOf, ...)
 *   - Compute confidence & verification status per identity
 *   - Detect conflicts
 *   - Generate IdentityReport
 *
 * ARCHITECTURE RULES:
 *   - Provider-agnostic: consumes FusedEntity, no provider logic
 *   - Reuses FusionTypes from EF-36D
 *   - Does not modify KRE, KFE, or Connector Runtime
 */

import type { FusedEntity, FusedRelationship, FusedTimelineEvent } from "../knowledge-fusion/FusionTypes";
import type {
  CanonicalEntity, EntityAlias, VersionEntry, IRVerificationStatus,
  IRConflict, IdentityReport,
} from "./IRTypes";
import { makeIRId } from "./IRTypes";
import { AliasDetector } from "./AliasDetector";
import { VersionResolver } from "./VersionResolver";
import { IdentityGraph } from "./IdentityGraph";
import { IRConflictDetector } from "./IRConflictDetector";

// ── Input bundle ──────────────────────────────────────────────────────────────

export interface IRInput {
  entities: FusedEntity[];
  relationships: FusedRelationship[];
  timelineEvents: FusedTimelineEvent[];
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class IdentityResolutionEngine {
  // Sub-systems
  readonly graph = new IdentityGraph();
  private readonly aliasDetector = new AliasDetector();
  private readonly versionResolver = new VersionResolver();
  private readonly conflictDetector = new IRConflictDetector();

  // State
  private canonicals = new Map<string, CanonicalEntity>();
  private conflicts: IRConflict[] = [];
  private lastReport: IdentityReport | null = null;

  // ── Main resolution ────────────────────────────────────────────────────────

  resolve(input: IRInput): IdentityReport {
    const startMs = Date.now();
    const errors: string[] = [];

    // Reset
    this.graph.clear();
    this.canonicals.clear();
    this.conflicts = [];

    const { entities, relationships, timelineEvents } = input;

    // Phase 1: Alias detection
    const nameEntries = entities.map(e => ({ name: e.canonicalTitle, sourceProvider: e.supportingProviders[0] ?? "unknown" }));
    const aliasMatches = this.aliasDetector.detectAliases(nameEntries);

    // Build alias groups: canonicalName → array of aliases
    const aliasGroupMap = new Map<string, Array<{ name: string; sourceProvider: string; method: EntityAlias["detectedBy"]; confidence: number }>>();
    for (const m of aliasMatches) {
      const group = aliasGroupMap.get(m.canonicalName) ?? [];
      group.push({ name: m.aliasName, sourceProvider: m.sourceProvider, method: m.method, confidence: m.confidence });
      aliasGroupMap.set(m.canonicalName, group);
    }

    // Phase 2: Version resolution
    const versionGroups = this.versionResolver.detectGroups(entities);
    const versionChains = new Map<string, VersionEntry[]>(); // entityId → its full chain
    const versionedEntityIds = new Set<string>();
    for (const group of versionGroups) {
      const chain = this.versionResolver.buildChain(group);
      for (const entry of chain) {
        versionChains.set(entry.entityId, chain);
        versionedEntityIds.add(entry.entityId);
      }
    }

    // Phase 3: Build CanonicalEntity for each FusedEntity
    const timelineByEntity = new Map<string, string[]>();
    for (const ev of timelineEvents) {
      for (const rid of ev.relatedItemIds) {
        const list = timelineByEntity.get(rid) ?? [];
        list.push(ev.id);
        timelineByEntity.set(rid, list);
      }
    }

    const relsByEntity = new Map<string, string[]>();
    for (const rel of relationships) {
      const from = relsByEntity.get(rel.fromId) ?? [];
      from.push(rel.toId);
      relsByEntity.set(rel.fromId, from);
    }

    for (const entity of entities) {
      try {
        const aliasRaw = aliasGroupMap.get(entity.canonicalTitle) ?? [];
        const aliases = this.aliasDetector.buildAliases(entity.canonicalTitle, aliasRaw);
        const versionHistory = versionChains.get(entity.id) ?? [];
        const status = this._computeStatus(entity, versionHistory.length > 0);

        const canonical: CanonicalEntity = Object.freeze({
          id: entity.id,
          canonicalName: entity.canonicalTitle,
          aliases: Object.freeze(aliases),
          entityType: entity.type,
          confidence: entity.confidence,
          verificationStatus: status,
          sources: Object.freeze([...entity.supportingProviders]),
          timeline: Object.freeze(timelineByEntity.get(entity.id) ?? []),
          relationships: Object.freeze(relsByEntity.get(entity.id) ?? []),
          versionHistory: Object.freeze(versionHistory),
          evidenceCount: entity.evidenceCount,
          resolvedAt: Date.now(),
        });

        this.canonicals.set(canonical.id, canonical);
      } catch (e) {
        errors.push(`Failed to resolve identity for "${entity.canonicalTitle}": ${(e as Error).message}`);
      }
    }

    // Phase 4: Build IdentityGraph
    this._buildGraph(relationships);

    // Phase 5: Conflict detection
    this.conflicts = this.conflictDetector.detect(Array.from(this.canonicals.values()));

    // Phase 6: Report
    const canonicalList = Array.from(this.canonicals.values());
    const aliasTotal = canonicalList.reduce((s, e) => s + e.aliases.length, 0);
    const versionTotal = canonicalList.reduce((s, e) => s + e.versionHistory.length, 0);
    const ambiguous = canonicalList.filter(e => e.verificationStatus === "CONFLICT" || e.verificationStatus === "UNKNOWN").length;
    const resolved = canonicalList.filter(e => e.verificationStatus !== "UNKNOWN").length;
    const avgConf = canonicalList.length > 0
      ? canonicalList.reduce((s, e) => s + e.confidence, 0) / canonicalList.length : 0;
    const verBreakdown = this._verBreakdown(canonicalList);
    const typeBreakdown: Record<string, number> = {};
    for (const e of canonicalList) typeBreakdown[e.entityType] = (typeBreakdown[e.entityType] ?? 0) + 1;

    const report: IdentityReport = Object.freeze({
      id: makeIRId("irep"),
      generatedAt: Date.now(),
      durationMs: Date.now() - startMs,
      totalInputEntities: entities.length,
      canonicalEntitiesCreated: this.canonicals.size,
      aliasesDetected: aliasTotal,
      versionsDetected: versionTotal,
      resolvedIdentities: resolved,
      ambiguousEntities: ambiguous,
      conflictsDetected: this.conflicts.length,
      overallConfidence: parseFloat(avgConf.toFixed(4)),
      coverage: entities.length > 0 ? parseFloat((this.canonicals.size / entities.length).toFixed(4)) : 0,
      verificationBreakdown: Object.freeze(verBreakdown),
      typeBreakdown: Object.freeze(typeBreakdown),
      errors: Object.freeze(errors),
    });

    this.lastReport = report;
    return report;
  }

  // ── Graph construction ─────────────────────────────────────────────────────

  private _buildGraph(relationships: FusedRelationship[]): void {
    // Add canonical nodes
    for (const e of this.canonicals.values()) {
      if (!this.graph.hasNode(e.id)) {
        this.graph.addNode("canonical", e.canonicalName, e.id, { type: e.entityType, confidence: e.confidence }, e.id);
      }

      // Alias nodes
      for (const alias of e.aliases) {
        const aliasNodeId = makeIRId("alias");
        this.graph.addNode("alias", alias.alias, e.id, { method: alias.detectedBy, confidence: alias.confidence, provider: alias.sourceProvider });
        const aliasNode = this.graph.listNodes("alias").at(-1)!;
        this.graph.addEdge(e.id, aliasNode.id, "aliasOf", alias.confidence);
      }

      // Version nodes
      for (const v of e.versionHistory) {
        if (v.entityId !== e.id) continue; // only own version
        const vid = makeIRId("ver");
        this.graph.addNode("version", `${e.canonicalName} ${v.versionLabel}`, e.id, { versionLabel: v.versionLabel });
        const verNode = this.graph.listNodes("version").at(-1)!;
        this.graph.addEdge(e.id, verNode.id, "versionOf", 1.0);
        // Link to previous version canonical
        if (v.previousVersion && this.canonicals.has(v.previousVersion)) {
          this.graph.addEdge(v.previousVersion, e.id, "versionOf", 1.0);
        }
      }

      // Provider reference nodes
      for (const src of e.sources) {
        const provNodeId = `pref_${src}_${e.id}`;
        if (!this.graph.hasNode(provNodeId)) {
          this.graph.addNode("provider_ref", src, e.id, { sourceId: src }, provNodeId);
        }
        this.graph.addEdge(provNodeId, e.id, "referencedBy", 0.9);
      }
    }

    // Add relationship edges
    for (const rel of relationships) {
      if (!this.graph.hasNode(rel.fromId) || !this.graph.hasNode(rel.toId)) continue;
      const edgeType = this._mapRelType(rel.relationshipType);
      this.graph.addEdge(rel.fromId, rel.toId, edgeType, rel.weight);
    }
  }

  private _mapRelType(type: string): import("./IRTypes").IdentityEdgeType {
    const map: Record<string, import("./IRTypes").IdentityEdgeType> = {
      contains_commit: "implementedBy",
      contains_file: "documentedBy",
      contains_decision: "decidedBy",
      discusses_architecture: "discussedIn",
      depends_on: "referencedBy",
      implements: "implementedBy",
      documents: "documentedBy",
      references: "referencedBy",
    };
    return map[type] ?? "referencedBy";
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  private _computeStatus(entity: FusedEntity, hasVersionHistory: boolean): IRVerificationStatus {
    if (entity.verificationStatus === "CONFLICT") return "CONFLICT";
    if (entity.verificationStatus === "MULTI_SOURCE") return "MULTI_SOURCE";
    if (entity.verificationStatus === "VERIFIED") return "VERIFIED";
    if (hasVersionHistory) return "MULTI_SOURCE";
    if (entity.verificationStatus === "INFERRED") return "INFERRED";
    if (entity.verificationStatus === "SINGLE_SOURCE") return "SINGLE_SOURCE";
    return "UNKNOWN";
  }

  private _verBreakdown(entities: CanonicalEntity[]): Record<IRVerificationStatus, number> {
    const counts: Record<IRVerificationStatus, number> = {
      VERIFIED: 0, MULTI_SOURCE: 0, SINGLE_SOURCE: 0, INFERRED: 0, CONFLICT: 0, UNKNOWN: 0,
    };
    for (const e of entities) counts[e.verificationStatus]++;
    return counts;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getCanonical(id: string): CanonicalEntity | undefined { return this.canonicals.get(id); }
  listCanonicals(): CanonicalEntity[] { return Array.from(this.canonicals.values()); }
  listByType(type: string): CanonicalEntity[] { return Array.from(this.canonicals.values()).filter(e => e.entityType === type); }
  listByStatus(status: IRVerificationStatus): CanonicalEntity[] { return Array.from(this.canonicals.values()).filter(e => e.verificationStatus === status); }
  listAliased(): CanonicalEntity[] { return Array.from(this.canonicals.values()).filter(e => e.aliases.length > 0); }
  listVersioned(): CanonicalEntity[] { return Array.from(this.canonicals.values()).filter(e => e.versionHistory.length > 0); }
  getConflicts(): IRConflict[] { return [...this.conflicts]; }
  getLastReport(): IdentityReport | null { return this.lastReport; }
}