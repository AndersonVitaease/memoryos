import React, { useState, useEffect } from "react";
import { UniversalConnectorPlatform } from "@/lib/universal-connector-platform/UniversalConnectorPlatform";
import { runUCPTests } from "@/lib/universal-connector-platform/ucpTests";

const ucp = UniversalConnectorPlatform.getRuntime();

// ── Helpers ────────────────────────────────────────────────────────────────────

function Badge({ label, color = "gray", size = "sm" }) {
  const c = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    violet: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    orange: "bg-orange-900/40 text-orange-300 border border-orange-700/40",
    teal:   "bg-teal-900/40 text-teal-300 border border-teal-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return <span className={`${sz} font-mono rounded ${c[color] ?? c.gray}`}>{label}</span>;
}

function StatCard({ label, value, color = "gray", sub }) {
  const c = { green: "text-green-300", yellow: "text-yellow-300", red: "text-red-400", blue: "text-blue-300", violet: "text-violet-300", gray: "text-white" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
      <div className="text-xs font-mono text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold ${c[color] ?? c.gray}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

const LC_COLOR = {
  REGISTERED: "blue", CONFIGURED: "yellow", READY: "green",
  DEGRADED: "orange", FAILED: "red", DISCONNECTED: "gray",
};

const HEALTH_COLOR = { HEALTHY: "green", DEGRADED: "yellow", UNHEALTHY: "red", UNKNOWN: "gray" };

const TABS = ["overview", "registry", "runtime", "health", "metrics", "diagnostics", "lifecycle", "audit", "logs"];

// ── Demo: pre-install a few connectors for display ────────────────────────────
function ensureDemoConnectors() {
  if (ucp.registry.count() > 0) return;
  try {
    const c1 = ucp.install({ provider: "GitHub", displayName: "GitHub Connector", version: "1.0.0", capabilities: ["READ", "WRITE", "SEARCH"] });
    ucp.transitionLifecycle(c1.id, "CONFIGURED");
    ucp.transitionLifecycle(c1.id, "READY");
    ucp.metrics.recordCall(c1.id, 120, true);
    ucp.metrics.recordCall(c1.id, 98, true);

    const c2 = ucp.install({ provider: "Base44", displayName: "Base44 Connector", version: "1.0.0", capabilities: ["READ", "WRITE"] });
    ucp.transitionLifecycle(c2.id, "CONFIGURED");
    ucp.transitionLifecycle(c2.id, "READY");
    ucp.metrics.recordCall(c2.id, 45, true);

    const c3 = ucp.install({ provider: "TestProvider", displayName: "Stub Connector", version: "1.0.0", capabilities: ["READ"] });
    // leave as REGISTERED
  } catch (_) {
    // already installed
  }
}

export default function Phase630Page() {
  const [tab, setTab]           = useState("overview");
  const [connectors, setConnectors] = useState([]);
  const [stats, setStats]       = useState(null);
  const [testReport, setTestReport] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [diagResults, setDiagResults] = useState({});
  const [tick, setTick]         = useState(0);

  useEffect(() => {
    ensureDemoConnectors();
    refresh();
  }, []);

  function refresh() {
    setConnectors(ucp.registry.all());
    setStats(ucp.stats());
    setTick(t => t + 1);
  }

  async function runTests() {
    setTestLoading(true);
    try {
      const report = await runUCPTests();
      setTestReport(report);
    } finally {
      setTestLoading(false);
    }
  }

  function runDiag(connectorId) {
    try {
      const result = ucp.runDiagnostics(connectorId);
      setDiagResults(prev => ({ ...prev, [connectorId]: result }));
      refresh();
    } catch (e) {
      setDiagResults(prev => ({ ...prev, [connectorId]: { overall: false, details: [String(e)] } }));
    }
  }

  const logs    = ucp.logger.all().slice(0, 100);
  const audits  = ucp.audit.all().slice(0, 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.3.0</span>
          <Badge label="UNIVERSAL CONNECTOR PLATFORM" color="violet" />
          <Badge label={`v${UniversalConnectorPlatform.version()}`} color="blue" />
          {UniversalConnectorPlatform.isReady() && <Badge label="RUNTIME ACTIVE" color="green" />}
        </div>
        <h1 className="text-2xl font-bold">Universal Connector Platform</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Foundation layer · Runtime · Registry · Factory · Lifecycle · Health · Metrics · Audit
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="TOTAL CONNECTORS"   value={stats.totalConnectors}    color="blue" />
          <StatCard label="READY"              value={stats.readyConnectors}     color="green" />
          <StatCard label="DEGRADED"           value={stats.degradedConnectors}  color="yellow" />
          <StatCard label="FAILED"             value={stats.failedConnectors}    color="red" />
          <StatCard label="TOTAL CALLS"        value={stats.totalCallsAllTime}   color="violet" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-mono whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Architecture */}
            <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
              <span className="text-xs font-mono text-zinc-500 uppercase">Architecture Position</span>
              {[
                "Engineering Workflow", "Engineering Intelligence", "Engineering Memory",
                "Engineering Governance", "Architecture Authority",
                "Universal Connector Platform ◀ HERE",
                "Connector Adapters", "External Services",
              ].map((layer, i) => (
                <div key={i} className={`text-xs font-mono px-3 py-1.5 rounded ${layer.includes("HERE") ? "bg-violet-900/30 text-violet-300 border border-violet-700/40" : "bg-zinc-900 text-zinc-400"}`}>
                  {layer}
                </div>
              ))}
            </div>

            {/* Modules */}
            <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
              <span className="text-xs font-mono text-zinc-500 uppercase">Platform Modules</span>
              {[
                { mod: "ConnectorRuntime",      status: "ACTIVE" },
                { mod: "ConnectorRegistry",     status: "ACTIVE" },
                { mod: "ConnectorFactory",      status: "ACTIVE" },
                { mod: "ConnectorCapabilities", status: "ACTIVE" },
                { mod: "ConnectorLifecycle",    status: "ACTIVE" },
                { mod: "ConnectorHealth",       status: "ACTIVE" },
                { mod: "ConnectorMetrics",      status: "ACTIVE" },
                { mod: "ConnectorLogger",       status: "ACTIVE" },
                { mod: "ConnectorAudit",        status: "ACTIVE" },
                { mod: "ConnectorDiagnostics",  status: "ACTIVE" },
                { mod: "ConnectorVersioning",   status: "ACTIVE" },
                { mod: "ConnectorCompatibility",status: "ACTIVE" },
              ].map(({ mod, status }) => (
                <div key={mod} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-300">{mod}</span>
                  <Badge label={status} color="green" size="xs" />
                </div>
              ))}
            </div>
          </div>

          {/* Test runner */}
          <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-zinc-500 uppercase">Regression Shield</span>
              <button onClick={runTests} disabled={testLoading}
                className="px-4 py-2 rounded bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-sm font-semibold transition-colors">
                {testLoading ? "Running…" : "▶ Run UCP Tests"}
              </button>
              {testReport && (
                <div className="flex items-center gap-2">
                  <Badge label={`Shield: ${testReport.shield}`} color={testReport.shield === "PASS" ? "green" : "red"} />
                  <Badge label={`${testReport.passed}/${testReport.total}`} color="blue" />
                  <span className="text-xs text-zinc-600 font-mono">{testReport.durationMs}ms</span>
                </div>
              )}
            </div>
            {testReport && (
              <div className="space-y-1">
                {testReport.results.map(r => (
                  <div key={r.id} className="flex items-center gap-3 text-xs font-mono">
                    <span>{r.passed ? "✅" : "❌"}</span>
                    <span className="text-zinc-300 flex-1">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-xs">{r.detail}</span>}
                    <span className="text-zinc-600">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REGISTRY ────────────────────────────────────────────── */}
      {tab === "registry" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-500">{connectors.length} connector(s) registered</span>
            <button onClick={refresh} className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors">↺ Refresh</button>
          </div>
          {connectors.map(c => (
            <div key={c.id} className="border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-sm">{c.displayName}</span>
                <Badge label={`v${c.version.label}`} color="blue" />
                <Badge label={c.lifecycle} color={LC_COLOR[c.lifecycle] ?? "gray"} />
                <Badge label={c.health.state} color={HEALTH_COLOR[c.health.state] ?? "gray"} />
                <span className="text-xs text-zinc-600 font-mono">{c.id}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(c.capabilities).filter(([, v]) => v).map(([cap]) => (
                  <Badge key={cap} label={cap} color="teal" size="xs" />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-zinc-500">Provider: </span><span className="text-zinc-300">{c.provider}</span></div>
                <div><span className="text-zinc-500">Calls: </span><span className="text-zinc-300">{c.metrics.totalCalls}</span></div>
                <div><span className="text-zinc-500">Errors: </span><span className="text-zinc-300">{c.metrics.totalErrors}</span></div>
              </div>
            </div>
          ))}
          {connectors.length === 0 && <p className="text-zinc-500 text-sm">No connectors registered.</p>}
        </div>
      )}

      {/* ── RUNTIME ─────────────────────────────────────────────── */}
      {tab === "runtime" && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="RUNTIME VERSION"    value={stats.version} color="violet" />
            <StatCard label="TOTAL CONNECTORS"   value={stats.totalConnectors} color="blue" />
            <StatCard label="UPTIME"             value={`${Math.round((Date.now() - stats.runtimeStartedAt) / 1000)}s`} color="green" />
          </div>
          <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
            <span className="text-xs font-mono text-zinc-500 uppercase">Connector Status Breakdown</span>
            {[
              { label: "READY",        count: stats.readyConnectors,    color: "green"  },
              { label: "DEGRADED",     count: stats.degradedConnectors, color: "yellow" },
              { label: "FAILED",       count: stats.failedConnectors,   color: "red"    },
              { label: "OTHER",        count: stats.totalConnectors - stats.readyConnectors - stats.degradedConnectors - stats.failedConnectors, color: "gray" },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3 text-xs">
                <Badge label={row.label} color={row.color} />
                <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div className={`h-full transition-all ${row.color === "green" ? "bg-green-600" : row.color === "yellow" ? "bg-yellow-600" : row.color === "red" ? "bg-red-600" : "bg-zinc-600"}`}
                    style={{ width: stats.totalConnectors > 0 ? `${(row.count / stats.totalConnectors) * 100}%` : "0%" }} />
                </div>
                <span className="text-zinc-400 w-4 text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── HEALTH ──────────────────────────────────────────────── */}
      {tab === "health" && (
        <div className="space-y-3">
          {connectors.map(c => {
            const h = ucp.health.get(c.id);
            return (
              <div key={c.id} className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-zinc-300">{c.displayName}</span>
                  <Badge label={h.state} color={HEALTH_COLOR[h.state] ?? "gray"} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-zinc-500">Availability: </span><span className="text-green-400">{h.availability}%</span></div>
                  <div><span className="text-zinc-500">Latency: </span><span className="text-zinc-300">{h.latencyMs}ms</span></div>
                  <div><span className="text-zinc-500">Error rate: </span><span className="text-red-400">{h.errorRate}%</span></div>
                  <div><span className="text-zinc-500">Checked: </span><span className="text-zinc-400">{new Date(h.lastCheckedAt).toISOString().slice(11, 19)}</span></div>
                </div>
                <p className="text-xs text-zinc-500">{h.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── METRICS ─────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <div className="space-y-3">
          {connectors.map(c => {
            const m = ucp.metrics.snapshot(c.id);
            return (
              <div key={c.id} className="border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm text-zinc-300">{c.displayName}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <StatCard label="CALLS"        value={m.totalCalls}   color="blue" />
                  <StatCard label="ERRORS"       value={m.totalErrors}  color={m.totalErrors > 0 ? "red" : "gray"} />
                  <StatCard label="AVG LATENCY"  value={`${m.avgLatencyMs}ms`} color="yellow" />
                  <StatCard label="AVAILABILITY" value={`${m.availability}%`}  color="green" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DIAGNOSTICS ─────────────────────────────────────────── */}
      {tab === "diagnostics" && (
        <div className="space-y-3">
          {connectors.map(c => {
            const result = diagResults[c.id];
            return (
              <div key={c.id} className="border border-zinc-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-zinc-300">{c.displayName}</span>
                  {result && <Badge label={result.overall ? "PASS" : "FAIL"} color={result.overall ? "green" : "red"} />}
                  <button onClick={() => runDiag(c.id)}
                    className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors ml-auto">
                    Run Diagnostics
                  </button>
                </div>
                {result && (
                  <div className="space-y-1">
                    {[
                      { label: "Self Test",    ok: result.selfTest },
                      { label: "Readiness",    ok: result.readiness },
                      { label: "Dependencies", ok: result.dependencyCheck },
                      { label: "Config",       ok: result.configurationValid },
                    ].map(({ label, ok }) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span>{ok ? "✅" : "❌"}</span>
                        <span className="text-zinc-400">{label}</span>
                      </div>
                    ))}
                    {result.details?.map((d, i) => (
                      <p key={i} className="text-xs font-mono text-zinc-500">{d}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── LIFECYCLE ───────────────────────────────────────────── */}
      {tab === "lifecycle" && (
        <div className="space-y-4">
          <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
            <span className="text-xs font-mono text-zinc-500 uppercase">State Machine</span>
            <div className="flex flex-wrap gap-2 items-center text-xs font-mono">
              {["REGISTERED", "CONFIGURED", "READY", "DEGRADED", "FAILED", "DISCONNECTED"].map((s, i, arr) => (
                <React.Fragment key={s}>
                  <span className={`px-2 py-1 rounded border ${LC_COLOR[s] === "green" ? "border-green-700 text-green-300 bg-green-900/20" : LC_COLOR[s] === "yellow" ? "border-yellow-700 text-yellow-300 bg-yellow-900/20" : LC_COLOR[s] === "red" ? "border-red-700 text-red-300 bg-red-900/20" : LC_COLOR[s] === "orange" ? "border-orange-700 text-orange-300 bg-orange-900/20" : "border-zinc-700 text-zinc-400 bg-zinc-900"}`}>{s}</span>
                  {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
          {connectors.map(c => (
            <div key={c.id} className="border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
              <span className="text-sm font-mono text-zinc-300 flex-1">{c.displayName}</span>
              <Badge label={ucp.lifecycle.get(c.id)} color={LC_COLOR[ucp.lifecycle.get(c.id)] ?? "gray"} />
            </div>
          ))}
        </div>
      )}

      {/* ── AUDIT ───────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-2">
          <span className="text-xs font-mono text-zinc-500">{audits.length} audit entries (append-only)</span>
          {audits.map(a => (
            <div key={a.id} className="flex items-center gap-3 text-xs font-mono bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
              <Badge label={a.event} color={a.event === "ERROR" ? "red" : a.event === "INSTALL" ? "green" : a.event === "LIFECYCLE_CHANGE" ? "blue" : "gray"} size="xs" />
              <span className="text-zinc-400 flex-1">{a.detail}</span>
              <span className="text-zinc-600">{a.connectorId.slice(0, 20)}</span>
              <span className="text-zinc-700">{new Date(a.timestamp).toISOString().slice(11, 19)}</span>
            </div>
          ))}
          {audits.length === 0 && <p className="text-zinc-500 text-sm">No audit entries yet.</p>}
        </div>
      )}

      {/* ── LOGS ────────────────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="space-y-1">
          <span className="text-xs font-mono text-zinc-500">{logs.length} log entries</span>
          {logs.map(l => (
            <div key={l.id} className="flex items-center gap-3 text-xs font-mono bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5">
              <Badge label={l.level} color={l.level === "ERROR" ? "red" : l.level === "WARN" ? "yellow" : l.level === "DEBUG" ? "gray" : "blue"} size="xs" />
              <span className="text-zinc-400 flex-1">{l.message}</span>
              <span className="text-zinc-700">{new Date(l.timestamp).toISOString().slice(11, 19)}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="text-zinc-500 text-sm">No log entries yet.</p>}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-600 font-mono">
          Sprint 6.3.0 · Universal Connector Platform Foundation · MemoryOS Engineering Operating System
        </p>
      </div>
    </div>
  );
}