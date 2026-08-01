/**
 * CapabilityDiscoveryEngine.ts — P9 Capability Registry
 * Discovery automatico de todas as capabilities registradas na plataforma.
 * MDS v2.0 · P9 · Version: 1.0.0
 */

import type {
  DiscoveredCapability,
  DiscoveryReport,
  DiscoverySource,
} from "./CapabilityRegistryTypes";

const GLOBAL_KEY = "__MEMORY_OS_DISCOVERY_ENGINE__";

// Manifesto estatico das capabilities oficiais (P5 + P6 + P4)
const OFFICIAL_CAPABILITIES: readonly Omit<DiscoveredCapability, "discoveredAt">[] = Object.freeze([
  // P5 — Specialists
  { id: "com.memoryos.financial-specialist", kind: "specialist",        version: "1.0.0", domain: "financial",   source: "bootstrap", healthy: true },
  { id: "com.memoryos.legal-specialist",     kind: "specialist",        version: "1.0.0", domain: "legal",       source: "bootstrap", healthy: true },
  { id: "com.memoryos.medical-specialist",   kind: "specialist",        version: "1.0.0", domain: "medical",     source: "bootstrap", healthy: true },
  { id: "com.memoryos.tech-specialist",      kind: "specialist",        version: "1.0.0", domain: "technical",   source: "bootstrap", healthy: true },
  // P6 — Knowledge Packages
  { id: "com.memoryos.financial",            kind: "knowledge_package", version: "1.0.0", domain: "financial",   source: "bootstrap", healthy: true },
  { id: "com.memoryos.legal",                kind: "knowledge_package", version: "1.0.0", domain: "legal",       source: "bootstrap", healthy: true },
  { id: "com.memoryos.brazilian-government", kind: "knowledge_package", version: "1.0.0", domain: "government",  source: "bootstrap", healthy: true },
  // P4 — Connectors
  { id: "com.memoryos.email-connector",      kind: "connector",         version: "1.0.0", domain: "email",       source: "bootstrap", healthy: true },
  { id: "com.memoryos.filesystem-connector", kind: "connector",         version: "1.0.0", domain: "filesystem",  source: "bootstrap", healthy: true },
  { id: "com.memoryos.database-connector",   kind: "connector",         version: "1.0.0", domain: "database",    source: "bootstrap", healthy: true },
]);

class CapabilityDiscoveryEngineImpl {
  private readonly discovered = new Map<string, DiscoveredCapability>();
  private runCount = 0;
  private totalDiscoveryMs = 0;

  discover(): DiscoveryReport {
    const t0 = Date.now();
    const discoveredAt = new Date().toISOString();

    // Auto-discover all official capabilities
    for (const cap of OFFICIAL_CAPABILITIES) {
      this.discovered.set(cap.id, Object.freeze({ ...cap, discoveredAt }));
    }

    // Also pull from P7 CapabilityRegistry if populated
    try {
      const g = globalThis as any;
      const reg = g["__MEMORY_OS_CAPABILITY_REGISTRY__"];
      if (reg) {
        const entries = reg.listAll?.() ?? [];
        for (const entry of entries) {
          const m = entry.manifest;
          if (!this.discovered.has(m.id)) {
            this.discovered.set(m.id, Object.freeze({
              id: m.id,
              kind: m.kind,
              version: m.version,
              domain: m.domain,
              source: "marketplace" as DiscoverySource,
              discoveredAt,
              healthy: entry.healthStatus?.healthy ?? true,
            }));
          }
        }
      }
    } catch {
      // fire-and-forget
    }

    const all = Array.from(this.discovered.values());
    const byKind: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const c of all) {
      byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
      bySource[c.source] = (bySource[c.source] ?? 0) + 1;
    }

    const elapsed = Date.now() - t0;
    this.runCount++;
    this.totalDiscoveryMs += elapsed;

    return Object.freeze({
      total: all.length,
      byKind: Object.freeze(byKind),
      bySource: Object.freeze(bySource),
      discoveredAt,
      capabilities: Object.freeze(all),
    });
  }

  get(id: string): DiscoveredCapability | undefined {
    return this.discovered.get(id);
  }

  listAll(): readonly DiscoveredCapability[] {
    return Array.from(this.discovered.values());
  }

  getRunCount(): number { return this.runCount; }
  getAvgDiscoveryMs(): number {
    return this.runCount === 0 ? 0 : Math.round(this.totalDiscoveryMs / this.runCount);
  }
}

function getDiscoveryEngine(): CapabilityDiscoveryEngineImpl {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new CapabilityDiscoveryEngineImpl();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

export const CapabilityDiscoveryEngine = getDiscoveryEngine();