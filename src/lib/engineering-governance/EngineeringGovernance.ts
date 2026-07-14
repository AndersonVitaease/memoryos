/**
 * EngineeringGovernance.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Facade unificada: ponto de entrada para todos os motores de governança.
 * Orquestra a sequência: Protection → Permission → Policy → Security → Sandbox → Audit.
 * Não implementa lógica própria — delega a cada motor especializado.
 */

import { CoreProtectionEngine } from './CoreProtectionEngine';
import { EngineeringPermissionEngine } from './EngineeringPermissionEngine';
import { ChangeImpactAnalyzer } from './ChangeImpactAnalyzer';
import { ImplementationSandbox } from './ImplementationSandbox';
import { RollbackEngine } from './RollbackEngine';
import { GovernancePolicyEngine } from './GovernancePolicyEngine';
import { GovernanceAuditEngine } from './GovernanceAuditEngine';
import { SecurityEngine } from './SecurityEngine';
import type { OperationType, ImpactReport } from './GovernanceTypes';

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

export class EngineeringGovernance {
  /**
   * Full governance pipeline for a proposed change.
   * Steps: Core Protection → Permission Check → Policy Evaluation → Security Gate → Impact Analysis.
   * Returns a decision — does NOT execute the change.
   */
  static evaluate(req: GovernanceRequest): GovernanceDecision {
    const { principalId, principalRole, targetPath, operation } = req;

    // Step 1: Core protection.
    const coreCheck = CoreProtectionEngine.checkOperation(targetPath, operation);

    // Step 2: Permission check (informed by core protection result).
    const permCheck = EngineeringPermissionEngine.check(
      principalId,
      principalRole,
      operation,
      targetPath,
      coreCheck
    );

    // Step 3: Policy evaluation.
    const policyEvals = GovernancePolicyEngine.evaluate(targetPath, operation, permCheck.grantedLevel);
    const policyViolations = policyEvals.filter((e) => !e.passed).map((e) => e.reason);

    // Step 4: Security gate.
    const secCheck = SecurityEngine.check(principalId, targetPath, operation, permCheck.grantedLevel);

    // Step 5: Impact analysis.
    const impactReport = ChangeImpactAnalyzer.analyze(targetPath, operation);

    // Aggregate.
    const allViolations = [
      ...(coreCheck.blocked ? [coreCheck.reason ?? 'Core protection block'] : []),
      ...(permCheck.allowed ? [] : [permCheck.reason]),
      ...policyViolations,
      ...secCheck.violations,
    ];

    const approved = allViolations.length === 0;
    const requiresSandbox = !approved || impactReport.requiresApproval;
    const requiresApproval = impactReport.requiresApproval || impactReport.severity === 'critical';

    // Audit the governance decision.
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
   * Execute a change through the full governance pipeline including sandbox.
   * Only runs the task if the governance decision approves it.
   */
  static async execute(
    req: GovernanceRequest,
    task: () => Promise<unknown> | unknown
  ): Promise<{ decision: GovernanceDecision; sandboxId?: string }> {
    const decision = this.evaluate(req);

    if (!decision.approved && !decision.requiresSandbox) {
      return { decision };
    }

    const result = await ImplementationSandbox.execute(
      req.targetPath,
      req.operation,
      task,
      req.principalId
    );

    return { decision, sandboxId: result.sandboxId };
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

  // Re-export engines for direct access when needed.
  static readonly core = CoreProtectionEngine;
  static readonly permissions = EngineeringPermissionEngine;
  static readonly impact = ChangeImpactAnalyzer;
  static readonly sandbox = ImplementationSandbox;
  static readonly rollback = RollbackEngine;
  static readonly policy = GovernancePolicyEngine;
  static readonly audit = GovernanceAuditEngine;
  static readonly security = SecurityEngine;
}