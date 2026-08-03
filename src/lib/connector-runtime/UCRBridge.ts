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
  ConnectorResultStatus as UCRStatus,
  ConnectorHealth,
  ConnectorMetadata as UCRMetadata,
} from "@/lib/connector-router/UCRTypes";
import type { ConnectorResultStatus as RuntimeStatus } from "./ConnectorTypes";
import { ConnectorRegistry as UCRRegistry } from "@/lib/connector-router/ConnectorRegistry";
import { ConnectorRegistry as RuntimeRegistry } from "./ConnectorRegistry";
// A-02: makeExecutionId removed — UCRBridge no longer generates fallback IDs.

// ── C-01/C-05: Status mapping — runtime → UCR ────────────────────────────────
// Maps ALL 6 runtime status values to UCR status values with zero collapse.
// NOT_CONFIGURED and NOT_SUPPORTED become "denied" (C-05), never "failed".
// DENIED becomes "denied". TIMEOUT becomes "timeout". CANCELLED becomes "failed".
// This replaces the previous `result.success ? "success" : "failed"` binary.
function _mapStatus(runtimeStatus: RuntimeStatus): UCRStatus {
  switch (runtimeStatus) {
    case "SUCCESS":        return "success";
    case "TIMEOUT":        return "timeout";
    case "NOT_CONFIGURED": return "denied";   // C-05: explicit — not "failed"
    case "NOT_SUPPORTED":  return "denied";   // C-05: explicit — not "failed"
    case "DENIED":         return "denied";   // C-05: explicit — not "failed"
    case "FAILED":         return "failed";
    case "CANCELLED":      return "failed";   // closest UCR equivalent
    default:               return "failed";
  }
}

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
    // A-02: executionId must always come from upstream.
    const eid = input.executionId;

    // [UCRBRIDGE-PROBE-01] UCRBridge.execute() CALLED
    console.log("[UCRBRIDGE-PROBE-01]", {
      probe:       "UCRBridge:execute:entry",
      t:           performance.now(),
      connectorId: this._inner.id,
      capability:  input.capability,
      executionId: eid,
      // B-05: log real context for observability
      userId:      input.connectorCtx?.userId      ?? "anonymous",
      workspaceId: input.connectorCtx?.workspaceId ?? "anonymous",
      sessionId:   input.connectorCtx?.sessionId   ?? "anonymous",
      origin:      input.connectorCtx?.origin      ?? "unknown",
    });

    // B-05: use the real caller context when available — eliminate synthetic "ucr-bridge" values.
    // connectorCtx is injected by the UCR from the RuntimeExecutionContext.connectorCtx field.
    const ctx = input.connectorCtx;
    // IA-005: workspaceId adicionado — GoogleDriveConnector.execute() exige
    // context.workspaceId (ver BUGFIX-SPRINT-001 no próprio Adapter) e nunca
    // o recebia, pois este objeto só continha projectId. projectId é mantido
    // intacto (IA-003/IA-004: nenhum conector oficial o consome, mas nada
    // depende de sua remoção — mudança aditiva apenas).
    const context = {
      executionId: eid,
      userId:      ctx?.userId      ?? "anonymous",
      projectId:   ctx?.workspaceId ?? "anonymous",
      workspaceId: ctx?.workspaceId ?? "anonymous",
      sessionId:   ctx?.sessionId   ?? "anonymous",
      goalId:      ctx?.goalId,
    };
    // [IA-005-PROBE] Confirms workspaceId reaches the connector context.
    console.log("[IA-005-PROBE]", {
      probe:            "UCRBridge:execute:context-built",
      connectorId:      this._inner.id,
      capability:       input.capability,
      executionId:      eid,
      "context.workspaceId": context.workspaceId,
      "context.projectId":   context.projectId,
    });
    // FIX (religado em 2026-08-02+): RuntimeEventBus existia mas nunca era
    // chamado por aqui — instrumentacao pura, nunca muda o resultado real.
    try {
      runtimeEventBus.emit("ConnectorExecutionStarted", this._inner.id, {
        capability: input.capability,
        executionId: eid,
      });
    } catch { /* nunca deixa o bus atrapalhar a execucao real */ }

    let result: Awaited<ReturnType<typeof this._inner.execute>>;
    try {
      result = await this._inner.execute(
        input.capability,
        input.parameters as Record<string, unknown>,
        context,
      );
    } catch (execError) {
      try {
        runtimeEventBus.emit("ConnectorExecutionFailed", this._inner.id, {
          capability: input.capability,
          executionId: eid,
          errorMessage: (execError as Error)?.message ?? String(execError),
        });
      } catch { /* nunca deixa o bus atrapalhar a execucao real */ }
      throw execError; // comportamento original preservado — so observa, nao muda
    }

    try {
      runtimeEventBus.emit(
        result.success ? "ConnectorExecutionCompleted" : "ConnectorExecutionFailed",
        this._inner.id,
        { capability: input.capability, executionId: eid, durationMs: result.duration, status: result.status },
      );
    } catch { /* nunca deixa o bus atrapalhar a execucao real */ }

    // [UCRBRIDGE-PROBE-02] RuntimeConnector returned ConnectorTypes.ConnectorResult
    console.log("[UCRBRIDGE-PROBE-02]", {
      probe:              "UCRBridge:innerResult",
      connectorId:        this._inner.id,
      capability:         input.capability,
      innerResultStatus:  result.status,
      innerResultSuccess: result.success,
      innerResultDataKey: result.data !== undefined ? "PRESENT" : "ABSENT",
      innerDurationMs:    result.duration,
      logsCount:          result.logs?.length ?? 0,
    });

    // C-03: Use the connector's own duration when available — avoid double-measuring.
    // result.duration is set at connector level (start → operation end).
    // Fall back to bridge-measured elapsed only if the connector did not report one.
    const durationMs = (typeof result.duration === "number" && result.duration > 0)
      ? result.duration
      : Date.now() - t0;

    const ucrResult: UCRResult = Object.freeze({
      // C-02: data → output mapping — explicit, no ambiguity
      connectorId: this._inner.id,
      capability:  input.capability,
      // C-01: full status preserved via _mapStatus — no binary collapse
      status:      _mapStatus(result.status),
      // C-02: result.data is the canonical data field from runtime connectors
      output:      result.data ?? null,
      error:       result.error ?? null,
      // C-03: connector-reported duration takes precedence
      durationMs,
      // C-04: executionId propagated — never generated here
      executionId: result.executionId ?? eid,
      // C-04: logs preserved — never discarded
      logs:        Object.freeze(result.logs ?? []),
    });

    // [UCRBRIDGE-PROBE-03] UCRTypes.ConnectorResult returned by Bridge
    console.log("[UCRBRIDGE-PROBE-03]", {
      probe:         "UCRBridge:ucrResult",
      connectorId:   ucrResult.connectorId,
      capability:    ucrResult.capability,
      status:        ucrResult.status,
      outputPresent: ucrResult.output !== null && ucrResult.output !== undefined,
      durationMs:    ucrResult.durationMs,
      logsCount:     ucrResult.logs.length,
      executionId:   ucrResult.executionId,
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
