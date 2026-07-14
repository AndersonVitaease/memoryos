/**
 * EngineeringGovernance.ts — Sprint 6.2.2
 * Highest authority above Engineering Intelligence.
 * Nothing may modify the MemoryOS Core without passing Governance.
 *
 * Full pipeline:
 *   Submit → Impact Analysis → Security → Policy → Core Protection →
 *   Permission Check → Sandbox → Await Approval (if required) →
 *   Authorize → Audit
 */

import { CoreProtectionEngine }      from "./CoreProtectionEngine";
import { EngineeringPermissionEngine } from "./EngineeringPermissionEngine";
import { ChangeImpactAnalyzer }      from "./ChangeImpactAnalyzer";
import { RollbackEngine }            from "./RollbackEngine";
import { ImplementationSandbox }     from "./ImplementationSandbox";
import { GovernancePolicyEngine }    from "./GovernancePolicyEngine";
import { SecurityEngine }            from "./SecurityEngine";
import { GovernanceAuditEngine }     from "./GovernanceAuditEngine";
import type {
  GovernanceProposal, GovernanceReport, GovernanceStatus,
  PermissionLevel, SandboxResult,
} from "./GovernanceTypes";
import type { SandboxLog } from "./ImplementationSandbox";

let _seq = 0;
function makeId(p: string): string { return `${p}_${Date.now()}_${++_seq}`; }
function ts(): string { return new Date().toISOString().slice(11, 23); }

export interface GovernanceExecution {
  id:              string;
  objective:       string;
  stage:           string;
  log:             string[];
  proposal:        GovernanceProposal | null;
  sandboxResult:   SandboxResult | null;
  sandboxLog:      SandboxLog[];
  report:          GovernanceReport | null;
  startedAt:       number;
  completedAt:     number | null;
}

export class EngineeringGovernance {
  private readonly _cpe    = new CoreProtectionEngine();
  private readonly _perm   = new EngineeringPermissionEngine();
  private readonly _impact = new ChangeImpactAnalyzer();
  private readonly _rollback = new RollbackEngine();
  private readonly _sandbox  = new ImplementationSandbox();
  private readonly _policy   = new GovernancePolicyEngine();
  private readonly _security = new SecurityEngine();
  private readonly _audit    = new GovernanceAuditEngine();

  onStageChange?: (exec: GovernanceExecution) => void;

  get audit(): GovernanceAuditEngine { return this._audit; }
  get rollbacks(): RollbackEngine    { return this._rollback; }
  get cpe(): CoreProtectionEngine    { return this._cpe; }
  get perm(): EngineeringPermissionEngine { return this._perm; }
  get policies(): readonly string[]  { return this._policy.policies; }

  // ── Main submission ───────────────────────────────────────────────────────

  async submit(
    objective: string,
    targetComponents: string[],
    requestedPermission: PermissionLevel = "IMPLEMENT",
    connectorNames: string[] = [],
  ): Promise<GovernanceExecution> {
    const exec: GovernanceExecution = {
      id: makeId("gov"), objective, stage: "SUBMITTED",
      log: [], proposal: null, sandboxResult: null,
      sandboxLog: [], report: null,
      startedAt: Date.now(), completedAt: null,
    };

    const log = (msg: string) => { exec.log.push(`[${ts()}] ${msg}`); this._emit(exec); };
    const setStage = (s: string) => { exec.stage = s; this._emit(exec); };

    log(`Governance submission: "${objective}"`);
    log(`Requested permission: ${requestedPermission}`);

    // 1. Change Impact Analysis
    setStage("IMPACT_ANALYSIS");
    log("STEP 1 — Change Impact Analysis");
    const impact = this._impact.analyze(objective, targetComponents);
    log(`Risk: ${impact.riskLevel} (score=${impact.riskScore})`);
    log(`Protected files hit: ${impact.protectedFilesHit.join(", ") || "none"}`);
    log(`Singletons: ${impact.singletonsTouched.join(", ") || "none"}`);

    // 2. Security Check
    setStage("SECURITY_CHECK");
    log("STEP 2 — Security validation");
    const security = this._security.validate(objective, targetComponents, connectorNames);
    log(`Security: ${security.passed ? "PASSED" : "FAILED"} — ${security.findings.length} finding(s)`);
    security.findings.forEach(f => log(`  ⚠ ${f}`));

    // 3. Core Protection Check
    setStage("CORE_PROTECTION");
    log("STEP 3 — Core Protection check");
    const protection = this._cpe.check(targetComponents, objective, null);
    log(`Protected hit: ${protection.protectedHit.join(", ") || "none"}`);
    if (protection.requiresApproval) {
      log(`Core modification detected — human approval MANDATORY`);
      log(`Why necessary: ${protection.whyNecessary}`);
      log(`Regression probability: ${protection.regressionProbability}`);
    }

    // 4. Generate Rollback Plan (before any implementation)
    setStage("GENERATING_ROLLBACK");
    log("STEP 4 — Generating rollback plan");
    const proposalId = makeId("prop");
    const rollbackPlan = this._rollback.generate(proposalId, targetComponents);
    log(`Rollback ready: ${rollbackPlan.entries.length} entries`);

    // 5. Build proposal
    const requiresApproval = protection.requiresApproval || impact.riskLevel === "CRITICAL" || impact.riskLevel === "HIGH";

    const proposal: GovernanceProposal = {
      id:                  proposalId,
      objective,
      requestedPermission,
      impact,
      protectedComponents: protection.protectedHit,
      whyNecessary:        protection.whyNecessary,
      architecturalImpact: protection.architecturalImpact,
      riskLevel:           impact.riskLevel,
      regressionProbability: protection.regressionProbability,
      rollbackPlan:        protection.rollbackPlan,
      policyViolations:    [],
      requiresApproval,
      status:              "PENDING",
      createdAt:           Date.now(),
      approvedAt:          null,
      rejectedAt:          null,
      rejectionReason:     null,
    };
    exec.proposal = proposal;

    // 6. Policy check
    setStage("POLICY_CHECK");
    log("STEP 5 — Engineering policy validation");
    const violations = this._policy.validate(proposal);
    proposal.policyViolations = violations;
    if (violations.length > 0) {
      violations.forEach(v => log(`  ❌ ${v}`));
      proposal.status = "BLOCKED";
      log("Proposal BLOCKED by policy violations");
    } else {
      log("All policies satisfied");
    }

    // 7. Permission check
    setStage("PERMISSION_CHECK");
    log("STEP 6 — Permission check");
    const permCheck = this._perm.check(requestedPermission, impact.riskLevel, false, impact.protectedFilesHit.length);
    log(`Permission ${requestedPermission}: ${permCheck.granted ? "GRANTED" : "DENIED"} — ${permCheck.reason}`);

    // 8. Sandbox
    setStage("SANDBOX");
    log("STEP 7 — Executing Implementation Sandbox");
    const { result: sandboxResult, log: sandboxLog } = await this._sandbox.run(proposal);
    exec.sandboxResult = sandboxResult;
    exec.sandboxLog    = sandboxLog;
    log(`Sandbox: ${sandboxResult.readyToApply ? "READY" : "BLOCKED"} — ${sandboxResult.blockers.join("; ") || "no blockers"}`);

    // 9. Determine final governance status
    if (proposal.status !== "BLOCKED") {
      proposal.status = requiresApproval ? "PENDING" : "APPROVED";
    }

    if (proposal.status === "APPROVED" && !requiresApproval) {
      proposal.approvedAt = Date.now();
    }

    // 10. Build report
    setStage("GENERATING_REPORT");
    log("STEP 8 — Generating Governance Report");
    const auditEntry = this._audit.record({
      timestamp:  Date.now(),
      objective,
      planId:     proposalId,
      files:      impact.filesModified,
      decision:   `${requestedPermission} — ${impact.riskLevel}`,
      approval:   proposal.status === "APPROVED" ? "HUMAN_APPROVED" : proposal.status === "BLOCKED" ? "AUTO_BLOCKED" : "PENDING",
      regression: sandboxResult.regressionOk ? "PASSED" : "FAILED",
      rollback:   rollbackPlan.id,
      outcome:    proposal.status === "APPROVED" ? "PASS" : proposal.status === "BLOCKED" ? "BLOCKED" : "PENDING",
      approver:   proposal.status === "APPROVED" && !requiresApproval ? "MemoryOS (auto)" : "Pending human",
      policyViolations: violations,
    });

    const report: GovernanceReport = {
      proposalId,
      governanceOk:    proposal.status !== "BLOCKED",
      riskReport:      { level: impact.riskLevel, score: impact.riskScore, explanation: `${impact.riskLevel} risk — score ${impact.riskScore}/100` },
      impactReport:    impact,
      rollbackReport:  { available: true, entries: rollbackPlan.entries.length },
      auditEntry,
      approvalReport:  { required: requiresApproval, status: proposal.status, reason: permCheck.reason },
      regressionReport: { required: true, passed: sandboxResult.regressionOk },
      securityReport:  security,
      policyReport:    { violations, allPoliciesOk: violations.length === 0 },
      generatedAt:     Date.now(),
    };
    exec.report = report;

    setStage(requiresApproval && proposal.status === "PENDING" ? "WAIT_APPROVAL" : proposal.status === "BLOCKED" ? "BLOCKED" : "AUTHORIZED");
    exec.completedAt = requiresApproval ? null : Date.now();
    log(exec.stage === "WAIT_APPROVAL" ? "⏸ Awaiting human approval" : exec.stage === "BLOCKED" ? "❌ Blocked by governance" : "✅ Authorized — implementation may proceed");
    this._emit(exec);

    return exec;
  }

  // ── Human approval ────────────────────────────────────────────────────────

  approve(exec: GovernanceExecution): GovernanceExecution {
    if (!exec.proposal || exec.stage !== "WAIT_APPROVAL") throw new Error("Nothing pending approval");
    exec.proposal.approvedAt = Date.now();
    exec.proposal.status = "APPROVED";
    exec.stage = "AUTHORIZED";
    exec.completedAt = Date.now();

    // Update audit
    const existing = exec.report?.auditEntry;
    if (existing) {
      const updated = this._audit.record({
        ...existing,
        approval: "HUMAN_APPROVED",
        outcome:  "PASS",
        approver: "Human",
        timestamp: Date.now(),
        planId: existing.planId,
      });
      if (exec.report) exec.report.auditEntry = updated;
    }

    exec.log.push(`[${ts()}] ✅ HUMAN APPROVED — implementation authorized`);
    // Update permission check with approval
    const pc = this._perm.check(exec.proposal.requestedPermission, exec.proposal.riskLevel, true, exec.proposal.protectedComponents.length);
    exec.log.push(`[${ts()}] Permission re-check: ${pc.granted ? "GRANTED" : "DENIED"}`);
    this._emit(exec);
    return exec;
  }

  // ── Human rejection ───────────────────────────────────────────────────────

  reject(exec: GovernanceExecution, reason: string): GovernanceExecution {
    if (!exec.proposal) return exec;
    exec.proposal.rejectedAt = Date.now();
    exec.proposal.rejectionReason = reason;
    exec.proposal.status = "REJECTED";
    exec.stage = "REJECTED";
    exec.completedAt = Date.now();
    exec.log.push(`[${ts()}] ❌ REJECTED — ${reason}`);
    this._emit(exec);
    return exec;
  }

  private _emit(exec: GovernanceExecution): void {
    this.onStageChange?.({ ...exec, log: [...exec.log] });
  }
}