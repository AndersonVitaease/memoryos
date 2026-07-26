/**
 * GoogleDriveDeleteCapability.ts — Sprint delete-01
 *
 * ICapability adapter para delete-01: Deletar arquivo do Google Drive
 *
 * Implementa o padrão:
 *   execute() → GoogleDriveConnector._dispatch("drive.deleteFile", payload)
 *     → DriveDeleteExecutor (4-step orchestration)
 *       → GWS Foundation deleteFile()
 *         → Google Drive API
 */

import type { ICapability, CapabilityMetadata, CapabilityContext } from "../CapabilityRuntime";
import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

export class GoogleDriveDeleteCapability implements ICapability {
  readonly id = "delete-01";
  readonly displayName = "Delete File from Google Drive";

  async metadata(): Promise<CapabilityMetadata> {
    return {
      id: this.id,
      name: "Google Drive — Delete File",
      description: "Deletes a file from Google Drive permanently",
      category: "delete",
      operations: ["drive.deleteFile"],
      namespace: "drive",
      supportedLanguages: ["en", "pt-BR"],
      version: "1.0.0",
      tags: ["file-delete", "google-drive", "delete-01"],
    };
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.id) {
      errors.push("Capability ID is missing");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async initialize(_context: CapabilityContext): Promise<void> {
    // Initialization can be empty if no setup is needed
  }

  async shutdown(): Promise<void> {
    // Cleanup if needed
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    _context: CapabilityContext,
    connectorRuntime: ConnectorRuntime,
  ): Promise<Record<string, unknown>> {
    if (operation !== "drive.deleteFile") {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    // Delegate to connector
    const result = await connectorRuntime._dispatch(
      "drive.deleteFile",
      payload,
    );

    if (!result.ok) {
      throw new Error(`Delete failed: ${result.error}`);
    }

    return result.data;
  }
}
