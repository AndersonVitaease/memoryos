/**
 * GoogleDriveExtractCapability.ts — Sprint read-04
 *
 * SRP: Implemente ICapability para drive.extractSections.
 *
 * Contrato:
 *   - metadata(): CapabilityMetadata com operations: ["drive.extractSections"]
 *   - execute(operation, payload, context, connectorRuntime): Promise<CapabilityResult>
 *
 * Fluxo:
 *   User intent: "Extraia as seções 'Summary' e 'Conclusion' do relatorio.pdf"
 *     ↓
 *   ConversationGoalBridge: detecta "drive.extractSections"
 *     ↓
 *   ConversationPlanningEngine: gera plano com operação drive.extractSections
 *     ↓
 *   CapabilityRuntime: seleciona "google-drive-extract"
 *     ↓
 *   GoogleDriveExtractCapability.execute()
 *     ↓
 *   GoogleDriveConnector: case "drive.extractSections"
 *     ↓
 *   DriveDocumentExtractExecutor: orquestra fluxo de extração
 *     ↓
 *   Resposta: {sections: [{name, content}, ...], metadata}
 */

import type { ICapability, CapabilityMetadata, CapabilityContext, CapabilityResult } from "./ICapability";
import type { ConnectorRuntime, ConnectorResult } from "@/lib/connector-runtime/ConnectorRuntime";

// ── GoogleDriveExtractCapability ────────────────────────────────────────────

export class GoogleDriveExtractCapability implements ICapability {
  readonly id = "google-drive-extract";

  metadata(): CapabilityMetadata {
    return Object.freeze({
      id: "google-drive-extract",
      name: "Google Drive Extract Capability",
      version: "1.0.0",
      description: "Extracts specific sections or pages from documents in Google Drive",
      author: "MemoryOS Platform",
      connectorId: "google-drive",
      operations: ["drive.extractSections"],
    });
  }

  validate(): boolean {
    // Verify interface compliance: metadata must be callable and return valid CapabilityMetadata
    try {
      const meta = this.metadata();
      return (
        meta.id === "google-drive-extract" &&
        Array.isArray(meta.operations) &&
        meta.operations.includes("drive.extractSections")
      );
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    console.log("[google-drive-extract] initialized");
  }

  async shutdown(): Promise<void> {
    console.log("[google-drive-extract] shutdown");
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    _context: CapabilityContext,
    connectorRuntime: ConnectorRuntime,
  ): Promise<CapabilityResult> {
    // Validate operation
    if (operation !== "drive.extractSections") {
      return {
        success: false,
        error: `Operation '${operation}' not supported by this capability`,
        output: {},
        logs: [],
      };
    }

    // Enrich payload with execution tracking
    const enrichedPayload: Record<string, unknown> = {
      ...payload,
      _debugExecutionId: `exec-${Date.now()}`,
    };

    // Delegate to GoogleDriveConnector
    const CONNECTOR_ID = "google-drive";
    let connectorResult: ConnectorResult;

    try {
      connectorResult = await connectorRuntime.execute(CONNECTOR_ID, operation, enrichedPayload);
    } catch (err) {
      return {
        success: false,
        error: `Connector execution failed: ${(err as Error).message}`,
        output: {},
        logs: [],
      };
    }

    // Map ConnectorResult to CapabilityResult
    if (!connectorResult.success) {
      return {
        success: false,
        error: connectorResult.error || "Unknown connector error",
        output: {},
        logs: [],
      };
    }

    // Extract sections data from connector result
    const extractedData = (connectorResult.data as Record<string, unknown>) || {};

    return {
      success: true,
      error: undefined,
      output: {
        sections: extractedData.sections || [],
        fileId: extractedData.fileId,
        fileName: extractedData.fileName,
        mimeType: extractedData.mimeType,
        extractMethod: extractedData.extractMethod,
        sectionsCount: (extractedData.sections as unknown[] | undefined)?.length || 0,
        durationMs: extractedData.durationMs,
      },
      logs: [`Extracted ${(extractedData.sections as unknown[] | undefined)?.length || 0} sections from document`],
    };
  }
}
