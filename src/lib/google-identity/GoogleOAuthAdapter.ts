/**
 * GoogleOAuthAdapter.ts — Sprint 6.4.1
 * Main adapter bridging Google Identity with the Universal OAuth Platform.
 * All OAuth flows MUST go through this adapter.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import { GoogleIdentityProvider } from "./GoogleIdentityProvider";
import { GoogleAuthorizationFlow } from "./GoogleAuthorizationFlow";
import { GoogleTokenExchange } from "./GoogleTokenExchange";
import { GoogleUserInfoService } from "./GoogleUserInfo";
import { GoogleSessionValidator } from "./GoogleSessionValidator";
import { GoogleRefreshHandler } from "./GoogleRefreshHandler";
import { GoogleScopeMapper } from "./GoogleScopeMapper";
import { GoogleDiagnostics } from "./GoogleDiagnostics";
import { GoogleAudit } from "./GoogleAudit";
import { GoogleMetrics } from "./GoogleMetrics";
import { GoogleHealth } from "./GoogleHealth";
import type { GoogleAuthSession, GoogleUserInfo, GoogleAuthState } from "./GoogleIdentityTypes";

let _sessionSeq = 0;
function makeSessionId(): string { return `gip_${Date.now()}_${++_sessionSeq}`; }

export interface LoginResult {
  success:   boolean;
  session:   GoogleAuthSession | null;
  userInfo:  GoogleUserInfo | null;
  authUrl:   string | null;
  error?:    string;
}

export interface AdapterStatus {
  initialized:      boolean;
  activeSession:    GoogleAuthSession | null;
  providerReady:    boolean;
  healthState:      string;
}

export class GoogleOAuthAdapter {
  private readonly _provider    = new GoogleIdentityProvider();
  private readonly _authFlow    = new GoogleAuthorizationFlow();
  private readonly _tokenExch   = new GoogleTokenExchange();
  private readonly _userInfo    = new GoogleUserInfoService();
  private readonly _validator   = new GoogleSessionValidator();
  private readonly _refresher   = new GoogleRefreshHandler();
  private readonly _scopeMapper = new GoogleScopeMapper();
  private readonly _diagnostics = new GoogleDiagnostics();
  readonly audit   = new GoogleAudit();
  readonly metrics = new GoogleMetrics();
  readonly health  = new GoogleHealth();

  private _sessions: Map<string, GoogleAuthSession> = new Map();
  private _initialized = false;

  initialize(): void {
    if (this._initialized) return;
    this._provider.register();
    this.health.update("DEGRADED", "Initialized — no active session");
    this._initialized = true;
    this.audit.record("HEALTH_CHECK", null, [], "INFO", 0, "Google Identity Provider initialized");
  }

  /**
   * Step 1: Build authorization URL and return it for redirect.
   * Returns the URL — caller performs the redirect.
   */
  buildLoginUrl(
    clientId: string,
    redirectUri: string,
    scopes = this._scopeMapper.getIdentityScopes(),
  ): { url: string; sessionId: string; state: string } {
    this.initialize();
    const { request, url } = this._authFlow.buildRequest(clientId, redirectUri, scopes);
    const sessionId = makeSessionId();

    // Store pending session
    const pendingSession: GoogleAuthSession = {
      id:              sessionId,
      state:           "AUTHORIZING",
      userInfo:        null,
      grantedScopes:   scopes,
      expiresAt:       null,
      createdAt:       Date.now(),
      lastRefreshedAt: null,
      lastValidatedAt: Date.now(),
      refreshAvailable: true,
      health:          "UNKNOWN",
      accessTokenRef:  null,
      refreshTokenRef: null,
    };
    this._sessions.set(sessionId, pendingSession);

    // Store PKCE verifier temporarily
    sessionStorage.setItem(`gip_verifier_${sessionId}`, request.codeVerifier);
    sessionStorage.setItem(`gip_state_${sessionId}`, request.state);

    this.audit.record("LOGIN_INITIATED", sessionId, scopes, "INFO", 0, `Authorization flow started for ${scopes.join(",")} scopes`);
    return { url, sessionId, state: request.state };
  }

  /**
   * Step 2: Handle OAuth callback — exchange code for tokens.
   */
  async handleCallback(
    sessionId: string,
    code: string,
    state: string,
    clientId: string,
    redirectUri: string,
  ): Promise<LoginResult> {
    const t0 = Date.now();
    const session = this._sessions.get(sessionId);
    if (!session) {
      return { success: false, session: null, userInfo: null, authUrl: null, error: "Session not found" };
    }

    // Validate state
    const expectedState = sessionStorage.getItem(`gip_state_${sessionId}`);
    if (!this._authFlow.validateState(expectedState ?? "", state)) {
      this.audit.record("LOGIN_FAILED", sessionId, [], "FAIL", Date.now() - t0, "State validation failed");
      return { success: false, session: null, userInfo: null, authUrl: null, error: "State mismatch — possible CSRF" };
    }

    const codeVerifier = sessionStorage.getItem(`gip_verifier_${sessionId}`) ?? "";
    this._updateSession(sessionId, "EXCHANGING");

    // Exchange code for tokens
    const { success, tokenResponse, error } = await this._tokenExch.exchange(
      sessionId, code, codeVerifier, clientId, redirectUri
    );
    if (!success || !tokenResponse) {
      this._updateSession(sessionId, "ERROR");
      this.audit.record("LOGIN_FAILED", sessionId, [], "FAIL", Date.now() - t0, error ?? "Token exchange failed");
      this.metrics.recordLogin(Date.now() - t0, false);
      return { success: false, session: null, userInfo: null, authUrl: null, error };
    }

    // Fetch user info
    this._updateSession(sessionId, "FETCHING_USER");
    const userInfo = await this._userInfo.fetch(sessionId);

    // Finalize session
    const expiresAt = tokenResponse.issuedAt + tokenResponse.expiresIn * 1000;
    const finalSession = this._finalizeSession(sessionId, userInfo, tokenResponse.scope.split(" "), expiresAt, tokenResponse.hasRefreshToken);

    // Register in UOP
    UOP.registry.createSession("google", sessionId, finalSession.grantedScopes, ["openid", "email"], expiresAt, { gip: true });
    UOP.health.mark("google", sessionId, "CONNECTED", "Google login successful");

    this.health.update("HEALTHY", `Active session: ${userInfo?.email ?? "unknown"}`, sessionId);
    this.audit.record("LOGIN_COMPLETED", sessionId, finalSession.grantedScopes, "SUCCESS", Date.now() - t0, `Login successful — ${userInfo?.email ?? "unknown"}`);
    this.metrics.recordLogin(Date.now() - t0, true);

    // Cleanup PKCE
    sessionStorage.removeItem(`gip_verifier_${sessionId}`);
    sessionStorage.removeItem(`gip_state_${sessionId}`);

    return { success: true, session: finalSession, userInfo, authUrl: null };
  }

  /**
   * Simulate a successful login (for demo/testing without real OAuth).
   */
  async simulateLogin(scopes = this._scopeMapper.getIdentityScopes()): Promise<LoginResult> {
    const t0 = Date.now();
    this.initialize();

    const sessionId = makeSessionId();
    const expiresAt = Date.now() + 3600_000;

    // Store tokens in UOP
    UOP.tokenManager.store(sessionId, "google", "access", `ya29.demo_${sessionId.slice(-8)}`, expiresAt, scopes);
    UOP.tokenManager.store(sessionId, "google", "refresh", `1//demo_refresh_${sessionId.slice(-8)}`, null, scopes);

    // Fetch user info
    const userInfo = await this._userInfo.fetch(sessionId);

    const session: GoogleAuthSession = {
      id:              sessionId,
      state:           "ACTIVE",
      userInfo,
      grantedScopes:   scopes,
      expiresAt,
      createdAt:       Date.now(),
      lastRefreshedAt: null,
      lastValidatedAt: Date.now(),
      refreshAvailable: true,
      health:          "HEALTHY",
      accessTokenRef:  UOP.tokenManager.getRecord(sessionId, "access")?.maskedRef ?? null,
      refreshTokenRef: UOP.tokenManager.getRecord(sessionId, "refresh")?.maskedRef ?? null,
    };
    this._sessions.set(sessionId, session);

    // Register in UOP
    UOP.registry.createSession("google", sessionId, scopes, ["openid", "email"], expiresAt, { gip: true, simulated: true });
    UOP.health.mark("google", sessionId, "CONNECTED", "Simulated login");

    this.health.update("HEALTHY", `Active: ${userInfo?.email ?? "demo"}`, sessionId);
    this.audit.record("LOGIN_COMPLETED", sessionId, scopes, "SUCCESS", Date.now() - t0, `Simulated login — ${userInfo?.email}`);
    this.metrics.recordLogin(Date.now() - t0, true);

    return { success: true, session, userInfo, authUrl: null };
  }

  /**
   * Refresh the active session's token.
   */
  async refresh(sessionId: string): Promise<boolean> {
    const t0 = Date.now();
    const session = this._sessions.get(sessionId);
    if (!session) return false;

    this._updateSession(sessionId, "REFRESHING");
    const result = await this._refresher.refresh(session);

    if (result.success) {
      const updated = { ...session, state: "ACTIVE" as GoogleAuthState, lastRefreshedAt: Date.now(), expiresAt: result.newExpiresAt ?? session.expiresAt, health: "HEALTHY" as const };
      this._sessions.set(sessionId, updated);
      this.audit.record("TOKEN_REFRESHED", sessionId, session.grantedScopes, "SUCCESS", result.durationMs, "Token refreshed successfully");
      this.metrics.recordRefresh(result.durationMs, true);
      return true;
    } else {
      const updated = { ...session, state: "EXPIRED" as GoogleAuthState, health: "EXPIRED" as const };
      this._sessions.set(sessionId, updated);
      this.audit.record("TOKEN_REFRESH_FAILED", sessionId, [], "FAIL", result.durationMs, result.error ?? result.result);
      this.metrics.recordRefresh(result.durationMs, false);
      return false;
    }
  }

  /**
   * Logout and revoke session.
   */
  async logout(sessionId: string): Promise<void> {
    const t0 = Date.now();
    await this._tokenExch.revoke(sessionId);
    this._userInfo.clear(sessionId);
    this._sessions.delete(sessionId);
    UOP.registry.revokeSession(sessionId);
    this.health.update("DISCONNECTED", "Logged out");
    this.audit.record("LOGOUT", sessionId, [], "SUCCESS", Date.now() - t0, "Session revoked and cleaned up");
  }

  /**
   * Restore sessions from persistence.
   */
  restore(): { restored: number; skipped: number } {
    const result = UOP.persistence.restore();
    let restored = 0;
    for (const s of UOP.registry.activeSessions().filter(s => s.provider === "google")) {
      // Reconstruct GIP session from UOP session
      const gipSession: GoogleAuthSession = {
        id:              s.id,
        state:           "ACTIVE",
        userInfo:        null, // UserInfo re-fetched on demand
        grantedScopes:   s.grantedScopes,
        expiresAt:       s.expiresAt,
        createdAt:       s.createdAt,
        lastRefreshedAt: s.lastRefreshedAt,
        lastValidatedAt: Date.now(),
        refreshAvailable: true,
        health:          "HEALTHY",
        accessTokenRef:  null,
        refreshTokenRef: null,
      };
      this._sessions.set(s.id, gipSession);
      restored++;
    }
    if (restored > 0) {
      this.health.update("HEALTHY", `${restored} session(s) restored`);
      this.audit.record("SESSION_RESTORED", null, [], "SUCCESS", 0, `${restored} session(s) restored from persistence`);
      this.metrics.recordRestore();
    }
    return { restored, skipped: result.skipped };
  }

  /**
   * Run diagnostics on the active session.
   */
  diagnose(sessionId?: string): ReturnType<GoogleDiagnostics["run"]> {
    const session = sessionId
      ? this._sessions.get(sessionId) ?? null
      : this.getActiveSession();
    const result = this._diagnostics.run(session);
    this.audit.record("DIAGNOSTIC_RUN", session?.id ?? null, [], "INFO", result.durationMs, `Diagnostics: ${result.overall}`);
    return result;
  }

  validate(sessionId: string): ReturnType<GoogleSessionValidator["validate"]> {
    const session = this._sessions.get(sessionId);
    if (!session) return { valid: false, sessionActive: false, tokenValid: false, scopesGranted: [], timeRemainingMs: null, refreshAvailable: false, issues: ["Session not found"] };
    const result = this._validator.validate(session);
    this.audit.record("SESSION_VALIDATED", sessionId, session.grantedScopes, result.valid ? "SUCCESS" : "FAIL", 0, result.issues.join("; ") || "Valid");
    return result;
  }

  getActiveSession(): GoogleAuthSession | null {
    return [...this._sessions.values()].find(s => s.state === "ACTIVE") ?? null;
  }

  getAllSessions(): GoogleAuthSession[] {
    return [...this._sessions.values()];
  }

  getSession(id: string): GoogleAuthSession | null {
    return this._sessions.get(id) ?? null;
  }

  status(): AdapterStatus {
    return {
      initialized:   this._initialized,
      activeSession: this.getActiveSession(),
      providerReady: this._provider.isRegistered(),
      healthState:   this.health.state(),
    };
  }

  private _updateSession(id: string, state: GoogleAuthState): void {
    const s = this._sessions.get(id);
    if (s) this._sessions.set(id, { ...s, state });
  }

  private _finalizeSession(
    id: string,
    userInfo: GoogleUserInfo | null,
    scopes: string[],
    expiresAt: number,
    hasRefresh: boolean,
  ): GoogleAuthSession {
    const session: GoogleAuthSession = {
      id,
      state:           "ACTIVE",
      userInfo,
      grantedScopes:   scopes,
      expiresAt,
      createdAt:       this._sessions.get(id)?.createdAt ?? Date.now(),
      lastRefreshedAt: null,
      lastValidatedAt: Date.now(),
      refreshAvailable: hasRefresh,
      health:          "HEALTHY",
      accessTokenRef:  UOP.tokenManager.getRecord(id, "access")?.maskedRef ?? null,
      refreshTokenRef: UOP.tokenManager.getRecord(id, "refresh")?.maskedRef ?? null,
    };
    this._sessions.set(id, session);
    return session;
  }
}