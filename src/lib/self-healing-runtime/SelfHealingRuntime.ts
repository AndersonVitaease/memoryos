/**
 * SelfHealingRuntime.ts — Sprint 6.3.1
 * HMR-safe singleton entry point for the Self-Healing Runtime layer.
 * Anchored to globalThis to survive Vite hot-module replacement.
 */

import { RuntimeSupervisor } from "./RuntimeSupervisor";

const G = globalThis as any;
const KEY = "__shr_supervisor_v1";

function getSupervisor(): RuntimeSupervisor {
  if (!G[KEY]) {
    G[KEY] = new RuntimeSupervisor();
  }
  return G[KEY] as RuntimeSupervisor;
}

export const selfHealingRuntime: RuntimeSupervisor = getSupervisor();

export { RuntimeSupervisor } from "./RuntimeSupervisor";
export * from "./SHRTypes";