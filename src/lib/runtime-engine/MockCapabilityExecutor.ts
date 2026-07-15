/**
 * MockCapabilityExecutor.ts — Engineering Sprint E-02.3
 * Simulates capability execution without calling any real APIs.
 *
 * SRP: apenas simulação determinística de execução de capabilities.
 * Implementa ICapabilityExecutor.
 *
 * Cada capability simula latência configúrável (padrão 80ms).
 * Nenhuma rede, nenhum connector real, nenhum OAuth.
 *
 * Será substituído/complementado pelo ConnectorRouter na Sprint E-02.4+
 * sem alterar o RuntimeEngine (Open/Closed Principle).
 */

import type {
  ICapabilityExecutor,
  CapabilityExecutorInput,
  CapabilityExecutorOutput,
} from "./RuntimeTypes";

// ── Mock response templates ────────────────────────────────────────────────────

const MOCK_OUTPUTS: Record<string, Record<string, unknown>> = {
  gmail: {
    readInbox:      { emails: [{ id: "mock-1", subject: "Hello World", from: "test@example.com" }], total: 1 },
    searchMessages: { results: [], query: "mock-query", total: 0 },
    readMessage:    { id: "mock-msg-1", subject: "Mock Subject", body: "Mock body content." },
  },
  calendar: {
    listToday:    { events: [], date: new Date().toISOString().slice(0, 10) },
    listTomorrow: { events: [], date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
    listWeek:     { events: [], week: 1 },
    createEvent:  { id: "mock-evt-1", status: "created" },
  },
  drive: {
    searchFiles:  { files: [], query: "mock" },
    listRecent:   { files: [] },
    openDocument: { id: "mock-doc-1", name: "Mock Document", mimeType: "text/plain" },
  },
  memory: {
    query:     { results: [], query: "mock" },
    summarize: { summary: "Mock memory summary." },
  },
};

const DEFAULT_LATENCY_MS = 80;

// ── MockCapabilityExecutor ────────────────────────────────────────────────────

export class MockCapabilityExecutor implements ICapabilityExecutor {
  private readonly _latencyMs: number;

  constructor(latencyMs = DEFAULT_LATENCY_MS) {
    this._latencyMs = latencyMs;
  }

  async execute(input: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    const { step } = input;

    // Simulate processing latency (no real I/O)
    await new Promise((r) => setTimeout(r, this._latencyMs));

    const connectorMocks = MOCK_OUTPUTS[step.connector];
    const output = connectorMocks?.[step.capability] ?? {
      _mock: true,
      connector:  step.connector,
      capability: step.capability,
      note:       "No mock template registered for this capability",
    };

    return {
      status: "completed",
      output: Object.freeze({ ...output as Record<string, unknown> }),
      error:  null,
    };
  }
}