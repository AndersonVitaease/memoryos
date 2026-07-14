/**
 * OAuthScopeRegistry.ts — Sprint 6.4.1A
 * Central registry of all OAuth scopes across all providers.
 * Single source of truth for scope requirements per sprint/service.
 */

export interface ScopeDefinition {
  provider:    string;
  scope:       string;
  service:     string; // "identity", "calendar", "gmail", etc.
  description: string;
  required:    boolean;
  sprint:      string; // when it was added
}

const SCOPE_REGISTRY: ScopeDefinition[] = [
  // ── Google ──────────────────────────────────────────────────────────────────
  { provider: "google", scope: "openid",    service: "identity", description: "OpenID Connect identity token", required: true,  sprint: "6.4.1" },
  { provider: "google", scope: "email",     service: "identity", description: "User email address",            required: true,  sprint: "6.4.1" },
  { provider: "google", scope: "profile",   service: "identity", description: "User profile (name, avatar)",   required: true,  sprint: "6.4.1" },
  { provider: "google", scope: "https://www.googleapis.com/auth/calendar",          service: "calendar", description: "Full Google Calendar access",    required: false, sprint: "6.4.2" },
  { provider: "google", scope: "https://www.googleapis.com/auth/calendar.readonly", service: "calendar", description: "Read-only Calendar access",      required: false, sprint: "6.4.2" },
  { provider: "google", scope: "https://www.googleapis.com/auth/gmail.readonly",    service: "gmail",    description: "Read-only Gmail access",         required: false, sprint: "6.4.3" },
  { provider: "google", scope: "https://www.googleapis.com/auth/gmail.send",        service: "gmail",    description: "Send Gmail messages",            required: false, sprint: "6.4.3" },
  { provider: "google", scope: "https://www.googleapis.com/auth/drive",             service: "drive",    description: "Full Google Drive access",       required: false, sprint: "6.4.4" },
  { provider: "google", scope: "https://www.googleapis.com/auth/drive.readonly",    service: "drive",    description: "Read-only Google Drive access",  required: false, sprint: "6.4.4" },
  { provider: "google", scope: "https://www.googleapis.com/auth/tasks",             service: "tasks",    description: "Full Google Tasks access",       required: false, sprint: "6.4.5" },
  { provider: "google", scope: "https://www.googleapis.com/auth/tasks.readonly",    service: "tasks",    description: "Read-only Google Tasks access",  required: false, sprint: "6.4.5" },

  // ── Microsoft ───────────────────────────────────────────────────────────────
  { provider: "microsoft", scope: "openid",         service: "identity", description: "OpenID Connect",              required: true,  sprint: "future" },
  { provider: "microsoft", scope: "email",          service: "identity", description: "Email address",               required: true,  sprint: "future" },
  { provider: "microsoft", scope: "profile",        service: "identity", description: "User profile",                required: true,  sprint: "future" },
  { provider: "microsoft", scope: "Calendars.Read", service: "calendar", description: "Read Outlook calendars",      required: false, sprint: "future" },

  // ── Slack ────────────────────────────────────────────────────────────────────
  { provider: "slack", scope: "channels:read",   service: "workspace", description: "Read channel list",            required: false, sprint: "future" },
  { provider: "slack", scope: "chat:write",      service: "workspace", description: "Send messages",               required: false, sprint: "future" },
  { provider: "slack", scope: "users:read",      service: "identity",  description: "Read user profiles",          required: false, sprint: "future" },

  // ── GitHub ───────────────────────────────────────────────────────────────────
  { provider: "github", scope: "repo",          service: "code",      description: "Full repository access",       required: false, sprint: "future" },
  { provider: "github", scope: "read:user",     service: "identity",  description: "Read user profile",           required: false, sprint: "future" },
  { provider: "github", scope: "user:email",    service: "identity",  description: "Read user email",             required: false, sprint: "future" },
];

export class OAuthScopeRegistry {
  all(): ScopeDefinition[] { return [...SCOPE_REGISTRY]; }

  forProvider(provider: string): ScopeDefinition[] {
    return SCOPE_REGISTRY.filter(s => s.provider === provider);
  }

  requiredForProvider(provider: string): ScopeDefinition[] {
    return SCOPE_REGISTRY.filter(s => s.provider === provider && s.required);
  }

  forService(provider: string, service: string): ScopeDefinition[] {
    return SCOPE_REGISTRY.filter(s => s.provider === provider && s.service === service);
  }

  forSprint(sprint: string): ScopeDefinition[] {
    return SCOPE_REGISTRY.filter(s => s.sprint === sprint);
  }

  getScopeNames(provider: string): string[] {
    return this.forProvider(provider).map(s => s.scope);
  }

  getRequiredScopeNames(provider: string): string[] {
    return this.requiredForProvider(provider).map(s => s.scope);
  }

  validateGranted(provider: string, grantedScopes: string[]): {
    valid: boolean; missing: string[]; extra: string[];
  } {
    const required = new Set(this.getRequiredScopeNames(provider));
    const granted  = new Set(grantedScopes);
    const missing  = [...required].filter(s => !granted.has(s));
    const extra    = grantedScopes.filter(s => !required.has(s));
    return { valid: missing.length === 0, missing, extra };
  }
}