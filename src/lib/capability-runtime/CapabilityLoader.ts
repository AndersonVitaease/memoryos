// Capability Runtime — CapabilityLoader
// Foundation v1.0 · Engineering First
//
// Responsavel por carregar, validar e inicializar Capabilities.

import type { ICapability } from "./ICapability";
import type { CapabilityContext } from "./CapabilityTypes";
import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

export interface CapabilityLoadResult {
  capabilityId: string;
  success: boolean;
  loadTimeMs: number;
  error?: string;
}

export class CapabilityLoader {
  private readonly loaded = new Set<string>();

  async load(
    capability: ICapability,
    context: CapabilityContext,
    connectorRuntime: ConnectorRuntime,
  ): Promise<CapabilityLoadResult> {
    const start = Date.now();
    try {
      if (!capability.validate()) {
        throw new Error("validate() returned false — capability configuration is invalid");
      }
      await capability.initialize(context, connectorRuntime);
      this.loaded.add(capability.id);
      return { capabilityId: capability.id, success: true, loadTimeMs: Date.now() - start };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { capabilityId: capability.id, success: false, loadTimeMs: Date.now() - start, error };
    }
  }

  async unload(capability: ICapability): Promise<void> {
    await capability.shutdown();
    this.loaded.delete(capability.id);
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }
}