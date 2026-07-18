/**
 * CertificationExport — EF-40.3
 * Pure function: builds the JSON export payload.
 * No React. No side effects. No state mutation.
 */

import { ALL_PHASES, STATUS, EVIDENCE_LABEL, SOURCE_OF_TRUTH, MIN_SCORE } from "./CertificationConstants.js";

/** Build the result note for an execution matrix row */
export function matrixNote(name, phase) {
  if (!phase) return "Phase not registered";
  const s = phase.status;
  if (s === STATUS.NOT_EXECUTED) return phase.reason?.split(".")[0] ?? "Not executed";
  if (s === STATUS.FAIL)         return phase.reason ?? "Failed";
  const d = phase.data;
  if (!d) return "Passed";
  if (name === "TESTS")        return `${d.passed}/${d.total} tests passed`;
  if (name === "ARCHITECTURE") return `integrity:${d.integrity.passed}/${d.integrity.passed+d.integrity.failed} immutability:${d.immutability.passed}/${d.immutability.passed+d.immutability.failed} solid:${d.solid.ok}`;
  if (name === "SOLID")        return d.checks?.map(c => `${c.principle}:${c.verdict}`).join(" · ") ?? "Passed";
  if (name === "IMMUTABILITY") return `${d.passed}/${d.passed+d.failed} checks`;
  if (name === "PERFORMANCE")  return `${d.benchmarks?.length}/8 benchmarks`;
  if (name === "STRUCTURAL")   return `${d.passed}/${d.passed+d.failed} checks`;
  return "Passed";
}

/**
 * @param {Object} params
 * @returns {import('./CertificationTypes').ExportPayload}
 */
export function buildExportPayload({ execId, execAt, totalMs, coverage, scoreInfo, certStatus, phases, trail, regression, history }) {
  const matrix = ALL_PHASES.map(name => {
    const phase = phases[name];
    const s     = phase?.status ?? STATUS.NOT_EXECUTED;
    return {
      phase,
      status:        s,
      evidence:      EVIDENCE_LABEL[s] ?? "UNKNOWN",
      sourceOfTruth: SOURCE_OF_TRUTH[name],
      durationMs:    phase?.durationMs ?? 0,
      result:        matrixNote(name, phase),
    };
  });

  return {
    executionId:    execId,
    timestamp:      execAt,
    totalRuntimeMs: totalMs,
    coverage: {
      total:             coverage.total,
      executed:          coverage.executed.length,
      notExecuted:       coverage.notExecuted.length,
      coveragePct:       coverage.coveragePct,
      executedPhases:    coverage.executed,
      notExecutedPhases: coverage.notExecuted,
    },
    certificationScore: {
      score:         scoreInfo.score,
      grade:         scoreInfo.grade,
      executedCount: scoreInfo.executedCount,
      passedCount:   scoreInfo.passedCount,
      failedCount:   scoreInfo.failedCount,
      formula:       `${scoreInfo.passedCount} / ${scoreInfo.executedCount} × 100 = ${scoreInfo.score}`,
    },
    certificationStatus: certStatus,
    executionMatrix: matrix,
    auditTrail: trail,
    platformLimitations: [{
      id:        "VITE_RAW_COLLISION",
      title:     "Vite ?raw Module Evaluation Collision",
      impact:    ["SOURCE", "AST"],
      severity:  "Medium",
      workaround:"Implemented — isolated execution at /ef393-certification",
      resolved:  false,
    }],
    certificationDecision: {
      status:            certStatus,
      minScoreRequired:  MIN_SCORE,
      scoreAchieved:     scoreInfo.score,
      coverageAchieved:  coverage.coveragePct,
      notExecutedReason: coverage.notExecuted.length > 0
        ? "Documented platform limitation: Vite ?raw module collision"
        : null,
    },
    previousExecution: regression ? { executionId: regression.previousId } : null,
    regressionReport:  regression ?? null,
    historyIndex:      history ? history.findIndex(h => h.executionId === execId) : -1,
    trend:             regression ? regression.summary : "NO_HISTORY",
  };
}