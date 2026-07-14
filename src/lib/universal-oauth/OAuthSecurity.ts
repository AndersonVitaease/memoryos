/**
 * OAuthSecurity.ts — Sprint 6.4.0
 * Security enforcement: token masking, log sanitization, credential policies.
 */

const FORBIDDEN_FIELDS = [
  "accessToken", "refreshToken", "clientSecret", "authorizationCode",
  "password", "apiKey", "secret", "bearer", "token", "code",
  "client_secret", "access_token", "refresh_token", "id_token",
];

const MASK = "[REDACTED]";

export class OAuthSecurity {
  /**
   * Sanitize any object before logging/auditing.
   * Recursively removes all credential fields.
   */
  sanitize<T extends Record<string, unknown>>(obj: T): T {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (FORBIDDEN_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        result[key] = MASK;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  /**
   * Mask a raw token string for display.
   */
  maskToken(raw: string): string {
    if (!raw || raw.length < 8) return MASK;
    return raw.slice(0, 4) + "****" + raw.slice(-4);
  }

  /**
   * Validate that a string does NOT contain forbidden credential patterns.
   * Used to ensure logs/audit entries are clean.
   */
  assertClean(data: string): { clean: boolean; violations: string[] } {
    const violations: string[] = [];
    const lower = data.toLowerCase();

    // Heuristic: detect bearer tokens (long alphanumeric strings 40+ chars)
    const bearerPattern = /[A-Za-z0-9_\-]{40,}/g;
    const matches = data.match(bearerPattern);
    if (matches && matches.length > 0) {
      violations.push(`Potential token detected in log output (length ${matches[0].length})`);
    }

    for (const field of FORBIDDEN_FIELDS) {
      if (lower.includes(`"${field.toLowerCase()}"`) || lower.includes(`${field.toLowerCase()}=`)) {
        violations.push(`Forbidden field pattern found: ${field}`);
      }
    }

    return { clean: violations.length === 0, violations };
  }

  /**
   * Generate a PKCE code verifier (for future use in OAuth flows).
   */
  generateCodeVerifier(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let result = "";
    for (let i = 0; i < 128; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Generate a random state parameter for CSRF protection.
   */
  generateState(): string {
    return `state_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  forbiddenFields(): string[] { return [...FORBIDDEN_FIELDS]; }
}