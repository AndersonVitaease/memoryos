/**
 * LegacyInvocationShim.ts — BUGFIX-SPRINT-002.6.2
 *
 * FASE 2: LegacyInvocationShim
 *
 * Single-responsibility adapter that converts legacy invocation inputs
 * (connectorId string, operation string, payload, context) into a
 * ResolvedCapability and forwards to executeResolvedCapability().
 *
 * Architecture rules:
 *   - The Shim NEVER chooses a connector.
 *   - The Shim NEVER applies fallback, priority, or default connector logic.
 *   - The Shim NEVER consults registry order.
 *   - The Shim ONLY translates old contract → new contract, then delegates.
 *   - If the connectorId is known, it becomes preferredConnector — always explicit.
 *   - If the connectorId is unknown/absent, the result is ambiguous — no silent default.
 *
 * Consumers should migrate from:
 *   ConnectorInvocationService.invoke(connectorId, operation, payload, ctx)
 * to:
 *   LegacyInvocationShim.shimAndExecute(connectorId, operation, payload, ctx, cis)
 * and eventually to:
 *   ConnectorInvocationService.executeResolvedCapability(resolved, payload, ctx)
 */

import { resolvedCapabilityAdapter } from "./ResolvedCapabilityAdapter";
import type { ResolvedCapability }   from "./ResolvedCapability";

// ── Error thrown when a bypass attempt is detected ────────────────────────────

export class DirectConnectorInvocationError extends Error {
  constructor(connectorId: string, operation: string) {
    super(
      `Direct connector invocation is prohibited. Use ResolvedCapability pipeline. ` +
      `Attempted: connector="${connectorId}" operation="${operation}". ` +
      `Migrate to ConnectorInvocationService.executeResolvedCapability().`
    );
    this.name = "DirectConnectorInvocationError";
  }
}

// ── LegacyInvocationInput (mirrors ConnectorInvocationService.invoke signature) ─

export interface LegacyShimInput {
  connectorId: string;
  operation:   string;
  payload?:    Record<string, unknown>;
  metadata?: {
    source?:     string;
    type?:       string;
    domain?:     string;
    repository?: string;
    origin?:     string;
  };
}

// ── ShimResult ─────────────────────────────────────────────────────────────────

export interface ShimResult {
  /** The resolved capability produced by this shim */
  resolved:       ResolvedCapability;
  /** Whether the conversion was lossless (all context preserved) */
  lossless:       boolean;
  /** Reasoning about what was converted */
  reasoning:      string;
  /** true if the input was ambiguous (resolved.ambiguous=true) */
  wasAmbiguous:   boolean;
}

// ── LegacyInvocationShim ──────────────────────────────────────────────────────

export class LegacyInvocationShim {
  /**
   * Converts a legacy (connectorId, operation) call into a ResolvedCapability.
   *
   * Does NOT execute the connector — returns the resolved capability for the
   * caller to forward to executeResolvedCapability().
   *
   * Rules:
   *  1. connectorId present → preferredConnector = connectorId (explicit, lossless)
   *  2. metadata.source present → preferredConnector = source (inferred, near-lossless)
   *  3. Neither → ambiguousCapability (caller must handle ambiguity)
   */
  shim(input: LegacyShimInput): ShimResult {
    const resolved = resolvedCapabilityAdapter.adaptFromCIS(
      input.connectorId,
      input.operation,
      input.metadata,
    );

    const lossless   = !resolved.ambiguous && !!input.connectorId;
    const reasoning  = lossless
      ? `Lossless shim: connectorId="${input.connectorId}" → preferredConnector="${resolved.preferredConnector}"`
      : resolved.ambiguous
        ? `Ambiguous shim: no connectorId or recognisable source — caller must handle`
        : `Near-lossless shim: source="${input.metadata?.source}" → preferredConnector="${resolved.preferredConnector}"`;

    return {
      resolved,
      lossless,
      reasoning,
      wasAmbiguous: resolved.ambiguous,
    };
  }

  /**
   * FASE 3 guard: throws DirectConnectorInvocationError when a caller
   * attempts to execute a connector directly (outside ResolvedCapability pipeline).
   *
   * Usage: call this at any entry point that must be guarded against bypass.
   *
   * @param connectorId - The connector being invoked
   * @param operation   - The operation being called
   * @param isGuarded   - True when the call is going through the official pipeline
   */
  assertNotBypassed(
    connectorId: string,
    operation:   string,
    isGuarded:   boolean,
  ): void {
    if (!isGuarded) {
      throw new DirectConnectorInvocationError(connectorId, operation);
    }
  }

  /**
   * Validates that a call carries an explicit preferredConnector.
   * Returns { valid: true } when the resolved capability is unambiguous.
   * Returns { valid: false, reason } when it is ambiguous or connector is missing.
   */
  validateResolved(resolved: ResolvedCapability): { valid: boolean; reason?: string } {
    if (resolved.ambiguous || !resolved.preferredConnector) {
      return {
        valid:  false,
        reason: `ResolvedCapability is ambiguous — preferredConnector is null. ` +
                `capabilityId="${resolved.capabilityId}" reasoning="${resolved.reasoning}"`,
      };
    }
    return { valid: true };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const legacyInvocationShim = new LegacyInvocationShim();