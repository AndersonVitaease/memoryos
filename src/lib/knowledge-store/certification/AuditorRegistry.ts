// AuditorRegistry.ts — Sprint EF-39.6
// Auto-registration pattern: auditors register themselves.
// Certification only calls AuditorRegistry.runAll() — no coupling to concrete auditors.

import type { IAuditor, AuditorResult } from "./IAuditor";

const _registry = new Map<string, IAuditor>();

export const AuditorRegistry = Object.freeze({
  register(auditor: IAuditor): void {
    _registry.set(auditor.id, auditor);
  },

  has(id: string): boolean {
    return _registry.has(id);
  },

  list(): readonly string[] {
    return Object.freeze([..._registry.keys()]);
  },

  async runAll(): Promise<ReadonlyMap<string, AuditorResult>> {
    const entries = [..._registry.entries()];
    const results = await Promise.all(
      entries.map(async ([id, auditor]) => {
        const result = await auditor.run();
        return [id, result] as const;
      })
    );
    return new Map(results);
  },

  async run(id: string): Promise<AuditorResult | null> {
    const auditor = _registry.get(id);
    if (!auditor) return null;
    return auditor.run();
  },

  clear(): void {
    _registry.clear();
  },
});