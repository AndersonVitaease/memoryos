// ─── Review Engine Registry ───────────────────────────────────────────────────
// Foundation v1.0 · Registro central de todos os engines de revisão

import type { ReviewEngine, EnginePriority } from "./ReviewEngineContract";

const PRIORITY_ORDER: EnginePriority[] = ["Critical", "High", "Normal", "Low"];

export interface RegistryEntry {
  engine: ReviewEngine;
  active: boolean;
  registeredAt: number;
}

export class ReviewEngineRegistry {
  private readonly engines = new Map<string, RegistryEntry>();

  /** Register a new engine. Throws if id already registered. */
  register(engine: ReviewEngine): void {
    if (this.engines.has(engine.id)) {
      throw new Error(`ReviewEngine '${engine.id}' is already registered. Use replace() to overwrite.`);
    }
    this.engines.set(engine.id, { engine, active: true, registeredAt: Date.now() });
  }

  /** Replace an existing engine (for version upgrades). */
  replace(engine: ReviewEngine): void {
    this.engines.set(engine.id, { engine, active: true, registeredAt: Date.now() });
  }

  /** Remove an engine permanently. */
  remove(id: string): boolean {
    return this.engines.delete(id);
  }

  /** Disable an engine without removing it. */
  disable(id: string): void {
    const entry = this.engines.get(id);
    if (entry) entry.active = false;
  }

  /** Re-enable a disabled engine. */
  enable(id: string): void {
    const entry = this.engines.get(id);
    if (entry) entry.active = true;
  }

  /** List all active engines, sorted by priority. */
  discover(): ReviewEngine[] {
    return [...this.engines.values()]
      .filter(e => e.active)
      .sort((a, b) =>
        PRIORITY_ORDER.indexOf(a.engine.priority) -
        PRIORITY_ORDER.indexOf(b.engine.priority)
      )
      .map(e => e.engine);
  }

  /** List all entries (active + inactive). */
  listAll(): RegistryEntry[] {
    return [...this.engines.values()];
  }

  /** Check if an engine id is registered. */
  has(id: string): boolean {
    return this.engines.has(id);
  }

  /** Total registered count (active + inactive). */
  size(): number {
    return this.engines.size;
  }
}

/** Singleton registry — shared across the app */
export const globalRegistry = new ReviewEngineRegistry();