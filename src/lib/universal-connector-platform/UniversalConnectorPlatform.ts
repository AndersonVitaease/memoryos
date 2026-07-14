/**
 * UniversalConnectorPlatform.ts — Sprint 6.3.0
 * Top-level entry point for the UCP.
 * HMR-safe singleton anchored to globalThis.
 */

import { ConnectorRuntime } from "./ConnectorRuntime";

const GLOBAL_KEY = "__ucp_instance__";

function getOrCreateRuntime(): ConnectorRuntime {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    const rt = new ConnectorRuntime();
    rt.start();
    g[GLOBAL_KEY] = rt;
  }
  return g[GLOBAL_KEY] as ConnectorRuntime;
}

export class UniversalConnectorPlatform {
  private static _runtime: ConnectorRuntime | null = null;

  static getRuntime(): ConnectorRuntime {
    if (!UniversalConnectorPlatform._runtime) {
      UniversalConnectorPlatform._runtime = getOrCreateRuntime();
    }
    return UniversalConnectorPlatform._runtime;
  }

  static version(): string { return "6.3.0"; }

  static isReady(): boolean {
    return UniversalConnectorPlatform.getRuntime().isRunning();
  }

  static reset(): void {
    const g = globalThis as any;
    if (g[GLOBAL_KEY]) {
      g[GLOBAL_KEY].stop();
      delete g[GLOBAL_KEY];
    }
    UniversalConnectorPlatform._runtime = null;
  }
}

// Export a convenience accessor
export const ucp = UniversalConnectorPlatform.getRuntime();