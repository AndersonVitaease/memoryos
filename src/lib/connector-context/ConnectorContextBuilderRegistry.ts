/**
 * ConnectorContextBuilderRegistry.ts
 *
 * Central registry that maps connectorId → IConnectorContextBuilder.
 *
 * Design principles:
 *   - Zero connector-specific logic. No if. No switch. No Google Drive. No Gmail.
 *   - Fully generic dispatch: buildContext(connectorId, request) → context | null.
 *   - Builders register themselves via ConnectorContextBootstrap (explicit, not side-effects).
 *   - OCP: adding a new connector never modifies this file.
 *
 * SRP: sole responsibility is builder registration and dispatch.
 */

import type { BaseConnectorContext } from "./ConnectorContextStore";

// ── Build Request ─────────────────────────────────────────────────────────────

/**
 * Rich input object passed to every builder's build() method.
 * Carries execution metadata so builders can enrich their context without
 * requiring future interface changes.
 */
export interface ConnectorContextBuildRequest {
  /** Connector identifier (e.g. "google-drive", "gmail", "github") */
  connectorId: string;
  /** Capability that produced this output (e.g. "drive.files.list") */
  capability: string;
  /** Raw step output from the connector */
  output: Record<string, unknown>;
  /** Execution metadata — all fields optional; use what's available */
  executionMetadata: {
    executionId?:      string;
    timestamp?:        number;
    durationMs?:       number;
    connectorVersion?: string;
  };
}

// ── Builder Contract ──────────────────────────────────────────────────────────

/**
 * Contract every connector context builder must implement.
 *
 * build(request) receives a rich build request and returns a frozen
 * BaseConnectorContext, or null if the output is not actionable.
 *
 * Builders are also expected to export:
 *   - Their specific context type (e.g. DriveConnectorContext)
 *   - readContext(ctx) — safe narrowing from BaseConnectorContext
 *   - updateSelection(ctx, index) — for future Selection Resolution Engine
 */
export interface IConnectorContextBuilder {
  readonly connectorId: string;
  build(request: ConnectorContextBuildRequest): BaseConnectorContext | null;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<string, IConnectorContextBuilder>();

/**
 * Register a builder for a given connectorId.
 * Idempotent — safe to call multiple times (last-write wins).
 * Called exclusively from ConnectorContextBootstrap.
 */
export function registerContextBuilder(builder: IConnectorContextBuilder): void {
  _registry.set(builder.connectorId, builder);
}

/**
 * Build a connector context from a step output.
 * Returns null when no builder is registered or the builder deems output not actionable.
 *
 * ConnectorResultSynthesizer calls this — it never knows which builder ran.
 */
export function buildContext(
  connectorId: string,
  capability:  string,
  output:      Record<string, unknown>,
  executionMetadata: ConnectorContextBuildRequest["executionMetadata"] = {},
): BaseConnectorContext | null {
  const builder = _registry.get(connectorId);
  if (!builder) return null;
  return builder.build({ connectorId, capability, output, executionMetadata });
}

/** Inspection helper for tests / dashboards. */
export function listRegisteredBuilders(): string[] {
  return Array.from(_registry.keys());
}

/** Check whether a builder is registered for a given connectorId. */
export function hasBuilder(connectorId: string): boolean {
  return _registry.has(connectorId);
}