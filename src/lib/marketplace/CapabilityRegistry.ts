/**
 * CapabilityRegistry.ts — P7 Marketplace Registry
 * Registro central de todas as capabilities do MemoryOS.
 * Fonte unica da verdade para Specialists, Knowledge Packages e Connectors.
 * MDS v2.0 · P7 · Version: 1.0.0
 */

import type {
  CapabilityManifest,
  CapabilityKind,
  CapabilityHealthStatus,
  CompatibilityConstraint,
  MarketplaceQuery,
  PublishRequest,
  PublishResult,
  RegistryEntry,
} from "./MarketplaceTypes";

// ---------------------------------------------------------------------------
// Singleton — HMR-safe
// ---------------------------------------------------------------------------
const GLOBAL_KEY = "__MEMORY_OS_CAPABILITY_REGISTRY__";

class CapabilityRegistryImpl {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly version = "1.0.0";

  register(entry: RegistryEntry): void {
    if (this.entries.has(entry.manifest.id)) {
      const existing = this.entries.get(entry.manifest.id)!;
      if (existing.manifest.version === entry.manifest.version) return;
    }
    this.entries.set(entry.manifest.id, Object.freeze(entry));
  }

  get(id: string): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  query(q: MarketplaceQuery = {}): readonly RegistryEntry[] {
    const results: RegistryEntry[] = [];
    for (const entry of this.entries.values()) {
      const { manifest } = entry;
      if (q.kind && manifest.kind !== q.kind) continue;
      if (q.domain && manifest.domain !== q.domain) continue;
      if (q.tier && manifest.tier !== q.tier) continue;
      if (q.status && manifest.status !== q.status) continue;
      if (q.tags && q.tags.length > 0) {
        const hasAll = q.tags.every((t) => manifest.tags.includes(t));
        if (!hasAll) continue;
      }
      results.push(entry);
    }
    return results;
  }

  publish(req: PublishRequest): PublishResult {
    const errors: string[] = [];

    if (!req.manifest.id) errors.push("id is required");
    if (!req.manifest.name) errors.push("name is required");
    if (!req.manifest.version) errors.push("version is required");
    if (!req.manifest.kind) errors.push("kind is required");
    if (!req.manifest.domain) errors.push("domain is required");
    if (!req.manifest.author) errors.push("author is required");

    if (errors.length > 0) {
      return { success: false, capabilityId: req.manifest.id ?? "", registeredAt: "", errors };
    }

    const registeredAt = new Date().toISOString();
    const checksum = this.computeChecksum(req.manifest);

    const manifest: CapabilityManifest = Object.freeze({
      ...req.manifest,
      registeredAt,
      checksum,
    });

    const compatibility: CompatibilityConstraint = Object.freeze({
      capabilityId: manifest.id,
      ...req.compatibilityConstraints,
    });

    const healthStatus: CapabilityHealthStatus = Object.freeze({
      capabilityId: manifest.id,
      healthy: true,
      lastCheckedAt: registeredAt,
      errorCount: 0,
      successRate: 1.0,
      avgLatencyMs: 0,
    });

    this.register({ manifest, compatibility, healthStatus });

    return { success: true, capabilityId: manifest.id, registeredAt, errors: [] };
  }

  updateHealth(capabilityId: string, patch: Partial<CapabilityHealthStatus>): boolean {
    const entry = this.entries.get(capabilityId);
    if (!entry) return false;
    const updated: RegistryEntry = {
      ...entry,
      healthStatus: Object.freeze({ ...entry.healthStatus, ...patch, capabilityId }),
    };
    this.entries.set(capabilityId, updated);
    return true;
  }

  listAll(): readonly RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  count(kind?: CapabilityKind): number {
    if (!kind) return this.entries.size;
    return this.query({ kind }).length;
  }

  checkCompatibility(idA: string, idB: string): { compatible: boolean; reason: string } {
    const a = this.entries.get(idA);
    const b = this.entries.get(idB);
    if (!a || !b) return { compatible: false, reason: "One or both capabilities not found" };
    if (a.compatibility.conflictsWith.includes(idB)) {
      return { compatible: false, reason: `${idA} conflicts with ${idB}` };
    }
    if (b.compatibility.conflictsWith.includes(idA)) {
      return { compatible: false, reason: `${idB} conflicts with ${idA}` };
    }
    return { compatible: true, reason: "Compatible" };
  }

  getRegistryVersion(): string {
    return this.version;
  }

  private computeChecksum(manifest: Omit<CapabilityManifest, "registeredAt" | "checksum">): string {
    const str = JSON.stringify({ id: manifest.id, version: manifest.version, domain: manifest.domain });
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

function getRegistry(): CapabilityRegistryImpl {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new CapabilityRegistryImpl();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

export const CapabilityRegistry = getRegistry();