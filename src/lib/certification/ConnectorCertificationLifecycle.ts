/**
 * ConnectorCertificationLifecycle.ts — Engineering Sprint E-03.3
 * Orchestrates the full certification lifecycle for a connector.
 * Single entry point for all certification operations.
 *
 * Zero alteracoes em: Runtime, Planning, GoalEngine, ConversationPipeline,
 * ConnectorRegistry, GmailConnector, SmartQueryBuilder, SmartQueryExecutor.
 */

import type {
  ConnectorCertificationRecord,
  CertificationState,
  InvalidationTrigger,
  CertificationEvidence,
} from "./CCCTypes";
import { certStateMachine }  from "./ConnectorCertificationStateMachine";
import { certHistory }       from "./ConnectorCertificationHistory";
import { evidenceStore }     from "./ConnectorCertificationEvidenceStore";
import { policyEngine }      from "./ConnectorCertificationPolicyEngine";
import { versionRegistry, buildVersion, bumpVersion } from "./ConnectorCertificationVersioning";

// ── Connector registry (in-memory, reset per session) ────────────────────────

const STORAGE_KEY = "memoryos_cert_records_v1";

function _loadRecords(): Record<string, ConnectorCertificationRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveRecords(data: Record<string, ConnectorCertificationRecord>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* non-blocking */ }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

class CertificationLifecycle {

  // ── Registration ────────────────────────────────────────────────────────────

  registerConnector(
    connectorId: string,
    displayName: string,
    initialVersion = "1.0.0",
  ): ConnectorCertificationRecord {
    const all = _loadRecords();
    if (all[connectorId]) return all[connectorId];

    const record: ConnectorCertificationRecord = {
      connectorId,
      displayName,
      currentVersion:  initialVersion,
      currentState:    "draft",
      lastCertRunId:   null,
      lastCertAt:      null,
      lastPassedAt:    null,
      nextRequiredBy:  null,
      invalidatedBy:   null,
      invalidatedAt:   null,
      history:         [],
      createdAt:       Date.now(),
      updatedAt:       Date.now(),
    };

    all[connectorId] = record;
    _saveRecords(all);
    return record;
  }

  getRecord(connectorId: string): ConnectorCertificationRecord | null {
    const all = _loadRecords();
    return all[connectorId] ?? null;
  }

  listRecords(): ConnectorCertificationRecord[] {
    return Object.values(_loadRecords());
  }

  // ── State transitions ────────────────────────────────────────────────────────

  transition(connectorId: string, next: CertificationState): { ok: boolean; reason: string } {
    const all    = _loadRecords();
    const record = all[connectorId];
    if (!record) return { ok: false, reason: `Connector "${connectorId}" not registered` };

    const result = certStateMachine.transition(record.currentState, next);
    if (!result.ok) return { ok: false, reason: result.reason };

    record.currentState = next;
    record.updatedAt    = Date.now();
    all[connectorId]    = record;
    _saveRecords(all);
    return { ok: true, reason: result.reason };
  }

  // ── Invalidation ─────────────────────────────────────────────────────────────

  invalidate(connectorId: string, trigger: InvalidationTrigger): { ok: boolean; reason: string } {
    const all    = _loadRecords();
    const record = all[connectorId];
    if (!record) return { ok: false, reason: `Connector "${connectorId}" not registered` };

    const result = certStateMachine.invalidate(record.currentState, trigger);
    if (!result.ok) return { ok: false, reason: result.reason };

    record.currentState  = "certification_required";
    record.invalidatedBy  = trigger;
    record.invalidatedAt  = Date.now();
    record.updatedAt      = Date.now();
    all[connectorId]      = record;
    _saveRecords(all);
    return { ok: true, reason: result.reason };
  }

  // ── Version bump + automatic invalidation ────────────────────────────────────

  bumpConnectorVersion(
    connectorId: string,
    changedFiles: string[],
    type: "patch" | "minor" | "major" = "patch",
    author = "system",
    changelog = "",
  ): { version: string; invalidated: boolean; trigger: InvalidationTrigger | null } {
    const all    = _loadRecords();
    const record = all[connectorId];
    if (!record) return { version: "0.0.0", invalidated: false, trigger: null };

    const newVersion = bumpVersion(record.currentVersion, type);
    const versionObj = buildVersion(connectorId, newVersion, changedFiles, author, changelog);
    versionRegistry.record(versionObj);

    record.currentVersion = newVersion;
    record.updatedAt      = Date.now();

    // Auto-invalidate if relevant files changed
    const triggers = changedFiles
      .map((f) => {
        // Inline file-to-trigger map (mirrors ConnectorCertificationVersioning)
        const FILE_TRIGGER_MAP: Array<[RegExp, InvalidationTrigger]> = [
          [/GmailConnector\.(ts|js)$/,        "connector_changed"],
          [/EmailAliasRegistry\.ts$/,         "alias_registry_changed"],
          [/DomainRegistry\.ts$/,             "domain_registry_changed"],
          [/SmartQueryBuilder\.ts$/,          "query_builder_changed"],
          [/SmartQueryExecutor\.ts$/,         "query_executor_changed"],
          [/SmartQueryTypes\.ts$/,            "config_changed"],
          [/SemanticEmailQueryBuilder\.ts$/,  "query_builder_changed"],
          [/GmailActions\.(ts|js)$/,          "connector_changed"],
          [/Capability\.(ts|js)$/,            "capability_changed"],
          [/config\.(ts|js|json)$/,           "config_changed"],
        ];
        for (const [pat, t] of FILE_TRIGGER_MAP) {
          if (pat.test(f)) return t;
        }
        return null;
      })
      .filter(Boolean) as InvalidationTrigger[];

    let invalidated = false;
    let trigger: InvalidationTrigger | null = null;

    if (triggers.length > 0) {
      trigger = triggers[0];
      const inv = certStateMachine.invalidate(record.currentState, trigger);
      if (inv.ok) {
        record.currentState  = "certification_required";
        record.invalidatedBy  = trigger;
        record.invalidatedAt  = Date.now();
        invalidated = true;
      }
    }

    all[connectorId] = record;
    _saveRecords(all);
    return { version: newVersion, invalidated, trigger };
  }

  // ── Run certification ────────────────────────────────────────────────────────

  startCertification(connectorId: string, author = "system"): string | null {
    const tr = this.transition(connectorId, "certification_running");
    if (!tr.ok) return null;

    const all    = _loadRecords();
    const record = all[connectorId];
    const run    = certHistory.startRun(connectorId, record.currentVersion, `build-${Date.now()}`, author);

    record.lastCertRunId = run.runId;
    record.updatedAt     = Date.now();
    all[connectorId]     = record;
    _saveRecords(all);
    return run.runId;
  }

  completeCertification(
    connectorId: string,
    runId: string,
    evidence: CertificationEvidence,
  ): { passed: boolean; failures: string[] } {
    const { passed, failures } = policyEngine.evaluate(connectorId, evidence);

    certHistory.completeRun(runId, connectorId, passed, evidence, failures);
    evidenceStore.save(connectorId, runId, evidence);

    const all    = _loadRecords();
    const record = all[connectorId];
    if (record) {
      record.currentState = passed ? "certification_passed" : "certification_failed";
      record.lastCertAt   = Date.now();
      if (passed) {
        record.lastPassedAt    = Date.now();
        const policy           = policyEngine.get(connectorId);
        record.nextRequiredBy  = Date.now() + policy.maxCertAgeMs;
        record.invalidatedBy   = null;
        record.invalidatedAt   = null;
      }
      record.updatedAt = Date.now();
      all[connectorId] = record;
      _saveRecords(all);
    }

    return { passed, failures };
  }

  // ── Expiry check ──────────────────────────────────────────────────────────────

  checkExpiry(connectorId: string): boolean {
    const record  = this.getRecord(connectorId);
    if (!record) return false;
    const expired = policyEngine.isCertExpired(connectorId, record.lastPassedAt);
    if (expired && record.currentState === "production_ready") {
      this.invalidate(connectorId, "cert_expired");
      return true;
    }
    return false;
  }

  // ── Quality gate ──────────────────────────────────────────────────────────────

  qualityGate(connectorId: string): { allowed: boolean; reason: string } {
    const record = this.getRecord(connectorId);
    if (!record) return { allowed: false, reason: "Connector not registered" };
    return policyEngine.canPromote(connectorId, record.currentState);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────────

  resetConnector(connectorId: string): void {
    const all = _loadRecords();
    delete all[connectorId];
    _saveRecords(all);
    certHistory.clearHistory(connectorId);
  }
}

const _LK = "__CERT_LIFECYCLE__";
if (!(globalThis as unknown as Record<string, unknown>)[_LK]) {
  (globalThis as unknown as Record<string, unknown>)[_LK] = new CertificationLifecycle();
}
export const certLifecycle: CertificationLifecycle = (
  globalThis as unknown as Record<string, CertificationLifecycle>
)[_LK];

// ── Bootstrap known connectors ────────────────────────────────────────────────

const KNOWN_CONNECTORS: Array<[string, string, string]> = [
  ["gmail",    "Gmail",           "1.0.0"],
  ["drive",    "Google Drive",    "1.0.0"],
  ["calendar", "Google Calendar", "1.0.0"],
  ["github",   "GitHub",          "1.0.0"],
  ["slack",    "Slack",           "1.0.0"],
];

KNOWN_CONNECTORS.forEach(([id, name, v]) => {
  certLifecycle.registerConnector(id, name, v);
});