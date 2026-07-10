// ─── Capability Contract ──────────────────────────────────────────────────────
// Foundation v1.0 · Contrato genérico para toda capability do MemoryOS

// ── Types ─────────────────────────────────────────────────────────────────────

export type CapabilityType =
  | "ReviewEngine"
  | "Connector"
  | "Specialist"
  | "KnowledgePackage"
  | "Tool"
  | "Plugin";

export type CapabilityCategory =
  | "Quality" | "Security" | "Performance" | "Compliance"
  | "Architecture" | "Testing" | "Documentation"
  | "Accessibility" | "Privacy" | "AI Review"
  | "Memory" | "Reasoning" | "Integration" | "Custom";

export type CapabilityStatus = "active" | "inactive" | "deprecated" | "experimental";

export type CapabilityPriority = "Critical" | "High" | "Normal" | "Low";

// ── Manifest ──────────────────────────────────────────────────────────────────

export interface CapabilityPermission {
  resource: string;
  actions: string[];
}

export interface CapabilityDependency {
  id: string;
  version: string;
  required: boolean;
}

/** Declarative manifest — the only thing Discovery needs to know about a Capability */
export interface CapabilityManifest {
  id: string;
  name: string;
  version: string;
  type: CapabilityType;
  category: CapabilityCategory;
  description: string;
  author: string;
  status: CapabilityStatus;
  permissions: CapabilityPermission[];
  dependencies: CapabilityDependency[];
  tags: string[];
  minimumFoundationVersion: string;
  /** Arbitrary metadata — type-specific extensions go here */
  metadata: Record<string, unknown>;
}

// ── Core contract ─────────────────────────────────────────────────────────────

/** Every capability registered in MemoryOS MUST implement this interface */
export interface Capability {
  readonly manifest: CapabilityManifest;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeManifest(partial: Omit<CapabilityManifest, "permissions" | "dependencies" | "tags" | "metadata"> & Partial<Pick<CapabilityManifest, "permissions" | "dependencies" | "tags" | "metadata">>): CapabilityManifest {
  return {
    permissions: [],
    dependencies: [],
    tags: [],
    metadata: {},
    ...partial,
  };
}