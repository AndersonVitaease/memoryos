// Capability Runtime — CapabilityExecutor
// Foundation v1.0 · Engineering First
//
// Responsavel por executar Capabilities, controlar timeout,
// capturar excecoes e produzir CapabilityResult padronizado.

import type { ICapability } from "./ICapability";
import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";
import type { CapabilityContext, CapabilityResult, CapabilityResultStatus, CapabilityExecutionRecord } from "./CapabilityTypes";
import { makeCapabilityExecutionId, makeCapabilityLog } from "./CapabilityTypes";

const DEFAULT_TIMEOUT_MS = 10_000;

export class CapabilityExecutor {
  private readonly executionHistory: CapabilityExecutionRecord[] = [];

  async execute(
    capability: ICapability,
    operation: string,
    payload: Record<string, unknown>,
    context: CapabilityContext,
    connectorRuntime: ConnectorRuntime,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<CapabilityResult> {
    const startTime = Date.now();
    const logs = [
      makeCapabilityLog("info", `Starting capability "${capability.id}" operation "${operation}"`),
    ];

    try {
      const result = await Promise.race([
        capability.execute(operation, payload, context, connectorRuntime),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);

      const duration = Date.now() - startTime;
      logs.push(makeCapabilityLog("info", `Completed in ${duration}ms — status: ${result.status}`));
      this.record({
        executionId: context.executionId,
        capabilityId: capability.id,
        connectorId: context.connectorId,
        operation,
        startTime,
        endTime: Date.now(),
        duration,
        status: "success",
      });
      return { ...result, executionId: context.executionId, logs: [...logs, ...(result.logs ?? [])] };

    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      const isTimeout = error.includes("Timeout");
      const status: CapabilityResultStatus = isTimeout ? "TIMEOUT" : "FAILED";
      logs.push(makeCapabilityLog("error", error));
      this.record({
        executionId: context.executionId,
        capabilityId: capability.id,
        connectorId: context.connectorId,
        operation,
        startTime,
        endTime: Date.now(),
        duration,
        status: "failure",
        error,
      });
      return {
        status,
        success: false,
        error,
        duration,
        capabilityId: capability.id,
        connectorId: context.connectorId,
        executionId: context.executionId,
        logs,
      };
    }
  }

  getHistory(): CapabilityExecutionRecord[] {
    return [...this.executionHistory];
  }

  private record(entry: CapabilityExecutionRecord): void {
    this.executionHistory.push(entry);
  }
}