/**
 * CapabilityResolutionAdapter.ts — BUGFIX-SPRINT-002.7.1
 *
 * Compatibility bridge: converts legacy (connectorId, operation) invocation
 * style into a proper ResolvedCapability, enforcing that ALL connector
 * selection passes through CapabilityResolutionEngine.
 *
 * Architecture rules:
 *   - NEVER chooses a connector itself
 *   - NEVER creates priorities or fallbacks
 *   - NEVER contains GitHub-specific or Google Drive-specific logic
 *   - Translates caller intent (goal + metadata) → ResolvedCapability
 *   - If resolution is ambiguous, returns ambiguous (never defaults to any connector)
 *
 * The Adapter owns NO routing authority.
 * CapabilityResolutionEngine owns ALL routing authority.
 */

import { capabilityResolutionEngine } from "./CapabilityResolutionEngine";
import type { ResolvedCapability }    from "./ResolvedCapability";
import type { ResolutionInput }       from "./CapabilityResolutionEngine";

// ── AdapterInput ──────────────────────────────────────────────────────────────
// The only input the adapter needs: intent expressed as goal + context.
// The connector is NEVER provided — that is for CRE to decide.

export interface AdapterInput {
  /** High-level goal string — matches CRE ResolutionInput.goal format */
  goal:      string;
  metadata?: ResolutionInput["metadata"];
  context?:  ResolutionInput["context"];
}

// ── AdapterResult ─────────────────────────────────────────────────────────────

export interface AdapterResult {
  resolved:         ResolvedCapability;
  /** true when CRE returned a non-ambiguous result */
  hasConnector:     boolean;
  /** Convenience: resolved.preferredConnector (null when ambiguous) */
  connectorId:      string | null;
  /** Convenience: resolved.capabilityId */
  capabilityId:     string;
  /** Milliseconds taken by resolution */
  resolutionMs:     number;
}

// ── CapabilityResolutionAdapter ───────────────────────────────────────────────

export class CapabilityResolutionAdapterClass {

  /**
   * Resolve a connector for the given intent.
   *
   * Callers MUST use result.connectorId for execution.
   * Callers MUST NOT override result.connectorId with their own choice.
   * If hasConnector=false, execution must be aborted or queued for clarification.
   */
  resolve(input: AdapterInput): AdapterResult {
    const t0 = Date.now();

    const resolutionInput: ResolutionInput = {
      goal:     input.goal,
      metadata: input.metadata,
      context:  input.context,
    };

    const resolved    = capabilityResolutionEngine.resolveCapability(resolutionInput);
    const resolutionMs = Date.now() - t0;

    return {
      resolved,
      hasConnector:  !resolved.ambiguous && resolved.preferredConnector !== null,
      connectorId:   resolved.preferredConnector,
      capabilityId:  resolved.capabilityId,
      resolutionMs,
    };
  }

  /**
   * Convenience: resolve and assert that a connector was found.
   * Returns null (not an error) when ambiguous — callers handle gracefully.
   */
  resolveOrNull(input: AdapterInput): { connectorId: string; capabilityId: string; resolved: ResolvedCapability } | null {
    const r = this.resolve(input);
    if (!r.hasConnector) return null;
    return {
      connectorId:  r.connectorId!,
      capabilityId: r.capabilityId,
      resolved:     r.resolved,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const capabilityResolutionAdapter = new CapabilityResolutionAdapterClass();