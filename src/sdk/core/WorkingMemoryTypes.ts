/**
 * WorkingMemoryTypes.ts — Core SDK
 * Public contracts for Working Memory interaction.
 * MCS-compliant — read-only surface for SDK consumers.
 */

export interface WorkingMemoryEntry {
  readonly id: string;
  readonly key: string;
  readonly value: unknown;
  readonly ttlMs?: number;
  readonly createdAt: number;
  readonly expiresAt?: number;
}

export interface WorkingMemorySnapshot {
  readonly entries: readonly WorkingMemoryEntry[];
  readonly count: number;
  readonly builtAt: number;
}

export interface IWorkingMemoryReader {
  get(key: string): WorkingMemoryEntry | null;
  snapshot(): WorkingMemorySnapshot;
  has(key: string): boolean;
}