/**
 * MockCalendarConnector.ts — Engineering Sprint E-02.4
 * Mock implementation of IConnector for Google Calendar.
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
  Object.freeze({ id: "listToday",    version: "1.0", description: "List today events",     requiresAuthentication: true, requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 150, timeoutMs: 6000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "listUpcoming", version: "1.0", description: "List upcoming events",  requiresAuthentication: true, requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 200, timeoutMs: 6000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "createEvent",  version: "1.0", description: "Create calendar event", requiresAuthentication: true, requiresConfirmation: true,  supportsStreaming: false, estimatedCostMs: 100, timeoutMs: 5000, metadata: Object.freeze({}) }),
]);

export class MockCalendarConnector implements IConnector {
  constructor(private readonly _latencyMs: number = 20) {}

  connectorId(): string { return "calendar"; }
  capabilities(): readonly ConnectorCapability[] { return CAPABILITIES; }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, this._latencyMs));

    const output: Record<string, unknown> = {
      listToday:    { events: [{ id: "e1", title: "Team standup", time: "09:00" }, { id: "e2", title: "Sprint review", time: "15:00" }] },
      listUpcoming: { events: [{ id: "e3", title: "Planning", time: "Tomorrow 10:00" }] },
      createEvent:  { eventId: `evt-${Date.now()}`, status: "created" },
    }[input.capability] ?? null;

    if (output === null) {
      return Object.freeze({ connectorId: "calendar", capability: input.capability, status: "failed", output: null, error: `Unknown capability: ${input.capability}`, durationMs: Date.now() - t0 });
    }
    return Object.freeze({ connectorId: "calendar", capability: input.capability, status: "success", output, error: null, durationMs: Date.now() - t0 });
  }

  health(): ConnectorHealth {
    return Object.freeze({ status: "healthy", message: "Mock Calendar connector is ready", checkedAt: Date.now() });
  }

  metadata(): ConnectorMetadata {
    return Object.freeze({ name: "Google Calendar (Mock)", version: "1.0.0", description: "Mock Calendar connector for testing", author: "MemoryOS", tags: Object.freeze(["calendar", "google", "mock"]) });
  }
}