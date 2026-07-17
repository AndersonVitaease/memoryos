// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Connector Registry
// Single responsibility: resolve connector ID from intent.
// The ExecutionChain never knows connector names — it delegates here.
// ══════════════════════════════════════════════════════════════════════════════

import type { IntentResult } from "./ExecutionChainTypes";

export interface IConnectorRegistry {
  resolve(intent: IntentResult): string;
}

export class ConnectorRegistry implements IConnectorRegistry {
  private readonly _rules: Array<{ pattern: RegExp; connectorId: string }> = [
    { pattern: /email|gmail|send.*mail|mail.*send/, connectorId: "gmail" },
    { pattern: /drive|file|document|doc|folder/,   connectorId: "google_drive" },
    { pattern: /calendar|event|meeting|schedule/,  connectorId: "google_calendar" },
  ];

  resolve(intent: IntentResult): string {
    // Derive from entities if available
    if (intent.entities?.email)  return "gmail";

    // Derive from intent type + slots
    const raw = (intent.slots?.rawText ?? "").toLowerCase();
    for (const rule of this._rules) {
      if (rule.pattern.test(raw)) return rule.connectorId;
    }

    // Default: memory connector
    return "memory";
  }
}