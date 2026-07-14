/**
 * SecurityEngine.ts
 * Sprint 6.2.2A — Governance Hardening (P2)
 *
 * Responsabilidade única: validar o blocklist global e registrar a decisão de segurança.
 * NÃO invoca CoreProtectionEngine nem GovernancePolicyEngine — esses resultados chegam
 * já computados pela facade (EngineeringGovernance) como parâmetros explícitos.
 * Elimina toda duplicação de lógica detectada na auditoria Sprint 6.2.2.
 */

import { GovernanceAuditEngine } from './GovernanceAuditEngine';
import type { SecurityCheckResult, OperationType, PermissionLevel } from './GovernanceTypes';

export class SecurityEngine {
  /** P2 fix: blocklist encapsulado como propriedade estática da classe (não mais estado de módulo). */
  private static readonly blocklist: Set<string> = new Set();

  /** Adds a principal to the global block list. */
  static blockPrincipal(principalId: string): void {
    this.blocklist.add(principalId);
    console.warn(`[SecurityEngine] Principal blocked: ${principalId}`);
  }

  /** Removes a principal from the global block list. */
  static unblockPrincipal(principalId: string): void {
    this.blocklist.delete(principalId);
  }

  /**
   * Security gate: evaluates only the blocklist + any pre-computed violations passed
   * by the facade (coreViolations from CoreProtectionEngine, policyViolations from
   * GovernancePolicyEngine). Does NOT call those engines internally.
   *
   * @param principalId     - Who is performing the operation.
   * @param targetPath      - Target component path.
   * @param operation       - Requested operation type.
   * @param grantedPermission - Permission level already resolved by PermissionEngine.
   * @param preComputedViolations - Violations already detected upstream (core + policy).
   */
  static check(
    principalId: string,
    targetPath: string,
    operation: OperationType,
    grantedPermission: PermissionLevel,
    preComputedViolations: string[] = []
  ): SecurityCheckResult {
    const violations: string[] = [...preComputedViolations];
    const checkedAt = new Date().toISOString();

    // Sole responsibility of SecurityEngine: blocklist check.
    if (this.blocklist.has(principalId)) {
      violations.push(`Principal "${principalId}" is globally blocked.`);
    }

    const allowed = violations.length === 0;

    // Audit every security gate invocation.
    GovernanceAuditEngine.record(
      violations.length > 0 ? 'security_violation' : 'permission_check',
      principalId,
      targetPath,
      operation,
      allowed ? 'allowed' : 'denied',
      { violations, grantedPermission, checkedAt }
    );

    if (!allowed) {
      console.error(`[SecurityEngine] DENIED — ${principalId} → ${operation} on ${targetPath}`);
      for (const v of violations) console.error(`  ↳ ${v}`);
    }

    return { allowed, violations, checkedAt };
  }

  /**
   * Convenience gate: throws if the operation is not allowed.
   * Use in places where a hard stop is needed.
   * Accepts the same pre-computed violations as check().
   */
  static enforce(
    principalId: string,
    targetPath: string,
    operation: OperationType,
    grantedPermission: PermissionLevel,
    preComputedViolations: string[] = []
  ): void {
    const result = this.check(principalId, targetPath, operation, grantedPermission, preComputedViolations);
    if (!result.allowed) {
      throw new Error(
        `[SecurityEngine] Operation denied: ${operation} on ${targetPath} by ${principalId}. Violations: ${result.violations.join('; ')}`
      );
    }
  }

  /** Returns blocked principals. */
  static listBlocked(): string[] {
    return [...this.blocklist];
  }

  static health(): { status: 'ok'; blockedPrincipals: number } {
    return { status: 'ok', blockedPrincipals: this.blocklist.size };
  }
}