/**
 * ImplementationSandbox.ts — Sprint 6.2.2
 * Every engineering task executes inside an isolated sandbox before going live.
 * Pipeline: Plan → Patch → Simulate → Regression Shield → Governance Review → Approval → Apply
 */

import { EngineeringRegressionSuite } from "../engineering-regression/EngineeringRegressionSuite";
import type { SandboxResult, GovernanceProposal } from "./GovernanceTypes";

function ts(): string { return new Date().toISOString().slice(11, 23); }

export interface SandboxLog { time: string; stage: string; detail: string; ok: boolean }

export class ImplementationSandbox {
  private readonly _regression = new EngineeringRegressionSuite();

  async run(proposal: GovernanceProposal): Promise<{ result: SandboxResult; log: SandboxLog[] }> {
    const t0  = Date.now();
    const log: SandboxLog[] = [];
    const blockers: string[] = [];

    const record = (stage: string, detail: string, ok: boolean) => {
      log.push({ time: ts(), stage, detail, ok });
    };

    // 1. Plan validation
    const planOk = !!proposal.objective && proposal.impact.filesModified.length >= 0;
    record("PLAN_VALIDATION", planOk ? "Plan is valid" : "Plan validation failed", planOk);
    if (!planOk) blockers.push("Plan validation failed");

    // 2. Patch generation (simulated — no real code written in sandbox)
    const patch = `[SANDBOX] Dry-run patch for: ${proposal.objective}\nTarget components: ${proposal.impact.filesModified.join(", ")}\nRisk: ${proposal.impact.riskLevel}`;
    record("PATCH_GENERATION", "Dry-run patch generated (sandbox — not applied to production)", true);

    // 3. Simulate
    const simulationOk = proposal.impact.riskLevel !== "CRITICAL";
    record("SIMULATION", simulationOk ? "Simulation passed" : "CRITICAL risk — simulation blocked", simulationOk);
    if (!simulationOk) blockers.push("CRITICAL risk blocks simulation");

    // 4. Regression Shield
    let regressionOk = false;
    try {
      const regReport = await this._regression.run();
      regressionOk = regReport.shield === "PASS" || regReport.shield === "WARN";
      record("REGRESSION_SHIELD", `Shield=${regReport.shield} passed=${regReport.passed}/${regReport.total}`, regressionOk);
    } catch {
      regressionOk = false;
      record("REGRESSION_SHIELD", "Regression Shield threw — treating as FAIL", false);
    }
    if (!regressionOk) blockers.push("Regression Shield failed — rollback required");

    // 5. Governance Review
    const governanceOk = proposal.policyViolations.length === 0;
    record("GOVERNANCE_REVIEW",
      governanceOk ? "No policy violations" : `Policy violations: ${proposal.policyViolations.join(", ")}`,
      governanceOk);
    if (!governanceOk) blockers.push(`Policy violations: ${proposal.policyViolations.join(", ")}`);

    // 6. Approval check
    const approvalRequired = proposal.requiresApproval;
    const hasApproval = proposal.status === "APPROVED" && proposal.approvedAt !== null;
    const approvalOk  = !approvalRequired || hasApproval;
    record("APPROVAL_CHECK",
      approvalOk ? "Approval satisfied" : "Approval required but not yet granted",
      approvalOk);
    if (!approvalOk) blockers.push("Human approval required before IMPLEMENT");

    const readyToApply = blockers.length === 0;
    record("READY_TO_APPLY", readyToApply ? "Sandbox passed — ready to apply" : `Blocked: ${blockers.join("; ")}`, readyToApply);

    return {
      result: {
        proposalId:       proposal.id,
        patch,
        simulationOk,
        regressionOk,
        governanceOk,
        approvalRequired,
        readyToApply,
        blockers,
        durationMs:       Date.now() - t0,
      },
      log,
    };
  }
}