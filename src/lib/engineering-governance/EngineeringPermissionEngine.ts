/**
 * EngineeringPermissionEngine.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: validar permissões antes de qualquer modificação.
 * Desacoplado do CoreProtectionEngine — recebe resultados de proteção como input.
 */

import type { Permission, PermissionLevel, OperationType } from './GovernanceTypes';

// Numeric rank for permission level comparison.
const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  propose: 2,
  execute: 3,
  admin: 4,
};

// Default role → level mapping. Can be overridden via configure().
const DEFAULT_ROLE_LEVELS: Record<string, PermissionLevel> = {
  viewer: 'read',
  contributor: 'propose',
  engineer: 'execute',
  'lead-engineer': 'execute',
  admin: 'admin',
  'core-team': 'admin',
  'governance-team': 'execute',
  'security-team': 'admin',
  'platform-team': 'execute',
};

// Minimum permission required per operation type.
const OPERATION_REQUIREMENTS: Record<OperationType, PermissionLevel> = {
  read: 'read',
  write: 'execute',
  delete: 'admin',
  refactor: 'execute',
  migrate: 'admin',
  rollback: 'admin',
};

export interface PermissionCheckResult {
  allowed: boolean;
  principalId: string;
  operation: OperationType;
  targetPath: string;
  requiredLevel: PermissionLevel;
  grantedLevel: PermissionLevel;
  reason: string;
}

export class EngineeringPermissionEngine {
  private static roleOverrides: Record<string, PermissionLevel> = {};
  private static explicitPermissions: Permission[] = [];

  /** Override default role levels for this session. */
  static configure(roleOverrides: Record<string, PermissionLevel>): void {
    this.roleOverrides = { ...roleOverrides };
  }

  /** Grant an explicit, time-bounded permission to a principal. */
  static grant(permission: Permission): void {
    // Remove any existing grant for same principal+operation+path.
    this.explicitPermissions = this.explicitPermissions.filter(
      (p) =>
        !(
          p.principalId === permission.principalId &&
          p.operation === permission.operation &&
          p.targetPath === permission.targetPath
        )
    );
    this.explicitPermissions.push({ ...permission });
  }

  /** Revoke an explicit permission. */
  static revoke(principalId: string, operation: OperationType, targetPath: string): void {
    this.explicitPermissions = this.explicitPermissions.filter(
      (p) =>
        !(
          p.principalId === principalId &&
          p.operation === operation &&
          p.targetPath === targetPath
        )
    );
  }

  /**
   * Resolves the effective permission level for a principal on a given path/operation.
   * Explicit grants take precedence over role defaults.
   */
  static resolve(principalId: string, principalRole: string, operation: OperationType, targetPath: string): PermissionLevel {
    const now = new Date().toISOString();

    // Check explicit grants first.
    const explicit = this.explicitPermissions.find(
      (p) =>
        p.principalId === principalId &&
        (p.targetPath === targetPath || targetPath.startsWith(p.targetPath)) &&
        (p.operation === operation || p.operation === 'read') &&
        (!p.expiresAt || p.expiresAt > now)
    );
    if (explicit) return explicit.level;

    // Fall back to role level.
    const roleLevel =
      this.roleOverrides[principalRole] ??
      DEFAULT_ROLE_LEVELS[principalRole] ??
      'none';
    return roleLevel;
  }

  /**
   * Main check: returns whether the principal can perform the operation.
   */
  static check(
    principalId: string,
    principalRole: string,
    operation: OperationType,
    targetPath: string,
    protectionBlockResult?: { blocked: boolean; reason?: string }
  ): PermissionCheckResult {
    // Hard block from CoreProtectionEngine takes absolute priority.
    if (protectionBlockResult?.blocked) {
      return {
        allowed: false,
        principalId,
        operation,
        targetPath,
        requiredLevel: 'admin',
        grantedLevel: 'none',
        reason: `Core protection override: ${protectionBlockResult.reason}`,
      };
    }

    const required = OPERATION_REQUIREMENTS[operation];
    const granted = this.resolve(principalId, principalRole, operation, targetPath);

    const allowed = LEVEL_RANK[granted] >= LEVEL_RANK[required];

    return {
      allowed,
      principalId,
      operation,
      targetPath,
      requiredLevel: required,
      grantedLevel: granted,
      reason: allowed
        ? `Principal "${principalId}" has sufficient permission (${granted} >= ${required}).`
        : `Principal "${principalId}" lacks permission. Required: ${required}, granted: ${granted}.`,
    };
  }

  /** Lists all active explicit permissions. */
  static listGrants(): Permission[] {
    const now = new Date().toISOString();
    return this.explicitPermissions.filter((p) => !p.expiresAt || p.expiresAt > now).map((p) => ({ ...p }));
  }

  static health(): { status: 'ok'; activeGrants: number } {
    return { status: 'ok', activeGrants: this.listGrants().length };
  }
}