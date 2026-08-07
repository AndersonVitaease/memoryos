/**
 * AnomalyPredictor.ts — OIE Sprint 11 — camada preditiva (DETERMINISTICA)
 *
 * Responsabilidade: projetar trend lines (least-squares) sobre as metricas
 * temporais do sistema e prever quando uma anomalia em formacao vai cruzar
 * um limiar critico. DETERMINISTICO — sem LLM, sem inferencia probabilistica:
 * regressao linear simples sobre buckets de ExecutionObservation.
 *
 * SINAIS PREDITIVOS:
 *   - failure_rate_rising: slope de failure_rate > minimo significativo (warning)
 *   - failure_rate_projected_breach: slope projeta cruzar failureRateCritical
 *     dentro de predictionHorizonBuckets (critical)
 *   - connector_degradation: mesmo sinal, por connector (warning/critical)
 *   - error_signature_accelerating: count de uma error_signature cresce por
 *     bucket (warning)
 *
 * PRINCIPIOS: read-only, deterministico, consultivo, sem nova entidade.
 * Consome ExecutionObservation (ja populado pelo RuntimeObserver). Nao
 * re-query o TrendLayer — aqui precisamos de slope + projecao por dimensao
 * (global, por-connector, por-error_signature), entao computamos in-memory
 * a partir de uma unica fetch.
 */

import { base44 } from "@/api/base44Client";
import type { OIEConfigShape } from "./OIEConfig";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type PredictionFindingType =
  | "failure_rate_rising"
  | "failure_rate_projected_breach"
  | "connector_degradation"
  | "error_signature_accelerating";

export interface PredictionPoint {
  readonly bucket: string;
  readonly value: number;
}

export interface PredictionFinding {
  readonly type: PredictionFindingType;
  readonly metric: string;
  readonly slope: number;
  readonly projectedValue: number;
  readonly breachBucket: string | null;
  readonly detail: string;
  readonly severity: "warning" | "critical";
  readonly evidence: readonly PredictionPoint[];
}

export interface PredictionReport {
  readonly granularity: "hour" | "day";
  readonly horizonBuckets: number;
  readonly findings: readonly PredictionFinding[];
  readonly analyzedAt: number;
}

const FAIL_STATUSES = new Set(["failed", "timeout", "blocked"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function _bucketKey(createdDate: string | undefined, granularity: "hour" | "day"): string | null {
  if (!createdDate) return null;
  try {
    const d = new Date(createdDate);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    if (granularity === "hour") {
      return `${y}-${m}-${day}T${String(d.getUTCHours()).padStart(2, "0")}`;
    }
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

function _extrapolateBucket(bucket: string, bucketsAhead: number): string {
  try {
    if (bucket.includes("T")) {
      const [date, hour] = bucket.split("T");
      const [y, m, d] = date.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, Number(hour)));
      dt.setUTCHours(dt.getUTCHours() + bucketsAhead);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}T${String(dt.getUTCHours()).padStart(2, "0")}`;
    }
    const [y, m, d] = bucket.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + bucketsAhead);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  } catch {
    return bucket;
  }
}

function _linearRegression(pts: PredictionPoint[]): { slope: number; intercept: number } {
  const n = pts.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: pts[0].value };
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i, y = pts[i].value;
    sx += x; sy += y; sxy += x * y; sx2 += x * x;
  }
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function _sortedPoints(entries: [string, number][]): PredictionPoint[] {
  return entries
    .map(([bucket, value]) => ({ bucket, value }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function _analyzeRateTrend(
  pts: PredictionPoint[],
  metric: string,
  horizon: number,
  minSamples: number,
  slopeSig: number,
  criticalThreshold: number,
  findings: PredictionFinding[],
  isConnector: boolean,
): void {
  if (pts.length < minSamples) return;
  const reg = _linearRegression(pts);
  if (reg.slope <= slopeSig) return; // nao esta subindo significativamente
  const lastIdx = pts.length - 1;
  const projectedRaw = reg.intercept + reg.slope * (lastIdx + horizon);
  const projected = Math.min(1, Math.max(0, projectedRaw));

  let breachBucket: string | null = null;
  if (reg.slope > 0 && projectedRaw >= criticalThreshold) {
    const breachIdx = (criticalThreshold - reg.intercept) / reg.slope;
    const breachIdxRounded = Math.ceil(breachIdx);
    if (breachIdxRounded >= 0) {
      const ahead = Math.max(breachIdxRounded - lastIdx, 0);
      breachBucket = _extrapolateBucket(pts[lastIdx].bucket, ahead);
    }
  }

  const breached = breachBucket !== null;
  const type: PredictionFindingType = isConnector
    ? "connector_degradation"
    : breached
      ? "failure_rate_projected_breach"
      : "failure_rate_rising";

  findings.push(Object.freeze({
    type,
    metric,
    slope: reg.slope,
    projectedValue: projected,
    breachBucket,
    detail: breached
      ? `${metric}: slope=${reg.slope.toFixed(4)}/bucket — projetado cruza ${criticalThreshold} em ${breachBucket} (${horizon} buckets a frente)`
      : `${metric}: slope=${reg.slope.toFixed(4)}/bucket — projetado ${projected.toFixed(3)} em ${horizon} buckets (abaixo de ${criticalThreshold})`,
    severity: breached ? "critical" : "warning",
    evidence: Object.freeze(pts),
  }));
}

// ── AnomalyPredictor ─────────────────────────────────────────────────────────

export const AnomalyPredictor = {
  /**
   * Projeta trends e emite findings preditivos. Deterministico: mesma entrada
   * (mesmas ExecutionObservation + mesma config) => mesmos findings.
   *
   * @param granularity "hour" | "day" — granularidade dos buckets
   * @param cfg config vigente (le thresholds + master switch aqui, nao no call site)
   */
  async predict(granularity: "hour" | "day" = "day", cfg: OIEConfigShape): Promise<PredictionReport> {
    const horizon = cfg.thresholds.predictionHorizonBuckets;
    const minSamples = cfg.thresholds.predictionMinSamples;
    const slopeSig = cfg.thresholds.predictionSlopeSignificance;
    const criticalThreshold = cfg.thresholds.failureRateCritical;

    let observations: {
      status: string; created_date?: string;
      connector: string; error_signature: string | null;
    }[] = [];
    try {
      observations = await base44.entities.ExecutionObservation.filter({}, "-created_date", 2000);
    } catch { /* report vazio */ }

    const globalBuckets = new Map<string, { total: number; failures: number }>();
    const connectorBuckets = new Map<string, Map<string, { total: number; failures: number }>>();
    const errorBuckets = new Map<string, Map<string, number>>();

    for (const o of observations) {
      const bk = _bucketKey(o.created_date, granularity);
      if (!bk) continue;

      let gb = globalBuckets.get(bk);
      if (!gb) { gb = { total: 0, failures: 0 }; globalBuckets.set(bk, gb); }
      gb.total += 1;
      if (FAIL_STATUSES.has(o.status)) gb.failures += 1;

      if (o.connector) {
        let cb = connectorBuckets.get(o.connector);
        if (!cb) { cb = new Map(); connectorBuckets.set(o.connector, cb); }
        let c = cb.get(bk);
        if (!c) { c = { total: 0, failures: 0 }; cb.set(bk, c); }
        c.total += 1;
        if (FAIL_STATUSES.has(o.status)) c.failures += 1;
      }
      if (o.error_signature) {
        let eb = errorBuckets.get(o.error_signature);
        if (!eb) { eb = new Map(); errorBuckets.set(o.error_signature, eb); }
        eb.set(bk, (eb.get(bk) ?? 0) + 1);
      }
    }

    const findings: PredictionFinding[] = [];

    // Trend global de failure_rate
    const globalPoints = _sortedPoints(
      [...globalBuckets.entries()].map(([bk, v]) => [bk, v.total > 0 ? v.failures / v.total : 0] as [string, number]),
    );
    _analyzeRateTrend(globalPoints, "failure_rate", horizon, minSamples, slopeSig, criticalThreshold, findings, false);

    // Trend por connector — so analisa com volume minimo (>= 2x minSamples obs)
    for (const [connector, bmap] of connectorBuckets) {
      let totalObs = 0;
      for (const v of bmap.values()) totalObs += v.total;
      if (totalObs < minSamples * 2) continue;
      const pts = _sortedPoints(
        [...bmap.entries()].map(([bk, v]) => [bk, v.total > 0 ? v.failures / v.total : 0] as [string, number]),
      );
      _analyzeRateTrend(pts, connector, horizon, minSamples, slopeSig, criticalThreshold, findings, true);
    }

    // Aceleracao por error_signature (count por bucket, slope positiva)
    for (const [sig, bmap] of errorBuckets) {
      const pts = _sortedPoints([...bmap.entries()]);
      if (pts.length < minSamples) continue;
      const reg = _linearRegression(pts);
      if (reg.slope <= slopeSig) continue;
      const lastIdx = pts.length - 1;
      const projected = Math.max(0, reg.intercept + reg.slope * (lastIdx + horizon));
      findings.push(Object.freeze({
        type: "error_signature_accelerating",
        metric: sig,
        slope: reg.slope,
        projectedValue: projected,
        breachBucket: null,
        detail: `error_signature "${sig}" cresce ${reg.slope.toFixed(2)}/bucket — projetado ${projected.toFixed(1)} ocorrencias em ${horizon} buckets`,
        severity: "warning",
        evidence: Object.freeze(pts),
      }));
    }

    return Object.freeze({
      granularity,
      horizonBuckets: horizon,
      findings: Object.freeze(findings),
      analyzedAt: Date.now(),
    });
  },
};