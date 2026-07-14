import React, { useState, useRef, useEffect } from "react";
import { RuntimeSupervisor }   from "@/lib/self-healing-runtime/RuntimeSupervisor";
import { RuntimeDiagnostics }  from "@/lib/self-healing-runtime/RuntimeDiagnostics";

// ── HMR-safe singleton ────────────────────────────────────────────────────────
const G = globalThis;
if (!G.__phase631_sup) G.__phase631_sup = new RuntimeSupervisor();
const supervisor = G.__phase631_sup;
const diag = new RuntimeDiagnostics();

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ label, color = "gray", size = "sm" }) {
  const c = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    violet: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    orange: "bg-orange-900/40 text-orange-300 border border-orange-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return <span className={`${sz} font-mono rounded ${c[color] ?? c.gray}`}>{label}</span>;
}

function StatCard({ label, value, color = "gray", sub }) {
  const c = { green: "text-green-300", yellow: "text-yellow-300", red: "text-red-400", blue: "text-blue-300", gray: "text-white", violet: "text-violet-300" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
      <div className="text-xs font-mono text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold ${c[color] ?? c.gray}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

const STATE_COLOR = {
  READY: "green", STARTING: "blue", RESTARTING: "orange",
  RECOVERING: "yellow", DEGRADED: "yellow", FAILED: "red",
  STOPPED: "gray", IDLE: "gray",
};

const TABS = ["overview", "lifecycle", "restart", "recovery", "warmup", "dependencies", "metrics", "audit", "history", "logs"];

const WATCH_TRIGGERS = ["CODE_CHANGE", "CONFIG_CHANGE", "CONNECTOR_CHANGE", "MODULE_UPDATE", "KG_CHANGE", "MANUAL"];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Phase631Page() {
  const [state, setState] = useState(supervisor.state());
  const [tab, setTab] = useState("overview");
  const [starting, setStarting] = useState(false);
  const [triggerModule, setTriggerModule] = useState("KnowledgeGraphStore");
  const [triggerType, setTriggerType] = useState("MANUAL");
  const [triggering, setTriggering] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [, forceUpdate] = useState(0);
  const refreshRef = useRef(null);

  // Poll for state changes
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      setState(supervisor.state());
      forceUpdate(n => n + 1);
    }, 1000);
    return () => clearInterval(refreshRef.current);
  }, []);

  async function handleStart() {
    if (starting || supervisor.isRunning()) return;
    setStarting(true);
    try { await supervisor.start(); } finally {
      setStarting(false);
      setState(supervisor.state());
    }
  }

  function handleStop() {
    supervisor.stop();
    setState(supervisor.state());
  }

  async function handleTrigger() {
    if (!supervisor.isRunning() || triggering) return;
    setTriggering(true);
    try { await supervisor.triggerManual(triggerModule, `Manual trigger from dashboard — type: ${triggerType}`); }
    finally { setTriggering(false); forceUpdate(n => n + 1); }
  }

  async function handleDiag() {
    setDiagRunning(true);
    try { setDiagnosticResult(await diag.run(supervisor.state())); }
    finally { setDiagRunning(false); }
  }

  const metrics = supervisor.metrics.snapshot();
  const healthReport = supervisor.health.evaluate();
  const auditEntries = supervisor.audit.all();
  const snapshotList = supervisor.snapshot.all();
  const warmupHistory = supervisor.warmup.history();
  const recoveryHistory = supervisor.recoveryHistory.all();
  const restartHistory = supervisor.restartManager.history();
  const lifecycleHist  = supervisor.lifecycle.history();
  const watcherHistory = supervisor.watcher.history();
  const depMap = supervisor.resolver.builtinDependencyMap();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.3.1</span>
          <Badge label="SELF-HEALING RUNTIME" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Runtime Supervisor Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Automatic restart · State snapshot · Dependency resolution · Recovery · Warm-up · Zero human intervention
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {!supervisor.isRunning() ? (
          <button onClick={handleStart} disabled={starting}
            className="px-5 py-2.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-semibold transition-colors">
            {starting ? "Starting…" : "▶ Start Runtime Supervisor"}
          </button>
        ) : (
          <button onClick={handleStop}
            className="px-5 py-2.5 rounded bg-zinc-700 hover:bg-zinc-600 text-sm font-semibold transition-colors">
            ■ Stop
          </button>
        )}
        <Badge label={`State: ${state}`} color={STATE_COLOR[state] ?? "gray"} />
        <Badge label={`Health: ${healthReport.status}`} color={STATE_COLOR[healthReport.status] ?? "gray"} />
        <Badge label={`Score: ${healthReport.score}%`} color={healthReport.score === 100 ? "green" : "yellow"} />
        <button onClick={handleDiag} disabled={diagRunning}
          className="px-4 py-2 rounded bg-blue-800 hover:bg-blue-700 disabled:opacity-40 text-sm transition-colors">
          {diagRunning ? "Diagnosing…" : "Run Diagnostics"}
        </button>
      </div>

      {/* Manual trigger panel */}
      {supervisor.isRunning() && (
        <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Manual Trigger (Test Harness)</span>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={triggerModule} onChange={e => setTriggerModule(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none">
              {Object.keys(depMap).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={triggerType} onChange={e => setTriggerType(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none">
              {WATCH_TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={handleTrigger} disabled={triggering}
              className="px-4 py-2 rounded bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-sm font-semibold transition-colors">
              {triggering ? "Triggering…" : "⚡ Fire Trigger"}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-mono uppercase whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="RUNTIME STATE"    value={state}                                   color={STATE_COLOR[state] ?? "gray"} />
            <StatCard label="HEALTH STATUS"    value={healthReport.status}                     color={STATE_COLOR[healthReport.status] ?? "gray"} />
            <StatCard label="HEALTH SCORE"     value={`${healthReport.score}%`}                color={healthReport.score === 100 ? "green" : "yellow"} />
            <StatCard label="UPTIME"           value={`${Math.round(supervisor.lifecycle.uptimeMs() / 1000)}s`} color="blue" />
            <StatCard label="TOTAL RESTARTS"   value={metrics.totalRestarts}   color="gray" />
            <StatCard label="TOTAL RECOVERIES" value={metrics.totalRecoveries} color="gray" />
            <StatCard label="TOTAL WARMUPS"    value={metrics.totalWarmups}    color="gray" />
            <StatCard label="AVAILABILITY"     value={`${metrics.availabilityPercent}%`}       color={metrics.availabilityPercent >= 99 ? "green" : "yellow"} />
          </div>

          {/* Module health */}
          {healthReport.details.length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
              <span className="text-xs font-mono text-zinc-500 uppercase">Module States ({healthReport.totalModules})</span>
              <div className="flex flex-wrap gap-2">
                {healthReport.details.map(d => (
                  <div key={d.moduleId} className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900 rounded border border-zinc-800 text-xs font-mono">
                    <span className={d.state === "READY" ? "text-green-400" : d.state === "DEGRADED" ? "text-yellow-400" : "text-red-400"}>●</span>
                    {d.moduleId}
                    <Badge label={d.state} color={d.state === "READY" ? "green" : d.state === "DEGRADED" ? "yellow" : "red"} size="xs" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnostic result */}
          {diagnosticResult && (
            <div className={`border rounded-lg p-4 space-y-3 ${diagnosticResult.overall ? "border-green-700/40 bg-green-950/10" : "border-yellow-700/40 bg-yellow-950/10"}`}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{diagnosticResult.overall ? "✅ All Diagnostics Passed" : "⚠ Diagnostic Issues Found"}</span>
                <Badge label={diagnosticResult.runtimeState} color={STATE_COLOR[diagnosticResult.runtimeState] ?? "gray"} />
              </div>
              <div className="space-y-1">
                {diagnosticResult.details.map(c => (
                  <div key={c.name} className="flex items-center gap-3 text-xs font-mono">
                    <span>{c.passed ? "✅" : "❌"}</span>
                    <span className="text-zinc-400 w-40 shrink-0">{c.name}</span>
                    <span className={c.passed ? "text-green-400" : "text-red-400"}>{c.detail}</span>
                    <span className="text-zinc-600">{c.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Watcher trigger count */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="WATCH TRIGGERS FIRED" value={supervisor.watcher.triggerCount()} color="orange" />
            <StatCard label="SNAPSHOTS CAPTURED"   value={snapshotList.length}               color="blue" />
            <StatCard label="AUDIT ENTRIES"        value={auditEntries.length}               color="gray" />
          </div>
        </div>
      )}

      {/* ── LIFECYCLE ─────────────────────────────────────────────────── */}
      {tab === "lifecycle" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">State machine transitions · {lifecycleHist.length} recorded</p>
          {lifecycleHist.length === 0 && <p className="text-zinc-600 text-sm">No transitions yet. Start the supervisor first.</p>}
          {lifecycleHist.map((h, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded border border-zinc-800 bg-zinc-900 text-xs font-mono">
              <Badge label={h.state} color={STATE_COLOR[h.state] ?? "gray"} />
              <span className="text-zinc-600">{new Date(h.at).toISOString().slice(11, 23)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── RESTART ───────────────────────────────────────────────────── */}
      {tab === "restart" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">Restart operations · {restartHistory.length} recorded</p>
          {restartHistory.length === 0 && <p className="text-zinc-600 text-sm">No restarts yet. Fire a trigger to start the pipeline.</p>}
          {restartHistory.map((r) => (
            <div key={r.planId} className={`border rounded-lg p-3 space-y-2 ${r.success ? "border-zinc-800 bg-zinc-900" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={r.success ? "SUCCESS" : "PARTIAL"} color={r.success ? "green" : "yellow"} />
                <span className="text-xs font-mono text-zinc-500">{r.planId}</span>
                <span className="text-xs text-zinc-400">{r.durationMs}ms</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {r.restarted.map(m => <Badge key={m} label={`↺ ${m}`} color="green" size="xs" />)}
                {r.failed.map(m => <Badge key={m} label={`✗ ${m}`} color="red" size="xs" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── RECOVERY ──────────────────────────────────────────────────── */}
      {tab === "recovery" && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <StatCard label="SUCCESS RATE" value={`${supervisor.recoveryHistory.successRate()}%`} color="green" />
            <StatCard label="AVG DURATION" value={`${supervisor.recoveryHistory.avgDurationMs()}ms`} color="blue" />
            <StatCard label="TOTAL"        value={recoveryHistory.length} color="gray" />
          </div>
          {recoveryHistory.length === 0 && <p className="text-zinc-600 text-sm">No recovery operations yet.</p>}
          {recoveryHistory.map(r => (
            <div key={r.id} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={r.finalResult} color={r.finalResult === "RECOVERED" ? "green" : "yellow"} />
                <span className="text-xs font-mono text-zinc-400">{r.moduleId}</span>
                <span className="text-xs text-zinc-500">{r.attempts} attempt(s) · {r.totalDurationMs}ms</span>
              </div>
              {r.rca && <p className="text-xs text-red-400 font-mono">{r.rca}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── WARMUP ────────────────────────────────────────────────────── */}
      {tab === "warmup" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">{warmupHistory.length} warmup run(s)</p>
          {warmupHistory.length === 0 && <p className="text-zinc-600 text-sm">No warmup runs yet. Start the supervisor.</p>}
          {warmupHistory.map((w, i) => (
            <div key={w.id} className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 space-y-3">
              <div className="flex items-center gap-3">
                <Badge label={w.success ? "PASS" : "FAIL"} color={w.success ? "green" : "red"} />
                <span className="text-xs font-mono text-zinc-500">Run #{warmupHistory.length - i}</span>
                <span className="text-xs text-zinc-600">{w.durationMs}ms</span>
              </div>
              <div className="space-y-1">
                {w.steps.map(s => (
                  <div key={s.name} className="flex items-center gap-3 text-xs font-mono">
                    <span>{s.success ? "✅" : "❌"}</span>
                    <span className="w-28 text-zinc-400">{s.name}</span>
                    <span className={s.success ? "text-green-400" : "text-red-400"}>{s.detail}</span>
                    <span className="text-zinc-600">{s.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── DEPENDENCIES ──────────────────────────────────────────────── */}
      {tab === "dependencies" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500 uppercase">Built-in Dependency Map — {Object.keys(depMap).length} modules</p>
          {Object.entries(depMap).map(([mod, deps]) => (
            <div key={mod} className="flex flex-wrap items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono">
              <span className="text-violet-300 w-48 shrink-0">{mod}</span>
              <span className="text-zinc-600 shrink-0">←</span>
              {deps.length === 0
                ? <span className="text-zinc-700">no dependencies</span>
                : deps.map(d => <Badge key={d} label={d} color="blue" size="xs" />)}
            </div>
          ))}
        </div>
      )}

      {/* ── METRICS ───────────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="AVG RESTART"   value={`${metrics.avgRestartMs}ms`}   color="blue" />
            <StatCard label="AVG RECOVERY"  value={`${metrics.avgRecoveryMs}ms`}  color="blue" />
            <StatCard label="AVG WARMUP"    value={`${metrics.avgWarmupMs}ms`}    color="blue" />
            <StatCard label="AVAILABILITY"  value={`${metrics.availabilityPercent}%`} color={metrics.availabilityPercent >= 99 ? "green" : "yellow"} />
            <StatCard label="SUCCESS RATE"  value={`${metrics.successRate}%`}     color={metrics.successRate === 100 ? "green" : "yellow"} />
            <StatCard label="UPTIME"        value={`${Math.round(metrics.uptimeMs / 1000)}s`} color="gray" />
            <StatCard label="TOTAL RESTARTS" value={metrics.totalRestarts}  color="gray" />
            <StatCard label="TOTAL WARMUPS"  value={metrics.totalWarmups}   color="gray" />
          </div>
          {metrics.lastRestartAt && (
            <p className="text-xs font-mono text-zinc-500">Last restart: {new Date(metrics.lastRestartAt).toISOString()}</p>
          )}
        </div>
      )}

      {/* ── AUDIT ─────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{auditEntries.length} audit entries (append-only)</p>
          {auditEntries.length === 0 && <p className="text-zinc-600 text-sm">No audit entries yet.</p>}
          {auditEntries.slice(0, 50).map(e => (
            <div key={e.id} className="border border-zinc-800 rounded p-3 bg-zinc-900 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge label={e.result} color={e.result === "SUCCESS" ? "green" : e.result === "PARTIAL" ? "yellow" : "red"} />
                <span className="font-mono text-zinc-300">{e.action}</span>
                <Badge label={e.trigger} color="orange" size="xs" />
                <span className="text-zinc-600">{e.durationMs}ms</span>
                <span className="text-zinc-700">{new Date(e.timestamp).toISOString().slice(11, 23)}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {e.modules.map(m => <Badge key={m} label={m} color="blue" size="xs" />)}
              </div>
              {e.rca && <p className="text-xs text-red-400 font-mono">{e.rca}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── HISTORY ───────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500 uppercase">Snapshot History — {snapshotList.length} captured</p>
          {snapshotList.length === 0 && <p className="text-zinc-600 text-sm">No snapshots yet. Fire a trigger to capture one.</p>}
          {snapshotList.map(s => (
            <div key={s.id} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 text-xs font-mono space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={s.trigger} color="orange" />
                <Badge label={s.runtimeState} color={STATE_COLOR[s.runtimeState] ?? "gray"} />
                <span className="text-zinc-500">{new Date(s.capturedAt).toISOString().slice(11, 23)}</span>
              </div>
              <div className="text-zinc-400">
                KG: {s.kgState.isReady ? `${s.kgState.entityCount} entities · ${s.kgState.relationshipCount} rels` : "not ready"} ·
                Connectors: {s.connectorCount} ·
                Memory: {s.memorySnapshot.implementationCount} impls
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LOGS ──────────────────────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{supervisor.log().length} log entries</p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-h-96 overflow-y-auto space-y-0.5">
            {supervisor.log().length === 0 && <p className="text-zinc-600 text-xs">No logs yet.</p>}
            {supervisor.log().map((line, i) => (
              <p key={i} className="text-xs font-mono text-zinc-400">{line}</p>
            ))}
          </div>
          {watcherHistory.length > 0 && (
            <>
              <p className="text-xs font-mono text-zinc-500 mt-4">Watcher Events — {watcherHistory.length}</p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-h-64 overflow-y-auto space-y-1">
                {watcherHistory.slice(0, 30).map(w => (
                  <div key={w.id} className="flex gap-3 text-xs font-mono text-zinc-400">
                    <Badge label={w.trigger} color="orange" size="xs" />
                    <span className="text-violet-300">{w.affectedModule}</span>
                    <span className="text-zinc-600">{w.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs font-mono text-zinc-600">
          Sprint 6.3.1 · Self-Healing Runtime · Automatic restart · Zero human intervention ·
          Architecture: EW → EI → EGov → AA → EMem → UCP → SHR → Application
        </p>
      </div>
    </div>
  );
}