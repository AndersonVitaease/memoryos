/**
 * GoalIntelligenceEngine.ts — Phase 5
 * 2026-07-13
 *
 * Executive intelligence of MemoryOS.
 * Receives, interprets, decomposes, prioritizes, monitors, and replans goals.
 * Goals are living cognitive entities — never static objects.
 *
 * NEVER executes actions directly.
 * NEVER modifies other cognitive engines.
 * APPEND-ONLY goal history.
 */

import type {
  Goal, GoalStatus, StatusTransition, TransitionTrigger,
  GoalDecomposition, GoalMonitorSnapshot, ReplanEvent,
  GIERecommendation, CognitiveIntegrationRecord, GIEReport,
  GoalProvenance,
} from "./GIETypes";
import { makeGIEId } from "./GIETypes";
import { GoalDecomposer }            from "./GoalDecomposer";
import { GoalMonitor }               from "./GoalMonitor";
import { GoalReplanner }             from "./GoalReplanner";
import type { ReplanInput }          from "./GoalReplanner";
import { GIERecommendationEngine }   from "./GIERecommendationEngine";
import { CognitiveIntegrator }       from "./CognitiveIntegrator";
import type { CognitiveContext }     from "./CognitiveIntegrator";

const ENGINE_VERSION = "1.0.0";
const VALID_TRANSITIONS: Partial<Record<GoalStatus, GoalStatus[]>> = {
  created:   ["validated", "cancelled"],
  validated: ["planned", "cancelled"],
  planned:   ["executing", "waiting", "cancelled"],
  executing: ["waiting", "blocked", "completed", "cancelled"],
  waiting:   ["executing", "blocked", "cancelled"],
  blocked:   ["executing", "waiting", "cancelled"],
  completed: ["archived"],
  cancelled: ["archived"],
};

export interface GoalInput {
  title: string;
  description: string;
  category: Goal["category"];
  priority: Goal["priority"];
  createdBy?: string;
  linkedKnowledgeIds?: string[];
  linkedLearningIds?: string[];
}

export class GoalIntelligenceEngine {
  private readonly decomposer    = new GoalDecomposer();
  private readonly monitor       = new GoalMonitor();
  private readonly replanner     = new GoalReplanner();
  private readonly recommender   = new GIERecommendationEngine();
  private readonly integrator    = new CognitiveIntegrator();

  private _goals   = new Map<string, Goal>();
  private _recs    = new Map<string, GIERecommendation[]>();
  private _intRecs = new Map<string, CognitiveIntegrationRecord>();

  // ── Create ────────────────────────────────────────────────────────────────

  createGoal(input: GoalInput): Goal {
    const id = makeGIEId("goal");
    const provenance: GoalProvenance = {
      createdAt:     Date.now(),
      createdBy:     input.createdBy ?? "user",
      sourceType:    "user_input",
      sourceRef:     null,
      engineVersion: ENGINE_VERSION,
    };
    const transition = this._makeTransition(id, "created", "created", "user_input", "Goal created", "User submitted goal");
    const goal: Goal = {
      id, title: input.title, description: input.description,
      category: input.category, priority: input.priority,
      status: "created", provenance,
      decomposition: null, latestMonitor: null,
      replanEvents: [], transitions: [transition],
      linkedKnowledgeItems: input.linkedKnowledgeIds ?? [],
      linkedLearningRecords: input.linkedLearningIds ?? [],
    };
    this._goals.set(id, goal);
    return goal;
  }

  // ── Lifecycle transitions ─────────────────────────────────────────────────

  transition(goalId: string, to: GoalStatus, trigger: TransitionTrigger, reason: string): Goal {
    const goal = this._getGoal(goalId);
    const allowed = VALID_TRANSITIONS[goal.status] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid transition ${goal.status} → ${to}`);
    }
    const t = this._makeTransition(goalId, goal.status, to, trigger, reason, `Transitioned by ${trigger}`);
    return this._updateGoal(goalId, { status: to, transitions: [...goal.transitions, t] });
  }

  // ── Decompose ──────────────────────────────────────────────────────────────

  decompose(goalId: string): GoalDecomposition {
    const goal = this._getGoal(goalId);
    const decomp = this.decomposer.decompose(goal);
    this._updateGoal(goalId, { decomposition: decomp });
    return decomp;
  }

  // ── Monitor ────────────────────────────────────────────────────────────────

  monitorGoal(goalId: string): GoalMonitorSnapshot {
    const goal = this._getGoal(goalId);
    const snap = this.monitor.snapshot(goal);
    this._updateGoal(goalId, { latestMonitor: snap });
    return snap;
  }

  // ── Replan ─────────────────────────────────────────────────────────────────

  replanGoal(goalId: string, input: ReplanInput): ReplanEvent | null {
    const goal = this._getGoal(goalId);
    const ev   = this.replanner.evaluateGoal(goal, input);
    if (ev) {
      this._updateGoal(goalId, { replanEvents: [...goal.replanEvents, ev] });
    }
    return ev;
  }

  replanAll(input: ReplanInput): Map<string, ReplanEvent> {
    const goals = [...this._goals.values()];
    const events = this.replanner.evaluateAll(goals, input);
    for (const [gid, ev] of events) {
      const g = this._goals.get(gid);
      if (g) this._updateGoal(gid, { replanEvents: [...g.replanEvents, ev] });
    }
    return events;
  }

  // ── Recommend ─────────────────────────────────────────────────────────────

  recommend(goalId: string): GIERecommendation[] {
    const goal = this._getGoal(goalId);
    const recs = this.recommender.generate(goal);
    this._recs.set(goalId, recs);
    return recs;
  }

  // ── Integrate ─────────────────────────────────────────────────────────────

  integrate(goalId: string, ctx: CognitiveContext = {}): CognitiveIntegrationRecord {
    const goal = this._getGoal(goalId);
    const rec  = this.integrator.integrate(goal, ctx);
    this._intRecs.set(goalId, rec);
    return rec;
  }

  // ── Full lifecycle helper ─────────────────────────────────────────────────

  fullLifecycle(input: GoalInput, ctx: CognitiveContext = {}): {
    goal: Goal;
    decomposition: GoalDecomposition;
    monitor: GoalMonitorSnapshot;
    recommendations: GIERecommendation[];
    integration: CognitiveIntegrationRecord;
  } {
    const goal = this.createGoal(input);

    // Validate → Plan
    this.transition(goal.id, "validated", "user_input", "Goal validated automatically");
    this.transition(goal.id, "planned", "plan_generated", "Decomposition plan generated");

    const decomposition = this.decompose(goal.id);
    const monitor       = this.monitorGoal(goal.id);
    const recommendations = this.recommend(goal.id);
    const integration   = this.integrate(goal.id, ctx);

    return { goal: this._getGoal(goal.id), decomposition, monitor, recommendations, integration };
  }

  // ── Report ────────────────────────────────────────────────────────────────

  buildReport(): GIEReport {
    const goals = [...this._goals.values()];
    const allRecs = [...this._recs.values()].flat();

    const byStatus = {} as Record<GoalStatus, number>;
    const statuses: GoalStatus[] = ["created","validated","planned","executing","waiting","blocked","completed","cancelled","archived"];
    for (const s of statuses) byStatus[s] = 0;
    for (const g of goals) byStatus[g.status]++;

    const byPriority: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const g of goals) byPriority[g.priority]++;

    const avgProgress = goals.length > 0
      ? goals.reduce((s, g) => s + (g.latestMonitor?.progressPct ?? 0), 0) / goals.length
      : 0;
    const avgConf = goals.length > 0
      ? goals.reduce((s, g) => s + (g.latestMonitor?.confidence ?? 0.5), 0) / goals.length
      : 0.5;
    const totalReplans = goals.reduce((s, g) => s + g.replanEvents.length, 0);
    const integrations = this._intRecs.size;

    const topRecs = [...allRecs]
      .sort((a, b) => (b.priority === "high" ? 2 : b.priority === "medium" ? 1 : 0) - (a.priority === "high" ? 2 : a.priority === "medium" ? 1 : 0))
      .slice(0, 5);

    const certPct = goals.length > 0
      ? goals.filter(g => g.decomposition && g.latestMonitor).length / goals.length
      : 0;
    const certLevel = certPct >= 0.9 ? "CERTIFIED" : certPct >= 0.5 ? "PARTIAL" : "FAILED";

    return {
      id:                    makeGIEId("gie_report"),
      generatedAt:           Date.now(),
      certified:             certLevel === "CERTIFIED",
      certificationLevel:    certLevel,
      totalGoals:            goals.length,
      byStatus,
      byPriority,
      avgProgressPct:        Math.round(avgProgress),
      avgConfidence:         avgConf,
      totalReplanEvents:     totalReplans,
      totalRecommendations:  allRecs.length,
      cognitiveIntegrations: integrations,
      goals,
      topRecommendations:    topRecs,
      summary: goals.length === 0
        ? "No goals created yet."
        : `GIE ${certLevel} — ${goals.length} goal(s) · avg progress ${Math.round(avgProgress)}% · ${allRecs.length} recommendation(s) · ${totalReplans} replan event(s)`,
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getGoal(id: string): Goal | undefined  { return this._goals.get(id); }
  getAllGoals(): Goal[]                   { return [...this._goals.values()]; }
  getRecommendations(id: string)         { return this._recs.get(id) ?? []; }
  getIntegration(id: string)             { return this._intRecs.get(id) ?? null; }

  // ── Private ────────────────────────────────────────────────────────────────

  private _getGoal(id: string): Goal {
    const g = this._goals.get(id);
    if (!g) throw new Error(`Goal not found: ${id}`);
    return g;
  }

  private _makeTransition(
    goalId: string, from: GoalStatus, to: GoalStatus,
    trigger: TransitionTrigger, reason: string, evidence: string,
  ): StatusTransition {
    return Object.freeze({ id: makeGIEId("trans"), goalId, from, to, trigger, occurredAt: Date.now(), reason, evidence });
  }

  private _updateGoal(id: string, patch: Partial<Goal>): Goal {
    const existing = this._getGoal(id);
    const updated  = Object.freeze({ ...existing, ...patch });
    this._goals.set(id, updated);
    return updated;
  }
}