/**
 * OAuthRuntime.ts — Sprint 6.4.0
 * Lifecycle manager for the Universal OAuth Platform.
 */

import type { OAuthProviderName } from "./OAuthTypes";
import { OAuthRegistry } from "./OAuthRegistry";
import { OAuthSessionManager } from "./OAuthSessionManager";
import { OAuthTokenManager } from "./OAuthTokenManager";
import { OAuthRefreshManager } from "./OAuthRefreshManager";
import { OAuthScopeManager } from "./OAuthScopeManager";
import { OAuthPermissionManager } from "./OAuthPermissionManager";
import { OAuthValidator } from "./OAuthValidator";
import { OAuthSecurity } from "./OAuthSecurity";
import { OAuthPersistence } from "./OAuthPersistence";
import { OAuthDiagnostics } from "./OAuthDiagnostics";
import { OAuthAudit } from "./OAuthAudit";
import { OAuthMetrics } from "./OAuthMetrics";
import { OAuthHealth } from "./OAuthHealth";

export type OAuthRuntimeState = "IDLE" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";

export interface OAuthRuntimeStatus {
  state:           OAuthRuntimeState;
  startedAt:       number | null;
  activeSessions:  number;
  registeredProviders: number;
  uptime:          number;
}

export class OAuthRuntime {
  readonly registry          = new OAuthRegistry();
  readonly sessionManager    = new OAuthSessionManager(this.registry);
  readonly tokenManager      = new OAuthTokenManager();
  readonly refreshManager    = new OAuthRefreshManager(this.registry, this.tokenManager);
  readonly scopeManager      = new OAuthScopeManager();
  readonly permissionManager = new OAuthPermissionManager();
  readonly validator         = new OAuthValidator(this.tokenManager);
  readonly security          = new OAuthSecurity();
  readonly persistence       = new OAuthPersistence(this.registry);
  readonly diagnostics       = new OAuthDiagnostics(this.registry, this.tokenManager);
  readonly audit             = new OAuthAudit();
  readonly metrics           = new OAuthMetrics();
  readonly health            = new OAuthHealth();

  private _state:     OAuthRuntimeState = "IDLE";
  private _startedAt: number | null = null;

  start(): void {
    if (this._state === "RUNNING") return;
    this._state = "STARTING";

    // Initialize health for all providers
    for (const p of this.registry.listProviders()) {
      this.health.mark(p.name, null, "DISCONNECTED", "Runtime starting");
    }

    // Attempt to restore sessions from persistence
    const restoreResult = this.persistence.restore();
    this.audit.record(
      "SESSION_RESTORED", "SYSTEM", null, [],
      restoreResult.restored > 0 ? "SUCCESS" : "INFO",
      0,
      `Restored ${restoreResult.restored}/${restoreResult.total} sessions on startup`,
    );

    this._state = "RUNNING";
    this._startedAt = Date.now();
  }

  stop(): void {
    if (this._state !== "RUNNING") return;
    this._state = "STOPPING";
    this.persistence.save();
    this._state = "STOPPED";
  }

  isRunning(): boolean { return this._state === "RUNNING"; }

  status(): OAuthRuntimeStatus {
    return {
      state: this._state,
      startedAt: this._startedAt,
      activeSessions: this.registry.activeSessions().length,
      registeredProviders: this.registry.providerCount(),
      uptime: this._startedAt ? Date.now() - this._startedAt : 0,
    };
  }
}