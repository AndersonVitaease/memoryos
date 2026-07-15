/**
 * MockDriveConnector.ts — Engineering Sprint E-02.4
 * Mock implementation of IConnector for Google Drive.
 *
 * Sem chamadas HTTP. Sem OAuth. Sem Google API.
 */

import type {
  IConnector,
  ConnectorCapability,
  ConnectorInput,
  ConnectorResult,
  ConnectorHealth,
  ConnectorMetadata,
} from "../UCRTypes";

const CAPABILITIES: readonly ConnectorCapability[] = Object.freeze([
  Object.freeze({ id: "searchFiles",  version: "1.0", description: "Search files by query", requiresAuthentication: true, requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 200, timeoutMs: 8000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "listRecent",   version: "1.0", description: "List recent files",      requiresAuthentication: true, requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 150, timeoutMs: 6000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "readFile",     version: "1.0", description: "Read file content",      requiresAuthentication: true, requiresConfirmation: false, supportsStreaming: true,  estimatedCostMs: 300, timeoutMs: 10000, metadata: Object.freeze({}) }),
]);

export class MockDriveConnector implements IConnector {
  constructor(private readonly _latencyMs: number = 20) {}

  connectorId(): string { return "drive"; }
  capabilities(): readonly ConnectorCapability[] { return CAPABILITIES; }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, this._latencyMs));

    const output: Record<string, unknown> = {
      searchFiles: { files: [{ id: "f1", name: "Q4 Report.pdf", mimeType: "application/pdf" }], query: input.parameters["query"] ?? "" },
      listRecent:  { files: [{ id: "f2", name: "Meeting notes.docx" }, { id: "f3", name: "Budget.xlsx" }] },
      readFile:    { content: "Mock file content for testing purposes", fileId: input.parameters["fileId"] ?? "unknown" },
    }[input.capability] ?? null;

    if (output === null) {
      return Object.freeze({ connectorId: "drive", capability: input.capability, status: "failed", output: null, error: `Unknown capability: ${input.capability}`, durationMs: Date.now() - t0 });
    }
    return Object.freeze({ connectorId: "drive", capability: input.capability, status: "success", output, error: null, durationMs: Date.now() - t0 });
  }

  health(): ConnectorHealth {
    return Object.freeze({ status: "healthy", message: "Mock Drive connector is ready", checkedAt: Date.now() });
  }

  metadata(): ConnectorMetadata {
    return Object.freeze({ name: "Google Drive (Mock)", version: "1.0.0", description: "Mock Drive connector for testing", author: "MemoryOS", tags: Object.freeze(["drive", "google", "mock"]) });
  }
}