/**
 * ConnectorCertificationPolicyEngine.ts — Engineering Sprint E-03.3
 * Evaluates certification evidence against policy thresholds.
 * Pure functions — no side effects, no persistence.
 */

import type { CertificationPolicy, CertificationEvidence } from "./CCCTypes";
import { DEFAULT_POLICY } from "./CCCTypes";

// ── Policy Registry ───────────────────────────────────────────────────────────

class PolicyEngine {
  private readonly _policies = new Map<string, CertificationPolicy>();

  register(policy: CertificationPolicy): void {
    this._policies.set(policy.connectorId, Object.freeze({ ...policy }));
  }

  get(connectorId: string): CertificationPolicy {
    return this._policies.get(connectorId) ?? { ...DEFAULT_POLICY, connectorId };
  }

  // ── Quality Gate ─────────────────────────────────────────────────────────────

  evaluate(
    connectorId: string,
    evidence: CertificationEvidence,
  ): { passed: boolean; failures: string[] } {
    const policy  = this.get(connectorId);
    const failures: string[] = [];

    if (evidence.precision < policy.minPrecision) {
      failures.push(`Precisao ${Math.round(evidence.precision * 100)}% < ${Math.round(policy.minPrecision * 100)}%`);
    }
    if (evidence.recall < policy.minRecall) {
      failures.push(`Recall ${Math.round(evidence.recall * 100)}% < ${Math.round(policy.minRecall * 100)}%`);
    }
    if (evidence.fpPct > policy.maxFalsePositivePct) {
      failures.push(`Falsos Positivos ${evidence.fpPct}% > ${policy.maxFalsePositivePct}%`);
    }
    if (evidence.fnPct > policy.maxFalseNegativePct) {
      failures.push(`Falsos Negativos ${evidence.fnPct}% > ${policy.maxFalseNegativePct}%`);
    }
    if (evidence.perfStats.avg > policy.maxAvgApiMs) {
      failures.push(`Avg API ${evidence.perfStats.avg}ms > ${policy.maxAvgApiMs}ms`);
    }
    if (evidence.perfStats.p95 > policy.maxP95Ms) {
      failures.push(`P95 ${evidence.perfStats.p95}ms > ${policy.maxP95Ms}ms`);
    }

    return { passed: failures.length === 0, failures };
  }

  // ── Expiry check ──────────────────────────────────────────────────────────────

  isCertExpired(connectorId: string, lastPassedAt: number | null): boolean {
    if (!lastPassedAt) return true;
    const policy = this.get(connectorId);
    return Date.now() > lastPassedAt + policy.maxCertAgeMs;
  }

  // ── Quality Gate for promotion ────────────────────────────────────────────────

  canPromote(connectorId: string, state: string): { allowed: boolean; reason: string } {
    const policy = this.get(connectorId);
    if (!policy.qualityGateEnabled) {
      return { allowed: true, reason: "Quality gate disabled for this connector" };
    }
    if (state === "certification_passed" || state === "production_ready" || state === "enterprise_ready") {
      return { allowed: true, reason: "Certification passed — promotion allowed" };
    }
    return {
      allowed: false,
      reason:  `Cannot promote from state "${state}". Connector must be in certification_passed.`,
    };
  }
}

const _PK = "__CERT_POLICY_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_PK]) {
  (globalThis as unknown as Record<string, unknown>)[_PK] = new PolicyEngine();
}
export const policyEngine: PolicyEngine = (
  globalThis as unknown as Record<string, PolicyEngine>
)[_PK];

// ── Pre-register known connectors ─────────────────────────────────────────────

policyEngine.register({ connectorId: "gmail",    ...DEFAULT_POLICY, maxCertAgeMs: 7 * 24 * 3600_000 });
policyEngine.register({ connectorId: "drive",    ...DEFAULT_POLICY, maxCertAgeMs: 7 * 24 * 3600_000 });
policyEngine.register({ connectorId: "calendar", ...DEFAULT_POLICY, maxCertAgeMs: 7 * 24 * 3600_000 });
policyEngine.register({ connectorId: "github",   ...DEFAULT_POLICY, maxCertAgeMs: 14 * 24 * 3600_000 });
policyEngine.register({ connectorId: "slack",    ...DEFAULT_POLICY, maxCertAgeMs: 14 * 24 * 3600_000 });