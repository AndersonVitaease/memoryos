// CapabilityRegistry.ts
// Foundation v1.0 · Engineering First · Sprint EF-14
// Single Responsibility: register, resolve, validate, catalog capabilities.
// Never executes. Never uses AI. Never touches DB. Never knows Connectors.

import {
  CapabilityId,
  CapabilityName,
  CapabilityVersion,
  CapabilityCategory,
  CapabilityTag,
  CapabilityDefinition,
  CapabilityDescriptor,
  CapabilityStatistics,
  CapabilityMetrics,
  CapabilityHealth,
  CapabilityLog,
  CapabilityLogOperation,
} from "./CapabilityRegistryTypes";

// ── Internals ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return "cr-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function semverValid(v: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(v);
}

function compositeKey(name: CapabilityName, version: CapabilityVersion): string {
  return `${name}@${version}`;
}

const VALID_CATEGORIES: CapabilityCategory[] = [
  "SYSTEM", "MEMORY", "KNOWLEDGE", "LEARNING",
  "COMMUNICATION", "FILE", "CONNECTOR", "SPECIALIST", "UTILITY",
];

// ── Registry ───────────────────────────────────────────────────────────────────

export class CapabilityRegistry {
  private readonly store    = new Map<CapabilityId, CapabilityDescriptor>();
  private readonly nameIdx  = new Map<string, CapabilityId>();   // compositeKey → id
  private readonly logs_arr: CapabilityLog[] = [];

  // Counters
  private registerCount   = 0;
  private resolveCount    = 0;
  private validationCount = 0;
  private errorCount      = 0;
  private unregisterCount = 0;
  private updateCount     = 0;
  private totalResolveMs  = 0;
  private totalValidMs    = 0;

  // ── register ────────────────────────────────────────────────────────────────

  register(def: CapabilityDefinition): CapabilityDescriptor {
    const t0 = Date.now();
    const id  = uuid();
    let err: string | null = null;

    const validationErr = this._validateDefinition(def);
    if (validationErr) {
      err = validationErr;
      this._log("REGISTER", id, Date.now() - t0, "FAILED", err);
      this.errorCount++;
      throw new Error(`CapabilityRegistry.register: ${err}`);
    }

    const key = compositeKey(def.name, def.version);
    if (this.nameIdx.has(key)) {
      err = `Capability already registered: ${key}`;
      this._log("REGISTER", id, Date.now() - t0, "FAILED", err);
      this.errorCount++;
      throw new Error(`CapabilityRegistry.register: ${err}`);
    }

    const now = Date.now();
    const descriptor: CapabilityDescriptor = Object.freeze({
      id,
      name:         def.name,
      version:      def.version,
      category:     def.category,
      description:  def.description,
      inputSchema:  Object.freeze({ ...def.inputSchema }),
      outputSchema: Object.freeze({ ...def.outputSchema }),
      permissions:  Object.freeze([...(def.permissions ?? ["EXECUTE"])]),
      status:       def.status       ?? "ACTIVE",
      tags:         Object.freeze([...(def.tags         ?? [])]),
      owner:        def.owner        ?? "system",
      scope:        def.scope        ?? "PUBLIC",
      visibility:   def.visibility   ?? "VISIBLE",
      createdAt:    now,
      updatedAt:    now,
    });

    this.store.set(id, descriptor);
    this.nameIdx.set(key, id);
    this.registerCount++;
    this._log("REGISTER", id, Date.now() - t0, "SUCCESS", null);
    return descriptor;
  }

  // ── unregister ──────────────────────────────────────────────────────────────

  unregister(id: CapabilityId): boolean {
    const t0 = Date.now();
    const desc = this.store.get(id);
    if (!desc) {
      this._log("UNREGISTER", id, Date.now() - t0, "FAILED", "not found");
      this.errorCount++;
      throw new Error(`CapabilityRegistry.unregister: not found: ${id}`);
    }
    const key = compositeKey(desc.name, desc.version);
    this.store.delete(id);
    this.nameIdx.delete(key);
    this.unregisterCount++;
    this._log("UNREGISTER", id, Date.now() - t0, "SUCCESS", null);
    return true;
  }

  // ── update ──────────────────────────────────────────────────────────────────

  update(id: CapabilityId, patch: Partial<Pick<CapabilityDefinition, "description" | "tags" | "status" | "owner" | "scope" | "visibility" | "permissions">>): CapabilityDescriptor {
    const t0 = Date.now();
    const existing = this.store.get(id);
    if (!existing) {
      this._log("UPDATE", id, Date.now() - t0, "FAILED", "not found");
      this.errorCount++;
      throw new Error(`CapabilityRegistry.update: not found: ${id}`);
    }

    const updated: CapabilityDescriptor = Object.freeze({
      ...existing,
      description: patch.description ?? existing.description,
      tags:        patch.tags        ? Object.freeze([...patch.tags]) : existing.tags,
      status:      patch.status      ?? existing.status,
      owner:       patch.owner       ?? existing.owner,
      scope:       patch.scope       ?? existing.scope,
      visibility:  patch.visibility  ?? existing.visibility,
      permissions: patch.permissions ? Object.freeze([...patch.permissions]) : existing.permissions,
      updatedAt:   Date.now(),
    });

    this.store.set(id, updated);
    this.updateCount++;
    this._log("UPDATE", id, Date.now() - t0, "SUCCESS", null);
    return updated;
  }

  // ── resolve ─────────────────────────────────────────────────────────────────

  resolve(idOrName: CapabilityId | CapabilityName, version?: CapabilityVersion): CapabilityDescriptor | null {
    const t0 = Date.now();
    this.resolveCount++;
    let result: CapabilityDescriptor | null = null;

    // Try direct id lookup first
    if (this.store.has(idOrName)) {
      result = this.store.get(idOrName) ?? null;
    } else if (version) {
      // name + version lookup
      const key = compositeKey(idOrName, version);
      const id  = this.nameIdx.get(key);
      result    = id ? (this.store.get(id) ?? null) : null;
    } else {
      // Latest active version by name
      result = this._resolveLatestByName(idOrName);
    }

    this.totalResolveMs += Date.now() - t0;
    this._log("RESOLVE", idOrName, Date.now() - t0, result ? "SUCCESS" : "FAILED", result ? null : "not found");
    return result;
  }

  resolveByCategory(category: CapabilityCategory): readonly CapabilityDescriptor[] {
    return Object.freeze(this.listByCategory(category));
  }

  resolveByTag(tag: CapabilityTag): readonly CapabilityDescriptor[] {
    return Object.freeze(this.listByTag(tag));
  }

  // ── exists ──────────────────────────────────────────────────────────────────

  exists(id: CapabilityId): boolean {
    return this.store.has(id);
  }

  // ── list ────────────────────────────────────────────────────────────────────

  list(): readonly CapabilityDescriptor[] {
    return Object.freeze(Array.from(this.store.values()));
  }

  listByCategory(category: CapabilityCategory): readonly CapabilityDescriptor[] {
    return Object.freeze(Array.from(this.store.values()).filter(d => d.category === category));
  }

  listByScope(scope: string): readonly CapabilityDescriptor[] {
    return Object.freeze(Array.from(this.store.values()).filter(d => d.scope === scope));
  }

  listByTag(tag: CapabilityTag): readonly CapabilityDescriptor[] {
    return Object.freeze(Array.from(this.store.values()).filter(d => d.tags.includes(tag)));
  }

  // ── validate ────────────────────────────────────────────────────────────────

  validate(def: CapabilityDefinition): { valid: boolean; errors: string[] } {
    const t0 = Date.now();
    this.validationCount++;
    const errors: string[] = [];

    const err = this._validateDefinition(def);
    if (err) errors.push(err);

    this.totalValidMs += Date.now() - t0;
    this._log("VALIDATE", def.name ?? "unknown", Date.now() - t0, errors.length === 0 ? "SUCCESS" : "FAILED", errors[0] ?? null);
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) }) as { valid: boolean; errors: string[] };
  }

  // ── statistics ──────────────────────────────────────────────────────────────

  statistics(): CapabilityStatistics {
    const all = Array.from(this.store.values());
    const cats: Record<string, number> = {};
    for (const c of VALID_CATEGORIES) cats[c] = 0;
    const owners = new Set<string>();
    const versionSet = new Set<string>();

    for (const d of all) {
      cats[d.category] = (cats[d.category] ?? 0) + 1;
      owners.add(d.owner);
      versionSet.add(d.version);
    }

    return Object.freeze({
      totalCapabilities:    all.length,
      activeCapabilities:   all.filter(d => d.status === "ACTIVE").length,
      inactiveCapabilities: all.filter(d => d.status === "INACTIVE").length,
      deprecatedCapabilities: all.filter(d => d.status === "DEPRECATED").length,
      draftCapabilities:    all.filter(d => d.status === "DRAFT").length,
      categories:           Object.freeze(cats) as any,
      versions:             versionSet.size,
      owners:               owners.size,
      registrations:        this.registerCount,
      updates:              this.updateCount,
      removals:             this.unregisterCount,
    });
  }

  // ── metrics ─────────────────────────────────────────────────────────────────

  metrics(): CapabilityMetrics {
    return Object.freeze({
      registerTotal:     this.registerCount,
      resolveTotal:      this.resolveCount,
      validationTotal:   this.validationCount,
      errorTotal:        this.errorCount,
      avgResolveTime:    this.resolveCount > 0 ? Math.round(this.totalResolveMs / this.resolveCount) : 0,
      avgValidationTime: this.validationCount > 0 ? Math.round(this.totalValidMs / this.validationCount) : 0,
      unregisterTotal:   this.unregisterCount,
      updateTotal:       this.updateCount,
    });
  }

  // ── health ──────────────────────────────────────────────────────────────────

  health(): CapabilityHealth {
    const all = Array.from(this.store.values());

    // registryIntegrity: nameIdx count matches store count
    const registryIntegrity = this.nameIdx.size === this.store.size;

    // descriptorIntegrity: all descriptors have required fields
    const descriptorIntegrity = all.every(d =>
      d.id && d.name && d.version && d.category && d.description
    );

    // versionIntegrity: all versions are semver-like
    const versionIntegrity = all.every(d => semverValid(d.version));

    // contractIntegrity: all descriptors have inputSchema + outputSchema
    const contractIntegrity = all.every(d => d.inputSchema && d.outputSchema);

    // consistencyCheck: no orphan entries in nameIdx
    let consistencyCheck = true;
    for (const [, id] of this.nameIdx) {
      if (!this.store.has(id)) { consistencyCheck = false; break; }
    }

    const allOk = registryIntegrity && descriptorIntegrity && versionIntegrity && contractIntegrity && consistencyCheck;
    const status = allOk ? "SUCCESS" : "DEGRADED";

    return Object.freeze({
      status,
      details: `capabilities=${all.length} registered=${this.registerCount} resolved=${this.resolveCount} errors=${this.errorCount}`,
      checks: Object.freeze({
        registryIntegrity,
        descriptorIntegrity,
        versionIntegrity,
        contractIntegrity,
        consistencyCheck,
      }),
    });
  }

  // ── logs ────────────────────────────────────────────────────────────────────

  logs(): readonly CapabilityLog[] {
    return Object.freeze([...this.logs_arr]);
  }

  // ── clear ───────────────────────────────────────────────────────────────────

  clear(): void {
    const t0 = Date.now();
    this.store.clear();
    this.nameIdx.clear();
    this.registerCount   = 0;
    this.resolveCount    = 0;
    this.validationCount = 0;
    this.errorCount      = 0;
    this.unregisterCount = 0;
    this.updateCount     = 0;
    this.totalResolveMs  = 0;
    this.totalValidMs    = 0;
    this.logs_arr.length = 0;
    this._log("CLEAR", "all", Date.now() - t0, "SUCCESS", null);
  }

  // ── private helpers ─────────────────────────────────────────────────────────

  private _validateDefinition(def: CapabilityDefinition): string | null {
    if (!def)                        return "definition is required";
    if (!def.name?.trim())           return "name is required";
    if (!def.version?.trim())        return "version is required";
    if (!semverValid(def.version))   return `invalid version format: ${def.version}`;
    if (!def.category)               return "category is required";
    if (!VALID_CATEGORIES.includes(def.category)) return `invalid category: ${def.category}`;
    if (!def.description?.trim())    return "description is required";
    if (!def.inputSchema)            return "inputSchema is required";
    if (!def.outputSchema)           return "outputSchema is required";
    return null;
  }

  private _resolveLatestByName(name: CapabilityName): CapabilityDescriptor | null {
    const candidates = Array.from(this.store.values()).filter(d => d.name === name);
    if (candidates.length === 0) return null;
    // Prefer ACTIVE, then latest by updatedAt
    const active = candidates.filter(d => d.status === "ACTIVE");
    const pool   = active.length > 0 ? active : candidates;
    return pool.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  }

  private _log(
    operation: CapabilityLogOperation,
    capabilityId: string,
    durationMs: number,
    status: "SUCCESS" | "FAILED",
    error: string | null,
  ): void {
    this.logs_arr.push(Object.freeze({
      executionId:  uuid(),
      operation,
      capabilityId,
      timestamp:    Date.now(),
      durationMs,
      status,
      error,
    }));
  }
}