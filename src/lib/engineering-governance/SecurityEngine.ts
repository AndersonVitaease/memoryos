/**
 * SecurityEngine.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: validar operações críticas e proteger contra acessos não autorizados.
 * Atua como última barreira antes de qualquer execução — após permissões e políticas.
 */

import { CoreProtectionEngine } from './CoreProtectionEngine';
import { GovernancePolicyEngine } from './GovernancePolicyEngine';
import { GovernanceAuditEngine } from './GovernanceAuditEngine';
import type { SecurityCheckResult, OperationType, PermissionLevel } from './GovernanceTypes';

// Operations that always require a security check regardless of protection level.
const ALWAYS_CHECKED_OPS: OperationType[] = ['write', 'delete', 'refactor', 'migrate', 'rollback'];

// Principals that are globally blocked (e.g., compromised accounts).
const GLOBAL_BLOCKLIST: Set<string> = new Set();

export class SecurityEngine {
  /** Adds a principal to the global block list. */
  static blockPrincipal(principalId: string): void {
    GLOBAL_BLOCKLIST.add(principalId);
    console.warn(`[SecurityEngine] Principal blocked: ${principalId}`);
  }

  /** Removes a principal from the global block list. */
  static unblockPrincipal(principalId: string): void {
    GLOBAL_BLOCKLIST.delete(principalId);
  }

  /**
   * Performs the full security gate check for a proposed operation.
   * Integrates CoreProtection + PolicyEngine + blocklist.
   * Records all violations to the audit trail automatically.
   */
  static check(
    principalId: string,
    targetPath: string,
    operation: OperationType,
    grantedPermission: PermissionLevel
  ): SecurityCheckResult {
    const violations: string[] = [];
    const checkedAt = new Date().toISOString();

    // 1. Global blocklist.
    if (GLOBAL_BLOCKLIST.has(principalId)) {
      violations.push(`Principal "${principalId}" is globally blocked.`);
    }

    // 2. Core protection hard check (only for critical operations).
    if (ALWAYS_CHECKED_OPS.includes(operation)) {
      const coreCheck = CoreProtectionEngine.checkOperation(targetPath, operation);
      if (coreCheck.blocked) {
        violations.push(`Core protection: ${coreCheck.reason}`);
      }
    }

    // 3. Policy evaluation.
    const policyEvals = GovernancePolicyEngine.evaluate(targetPath, operation, grantedPermission);
    for (const ev of policyEvals) {
      if (!ev.passed) {
        violations.push(`Policy violation: ${ev.reason}`);
      }
    }

    const allowed = violations.length === 0;

    // 4. Audit every security check (violations always logged as denied).
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
   */
  static enforce(
    principalId: string,
    targetPath: string,
    operation: OperationType,
    grantedPermission: PermissionLevel
  ): void {
    const result = this.check(principalId, targetPath, operation, grantedPermission);
    if (!result.allowed) {
      throw new Error(
        `[SecurityEngine] Operation denied: ${operation} on ${targetPath} by ${principalId}. Violations: ${result.violations.join('; ')}`
      );
    }
  }

  /** Returns blocked principals. */
  static listBlocked(): string[] {
    return [...GLOBAL_BLOCKLIST];
  }

  static health(): { status: 'ok'; blockedPrincipals: number } {
    return { status: 'ok', blockedPrincipals: GLOBAL_BLOCKLIST.size };
  }
}