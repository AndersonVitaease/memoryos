/**
 * ResolvedCapability.ts — BUGFIX-SPRINT-002.5
 *
 * Unified contract type for the result of capability resolution.
 * All routing layers (GitHubQueryRouter, CapabilityResolutionEngine,
 * GoalCapabilityRegistry) produce values conforming to this interface.
 *
 * Architecture rules:
 *   - preferredConnector is the ONLY allowed connector for this capability
 *   - ambiguous=true means no connector may be auto-selected
 *   - No layer downstream may override preferredConnector
 *   - No layer may introduce a default/fallback connector
 */

export type CapabilityDomain =
  | "repository"
  | "document"
  | "email"
  | "calendar"
  | "application"
  | "ambiguous";

export interface ResolvedCapability {
  /** Specific capability identifier, e.g. "source.code.read", "document.read" */
  readonly capabilityId:        string;
  /** Semantic domain of this capability */
  readonly domain:              CapabilityDomain;
  /** The one connector authorised to execute this capability. null when ambiguous. */
  readonly preferredConnector:  string | null;
  /** 0–1 confidence. < 0.4 should be treated as ambiguous by callers. */
  readonly confidence:          number;
  /** Human-readable explanation of how resolution was reached */
  readonly reasoning:           string;
  /** True when context was insufficient to resolve to a specific connector */
  readonly ambiguous:           boolean;
  /** Preserved metadata from intent layer — must never be discarded */
  readonly preservedContext: {
    readonly source?:      string;
    readonly type?:        string;
    readonly domain?:      string;
    readonly repository?:  string;
    readonly origin?:      string;
  };
}

/** Build a fully-resolved (non-ambiguous) ResolvedCapability */
export function resolvedCapability(
  capabilityId:       string,
  preferredConnector: string,
  domain:             CapabilityDomain,
  confidence:         number,
  reasoning:          string,
  preservedContext:   ResolvedCapability["preservedContext"] = {},
): ResolvedCapability {
  return Object.freeze({
    capabilityId,
    domain,
    preferredConnector,
    confidence,
    reasoning,
    ambiguous: false,
    preservedContext: Object.freeze(preservedContext),
  });
}

/** Build an ambiguous ResolvedCapability — no connector auto-selected */
export function ambiguousCapability(
  reasoning:        string,
  preservedContext: ResolvedCapability["preservedContext"] = {},
): ResolvedCapability {
  return Object.freeze({
    capabilityId:       "ambiguous_capability_resolution",
    domain:             "ambiguous",
    preferredConnector: null,
    confidence:         0,
    reasoning,
    ambiguous:          true,
    preservedContext:   Object.freeze(preservedContext),
  });
}