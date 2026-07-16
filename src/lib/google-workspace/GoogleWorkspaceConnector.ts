/**
 * GoogleWorkspaceConnector.ts — Engineering Sprint 7.0
 * Central orchestrator for the Google Workspace Connector Suite.
 *
 * Composes all GWS modules into a single execution surface.
 * Zero changes to Core: Runtime, Pipeline, GoalEngine, PlanningEngine,
 * ExecutionDispatcher, UniversalConnectorRouter, ConnectorRegistry.
 *
 * GmailConnector continues to work independently —
 * it can optionally delegate auth/token/error to this layer.
 */

import type { GWSServiceId, GWSCapabilityContext, GWSCapabilityResult } from "./GoogleWorkspaceTypes";
import { GoogleWorkspaceAuth }              from "./GoogleWorkspaceAuth";
import { GoogleWorkspaceTokenManager }      from "./GoogleWorkspaceTokenManager";
import { GoogleWorkspacePermissionValidator } from "./GoogleWorkspacePermissionValidator";
import { GoogleWorkspaceErrorHandler }      from "./GoogleWorkspaceErrorHandler";
import { GoogleWorkspaceRateLimiter }       from "./GoogleWorkspaceRateLimiter";
import { GoogleWorkspaceAuditLogger }       from "./GoogleWorkspaceAuditLogger";
import { GoogleWorkspaceCapabilityRegistry } from "./GoogleWorkspaceCapabilityRegistry";

let _reqSeq = 1;

class GoogleWorkspaceConnectorClass {
  readonly version = "1.0.0";
  readonly name    = "Google Workspace Connector Suite";

  // ── Capability execution ──────────────────────────────────────────────────

  async execute(
    capabilityId: string,
    userId: string,
    params: Record<string, unknown> = {},
  ): Promise<GWSCapabilityResult> {
    const requestId = `gws-${Date.now()}-${(_reqSeq++).toString().padStart(4, "0")}`;

    const capability = GoogleWorkspaceCapabilityRegistry.get(capabilityId);
    if (!capability) {
      return { success: false, data: null, error: `Unknown capability: ${capabilityId}`, durationMs: 0 };
    }

    const { serviceId } = capability;

    // 1. Permission check
    const perm = GoogleWorkspacePermissionValidator.check(userId, serviceId, capability.requiredScopes);
    if (!perm.allowed) {
      return {
        success:    false,
        data:       null,
        error:      `Insufficient scopes for ${serviceId}: ${perm.missing.join(", ")}`,
        durationMs: 0,
      };
    }

    // 2. Rate limit check
    const rate = GoogleWorkspaceRateLimiter.check(serviceId);
    if (!rate.allowed) {
      return {
        success:    false,
        data:       null,
        error:      `Rate limit reached for ${serviceId}. Retry in ${Math.ceil(rate.waitMs / 1000)}s`,
        durationMs: 0,
      };
    }

    // 3. Ensure valid token
    const token = await GoogleWorkspaceTokenManager.ensureValidToken(userId);
    if (!token) {
      return { success: false, data: null, error: "No valid token — user must re-authenticate", durationMs: 0 };
    }

    // 4. Execute with audit wrapping
    const start = Date.now();
    const result = await GoogleWorkspaceAuditLogger.wrap(
      serviceId,
      capabilityId,
      userId,
      requestId,
      () => capability.handler({ serviceId, token, params, userId, requestId } as GWSCapabilityContext),
    );

    // 5. Record quota consumption
    GoogleWorkspaceRateLimiter.consume(serviceId);

    return result;
  }

  // ── Service access query ──────────────────────────────────────────────────

  accessibleServices(userId: string): GWSServiceId[] {
    return GoogleWorkspacePermissionValidator.accessibleServices(userId);
  }

  isAuthenticated(userId: string): boolean {
    return GoogleWorkspaceAuth.isAuthenticated(userId);
  }

  // ── Observability ─────────────────────────────────────────────────────────

  health(): {
    authenticated: boolean;
    capabilityCount: number;
    auditStats: ReturnType<typeof GoogleWorkspaceAuditLogger.stats>;
    rateLimits: ReturnType<typeof GoogleWorkspaceRateLimiter.allStatus>;
    tokenCache: ReturnType<typeof GoogleWorkspaceTokenManager.cacheStats>;
  } {
    return {
      authenticated:   false, // runtime-user-dependent
      capabilityCount: GoogleWorkspaceCapabilityRegistry.size,
      auditStats:      GoogleWorkspaceAuditLogger.stats(),
      rateLimits:      GoogleWorkspaceRateLimiter.allStatus(),
      tokenCache:      GoogleWorkspaceTokenManager.cacheStats(),
    };
  }
}

const _KEY = "__GWS_CONNECTOR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GoogleWorkspaceConnectorClass();
}
export const GoogleWorkspaceConnector: GoogleWorkspaceConnectorClass = (
  globalThis as unknown as Record<string, GoogleWorkspaceConnectorClass>
)[_KEY];