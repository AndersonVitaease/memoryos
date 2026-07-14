/**
 * SessionSerializer.ts — Sprint 6.3.4
 * Serializes and deserializes session state to/from localStorage.
 *
 * SECURITY RULES — NEVER serialize:
 *   - Access tokens
 *   - Refresh tokens
 *   - Client secrets
 *   - Passwords
 *   - OAuth credentials
 *   - Any secret value
 *
 * ONLY serialize: status, capabilities, health, metadata, timestamps.
 */

import type { ConnectorSessionRecord, SerializedSession } from "./RuntimePersistenceTypes";

const STORAGE_KEY = "memoryos_runtime_sessions_v1";
const SCHEMA_VERSION = 1;

// Fields that are FORBIDDEN from being serialized (security guard)
const FORBIDDEN_FIELDS = [
  "token", "accessToken", "access_token",
  "refreshToken", "refresh_token",
  "clientSecret", "client_secret",
  "password", "secret",
  "credential", "credentials",
  "authToken", "auth_token",
  "apiKey", "api_key",
];

function sanitize(record: ConnectorSessionRecord): ConnectorSessionRecord {
  const safe = { ...record };
  // Sanitize metadata keys
  const safeMeta: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(safe.metadata ?? {})) {
    if (!FORBIDDEN_FIELDS.some(f => k.toLowerCase().includes(f.toLowerCase()))) {
      safeMeta[k] = v;
    }
  }
  safe.metadata = safeMeta;
  return safe;
}

export class SessionSerializer {
  serialize(sessions: ConnectorSessionRecord[]): void {
    try {
      const payload: SerializedSession = {
        version:  SCHEMA_VERSION,
        sessions: sessions.map(sanitize),
        savedAt:  Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage unavailable — silent
    }
  }

  deserialize(): SerializedSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SerializedSession;
      if (parsed.version !== SCHEMA_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* silent */ }
  }

  ageMs(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Infinity;
      const parsed = JSON.parse(raw) as SerializedSession;
      return Date.now() - (parsed.savedAt ?? 0);
    } catch {
      return Infinity;
    }
  }
}