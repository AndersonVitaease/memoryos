// GitHub Read Capability — Reference Implementation
// Foundation v1.0 · Engineering First
//
// Operacoes:
//   auth.user         — usuario autenticado no GitHub
//   repos.list        — lista repositorios
//   repos.get         — informacoes de um repositorio especifico
//   repos.branches    — branches de um repositorio
//   connectivity.ping — verifica conectividade
//
// Esta Capability utiliza EXCLUSIVAMENTE o GitHub Connector.
// Nenhum acesso externo direto — toda comunicacao via Connector Runtime.

import type { ICapability } from "../ICapability";
import type { ConnectorRuntime } from "../../connector-runtime/ConnectorRuntime";
import type { CapabilityContext, CapabilityMetadata, CapabilityResult } from "../CapabilityTypes";
import { makeCapabilityLog } from "../CapabilityTypes";

const CONNECTOR_ID = "github";
const OPERATIONS = ["auth.user", "repos.list", "repos.get", "repos.branches", "connectivity.ping"];

export class GitHubReadCapability implements ICapability {
  readonly id = "github-read";
  private initialized = false;

  metadata(): CapabilityMetadata {
    return {
      id: "github-read",
      name: "GitHub Read Capability",
      version: "1.0.0",
      description: "Read-only access to GitHub — user, repos, branches via GitHubConnector",
      author: "MemoryOS",
      connectorId: CONNECTOR_ID,
      operations: OPERATIONS,
    };
  }

  validate(): boolean { return true; }

  async initialize(_context: CapabilityContext, _connectorRuntime: ConnectorRuntime): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: CapabilityContext,
    connectorRuntime: ConnectorRuntime,
  ): Promise<CapabilityResult> {
    const logs = [makeCapabilityLog("info", `[${this.id}] Dispatching "${operation}" to connector "${CONNECTOR_ID}"`)];

    if (!OPERATIONS.includes(operation)) {
      return {
        status: "FAILED",
        success: false,
        error: `Unknown operation: "${operation}"`,
        duration: 0,
        capabilityId: this.id,
        connectorId: CONNECTOR_ID,
        executionId: context.executionId,
        logs: [...logs, makeCapabilityLog("error", `Operation "${operation}" not supported`)],
      };
    }

    // Resolve connector operation mapping
    const connectorOperation = this.mapOperation(operation, payload);

    // Execute via Connector Runtime — reutilizando integralmente a infraestrutura certificada
    const connectorResult = await connectorRuntime.execute(
      CONNECTOR_ID,
      connectorOperation.op,
      connectorOperation.payload,
      {
        userId: context.userId,
        projectId: context.projectId,
        sessionId: context.sessionId,
        goalId: context.goalId,
        capabilityId: context.capabilityId,
        identityContext: context.identityContext,
      },
    );

    logs.push(makeCapabilityLog(
      connectorResult.success ? "info" : "warn",
      `[${this.id}] Connector "${CONNECTOR_ID}" responded with status: ${connectorResult.status} in ${connectorResult.duration}ms`,
    ));

    // Convert ConnectorResult → CapabilityResult
    return {
      status: connectorResult.status as CapabilityResult["status"],
      success: connectorResult.success,
      data: connectorResult.data,
      error: connectorResult.error,
      duration: connectorResult.duration,
      capabilityId: this.id,
      connectorId: CONNECTOR_ID,
      executionId: context.executionId,
      logs: [...logs, ...connectorResult.logs.map(l => ({
        timestamp: l.timestamp,
        level: l.level as "info" | "warn" | "error",
        message: l.message,
      }))],
    };
  }

  private mapOperation(operation: string, payload: Record<string, unknown>): { op: string; payload: Record<string, unknown> } {
    // GitHub Connector operations map directly to Capability operations
    return { op: operation, payload };
  }
}