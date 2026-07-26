// Google Drive Download Capability — Reference Implementation
// Foundation v1.0 · Phase 1 — Week 1 (read-02)
//
// Operacoes:
//   drive.downloadFile — baixar arquivo do Google Drive e obter conteúdo (read-02)
//
// Esta Capability utiliza EXCLUSIVAMENTE o Google Drive Connector.
// Nenhum acesso externo direto — toda comunicacao via Connector Runtime.

import type { ICapability } from "../ICapability";
import type { ConnectorRuntime } from "../../connector-runtime/ConnectorRuntime";
import type { CapabilityContext, CapabilityMetadata, CapabilityResult } from "../CapabilityTypes";
import { makeCapabilityLog } from "../CapabilityTypes";

const CONNECTOR_ID = "google-drive";
const OPERATIONS = [
  "drive.downloadFile",  // read-02: Baixar arquivo e obter conteúdo
];

export class GoogleDriveDownloadCapability implements ICapability {
  readonly id = "google-drive-download";
  private initialized = false;

  metadata(): CapabilityMetadata {
    return {
      id: "google-drive-download",
      name: "Google Drive Download Capability",
      version: "1.0.0",
      description: "Download file content from Google Drive — supports both media download and Google Workspace export via GoogleDriveConnector",
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
    const logs = [
      makeCapabilityLog("info", `[${operation}] GoogleDriveDownloadCapability.execute() starting`),
    ];

    // Verify operation is supported
    if (!OPERATIONS.includes(operation)) {
      return {
        success: false,
        error: `Operation "${operation}" not supported by GoogleDriveDownloadCapability. Supported: ${OPERATIONS.join(", ")}`,
        output: null,
        logs: [
          ...logs,
          makeCapabilityLog("error", `Unsupported operation: ${operation}`),
        ],
      };
    }

    try {
      // Delegate to connector — capability acts as adapter
      logs.push(makeCapabilityLog("info", `Delegating to GoogleDriveConnector for operation "${operation}"`));

      const connectorResult = await connectorRuntime.execute(
        CONNECTOR_ID,
        operation,
        payload,
        context.executionId,
        context.workspaceId,
      );

      logs.push(
        makeCapabilityLog("info", `Connector returned status=${connectorResult.status} success=${connectorResult.success}`),
      );

      if (!connectorResult.success) {
        return {
          success: false,
          error: connectorResult.error ?? "Connector returned failure with no error message",
          output: null,
          logs: [
            ...logs,
            makeCapabilityLog("error", `Connector failed: ${connectorResult.error}`),
            ...connectorResult.logs,
          ],
        };
      }

      // Success — pass through connector result
      return {
        success: true,
        error: null,
        output: {
          connectorId: CONNECTOR_ID,
          operation,
          connectorData: connectorResult.data,
          connectorStatus: connectorResult.status,
          connectorDurationMs: connectorResult.duration,
        },
        logs: [
          ...logs,
          makeCapabilityLog("info", `Operation "${operation}" completed successfully`),
          ...connectorResult.logs,
        ],
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Exception in GoogleDriveDownloadCapability: ${errorMsg}`,
        output: null,
        logs: [
          ...logs,
          makeCapabilityLog("error", `Exception: ${errorMsg}`),
        ],
      };
    }
  }
}
