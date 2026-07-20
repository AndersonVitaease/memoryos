/**
 * CapabilityResolutionEngine.ts — BUGFIX-SPRINT-002.4
 *
 * Transforms { goal, metadata, context } into a domain-specific capability
 * without any fallback to a default connector.
 *
 * Architecture rules:
 *   - Never chooses a connector by history or default
 *   - Returns "ambiguous_capability_resolution" when context is insufficient
 *   - NLP/intent layer feeds metadata; this engine consumes it
 *   - ConnectorResolver receives the already-resolved capability — never decides domain here
 */

export type ResolutionSource = "github" | "google-drive" | "google-calendar" | "gmail" | "base44";
export type ResolutionDomain = "repository" | "document" | "calendar" | "email" | "application" | "ambiguous";

export interface ResolutionInput {
  /** High-level goal string, e.g. "FETCH_SOURCE_CODE", "READ_DOCUMENT", "READ_FILE" */
  goal: string;
  metadata?: {
    source?: string;     // explicit source: "github", "google-drive", etc.
    type?:   string;     // "code", "document", "spreadsheet", etc.
    domain?: string;     // "repository", "drive", etc.
    origin?: string;     // raw user phrase for additional hinting
  };
  context?: {
    workspaceId?: string;
    userId?:      string;
    repository?:  string;
  };
}

export interface ResolutionResult {
  capability:  string;          // e.g. "source.code.read", "document.read", "ambiguous_capability_resolution"
  connector:   string | null;   // e.g. "github", "google-drive", null when ambiguous
  domain:      ResolutionDomain;
  confidence:  number;          // 0–1
  reasoning:   string;
  ambiguous:   boolean;
}

// ── Resolution rules ──────────────────────────────────────────────────────────
// Each rule maps (goal pattern) + (source/type hints) → (capability, connector, domain).
// Rules are evaluated in order; first match wins.

interface Rule {
  goalPatterns:   string[];                  // substrings matched against goal.toUpperCase()
  sourceHints?:   string[];                  // matched against metadata.source
  typeHints?:     string[];                  // matched against metadata.type
  domainHints?:   string[];                  // matched against metadata.domain or origin
  capability:     string;
  connector:      string;
  domain:         ResolutionDomain;
}

const RULES: Rule[] = [
  // ── GitHub / Repository ────────────────────────────────────────────────────
  {
    goalPatterns: ["FETCH_SOURCE_CODE", "READ_SOURCE", "GET_SOURCE", "SOURCE_CODE"],
    sourceHints:  ["github"],
    typeHints:    ["code", "source"],
    capability:   "source.code.read",
    connector:    "github",
    domain:       "repository",
  },
  {
    goalPatterns: ["FETCH_SOURCE_CODE", "READ_SOURCE", "GET_SOURCE"],
    // no explicit source, but type=code → still github
    typeHints:    ["code", "source"],
    capability:   "source.code.read",
    connector:    "github",
    domain:       "repository",
  },
  {
    goalPatterns: ["LIST_REPOS", "LIST_REPOSITORIES", "FETCH_REPOS"],
    sourceHints:  ["github"],
    capability:   "repository.list",
    connector:    "github",
    domain:       "repository",
  },
  {
    goalPatterns: ["LIST_BRANCHES", "FETCH_BRANCHES"],
    sourceHints:  ["github"],
    capability:   "repository.branches",
    connector:    "github",
    domain:       "repository",
  },
  {
    goalPatterns: ["LIST_COMMITS", "FETCH_COMMITS", "COMMIT_HISTORY"],
    sourceHints:  ["github"],
    capability:   "repository.commits",
    connector:    "github",
    domain:       "repository",
  },
  {
    goalPatterns: ["READ_FILE", "FETCH_FILE", "GET_FILE", "OPEN_FILE"],
    sourceHints:  ["github"],
    capability:   "source.code.read",
    connector:    "github",
    domain:       "repository",
  },
  {
    goalPatterns: ["READ_FILE", "FETCH_FILE", "GET_FILE"],
    domainHints:  ["repository", "github", "repo"],
    capability:   "source.code.read",
    connector:    "github",
    domain:       "repository",
  },

  // ── Google Drive / Document ────────────────────────────────────────────────
  {
    goalPatterns: ["READ_DOCUMENT", "FETCH_DOCUMENT", "GET_DOCUMENT", "OPEN_DOCUMENT"],
    sourceHints:  ["google-drive", "drive"],
    capability:   "document.read",
    connector:    "google-drive",
    domain:       "document",
  },
  {
    goalPatterns: ["READ_DOCUMENT", "FETCH_DOCUMENT"],
    typeHints:    ["document", "pdf", "spreadsheet", "presentation", "doc", "sheet"],
    capability:   "document.read",
    connector:    "google-drive",
    domain:       "document",
  },
  {
    goalPatterns: ["DOWNLOAD_ASSET", "DOWNLOAD_FILE", "DOWNLOAD_DOCUMENT"],
    sourceHints:  ["google-drive", "drive"],
    capability:   "document.download",
    connector:    "google-drive",
    domain:       "document",
  },
  {
    goalPatterns: ["LIST_FILES", "LIST_DOCUMENTS"],
    sourceHints:  ["google-drive", "drive"],
    capability:   "document.list",
    connector:    "google-drive",
    domain:       "document",
  },
  {
    goalPatterns: ["READ_FILE", "FETCH_FILE", "GET_FILE"],
    sourceHints:  ["google-drive", "drive"],
    capability:   "document.read",
    connector:    "google-drive",
    domain:       "document",
  },

  // ── Gmail / Email ──────────────────────────────────────────────────────────
  {
    goalPatterns: ["READ_EMAIL", "FETCH_EMAIL", "LIST_EMAILS", "READ_INBOX"],
    sourceHints:  ["gmail", "google-mail"],
    capability:   "email.read",
    connector:    "gmail",
    domain:       "email",
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    goalPatterns: ["LIST_EVENTS", "FETCH_EVENTS", "READ_CALENDAR"],
    sourceHints:  ["google-calendar", "calendar"],
    capability:   "calendar.events.list",
    connector:    "google-calendar",
    domain:       "calendar",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesAny(value: string | undefined, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true; // no constraint = matches all
  if (!value) return false;
  const lower = value.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

// ── CapabilityResolutionEngine ────────────────────────────────────────────────

export class CapabilityResolutionEngine {

  resolve(input: ResolutionInput): ResolutionResult {
    const goalUpper  = input.goal.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const source     = input.metadata?.source   ?? "";
    const type       = input.metadata?.type     ?? "";
    const domain     = input.metadata?.domain   ?? "";
    const origin     = input.metadata?.origin   ?? "";
    const domainHint = `${domain} ${origin}`.trim();

    for (const rule of RULES) {
      // 1. Goal must match at least one pattern
      const goalMatches = rule.goalPatterns.some(p => goalUpper.includes(p));
      if (!goalMatches) continue;

      // 2. Source / type / domain hints (if defined on rule, must match)
      const srcOk    = !rule.sourceHints  || matchesAny(source,     rule.sourceHints);
      const typeOk   = !rule.typeHints    || matchesAny(type,       rule.typeHints);
      const domainOk = !rule.domainHints  || matchesAny(domainHint, rule.domainHints);

      if (srcOk && typeOk && domainOk) {
        const hasExplicit = !!(source || type || domain || origin);
        return {
          capability: rule.capability,
          connector:  rule.connector,
          domain:     rule.domain,
          confidence: hasExplicit ? 0.95 : 0.75,
          reasoning:  `Rule match: goal="${input.goal}" source="${source}" type="${type}" → ${rule.capability} via ${rule.connector}`,
          ambiguous:  false,
        };
      }
    }

    // No rule matched with sufficient context → ambiguous
    return {
      capability: "ambiguous_capability_resolution",
      connector:  null,
      domain:     "ambiguous",
      confidence: 0,
      reasoning:  `No rule matched for goal="${input.goal}" source="${source}" type="${type}" — explicit source/type required`,
      ambiguous:  true,
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const capabilityResolutionEngine = new CapabilityResolutionEngine();