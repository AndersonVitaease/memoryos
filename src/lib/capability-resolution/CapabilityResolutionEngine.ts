/**
 * CapabilityResolutionEngine.ts — BUGFIX-SPRINT-002.4 / 002.5
 *
 * Transforms { goal, metadata, context } into a ResolvedCapability.
 * Returns the unified ResolvedCapability contract (BUGFIX-002.5).
 *
 * Architecture rules:
 *   - Never chooses a connector by history, order of registration, or default
 *   - Returns ambiguous_capability_resolution when context is insufficient
 *   - NLP/intent layer feeds metadata; this engine consumes it
 *   - ConnectorResolver receives the already-resolved ResolvedCapability
 *   - preservedContext carries all input metadata through to execution
 */

import { resolvedCapability, ambiguousCapability } from "./ResolvedCapability";
export type { ResolvedCapability } from "./ResolvedCapability";

export type ResolutionSource = "github" | "google-drive" | "google-calendar" | "gmail" | "base44";
export type ResolutionDomain = "repository" | "document" | "calendar" | "email" | "application" | "ambiguous";

export interface ResolutionInput {
  /** High-level goal string, e.g. "FETCH_SOURCE_CODE", "READ_DOCUMENT", "READ_FILE" */
  goal: string;
  metadata?: {
    source?:     string;
    type?:       string;
    domain?:     string;
    origin?:     string;
    repository?: string;
  };
  context?: {
    workspaceId?: string;
    userId?:      string;
    repository?:  string;
  };
}

// Legacy result shape — kept for backward compatibility with 002.4 spec tests
export interface ResolutionResult {
  capability:  string;
  connector:   string | null;
  domain:      ResolutionDomain;
  confidence:  number;
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

  /**
   * Primary API — returns unified ResolvedCapability contract (BUGFIX-002.5).
   * All metadata is preserved in preservedContext.
   */
  resolveCapability(input: ResolutionInput): import("./ResolvedCapability").ResolvedCapability {
    const goalUpper    = input.goal.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const source       = input.metadata?.source      ?? "";
    const type         = input.metadata?.type        ?? "";
    const domain       = input.metadata?.domain      ?? "";
    const origin       = input.metadata?.origin      ?? "";
    const repository   = input.metadata?.repository  ?? input.context?.repository ?? "";
    const domainHint   = `${domain} ${origin}`.trim();

    const preserved = Object.freeze({ source, type, domain, origin, repository });

    for (const rule of RULES) {
      const goalMatches = rule.goalPatterns.some(p => goalUpper.includes(p));
      if (!goalMatches) continue;

      const srcOk    = !rule.sourceHints  || matchesAny(source,     rule.sourceHints);
      const typeOk   = !rule.typeHints    || matchesAny(type,       rule.typeHints);
      const domainOk = !rule.domainHints  || matchesAny(domainHint, rule.domainHints);

      if (srcOk && typeOk && domainOk) {
        const hasExplicit = !!(source || type || domain || origin);
        return resolvedCapability(
          rule.capability,
          rule.connector,
          rule.domain,
          hasExplicit ? 0.95 : 0.75,
          `Rule match: goal="${input.goal}" source="${source}" type="${type}" → ${rule.capability} via ${rule.connector}`,
          preserved,
        );
      }
    }

    return ambiguousCapability(
      `No rule matched for goal="${input.goal}" source="${source}" type="${type}" — explicit source/type required`,
      preserved,
    );
  }

  /**
   * Legacy API — backward compat with 002.4 spec tests.
   */
  resolve(input: ResolutionInput): ResolutionResult {
    const r = this.resolveCapability(input);
    return {
      capability: r.capabilityId,
      connector:  r.preferredConnector,
      domain:     r.domain as ResolutionDomain,
      confidence: r.confidence,
      reasoning:  r.reasoning,
      ambiguous:  r.ambiguous,
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const capabilityResolutionEngine = new CapabilityResolutionEngine();