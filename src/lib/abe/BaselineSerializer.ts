/**
 * BaselineSerializer.ts — Architecture Baseline Engine v1.0
 * Sprint EF-6.7.0
 *
 * Serialize / deserialize baselines to/from JSON.
 * Storage: localStorage (browser-safe, no backend required).
 */

import type { ABEBaseline } from "./ABETypes";

const STORAGE_PREFIX = "abe_baseline_";

export const BaselineSerializer = {

  serialize(baseline: ABEBaseline): string {
    return JSON.stringify(baseline, null, 2);
  },

  deserialize(json: string): ABEBaseline {
    return JSON.parse(json) as ABEBaseline;
  },

  /** Persist to localStorage. Returns the storage key. */
  save(baseline: ABEBaseline): string {
    const key = `${STORAGE_PREFIX}${baseline.id}`;
    try {
      localStorage.setItem(key, BaselineSerializer.serialize(baseline));
    } catch {
      // localStorage may be unavailable (e.g. private mode quota) — silently ignore
    }
    return key;
  },

  /** Load from localStorage by baseline id. Returns null if not found. */
  load(baselineId: string): ABEBaseline | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${baselineId}`);
      if (!raw) return null;
      return BaselineSerializer.deserialize(raw);
    } catch {
      return null;
    }
  },

  /** List all saved baseline ids. */
  listSaved(): string[] {
    try {
      return Object.keys(localStorage)
        .filter(k => k.startsWith(STORAGE_PREFIX))
        .map(k => k.slice(STORAGE_PREFIX.length))
        .sort();
    } catch {
      return [];
    }
  },

  /** Delete a saved baseline. */
  delete(baselineId: string): void {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${baselineId}`);
    } catch { /* ignore */ }
  },

  /** Delete all saved baselines. */
  deleteAll(): void {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
  },
};