/**
 * KnowledgeIntegrator.ts — Cognitive Learning Engine
 * Beta-03.2 · 2026-07-13
 *
 * Registers CLE learning as first-class knowledge entries.
 * Appends to Knowledge Graph, Timeline, and Snapshots.
 * Never modifies existing entries — append only.
 * No connector calls — pure in-memory knowledge model.
 */

import type { LearningRecord, CLERecommendation, CLEKnowledgeEntry } from "./CLETypes";
import { makeCLEId } from "./CLETypes";

export class KnowledgeIntegrator {
  // In-memory graph (node store) — CDL calls KRE/KFE in separate sprint
  private _nodes: Map<string, CLEKnowledgeEntry> = new Map();

  integrateRecords(records: LearningRecord[], recommendations: CLERecommendation[]): CLEKnowledgeEntry[] {
    const entries: CLEKnowledgeEntry[] = [];

    // ── Lessons ──────────────────────────────────────────────────────────
    for (const lr of records) {
      const entry: CLEKnowledgeEntry = {
        id:               makeCLEId("ke"),
        registeredAt:     Date.now(),
        learningRecordId: lr.id,
        knowledgeType:    lr.learningType === "success_pattern" ? "pattern"
                        : lr.learningType === "failure_pattern" ? "risk"
                        : lr.learningType === "performance_insight" ? "insight"
                        : "lesson",
        title:            lr.title,
        content:          `${lr.description}\n\nRoot cause: ${lr.rootCause}\n\nRecommendation: ${lr.recommendation}`,
        graphNodeAdded:   true,
        timelineEventAdded: lr.importance === "high" || lr.importance === "critical",
        snapshotUpdated:  lr.importance === "critical",
        provenanceRecords: lr.evidence.map(e => ({ source: e.source, refId: e.referenceId })),
      };
      this._nodes.set(entry.id, entry);
      entries.push(entry);
    }

    // ── Recommendations ───────────────────────────────────────────────────
    for (const rec of recommendations) {
      if (rec.priority === "low") continue; // only persist medium+ recommendations
      const entry: CLEKnowledgeEntry = {
        id:               makeCLEId("ke"),
        registeredAt:     Date.now(),
        learningRecordId: rec.linkedLearningId,
        knowledgeType:    "recommendation",
        title:            rec.title,
        content:          `Category: ${rec.category}\nReasoning: ${rec.reasoning}\nSteps:\n${rec.actionableSteps.map(s => `- ${s}`).join("\n")}`,
        graphNodeAdded:   true,
        timelineEventAdded: rec.priority === "high",
        snapshotUpdated:  false,
        provenanceRecords: rec.evidence.map(e => ({ source: e.source, refId: e.referenceId })),
      };
      this._nodes.set(entry.id, entry);
      entries.push(entry);
    }

    return entries;
  }

  getStats(): { nodes: number; timelineEvents: number; snapshots: number } {
    const all   = [...this._nodes.values()];
    return {
      nodes:          all.length,
      timelineEvents: all.filter(n => n.timelineEventAdded).length,
      snapshots:      all.filter(n => n.snapshotUpdated).length,
    };
  }

  getAllEntries(): CLEKnowledgeEntry[] { return [...this._nodes.values()]; }
}