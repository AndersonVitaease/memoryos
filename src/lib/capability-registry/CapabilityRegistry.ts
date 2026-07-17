/**
 * CapabilityRegistry.ts — Sprint C-03.6.1
 * Única fonte oficial de descoberta de Capabilities do MemoryOS.
 *
 * Responsabilidades:
 *   register / unregister / findById / findAll
 *   findByGoalType / findByCategory / findByAction
 *   findByStatus / findByRuntime / exists / count / clear
 *
 * Proibido:
 *   - Executar Capabilities
 *   - Selecionar Capabilities
 *   - Conhecer Connectors ou Runtime
 *   - Utilizar IA / LLM / Embeddings
 */

import type {
  RegisteredCapability,
  CapabilityDiscoveryResult,
  RegistrationResult,
  RegistryHealth,
  RegistryHealthStatus,
} from "./CapabilityRegistryTypes";
import type { CapabilityDescriptor } from "@/lib/capability-selection/CapabilitySelectionTypes";
import { CapabilityRegistryTelemetry } from "./CapabilityRegistryTelemetry";
import { CRTelemetry }                from "./CapabilityRegistryTelemetry";

export class CapabilityRegistry {
  /** id → RegisteredCapability */
  private readonly _store: Map<string, Readonly<RegisteredCapability>> = new Map();
  private readonly _tel:   CapabilityRegistryTelemetry;
  private _lookups    = 0;
  private _discoveries = 0;
  private _errors     = 0;
  private _queryMs:   number[] = [];

  constructor(telemetry?: CapabilityRegistryTelemetry) {
    this._tel = telemetry ?? CRTelemetry;
  }

  // ── register() ───────────────────────────────────────────────────────────────

  register(descriptor: CapabilityDescriptor, version = "1.0.0"): RegistrationResult {
    // Validate
    const validationError = this._validate(descriptor);
    if (validationError) {
      this._errors++;
      this._tel.emit({ type: "InvalidDescriptorRejected", capabilityId: descriptor?.id, detail: validationError, timestamp: Date.now() });
      return Object.freeze({ success: false, reason: "INVALID_DESCRIPTOR", message: validationError });
    }

    // Duplicate ID check
    if (this._store.has(descriptor.id)) {
      this._errors++;
      this._tel.emit({ type: "DuplicateRegistrationRejected", capabilityId: descriptor.id, detail: `ID "${descriptor.id}" already registered`, timestamp: Date.now() });
      return Object.freeze({ success: false, reason: "DUPLICATE_ID", message: `Capability ID "${descriptor.id}" is already registered.` });
    }

    const entry: Readonly<RegisteredCapability> = Object.freeze({
      descriptor: Object.freeze(descriptor),
      registeredAt: Date.now(),
      version,
    });

    this._store.set(descriptor.id, entry);

    this._tel.emit({
      type:          "CapabilityRegistered",
      capabilityId:  descriptor.id,
      detail:        `"${descriptor.name}" v${version} registered — goalTypes: [${descriptor.goalTypes.join(",")}]`,
      timestamp:     Date.now(),
    });

    return Object.freeze({ success: true, capability: entry });
  }

  // ── unregister() ─────────────────────────────────────────────────────────────

  unregister(id: string): boolean {
    const existing = this._store.get(id);
    if (!existing) return false;

    this._store.delete(id);
    this._tel.emit({ type: "CapabilityRemoved", capabilityId: id, detail: `"${existing.descriptor.name}" removed`, timestamp: Date.now() });
    return true;
  }

  // ── findById() ────────────────────────────────────────────────────────────────

  findById(id: string): Readonly<RegisteredCapability> | null {
    const t0 = Date.now();
    this._lookups++;
    const result = this._store.get(id) ?? null;
    const ms = Date.now() - t0;
    this._queryMs.push(ms);
    this._tel.emit({ type: "CapabilityLookup", capabilityId: id, count: result ? 1 : 0, durationMs: ms, detail: result ? "found" : "not found", timestamp: Date.now() });
    this._tel.recordQuery(ms);
    return result;
  }

  // ── findAll() ─────────────────────────────────────────────────────────────────

  findAll(): readonly Readonly<RegisteredCapability>[] {
    const t0   = Date.now();
    const list = Object.freeze([...this._store.values()]);
    const ms   = Date.now() - t0;
    this._discoveries++;
    this._tel.emit({ type: "CapabilityDiscovery", criterion: "all", count: list.length, durationMs: ms, detail: list.map(c => c.descriptor.id).join(", "), timestamp: Date.now() });
    this._tel.recordQuery(ms);
    return list;
  }

  // ── findByGoalType() ──────────────────────────────────────────────────────────

  findByGoalType(goalType: string): CapabilityDiscoveryResult {
    return this._discover(
      "goalType", goalType,
      cap => cap.descriptor.goalTypes.length === 0 || cap.descriptor.goalTypes.includes(goalType),
    );
  }

  // ── findByCategory() ──────────────────────────────────────────────────────────

  findByCategory(category: string): CapabilityDiscoveryResult {
    return this._discover(
      "category", category,
      cap => cap.descriptor.supportedCategories.length === 0 || cap.descriptor.supportedCategories.includes(category),
    );
  }

  // ── findByAction() ────────────────────────────────────────────────────────────

  findByAction(action: string): CapabilityDiscoveryResult {
    return this._discover(
      "action", action,
      cap => cap.descriptor.supportedActions.length === 0 || cap.descriptor.supportedActions.includes(action),
    );
  }

  // ── findByStatus() ────────────────────────────────────────────────────────────

  findByStatus(status: CapabilityDescriptor["status"]): CapabilityDiscoveryResult {
    return this._discover(
      "status", status,
      cap => cap.descriptor.status === status,
    );
  }

  // ── findByRuntime() ───────────────────────────────────────────────────────────

  findByRuntime(runtime: string): CapabilityDiscoveryResult {
    return this._discover(
      "runtime", runtime,
      cap => cap.descriptor.requiredRuntimes.length === 0 || cap.descriptor.requiredRuntimes.includes(runtime),
    );
  }

  // ── exists() ──────────────────────────────────────────────────────────────────

  exists(id: string): boolean {
    return this._store.has(id);
  }

  // ── count() ───────────────────────────────────────────────────────────────────

  count(): number {
    return this._store.size;
  }

  // ── clear() ───────────────────────────────────────────────────────────────────

  clear(): void {
    const n = this._store.size;
    this._store.clear();
    this._tel.emit({ type: "RegistryCleared", count: n, detail: `Registry cleared — ${n} capabilities removed`, timestamp: Date.now() });
  }

  // ── health() ──────────────────────────────────────────────────────────────────

  health(): Readonly<RegistryHealth> {
    const avg = this._queryMs.length > 0
      ? parseFloat((this._queryMs.reduce((a, b) => a + b, 0) / this._queryMs.length).toFixed(2))
      : 0;
    const status: RegistryHealthStatus =
      this._errors === 0 ? "READY"
      : this._errors < 5  ? "DEGRADED"
      : "FAILED";
    return Object.freeze({
      status,
      registeredCount:  this._store.size,
      totalLookups:     this._lookups,
      totalDiscoveries: this._discoveries,
      totalErrors:      this._errors,
      avgQueryMs:       avg,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _discover(
    criterion:      string,
    criterionValue: string,
    predicate:      (cap: Readonly<RegisteredCapability>) => boolean,
  ): CapabilityDiscoveryResult {
    const t0    = Date.now();
    const found = Object.freeze([...this._store.values()].filter(predicate));
    const ms    = Date.now() - t0;
    this._discoveries++;
    const ids = found.map(c => c.descriptor.id).join(", ");

    const explanation = [
      `Discovery criterion: ${criterion}="${criterionValue}"`,
      `Capabilities evaluated: ${this._store.size}`,
      `Capabilities found: ${found.length}`,
      found.length > 0 ? `Found IDs: [${ids}]` : "No capabilities matched the criterion.",
      `Duration: ${ms}ms`,
    ].join("\n");

    this._tel.emit({
      type:          "CapabilityDiscovery",
      criterion,
      count:         found.length,
      durationMs:    ms,
      detail:        `${criterion}="${criterionValue}" → ${found.length} found: [${ids}]`,
      timestamp:     Date.now(),
    });
    this._tel.recordQuery(ms);

    return Object.freeze({ found, count: found.length, criterion, criterionValue, durationMs: ms, explanation });
  }

  private _validate(descriptor: CapabilityDescriptor): string | null {
    if (!descriptor)           return "Descriptor is null or undefined";
    if (!descriptor.id?.trim())   return "Descriptor.id is required";
    if (!descriptor.name?.trim()) return "Descriptor.name is required";
    if (!Array.isArray(descriptor.goalTypes))          return "Descriptor.goalTypes must be an array";
    if (!Array.isArray(descriptor.supportedActions))   return "Descriptor.supportedActions must be an array";
    if (!Array.isArray(descriptor.supportedCategories)) return "Descriptor.supportedCategories must be an array";
    if (typeof descriptor.priority !== "number")       return "Descriptor.priority must be a number";
    if (typeof descriptor.confidenceWeight !== "number") return "Descriptor.confidenceWeight must be a number";
    if (descriptor.confidenceWeight < 0 || descriptor.confidenceWeight > 1) return "Descriptor.confidenceWeight must be between 0 and 1";
    if (!descriptor.status) return "Descriptor.status is required";
    return null;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const _KEY = "__CAPABILITY_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilityRegistry();
}
export const capabilityRegistry: CapabilityRegistry = (
  globalThis as unknown as Record<string, CapabilityRegistry>
)[_KEY];