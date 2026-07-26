// Google Drive Read Capability — Reference Implementation
// Foundation v1.0 · Phase 1 — Week 1
//
// Operacoes:
//   drive.files.get         — obter metadados de arquivo por ID (read-01)
//   drive.files.list        — listar arquivos recentes (nav-01)
//   drive.files.listByMime  — listar arquivos por tipo (search-02)
//
// Esta Capability utiliza EXCLUSIVAMENTE o Google Drive Connector.
// Nenhum acesso externo direto — toda comunicacao via Connector Runtime.

import type { ICapability } from "../ICapability";
import type { ConnectorRuntime } from "../../connector-runtime/ConnectorRuntime";
import type { CapabilityContext, CapabilityMetadata, CapabilityResult } from "../CapabilityTypes";
import { makeCapabilityLog } from "../CapabilityTypes";

const CONNECTOR_ID = "google-drive";
const OPERATIONS = [
  "drive.files.get",       // read-01: Obter metadados de arquivo
  "drive.files.list",      // nav-01: Listar arquivos (recentes)
  "drive.files.listByMime", // search-02: Listar por tipo MIME
];

export class GoogleDriveReadCapability implements ICapability {
  readonly id = "google-drive-read";
  private initialized = false;

  metadata(): CapabilityMetadata {
    return {
      id: "google-drive-read",
      name: "Google Drive Read Capability",
      version: "1.0.0",
      description: "Read-only access to Google Drive — file metadata, listing, and searching via GoogleDriveConnector",
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
    // Google Drive Connector operations map directly to Capability operations
    return { op: operation, payload };
  }
}
