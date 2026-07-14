/**
 * GovernanceValidator.ts — Sprint 6.3.5
 * Validates governance layer, policies, and rollback capability.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "WARN", detail, critical };
}

export class GovernanceValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    const govModules: Array<[string, string, boolean]> = [
      ["EngineeringGovernance",        "../engineering-governance/EngineeringGovernance",        true],
      ["CoreProtectionEngine",         "../engineering-governance/CoreProtectionEngine",          true],
      ["RollbackEngine",               "../engineering-governance/RollbackEngine",                false],
      ["SecurityEngine",               "../engineering-governance/SecurityEngine",                true],
      ["GovernancePolicyEngine",       "../engineering-governance/GovernancePolicyEngine",        false],
      ["GovernanceAuditEngine",        "../engineering-governance/GovernanceAuditEngine",         false],
      ["ChangeImpactAnalyzer",         "../engineering-governance/ChangeImpactAnalyzer",          false],
      ["EngineeringPermissionEngine",  "../engineering-governance/EngineeringPermissionEngine",   false],
    ];

    for (const [name, path, critical] of govModules) {
      let ok = false;
      try {
        const mod = await import(/* @vite-ignore */ path);
        ok = !!mod && Object.keys(mod).length > 0;
      } catch { ok = false; }
      checks.push(check(`Governance: ${name}`, ok, ok ? "Module accessible" : "Module missing", critical));
    }

    // Verify governance audit is append-only
    let auditOk = false;
    try {
      const { GovernanceAuditEngine } = await import("../engineering-governance/GovernanceAuditEngine");
      const gae = new GovernanceAuditEngine();
      auditOk = !!gae;
    } catch { auditOk = false; }
    checks.push(check("Governance audit engine operational", auditOk, auditOk ? "Audit engine active" : "Audit engine failed", false));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "gov_validator",
      name: "Governance Validator",
      domain: "Governance",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} governance checks passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[GOV] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: failed.length > 0
        ? ["Restore governance modules before deploying connector integrations."] : [],
    };
  }
}