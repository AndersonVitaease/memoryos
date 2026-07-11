// Base44 Info Capability — Reference Implementation
// Foundation v1.0 · Engineering First
//
// Operacoes:
//   app.info          — informacoes da aplicacao
//   projects.list     — lista projetos
//   sessions.list     — lista sessoes
//   connectivity.ping — verifica conectividade
//   auth.me           — usuario autenticado
//
// Esta Capability utiliza EXCLUSIVAMENTE o Base44 Connector.
// Nenhum acesso externo direto — toda comunicacao via Connector Runtime.

import type { ICapability } from "../ICapability";
import type { ConnectorRuntime } from "../../connector-runtime/ConnectorRuntime";
import type { CapabilityContext, CapabilityMetadata, CapabilityResult } from "../CapabilityTypes";
import { makeCapabilityLog } from "../CapabilityTypes";

const CONNECTOR_ID = "base44";
const OPERATIONS = ["app.info", "projects.list", "sessions.list", "connectivity.ping", "auth.me"];

export class Base44InfoCapability implements ICapability {
  readonly id = "base44-info";
  private initialized = false;

  metadata(): CapabilityMetadata {
    return {
      id: "base44-info",
      name: "Base44 Info Capability",
      version: "1.0.0",
      description: "Read-only access to Base44 platform — app info, projects, sessions via Base44Connector",
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

    // Execute via Connector Runtime — reutilizando integralmente a infraestrutura certificada
    const connectorResult = await connectorRuntime.execute(
      CONNECTOR_ID,
      operation,
      payload,
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
}