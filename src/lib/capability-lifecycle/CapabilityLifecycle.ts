/**
 * CapabilityLifecycle.ts — Engineering Sprint 7.0.2
 * Central orchestrator for Universal Capability Lifecycle.
 * Single entry point for registration, transition, execution, and metrics.
 *
 * Zero alterations to: Runtime, Planning, ConversationPipeline, GoalEngine,
 * ConnectorRuntime, UniversalConnectorRouter, ConnectorRegistry.
 */

import type { CapabilityRecord, CapabilityState } from "./CapabilityLifecycleTypes";
import { capStateMachine }    from "./CapabilityStateMachine";
import { evaluatePolicy, qualityGate, computeMetrics } from "./CapabilityPolicies";
import { capabilityAudit }    from "./CapabilityAudit";
import { bumpCapabilityVersion } from "./CapabilityVersioning";

const STORAGE_KEY = "cap_lifecycle_records_v1";

function _load(): Record<string, CapabilityRecord> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
function _save(data: Record<string, CapabilityRecord>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* non-blocking */ }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

class CapabilityLifecycleClass {

  register(partial: Omit<CapabilityRecord, "executionCount" | "successCount" | "failureCount" | "totalLatencyMs" | "createdAt" | "updatedAt">): CapabilityRecord {
    const all = _load();
    if (all[partial.id]) return all[partial.id]; // idempotent

    const record: CapabilityRecord = {
      ...partial,
      executionCount: 0,
      successCount:   0,
      failureCount:   0,
      totalLatencyMs: 0,
      createdAt:      Date.now(),
      updatedAt:      Date.now(),
    };
    all[partial.id] = record;
    _save(all);
    return record;
  }

  get(id: string): CapabilityRecord | null {
    return _load()[id] ?? null;
  }

  list(): CapabilityRecord[] {
    return Object.values(_load());
  }

  forService(serviceId: string): CapabilityRecord[] {
    return this.list().filter((r) => r.serviceId === serviceId);
  }

  // ── State transitions ────────────────────────────────────────────────────────

  transition(id: string, next: CapabilityState): { ok: boolean; reason: string } {
    const all    = _load();
    const record = all[id];
    if (!record) return { ok: false, reason: `Capability "${id}" not registered` };

    const result = capStateMachine.transition(record.state, next);
    if (!result.ok) return { ok: false, reason: result.reason };

    record.state     = next;
    record.updatedAt = Date.now();
    if (next === "certified") record.lastCertification = Date.now();
    if (next === "deprecated") record.deprecatedIn = record.deprecatedIn ?? record.version;
    all[id] = record;
    _save(all);
    return { ok: true, reason: result.reason };
  }

  // ── Execution with policy gate ────────────────────────────────────────────────

  async execute<T>(
    id: string,
    executedBy: string,
    fn: () => Promise<T & { success?: boolean; ok?: boolean; error?: string | null }>,
    env: "dev" | "prod" = "prod",
  ): Promise<{ result: T | null; blocked: boolean; reason: string; warning: string | null }> {
    const record = this.get(id);
    if (!record) return { result: null, blocked: true, reason: `Capability "${id}" not registered`, warning: null };

    const policy = evaluatePolicy(record, env);
    if (!policy.allowed) return { result: null, blocked: true, reason: policy.reason, warning: null };

    const start = Date.now();
    try {
      const result = await capabilityAudit.wrap(id, record.serviceId, record.version, record.state, executedBy, fn);
      const durationMs = Date.now() - start;
      this._updateMetrics(id, true, durationMs);
      return { result: result as T, blocked: false, reason: policy.reason, warning: policy.warning };
    } catch (e) {
      this._updateMetrics(id, false, Date.now() - start);
      throw e;
    }
  }

  private _updateMetrics(id: string, success: boolean, durationMs: number): void {
    const all    = _load();
    const record = all[id];
    if (!record) return;
    record.executionCount++;
    if (success) record.successCount++; else record.failureCount++;
    record.totalLatencyMs += durationMs;
    record.lastExecution   = Date.now();
    record.updatedAt       = Date.now();
    all[id] = record;
    _save(all);
  }

  // ── Version bump ──────────────────────────────────────────────────────────────

  bumpVersion(id: string, type: "patch" | "minor" | "major"): string | null {
    const all    = _load();
    const record = all[id];
    if (!record) return null;
    record.version   = bumpCapabilityVersion(record.version, type);
    record.updatedAt = Date.now();
    all[id]          = record;
    _save(all);
    return record.version;
  }

  // ── Certification ────────────────────────────────────────────────────────────

  certify(id: string): { ok: boolean; reason: string } {
    const all    = _load();
    const record = all[id];
    if (!record) return { ok: false, reason: "Not registered" };
    record.certified          = true;
    record.lastCertification  = Date.now();
    record.updatedAt          = Date.now();
    all[id] = record;
    _save(all);
    return { ok: true, reason: `Capability "${id}" certified` };
  }

  // ── Metrics ───────────────────────────────────────────────────────────────────

  metrics(id: string) {
    const record = this.get(id);
    if (!record) return null;
    return computeMetrics(record);
  }

  qualityGate(id: string) {
    const record = this.get(id);
    if (!record) return { pass: false, failures: ["Not registered"] };
    return qualityGate(record);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────────

  reset(id: string): void {
    const all = _load();
    delete all[id];
    _save(all);
  }
}

const _KEY = "__CAP_LIFECYCLE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilityLifecycleClass();
}
export const capLifecycle: CapabilityLifecycleClass = (
  globalThis as unknown as Record<string, CapabilityLifecycleClass>
)[_KEY];

// ── Bootstrap: Gmail capabilities ─────────────────────────────────────────────

import { SCOPES } from "@/lib/google-workspace/GoogleWorkspaceScopes";

const GMAIL_CAPS: Array<Omit<CapabilityRecord, "executionCount"|"successCount"|"failureCount"|"totalLatencyMs"|"createdAt"|"updatedAt">> = [
  { id: "gmail.readInbox",    serviceId: "gmail", name: "Read Inbox",    description: "Lista ultimas mensagens", owner: "MemoryOS", documentation: "/phase711", version: "1.0.0", state: "production",  requiredScopes: [SCOPES.GMAIL_READONLY],  introducedIn: "E-02.5", deprecatedIn: null, lastCertification: Date.now() - 1000, certified: true,  dependencies: [], lastExecution: null },
  { id: "gmail.searchEmails", serviceId: "gmail", name: "Search Emails", description: "Pesquisa com SmartQuery", owner: "MemoryOS", documentation: "/phase711", version: "1.0.0", state: "production",  requiredScopes: [SCOPES.GMAIL_READONLY],  introducedIn: "E-02.9", deprecatedIn: null, lastCertification: Date.now() - 1000, certified: true,  dependencies: ["gmail.readInbox"], lastExecution: null },
  { id: "gmail.readMessage",  serviceId: "gmail", name: "Read Message",  description: "Le mensagem pelo ID",    owner: "MemoryOS", documentation: "/phase711", version: "1.0.0", state: "production",  requiredScopes: [SCOPES.GMAIL_READONLY],  introducedIn: "E-02.5", deprecatedIn: null, lastCertification: Date.now() - 1000, certified: true,  dependencies: [], lastExecution: null },
  { id: "gmail.listLabels",   serviceId: "gmail", name: "List Labels",   description: "Lista todas as labels",  owner: "MemoryOS", documentation: "/phase711", version: "1.0.0", state: "certified",   requiredScopes: [SCOPES.GMAIL_READONLY],  introducedIn: "E-02.5", deprecatedIn: null, lastCertification: Date.now() - 1000, certified: true,  dependencies: [], lastExecution: null },
  { id: "gmail.createDraft",  serviceId: "gmail", name: "Create Draft",  description: "Cria rascunho",          owner: "MemoryOS", documentation: "/phase711", version: "1.0.0", state: "beta",        requiredScopes: [SCOPES.GMAIL_COMPOSE],  introducedIn: "E-02.5", deprecatedIn: null, lastCertification: null,              certified: false, dependencies: [], lastExecution: null },
  { id: "gmail.sendEmail",    serviceId: "gmail", name: "Send Email",    description: "Envia email",            owner: "MemoryOS", documentation: "/phase711", version: "1.0.0", state: "beta",        requiredScopes: [SCOPES.GMAIL_SEND],     introducedIn: "E-02.5", deprecatedIn: null, lastCertification: null,              certified: false, dependencies: [], lastExecution: null },
];

GMAIL_CAPS.forEach((c) => capLifecycle.register(c));