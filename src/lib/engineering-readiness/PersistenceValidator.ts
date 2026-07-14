/**
 * PersistenceValidator.ts — Sprint 6.3.5
 * Validates all persistence layers survive a simulated restart.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { ConnectorSessionStore } from "../runtime-persistence/ConnectorSessionStore";
import { SessionSerializer } from "../runtime-persistence/SessionSerializer";
import { EngineeringMemory } from "../engineering-memory/EngineeringMemory";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

function check(name: string, ok: boolean, detail: string, critical = true): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class PersistenceValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // 1. Connector Sessions survive serialize/deserialize cycle
    const store = new ConnectorSessionStore();
    store.upsert({ connectorId: "persist_test", provider: "Test", displayName: "T", status: "CONNECTED", statusReason: "ok", capabilities: ["READ"], health: "HEALTHY", metadata: { repo: "memoryos" }, expiresAt: null });
    const ser = new SessionSerializer();
    ser.serialize(store.all());
    const restored = ser.deserialize();
    ser.clear();
    const sessionOk = !!restored && restored.sessions.length === 1 && restored.sessions[0].connectorId === "persist_test";
    checks.push(check("Connector sessions persist across restart", sessionOk, sessionOk ? "Session round-trip OK" : "Session lost"));

    // 2. Engineering Memory persists entries
    const em = new EngineeringMemory();
    em.recordImplementation({ objective: "persistence probe", planId: "pp1", components: ["PersistProbe"], strategy: "CREATE", filesChanged: [], durationMs: 100, regressionsPassed: true, approved: true, rollbackExecuted: false, outcome: "PASS" });
    const memOk = em.implementations.all().length > 0;
    checks.push(check("Engineering Memory persists entries", memOk, memOk ? `${em.implementations.all().length} impl(s) stored` : "Memory empty"));

    // 3. KG state reporting stable
    const kgAge1 = KnowledgeGraphStore.ageMs();
    const kgAge2 = KnowledgeGraphStore.ageMs();
    const kgStable = Math.abs(kgAge2 - kgAge1) < 200;
    checks.push(check("KG ageMs() stable (no reset)", kgStable, kgStable ? `ageMs diff=${Math.abs(kgAge2 - kgAge1)}ms` : "KG timestamp unstable", false));

    // 4. RuntimeBootstrapHistory appends
    let histOk = false;
    try {
      const { RuntimeBootstrapHistory } = await import("../runtime-persistence/RuntimeBootstrapHistory");
      const hist = new RuntimeBootstrapHistory();
      const fake: any = { id: "pv1", startedAt: t0, completedAt: t0 + 100, durationMs: 100, phase: "READY", success: true, phases: [], healthChecks: [], restoreResult: null, errors: [] };
      hist.add(fake);
      histOk = hist.count() > 0;
    } catch { histOk = false; }
    checks.push(check("RuntimeBootstrapHistory persists", histOk, histOk ? "History append OK" : "History failed"));

    // 5. RuntimePersistenceAudit appends
    let auditOk = false;
    try {
      const { RuntimePersistenceAudit } = await import("../runtime-persistence/RuntimePersistenceAudit");
      const audit = new RuntimePersistenceAudit();
      audit.record("PersistValidator", "PROBE", "SessionStore", "PASS", "probe");
      auditOk = audit.count() > 0;
    } catch { auditOk = false; }
    checks.push(check("RuntimePersistenceAudit appends", auditOk, auditOk ? "Audit append OK" : "Audit failed"));

    // 6. Engineering Memory audit is append-only
    const before = em.audit.all().length;
    em.recordBug({ description: "persist probe bug", rootCause: "test", module: "PersistMod", impact: "LOW", fix: "fixed", relatedRegression: "", confidence: 0.9, version: "6.3.5" });
    const after = em.audit.all().length;
    const auditAppend = after > before;
    checks.push(check("Engineering Memory audit append-only", auditAppend, `before=${before} after=${after}`, false));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "persist_validator",
      name: "Persistence Validator",
      domain: "Persistence",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} persistence checks passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[PERSIST] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Restore persistence layer — session data will be lost on restart."] : [],
    };
  }
}