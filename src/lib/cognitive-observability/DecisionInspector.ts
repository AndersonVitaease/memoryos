/**
 * DecisionInspector.ts — Decision Inspector
 * Sprint 7.1.1: Records every decision with its reasoning and alternatives.
 */

import type { DecisionRecord, DecisionSnapshot, DecisionAlternative } from "./COPTypes";

export class DecisionInspector {
  private static _instance: DecisionInspector | null = null;
  private _snapshots: Map<string, DecisionSnapshot> = new Map();

  static getInstance(): DecisionInspector {
    if (!DecisionInspector._instance) {
      DecisionInspector._instance = new DecisionInspector();
    }
    return DecisionInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startCapture(conversationId: string, messageId: string): void {
    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      capturedAt: new Date().toISOString(),
      decisions: [],
      totalDecisions: 0,
    });
  }

  recordDecision(
    messageId: string,
    params: {
      category: string;
      decision: string;
      reasoning: string;
      rule: string;
      engines: string[];
      alternatives: DecisionAlternative[];
      confidence: number;
    }
  ): string {
    const snap = this._snapshots.get(messageId);
    if (!snap) return "";
    const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rec: DecisionRecord = {
      id,
      ...params,
      madeAt: Date.now(),
    };
    snap.decisions.push(rec);
    snap.totalDecisions = snap.decisions.length;
    return id;
  }

  // ── Convenience helpers ─────────────────────────────────────────────────────

  recordRoutingDecision(
    messageId: string,
    chosen: string,
    alternatives: string[],
    rule: string
  ): void {
    this.recordDecision(messageId, {
      category: "routing",
      decision: `Route to: ${chosen}`,
      reasoning: `Selected based on intent classification and ${rule}`,
      rule,
      engines: ["SpecialistRouter", "IntentClassifier"],
      alternatives: alternatives.map((a) => ({
        label: a,
        score: 0.3,
        outcome: "rejected",
        reason: "Lower relevance score",
      })),
      confidence: 0.85,
    });
  }

  recordContextDecision(
    messageId: string,
    included: number,
    excluded: number,
    rule: string
  ): void {
    this.recordDecision(messageId, {
      category: "context_selection",
      decision: `Include ${included} items, exclude ${excluded}`,
      reasoning: `Applied weight threshold and token budget constraints`,
      rule,
      engines: ["ContextBuilder", "TokenBudget"],
      alternatives: [
        { label: "Include all", score: 0.2, outcome: "rejected", reason: "Exceeds token budget" },
      ],
      confidence: 0.9,
    });
  }

  recordModelDecision(
    messageId: string,
    model: string,
    reason: string
  ): void {
    this.recordDecision(messageId, {
      category: "model_selection",
      decision: `Use model: ${model}`,
      reasoning: reason,
      rule: "complexity_heuristic",
      engines: ["ModelSelector"],
      alternatives: [],
      confidence: 0.8,
    });
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): DecisionSnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): DecisionSnapshot | null {
    const all = Array.from(this._snapshots.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): DecisionSnapshot[] {
    return Array.from(this._snapshots.values());
  }

  clear(): void {
    this._snapshots.clear();
  }

  stats() {
    const all = this.listAll();
    return {
      totalSnapshots: all.length,
      totalDecisions: all.reduce((s, x) => s + x.totalDecisions, 0),
      avgDecisionsPerMessage:
        all.length > 0
          ? parseFloat((all.reduce((s, x) => s + x.totalDecisions, 0) / all.length).toFixed(2))
          : 0,
    };
  }
}