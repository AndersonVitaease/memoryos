// Goal Registry Service v1.0
// Foundation v1.0 · Engineering First · Sprint Goal Registry Service v1.0
// Responsabilidade: administracao global de Goals — referencias e indices apenas.
// Nao modifica Goal, GoalContext, GoalResult nem GoalStatus.

import type { Goal } from "@/lib/goal-runtime-v01/Goal";
import type { GoalStatus, GoalPriority, GoalOrigin } from "@/lib/goal-runtime-v01/GoalTypes";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ServiceLog {
  executionId: string;
  goalId: string;
  operation: string;
  status: "SUCCESS" | "FAILED";
  timestamp: number;
  duration: number;
  error?: string;
}

export interface GoalStatistics {
  total: number;
  byStatus: Record<GoalStatus, number>;
  byPriority: Record<GoalPriority, number>;
  active: number;
  completed: number;
  cancelled: number;
  failed: number;
  created: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  registeredCount: number;
  removedCount: number;
  queryCount: number;
}

export interface ServiceMetrics {
  registeredTotal: number;
  removedTotal: number;
  queryTotal: number;
  avgQueryMs: number;
  minQueryMs: number;
  maxQueryMs: number;
  queriesByIndex: Record<string, number>;
}

export interface GoalQueryFilter {
  status?: GoalStatus;
  priority?: GoalPriority;
  origin?: GoalOrigin;
  userId?: string;
  projectId?: string;
  sessionId?: string;
  tags?: string[];
  createdAfter?: number;
  createdBefore?: number;
}

export interface HealthReport {
  status: "SUCCESS" | "FAILED";
  checks: {
    registryIntegrity: boolean;
    indexIntegrity: boolean;
    goalCount: number;
    statisticsIntegrity: boolean;
    consistencyCheck: boolean;
  };
  details: string;
}

// ── Index ──────────────────────────────────────────────────────────────────────

class GoalIndex {
  private byStatus      = new Map<string, Set<string>>();
  private byPriority    = new Map<string, Set<string>>();
  private byOrigin      = new Map<string, Set<string>>();
  private byUserId      = new Map<string, Set<string>>();
  private byProjectId   = new Map<string, Set<string>>();
  private bySessionId   = new Map<string, Set<string>>();
  private byTag         = new Map<string, Set<string>>();
  private createdAt     = new Map<string, number>();
  private updatedAt     = new Map<string, number>();

  private _add(map: Map<string, Set<string>>, key: string, goalId: string) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(goalId);
  }

  private _remove(map: Map<string, Set<string>>, key: string, goalId: string) {
    map.get(key)?.delete(goalId);
  }

  index(goal: Goal): void {
    const m = goal.metadata();
    const s = goal.getStatus();
    const now = Date.now();
    this._add(this.byStatus,    s,             m.goalId);
    this._add(this.byPriority,  m.priority,    m.goalId);
    this._add(this.byOrigin,    m.origin,      m.goalId);
    this._add(this.byUserId,    m.userId,      m.goalId);
    this._add(this.byProjectId, m.projectId,   m.goalId);
    this._add(this.bySessionId, m.sessionId,   m.goalId);
    for (const tag of (m.tags ?? [])) this._add(this.byTag, tag, m.goalId);
    this.createdAt.set(m.goalId, now);
    this.updatedAt.set(m.goalId, now);
  }

  reindex(goal: Goal, prevStatus: GoalStatus): void {
    const m = goal.metadata();
    const s = goal.getStatus();
    if (prevStatus !== s) {
      this._remove(this.byStatus, prevStatus, m.goalId);
      this._add(this.byStatus, s, m.goalId);
    }
    this.updatedAt.set(m.goalId, Date.now());
  }

  deindex(goal: Goal): void {
    const m = goal.metadata();
    const s = goal.getStatus();
    this._remove(this.byStatus,    s,           m.goalId);
    this._remove(this.byPriority,  m.priority,  m.goalId);
    this._remove(this.byOrigin,    m.origin,    m.goalId);
    this._remove(this.byUserId,    m.userId,    m.goalId);
    this._remove(this.byProjectId, m.projectId, m.goalId);
    this._remove(this.bySessionId, m.sessionId, m.goalId);
    for (const tag of (m.tags ?? [])) this._remove(this.byTag, tag, m.goalId);
    this.createdAt.delete(m.goalId);
    this.updatedAt.delete(m.goalId);
  }

  getByStatus(status: GoalStatus): string[]   { return [...(this.byStatus.get(status) ?? [])]; }
  getByPriority(p: GoalPriority): string[]    { return [...(this.byPriority.get(p) ?? [])]; }
  getByOrigin(o: GoalOrigin): string[]        { return [...(this.byOrigin.get(o) ?? [])]; }
  getByUserId(id: string): string[]           { return [...(this.byUserId.get(id) ?? [])]; }
  getByProjectId(id: string): string[]        { return [...(this.byProjectId.get(id) ?? [])]; }
  getBySessionId(id: string): string[]        { return [...(this.bySessionId.get(id) ?? [])]; }
  getByTag(tag: string): string[]             { return [...(this.byTag.get(tag) ?? [])]; }
  getCreatedAt(goalId: string): number        { return this.createdAt.get(goalId) ?? 0; }
  getUpdatedAt(goalId: string): number        { return this.updatedAt.get(goalId) ?? 0; }

  getByPeriod(after: number, before: number): string[] {
    const result: string[] = [];
    for (const [goalId, ts] of this.createdAt.entries()) {
      if (ts >= after && ts <= before) result.push(goalId);
    }
    return result;
  }

  clear(): void {
    this.byStatus.clear(); this.byPriority.clear(); this.byOrigin.clear();
    this.byUserId.clear(); this.byProjectId.clear(); this.bySessionId.clear();
    this.byTag.clear(); this.createdAt.clear(); this.updatedAt.clear();
  }
}

// ── Service ────────────────────────────────────────────────────────────────────

function execId(): string {
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ALL_STATUSES: GoalStatus[]   = ["CREATED","VALIDATED","ACTIVE","COMPLETED","FAILED","CANCELLED"];
const ALL_PRIORITIES: GoalPriority[] = ["LOW","MEDIUM","HIGH","CRITICAL"];

export class GoalRegistryService {
  private _goals = new Map<string, Goal>();
  private _index = new GoalIndex();
  private _logs: ServiceLog[] = [];
  private _metrics: ServiceMetrics = {
    registeredTotal: 0, removedTotal: 0, queryTotal: 0,
    avgQueryMs: 0, minQueryMs: Infinity, maxQueryMs: 0,
    queriesByIndex: {},
  };
  private _durations: number[] = [];

  // ── Public API ─────────────────────────────────────────────────────────────

  register(goal: Goal): { success: boolean; error?: string } {
    const start = Date.now();
    const id = execId();
    const goalId = goal.metadata().goalId;
    try {
      if (this._goals.has(goalId)) {
        return this._logOp(id, goalId, "register", start, false, `Already registered: ${goalId}`);
      }
      this._goals.set(goalId, goal);
      this._index.index(goal);
      this._metrics.registeredTotal++;
      return this._logOp(id, goalId, "register", start, true);
    } catch (err) {
      return this._logOp(id, goalId, "register", start, false, String(err));
    }
  }

  remove(goalId: string): { success: boolean; error?: string } {
    const start = Date.now();
    const id = execId();
    try {
      const goal = this._goals.get(goalId);
      if (!goal) return this._logOp(id, goalId, "remove", start, false, `Not found: ${goalId}`);
      this._index.deindex(goal);
      this._goals.delete(goalId);
      this._metrics.removedTotal++;
      return this._logOp(id, goalId, "remove", start, true);
    } catch (err) {
      return this._logOp(id, goalId, "remove", start, false, String(err));
    }
  }

  find(goalId: string): Goal | null {
    this._trackQuery("goalId");
    return this._goals.get(goalId) ?? null;
  }

  exists(goalId: string): boolean {
    return this._goals.has(goalId);
  }

  list(): Goal[] {
    this._trackQuery("list");
    return [...this._goals.values()];
  }

  query(filter: GoalQueryFilter): Goal[] {
    const start = Date.now();
    this._trackQuery("query");
    try {
      let candidateIds: string[] | null = null;

      const intersect = (ids: string[]) => {
        candidateIds = candidateIds === null ? ids : candidateIds.filter(id => ids.includes(id));
      };

      if (filter.status)      intersect(this._index.getByStatus(filter.status));
      if (filter.priority)    intersect(this._index.getByPriority(filter.priority));
      if (filter.origin)      intersect(this._index.getByOrigin(filter.origin));
      if (filter.userId)      intersect(this._index.getByUserId(filter.userId));
      if (filter.projectId)   intersect(this._index.getByProjectId(filter.projectId));
      if (filter.sessionId)   intersect(this._index.getBySessionId(filter.sessionId));
      if (filter.tags?.length) {
        for (const tag of filter.tags) intersect(this._index.getByTag(tag));
      }
      if (filter.createdAfter !== undefined || filter.createdBefore !== undefined) {
        const after  = filter.createdAfter  ?? 0;
        const before = filter.createdBefore ?? Date.now();
        intersect(this._index.getByPeriod(after, before));
      }

      const ids = candidateIds ?? [...this._goals.keys()];
      const results = ids.map(id => this._goals.get(id)).filter(Boolean) as Goal[];
      this._trackQueryTime(Date.now() - start);
      return results;
    } catch {
      this._trackQueryTime(Date.now() - start);
      return [];
    }
  }

  statistics(): GoalStatistics {
    const byStatus = {} as Record<GoalStatus, number>;
    for (const s of ALL_STATUSES) byStatus[s] = 0;

    const byPriority = {} as Record<GoalPriority, number>;
    for (const p of ALL_PRIORITIES) byPriority[p] = 0;

    for (const goal of this._goals.values()) {
      const s = goal.getStatus();
      const p = goal.metadata().priority;
      byStatus[s] = (byStatus[s] ?? 0) + 1;
      byPriority[p] = (byPriority[p] ?? 0) + 1;
    }

    const durations = this._durations;
    const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const min = durations.length ? Math.min(...durations) : 0;
    const max = durations.length ? Math.max(...durations) : 0;

    return Object.freeze({
      total:           this._goals.size,
      byStatus,
      byPriority,
      active:          byStatus["ACTIVE"] ?? 0,
      completed:       byStatus["COMPLETED"] ?? 0,
      cancelled:       byStatus["CANCELLED"] ?? 0,
      failed:          byStatus["FAILED"] ?? 0,
      created:         byStatus["CREATED"] ?? 0,
      avgDurationMs:   avg,
      minDurationMs:   min,
      maxDurationMs:   max,
      registeredCount: this._metrics.registeredTotal,
      removedCount:    this._metrics.removedTotal,
      queryCount:      this._metrics.queryTotal,
    });
  }

  health(): HealthReport {
    try {
      const goalCount = this._goals.size;
      const registryIntegrity = true;

      // index integrity: every registered goal must be indexed by status
      let indexIntegrity = true;
      for (const [goalId, goal] of this._goals.entries()) {
        const status = goal.getStatus();
        const indexed = this._index.getByStatus(status);
        if (!indexed.includes(goalId)) { indexIntegrity = false; break; }
      }

      const stats = this.statistics();
      const statsTotal = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);
      const statisticsIntegrity = statsTotal === goalCount;
      const consistencyCheck = this._metrics.registeredTotal >= this._metrics.removedTotal;

      const allOk = registryIntegrity && indexIntegrity && statisticsIntegrity && consistencyCheck;
      return {
        status: allOk ? "SUCCESS" : "FAILED",
        checks: { registryIntegrity, indexIntegrity, goalCount, statisticsIntegrity, consistencyCheck },
        details: `goals=${goalCount} registered=${this._metrics.registeredTotal} removed=${this._metrics.removedTotal} queries=${this._metrics.queryTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { registryIntegrity: false, indexIntegrity: false, goalCount: 0, statisticsIntegrity: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getMetrics(): ServiceMetrics {
    return Object.freeze({
      ...this._metrics,
      minQueryMs: this._metrics.minQueryMs === Infinity ? 0 : this._metrics.minQueryMs,
    });
  }

  getLogs(): ServiceLog[] { return [...this._logs]; }

  clear(): void {
    this._goals.clear();
    this._index.clear();
    this._logs = [];
    this._durations = [];
    this._metrics = {
      registeredTotal: 0, removedTotal: 0, queryTotal: 0,
      avgQueryMs: 0, minQueryMs: Infinity, maxQueryMs: 0,
      queriesByIndex: {},
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _logOp(
    executionId: string, goalId: string, operation: string,
    start: number, success: boolean, error?: string,
  ): { success: boolean; error?: string } {
    const duration = Date.now() - start;
    this._logs.push(Object.freeze({
      executionId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
    if (success) this._durations.push(duration);
    return success ? { success: true } : { success: false, error };
  }

  private _trackQuery(index: string): void {
    this._metrics.queryTotal++;
    this._metrics.queriesByIndex[index] = (this._metrics.queriesByIndex[index] ?? 0) + 1;
  }

  private _trackQueryTime(ms: number): void {
    const total = this._metrics.queryTotal || 1;
    this._metrics.avgQueryMs = Math.round(((this._metrics.avgQueryMs * (total - 1)) + ms) / total);
    if (ms < this._metrics.minQueryMs) this._metrics.minQueryMs = ms;
    if (ms > this._metrics.maxQueryMs) this._metrics.maxQueryMs = ms;
  }
}