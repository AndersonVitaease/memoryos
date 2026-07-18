/**
 * IRuntimeStore.ts — Sprint EF-7.2.7
 *
 * Interface for the runtime provider registry store.
 * Decouples callers from the concrete RuntimeRegistry implementation.
 *
 * SRP: storage and retrieval only — no scoring, no reason, no environment detection.
 */

import type { IRuntimeProvider } from "./IRuntimeProvider";

export interface IRuntimeStore {
  register(provider: IRuntimeProvider): void;
  unregister(runtimeId: string): boolean;
  has(runtimeId: string): boolean;
  get(runtimeId: string): IRuntimeProvider | undefined;
  list(): IRuntimeProvider[];
  getActive(): IRuntimeProvider;
  refresh(): void;
  clear(): void;
  readonly size: number;
  readonly lastSelectedId: string | null;
}