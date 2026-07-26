/**
 * ConnectorRouterExecutor.ts — Phase 1 Integration Bridge
 *
 * SRP: Bridge between CapabilityRuntime + ConnectorRuntime and RuntimeEngine.
 *      Implements ICapabilityExecutor, the interface that RuntimeEngine depends on.
 *
 * Decision logic:
 *   1. Try to find capability by (connector, capability, operation)
 *   2. If found: invoke via CapabilityRuntime.execute()
 *   3. If not: fall back to direct connector execution (backward compatibility)
 *
 * Dependency Inversion: RuntimeEngine depends on ICapabilityExecutor (interface),
 * not on this implementation. Easy to replace with mock for testing.
 *
 * Open/Closed: Adding new capabilities doesn't require changing this file.
 * All capability discovery happens via CapabilityRuntime.
 */

import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type {
  ICapabilityExecutor,
  CapabilityExecutorInput,
  CapabilityExecutorOutput,
} from "@/lib/runtime-engine/RuntimeTypes";
import type { CapabilityRuntime } from "./CapabilityRuntime";
import type { ConnectorRuntime } from "@/lib/connector-runtime/ConnectorRuntime";
import type { CapabilityContext } from "./CapabilityTypes";

// ─── ConnectorRouterExecutor ───────────────────────────────────────────────────

/**
 * Bridges CapabilityRuntime + ConnectorRuntime into RuntimeEngine's ICapabilityExecutor interface.
 *
 * The RuntimeEngine doesn't know about capabilities or connectors — it only knows:
 *   - I have an ExecutionStep
 *   - I have an ICapabilityExecutor
 *   - I call executor.execute(...)
 *   - I get back a StepExecutionOutput
 *
 * This executor handles all the complexity of finding and invoking the right capability or connector.
 */
export class ConnectorRouterExecutor implements ICapabilityExecutor {
  constructor(
    private readonly _capabilityRuntime: CapabilityRuntime,
    private readonly _connectorRuntime: ConnectorRuntime
  ) {}

  /**
   * Execute a single step by trying capabilities first, then connectors.
   *
   * Process:
   *   1. Look up capability by connector ID
   *   2. If capability found and operation is declared:
   *      a. Create CapabilityContext from step + connectorCtx
   *      b. Call capability.execute(operation, parameters, context, connectorRuntime)
   *      c. Return capability result wrapped in CapabilityExecutorOutput
   *   3. If no capability or operation not found:
   *      a. Fall back to direct ConnectorRuntime.execute()
   *      b. Return connector result wrapped in CapabilityExecutorOutput
   *
   * Never throws — always returns a CapabilityExecutorOutput.
   * Logs every decision for observability.
   */
  async execute(input: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    const { executionId, step, retryCtx, connectorCtx } = input;
    const t0 = Date.now();

    console.log("[ROUTER-PROBE][CRE-01]", {
      probe: "connectorRouter:execute:entry",
      t: performance.now(),
      ts: Date.now(),
      executionId,
      connector: step.connector,
      capability: step.capability,
      operation: step.parameters?.operation || "(default)",
      retryAttempt: retryCtx.attempt,
      userId: connectorCtx?.userId ?? "anonymous",
      workspaceId: connectorCtx?.workspaceId ?? "anonymous",
    });

    try {
      // ─ Step 1: Try to find capability ──────────────────────────────────────
      const cap = this._capabilityRuntime.getCapability(step.connector);

      if (cap) {
        const operation = step.parameters?.operation || step.capability;

        // Check if this operation is declared in the capability
        const metadata = cap.metadata();
        if (!metadata.operations.includes(operation)) {
          console.log("[ROUTER-PROBE][CRE-02]", {
            probe: "connectorRouter:operation_not_in_capability",
            capabilityId: cap.id,
            operation,
            declaredOperations: metadata.operations,
            fallbackToConnector: true,
          });
          // Operation not in this capability — fall through to connector
        } else {
          // ─ Step 2: Invoke capability ────────────────────────────────────
          console.log("[ROUTER-PROBE][CRE-03]", {
            probe: "connectorRouter:capability_dispatch",
            capabilityId: cap.id,
            operation,
            parameters: step.parameters,
          });

          try {
            // Build CapabilityContext from ExecutionStep + ConnectorExecutionContext
            const capCtx: CapabilityContext = {
              executionId,
              userId: connectorCtx?.userId ?? "anonymous",
              workspaceId: connectorCtx?.workspaceId ?? "anonymous",
              sessionId: connectorCtx?.sessionId ?? "anonymous",
              projectId: connectorCtx?.projectId ?? "anonymous",
              goalId: connectorCtx?.goalId,
              origin: connectorCtx?.origin ?? "runtime",
            };

            const capResult = await cap.execute(
              operation,
              step.parameters ?? {},
              capCtx,
              this._connectorRuntime
            );

            const durationMs = Date.now() - t0;

            console.log("[ROUTER-PROBE][CRE-04]", {
              probe: "connectorRouter:capability_result",
              capabilityId: cap.id,
              operation,
              status: capResult.status,
              success: capResult.success,
              durationMs,
              hasOutput: capResult.output !== null && capResult.output !== undefined,
              logsCount: capResult.logs?.length ?? 0,
            });

            return {
              status: capResult.success ? "completed" : "failed",
              output: capResult.output,
              error: capResult.error ?? null,
              logs: capResult.logs,
              connectorStatus: "SUCCESS",
              connectorDurationMs: durationMs,
            };
          } catch (capErr) {
            const durationMs = Date.now() - t0;
            const errMsg = (capErr as Error).message;

            console.log("[ROUTER-PROBE][CRE-05]", {
              probe: "connectorRouter:capability_error",
              capabilityId: cap.id,
              operation,
              error: errMsg,
              durationMs,
              fallbackToConnector: true,
            });

            // Capability threw — fall through to connector
            // (don't return error yet — try connector as fallback)
          }
        }
      }

      // ─ Step 3: Fall back to direct ConnectorRuntime.execute() ──────────────
      console.log("[ROUTER-PROBE][CRE-06]", {
        probe: "connectorRouter:connector_fallback",
        connector: step.connector,
        capability: step.capability,
        reason: cap ? "operation_not_in_capability" : "capability_not_found",
      });

      const connResult = await this._connectorRuntime.execute(
        step.connector,
        step.capability,
        step.parameters ?? {},
        {
          executionId,
          userId: connectorCtx?.userId,
          projectId: connectorCtx?.projectId,
          workspaceId: connectorCtx?.workspaceId,
          sessionId: connectorCtx?.sessionId,
          goalId: connectorCtx?.goalId,
          origin: connectorCtx?.origin,
        }
      );

      const durationMs = Date.now() - t0;

      console.log("[ROUTER-PROBE][CRE-07]", {
        probe: "connectorRouter:connector_result",
        connector: step.connector,
        capability: step.capability,
        status: connResult.status,
        success: connResult.success,
        durationMs,
        hasData: connResult.data !== null && connResult.data !== undefined,
        logsCount: connResult.logs?.length ?? 0,
      });

      return {
        status: connResult.success ? "completed" : "failed",
        output: connResult.data ?? null,
        error: connResult.error ?? null,
        logs: connResult.logs,
        connectorStatus: connResult.status,
        connectorDurationMs: connResult.duration,
      };
    } catch (fatalErr) {
      const durationMs = Date.now() - t0;
      const errMsg = (fatalErr as Error).message;

      console.error("[ROUTER-PROBE][CRE-08]", {
        probe: "connectorRouter:fatal_error",
        executionId,
        error: errMsg,
        durationMs,
      });

      return {
        status: "failed",
        output: null,
        error: `Fatal error in ConnectorRouter: ${errMsg}`,
        connectorStatus: "FAILED",
      };
    }
  }
}
