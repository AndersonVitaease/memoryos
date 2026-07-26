/**
 * GoogleDriveUploadCapability.ts — Sprint upload-01
 *
 * ICapability adapter para upload-01: Upload de arquivo para Google Drive
 *
 * Implementa o padrão:
 *   execute() → GoogleDriveConnector._dispatch("drive.uploadFile", payload)
 *     → DriveUploadExecutor (6-step orchestration)
 *       → GWS Foundation uploadFile()
 *         → Google Drive API
 */

import type { ICapability, CapabilityMetadata, CapabilityContext } from "../CapabilityRuntime";
import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

export class GoogleDriveUploadCapability implements ICapability {
  readonly id = "upload-01";
  readonly displayName = "Upload File to Google Drive";

  async metadata(): Promise<CapabilityMetadata> {
    return {
      id: this.id,
      name: "Google Drive — Upload File",
      description: "Uploads a file to Google Drive with metadata and folder organization",
      category: "upload",
      operations: ["drive.uploadFile"],
      namespace: "drive",
      supportedLanguages: ["en", "pt-BR"],
      version: "1.0.0",
      tags: ["file-upload", "google-drive", "upload-01"],
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
    if (operation !== "drive.uploadFile") {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    // Delegate to connector
    const result = await connectorRuntime._dispatch(
      "drive.uploadFile",
      payload,
    );

    if (!result.ok) {
      throw new Error(`Upload failed: ${result.error}`);
    }

    return result.data;
  }
}
