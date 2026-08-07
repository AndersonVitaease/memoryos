/**
 * RegressionAnalyzer.ts — OIE Fase 4 (Sprint 6) — dominio Engineering
 *
 * Responsabilidade unica: comparar o comportamento do sistema entre duas
 * versoes (sprint_tag) e detectar REGRESSOES — assinaturas de erro/comportamento
 * que pioraram de uma sprint para a proxima.
 *
 * COMPARA:
 *   - error_signature distribution (Timeout, AuthError, etc.) por sprint_tag
 *   - behavior_signature distribution (PartialRepositoryTraversal, etc.)
 *   - failure rate (status=failed|timeout / total)
 *
 * REGRESSAO = qualquer de:
 *   - nova error_signature presente na current e ausente na baseline
 *   - nova behavior_signature presente na current e ausente na baseline
 *   - failure_rate subiu acima de um threshold (default +5pts percentuais)
 *
 * PRINCIPIOS: read-only, deterministico, shadow mode.
 */

import { base44 } from "@/api/base44Client";

export interface SprintProfile {
  readonly sprintTag: string;
  readonly total: number;
  readonly failureRate: number;
  readonly errorSignatures: Record<string, number>;
  readonly behaviorSignatures: Record<string, number>;
}

export interface RegressionFinding {
  readonly type: "new_error_signature" | "new_behavior_signature" | "failure_rate_increase";
  readonly detail: string;
  readonly severity: "low" | "medium" | "high";
}

export interface RegressionReport {
  readonly baseline: SprintProfile;
  readonly current: SprintProfile;
  readonly findings: readonly RegressionFinding[];
  readonly isRegression: boolean;
  readonly analyzedAt: number;
}

const FAIL_STATUSES = new Set(["failed", "timeout", "blocked"]);

export const RegressionAnalyzer = {
  async compareSprints(
    currentTag: string,
    baselineTag: string,
    limit = 500,
    failureRateDeltaThreshold = 0.05,
  ): Promise<RegressionReport> {
    const [current, baseline] = await Promise.all([
      this._profileSprint(currentTag, limit),
      this._profileSprint(baselineTag, limit),
    ]);

    const findings: RegressionFinding[] = [];

    for (const sig of Object.keys(current.errorSignatures)) {
      if (!(sig in baseline.errorSignatures)) {
        findings.push({
          type: "new_error_signature",
          detail: `error_signature "${sig}" apareceu em ${currentTag} (era ausente em ${baselineTag})`,
          severity: current.errorSignatures[sig] >= 3 ? "high" : "medium",
        });
      }
    }
    for (const sig of Object.keys(current.behaviorSignatures)) {
      if (!(sig in baseline.behaviorSignatures)) {
        findings.push({
          type: "new_behavior_signature",
          detail: `behavior_signature "${sig}" apareceu em ${currentTag} (era ausente em ${baselineTag})`,
          severity: "low",
        });
      }
    }
    if (baseline.total > 0 && current.total > 0) {
      const delta = current.failureRate - baseline.failureRate;
      if (delta > failureRateDeltaThreshold) {
        findings.push({
          type: "failure_rate_increase",
          detail: `failure_rate subiu ${(delta * 100).toFixed(1)}pts (${baselineTag}: ${(baseline.failureRate * 100).toFixed(1)}% → ${currentTag}: ${(current.failureRate * 100).toFixed(1)}%)`,
          severity: delta > 0.15 ? "high" : "medium",
        });
      }
    }

    return Object.freeze({
      baseline: Object.freeze(baseline),
      current: Object.freeze(current),
      findings: Object.freeze(findings),
      isRegression: findings.length > 0,
      analyzedAt: Date.now(),
    });
  },

  async _profileSprint(sprintTag: string, limit: number): Promise<SprintProfile> {
    let observations: { status: string; error_signature: string | null; behavior_signature: string | null }[] = [];
    try {
      observations = await base44.entities.ExecutionObservation.filter(
        { sprint_tag: sprintTag },
        "-created_date",
        limit,
      );
    } catch { /* vira perfil vazio */ }
    const total = observations.length;
    const failures = observations.filter((o) => FAIL_STATUSES.has(o.status)).length;
    const errorSignatures: Record<string, number> = {};
    const behaviorSignatures: Record<string, number> = {};
    for (const o of observations) {
      if (o.error_signature) {
        errorSignatures[o.error_signature] = (errorSignatures[o.error_signature] ?? 0) + 1;
      }
      if (o.behavior_signature) {
        behaviorSignatures[o.behavior_signature] = (behaviorSignatures[o.behavior_signature] ?? 0) + 1;
      }
    }
    return {
      sprintTag,
      total,
      failureRate: total > 0 ? failures / total : 0,
      errorSignatures,
      behaviorSignatures,
    };
  },
};