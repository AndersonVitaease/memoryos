/**
 * GoogleScopeMapper.ts — Sprint 6.4.1
 * Maps Google scopes to services. Identity scopes only in this sprint.
 * Extended scopes added per connector sprint (6.4.2+).
 */

export type GoogleService = "identity" | "calendar" | "gmail" | "drive" | "tasks";

const SCOPE_MAP: Record<GoogleService, string[]> = {
  identity: ["openid", "email", "profile"],
  calendar: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.readonly",
  ],
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  drive: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
  tasks: [
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/tasks.readonly",
  ],
};

export class GoogleScopeMapper {
  /**
   * Get scopes for a specific service.
   * Sprint 6.4.1 only exposes identity scopes.
   */
  getScopesForService(service: GoogleService): string[] {
    return SCOPE_MAP[service] ?? [];
  }

  /**
   * Get all identity scopes (Sprint 6.4.1).
   */
  getIdentityScopes(): string[] {
    return [...SCOPE_MAP.identity];
  }

  /**
   * Determine which services are covered by granted scopes.
   */
  getCoveredServices(grantedScopes: string[]): GoogleService[] {
    const granted = new Set(grantedScopes);
    return (Object.entries(SCOPE_MAP) as [GoogleService, string[]][])
      .filter(([, scopes]) => scopes.some(s => granted.has(s)))
      .map(([service]) => service);
  }

  /**
   * Validate that all required scopes for a service are present.
   */
  validateService(service: GoogleService, grantedScopes: string[]): {
    valid: boolean;
    missing: string[];
    granted: string[];
  } {
    const required = SCOPE_MAP[service] ?? [];
    const grantedSet = new Set(grantedScopes);
    const missing = required.filter(s => !grantedSet.has(s));
    const granted = required.filter(s => grantedSet.has(s));
    return { valid: missing.length === 0, missing, granted };
  }

  allScopes(): string[] {
    return [...new Set(Object.values(SCOPE_MAP).flat())];
  }

  serviceList(): GoogleService[] {
    return Object.keys(SCOPE_MAP) as GoogleService[];
  }
}