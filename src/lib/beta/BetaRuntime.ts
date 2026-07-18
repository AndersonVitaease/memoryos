/**
 * BetaRuntime.ts — Sprint Beta-01
 *
 * Runs the official ValidationFramework and maps each ValidationResult
 * into a BetaSession record.  Architecture is frozen — zero new execution
 * logic here; everything delegates to the official chain.
 */

import { ValidationFramework }  from "@/lib/validation/ValidationFramework";
import { BetaStore }             from "./BetaStore";
import type { BetaSession }      from "./BetaStore";
import type { ValidationResult } from "@/lib/validation/ValidationTypes";

// Deterministic connector assignment based on scenario category
const CATEGORY_CONNECTOR: Record<string, string> = {
  "pipeline":     "gmail",
  "memory":       "google_drive",
  "connector":    "gmail",
  "report":       "google_calendar",
  "snapshot":     "google_drive",
  "audit":        "google_calendar",
  "explainability": "whatsapp_business",
  "regression":   "google_drive",
  "integration":  "gmail",
  "performance":  "google_calendar",
};

function _mapResultToSession(r: ValidationResult): void {
  const connectorId = (CATEGORY_CONNECTOR[r.category] ?? "gmail") as any;
  const connector = {
    connectorId,
    capability:  r.scenarioName,
    startedAt:   r.executedAt,
    durationMs:  r.metrics?.totalDurationMs ?? r.durationMs,
    success:     r.passed,
    retries:     0,
    error:       r.error ?? null,
  };

  BetaStore.record({
    sessionId:    `beta-${r.scenarioId}-${r.executedAt}`,
    startedAt:    r.executedAt,
    completedAt:  r.executedAt + (r.metrics?.totalDurationMs ?? r.durationMs),
    durationMs:   r.metrics?.totalDurationMs ?? r.durationMs,
    success:      r.passed,
    stagesPassed: r.metrics?.stagesPassed  ?? (r.passed ? 13 : 0),
    stagesTotal:  r.metrics?.stagesTotal   ?? 13,
    confidence:   r.metrics?.confidence    ?? 0,
    connectors:   [connector],
    hasReport:    !!r.report,
    hasSnapshot:  !!r.snapshot,
    hasAudit:     !!(r.report as any)?.auditResult,
    hasExplain:   !!(r.report as any)?.explainabilityResult,
    error:        r.error ?? null,
    scenarioId:   r.scenarioId,
    scenarioName: r.scenarioName,
    category:     r.category,
  });
}

export interface BetaRunResult {
  sessions:    readonly BetaSession[];
  certified:   boolean;
  regressions: readonly string[];
  cert:        any;
}

export async function runBetaSprint(
  onProgress?: (done: number, total: number, scenarioName: string) => void,
): Promise<BetaRunResult> {
  BetaStore.clear();

  const fw = new ValidationFramework();

  const suite = await fw.runAll((done, total, latest) => {
    _mapResultToSession(latest);
    onProgress?.(done, total, latest.scenarioName);
  });

  const regressions = fw.checkRegression(suite);
  const cert        = fw.certify(suite);

  return {
    sessions:    BetaStore.all(),
    certified:   cert.certified,
    regressions: Object.freeze(regressions),
    cert,
  };
}