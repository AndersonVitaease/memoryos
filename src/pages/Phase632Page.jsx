import React, { useState, useRef, useEffect } from "react";
import { EAF, EAFRegistry } from "@/lib/engineering-acceptance/EngineeringAcceptanceFramework";

// ── UI helpers ────────────────────────────────────────────────────────────────

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

const STATUS_COLOR = {
  PASS: "green", FAIL: "red", SKIP: "yellow", BLOCKED: "red", PENDING: "gray", RUNNING: "blue",
};
const CAT_COLOR = {
  REGRESSION_SHIELD: "red", SMOKE: "yellow", ACCEPTANCE: "violet",
  GOVERNANCE: "orange", ARCHITECTURE: "blue", MEMORY: "green", RUNTIME: "orange", CONNECTOR: "blue",
};

const TABS = ["overview", "queue", "running", "assertions", "evidence", "metrics", "history", "audit", "reports", "logs"];

const SPRINT_IDS = ["6.3.1", "6.3.2"];

function AssertionRow({ a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded border ${a.status === "FAIL" || a.status === "BLOCKED" ? "border-red-800/50 bg-red-950/10" : "border-zinc-800 bg-zinc-900"}`}>
      <button className="w-full flex items-center gap-3 px-3 py-2 text-left" onClick={() => setOpen(o => !o)}>
        <Badge label={a.status} color={STATUS_COLOR[a.status] ?? "gray"} />
        <Badge label={a.category} color={CAT_COLOR[a.category] ?? "gray"} size="xs" />
        <span className="text-sm text-zinc-300 flex-1 text-left">{a.description}</span>
        <span className="text-xs text-zinc-600 font-mono">{a.durationMs}ms</span>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-zinc-800 space-y-1">
          <p className="text-xs text-zinc-400">{a.detail}</p>
          {a.rca && <p className="text-xs text-red-400 font-mono">RCA: {a.rca}</p>}
          {a.evidence?.length > 0 && (
            <div className="space-y-0.5 mt-1">
              <p className="text-xs font-mono text-zinc-600">Evidence ({a.evidence.length}):</p>
              {a.evidence.map((e, i) => (
                <p key={i} className="text-xs font-mono text-zinc-500">
                  [{e.kind}] {e.label}: {typeof e.value === "object" ? JSON.stringify(e.value).slice(0, 80) : String(e.value)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Phase632Page() {
  const [tab, setTab]         = useState("overview");
  const [selectedSprint, setSelectedSprint] = useState("6.3.1");
  const [runResult, setRunResult]   = useState(null);
  const [running, setRunning]       = useState(false);
  const [progress, setProgress]     = useState({ stage: "", done: 0, total: 0 });
  const [dashState, setDashState]   = useState(EAF.dashboardState());
  const [, forceUpdate]             = useState(0);

  // Refresh dashboard state every second
  useEffect(() => {
    const t = setInterval(() => {
      setDashState(EAF.dashboardState());
      forceUpdate(n => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  EAF.onProgress = (stage, done, total) => setProgress({ stage, done, total });

  async function handleRun(sprintId) {
    if (running) return;
    setRunning(true);
    setRunResult(null);
    setTab("running");
    try {
      const result = await EAF.runSprint(sprintId);
      setRunResult(result);
      setDashState(EAF.dashboardState());
      setTab("assertions");
    } finally {
      setRunning(false);
    }
  }

  function handleEnqueue(sprintId) {
    EAF.enqueue(sprintId);
    setDashState(EAF.dashboardState());
  }

  const metrics   = dashState.metrics;
  const lastRuns  = dashState.lastRuns;
  const reports   = dashState.reports;
  const auditList = EAF.audit().all();
  const logList   = EAF.log();
  const evidenceList = EAF.evidence.all();
  const historyRuns  = EAF.history().allRuns();
  const allSprints   = EAFRegistry.all();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.3.2</span>
          <Badge label="ENGINEERING ACCEPTANCE FRAMEWORK" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Acceptance Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Every sprint validated · tested · inspected · audited · approved before READY
        </p>
      </div>

      {/* Run controls */}
      <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Run Acceptance Pipeline</span>
        <div className="flex flex-wrap gap-3 items-center">
          <select value={selectedSprint} onChange={e => setSelectedSprint(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none">
            {SPRINT_IDS.map(id => <option key={id} value={id}>Sprint {id}</option>)}
          </select>
          <button onClick={() => handleRun(selectedSprint)} disabled={running}
            className="px-5 py-2.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-semibold transition-colors">
            {running ? "Running…" : "▶ Run Acceptance"}
          </button>
          <button onClick={() => handleEnqueue(selectedSprint)} disabled={running}
            className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-sm transition-colors">
            + Enqueue
          </button>
          {runResult && (
            <Badge
              label={runResult.ready ? `READY ✅ — ${runResult.score}%` : `NOT READY ❌ — ${runResult.score}%`}
              color={runResult.ready ? "green" : "red"}
            />
          )}
        </div>
        {running && (
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span className="animate-pulse text-violet-400">●</span>
              Stage: <span className="text-violet-300">{progress.stage || "initializing"}</span>
              {progress.total > 0 && <span>({progress.done}/{progress.total})</span>}
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5">
              <div className="bg-violet-500 h-1.5 rounded-full transition-all"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "10%" }} />
            </div>
          </div>
        )}
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

      {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="REGISTERED SPRINTS" value={allSprints.length}          color="blue" />
            <StatCard label="TOTAL RUNS"          value={metrics.totalRuns}          color="gray" />
            <StatCard label="PASS RATE"           value={`${metrics.passRate}%`}     color={metrics.passRate === 100 ? "green" : "yellow"} />
            <StatCard label="AVG SCORE"           value={`${metrics.avgScore}%`}     color={metrics.avgScore >= 80 ? "green" : "yellow"} />
            <StatCard label="AVG DURATION"        value={`${metrics.avgDurationMs}ms`} color="blue" />
            <StatCard label="AVG CONFIDENCE"      value={`${metrics.avgConfidence}%`}  color="gray" />
            <StatCard label="AUDIT ENTRIES"       value={dashState.auditCount}          color="gray" />
            <StatCard label="EVIDENCE ITEMS"      value={dashState.evidenceCount}       color="gray" />
          </div>

          {/* Registered sprints */}
          <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
            <span className="text-xs font-mono text-zinc-500 uppercase">Registered Sprints</span>
            {allSprints.map(s => {
              const last = lastRuns.find(r => r.sprintId === s.sprintId);
              return (
                <div key={s.sprintId} className="flex flex-wrap items-center gap-3 px-3 py-3 bg-zinc-900 rounded border border-zinc-800">
                  <span className="text-sm font-semibold text-white">Sprint {s.sprintId}</span>
                  <span className="text-xs text-zinc-400 flex-1">{s.objective}</span>
                  <Badge label={`${s.criteria.length} criteria`} color="blue" size="xs" />
                  {last ? (
                    <Badge label={last.ready ? "READY" : "NOT READY"} color={last.ready ? "green" : "red"} size="xs" />
                  ) : (
                    <Badge label="NOT RUN" color="gray" size="xs" />
                  )}
                  <button onClick={() => { setSelectedSprint(s.sprintId); handleRun(s.sprintId); }}
                    disabled={running}
                    className="text-xs px-3 py-1 rounded bg-violet-700 hover:bg-violet-600 disabled:opacity-40 transition-colors">
                    Run ▶
                  </button>
                </div>
              );
            })}
          </div>

          {/* Architecture position */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <span className="text-xs font-mono text-zinc-500 uppercase">Architecture Position</span>
            <div className="flex flex-wrap gap-1 mt-3 items-center text-xs font-mono">
              {["EW", "EI", "EMem", "EGov", "AA", "Regression Shield", "SHR", "EAF", "READY"].map((s, i, arr) => (
                <React.Fragment key={s}>
                  <span className={`px-2 py-1 rounded border ${s === "EAF" ? "border-violet-500 bg-violet-900/30 text-violet-200" : s === "READY" ? "border-green-600 bg-green-900/20 text-green-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>{s}</span>
                  {i < arr.length - 1 && <span className="text-zinc-700">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── QUEUE ────────────────────────────────────────────────────── */}
      {tab === "queue" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">{dashState.queue.length} sprint(s) in queue</p>
          {dashState.queue.length === 0 && <p className="text-zinc-600 text-sm">Queue is empty. Use "+ Enqueue" to add sprints.</p>}
          {dashState.queue.map((id, i) => (
            <div key={id} className="flex items-center gap-3 px-3 py-3 bg-zinc-900 border border-zinc-800 rounded">
              <span className="text-zinc-600 font-mono text-xs">#{i + 1}</span>
              <span className="text-sm font-semibold">Sprint {id}</span>
              <button onClick={() => handleRun(id)} disabled={running}
                className="ml-auto text-xs px-3 py-1 rounded bg-violet-700 hover:bg-violet-600 disabled:opacity-40">
                Run ▶
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── RUNNING ──────────────────────────────────────────────────── */}
      {tab === "running" && (
        <div className="space-y-4">
          {!running && !runResult && <p className="text-zinc-600 text-sm">No active run. Select a sprint and press Run Acceptance.</p>}
          {running && (
            <div className="border border-violet-700/40 rounded-lg p-6 bg-violet-950/10 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-violet-300 text-xl animate-pulse">⚙</span>
                <div>
                  <p className="text-violet-200 font-semibold">Running acceptance pipeline for Sprint {selectedSprint}</p>
                  <p className="text-violet-500 text-xs mt-0.5">Stage: {progress.stage || "initializing…"}</p>
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div className="bg-violet-500 h-2 rounded-full transition-all"
                  style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "5%" }} />
              </div>
              <p className="text-xs font-mono text-zinc-500">{progress.done}/{progress.total} scenarios complete</p>
            </div>
          )}
          {!running && runResult && (
            <div className={`border rounded-lg p-4 ${runResult.ready ? "border-green-700/40 bg-green-950/10" : "border-red-700/40 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-lg">{runResult.ready ? "✅" : "❌"}</span>
                <span className={`font-semibold text-sm ${runResult.ready ? "text-green-200" : "text-red-200"}`}>
                  Sprint {runResult.sprintId} — {runResult.ready ? "READY" : "NOT READY"}
                </span>
                <Badge label={`Score: ${runResult.score}%`} color={runResult.score === 100 ? "green" : "yellow"} />
                <Badge label={`Confidence: ${runResult.confidence}%`} color="blue" />
                <Badge label={`${runResult.durationMs}ms`} color="gray" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="PASSED"  value={runResult.passed}  color="green" />
                <StatCard label="FAILED"  value={runResult.failed}  color={runResult.failed > 0 ? "red" : "gray"} />
                <StatCard label="SKIPPED" value={runResult.skipped} color="yellow" />
                <StatCard label="BLOCKED" value={runResult.blocked} color={runResult.blocked > 0 ? "red" : "gray"} />
              </div>
              {runResult.blockers.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-mono text-red-400">Blockers:</p>
                  {runResult.blockers.map((b, i) => <p key={i} className="text-xs text-red-300 font-mono">• {b}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ASSERTIONS ───────────────────────────────────────────────── */}
      {tab === "assertions" && (
        <div className="space-y-2">
          {!runResult && <p className="text-zinc-600 text-sm">Run an acceptance pipeline to see assertions.</p>}
          {runResult && (
            <>
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge label={`Total: ${runResult.total}`} color="gray" />
                <Badge label={`Pass: ${runResult.passed}`} color="green" />
                {runResult.failed > 0 && <Badge label={`Fail: ${runResult.failed}`} color="red" />}
                {runResult.skipped > 0 && <Badge label={`Skip: ${runResult.skipped}`} color="yellow" />}
              </div>
              {runResult.assertions.map(a => <AssertionRow key={a.criterionId} a={a} />)}
            </>
          )}
        </div>
      )}

      {/* ── EVIDENCE ─────────────────────────────────────────────────── */}
      {tab === "evidence" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{evidenceList.length} evidence entries (append-only)</p>
          {evidenceList.length === 0 && <p className="text-zinc-600 text-sm">No evidence yet. Run an acceptance pipeline first.</p>}
          {evidenceList.slice(0, 100).map(e => (
            <div key={e.id} className="flex items-start gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono">
              <Badge label={e.kind} color="blue" size="xs" />
              <span className="text-zinc-400 w-32 shrink-0">{e.label}</span>
              <span className="text-zinc-300 flex-1 break-all">
                {typeof e.value === "object" ? JSON.stringify(e.value).slice(0, 120) : String(e.value)}
              </span>
              <span className="text-zinc-700 shrink-0">{new Date(e.capturedAt).toISOString().slice(11, 23)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── METRICS ──────────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="TOTAL RUNS"     value={metrics.totalRuns}           color="gray" />
            <StatCard label="PASS RATE"      value={`${metrics.passRate}%`}      color={metrics.passRate === 100 ? "green" : "yellow"} />
            <StatCard label="FAIL RATE"      value={`${metrics.failRate}%`}      color={metrics.failRate === 0 ? "gray" : "red"} />
            <StatCard label="AVG DURATION"   value={`${metrics.avgDurationMs}ms`} color="blue" />
            <StatCard label="AVG SCORE"      value={`${metrics.avgScore}%`}      color={metrics.avgScore >= 80 ? "green" : "yellow"} />
            <StatCard label="AVG CONFIDENCE" value={`${metrics.avgConfidence}%`} color="blue" />
            <StatCard label="RERUNS"         value={metrics.reruns}              color="orange" />
            <StatCard label="AVG RECOVERY"   value={`${metrics.recoveryMs}ms`}   color="gray" />
          </div>
          {metrics.lastRunAt && (
            <p className="text-xs font-mono text-zinc-500">Last run: {new Date(metrics.lastRunAt).toISOString()}</p>
          )}
        </div>
      )}

      {/* ── HISTORY ──────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">{historyRuns.length} run(s) — permanent history</p>
          {historyRuns.length === 0 && <p className="text-zinc-600 text-sm">No run history yet.</p>}
          {[...historyRuns].reverse().map(r => (
            <div key={r.id} className={`border rounded-lg p-3 space-y-2 ${r.ready ? "border-zinc-800 bg-zinc-900" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={r.ready ? "READY" : "NOT READY"} color={r.ready ? "green" : "red"} />
                <span className="text-xs font-mono text-zinc-400">Sprint {r.sprintId}</span>
                <Badge label={`Score: ${r.score}%`} color="blue" size="xs" />
                <Badge label={`Confidence: ${r.confidence}%`} color="gray" size="xs" />
                <span className="text-zinc-600 text-xs">{r.durationMs}ms</span>
                <span className="text-zinc-700 text-xs ml-auto font-mono">{new Date(r.startedAt).toISOString().slice(11, 23)}</span>
              </div>
              <div className="flex gap-3 text-xs text-zinc-500 font-mono">
                <span className="text-green-400">{r.passed} pass</span>
                <span className="text-red-400">{r.failed} fail</span>
                <span className="text-yellow-400">{r.skipped} skip</span>
                <span className="text-zinc-600">{r.blocked} blocked</span>
              </div>
              {r.blockers.length > 0 && <p className="text-xs text-red-400 font-mono">Blockers: {r.blockers.slice(0, 2).join(" · ")}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── AUDIT ────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{auditList.length} audit entries (append-only)</p>
          {auditList.length === 0 && <p className="text-zinc-600 text-sm">No audit entries yet.</p>}
          {[...auditList].reverse().map(e => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono">
              <Badge label={e.result} color={STATUS_COLOR[e.result] ?? "gray"} />
              <span className="text-violet-300">{e.action}</span>
              <span className="text-zinc-400">Sprint {e.sprintId}</span>
              <span className="text-zinc-500 flex-1">{e.reason}</span>
              <span className="text-zinc-700">{new Date(e.timestamp).toISOString().slice(11, 23)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── REPORTS ──────────────────────────────────────────────────── */}
      {tab === "reports" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">{reports.length} report(s)</p>
          {reports.length === 0 && <p className="text-zinc-600 text-sm">No reports yet. Run an acceptance pipeline first.</p>}
          {[...reports].reverse().map(r => (
            <div key={r.id} className={`border rounded-lg p-4 space-y-2 ${r.ready ? "border-zinc-800 bg-zinc-900" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={r.ready ? "READY" : "NOT READY"} color={r.ready ? "green" : "red"} />
                <span className="text-xs font-mono text-zinc-400">Sprint {r.sprintId} · {r.id}</span>
                <Badge label={`${r.score}%`} color="blue" size="xs" />
                <Badge label={`${r.evidenceCount} evidence`} color="gray" size="xs" />
              </div>
              <p className="text-sm text-zinc-300">{r.summary}</p>
              {r.blockers.length > 0 && (
                <div className="space-y-0.5">
                  {r.blockers.map((b, i) => <p key={i} className="text-xs text-red-400 font-mono">❌ {b}</p>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── LOGS ─────────────────────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{logList.length} log entries</p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-h-96 overflow-y-auto space-y-0.5">
            {logList.length === 0 && <p className="text-zinc-600 text-xs">No logs yet.</p>}
            {logList.map((line, i) => (
              <p key={i} className="text-xs font-mono text-zinc-400">{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs font-mono text-zinc-600">
          Sprint 6.3.2 · Engineering Acceptance Framework · No sprint READY without PASS ·
          EW → EI → EMem → EGov → AA → Regression Shield → SHR → EAF → READY
        </p>
      </div>
    </div>
  );
}