/**
 * CertificationEngine — EF-40.3
 * Pure computation: Coverage, Score, CertStatus.
 * No React. No side effects. No I/O.
 */

import {
  STATUS, ALL_PHASES, TOTAL_PHASES, MIN_SCORE, CERT_STATUS,
} from "./CertificationConstants.js";

/** @param {Record<string,import('./CertificationTypes').PhaseResult>} phases */
export function computeCoverage(phases) {
  const executed    = ALL_PHASES.filter(k => phases[k]?.status !== STATUS.NOT_EXECUTED);
  const notExecuted = ALL_PHASES.filter(k => phases[k]?.status === STATUS.NOT_EXECUTED);
  const coveragePct = Math.round((executed.length / TOTAL_PHASES) * 100);
  return { executed, notExecuted, total: TOTAL_PHASES, coveragePct };
}

/** @param {Record<string,import('./CertificationTypes').PhaseResult>} phases */
export function computeScore(phases) {
  const executed = ALL_PHASES.filter(k => phases[k]?.status !== STATUS.NOT_EXECUTED);
  const passed   = executed.filter(k => phases[k]?.status === STATUS.PASS);
  const failed   = executed.filter(k => phases[k]?.status === STATUS.FAIL);
  const score    = executed.length > 0 ? Math.round((passed.length / executed.length) * 100) : 0;
  const grade    = score >= 97 ? "A+" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade, executedCount: executed.length, passedCount: passed.length, failedCount: failed.length, passed, failed, executed };
}

/**
 * @param {import('./CertificationTypes').CoverageResult} coverage
 * @param {import('./CertificationTypes').ScoreResult} scoreInfo
 */
export function computeCertStatus(coverage, scoreInfo) {
  const hasNotExecuted = coverage.notExecuted.length > 0;
  const hasFail        = scoreInfo.failedCount > 0;
  if (hasFail)                      return CERT_STATUS.NOT_CERTIFIED;
  if (hasNotExecuted)               return CERT_STATUS.PARTIALLY_CERTIFIED;
  if (scoreInfo.score >= MIN_SCORE) return CERT_STATUS.CERTIFIED;
  return CERT_STATUS.NOT_CERTIFIED;
}

export function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}