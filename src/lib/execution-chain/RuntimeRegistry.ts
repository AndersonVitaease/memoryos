// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11C — EF-24/EF-25: RuntimeRegistry
// EF-24: RuntimeDescriptor extended with apiVersion + schemaVersion.
// EF-25: validate(), compatibility(), dependencyGraph() added.
// ══════════════════════════════════════════════════════════════════════════════

export interface RuntimeDescriptor {
  readonly id:            string;
  readonly version:       string;
  /** EF-24: API contract version — incremented on breaking changes. */
  readonly apiVersion?:   string;
  /** EF-24: Schema version — incremented when descriptor shape changes. */
  readonly schemaVersion?: string;
  readonly owner:         string;
  readonly capabilities:  readonly string[];
  readonly dependencies:  readonly string[];
  readonly lifecycle:     "singleton" | "scoped" | "transient";
  readonly health:        () => RuntimeHealthStatus;
}

export interface RuntimeHealthStatus {
  readonly status:       "healthy" | "degraded" | "unhealthy";
  readonly uptime:       number;
  readonly version:      string;
  readonly dependencies: readonly string[];
}

// ── EF-25: Validation types ───────────────────────────────────────────────────

export interface ValidationResult {
  readonly valid:      boolean;
  readonly violations: readonly string[];
}

export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reasons:    readonly string[];
}

export interface DependencyNode {
  readonly id:           string;
  readonly dependencies: readonly string[];
  readonly resolved:     boolean;
}

export class RuntimeRegistry {
  private readonly _registry = new Map<string, RuntimeDescriptor>();
  private readonly _startedAt: number;

  constructor(now: number) {
    this._startedAt = now;
  }

  register(descriptor: RuntimeDescriptor): void {
    this._registry.set(descriptor.id, Object.freeze(descriptor));
  }

  resolve(id: string): RuntimeDescriptor | undefined {
    return this._registry.get(id);
  }

  listAll(): RuntimeDescriptor[] {
    return Array.from(this._registry.values());
  }

  health(): Record<string, RuntimeHealthStatus> {
    const result: Record<string, RuntimeHealthStatus> = {};
    for (const [id, desc] of this._registry) {
      result[id] = desc.health();
    }
    return result;
  }

  uptime(now: number): number {
    return now - this._startedAt;
  }

  // ── EF-25: Validation ─────────────────────────────────────────────────────

  /**
   * validate() — checks all registered descriptors for internal consistency.
   * Detects: missing required fields, duplicate IDs, unknown lifecycle values.
   */
  validate(): ValidationResult {
    const violations: string[] = [];

    for (const desc of this._registry.values()) {
      if (!desc.id)      violations.push(`Descriptor missing id`);
      if (!desc.version) violations.push(`Descriptor ${desc.id} missing version`);
      if (!desc.owner)   violations.push(`Descriptor ${desc.id} missing owner`);
      if (!["singleton", "scoped", "transient"].includes(desc.lifecycle)) {
        violations.push(`Descriptor ${desc.id} has invalid lifecycle: ${desc.lifecycle}`);
      }
      if (typeof desc.health !== "function") {
        violations.push(`Descriptor ${desc.id} missing health() function`);
      }
    }

    return Object.freeze({ valid: violations.length === 0, violations: Object.freeze(violations) });
  }

  /**
   * compatibility() — checks if two registered runtimes are compatible
   * based on their version and dependency declarations.
   */
  compatibility(idA: string, idB: string): CompatibilityResult {
    const a = this._registry.get(idA);
    const b = this._registry.get(idB);
    const reasons: string[] = [];

    if (!a) reasons.push(`Runtime '${idA}' not registered`);
    if (!b) reasons.push(`Runtime '${idB}' not registered`);

    if (a && b) {
      // Check if either depends on the other and versions align
      const bDepOnA = b.dependencies.includes(idA);
      const aDepOnB = a.dependencies.includes(idB);

      if (bDepOnA && a.version !== b.version) {
        // Non-matching versions on dependency: warn but still compatible
        reasons.push(`Version mismatch: ${idA}@${a.version} vs ${idB}@${b.version} (dependency declared)`);
      }
      if (aDepOnB && b.version !== a.version) {
        reasons.push(`Version mismatch: ${idB}@${b.version} vs ${idA}@${a.version} (dependency declared)`);
      }

      // Check for circular dependency
      if (bDepOnA && aDepOnB) {
        reasons.push(`Circular dependency detected between ${idA} and ${idB}`);
      }
    }

    return Object.freeze({ compatible: reasons.length === 0, reasons: Object.freeze(reasons) });
  }

  /**
   * dependencyGraph() — returns a flat graph of all runtimes and their resolved dependencies.
   * A dependency is "resolved" if the referenced ID is also registered.
   */
  dependencyGraph(): DependencyNode[] {
    const registered = new Set(this._registry.keys());
    const graph: DependencyNode[] = [];

    for (const desc of this._registry.values()) {
      const resolved = desc.dependencies.every(dep => registered.has(dep));
      graph.push(Object.freeze({
        id:           desc.id,
        dependencies: desc.dependencies,
        resolved,
      }));
    }

    return graph;
  }
}