/**
 * TrendLayer.ts — OIE Fase 4 (Sprint 6) — Learning Intelligence (dominio futuro)
 *
 * Responsabilidade unica: PROJECAO TEMPORAL de metricas do sistema. Learning
 * Intelligence nao e um dominio com dados proprios — e a projecao temporal
 * (Trend Layer) das metricas dos outros dominios (Engineering, User, Product).
 *
 * PRODUZ:
 *   - serie temporal de uma metrica agregada por bucket (dia ou hora)
 *   - metricas suportadas: failure_rate, behavior_signature_count,
 *     error_signature_count, total_executions
 *
 * USO: alimentar o Explainer (Fase 5) com "a falha X aumentou nas ultimas
 * 24h". Shadow mode.
 */

import { base44 } from "@/api/base44Client";

export type TrendMetric =
  | "failure_rate"
  | "behavior_signature_count"
  | "error_signature_count"
  | "total_executions";

export type BucketGranularity = "hour" | "day";

export interface TrendPoint {
  readonly bucket: string;
  readonly value: number;
}

export interface TrendProjection {
  readonly metric: TrendMetric;
  readonly granularity: BucketGranularity;
  readonly points: readonly TrendPoint[];
  readonly analyzedAt: number;
}

const FAIL_STATUSES = new Set(["failed", "timeout", "blocked"]);

export const TrendLayer = {
  async project(
    metric: TrendMetric,
    granularity: BucketGranularity = "day",
    limit = 2000,
  ): Promise<TrendProjection> {
    let observations: {
      status: string; created_date?: string;
      error_signature: string | null; behavior_signature: string | null;
    }[] = [];
    try {
      observations = await base44.entities.ExecutionObservation.filter({}, "-created_date", limit);
    } catch { /* pontos vazios */ }

    const buckets = new Map<string, { total: number; failures: number; errors: number; behaviors: number }>();
    for (const o of observations) {
      const bucketKey = this._bucketKey(o.created_date, granularity);
      if (!bucketKey) continue;
      let b = buckets.get(bucketKey);
      if (!b) { b = { total: 0, failures: 0, errors: 0, behaviors: 0 }; buckets.set(bucketKey, b); }
      b.total += 1;
      if (FAIL_STATUSES.has(o.status)) b.failures += 1;
      if (o.error_signature) b.errors += 1;
      if (o.behavior_signature) b.behaviors += 1;
    }

    const points: TrendPoint[] = [...buckets.entries()]
      .map(([bucket, b]) => ({
        bucket,
        value: this._computeValue(metric, b),
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    return Object.freeze({
      metric,
      granularity,
      points: Object.freeze(points),
      analyzedAt: Date.now(),
    });
  },

  _bucketKey(createdDate: string | undefined, granularity: BucketGranularity): string | null {
    if (!createdDate) return null;
    try {
      const d = new Date(createdDate);
      if (isNaN(d.getTime())) return null;
      if (granularity === "hour") {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}`;
      }
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    } catch {
      return null;
    }
  },

  _computeValue(metric: TrendMetric, b: { total: number; failures: number; errors: number; behaviors: number }): number {
    switch (metric) {
      case "failure_rate": return b.total > 0 ? b.failures / b.total : 0;
      case "behavior_signature_count": return b.behaviors;
      case "error_signature_count": return b.errors;
      case "total_executions": return b.total;
    }
  },
};