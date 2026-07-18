/**
 * CertificationEngine.ts — Architecture Baseline Engine v1.0
 * Sprint EF-6.7.0
 *
 * Certifies a diff against a set of rules.
 * Rules are pure functions — no hardcoded module names or expected values.
 * The engine applies rules to the diff and emits a seal.
 *
 * Rule library:
 *   R01 — No infrastructure export may be removed
 *   R02 — No infrastructure module may be removed
 *   R03 — Infrastructure hash changes require explicit justification (warn)
 *   R04 — New infrastructure dependencies are critical (coupling growth)
 *   R05 — Domain additions are expected (info only — not a violation)
 */

import type {
  ABEDiffResult,
  ABECertificationResult,
  ABECertificationRule,
  ABEViolation,
  ABEBaseline,
} from "./ABETypes";
import { diffBaselines } from "./BaselineDiffEngine";

// ── Rules ─────────────────────────────────────────────────────────────────────

const RULES: ABECertificationRule[] = [

  {
    id:          "R01",
    description: "No infrastructure export may be removed",
    check(diff) {
      const violations = diff.changes.filter(
        c => c.kind === "export_removed" && c.category === "Infraestrutura"
      );
      if (violations.length === 0) return null;
      return {
        ruleId:   "R01",
        message:  `${violations.length} infrastructure export(s) removed — breaking change`,
        changes:  violations,
        severity: "critical",
      };
    },
  },

  {
    id:          "R02",
    description: "No infrastructure module may be removed",
    check(diff) {
      const violations = diff.changes.filter(
        c => c.kind === "module_removed" && c.category === "Infraestrutura"
      );
      if (violations.length === 0) return null;
      return {
        ruleId:   "R02",
        message:  `${violations.length} infrastructure module(s) removed — breaking change`,
        changes:  violations,
        severity: "critical",
      };
    },
  },

  {
    id:          "R03",
    description: "Infrastructure hash changes must not occur silently",
    check(diff) {
      const violations = diff.changes.filter(
        c => c.kind === "hash_changed" && c.category === "Infraestrutura"
      );
      if (violations.length === 0) return null;
      return {
        ruleId:   "R03",
        message:  `${violations.length} infrastructure module(s) have changed hashes — review required`,
        changes:  violations,
        severity: "warning",
      };
    },
  },

  {
    id:          "R04",
    description: "Infrastructure modules must not gain new dependencies",
    check(diff) {
      const violations = diff.changes.filter(
        c => c.kind === "dependency_added" && c.category === "Infraestrutura"
      );
      if (violations.length === 0) return null;
      return {
        ruleId:   "R04",
        message:  `${violations.length} new infrastructure dependency(ies) — coupling growth detected`,
        changes:  violations,
        severity: "critical",
      };
    },
  },

  {
    id:          "R05",
    description: "Infrastructure exports must not change signature",
    check(diff) {
      const violations = diff.changes.filter(
        c => c.kind === "export_changed" && c.category === "Infraestrutura"
      );
      if (violations.length === 0) return null;
      return {
        ruleId:   "R05",
        message:  `${violations.length} infrastructure export signature(s) changed`,
        changes:  violations,
        severity: "critical",
      };
    },
  },
];

// ── Certification Engine ──────────────────────────────────────────────────────

export const CertificationEngine = {

  /**
   * Certify by comparing baseline vs current snapshot.
   * Rules applied automatically — no manual module knowledge.
   */
  certify(baseline: ABEBaseline, current: ABEBaseline): ABECertificationResult {
    const diff       = diffBaselines(baseline, current);
    return CertificationEngine.certifyDiff(diff, baseline.id, current.id);
  },

  /**
   * Certify a pre-computed diff.
   */
  certifyDiff(diff: ABEDiffResult, baselineId: string, currentId: string): ABECertificationResult {
    const violations: ABEViolation[] = [];

    for (const rule of RULES) {
      const v = rule.check(diff);
      if (v) violations.push(v);
    }

    const criticals = violations.filter(v => v.severity === "critical");
    const certified  = criticals.length === 0;

    return Object.freeze({
      baselineId,
      currentId,
      certifiedAt: new Date().toISOString(),
      certified,
      violations: Object.freeze(violations),
      diff,
      seal: certified ? "🟢 CERTIFICADO" : "🔴 NÃO CERTIFICADO",
    });
  },

  /** List all active rules (for documentation). */
  rules(): ABECertificationRule[] {
    return [...RULES];
  },
};