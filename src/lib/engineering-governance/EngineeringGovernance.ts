/**
 * EngineeringGovernance.ts
 * Sprint 6.2.2A — Governance Hardening (P1, P2, P5)
 *
 * Facade unificada: único ponto de entrada público para o pipeline de governança.
 * Orquestra a sequência: Protection → Permission → Policy → Security → Impact → Snapshot → Sandbox → Audit.
 *
 * P1: RollbackEngine.capture() chamado automaticamente antes da execução de qualquer task.
 * P2: SecurityEngine recebe violations pré-computadas — não reexecuta CoreProtection/Policy.
 * P5: Referências diretas aos motores removidas da API pública — acesso via evaluate/execute/health apenas.
 */

import { CoreProtectionEngine } from './CoreProtectionEngine';
import { EngineeringPermissionEngine } from './EngineeringPermissionEngine';
import { ChangeImpactAnalyzer } from './ChangeImpactAnalyzer';
import { ImplementationSandbox } from './ImplementationSandbox';
import { RollbackEngine } from './RollbackEngine';
import { GovernancePolicyEngine } from './GovernancePolicyEngine';
import { GovernanceAuditEngine } from './GovernanceAuditEngine';
import { SecurityEngine } from './SecurityEngine';
import type { OperationType, ImpactReport, Snapshot } from './GovernanceTypes';

export interface GovernanceRequest {
  principalId: string;
  principalRole: string;
  targetPath: string;
  operation: OperationType;
}

export interface GovernanceDecision {
  approved: boolean;
  requiresSandbox: boolean;
  requiresApproval: boolean;
  impactReport: ImpactReport;
  violations: string[];
  reason: string;
}

export interface GovernanceExecutionResult {
  decision: GovernanceDecision;
  sandboxId?: string;
  /** P1: snapshot captured before task execution; present whenever sandbox ran. */
  snapshotId?: string;
}

export class EngineeringGovernance {
  /**
   * Full governance pipeline for a proposed change.
   *
   * Pipeline order (P2 hardened — no duplicate engine calls):
   *   Step 1: CoreProtectionEngine.checkOperation()
   *   Step 2: EngineeringPermissionEngine.check()        ← receives Step 1 result
   *   Step 3: GovernancePolicyEngine.evaluate()
   *   Step 4: SecurityEngine.check()                     ← receives pre-computed violations (Steps 1+3)
   *   Step 5: ChangeImpactAnalyzer.analyze()
   *   Audit:  GovernanceAuditEngine.record()
   *
   * Returns a decision — does NOT execute the change.
   */
  static evaluate(req: GovernanceRequest): GovernanceDecision {
    const { principalId, principalRole, targetPath, operation } = req;

    // Step 1: Core protection — single call, result reused downstream.
    const coreCheck = CoreProtectionEngine.checkOperation(targetPath, operation);
    const coreViolations = coreCheck.blocked
      ? [coreCheck.reason ?? 'Core protection block']
      : [];

    // Step 2: Permission check (informed by core protection result).
    const permCheck = EngineeringPermissionEngine.check(
      principalId,
      principalRole,
      operation,
      targetPath,
      coreCheck
    );
    const permViolations = permCheck.allowed ? [] : [permCheck.reason];

    // Step 3: Policy evaluation — single call, result reused by SecurityEngine.
    const policyEvals = GovernancePolicyEngine.evaluate(targetPath, operation, permCheck.grantedLevel);
    const policyViolations = policyEvals.filter((e) => !e.passed).map((e) => e.reason);

    // Step 4: Security gate — P2 fix: receives pre-computed violations, no internal engine calls.
    const upstreamViolations = [...coreViolations, ...permViolations, ...policyViolations];
    const secCheck = SecurityEngine.check(
      principalId,
      targetPath,
      operation,
      permCheck.grantedLevel,
      upstreamViolations  // pre-computed — SecurityEngine only adds blocklist check
    );

    // Step 5: Impact analysis.
    const impactReport = ChangeImpactAnalyzer.analyze(targetPath, operation);

    // Aggregate all violations (secCheck already includes upstream + blocklist).
    const allViolations = secCheck.violations;
    const approved = allViolations.length === 0;
    const requiresSandbox = impactReport.requiresApproval || impactReport.severity === 'critical' || impactReport.severity === 'high';
    const requiresApproval = impactReport.requiresApproval || impactReport.severity === 'critical';

    // Audit the final governance decision.
    GovernanceAuditEngine.record(
      approved ? 'change_approved' : 'change_rejected',
      principalId,
      targetPath,
      operation,
      approved ? 'allowed' : 'denied',
      { impactSeverity: impactReport.severity, riskScore: impactReport.riskScore, violations: allViolations }
    );

    return {
      approved,
      requiresSandbox,
      requiresApproval,
      impactReport,
      violations: allViolations,
      reason: approved
        ? `Change approved. Impact: ${impactReport.severity}, risk: ${impactReport.riskScore}/100.`
        : `Change rejected. Violations: ${allViolations.join(' | ')}`,
    };
  }

  /**
   * Executes a change through the full governance pipeline.
   *
   * Pipeline order (P1 hardened — snapshot before execution):
   *   1. evaluate()        → GovernanceDecision
   *   2. RollbackEngine.capture()  ← automatic pre-execution snapshot (P1)
   *   3. ImplementationSandbox.execute()
   *   4. Audit trail updated by SecurityEngine and evaluate()
   *
   * Only proceeds to snapshot+sandbox if the decision is approved OR requiresSandbox.
   */
  static async execute(
    req: GovernanceRequest,
    task: () => Promise<unknown> | unknown
  ): Promise<GovernanceExecutionResult> {
    const decision = this.evaluate(req);

    if (!decision.approved && !decision.requiresSandbox) {
      return { decision };
    }

    // P1: Capture pre-execution snapshot unconditionally before any task runs.
    const snapshot: Snapshot = RollbackEngine.capture(
      `pre-exec:${req.operation}:${req.targetPath}`,
      [req.targetPath],
      { targetPath: req.targetPath, operation: req.operation, principalId: req.principalId, capturedAt: new Date().toISOString() }
    );

    // Execute in sandbox.
    const sandboxResult = await ImplementationSandbox.execute(
      req.targetPath,
      req.operation,
      task,
      req.principalId
    );

    return {
      decision,
      sandboxId: sandboxResult.sandboxId,
      snapshotId: snapshot.snapshotId,
    };
  }

  /** Returns a unified health report from all engines. */
  static health(): Record<string, unknown> {
    return {
      coreProtection: CoreProtectionEngine.health(),
      permissions: EngineeringPermissionEngine.health(),
      impactAnalyzer: ChangeImpactAnalyzer.health(),
      sandbox: ImplementationSandbox.health(),
      rollback: RollbackEngine.health(),
      policyEngine: GovernancePolicyEngine.health(),
      auditEngine: GovernanceAuditEngine.health(),
      securityEngine: SecurityEngine.health(),
    };
  }

  // P5: All direct engine references removed from public API.
  // Motors are not accessible outside the facade — use evaluate(), execute(), health() only.
}