/**
 * OAuthScopeManager.ts — Sprint 6.4.0
 * Manages scope registration, validation, and per-session grants.
 */

import type { OAuthScope, OAuthProviderName } from "./OAuthTypes";

let _seq = 0;
function makeId(): string { return `osc_${Date.now()}_${++_seq}`; }

// Built-in scope definitions
const BUILT_IN_SCOPES: OAuthScope[] = [
  // Google
  { id: "g_openid",    name: "openid",    description: "OpenID Connect identity",              required: true,  provider: "google" },
  { id: "g_email",     name: "email",     description: "Read email address",                   required: true,  provider: "google" },
  { id: "g_profile",   name: "profile",   description: "Read basic profile info",              required: false, provider: "google" },
  { id: "g_cal_rw",    name: "https://www.googleapis.com/auth/calendar",         description: "Full Calendar access",    required: false, provider: "google", service: "calendar" },
  { id: "g_cal_ro",    name: "https://www.googleapis.com/auth/calendar.readonly", description: "Read-only Calendar",    required: false, provider: "google", service: "calendar" },
  { id: "g_gmail_ro",  name: "https://www.googleapis.com/auth/gmail.readonly",   description: "Read Gmail",             required: false, provider: "google", service: "gmail" },
  { id: "g_gmail_snd", name: "https://www.googleapis.com/auth/gmail.send",       description: "Send Gmail",             required: false, provider: "google", service: "gmail" },
  { id: "g_drive_rw",  name: "https://www.googleapis.com/auth/drive",            description: "Full Drive access",      required: false, provider: "google", service: "drive" },
  { id: "g_drive_ro",  name: "https://www.googleapis.com/auth/drive.readonly",   description: "Read-only Drive",        required: false, provider: "google", service: "drive" },
  { id: "g_tasks",     name: "https://www.googleapis.com/auth/tasks",            description: "Full Tasks access",      required: false, provider: "google", service: "tasks" },
  // Microsoft
  { id: "ms_openid",   name: "openid",    description: "OpenID Connect",                       required: true,  provider: "microsoft" },
  { id: "ms_email",    name: "email",     description: "Read email",                            required: true,  provider: "microsoft" },
  { id: "ms_offline",  name: "offline_access", description: "Refresh token access",            required: false, provider: "microsoft" },
  { id: "ms_calendar", name: "https://graph.microsoft.com/Calendars.ReadWrite", description: "Calendar read/write", required: false, provider: "microsoft", service: "calendar" },
  { id: "ms_mail",     name: "https://graph.microsoft.com/Mail.ReadWrite",      description: "Mail read/write",     required: false, provider: "microsoft", service: "mail" },
  // Slack
  { id: "sl_ch_read",  name: "channels:read",  description: "Read Slack channels",             required: false, provider: "slack" },
  { id: "sl_ch_write", name: "channels:write", description: "Write to Slack channels",         required: false, provider: "slack" },
  { id: "sl_chat",     name: "chat:write",     description: "Send Slack messages",             required: false, provider: "slack" },
  // GitHub
  { id: "gh_repo",     name: "repo",           description: "Full repository access",          required: false, provider: "github" },
  { id: "gh_user",     name: "read:user",      description: "Read user profile",               required: false, provider: "github" },
  { id: "gh_email",    name: "user:email",     description: "Read user email",                 required: false, provider: "github" },
];

export class OAuthScopeManager {
  private _scopes: Map<string, OAuthScope> = new Map();
  private _sessionGrants: Map<string, Set<string>> = new Map(); // sessionId → scope names

  constructor() {
    for (const s of BUILT_IN_SCOPES) {
      this._scopes.set(s.id, s);
    }
  }

  register(scope: Omit<OAuthScope, "id">): OAuthScope {
    const id = makeId();
    const s: OAuthScope = { ...scope, id };
    this._scopes.set(id, s);
    return s;
  }

  getScopesByProvider(provider: OAuthProviderName): OAuthScope[] {
    return [...this._scopes.values()].filter(s => s.provider === provider);
  }

  getScopesByService(provider: OAuthProviderName, service: string): OAuthScope[] {
    return [...this._scopes.values()].filter(s => s.provider === provider && s.service === service);
  }

  grantScopes(sessionId: string, scopeNames: string[]): void {
    const existing = this._sessionGrants.get(sessionId) ?? new Set();
    for (const s of scopeNames) existing.add(s);
    this._sessionGrants.set(sessionId, existing);
  }

  getGrantedScopes(sessionId: string): string[] {
    return [...(this._sessionGrants.get(sessionId) ?? [])];
  }

  hasScope(sessionId: string, scopeName: string): boolean {
    return this._sessionGrants.get(sessionId)?.has(scopeName) ?? false;
  }

  validateRequired(sessionId: string, required: string[]): { valid: boolean; missing: string[] } {
    const granted = this._sessionGrants.get(sessionId) ?? new Set();
    const missing = required.filter(r => !granted.has(r));
    return { valid: missing.length === 0, missing };
  }

  revokeScopes(sessionId: string): void {
    this._sessionGrants.delete(sessionId);
  }

  allScopes(): OAuthScope[] { return [...this._scopes.values()]; }
  scopeCount(): number { return this._scopes.size; }
}