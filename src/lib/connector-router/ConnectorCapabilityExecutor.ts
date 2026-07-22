/**
 * ConnectorCapabilityExecutor.ts — Engineering Sprint E-02.4
 * Adapter: ICapabilityExecutor → UniversalConnectorRouter.
 *
 * SRP: implementar ICapabilityExecutor delegando para o UCR.
 *
 * Dependency Inversion:
 *   ExecutionDispatcher depende de ICapabilityExecutor (não de UCR).
 *   ConnectorCapabilityExecutor depende de UniversalConnectorRouter.
 *   Assim o Dispatcher continua sem conhecer nenhum Connector.
 *
 * Nenhuma rede. Nenhum OAuth.
 */

import type {
  ICapabilityExecutor,
  CapabilityExecutorInput,
  CapabilityExecutorOutput,
  StepStatus,
  ConnectorExecutionContext,
} from "@/lib/runtime-engine/RuntimeTypes";
import { UniversalConnectorRouter } from "./UniversalConnectorRouter";

// ── ConnectorCapabilityExecutor ───────────────────────────────────────────────

export class ConnectorCapabilityExecutor implements ICapabilityExecutor {
  constructor(private readonly _router: UniversalConnectorRouter) {}

  async execute(input: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    const { executionId, step, connectorCtx } = input;

    // B-04: forward connectorCtx to UCR — undefined is acceptable (UCR treats it as optional)
    const routerResult = await this._router.route(executionId, step, connectorCtx);

    // [CCE-PROBE-01] routerResult.result shape received by Executor
    console.log("[CCE-PROBE-01]", {
      probe:           "CCE:routerResultShape",
      t:               performance.now(),
      executionId,
      connector:       step.connector,
      capability:      step.capability,
      found:           routerResult.found,
      resultIsNull:    routerResult.result === null,
      resultKeys:      routerResult.result ? Object.keys(routerResult.result as object) : "NULL",
      resultDotOutput: routerResult.result ? (routerResult.result as any).output : "N/A",
      resultDotData:   routerResult.result ? (routerResult.result as any).data   : "N/A",
      resultDotOutputPresent: routerResult.result ? (routerResult.result as any).output !== undefined : false,
      resultDotDataPresent:   routerResult.result ? (routerResult.result as any).data   !== undefined : false,
      resultDotOutputIsNull:  routerResult.result ? (routerResult.result as any).output === null : false,
      constructorName: routerResult.result ? ((routerResult.result as any)?.constructor?.name ?? "Object") : "NULL",
    });

    if (!routerResult.found || routerResult.result === null) {
      // [RUNTIME-PROBE][CCE-01] Connector NOT found — execution terminates here
      console.log("[RUNTIME-PROBE][CCE-01]", {
        probe:          "capabilityExecutor:connectorNotFound",
        t:              performance.now(),
        ts:             Date.now(),
        executionId,
        connector:      step.connector,
        capability:     step.capability,
        routerError:    routerResult.error,
        notFoundReason: routerResult.notFoundReason ?? "unknown",
        regSize:        (this._router as any)._registry?.size?.() ?? "unknown",
        regContents:    (this._router as any)._registry?.list?.() ?? [],
        note:           "Connector.execute() will NOT be called. If regSize===0, race condition confirmed.",
      });
      // C-05: preserve the not_found semantic — do not collapse to a generic "failed"
      return Object.freeze({
        status:          "failed" as StepStatus,
        output:          null,
        error:           routerResult.error ?? "Router: connector or capability not found",
        // C-05: connectorStatus carries the reason so StepResult observers can distinguish
        connectorStatus: routerResult.notFoundReason ?? "not_found",
      });
    }

    const r = routerResult.result;

    // C-01/C-05: Preserve full status vocabulary — no binary collapse.
    // "not_found" (C-05) and "denied" (C-05) are distinct from "failed".
    // UCR status → StepStatus mapping:
    //   success   → completed
    //   timeout   → timeout
    //   not_found → failed  (connector found but capability not routable)
    //   denied    → failed  (auth/config issue — treated as non-retryable failure at step level)
    //   failed    → failed
    const status: StepStatus =
      r.status === "success"   ? "completed" :
      r.status === "timeout"   ? "timeout"   :
      "failed";

    // C-06: preserve connector-reported durationMs for Dispatcher metrics accuracy.
    // The Dispatcher will receive this in the output object and use it if present.
    // ── [M1.12 AUDIT PROBE — RUNTIME] ──────────────────────────────────────
    if (step.connector === "github") {
      try {
        const { githubAuditStore, GITHUB_AUDIT_MODE } = await import("@/lib/debug/GitHubAuditStore");
        if (GITHUB_AUDIT_MODE) {
          githubAuditStore.record({
            executionId,
            stage: "runtime",
            status,
            capability: step.capability,
            error: r.error ?? undefined,
            result: r.output ? JSON.stringify(r.output).slice(0, 300) : null,
          });
        }
      } catch { /* non-blocking */ }
    }
    // ── [END M1.12 AUDIT PROBE] ─────────────────────────────────────────────

    return Object.freeze({
      status,
      output:        r.output,
      error:         r.error,
      // C-04: propagate connectorId from the UCR result
      connectorId:   r.connectorId,
      // C-04: propagate logs — available to Dispatcher and ExecutionResult for diagnostics
      logs:          r.logs,
      // C-03/C-06: connector-reported duration propagated so Dispatcher can use it
      connectorDurationMs: r.durationMs,
      // C-05: preserve original UCR status string for observability (e.g. "denied", "not_found")
      connectorStatus: r.status,
    });
  }
}