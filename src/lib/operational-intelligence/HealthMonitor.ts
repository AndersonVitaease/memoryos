/**
 * HealthMonitor.ts — OIE Fase 4 (Sprint 6) — dominio Engineering
 *
 * Responsabilidade unica: produzir um SNAPSHOT DE SAUDE do sistema a partir
 * das ExecutionObservation recentes. Deterministico, read-only.
 *
 * PRODUZ:
 *   - total de observacoes + success rate
 *   - top error_signatures (ranking de classes de erro)
 *   - top behavior_signatures (ranking de falhas silenciosas)
 *   - worst connectors (connectors com maior failure rate)
 *
 * USO: alimentar o Explainer (Fase 5) e dashboards. Shadow mode.
 */

import { base44 } from "@/api/base44Client";

export interface ConnectorHealth {
  readonly connector: string;
  readonly total: number;
  readonly failures: number;
  readonly failureRate: number;
}

export interface HealthSnapshot {
  readonly total: number;
  readonly successRate: number;
  readonly topErrorSignatures: { signature: string; count: number }[];
  readonly topBehaviorSignatures: { signature: string; count: number }[];
  readonly worstConnectors: ConnectorHealth[];
  readonly analyzedAt: number;
}

const FAIL_STATUSES = new Set(["failed", "timeout", "blocked"]);
const SUCCESS_STATUSES = new Set(["success", "completed"]);

export const HealthMonitor = {
  async snapshot(limit = 1000): Promise<HealthSnapshot> {
    let observations: {
      connector: string; status: string;
      error_signature: string | null; behavior_signature: string | null;
    }[] = [];
    try {
      observations = await base44.entities.ExecutionObservation.filter({}, "-created_date", limit);
    } catch { /* snapshot vazio */ }

    const total = observations.length;
    const successes = observations.filter((o) => SUCCESS_STATUSES.has(o.status)).length;
    const errorCounts: Record<string, number> = {};
    const behaviorCounts: Record<string, number> = {};
    const byConnector: Record<string, { total: number; failures: number }> = {};

    for (const o of observations) {
      if (o.error_signature) {
        errorCounts[o.error_signature] = (errorCounts[o.error_signature] ?? 0) + 1;
      }
      if (o.behavior_signature) {
        behaviorCounts[o.behavior_signature] = (behaviorCounts[o.behavior_signature] ?? 0) + 1;
      }
      if (!byConnector[o.connector]) byConnector[o.connector] = { total: 0, failures: 0 };
      byConnector[o.connector].total += 1;
      if (FAIL_STATUSES.has(o.status)) byConnector[o.connector].failures += 1;
    }

    const topErrorSignatures = Object.entries(errorCounts)
      .map(([signature, count]) => ({ signature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topBehaviorSignatures = Object.entries(behaviorCounts)
      .map(([signature, count]) => ({ signature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const worstConnectors: ConnectorHealth[] = Object.entries(byConnector)
      .map(([connector, v]) => ({
        connector,
        total: v.total,
        failures: v.failures,
        failureRate: v.total > 0 ? v.failures / v.total : 0,
      }))
      .filter((c) => c.failureRate > 0)
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 10);

    return Object.freeze({
      total,
      successRate: total > 0 ? successes / total : 0,
      topErrorSignatures: Object.freeze(topErrorSignatures),
      topBehaviorSignatures: Object.freeze(topBehaviorSignatures),
      worstConnectors: Object.freeze(worstConnectors),
      analyzedAt: Date.now(),
    });
  },
};