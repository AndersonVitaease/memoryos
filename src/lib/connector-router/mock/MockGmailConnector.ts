/**
 * MockGmailConnector.ts — Engineering Sprint E-02.4
 * Mock implementation of IConnector for Gmail.
 *
 * Sem chamadas HTTP. Sem OAuth. Sem Google API.
 * Apenas simula outputs determinísticos para testes e demos.
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
  Object.freeze({ id: "readInbox",    version: "1.0", description: "Read inbox messages",  requiresAuthentication: true,  requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 200, timeoutMs: 8000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "searchEmails", version: "1.0", description: "Search email by query", requiresAuthentication: true,  requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 300, timeoutMs: 8000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "createDraft",  version: "1.0", description: "Create email draft",    requiresAuthentication: true,  requiresConfirmation: true,  supportsStreaming: false, estimatedCostMs: 100, timeoutMs: 5000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "sendEmail",    version: "1.0", description: "Send an email",         requiresAuthentication: true,  requiresConfirmation: true,  supportsStreaming: false, estimatedCostMs: 150, timeoutMs: 5000, metadata: Object.freeze({}) }),
]);

export class MockGmailConnector implements IConnector {
  constructor(private readonly _latencyMs: number = 20) {}

  connectorId(): string { return "gmail"; }
  capabilities(): readonly ConnectorCapability[] { return CAPABILITIES; }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, this._latencyMs));

    const output: Record<string, unknown> = {
      readInbox:    { messages: [{ id: "m1", subject: "Mock email 1", from: "alice@example.com" }, { id: "m2", subject: "Mock email 2", from: "bob@example.com" }] },
      searchEmails: { messages: [{ id: "m3", subject: "Search result", from: "charlie@example.com" }], query: input.parameters["query"] ?? "" },
      createDraft:  { draftId: `draft-${Date.now()}`, status: "created" },
      sendEmail:    { messageId: `msg-${Date.now()}`, status: "sent" },
    }[input.capability] ?? null;

    if (output === null) {
      return Object.freeze({ connectorId: "gmail", capability: input.capability, status: "failed", output: null, error: `Unknown capability: ${input.capability}`, durationMs: Date.now() - t0 });
    }
    return Object.freeze({ connectorId: "gmail", capability: input.capability, status: "success", output, error: null, durationMs: Date.now() - t0 });
  }

  health(): ConnectorHealth {
    return Object.freeze({ status: "healthy", message: "Mock Gmail connector is ready", checkedAt: Date.now() });
  }

  metadata(): ConnectorMetadata {
    return Object.freeze({ name: "Gmail (Mock)", version: "1.0.0", description: "Mock Gmail connector for testing", author: "MemoryOS", tags: Object.freeze(["email", "google", "mock"]) });
  }
}