// ─── Review Engine → Capability Adapter ───────────────────────────────────────
// Foundation v1.0 · Wraps a ReviewEngine as a Capability for the unified registry
// Backward-compatible: existing ReviewEngine code requires zero changes

import type { ReviewEngine } from "../../review/registry/ReviewEngineContract";
import type { Capability, CapabilityManifest, CapabilityCategory } from "./CapabilityContract";

// Map ReviewEngine category → CapabilityCategory (same strings, but typed)
function mapCategory(c: string): CapabilityCategory {
  const valid: CapabilityCategory[] = [
    "Quality","Security","Performance","Compliance","Architecture",
    "Testing","Documentation","Accessibility","Privacy","AI Review",
    "Memory","Reasoning","Integration","Custom",
  ];
  return (valid.includes(c as CapabilityCategory) ? c : "Custom") as CapabilityCategory;
}

export class ReviewEngineCapability implements Capability {
  readonly manifest: CapabilityManifest;
  readonly engine: ReviewEngine;

  constructor(engine: ReviewEngine) {
    this.engine = engine;
    this.manifest = {
      id:                       engine.id,
      name:                     engine.name,
      version:                  engine.version,
      type:                     "ReviewEngine",
      category:                 mapCategory(engine.category),
      description:              `Review Engine: ${engine.name}`,
      author:                   "MemoryOS Platform",
      status:                   "active",
      permissions:              [],
      dependencies:             [],
      tags:                     ["review-engine", engine.category.toLowerCase()],
      minimumFoundationVersion: "1.0",
      metadata:                 { priority: engine.priority, gateName: engine.id.toUpperCase() },
    };
  }
}

/**
 * Wrap a ReviewEngine in a Capability so it can be registered
 * in the unified CapabilityRegistry.
 */
export function toCapability(engine: ReviewEngine): ReviewEngineCapability {
  return new ReviewEngineCapability(engine);
}