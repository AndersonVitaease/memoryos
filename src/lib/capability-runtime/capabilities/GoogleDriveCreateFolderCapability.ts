/**
 * GoogleDriveCreateFolderCapability.ts — Sprint create-folder-01
 *
 * ICapability adapter para create-folder-01: Criar pasta no Google Drive
 *
 * Implementa o padrão:
 *   execute() → GoogleDriveConnector._dispatch("drive.createFolder", payload)
 *     → DriveCreateFolderExecutor (3-step orchestration)
 *       → GWS Foundation createFolder()
 *         → Google Drive API
 */

import type { ICapability, CapabilityMetadata, CapabilityContext } from "../CapabilityRuntime";
import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

export class GoogleDriveCreateFolderCapability implements ICapability {
  readonly id = "create-folder-01";
  readonly displayName = "Create Folder in Google Drive";

  async metadata(): Promise<CapabilityMetadata> {
    return {
      id: this.id,
      name: "Google Drive — Create Folder",
      description: "Creates a new folder in Google Drive with optional parent folder",
      category: "create",
      operations: ["drive.createFolder"],
      namespace: "drive",
      supportedLanguages: ["en", "pt-BR"],
      version: "1.0.0",
      tags: ["folder-create", "google-drive", "create-folder-01"],
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
    if (operation !== "drive.createFolder") {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    // Delegate to connector
    const result = await connectorRuntime._dispatch(
      "drive.createFolder",
      payload,
    );

    if (!result.ok) {
      throw new Error(`Create folder failed: ${result.error}`);
    }

    return result.data;
  }
}
