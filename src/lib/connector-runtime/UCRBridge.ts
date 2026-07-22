/**
 * UCRBridge.ts — Engineering Sprint 8.3
 *
 * Single adapter between connector-runtime/IConnector and UCRTypes/IConnector.
 *
 * SRP: adapt the connector-runtime interface to the UCR interface.
 *      One bridge for ALL connectors — no per-connector adapters.
 *
 * Open/Closed: adding a new connector to the bootstrap does NOT require
 *   touching this file — the bridge is generic.
 *
 * This eliminates the inline adapter in ConnectorBootstrap (Sprint 8.2).
 */

import type { IConnector as RuntimeConnector } from "./IConnector";
import type {
  IConnector as UCRConnector,
  ConnectorCapability,
  ConnectorInput,
  ConnectorResult as UCRResult,
  ConnectorHealth,
  ConnectorMetadata as UCRMetadata,
} from "@/lib/connector-router/UCRTypes";
import { ConnectorRegistry as UCRRegistry } from "@/lib/connector-router/ConnectorRegistry";
import { ConnectorRegistry as RuntimeRegistry } from "./ConnectorRegistry";
// A-02: makeExecutionId removed — UCRBridge no longer generates fallback IDs.

// ── Bridge (wraps one RuntimeConnector as UCRConnector) ───────────────────────

class UCRConnectorBridge implements UCRConnector {
  constructor(private readonly _inner: RuntimeConnector) {}

  connectorId(): string {
    return this._inner.id;
  }

  capabilities(): readonly ConnectorCapability[] {
    return this._inner.metadata().capabilities.map((id) =>
      Object.freeze({
        id,
        version: this._inner.metadata().version,
        description: `${this._inner.metadata().name} — ${id}`,
        requiresAuthentication: true,
        requiresConfirmation: false,
        supportsStreaming: false,
        estimatedCostMs: 800,
        timeoutMs: 12000,
        metadata: Object.freeze({}),
      } as ConnectorCapability),
    );
  }

  async execute(input: ConnectorInput): Promise<UCRResult> {
    const t0  = Date.now();
    // A-02: executionId must always come from upstream (Pipeline → CRE → ECF → Dispatcher → CCE → UCR → here).
    // No fallback generation — if it is missing, use it as-is so the bug surfaces visibly in probes.
    const eid = input.executionId;

    // [UCRBRIDGE-PROBE-01] UCRBridge.execute() CALLED
    console.log("[UCRBRIDGE-PROBE-01]", {
      probe:      "UCRBridge:execute:entry",
      t:          performance.now(),
      connectorId: this._inner.id,
      capability:  input.capability,
      executionId: eid,
    });

    const result = await this._inner.execute(
      input.capability,
      input.parameters as Record<string, unknown>,
      {
        executionId: eid,
        userId:      "ucr-bridge",
        projectId:   "ucr-bridge",
        sessionId:   "ucr-bridge",
      },
    );

    // [UCRBRIDGE-PROBE-02] RuntimeConnector returned ConnectorTypes.ConnectorResult
    console.log("[UCRBRIDGE-PROBE-02]", {
      probe:           "UCRBridge:innerResult",
      connectorId:     this._inner.id,
      capability:      input.capability,
      innerResultStatus:  result.status,
      innerResultSuccess: result.success,
      innerResultDataKey: result.data !== undefined ? "PRESENT" : "ABSENT",
      innerResultDataType: result.data === null ? "null" : typeof result.data,
      innerResultOutputKey: (result as any).output !== undefined ? "PRESENT" : "ABSENT",
    });

    const ucrResult = Object.freeze({
      connectorId: this._inner.id,
      capability:  input.capability,
      status:      result.success ? "success" : "failed",
      output:      result.data ?? null,
      error:       result.error ?? null,
      durationMs:  Date.now() - t0,
    } as UCRResult);

    // [UCRBRIDGE-PROBE-03] UCRTypes.ConnectorResult returned by Bridge
    console.log("[UCRBRIDGE-PROBE-03]", {
      probe:         "UCRBridge:ucrResult",
      connectorId:   ucrResult.connectorId,
      capability:    ucrResult.capability,
      status:        ucrResult.status,
      outputPresent: ucrResult.output !== null && ucrResult.output !== undefined,
      outputType:    typeof ucrResult.output,
      outputKeys:    ucrResult.output && typeof ucrResult.output === "object" ? Object.keys(ucrResult.output as object).slice(0, 6) : "N/A",
    });

    return ucrResult;
  }

  health(): ConnectorHealth {
    // health() is async on RuntimeConnector — return a synchronous best-effort snapshot.
    return Object.freeze({
      status:    "healthy" as const,
      message:   `${this._inner.metadata().name} — bridge health`,
      checkedAt: Date.now(),
    });
  }

  metadata(): UCRMetadata {
    const m = this._inner.metadata();
    return Object.freeze({
      name:        m.name,
      version:     m.version,
      description: m.description,
      author:      m.author,
      tags:        Object.freeze([]),
    });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Builds a UCRRegistry populated by bridging every connector in the RuntimeRegistry.
 * This is the single point where UCR learns about connectors.
 */
export function buildUCRRegistry(runtimeRegistry: RuntimeRegistry): UCRRegistry {
  const ucrRegistry = new UCRRegistry();
  for (const id of runtimeRegistry.list()) {
    const connector = runtimeRegistry.get(id);
    if (connector) {
      ucrRegistry.register(new UCRConnectorBridge(connector));
    }
  }
  return ucrRegistry;
}