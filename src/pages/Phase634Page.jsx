import React, { useState, useEffect, useCallback } from "react";
import { RuntimeBootstrap }         from "@/lib/runtime-persistence/RuntimeBootstrap";
import { RuntimePersistence }       from "@/lib/runtime-persistence/RuntimePersistence";
import { getDashboardSnapshot }     from "@/lib/runtime-persistence/PersistentRuntimeDashboard";

// ── UI Helpers ────────────────────────────────────────────────────────────────

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
  const c = { green: "text-green-300", yellow: "text-yellow-300", red: "text-red-400", blue: "text-blue-300", gray: "text-white", violet: "text-violet-300", orange: "text-orange-300" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
      <div className="text-xs font-mono text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold ${c[color] ?? c.gray}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

const STATUS_COLOR = {
  CONNECTED:       "green",
  RESTORING:       "blue",
  SESSION_EXPIRED: "yellow",
  DISCONNECTED:    "gray",
  ERROR:           "red",
  DISABLED:        "gray",
};

const PHASE_COLOR = {
  BOOT: "gray", RUNTIME: "blue", RESTORE_SESSIONS: "blue", WARMUP: "blue",
  HEALTH: "violet", KNOWLEDGE_GRAPH: "violet", ACCEPTANCE: "violet",
  DASHBOARD: "orange", READY: "green", FAILED: "red",
};

const PHASE_ORDER = [
  "BOOT","RUNTIME","RESTORE_SESSIONS","WARMUP","HEALTH",
  "KNOWLEDGE_GRAPH","ACCEPTANCE","DASHBOARD","READY",
];

const HEALTH_COLOR = { PASS: "green", FAIL: "red", DEGRADED: "yellow", SKIP: "gray" };

const TABS = ["overview","runtime","sessions","connectors","restore","health","reconnect","history","metrics","audit","logs"];

// ── Components ────────────────────────────────────────────────────────────────

function PhaseRow({ phase, result, active }) {
  const isActive = active === phase;
  const status = result?.status ?? (isActive ? "RUNNING" : "PENDING");
  const border = status === "FAIL" ? "border-red-800/50 bg-red-950/10"
    : status === "PASS"   ? "border-zinc-800 bg-zinc-900"
    : isActive            ? "border-violet-500/50 bg-violet-950/20"
    : "border-zinc-800/50 bg-zinc-900/50";
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded border transition-all ${border}`}>
      <span className="text-xs w-5">
        {status === "PASS" ? "✅" : status === "FAIL" ? "❌" : isActive ? <span className="text-violet-400 animate-pulse">●</span> : "○"}
      </span>
      <span className="text-xs font-mono text-zinc-400 w-44 shrink-0">{phase}</span>
      <Badge label={status} color={status === "PASS" ? "green" : status === "FAIL" ? "red" : isActive ? "violet" : "gray"} size="xs" />
      {result && <span className="text-xs text-zinc-500 flex-1 truncate">{result.detail}</span>}
      {result && <span className="text-xs text-zinc-700 font-mono shrink-0">{result.durationMs}ms</span>}
    </div>
  );
}

function SessionRow({ session }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs">
      <Badge label={session.status} color={STATUS_COLOR[session.status] ?? "gray"} />
      <span className="text-zinc-300 w-28 font-mono shrink-0">{session.provider}</span>
      <span className="text-zinc-400 flex-1 truncate">{session.displayName}</span>
      <span className="text-zinc-600 truncate max-w-xs">{session.statusReason}</span>
      <Badge label={session.health} color={session.health === "HEALTHY" ? "green" : session.health === "DEGRADED" ? "yellow" : "gray"} size="xs" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Phase634Page() {
  const [snap, setSnap]       = useState(() => getDashboardSnapshot());
  const [booting, setBooting] = useState(false);
  const [tab, setTab]         = useState("overview");
  const [livePhase, setLivePhase] = useState(RuntimeBootstrap.phase);

  // Refresh snapshot every 800ms
  useEffect(() => {
    const t = setInterval(() => setSnap(getDashboardSnapshot()), 800);
    return () => clearInterval(t);
  }, []);

  // Subscribe to phase changes
  useEffect(() => {
    const unsub = RuntimeBootstrap.onPhaseChange(p => setLivePhase(p));
    return unsub;
  }, []);

  const handleBoot = useCallback(async () => {
    setBooting(true);
    setTab("runtime");
    try { await RuntimeBootstrap.boot(); }
    finally { setBooting(false); setSnap(getDashboardSnapshot()); }
  }, []);

  const handleReboot = useCallback(async () => {
    setBooting(true);
    setTab("runtime");
    try { await RuntimeBootstrap.reboot(); }
    finally { setBooting(false); setSnap(getDashboardSnapshot()); }
  }, []);

  const handleAddDemo = useCallback(() => {
    RuntimePersistence.sessions.register({
      connectorId:  `github_${Date.now()}`,
      provider:     "GitHub",
      displayName:  "MemoryOS Repository",
      capabilities: ["READ", "WRITE", "WEBHOOK"],
      metadata:     { owner: "memoryos", repo: "memoryos-core" },
    });
    setSnap(getDashboardSnapshot());
  }, []);

  const report  = snap.lastReport;
  const phases  = report?.phases ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.3.4</span>
          <Badge label="PERSISTENT RUNTIME & CONNECTOR SESSIONS" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Persistent Runtime Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Auto-restore · Session persistence · Connector state sync · Zero-intervention startup
        </p>
      </div>

      {/* Boot controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={handleBoot} disabled={booting || snap.booted}
          className="px-5 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-semibold transition-colors">
          {booting ? "Booting…" : snap.booted ? "✅ Already Booted" : "▶ Boot Runtime"}
        </button>
        <button onClick={handleReboot} disabled={booting}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm transition-colors">
          ↺ Re-Boot
        </button>
        <button onClick={handleAddDemo} disabled={booting}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm transition-colors">
          + Demo Session
        </button>
        <Badge label={`Phase: ${livePhase}`} color={PHASE_COLOR[livePhase] ?? "gray"} />
        {snap.booted && <Badge label="READY ✅" color="green" />}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-mono uppercase whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ───────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="SESSIONS"     value={snap.sessionCount}    color="gray" />
            <StatCard label="CONNECTED"    value={snap.connectedCount}  color={snap.connectedCount > 0 ? "green" : "gray"} />
            <StatCard label="EXPIRED"      value={snap.expiredCount}    color={snap.expiredCount > 0 ? "yellow" : "gray"} />
            <StatCard label="ERRORS"       value={snap.errorCount}      color={snap.errorCount > 0 ? "red" : "gray"} />
            <StatCard label="BOOT SUCCESS" value={`${snap.successRate}%`} color={snap.successRate >= 80 ? "green" : "yellow"} />
            <StatCard label="BOOT RUNS"    value={snap.bootstrapCount}  color="blue" />
            <StatCard label="AUDIT TRAIL"  value={snap.auditCount}      color="gray" />
            <StatCard label="LAST BOOT"    value={snap.lastBootMs !== null ? `${snap.lastBootMs}ms` : "—"} color="blue" />
          </div>

          {/* Architecture flow */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <span className="text-xs font-mono text-zinc-500 uppercase">Startup Flow</span>
            <div className="flex flex-wrap gap-1 mt-3 items-center text-xs font-mono">
              {["Application Start","SHR","Runtime Restore","Session Manager","Connector Registry","Connector Runtime","Restore Sessions","Health Check","KG Validation","Dashboard Sync","READY"].map((s, i, arr) => (
                <React.Fragment key={s}>
                  <span className={`px-2 py-1 rounded border ${s === "READY" ? "border-green-600 bg-green-900/20 text-green-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>{s}</span>
                  {i < arr.length - 1 && <span className="text-zinc-700">↓</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Security notice */}
          <div className="border border-green-800/40 rounded-lg p-4 bg-green-950/10 space-y-1">
            <span className="text-xs font-mono text-green-500 uppercase">Security Guarantee</span>
            <p className="text-xs text-green-300">Only persisted: status · capabilities · health · metadata · timestamp</p>
            <p className="text-xs text-red-400">Never persisted: tokens · secrets · passwords · refresh tokens · client secrets · credentials</p>
          </div>
        </div>
      )}

      {/* ── RUNTIME ────────────────────────────────────────────────── */}
      {tab === "runtime" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{PHASE_ORDER.length} startup phases</p>
          {PHASE_ORDER.map(phase => {
            const result = phases.find(p => p.phase === phase);
            return <PhaseRow key={phase} phase={phase} result={result} active={booting ? livePhase : null} />;
          })}
          {!report && !booting && <p className="text-zinc-600 text-sm py-4">Click "Boot Runtime" to run the startup sequence.</p>}
        </div>
      )}

      {/* ── SESSIONS ───────────────────────────────────────────────── */}
      {tab === "sessions" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{snap.sessions.length} session(s)</p>
          {snap.sessions.length === 0 && (
            <div className="text-center py-12 text-zinc-600 space-y-2">
              <p className="text-3xl">📭</p>
              <p className="text-sm">No sessions yet. Connect a connector or click "+ Demo Session".</p>
            </div>
          )}
          {snap.sessions.map(s => <SessionRow key={s.id} session={s} />)}
        </div>
      )}

      {/* ── CONNECTORS ─────────────────────────────────────────────── */}
      {tab === "connectors" && (
        <div className="space-y-3">
          {["GitHub", "Base44", "Google Calendar", "Google Drive", "Gmail"].map(provider => {
            const sessions = snap.sessions.filter(s => s.provider === provider);
            const session  = sessions[0];
            return (
              <div key={provider} className="border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{provider}</p>
                  {session && <p className="text-xs text-zinc-500 mt-0.5">{session.statusReason}</p>}
                </div>
                <Badge label={session?.status ?? "DISCONNECTED"} color={STATUS_COLOR[session?.status ?? "DISCONNECTED"] ?? "gray"} />
                {!session && <span className="text-xs text-zinc-600 font-mono">No session</span>}
                {session && <Badge label={session.health} color={session.health === "HEALTHY" ? "green" : "yellow"} size="xs" />}
              </div>
            );
          })}
          <p className="text-xs text-zinc-600 font-mono">Additional connectors registered via UCP appear here automatically.</p>
        </div>
      )}

      {/* ── RESTORE ────────────────────────────────────────────────── */}
      {tab === "restore" && (
        <div className="space-y-3">
          {report?.restoreResult ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="TOTAL"    value={report.restoreResult.total}    color="gray" />
              <StatCard label="RESTORED" value={report.restoreResult.restored} color="green" />
              <StatCard label="EXPIRED"  value={report.restoreResult.expired}  color="yellow" />
              <StatCard label="FAILED"   value={report.restoreResult.failed}   color="red" />
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">Run Boot to see restore results.</p>
          )}
          {report?.restoreResult?.sessions.map(s => <SessionRow key={s.id} session={s} />)}
        </div>
      )}

      {/* ── HEALTH ─────────────────────────────────────────────────── */}
      {tab === "health" && (
        <div className="space-y-2">
          {!report?.healthChecks?.length && <p className="text-zinc-600 text-sm">Run Boot to see health checks.</p>}
          {report?.healthChecks?.map(h => (
            <div key={h.component} className={`flex items-center gap-3 px-3 py-2 rounded border text-xs font-mono ${h.status === "PASS" ? "border-zinc-800 bg-zinc-900" : h.status === "FAIL" ? "border-red-800/50 bg-red-950/10" : "border-yellow-800/50 bg-yellow-950/10"}`}>
              <Badge label={h.status} color={HEALTH_COLOR[h.status] ?? "gray"} size="xs" />
              <span className="text-zinc-400 w-44 shrink-0">{h.component}</span>
              <span className="text-zinc-300 flex-1">{h.detail}</span>
              <span className="text-zinc-600">{h.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}

      {/* ── RECONNECT ──────────────────────────────────────────────── */}
      {tab === "reconnect" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{snap.reconnectHistory.length} reconnect attempt(s)</p>
          {snap.reconnectHistory.length === 0 && <p className="text-zinc-600 text-sm">No reconnect attempts yet.</p>}
          {snap.reconnectHistory.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono">
              <Badge label={r.result} color={r.result === "RECONNECTED" ? "green" : r.result === "SESSION_EXPIRED" ? "yellow" : "red"} size="xs" />
              <span className="text-zinc-400 w-20 shrink-0">{r.provider}</span>
              <span className="text-zinc-300 flex-1 truncate">{r.detail}</span>
              <span className="text-zinc-600">{r.durationMs}ms</span>
            </div>
          ))}
          <div className="border border-yellow-800/40 rounded-lg p-3 bg-yellow-950/10 mt-4">
            <p className="text-xs text-yellow-300">Auto-reconnect never executes new OAuth flows. If a session is expired, manual reconnection is required via the Connections page.</p>
          </div>
        </div>
      )}

      {/* ── HISTORY ────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">{snap.bootstrapCount} boot(s) in history</p>
          {RuntimePersistence.history.all().map((r, i) => (
            <div key={r.id} className={`border rounded-lg p-4 space-y-2 ${r.success ? "border-zinc-800 bg-zinc-900" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={r.success ? "SUCCESS" : "FAILED"} color={r.success ? "green" : "red"} />
                <Badge label={r.phase} color={PHASE_COLOR[r.phase] ?? "gray"} size="xs" />
                <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
                <span className="text-zinc-600 text-xs">· {r.phases.length} phases · {r.healthChecks.length} health checks</span>
              </div>
              {r.errors.length > 0 && r.errors.map((e, j) => <p key={j} className="text-xs text-red-400 font-mono">{e}</p>)}
            </div>
          ))}
          {!RuntimePersistence.history.count() && <p className="text-zinc-600 text-sm">No boot history yet.</p>}
        </div>
      )}

      {/* ── METRICS ────────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="BOOT RUNS"    value={snap.bootstrapCount}   color="gray" />
          <StatCard label="SUCCESS RATE" value={`${snap.successRate}%`} color={snap.successRate >= 80 ? "green" : "yellow"} />
          <StatCard label="SESSIONS"     value={snap.sessionCount}     color="gray" />
          <StatCard label="CONNECTED"    value={snap.connectedCount}   color="green" />
          <StatCard label="EXPIRED"      value={snap.expiredCount}     color="yellow" />
          <StatCard label="ERRORS"       value={snap.errorCount}       color="red" />
          <StatCard label="AUDIT ENTRIES" value={snap.auditCount}      color="gray" />
          <StatCard label="RECONNECTS"   value={snap.reconnectHistory.length} color="blue" />
        </div>
      )}

      {/* ── AUDIT ──────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-zinc-500">{snap.recentAudit.length} recent audit entries</p>
          {snap.recentAudit.length === 0 && <p className="text-zinc-600 text-sm">No audit entries yet.</p>}
          {snap.recentAudit.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono">
              <span className="text-zinc-600 w-24 shrink-0">{e.actor}</span>
              <Badge label={e.action} color="blue" size="xs" />
              <span className="text-zinc-400 w-32 shrink-0 truncate">{e.target}</span>
              <Badge label={e.result} color={e.result === "PASS" ? "green" : e.result === "FAIL" ? "red" : "gray"} size="xs" />
              <span className="text-zinc-500 flex-1 truncate">{e.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── LOGS ───────────────────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-zinc-500">Bootstrap phase log</p>
          {!phases.length && <p className="text-zinc-600 text-sm">No phase log yet.</p>}
          {phases.map((p, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded border text-xs font-mono ${p.status === "FAIL" ? "border-red-800/50 bg-red-950/10" : "border-zinc-800 bg-zinc-900"}`}>
              <Badge label={p.status} color={p.status === "PASS" ? "green" : "red"} size="xs" />
              <span className="text-zinc-400 w-36 shrink-0">{p.phase}</span>
              <span className="text-zinc-300 flex-1">{p.detail}</span>
              <span className="text-zinc-600">{p.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs font-mono text-zinc-600">
          Sprint 6.3.4 · Persistent Runtime · Application Start → SHR → Restore → Health → KG → READY
        </p>
      </div>
    </div>
  );
}