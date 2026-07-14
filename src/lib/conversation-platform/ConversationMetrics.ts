/**
 * ConversationMetrics.ts
 * Records timing and performance for every pipeline execution.
 * MDS v2.0 compliant
 */

import type { ConversationMetrics } from "./CXPTypes";

class ConversationMetricsCollector {
  private _records: ConversationMetrics[] = [];
  private _active: Map<string, Partial<ConversationMetrics> & { _t: Record<string, number> }> =
    new Map();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  begin(executionId: string, sessionId: string): void {
    this._active.set(executionId, {
      executionId,
      sessionId,
      recoveryAttempts: 0,
      cancelled: false,
      _t: { start: Date.now() },
    });
  }

  markPhase(executionId: string, phase: string): void {
    const m = this._active.get(executionId);
    if (m) m._t[phase] = Date.now();
  }

  recordContextBuildMs(executionId: string, ms: number): void {
    const m = this._active.get(executionId);
    if (m) m.contextBuildMs = ms;
  }

  recordMemoryFetchMs(executionId: string, ms: number): void {
    const m = this._active.get(executionId);
    if (m) m.memoryFetchMs = ms;
  }

  recordSpecialistMs(executionId: string, ms: number): void {
    const m = this._active.get(executionId);
    if (m) m.specialistMs = ms;
  }

  recordSynthesisMs(executionId: string, ms: number): void {
    const m = this._active.get(executionId);
    if (m) m.synthesisMs = ms;
  }

  recordFirstToken(executionId: string): void {
    const m = this._active.get(executionId);
    if (!m) return;
    const startedAt = m._t["start"] ?? Date.now();
    m.timeToFirstToken = Date.now() - startedAt;
  }

  recordRecoveryAttempt(executionId: string): void {
    const m = this._active.get(executionId);
    if (m) m.recoveryAttempts = (m.recoveryAttempts ?? 0) + 1;
  }

  recordCancellation(executionId: string): void {
    const m = this._active.get(executionId);
    if (m) m.cancelled = true;
  }

  recordError(executionId: string, error: string): void {
    const m = this._active.get(executionId);
    if (m) m.error = error;
  }

  finalize(executionId: string, tokensPerSecond?: number): ConversationMetrics | null {
    const m = this._active.get(executionId);
    if (!m) return null;

    const now = Date.now();
    const totalDurationMs = now - (m._t["start"] ?? now);
    const latencyMs = m._t["llm_start"] ? m._t["llm_start"] - (m._t["start"] ?? 0) : undefined;

    const record: ConversationMetrics = {
      executionId: m.executionId!,
      sessionId: m.sessionId!,
      timeToFirstToken: m.timeToFirstToken,
      totalDurationMs,
      tokensPerSecond,
      latencyMs,
      contextBuildMs: m.contextBuildMs,
      memoryFetchMs: m.memoryFetchMs,
      specialistMs: m.specialistMs,
      synthesisMs: m.synthesisMs,
      recoveryAttempts: m.recoveryAttempts ?? 0,
      cancelled: m.cancelled ?? false,
      error: m.error,
    };

    this._records.push(record);
    if (this._records.length > 100) this._records.shift();
    this._active.delete(executionId);

    return record;
  }

  // ── Aggregates ────────────────────────────────────────────────────────────

  getAll(): ConversationMetrics[] {
    return [...this._records];
  }

  getLast(n = 10): ConversationMetrics[] {
    return this._records.slice(-n);
  }

  getAverageLatency(): number {
    const valid = this._records.filter((r) => r.latencyMs !== undefined);
    if (!valid.length) return 0;
    return valid.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / valid.length;
  }

  getAverageTimeToFirstToken(): number {
    const valid = this._records.filter((r) => r.timeToFirstToken !== undefined);
    if (!valid.length) return 0;
    return valid.reduce((s, r) => s + (r.timeToFirstToken ?? 0), 0) / valid.length;
  }

  getAverageTokensPerSecond(): number {
    const valid = this._records.filter((r) => r.tokensPerSecond !== undefined);
    if (!valid.length) return 0;
    return valid.reduce((s, r) => s + (r.tokensPerSecond ?? 0), 0) / valid.length;
  }

  getTotalConversations(): number {
    return this._records.length;
  }

  getErrorRate(): number {
    if (!this._records.length) return 0;
    return this._records.filter((r) => r.error).length / this._records.length;
  }

  getCancellationRate(): number {
    if (!this._records.length) return 0;
    return this._records.filter((r) => r.cancelled).length / this._records.length;
  }

  summary() {
    return {
      total: this.getTotalConversations(),
      avgLatencyMs: Math.round(this.getAverageLatency()),
      avgTimeToFirstToken: Math.round(this.getAverageTimeToFirstToken()),
      avgTokensPerSecond: Math.round(this.getAverageTokensPerSecond() * 10) / 10,
      errorRate: Math.round(this.getErrorRate() * 100) + "%",
      cancellationRate: Math.round(this.getCancellationRate() * 100) + "%",
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const _key = "__CXP_METRICS__";
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationMetricsCollector();
}

export const conversationMetrics: ConversationMetricsCollector = (
  globalThis as unknown as Record<string, ConversationMetricsCollector>
)[_key];

export { ConversationMetricsCollector };