/**
 * WatchAuditStore.ts — WE-04
 *
 * Agrega métricas e histórico de auditoria do Watch Engine para o Dashboard.
 * Lê WatchExecution e PendingWatchAction para produzir relatórios prontos.
 *
 * Princípios:
 * - Read-only: nunca escreve no banco
 * - Singleton HMR-safe
 * - Todas as queries com limite para não sobrecarregar
 */

import { base44 } from "@/api/base44Client";

export interface WatchAuditSummary {
  totalExecutions: number;
  successExecutions: number;
  failureExecutions: number;
  triggeredExecutions: number;
  avgDurationMs: number;
  topProviders: Array<{ provider: string; calls: number }>;
  recentExecutions: WatchAuditExecution[];
}

export interface WatchAuditExecution {
  id: string;
  watchId: string;
  status: string;
  triggered: boolean;
  durationMs: number;
  providersCalledCount: number;
  createdDate: string;
  errorMessage?: string;
}

export interface PendingActionSummary {
  total: number;
  pending: number;
  dispatched: number;
  failed: number;
  expired: number;
  recentActions: Array<{
    id: string;
    watchId: string;
    actionType: string;
    status: string;
    retryCount: number;
    createdDate: string;
  }>;
}

export class WatchAuditStoreClass {
  async getExecutionSummary(watchId?: string): Promise<WatchAuditSummary> {
    try {
      const query: Record<string, unknown> = {};
      if (watchId) query.watch_id = watchId;

      const executions = await base44.entities.WatchExecution.filter(
        query, "-created_date", 200
      );

      const total = executions.length;
      const success = executions.filter((e: { status: string }) => e.status === "success").length;
      const failure = executions.filter((e: { status: string }) => e.status === "failure").length;
      const triggered = executions.filter((e: { triggered: boolean }) => e.triggered === true).length;

      const durations = executions
        .filter((e: { duration_ms: number }) => typeof e.duration_ms === "number")
        .map((e: { duration_ms: number }) => e.duration_ms);
      const avgDurationMs = durations.length > 0
        ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
        : 0;

      // Contar chamadas por provider
      const providerCount: Record<string, number> = {};
      for (const e of executions) {
        if (Array.isArray(e.providers_called)) {
          for (const p of e.providers_called) {
            providerCount[p] = (providerCount[p] ?? 0) + 1;
          }
        }
      }
      const topProviders = Object.entries(providerCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([provider, calls]) => ({ provider, calls }));

      const recentExecutions: WatchAuditExecution[] = executions.slice(0, 20).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        watchId: e.watch_id as string,
        status: e.status as string,
        triggered: Boolean(e.triggered),
        durationMs: Number(e.duration_ms ?? 0),
        providersCalledCount: Array.isArray(e.providers_called) ? e.providers_called.length : 0,
        createdDate: e.created_date as string,
        errorMessage: e.error_message as string | undefined,
      }));

      return { totalExecutions: total, successExecutions: success, failureExecutions: failure, triggeredExecutions: triggered, avgDurationMs, topProviders, recentExecutions };
    } catch {
      return { totalExecutions: 0, successExecutions: 0, failureExecutions: 0, triggeredExecutions: 0, avgDurationMs: 0, topProviders: [], recentExecutions: [] };
    }
  }

  async getPendingActionSummary(): Promise<PendingActionSummary> {
    try {
      const actions = await base44.entities.PendingWatchAction.filter({}, "-created_date", 100);

      const byStatus = (s: string) => actions.filter((a: { status: string }) => a.status === s).length;

      const recentActions = actions.slice(0, 10).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        watchId: a.watch_id as string,
        actionType: a.action_type as string,
        status: a.status as string,
        retryCount: Number(a.retry_count ?? 0),
        createdDate: a.created_date as string,
      }));

      return {
        total: actions.length,
        pending: byStatus("pending"),
        dispatched: byStatus("dispatched"),
        failed: byStatus("failed"),
        expired: byStatus("expired"),
        recentActions,
      };
    } catch {
      return { total: 0, pending: 0, dispatched: 0, failed: 0, expired: 0, recentActions: [] };
    }
  }
}

// Singleton HMR-safe
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g.__WatchAuditStore__) {
  _g.__WatchAuditStore__ = new WatchAuditStoreClass();
}
export const watchAuditStore = _g.__WatchAuditStore__ as WatchAuditStoreClass;