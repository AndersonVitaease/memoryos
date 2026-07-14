/**
 * RuntimeBootstrap.ts — Sprint 6.3.4
 * Entry point singleton — boots the runtime once per app lifecycle.
 * Anchored to globalThis to prevent double-boot on HMR.
 */

import { StartupCoordinator } from "./StartupCoordinator";
import { RuntimePersistence }  from "./RuntimePersistence";
import type { BootstrapReport, BootstrapPhase } from "./RuntimePersistenceTypes";

const BOOT_KEY = "__memoryos_bootstrap__";

interface BootState {
  booted:      boolean;
  booting:     boolean;
  report:      BootstrapReport | null;
  phase:       BootstrapPhase;
  coordinator: StartupCoordinator;
  listeners:   Array<(phase: BootstrapPhase) => void>;
}

function getState(): BootState {
  const g = globalThis as any;
  if (!g[BOOT_KEY]) {
    const coordinator = new StartupCoordinator();
    g[BOOT_KEY] = {
      booted: false, booting: false, report: null,
      phase: "BOOT", coordinator,
      listeners: [],
    };
    coordinator.onPhaseChange = (phase: BootstrapPhase) => {
      g[BOOT_KEY].phase = phase;
      for (const l of g[BOOT_KEY].listeners) l(phase);
    };
  }
  return g[BOOT_KEY];
}

export const RuntimeBootstrap = {
  /** Boot once — idempotent (safe to call multiple times) */
  async boot(): Promise<BootstrapReport> {
    const state = getState();
    if (state.booted && state.report) return state.report;
    if (state.booting) {
      // Wait for in-progress boot
      return new Promise(resolve => {
        const interval = setInterval(() => {
          if (!state.booting && state.report) {
            clearInterval(interval);
            resolve(state.report!);
          }
        }, 50);
      });
    }
    state.booting = true;
    try {
      const report = await state.coordinator.boot();
      state.report  = report;
      state.booted  = true;
      return report;
    } finally {
      state.booting = false;
    }
  },

  /** Subscribe to phase changes */
  onPhaseChange(listener: (phase: BootstrapPhase) => void): () => void {
    const state = getState();
    state.listeners.push(listener);
    return () => {
      state.listeners = state.listeners.filter(l => l !== listener);
    };
  },

  get phase():   BootstrapPhase   { return getState().phase; },
  get booted():  boolean           { return getState().booted; },
  get booting(): boolean           { return getState().booting; },
  get report():  BootstrapReport | null { return getState().report; },
  get history(): typeof RuntimePersistence.history { return RuntimePersistence.history; },

  /** Force re-boot (e.g. after hot-reload recovery) */
  async reboot(): Promise<BootstrapReport> {
    const state = getState();
    state.booted  = false;
    state.report  = null;
    state.booting = false;
    return this.boot();
  },
};