// Connector Runtime — ConnectorExecutor
// Foundation v1.0 · Engineering First
//
// Responsavel por executar operacoes, controlar timeout, capturar erros
// e retornar ConnectorResult padronizado.

import type { IConnector } from "./IConnector";
import type { ConnectorContext, ConnectorResult, ConnectorResultStatus, ExecutionRecord } from "./ConnectorTypes";
import { makeExecutionId, makeLog } from "./ConnectorTypes";

const DEFAULT_TIMEOUT_MS = 10_000;

export class ConnectorExecutor {
  private readonly executionHistory: ExecutionRecord[] = [];

  async execute(
    connector: IConnector,
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<ConnectorResult> {
    const executionId = context.executionId ?? makeExecutionId();
    const startTime = Date.now();
    const logs = [makeLog("info", `Starting operation "${operation}" on connector "${connector.id}"`)];

    try {
      const result = await Promise.race([
        connector.execute(operation, payload, { ...context, executionId }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);

      const duration = Date.now() - startTime;
      logs.push(makeLog("info", `Completed in ${duration}ms`));
      this.record({ executionId, connectorId: connector.id, operation, startTime, endTime: Date.now(), duration, status: "success" });
      return { ...result, status: result.status ?? "SUCCESS", executionId, logs: [...logs, ...(result.logs ?? [])] };

    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      const isTimeout = error.includes("Timeout");
      const status: ConnectorResultStatus = isTimeout ? "TIMEOUT" : "FAILED";
      logs.push(makeLog("error", error));
      this.record({ executionId, connectorId: connector.id, operation, startTime, endTime: Date.now(), duration, status: "failure", error });
      return { status, success: false, error, duration, connectorId: connector.id, executionId, logs };
    }
  }

  getHistory(): ExecutionRecord[] {
    return [...this.executionHistory];
  }

  private record(entry: ExecutionRecord): void {
    this.executionHistory.push(entry);
  }
}