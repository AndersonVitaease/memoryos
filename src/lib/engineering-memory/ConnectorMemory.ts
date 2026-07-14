/**
 * ConnectorMemory.ts — Sprint 6.2.4
 */
import type { ConnectorMemoryEntry } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class ConnectorMemory {
  private readonly _entries: ConnectorMemoryEntry[] = [];

  record(input: {
    connectorName: string; problems: string[]; authNotes: string;
    encodingNotes: string; pagination: string; rateLimitNotes: string;
    retryStrategy: string; strategies: string[]; kgEntityIds?: string[];
  }): ConnectorMemoryEntry {
    const entry: ConnectorMemoryEntry = {
      id: makeMemId("conn"), kind: "CONNECTOR", status: "ACTIVE",
      tags: [input.connectorName, ...input.strategies.slice(0, 2)],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 65, useCount: 0, confidence: 0.8,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): ConnectorMemoryEntry[] { return [...this._entries]; }
  byConnector(name: string): ConnectorMemoryEntry[] { return this._entries.filter(e => e.connectorName === name); }
}