// Capability Runtime — CapabilityRegistry
// Foundation v1.0 · Engineering First
//
// Responsavel por registrar, localizar e consultar Capabilities.

import type { ICapability } from "./ICapability";
import type { CapabilityMetadata } from "./CapabilityTypes";

interface RegistryEntry {
  capability: ICapability;
  registeredAt: number;
}

export class CapabilityRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  register(capability: ICapability): void {
    if (this.entries.has(capability.id)) {
      throw new Error(`CapabilityRegistry: duplicate capability id "${capability.id}"`);
    }
    this.entries.set(capability.id, { capability, registeredAt: Date.now() });
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  get(id: string): ICapability | undefined {
    return this.entries.get(id)?.capability;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  listAll(): CapabilityMetadata[] {
    return Array.from(this.entries.values()).map(e => e.capability.metadata());
  }

  count(): number {
    return this.entries.size;
  }
}