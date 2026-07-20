/**
 * ResolvedCapabilityAdapter.ts — BUGFIX-SPRINT-002.6.1
 *
 * FASE 2: Adapter Layer — Progressive migration bridge.
 *
 * Converts legacy invocation inputs (connectorId string, intent string, context object)
 * into a typed ResolvedCapability so the runtime chain can honour the semantic
 * decision that was already made upstream.
 *
 * Architecture rules:
 *   - This adapter NEVER chooses a connector. It only formalises an already-made
 *     decision into the ResolvedCapability contract.
 *   - If the input is genuinely ambiguous (no connectorId, no source), returns
 *     ambiguousCapability() — never a default connector.
 *   - The adapter is stateless and pure.
 *   - Callers who already have a ResolvedCapability must NOT go through this adapter;
 *     pass the resolved value directly.
 */

import {
  resolvedCapability,
  ambiguousCapability,
  type ResolvedCapability,
  type CapabilityDomain,
} from "./ResolvedCapability";

// ── Domain inference from connectorId ─────────────────────────────────────────

const CONNECTOR_DOMAIN_MAP: Record<string, CapabilityDomain> = {
  "github":           "repository",
  "google-drive":     "document",
  "google-calendar":  "calendar",
  "gmail":            "email",
  "google":           "email",
  "base44":           "application",
};

function inferDomain(connectorId: string): CapabilityDomain {
  return CONNECTOR_DOMAIN_MAP[connectorId] ?? "ambiguous";
}

// ── Confidence from how specific the input is ─────────────────────────────────

function scoreConfidence(hasConnector: boolean, hasCapability: boolean, hasSource: boolean): number {
  if (hasConnector && hasCapability) return 0.95;
  if (hasConnector) return 0.80;
  if (hasSource && hasCapability) return 0.75;
  if (hasSource) return 0.60;
  return 0;
}

// ── LegacyInvocationInput ─────────────────────────────────────────────────────

export interface LegacyInvocationInput {
  /** e.g. "github", "google-drive" — the CIS connectorId */
  connectorId?:   string;
  /** e.g. "files.get", "repos.list" — the CIS operation name */
  operation?:     string;
  /** Optional metadata from the intent layer */
  metadata?: {
    source?:      string;
    type?:        string;
    domain?:      string;
    repository?:  string;
    origin?:      string;
  };
}

// ── ResolvedCapabilityAdapter ─────────────────────────────────────────────────

export class ResolvedCapabilityAdapter {
  /**
   * Converts a legacy invocation input into a ResolvedCapability.
   *
   * Priority:
   *   1. Explicit connectorId → resolvedCapability(connector=connectorId)
   *   2. metadata.source that maps to a known connector → resolvedCapability
   *   3. Neither → ambiguousCapability (never falls back to google-drive or any default)
   */
  adapt(input: LegacyInvocationInput): ResolvedCapability {
    const connectorId  = (input.connectorId ?? "").trim();
    const operation    = (input.operation   ?? "").trim();
    const metaSrc      = (input.metadata?.source ?? "").trim();

    const preservedCtx = Object.freeze({
      source:     input.metadata?.source,
      type:       input.metadata?.type,
      domain:     input.metadata?.domain,
      repository: input.metadata?.repository,
      origin:     input.metadata?.origin,
    });

    // ── 1. Explicit connectorId ────────────────────────────────────────────────
    if (connectorId) {
      const domain     = inferDomain(connectorId);
      const confidence = scoreConfidence(true, !!operation, !!metaSrc);
      return resolvedCapability(
        operation || `${connectorId}.unknown`,
        connectorId,
        domain,
        confidence,
        `LegacyAdapter: explicit connectorId="${connectorId}" operation="${operation}"`,
        preservedCtx,
      );
    }

    // ── 2. Source from metadata ────────────────────────────────────────────────
    if (metaSrc && CONNECTOR_DOMAIN_MAP[metaSrc]) {
      const domain     = inferDomain(metaSrc);
      const confidence = scoreConfidence(false, !!operation, true);
      return resolvedCapability(
        operation || `${metaSrc}.unknown`,
        metaSrc,
        domain,
        confidence,
        `LegacyAdapter: metadata.source="${metaSrc}" operation="${operation}"`,
        preservedCtx,
      );
    }

    // ── 3. Ambiguous — no connector can be determined ─────────────────────────
    return ambiguousCapability(
      `LegacyAdapter: no connectorId or recognisable metadata.source — connectorId="${connectorId}" metaSrc="${metaSrc}"`,
      preservedCtx,
    );
  }

  /**
   * Convenience: adapt a plain (connectorId, operation) pair as used by
   * OfficialRuntimeBridge.invokeCompat() and ConnectorInvocationService.invoke().
   */
  adaptFromCIS(
    connectorId: string,
    operation:   string,
    metadata?:   LegacyInvocationInput["metadata"],
  ): ResolvedCapability {
    return this.adapt({ connectorId, operation, metadata });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const resolvedCapabilityAdapter = new ResolvedCapabilityAdapter();