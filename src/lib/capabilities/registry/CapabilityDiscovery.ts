// ─── Capability Discovery ─────────────────────────────────────────────────────
// Foundation v1.0 · Descoberta baseada apenas no Manifest

import type { Capability, CapabilityType } from "./CapabilityContract";
import { globalCapabilityRegistry } from "./CapabilityRegistry";

/** Discover all active capabilities of a given type */
export function discoverByType(type: CapabilityType): Capability[] {
  return globalCapabilityRegistry.discover({ type });
}

/** Discover all active Review Engines */
export function discoverReviewEngines(): Capability[] {
  return discoverByType("ReviewEngine");
}

/** Discover all active Connectors */
export function discoverConnectors(): Capability[] {
  return discoverByType("Connector");
}

/** Discover all active Specialists */
export function discoverSpecialists(): Capability[] {
  return discoverByType("Specialist");
}

/** Discover all active Knowledge Packages */
export function discoverKnowledgePackages(): Capability[] {
  return discoverByType("KnowledgePackage");
}

/** Discover all active Tools */
export function discoverTools(): Capability[] {
  return discoverByType("Tool");
}

/** Discover all active Plugins */
export function discoverPlugins(): Capability[] {
  return discoverByType("Plugin");
}

/** Summary of all registered capabilities grouped by type */
export function discoverySummary(): Record<CapabilityType, number> {
  const types: CapabilityType[] = ["ReviewEngine","Connector","Specialist","KnowledgePackage","Tool","Plugin"];
  const summary = {} as Record<CapabilityType, number>;
  for (const t of types) {
    summary[t] = discoverByType(t).length;
  }
  return summary;
}