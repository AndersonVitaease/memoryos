/**
 * GoogleWorkspacePermissionValidator.ts — Engineering Sprint 7.0
 * Validates OAuth scopes and user consent before capability execution.
 */

import type { GWSServiceId, GWSPermissionCheck } from "./GoogleWorkspaceTypes";
import { GoogleWorkspaceAuth } from "./GoogleWorkspaceAuth";
import { missingScopes, scopesForService } from "./GoogleWorkspaceScopes";

class PermissionValidatorClass {
  /**
   * Verify a user has all required scopes for a service.
   */
  check(userId: string, serviceId: GWSServiceId, requiredScopes?: string[]): GWSPermissionCheck {
    const token   = GoogleWorkspaceAuth.getToken(userId);
    const granted = token?.scopes ?? [];
    const required = requiredScopes ?? scopesForService(serviceId, "read");
    const missing  = missingScopes(granted, required);

    return {
      serviceId,
      requiredScopes: required,
      grantedScopes:  granted,
      allowed:        missing.length === 0,
      missing,
    };
  }

  /**
   * Throws a structured error if validation fails (convenience wrapper).
   */
  assertAllowed(userId: string, serviceId: GWSServiceId, requiredScopes?: string[]): void {
    const result = this.check(userId, serviceId, requiredScopes);
    if (!result.allowed) {
      throw Object.assign(
        new Error(`[PermissionValidator] Insufficient scopes for ${serviceId}: ${result.missing.join(", ")}`),
        { code: "INSUFFICIENT_SCOPES", missing: result.missing },
      );
    }
  }

  /**
   * Check multiple services at once.
   */
  checkMany(userId: string, serviceIds: GWSServiceId[]): GWSPermissionCheck[] {
    return serviceIds.map((s) => this.check(userId, s));
  }

  /**
   * Returns which services a user currently has access to.
   */
  accessibleServices(userId: string): GWSServiceId[] {
    const ALL: GWSServiceId[] = ["gmail","drive","calendar","contacts","docs","sheets","tasks","keep"];
    return ALL.filter((s) => this.check(userId, s).allowed);
  }
}

const _KEY = "__GWS_PERM_VAL__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new PermissionValidatorClass();
}
export const GoogleWorkspacePermissionValidator: PermissionValidatorClass = (
  globalThis as unknown as Record<string, PermissionValidatorClass>
)[_KEY];