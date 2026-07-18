// MemoryStorePersistence.ts — Sprint EF-39
// Persistence interface only — no filesystem implementation.
// Defines the contract future engines will fulfill.

import type { KnowledgeRecord } from "../KnowledgeStoreTypes";

export interface SerializedStore {
  readonly version:   string;
  readonly exportedAt: number;
  readonly records:   readonly KnowledgeRecord[];
  readonly metadata:  Record<string, unknown>;
}

export interface IMemoryStorePersistence {
  export():                        Promise<SerializedStore>;
  import(data: SerializedStore):   Promise<{ ok: boolean; imported: number; error?: string }>;
  serialize(data: unknown):        string;
  deserialize<T>(raw: string):     T;
}

// Reference no-op implementation (sprint EF-39 — in-memory only)
export const MemoryStorePersistence: IMemoryStorePersistence = {
  async export(): Promise<SerializedStore> {
    return Object.freeze({
      version:    "EF-39.0",
      exportedAt: Date.now(),
      records:    Object.freeze([]),
      metadata:   Object.freeze({ note: "No-op persistence — in-memory only" }),
    });
  },

  async import(_data: SerializedStore) {
    return Object.freeze({ ok: true, imported: 0 });
  },

  serialize(data: unknown): string {
    return JSON.stringify(data);
  },

  deserialize<T>(raw: string): T {
    return JSON.parse(raw) as T;
  },
};