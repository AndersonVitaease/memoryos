// ─── Capability Registry ──────────────────────────────────────────────────────
// Foundation v1.0 · Registry genérico — não conhece tipos específicos

import type { Capability, CapabilityType, CapabilityCategory, CapabilityStatus } from "./CapabilityContract";
import { capabilityEventBus } from "./CapabilityEventBus";
import { capabilityHistory }  from "./CapabilityHistoryStore";

export interface CapabilityEntry {
  capability: Capability;
  active: boolean;
  registeredAt: number;
  updatedAt: number;
}

export interface DiscoverOptions {
  type?: CapabilityType;
  category?: CapabilityCategory;
  status?: CapabilityStatus;
  tags?: string[];
  activeOnly?: boolean;
}

export interface SearchOptions {
  query: string;
  type?: CapabilityType;
  activeOnly?: boolean;
}

export class CapabilityRegistry {
  private readonly store = new Map<string, CapabilityEntry>();

  /** Register a new capability. Throws if id already exists — use update() to overwrite. */
  register(cap: Capability): void {
    const { id } = cap.manifest;
    if (this.store.has(id)) {
      throw new Error(`Capability '${id}' is already registered. Use update() to overwrite.`);
    }
    const now = Date.now();
    this.store.set(id, { capability: cap, active: true, registeredAt: now, updatedAt: now });
    capabilityEventBus.publish("CapabilityRegistered", id, cap.manifest);
    capabilityHistory.record(id, "registered", cap.manifest);
  }

  /** Overwrite an existing capability (version upgrade). */
  update(cap: Capability): void {
    const { id } = cap.manifest;
    const existing = this.store.get(id);
    const now = Date.now();
    this.store.set(id, {
      capability: cap,
      active: existing?.active ?? true,
      registeredAt: existing?.registeredAt ?? now,
      updatedAt: now,
    });
    capabilityEventBus.publish("CapabilityUpdated", id, cap.manifest);
    capabilityHistory.record(id, "updated", cap.manifest);
  }

  /** Remove a capability permanently. */
  unregister(id: string): boolean {
    const entry = this.store.get(id);
    if (!entry) return false;
    this.store.delete(id);
    capabilityEventBus.publish("CapabilityRemoved", id, entry.capability.manifest);
    capabilityHistory.record(id, "removed", entry.capability.manifest);
    return true;
  }

  /** Disable without removing. */
  disable(id: string): void {
    const entry = this.store.get(id);
    if (!entry) return;
    entry.active = false;
    entry.updatedAt = Date.now();
    capabilityEventBus.publish("CapabilityDisabled", id, entry.capability.manifest);
    capabilityHistory.record(id, "disabled", entry.capability.manifest);
  }

  /** Re-enable a disabled capability. */
  enable(id: string): void {
    const entry = this.store.get(id);
    if (!entry) return;
    entry.active = true;
    entry.updatedAt = Date.now();
    capabilityEventBus.publish("CapabilityEnabled", id, entry.capability.manifest);
    capabilityHistory.record(id, "enabled", entry.capability.manifest);
  }

  /** Discover capabilities by optional filters. Returns active only by default. */
  discover(opts: DiscoverOptions = {}): Capability[] {
    const { type, category, status, tags, activeOnly = true } = opts;
    return [...this.store.values()]
      .filter(e => !activeOnly || e.active)
      .filter(e => !type     || e.capability.manifest.type === type)
      .filter(e => !category || e.capability.manifest.category === category)
      .filter(e => !status   || e.capability.manifest.status === status)
      .filter(e => !tags?.length || tags.every(t => e.capability.manifest.tags.includes(t)))
      .map(e => e.capability);
  }

  /** Full-text search across id, name, description, tags. */
  search(opts: SearchOptions): Capability[] {
    const q = opts.query.toLowerCase();
    return [...this.store.values()]
      .filter(e => !opts.activeOnly || e.active)
      .filter(e => !opts.type || e.capability.manifest.type === opts.type)
      .filter(e => {
        const m = e.capability.manifest;
        return (
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.tags.some(t => t.toLowerCase().includes(q)) ||
          m.author.toLowerCase().includes(q)
        );
      })
      .map(e => e.capability);
  }

  /** List all entries including inactive. */
  list(): CapabilityEntry[] {
    return [...this.store.values()];
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  get(id: string): Capability | undefined {
    return this.store.get(id)?.capability;
  }

  getEntry(id: string): CapabilityEntry | undefined {
    return this.store.get(id);
  }

  size(): number {
    return this.store.size;
  }
}

/** Global singleton Capability Registry */
export const globalCapabilityRegistry = new CapabilityRegistry();