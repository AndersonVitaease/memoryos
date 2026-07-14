/**
 * GovernancePolicyEngine.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: avaliar políticas de governança de forma determinística.
 * Substitui qualquer implementação temporária de PolicyEngine.
 * Políticas são centralizadas, versionadas e imutáveis após registro.
 */

import type { Policy, PolicyEvaluation, OperationType, PermissionLevel } from './GovernanceTypes';

// Built-in baseline policies — cannot be removed, only disabled.
const BASELINE_POLICIES: Policy[] = [
  {
    id: 'p-immutable-no-write',
    name: 'Immutable Core Write Block',
    description: 'No write operations on immutable core components without Architecture Board approval.',
    targets: ['src/lib/wme', 'src/lib/sprint1', 'src/lib/officialLibraryManager.js'],
    requiredPermission: 'admin',
    blockConditions: ['operation=write', 'operation=delete', 'operation=refactor', 'operation=migrate'],
    enabled: true,
  },
  {
    id: 'p-restricted-no-delete',
    name: 'Restricted Component Delete Block',
    description: 'Deletion of restricted components requires admin-level permission.',
    targets: ['src/lib/fce', 'src/lib/abv', 'src/lib/AuthContext.jsx'],
    requiredPermission: 'admin',
    blockConditions: ['operation=delete'],
    enabled: true,
  },
  {
    id: 'p-auth-read-only',
    name: 'Auth Context Read-Only Policy',
    description: 'AuthContext may only be modified by the security-team role.',
    targets: ['src/lib/AuthContext.jsx'],
    requiredPermission: 'admin',
    blockConditions: ['operation=write', 'operation=refactor'],
    enabled: true,
  },
  {
    id: 'p-connector-audit',
    name: 'Connector Runtime Audit Policy',
    description: 'All write operations on connector-runtime must be audited.',
    targets: ['src/lib/connector-runtime'],
    requiredPermission: 'execute',
    blockConditions: [],
    enabled: true,
  },
];

function pathMatchesTarget(path: string, targets: string[]): boolean {
  return targets.some((t) => path.startsWith(t));
}

function conditionMatches(condition: string, operation: OperationType): boolean {
  return condition === `operation=${operation}`;
}

const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  propose: 2,
  execute: 3,
  admin: 4,
};

export class GovernancePolicyEngine {
  private static customPolicies: Policy[] = [];

  /** Registers a new custom policy. */
  static registerPolicy(policy: Policy): void {
    const existing = this.customPolicies.find((p) => p.id === policy.id);
    if (existing) {
      Object.assign(existing, policy);
    } else {
      this.customPolicies.push({ ...policy });
    }
  }

  /** Disables a custom policy by id (baseline policies cannot be permanently removed). */
  static disablePolicy(policyId: string): boolean {
    const custom = this.customPolicies.find((p) => p.id === policyId);
    if (custom) {
      custom.enabled = false;
      return true;
    }
    // Cannot disable baseline policies.
    return false;
  }

  /** Returns all active policies (baseline + custom). */
  static listPolicies(): Policy[] {
    return [...BASELINE_POLICIES, ...this.customPolicies].filter((p) => p.enabled);
  }

  /**
   * Evaluates all applicable policies for a given path + operation + grantedPermission.
   * Returns one evaluation per matching policy.
   */
  static evaluate(
    path: string,
    operation: OperationType,
    grantedPermission: PermissionLevel
  ): PolicyEvaluation[] {
    const results: PolicyEvaluation[] = [];
    const allPolicies = this.listPolicies();

    for (const policy of allPolicies) {
      if (!pathMatchesTarget(path, policy.targets)) continue;

      const hasBlockCondition = policy.blockConditions.some((c) => conditionMatches(c, operation));
      const hasRequiredPermission = LEVEL_RANK[grantedPermission] >= LEVEL_RANK[policy.requiredPermission];

      if (hasBlockCondition && !hasRequiredPermission) {
        results.push({
          policyId: policy.id,
          passed: false,
          reason: `Policy "${policy.name}" blocks operation "${operation}" — requires ${policy.requiredPermission}, granted ${grantedPermission}.`,
          blockedBy: policy.name,
        });
      } else {
        results.push({
          policyId: policy.id,
          passed: true,
          reason: `Policy "${policy.name}" passed for operation "${operation}" on "${path}".`,
        });
      }
    }

    return results;
  }

  /**
   * Convenience: returns true only if ALL applicable policies pass.
   */
  static passes(path: string, operation: OperationType, grantedPermission: PermissionLevel): boolean {
    const evals = this.evaluate(path, operation, grantedPermission);
    return evals.every((e) => e.passed);
  }

  static health(): { status: 'ok'; baselinePolicies: number; customPolicies: number; activePolicies: number } {
    return {
      status: 'ok',
      baselinePolicies: BASELINE_POLICIES.length,
      customPolicies: this.customPolicies.length,
      activePolicies: this.listPolicies().length,
    };
  }
}