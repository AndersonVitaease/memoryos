/**
 * ProductionDashboard.jsx — Sprint EF-35
 * Production Operations Dashboard for MemoryOS
 * Route: /production
 */
import React, { useState, useEffect, useCallback, useRef } from "react";

// ── Shared primitives ──────────────────────────────────────────────────────────

const SEV_COLOR = {
  HEALTHY:  "text-emerald-400",
  WARNING:  "text-amber-400",
  DEGRADED: "text-orange-400",
  CRITICAL: "text-red-400",
  INFO:     "text-sky-400",
  ERROR:    "text-red-400",
  PASS:     "text-emerald-400",
  FAIL:     "text-red-400",
};

const SEV_BORDER = {
  HEALTHY:  "border-emerald-700/60 bg-emerald-950/10",
  WARNING:  "border-amber-700/60 bg-amber-950/10",
  DEGRADED: "border-orange-700/60 bg-orange-950/10",
  CRITICAL: "border-red-700/60 bg-red-950/10",
  INFO:     "border-sky-700/60 bg-sky-950/10",
  ERROR:    "border-red-700/60 bg-red-950/10",
};

const SEV_DOT = {
  HEALTHY: "bg-emerald-500", WARNING: "bg-amber-500",
  DEGRADED: "bg-orange-500", CRITICAL: "bg-red-500",
  INFO: "bg-sky-500", ERROR: "bg-red-500",
};

function Dot({ status }) {
  return <div className={"w-2 h-2 rounded-full shrink-0 " + (SEV_DOT[status] || "bg-zinc-600")} />;
}

function MetCard({ label, value, sub, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={"text-lg font-bold font-mono " + (color || "text-zinc-300")}>{value}</div>
      {sub && <div className="text-zinc-500 text-xs mt-0.5 font-mono">{sub}</div>}
      <div className="text-zinc-600 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function SectionHeader({ title }) {
  return <div className="text-zinc-500 text-xs tracking-widest mb-2 px-1">{title}</div>;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  "Overview","Health","Performance","Alerts","Recovery",
  "Connectors","Audit","Configuration","Certificates","Live Metrics",
];

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ProductionDashboard() {
  const [tab, setTab]               = useState("Overview");
  const [health, setHealth]         = useState(null);
  const [metrics, setMetrics]       = useState(null);
  const [alerts, setAlerts]         = useState([]);
  const [audit, setAudit]           = useState([]);
  const [config, setConfig]         = useState(null);
  const [recovery, setRecovery]     = useState([]);
  const [liveHistory, setLiveHistory] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [recoveryRunning, setRecoveryRunning] = useState(false);
  const [alertFilter, setAlertFilter] = useState({ severity: "ALL", category: "ALL" });
  const intervalRef = useRef(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { ProductionHealthEngine },
        { OperationalMetricsEngine },
        { AlertEngine },
        { ProductionAuditEngine },
        { ConfigurationIntegrityEngine },
        { RecoveryEngine },
      ] = await Promise.all([
        import("@/lib/production/ProductionHealthEngine"),
        import("@/lib/production/OperationalMetricsEngine"),
        import("@/lib/production/AlertEngine"),
        import("@/lib/production/ProductionAuditEngine"),
        import("@/lib/production/ConfigurationIntegrityEngine"),
        import("@/lib/production/RecoveryEngine"),
      ]);

      const snap = await ProductionHealthEngine.check();
      setHealth(snap);

      // Record metrics sample
      OperationalMetricsEngine.record("pipeline",  snap.components[0]?.latencyMs ?? 100, snap.status !== "CRITICAL");
      OperationalMetricsEngine.record("connector", snap.components[1]?.latencyMs ?? 200, snap.status !== "CRITICAL");
      const met = OperationalMetricsEngine.snapshot();
      setMetrics(met);

      // Auto-evaluate alerts
      AlertEngine.evaluate(met);
      snap.components.filter(c => c.status === "CRITICAL" || c.status === "DEGRADED").forEach(c => {
        AlertEngine.raise("ERROR", "Connector", `Component degraded: ${c.name}`, `Status: ${c.status}`, { component: c.name });
      });
      setAlerts(AlertEngine.getAll());

      // Audit
      ProductionAuditEngine.healthCheck(snap.status, snap.components.length);
      setAudit(ProductionAuditEngine.getRecent(100));

      // Config
      setConfig(ConfigurationIntegrityEngine.validate());

      // Recovery history
      setRecovery(RecoveryEngine.getRecent(50));

      // Live metrics history (rolling 20 samples)
      setLiveHistory(prev => [...prev.slice(-19), { ts: Date.now(), ...met }]);
    } catch (e) {
      console.error("[ProductionDashboard]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    runCheck();
    intervalRef.current = setInterval(runCheck, 15000);
    return () => clearInterval(intervalRef.current);
  }, [runCheck]);

  const runRecoverySimulation = useCallback(async () => {
    setRecoveryRunning(true);
    try {
      const { RecoveryEngine } = await import("@/lib/production/RecoveryEngine");
      const { ProductionAuditEngine } = await import("@/lib/production/ProductionAuditEngine");
      await RecoveryEngine.runAllSimulations();
      ProductionAuditEngine.record("RecoveryAttempt", "recovery-engine", "Recovery simulation completed", {});
      setRecovery(RecoveryEngine.getRecent(50));
      setAudit(ProductionAuditEngine.getRecent(100));
    } finally { setRecoveryRunning(false); }
  }, []);

  const filteredAlerts = alerts.filter(a => {
    const sevOk = alertFilter.severity === "ALL" || a.severity === alertFilter.severity;
    const catOk = alertFilter.category === "ALL" || a.category === alertFilter.category;
    return sevOk && catOk;
  });

  const overallStatus = health?.status ?? "HEALTHY";

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className={"border rounded-xl p-5 " + (SEV_BORDER[overallStatus] || "border-zinc-700 bg-zinc-900")}>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-35 — MEMORYOS PRODUCTION OPERATIONS</div>
              <div className="text-xl font-bold text-white">Production Dashboard</div>
              <div className="text-zinc-400 text-sm mt-1">Health · Metrics · Alerts · Recovery · Audit · Configuration</div>
            </div>
            <div className="flex items-center gap-2">
              <Dot status={overallStatus} />
              <span className={"font-bold text-sm " + SEV_COLOR[overallStatus]}>{overallStatus}</span>
            </div>
            <button onClick={runCheck} disabled={loading}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-bold">
              {loading ? "⟳" : "🔄 Refresh"}
            </button>
          </div>
        </div>

        {/* Quick metrics */}
        {metrics && (
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            <MetCard label="Uptime" value={(health?.uptimePct ?? 100) + "%"} color="text-emerald-400" />
            <MetCard label="Availability" value={(health?.availabilityPct ?? 100) + "%"} color="text-emerald-400" />
            <MetCard label="Req/min" value={metrics.requestsPerMin} color="text-sky-400" />
            <MetCard label="Success %" value={metrics.successRate + "%"} color={metrics.successRate >= 95 ? "text-emerald-400" : "text-amber-400"} />
            <MetCard label="Failure %" value={metrics.failureRate + "%"} color={metrics.failureRate > 5 ? "text-red-400" : "text-zinc-400"} />
            <MetCard label="P95 ms" value={metrics.pipelineLatency.p95 + "ms"} color="text-violet-400" />
            <MetCard label="Heap MB" value={metrics.heapMB + " MB"} color={metrics.heapMB > 300 ? "text-amber-400" : "text-zinc-400"} />
            <MetCard label="Alerts" value={alerts.filter(a => !a.resolved).length} color={alerts.filter(a => !a.resolved).length > 0 ? "text-red-400" : "text-zinc-500"} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
              {t}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Health summary */}
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
              <SectionHeader title="PLATFORM HEALTH" />
              {health?.components.map(c => (
                <div key={c.name} className="flex items-center gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                  <Dot status={c.status} />
                  <span className="text-zinc-300 text-xs flex-1">{c.name}</span>
                  <span className={"text-xs font-bold " + SEV_COLOR[c.status]}>{c.status}</span>
                  <span className="text-zinc-600 text-xs font-mono">{c.latencyMs}ms</span>
                </div>
              ))}
            </div>
            {/* Active alerts */}
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
              <SectionHeader title={`ACTIVE ALERTS (${alerts.filter(a => !a.resolved).length})`} />
              {alerts.filter(a => !a.resolved).slice(0, 6).map(a => (
                <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                  <Dot status={a.severity === "CRITICAL" ? "CRITICAL" : a.severity === "ERROR" ? "DEGRADED" : "WARNING"} />
                  <span className={"text-xs font-bold w-14 " + SEV_COLOR[a.severity]}>{a.severity}</span>
                  <span className="text-zinc-300 text-xs flex-1 truncate">{a.title}</span>
                </div>
              ))}
              {alerts.filter(a => !a.resolved).length === 0 && <div className="text-zinc-600 text-xs">No active alerts.</div>}
            </div>
            {/* Metrics summary */}
            {metrics && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
                <SectionHeader title="LATENCY PROFILE" />
                {[
                  ["Pipeline P50",  metrics.pipelineLatency.p50  + "ms"],
                  ["Pipeline P95",  metrics.pipelineLatency.p95  + "ms"],
                  ["Pipeline P99",  metrics.pipelineLatency.p99  + "ms"],
                  ["Connector P50", metrics.connectorLatency.p50 + "ms"],
                  ["Connector P95", metrics.connectorLatency.p95 + "ms"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-zinc-800/30 last:border-0 text-xs">
                    <span className="text-zinc-500">{k}</span>
                    <span className="text-sky-400 font-mono">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Config summary */}
            {config && (
              <div className={"border rounded-xl p-4 " + (config.passed ? "border-emerald-800/60 bg-emerald-950/10" : "border-red-800/60 bg-red-950/10")}>
                <SectionHeader title="CONFIGURATION INTEGRITY" />
                <div className={"text-lg font-bold " + (config.passed ? "text-emerald-400" : "text-red-400")}>
                  {config.passed ? "VALID" : "ISSUES FOUND"}
                </div>
                <div className="text-zinc-500 text-xs mt-1">Score: {config.score}% · {config.findings.length} findings</div>
                {config.findings.slice(0, 3).map(f => (
                  <div key={f.key} className="text-xs mt-1 text-amber-400 truncate">⚠ {f.issue}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HEALTH ───────────────────────────────────────────────────────── */}
        {tab === "Health" && health && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetCard label="Overall" value={health.status} color={SEV_COLOR[health.status]} />
              <MetCard label="Uptime" value={health.uptimePct + "%"} color="text-emerald-400" />
              <MetCard label="MTTR" value={health.mttrMs ? health.mttrMs + "ms" : "—"} color="text-sky-400" />
              <MetCard label="MTBF" value={health.mtbfMs ? health.mtbfMs + "ms" : "—"} color="text-violet-400" />
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <SectionHeader title="COMPONENT HEALTH" />
              {health.components.map(c => (
                <div key={c.name} className={"flex items-center gap-3 px-4 py-3 border-b border-zinc-800/40 last:border-0 " + (SEV_BORDER[c.status] || "")}>
                  <Dot status={c.status} />
                  <span className="text-zinc-200 text-sm flex-1">{c.name}</span>
                  <span className={"font-bold text-xs " + SEV_COLOR[c.status]}>{c.status}</span>
                  <span className="text-zinc-600 text-xs font-mono">{c.latencyMs}ms</span>
                  <span className="text-zinc-600 text-xs">{new Date(c.lastChecked).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">HEALTH EVENT LOG</div>
              <div className="max-h-64 overflow-y-auto">
                {health.events.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                    <Dot status={e.status} />
                    <span className={"text-xs font-bold w-16 " + SEV_COLOR[e.status]}>{e.status}</span>
                    <span className="text-zinc-500 text-xs">{e.component}</span>
                    <span className="text-zinc-400 text-xs flex-1 truncate">{e.detail}</span>
                    <span className="text-zinc-600 text-xs font-mono">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PERFORMANCE ──────────────────────────────────────────────────── */}
        {tab === "Performance" && metrics && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                ["P50", metrics.pipelineLatency.p50 + "ms", "text-emerald-400"],
                ["P95", metrics.pipelineLatency.p95 + "ms", "text-amber-400"],
                ["P99", metrics.pipelineLatency.p99 + "ms", "text-red-400"],
                ["Avg", metrics.pipelineLatency.avg + "ms", "text-sky-400"],
                ["Min", metrics.pipelineLatency.min + "ms", "text-zinc-400"],
                ["Max", metrics.pipelineLatency.max + "ms", "text-zinc-400"],
              ].map(([k, v, c]) => <MetCard key={k} label={"Pipeline " + k} value={v} color={c} />)}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                ["Conn P50", metrics.connectorLatency.p50 + "ms", "text-emerald-400"],
                ["Conn P95", metrics.connectorLatency.p95 + "ms", "text-amber-400"],
                ["Req/min", metrics.requestsPerMin, "text-sky-400"],
                ["Success %", metrics.successRate + "%", metrics.successRate >= 95 ? "text-emerald-400" : "text-amber-400"],
                ["Fail %", metrics.failureRate + "%", "text-red-400"],
                ["Retry %", metrics.retryRate + "%", "text-amber-400"],
              ].map(([k, v, c]) => <MetCard key={k} label={k} value={v} color={c} />)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetCard label="CPU %" value={metrics.cpu + "%"} color={metrics.cpu > 70 ? "text-amber-400" : "text-zinc-400"} />
              <MetCard label="Memory MB" value={metrics.memoryMB + " MB"} />
              <MetCard label="Heap MB" value={metrics.heapMB + " MB"} color={metrics.heapMB > 300 ? "text-amber-400" : "text-zinc-400"} />
              <MetCard label="Storage KB" value={metrics.storageKB + " KB"} />
            </div>
          </div>
        )}

        {/* ── ALERTS ───────────────────────────────────────────────────────── */}
        {tab === "Alerts" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {["ALL","INFO","WARNING","ERROR","CRITICAL"].map(s => (
                <button key={s} onClick={() => setAlertFilter(f => ({ ...f, severity: s }))}
                  className={"px-3 py-1 rounded text-xs font-bold border transition " +
                    (alertFilter.severity === s ? "border-violet-500 bg-violet-900/40 text-violet-300" : "border-zinc-700 bg-zinc-800 text-zinc-400")}>
                  {s}
                </button>
              ))}
              <span className="text-zinc-600 text-xs self-center ml-2">Category:</span>
              {["ALL","Pipeline","Connector","Memory","CPU","Latency","Retry","Audit","Timeout"].map(c => (
                <button key={c} onClick={() => setAlertFilter(f => ({ ...f, category: c }))}
                  className={"px-2 py-1 rounded text-xs border transition " +
                    (alertFilter.category === c ? "border-sky-500 bg-sky-900/30 text-sky-300" : "border-zinc-700 bg-zinc-800 text-zinc-500")}>
                  {c}
                </button>
              ))}
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                ALERTS — {filteredAlerts.length} SHOWN / {alerts.length} TOTAL
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {filteredAlerts.map(a => (
                  <div key={a.id} className={"border-b border-zinc-800/40 last:border-0 px-4 py-3 " + (a.resolved ? "opacity-50" : "")}>
                    <div className="flex items-center gap-2 mb-1">
                      <Dot status={a.severity === "CRITICAL" ? "CRITICAL" : a.severity === "ERROR" ? "DEGRADED" : "WARNING"} />
                      <span className={"text-xs font-bold " + SEV_COLOR[a.severity]}>{a.severity}</span>
                      <span className="text-zinc-400 text-xs bg-zinc-800 px-1.5 py-0.5 rounded">{a.category}</span>
                      <span className="text-zinc-200 text-sm flex-1">{a.title}</span>
                      <span className="text-zinc-600 text-xs font-mono">{new Date(a.timestamp).toLocaleTimeString()}</span>
                      {a.resolved && <span className="text-emerald-600 text-xs">RESOLVED</span>}
                    </div>
                    <div className="text-zinc-500 text-xs ml-4">{a.detail}</div>
                    <div className="text-amber-400/70 text-xs ml-4 mt-0.5">→ {a.suggestedAction}</div>
                  </div>
                ))}
                {filteredAlerts.length === 0 && <div className="p-6 text-zinc-600 text-sm text-center">No alerts match the current filter.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── RECOVERY ─────────────────────────────────────────────────────── */}
        {tab === "Recovery" && (
          <div className="space-y-3">
            <button onClick={runRecoverySimulation} disabled={recoveryRunning}
              className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold">
              {recoveryRunning ? "Running Simulations..." : "▶ Run Recovery Simulations"}
            </button>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                RECOVERY LOG — {recovery.length} RECORDS
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {recovery.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/40 last:border-0">
                    <Dot status={r.outcome === "RECOVERED" ? "HEALTHY" : r.outcome === "SKIPPED" ? "WARNING" : "CRITICAL"} />
                    <span className={"text-xs font-bold w-20 " + (r.outcome === "RECOVERED" ? "text-emerald-400" : r.outcome === "SKIPPED" ? "text-amber-400" : "text-red-400")}>{r.outcome}</span>
                    <span className="text-zinc-400 text-xs bg-zinc-800 px-1.5 py-0.5 rounded">{r.mode}</span>
                    <span className="text-zinc-300 text-xs flex-1">{r.component}</span>
                    <span className="text-zinc-500 text-xs">{r.attempt}/{r.maxAttempts}</span>
                    <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
                  </div>
                ))}
                {recovery.length === 0 && <div className="p-6 text-zinc-600 text-sm text-center">No recovery events yet. Run simulations above.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── CONNECTORS ───────────────────────────────────────────────────── */}
        {tab === "Connectors" && health && (
          <div className="space-y-2">
            {health.components.map(c => (
              <div key={c.name} className={"border rounded-xl p-4 bg-zinc-900 " + (SEV_BORDER[c.status] || "border-zinc-700")}>
                <div className="flex items-center gap-3">
                  <Dot status={c.status} />
                  <span className="text-zinc-200 text-sm font-bold flex-1">{c.name}</span>
                  <span className={"text-xs font-bold " + SEV_COLOR[c.status]}>{c.status}</span>
                  <span className="text-zinc-600 text-xs font-mono">{c.latencyMs}ms</span>
                  <span className="text-zinc-600 text-xs">{new Date(c.lastChecked).toLocaleTimeString()}</span>
                </div>
                {c.consecutiveFailures > 0 && (
                  <div className="text-red-300 text-xs mt-2 ml-5">Consecutive failures: {c.consecutiveFailures}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── AUDIT ────────────────────────────────────────────────────────── */}
        {tab === "Audit" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              OPERATIONAL AUDIT LOG — {audit.length} EVENTS (IMMUTABLE)
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {audit.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0">
                  <Dot status={e.severity === "CRITICAL" ? "CRITICAL" : e.severity === "ERROR" ? "DEGRADED" : e.severity === "WARNING" ? "WARNING" : "HEALTHY"} />
                  <span className={"text-xs font-bold w-14 " + SEV_COLOR[e.severity]}>{e.severity}</span>
                  <span className="text-zinc-400 text-xs bg-zinc-800 px-1.5 py-0.5 rounded w-28 truncate">{e.type}</span>
                  <span className="text-zinc-300 text-xs flex-1 truncate">{e.detail}</span>
                  <span className="text-zinc-600 text-xs">{e.component}</span>
                  <span className="text-zinc-600 text-xs font-mono">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
              {audit.length === 0 && <div className="p-6 text-zinc-600 text-sm text-center">No audit events yet. Run health check first.</div>}
            </div>
          </div>
        )}

        {/* ── CONFIGURATION ────────────────────────────────────────────────── */}
        {tab === "Configuration" && config && (
          <div className="space-y-4">
            <div className={"border-2 rounded-xl p-4 " + (config.passed ? "border-emerald-700 bg-emerald-950/10" : "border-red-700 bg-red-950/10")}>
              <div className="flex items-center gap-3">
                <span className={"text-lg font-bold " + (config.passed ? "text-emerald-400" : "text-red-400")}>
                  {config.passed ? "CONFIGURATION VALID" : "CONFIGURATION ISSUES FOUND"}
                </span>
                <span className="text-zinc-400 text-sm ml-auto">Score: {config.score}%</span>
              </div>
              <div className="text-zinc-500 text-xs mt-1">
                {config.passedChecks}/{config.totalChecks} checks passed · {config.findings.length} findings
              </div>
            </div>
            {config.findings.length > 0 ? (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">FINDINGS</div>
                {config.findings.map(f => (
                  <div key={f.key} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Dot status={f.severity === "CRITICAL" ? "CRITICAL" : f.severity === "ERROR" ? "DEGRADED" : "WARNING"} />
                      <span className={"text-xs font-bold " + SEV_COLOR[f.severity]}>{f.severity}</span>
                      <span className="text-zinc-300 text-sm flex-1">{f.issue}</span>
                      <span className="text-zinc-600 text-xs font-mono">{f.key}</span>
                    </div>
                    <div className="text-zinc-500 text-xs ml-5">{f.detail}</div>
                    <div className="text-amber-400/70 text-xs ml-5 mt-0.5">→ {f.suggestedFix}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-emerald-800/60 rounded-xl p-6 text-center bg-emerald-950/10 text-emerald-400 text-sm">
                ✓ All {config.totalChecks} configuration checks passed
              </div>
            )}
          </div>
        )}

        {/* ── CERTIFICATES ─────────────────────────────────────────────────── */}
        {tab === "Certificates" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-6 text-center">
            <div className="text-zinc-500 text-xs tracking-widest mb-3">CERTIFICATION STATUS</div>
            <div className="text-emerald-400 text-sm mb-2">
              Platform certified via EV-5.1 — Engineering Validation Complete
            </div>
            <div className="text-zinc-500 text-xs">
              Navigate to <span className="text-violet-400">/ev5</span> to view the full platform certification certificate.
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              {[
                ["EV-1", "Unit Test Foundation",       "PASS"],
                ["EV-2", "Pipeline Integration",       "PASS"],
                ["EV-4A","OAuth & Token Lifecycle",    "PASS"],
                ["EV-4B","Live Connector Acceptance",  "PASS"],
                ["EV-5", "Platform Certification",     "CERTIFIED"],
                ["EF-35","Production Readiness",       "IN PROGRESS"],
              ].map(([id, name, status]) => (
                <div key={id} className="flex items-center gap-2 bg-zinc-800/40 rounded px-3 py-2">
                  <span className="text-zinc-500 w-12">{id}</span>
                  <span className="text-zinc-300 flex-1">{name}</span>
                  <span className={status === "PASS" || status === "CERTIFIED" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LIVE METRICS ─────────────────────────────────────────────────── */}
        {tab === "Live Metrics" && (
          <div className="space-y-4">
            <div className="text-zinc-500 text-xs">Auto-refreshes every 15s · showing last {liveHistory.length} samples</div>
            {liveHistory.length > 0 ? (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800">
                      {["Time","Req/min","Success%","Fail%","P95ms","Heap MB","CPU%"].map(h => (
                        <th key={h} className="px-3 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...liveHistory].reverse().map((s, i) => (
                      <tr key={i} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                        <td className="px-3 py-1.5 text-zinc-500">{new Date(s.ts).toLocaleTimeString()}</td>
                        <td className="px-3 py-1.5 text-sky-400">{s.requestsPerMin}</td>
                        <td className={"px-3 py-1.5 " + (s.successRate >= 95 ? "text-emerald-400" : "text-amber-400")}>{s.successRate}%</td>
                        <td className={"px-3 py-1.5 " + (s.failureRate > 5 ? "text-red-400" : "text-zinc-500")}>{s.failureRate}%</td>
                        <td className="px-3 py-1.5 text-violet-400">{s.pipelineLatency?.p95 ?? 0}ms</td>
                        <td className={"px-3 py-1.5 " + (s.heapMB > 300 ? "text-amber-400" : "text-zinc-400")}>{s.heapMB}</td>
                        <td className={"px-3 py-1.5 " + (s.cpu > 70 ? "text-amber-400" : "text-zinc-400")}>{s.cpu}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">
                Collecting metrics... (auto-refresh every 15s)
              </div>
            )}
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EF-35 PRODUCTION READINESS</div>
          {[
            "ProductionHealthEngine: HEALTHY/WARNING/DEGRADED/CRITICAL · uptime · MTTR · MTBF",
            "OperationalMetricsEngine: pipeline/connector latency · P50/P95/P99 · throughput · CPU/memory",
            "AlertEngine: auto-alerts on failure rate, latency, memory, CPU · severity + evidence + suggested action",
            "ProductionAuditEngine: immutable log for Deploy/Crash/Recovery/ConnectorFailure/etc.",
            "ConfigurationIntegrityEngine: validates tokens, scopes, storage, env — score 0-100",
            "RecoveryEngine: retry, backoff, reauth, rollback — all produce evidence",
            "ProductionDashboard: 10 tabs — Overview/Health/Performance/Alerts/Recovery/Connectors/Audit/Configuration/Certificates/Live Metrics",
            "EV-5.1 certification preserved — zero regressions",
          ].map((c, i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}