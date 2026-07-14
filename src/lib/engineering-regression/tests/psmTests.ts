/**
 * psmTests.ts — Sprint 6.3.4 PSM Regression Tests
 * Extracted from EngineeringRegressionSuite to keep file size manageable.
 */

import type { RegressionTest, RegressionResult } from "../EngineeringRegressionSuite";
import { PersistentSessionManager }  from "../../runtime-persistence/PersistentSessionManager";
import { ConnectorSessionStore }      from "../../runtime-persistence/ConnectorSessionStore";
import { SessionSerializer }          from "../../runtime-persistence/SessionSerializer";
import { SessionRestorer }            from "../../runtime-persistence/SessionRestorer";
import { AutoReconnectEngine }        from "../../runtime-persistence/AutoReconnectEngine";
import { StartupHealthCheck }         from "../../runtime-persistence/StartupHealthCheck";
import { RuntimeBootstrapHistory }    from "../../runtime-persistence/RuntimeBootstrapHistory";
import { RuntimePersistenceAudit }    from "../../runtime-persistence/RuntimePersistenceAudit";

export const psmTests: RegressionTest[] = [
  {
    id: "psm_01", name: "PersistentSessionManager initializes", category: "PSM",
    run: () => {
      const t0 = Date.now();
      const mgr = new PersistentSessionManager();
      const ok = typeof mgr.restore === "function" && typeof mgr.save === "function" && typeof mgr.register === "function";
      return { testId: "psm_01", testName: "PersistentSessionManager initializes", category: "PSM",
        passed: ok, detail: ok ? "restore/save/register callable" : "Missing methods", durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_02", name: "SessionSerializer round-trip (no credentials)", category: "PSM",
    run: () => {
      const t0 = Date.now();
      const store = new ConnectorSessionStore();
      store.upsert({ connectorId: "rt_test", provider: "Test", displayName: "T", status: "CONNECTED", statusReason: "ok", capabilities: ["READ"], health: "HEALTHY", metadata: { repo: "memoryos" }, expiresAt: null });
      const serializer = new SessionSerializer();
      serializer.serialize(store.all());
      const restored = serializer.deserialize();
      serializer.clear();
      const ok = !!restored && restored.sessions.length === 1 && restored.sessions[0].connectorId === "rt_test";
      const raw = JSON.stringify(restored ?? {});
      const noCredentials = !["accessToken","refreshToken","clientSecret","password"].some(f => raw.includes(f));
      return { testId: "psm_02", testName: "SessionSerializer round-trip (no credentials)", category: "PSM",
        passed: ok && noCredentials, detail: ok ? `round-trip OK, credentials absent=${noCredentials}` : "Round-trip failed", durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_03", name: "SessionRestorer handles empty store gracefully", category: "PSM",
    run: () => {
      const t0 = Date.now();
      const store = new ConnectorSessionStore();
      const restorer = new SessionRestorer();
      const result = restorer.restore(store);
      const ok = result.total === 0 && result.restored === 0 && result.failed === 0;
      return { testId: "psm_03", testName: "SessionRestorer handles empty store gracefully", category: "PSM",
        passed: ok, detail: ok ? "Empty restore returns zeros" : `total=${result.total} failed=${result.failed}`, durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_04", name: "ConnectorSessionStore upsert + status update", category: "PSM",
    run: () => {
      const t0 = Date.now();
      const store = new ConnectorSessionStore();
      const record = store.upsert({ connectorId: "gh_test", provider: "GitHub", displayName: "GH", status: "CONNECTED", statusReason: "ok", capabilities: ["READ"], health: "HEALTHY", metadata: {}, expiresAt: null });
      store.updateStatus(record.id, "SESSION_EXPIRED", "Token expired");
      const updated = store.get(record.id);
      const ok = updated?.status === "SESSION_EXPIRED" && updated?.statusReason === "Token expired";
      return { testId: "psm_04", testName: "ConnectorSessionStore upsert + status update", category: "PSM",
        passed: ok, detail: ok ? "Status updated correctly" : `status=${updated?.status}`, durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_05", name: "AutoReconnectEngine skips expired sessions", category: "PSM",
    run: async () => {
      const t0 = Date.now();
      const store = new ConnectorSessionStore();
      store.upsert({ connectorId: "exp_test", provider: "Test", displayName: "T", status: "SESSION_EXPIRED", statusReason: "expired", capabilities: [], health: "UNKNOWN", metadata: {}, expiresAt: null });
      const engine = new AutoReconnectEngine();
      const attempts = await engine.reconnectAll(store);
      const ok = attempts.length === 1 && attempts[0].result === "SESSION_EXPIRED";
      return { testId: "psm_05", testName: "AutoReconnectEngine skips expired sessions", category: "PSM",
        passed: ok, detail: ok ? "Expired session correctly skipped" : `result=${attempts[0]?.result}`, durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_06", name: "AutoReconnectEngine reconnects healthy sessions", category: "PSM",
    run: async () => {
      const t0 = Date.now();
      const store = new ConnectorSessionStore();
      store.upsert({ connectorId: "healthy_test", provider: "Test", displayName: "T", status: "RESTORING", statusReason: "restoring", capabilities: ["READ"], health: "HEALTHY", metadata: {}, expiresAt: null });
      const engine = new AutoReconnectEngine();
      const attempts = await engine.reconnectAll(store);
      const ok = attempts.length === 1 && attempts[0].result === "RECONNECTED";
      return { testId: "psm_06", testName: "AutoReconnectEngine reconnects healthy sessions", category: "PSM",
        passed: ok, detail: ok ? "Healthy session reconnected" : `result=${attempts[0]?.result}`, durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_07", name: "StartupHealthCheck runs all 9 components", category: "PSM",
    run: async () => {
      const t0 = Date.now();
      const hc = new StartupHealthCheck();
      const results = await hc.run();
      const ok = results.length === 9;
      const summary = hc.summary(results);
      return { testId: "psm_07", testName: "StartupHealthCheck runs all 9 components", category: "PSM",
        passed: ok, detail: ok ? `9 checks: pass=${summary.pass} fail=${summary.fail} degraded=${summary.degraded}` : `only ${results.length} checks ran`, durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_08", name: "RuntimeBootstrapHistory is append-only", category: "PSM",
    run: () => {
      const t0 = Date.now();
      const hist = new RuntimeBootstrapHistory();
      const fakeReport: any = { id: "b1", startedAt: t0, completedAt: t0+100, durationMs: 100, phase: "READY", success: true, phases: [], healthChecks: [], restoreResult: null, errors: [] };
      hist.add(fakeReport);
      const before = hist.count();
      hist.add({ ...fakeReport, id: "b2" });
      const after = hist.count();
      const ok = after === before + 1;
      return { testId: "psm_08", testName: "RuntimeBootstrapHistory is append-only", category: "PSM",
        passed: ok, detail: ok ? `before=${before} after=${after}` : "Count did not grow", durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_09", name: "RuntimePersistenceAudit is append-only", category: "PSM",
    run: () => {
      const t0 = Date.now();
      const audit = new RuntimePersistenceAudit();
      audit.record("Test", "RESTORE", "SessionStore", "PASS", "restored 3 sessions");
      const before = audit.count();
      audit.record("Test", "SYNC", "SessionStore", "PASS", "synced 3 sessions");
      const after = audit.count();
      const ok = after === before + 1;
      return { testId: "psm_09", testName: "RuntimePersistenceAudit is append-only", category: "PSM",
        passed: ok, detail: ok ? `before=${before} after=${after}` : "Audit count did not grow", durationMs: Date.now() - t0 };
    },
  },
  {
    id: "psm_10", name: "SessionSerializer never persists forbidden fields", category: "PSM",
    run: () => {
      const t0 = Date.now();
      const store = new ConnectorSessionStore();
      store.upsert({ connectorId: "sec_test", provider: "Sec", displayName: "S", status: "CONNECTED", statusReason: "ok", capabilities: [], health: "HEALTHY", metadata: { token: "SHOULD_NOT_PERSIST", repo: "safe" }, expiresAt: null });
      const serializer = new SessionSerializer();
      serializer.serialize(store.all());
      const restored = serializer.deserialize();
      serializer.clear();
      const metaStr = JSON.stringify(restored?.sessions?.[0]?.metadata ?? {});
      const tokenSanitized = !metaStr.includes('"token"');
      return { testId: "psm_10", testName: "SessionSerializer never persists forbidden fields", category: "PSM",
        passed: tokenSanitized, detail: tokenSanitized ? "Token field correctly stripped" : "SECURITY: token field found in serialized output!",
        durationMs: Date.now() - t0, rca: tokenSanitized ? undefined : "SessionSerializer.sanitize() not stripping token key from metadata." };
    },
  },
];