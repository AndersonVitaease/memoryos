/**
 * GoogleDriveMoveCapability.ts — Sprint org-02
 *
 * ICapability adapter para org-02: Mover arquivo para pasta
 *
 * Implementa o padrão:
 *   execute() → GoogleDriveConnector._dispatch("drive.moveFile", payload)
 *     → DriveDocumentMoveExecutor (7-step orchestration)
 *       → GWS Foundation moveFile()
 *         → Google Drive API
 */

import type { ICapability, CapabilityMetadata, CapabilityContext } from "../CapabilityRuntime";
import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

export class GoogleDriveMoveCapability implements ICapability {
  readonly id = "org-02";
  readonly displayName = "Move File to Folder";

  async metadata(): Promise<CapabilityMetadata> {
    return {
      id: this.id,
      name: "Google Drive — Move File to Folder",
      description: "Moves a file from one folder to another in Google Drive",
      category: "organization",
      operations: ["drive.moveFile"],
      namespace: "drive",
      supportedLanguages: ["en", "pt-BR"],
      version: "1.0.0",
      tags: ["file-organization", "google-drive", "org-02"],
    };
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validation would check connector availability
    // For now, just structural validation
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
    // In future: could warm up cache, validate credentials, etc.
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
    if (operation !== "drive.moveFile") {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    // Delegate to connector
    const result = await connectorRuntime._dispatch(
      "drive.moveFile",
      payload,
    );

    if (!result.ok) {
      throw new Error(`Move failed: ${result.error}`);
    }

    return result.data;
  }
}
