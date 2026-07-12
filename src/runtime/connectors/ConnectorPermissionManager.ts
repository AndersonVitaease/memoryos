/**
 * ConnectorPermissionManager.ts
 * Validates permissions and scopes before any connector action executes.
 * Least-privilege enforcement — Constitution S-01.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorManifest, ConnectorScope } from './interfaces/IConnectorManifest';
import type { IConnectorContext } from './interfaces/IConnectorContext';
import type { IConnectorAction } from './interfaces/IConnectorAction';

export interface PermissionCheckResult {
  readonly allowed: boolean;
  readonly connectorId: string;
  readonly actionId: string;
  readonly userId: string;
  readonly missingScopes: ReadonlyArray<string>;
  readonly missingPermissions: ReadonlyArray<string>;
  readonly reason?: string;
}

export class ConnectorPermissionManager {
  private checkCount = 0;
  private deniedCount = 0;

  check(
    action: IConnectorAction,
    context: IConnectorContext,
    manifest: IConnectorManifest,
  ): PermissionCheckResult {
    this.checkCount++;

    // Find action spec in manifest
    const actionSpec = manifest.supportedActions.find(a => a.id === action.actionId);
    if (!actionSpec) {
      this.deniedCount++;
      return {
        allowed: false,
        connectorId: action.connectorId,
        actionId: action.actionId,
        userId: context.userId,
        missingScopes: [],
        missingPermissions: [],
        reason: `ACTION_NOT_DECLARED: '${action.actionId}' is not in the connector manifest`,
      };
    }

    const grantedScopes = new Set(context.grantedScopes);
    const grantedPermissions = new Set(context.grantedPermissions);

    // Check required scopes for the action
    const missingScopes = actionSpec.requiredScopes.filter(s => !grantedScopes.has(s));

    // Check connector-level permissions
    const missingPermissions = manifest.permissions
      .filter(p => p.sensitive && !grantedPermissions.has(p.action))
      .map(p => p.action);

    if (missingScopes.length > 0 || missingPermissions.length > 0) {
      this.deniedCount++;
      return {
        allowed: false,
        connectorId: action.connectorId,
        actionId: action.actionId,
        userId: context.userId,
        missingScopes,
        missingPermissions,
        reason: 'INSUFFICIENT_PERMISSIONS',
      };
    }

    return {
      allowed: true,
      connectorId: action.connectorId,
      actionId: action.actionId,
      userId: context.userId,
      missingScopes: [],
      missingPermissions: [],
    };
  }

  /** Returns which scopes are required but not granted for a given action */
  getMissingScopes(actionId: string, context: IConnectorContext, manifest: IConnectorManifest): string[] {
    const spec = manifest.supportedActions.find(a => a.id === actionId);
    if (!spec) return [`ACTION_${actionId}_NOT_FOUND`];
    const granted = new Set(context.grantedScopes);
    return spec.requiredScopes.filter(s => !granted.has(s));
  }

  /** Returns all scopes available for a connector */
  getAvailableScopes(manifest: IConnectorManifest): ConnectorScope[] {
    return [...manifest.scopes];
  }

  /** Returns minimum required scopes for a specific action */
  getMinimumScopesForAction(actionId: string, manifest: IConnectorManifest): string[] {
    return manifest.supportedActions.find(a => a.id === actionId)?.requiredScopes ?? [];
  }

  statistics() {
    return {
      checkCount: this.checkCount,
      deniedCount: this.deniedCount,
      allowanceRate: this.checkCount > 0 ? (this.checkCount - this.deniedCount) / this.checkCount : 1,
    };
  }

  health() {
    return {
      status: 'HEALTHY' as const,
      details: `${this.checkCount} checks, ${this.deniedCount} denied`,
      checks: { enforcing: true },
      checkedAt: new Date().toISOString(),
    };
  }
}