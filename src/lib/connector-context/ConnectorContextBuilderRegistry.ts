/**
 * ConnectorContextBuilderRegistry.ts
 *
 * Registry that maps connectorId → IConnectorContextBuilder.
 *
 * Design:
 *   - ConnectorResultSynthesizer calls buildContext(connectorId, output) — zero
 *     connector-specific code in the synthesizer.
 *   - Each connector registers its own builder at module load time (side-effect import).
 *   - Adding a new connector = create a new builder + one import. Zero core changes.
 *
 * SRP: sole responsibility is builder registration and dispatch.
 */

import type { BaseConnectorContext } from "./ConnectorContextStore";

/**
 * Contract every connector context builder must implement.
 *
 * build(output) receives the raw step output from the connector and returns
 * a frozen BaseConnectorContext (or null if the output is not actionable).
 */
export interface IConnectorContextBuilder {
  readonly connectorId: string;
  build(output: Record<string, unknown>): BaseConnectorContext | null;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<string, IConnectorContextBuilder>();

/**
 * Register a builder for a given connectorId.
 * Safe to call multiple times with the same id (last-write wins, idempotent in practice).
 */
export function registerContextBuilder(builder: IConnectorContextBuilder): void {
  _registry.set(builder.connectorId, builder);
}

/**
 * Build a connector context from raw step output.
 * Returns null when no builder is registered for the connectorId
 * or when the builder decides the output is not actionable.
 *
 * ConnectorResultSynthesizer calls this — it never knows which builder ran.
 */
export function buildContext(
  connectorId: string,
  output: Record<string, unknown>,
): BaseConnectorContext | null {
  const builder = _registry.get(connectorId);
  if (!builder) return null;
  return builder.build(output);
}

/** Inspection helper for tests / dashboards. */
export function listRegisteredBuilders(): string[] {
  return Array.from(_registry.keys());
}