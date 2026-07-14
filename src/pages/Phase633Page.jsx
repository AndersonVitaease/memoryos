import React, { useState, useRef, useEffect } from "react";
import { AEL } from "@/lib/autonomous-engineering/EngineeringExecutionEngine";

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

const STATE_COLOR = {
  IDLE: "gray", ANALYZING: "blue", PLANNING: "violet", WAITING_APPROVAL: "yellow",
  IMPLEMENTING: "orange", RECOVERING: "yellow", VALIDATING: "blue",
  LEARNING: "violet", READY: "green", FAILED: "red",
};

const STATUS_COLOR = { PASS: "green", FAIL: "red", SKIP: "yellow", BLOCKED: "red", PENDING: "gray", RUNNING: "blue" };

const STAGE_ORDER = [
  "ANALYZE", "INSPECT_KG", "INSPECT_MEMORY", "INSPECT_ARCHITECTURE",
  "INSPECT_GOVERNANCE", "GENERATE_PLAN", "REUSE_ANALYSIS", "RISK_ANALYSIS",
  "APPROVAL", "IMPLEMENTATION", "SELF_HEALING", "REGRESSION_SHIELD",
  "ACCEPTANCE_FRAMEWORK", "LESSONS_LEARNED", "UPDATE_MEMORY",
];

const TABS = ["overview", "pipeline", "context", "plan", "execution", "validation", "evidence", "timeline", "metrics", "audit", "history"];

const EXAMPLE_OBJECTIVES = [
  "Implement Google Calendar connector adapter on top of UCP",
  "Add semantic search to retrieval engine",
  "Extend Engineering Memory with cross-sprint pattern detection",
  "Integrate Google Drive connector with Knowledge Graph pipeline",
];

function StageRow({ stage, result, active }) {
  const isActive = active === stage;
  const status = result?.status ?? (isActive ? "RUNNING" : "PENDING");
  const border = status === "FAIL" || status === "BLOCKED"
    ? "border-red-800/50 bg-red-950/10"
    : status === "PASS" ? "border-zinc-800 bg-zinc-900"
    : isActive ? "border-violet-500/50 bg-violet-950/20"
    : "border-zinc-800/50 bg-zinc-900/50";

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded border transition-all ${border}`}>
      <span className="text-xs w-5">
        {status === "PASS" ? "✅" : status === "FAIL" ? "❌" : status === "SKIP" ? "⏭" : status === "RUNNING" ? <span className="animate-pulse text-violet-400">●</span> : "○"}
      </span>
      <span className="text-xs font-mono text-zinc-400 w-44 shrink-0">{stage}</span>
      <Badge label={status} color={STATUS_COLOR[status] ?? "gray"} size="xs" />
      {result && <span className="text-xs text-zinc-500 flex-1 truncate">{result.summary}</span>}
      {result && <span className="text-xs text-zinc-700 font-mono shrink-0">{result.durationMs}ms</span>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Phase633Page() {
  const [tab, setTab]             = useState("overview");
  const [objective, setObjective] = useState("");
  const [running, setRunning]     = useState(false);
  const [report, setReport]       = useState(null);
  const [liveCtx, setLiveCtx]     = useState(null);
  const [liveStages, setLiveStages] = useState({});
  const [activeStage, setActiveStage] = useState(null);
  const [dash, setDash]           = useState(AEL.dashboardState());
  const [, forceUpdate]           = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setDash(AEL.dashboardState());
      forceUpdate(n => n + 1);
    }, 800);
    return () => clearInterval(t);
  }, []);

  AEL.onStageChange = (ctx, stage, result) => {
    setLiveCtx({ ...ctx });
    setActiveStage(stage);
    setLiveStages(prev => ({ ...prev, [stage]: result }));
  };

  AEL.onComplete = (r) => {
    setReport(r);
    setLiveCtx(null);
    setActiveStage(null);
    setDash(AEL.dashboardState());
  };

  async function handleRun() {
    if (running || !objective.trim()) return;
    setRunning(true);
    setReport(null);
    setLiveStages({});
    setActiveStage(null);
    setTab("pipeline");
    try {
      await AEL.run(objective.trim());
    } finally {
      setRunning(false);
      setDash(AEL.dashboardState());
    }
  }

  const metrics = dash.metrics;
  const ctx = liveCtx ?? dash.activeExecution;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.3.3</span>
          <Badge label="AUTONOMOUS ENGINEERING LOOP" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Engineering Execution Engine</h1>
        <p className="text-zinc-400 text-sm mt-1">
          All layers connected · Objective → Pipeline → Regression → Acceptance → Memory → READY
        </p>
      </div>

      {/* Input */}
      <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Engineering Objective</span>
        <div className="flex gap-3">
          <input
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder='e.g. "Implement Google Calendar connector adapter on top of UCP"'
            value={objective}
            onChange={e => setObjective(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleRun()}
            disabled={running}
          />
          <button onClick={handleRun} disabled={running || !objective.trim()}
            className="px-5 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-semibold transition-colors whitespace-nowrap">
            {running ? "Running…" : "▶ Run Loop"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_OBJECTIVES.map(o => (
            <button key={o} onClick={() => setObjective(o)} disabled={running}
              className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-40">
              {o.slice(0, 50)}…
            </button>
          ))}
        </div>
      </div>

      {/* Status bar */}
      {(running || report) && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900">
          {running && <span className="animate-pulse text-violet-400 font-mono text-xs">● RUNNING</span>}
          {activeStage && <Badge label={activeStage} color="violet" />}
          {report && <Badge label={report.ready ? "READY ✅" : "FAILED ❌"} color={report.ready ? "green" : "red"} />}
          {report && <Badge label={`${report.regressionScore}% regression`} color="blue" size="xs" />}
          {report && <Badge label={`${report.durationMs}ms`} color="gray" size="xs" />}
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

      {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="TOTAL RUNS"    value={metrics.totalExecutions}     color="gray" />
            <StatCard label="SUCCESS RATE"  value={`${metrics.successRate}%`}   color={metrics.successRate >= 80 ? "green" : "yellow"} />
            <StatCard label="AVG DURATION"  value={`${metrics.avgDurationMs}ms`} color="blue" />
            <StatCard label="REUSE RATE"    value={`${metrics.reuseRate}%`}     color="violet" />
            <StatCard label="ACCEPTANCE"    value={`${metrics.acceptanceRate}%`} color={metrics.acceptanceRate >= 80 ? "green" : "yellow"} />
            <StatCard label="RECOVERIES"    value={metrics.recoveryCount}       color="orange" />
            <StatCard label="EVIDENCE"      value={AEL.evidence.count()}        color="gray" />
            <StatCard label="REPORTS"       value={dash.recentReports.length}   color="gray" />
          </div>

          {/* Architecture flow */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <span className="text-xs font-mono text-zinc-500 uppercase">Architecture Position</span>
            <div className="flex flex-wrap gap-1 mt-3 items-center text-xs font-mono">
              {["EW", "EI", "EMem", "EGov", "AA", "UCP", "SHR", "EAF", "AEL", "READY"].map((s, i, arr) => (
                <React.Fragment key={s}>
                  <span className={`px-2 py-1 rounded border ${s === "AEL" ? "border-violet-500 bg-violet-900/30 text-violet-200" : s === "READY" ? "border-green-600 bg-green-900/20 text-green-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>{s}</span>
                  {i < arr.length - 1 && <span className="text-zinc-700">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Recent runs */}
          {dash.recentContexts.length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
              <span className="text-xs font-mono text-zinc-500 uppercase">Recent Executions</span>
              {dash.recentContexts.map(c => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 bg-zinc-900 rounded border border-zinc-800 text-xs">
                  <Badge label={c.state} color={STATE_COLOR[c.state] ?? "gray"} />
                  <span className="text-zinc-300 flex-1 truncate">{c.objective.slice(0, 60)}</span>
                  <span className="text-zinc-600 font-mono">{c.stageResults.length} stages</span>
                </div>
              ))}
            </div>
          )}

          {!running && !report && dash.recentContexts.length === 0 && (
            <div className="text-center py-16 text-zinc-600 space-y-2">
              <p className="text-5xl">⚙</p>
              <p className="text-sm">Enter an engineering objective above to run the full autonomous loop.</p>
              <p className="text-xs text-zinc-700">15 stages · KG · Memory · Governance · Architecture · SHR · Regression · Acceptance · Lessons</p>
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINE ─────────────────────────────────────────────────── */}
      {tab === "pipeline" && (
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-zinc-500">{STAGE_ORDER.length} stages · {Object.keys(liveStages).length} completed</p>
          {STAGE_ORDER.map(stage => (
            <StageRow key={stage} stage={stage} result={liveStages[stage]} active={activeStage} />
          ))}
          {!running && Object.keys(liveStages).length === 0 && (
            <p className="text-zinc-600 text-sm py-4">No active pipeline. Run an objective to see stages.</p>
          )}
        </div>
      )}

      {/* ── CONTEXT ──────────────────────────────────────────────────── */}
      {tab === "context" && (
        <div className="space-y-3">
          {!ctx && <p className="text-zinc-600 text-sm">No active or recent context.</p>}
          {ctx && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="STATE"   value={ctx.state}   color={STATE_COLOR[ctx.state] ?? "gray"} />
                <StatCard label="STAGE"   value={ctx.currentStage ?? "—"} color="blue" />
                <StatCard label="APPROVED" value={ctx.approved ? "YES" : "NO"} color={ctx.approved ? "green" : "yellow"} />
              </div>
              <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <span className="text-xs font-mono text-zinc-500 uppercase">Objective</span>
                <p className="text-sm text-zinc-300">{ctx.objective}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                  <span className="text-xs font-mono text-zinc-500">Components Affected</span>
                  {ctx.componentsAffected.length === 0
                    ? <p className="text-zinc-600 text-xs">None yet</p>
                    : ctx.componentsAffected.map(c => <p key={c} className="text-xs text-blue-300 font-mono">{c}</p>)}
                </div>
                <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                  <span className="text-xs font-mono text-zinc-500">Memory Consulted</span>
                  {ctx.memoryConsulted.length === 0
                    ? <p className="text-zinc-600 text-xs">None yet</p>
                    : ctx.memoryConsulted.map((m, i) => <p key={i} className="text-xs text-green-300 font-mono">{m}</p>)}
                </div>
              </div>
              {ctx.lessonsLearned.length > 0 && (
                <div className="border border-zinc-800 rounded-lg p-4 space-y-1">
                  <span className="text-xs font-mono text-zinc-500">Lessons Learned</span>
                  {ctx.lessonsLearned.map((l, i) => <p key={i} className="text-xs text-violet-300">• {l}</p>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PLAN ─────────────────────────────────────────────────────── */}
      {tab === "plan" && (
        <div className="space-y-3">
          {!ctx?.plan && <p className="text-zinc-600 text-sm">Plan generated during GENERATE_PLAN stage.</p>}
          {ctx?.plan && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="STRATEGY"   value={ctx.plan.strategy}   color="violet" />
                <StatCard label="COMPLEXITY" value={ctx.plan.complexity} color={ctx.plan.complexity === "LOW" ? "green" : ctx.plan.complexity === "HIGH" ? "red" : "yellow"} />
                <StatCard label="REUSE OPPS" value={ctx.plan.reuseOpportunities.length} color="blue" />
                <StatCard label="RISKS"      value={ctx.plan.risks.length} color={ctx.plan.risks.length === 0 ? "green" : "yellow"} />
              </div>
              <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <span className="text-xs font-mono text-zinc-500">Implementation Steps</span>
                {ctx.plan.implementationSteps.map((s, i) => <p key={i} className="text-xs text-zinc-300 font-mono">{i + 1}. {s}</p>)}
              </div>
              <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <span className="text-xs font-mono text-zinc-500">Validation Steps</span>
                {ctx.plan.validationSteps.map((s, i) => <p key={i} className="text-xs text-zinc-300 font-mono">• {s}</p>)}
              </div>
              <div className="border border-zinc-800 rounded-lg p-4 space-y-1">
                <span className="text-xs font-mono text-zinc-500">Rollback Strategy</span>
                <p className="text-xs text-zinc-400">{ctx.plan.rollbackStrategy}</p>
              </div>
              {ctx.plan.risks.length > 0 && (
                <div className="border border-yellow-800/40 rounded-lg p-4 space-y-2 bg-yellow-950/10">
                  <span className="text-xs font-mono text-yellow-500">Risks</span>
                  {ctx.plan.risks.map(r => (
                    <div key={r.id} className="text-xs space-y-0.5">
                      <p className="text-yellow-300">{r.description}</p>
                      <p className="text-zinc-500">Severity: {r.severity} · Mitigation: {r.mitigation}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── EXECUTION ────────────────────────────────────────────────── */}
      {tab === "execution" && (
        <div className="space-y-2">
          {!ctx && <p className="text-zinc-600 text-sm">No execution context available.</p>}
          {ctx && (
            <>
              <p className="text-xs font-mono text-zinc-500">{ctx.log?.length ?? 0} log entries</p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-h-96 overflow-y-auto space-y-0.5">
                {ctx.log?.map((line, i) => (
                  <p key={i} className="text-xs font-mono text-zinc-400">{line}</p>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── VALIDATION ───────────────────────────────────────────────── */}
      {tab === "validation" && (
        <div className="space-y-3">
          {!report && <p className="text-zinc-600 text-sm">Validation results appear after pipeline completes.</p>}
          {report && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="REGRESSION SCORE"  value={`${report.regressionScore}%`}  color={report.regressionScore >= 80 ? "green" : "yellow"} />
                <StatCard label="ACCEPTANCE SCORE"  value={`${report.acceptanceScore}%`}  color={report.acceptanceScore >= 80 ? "green" : "yellow"} />
                <StatCard label="FINAL STATE"       value={report.finalState}             color={STATE_COLOR[report.finalState] ?? "gray"} />
              </div>
              <div className="space-y-1">
                {report.stageResults
                  .filter(s => s.stage === "REGRESSION_SHIELD" || s.stage === "ACCEPTANCE_FRAMEWORK")
                  .map(s => (
                    <div key={s.stage} className={`flex items-center gap-3 px-3 py-2 rounded border text-xs font-mono ${s.status === "PASS" ? "border-green-800/40 bg-green-950/10" : "border-red-800/40 bg-red-950/10"}`}>
                      <Badge label={s.status} color={STATUS_COLOR[s.status] ?? "gray"} />
                      <span className="text-zinc-400 w-40">{s.stage}</span>
                      <span className="text-zinc-300">{s.summary}</span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── EVIDENCE ─────────────────────────────────────────────────── */}
      {tab === "evidence" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{AEL.evidence.count()} evidence entries</p>
          {AEL.evidence.count() === 0 && <p className="text-zinc-600 text-sm">No evidence yet. Run a loop first.</p>}
          {AEL.evidence.all().slice(0, 50).map(e => (
            <div key={e.id} className="flex items-start gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono">
              <Badge label={e.kind} color="blue" size="xs" />
              <Badge label={e.stage} color="gray" size="xs" />
              <span className="text-zinc-400 w-28 shrink-0">{e.label}</span>
              <span className="text-zinc-300 flex-1 break-all">
                {typeof e.value === "object" ? JSON.stringify(e.value).slice(0, 100) : String(e.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── TIMELINE ─────────────────────────────────────────────────── */}
      {tab === "timeline" && (
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-zinc-500">{AEL.history().history?.allContexts?.()?.length ?? dash.recentContexts.length} execution(s) in history</p>
          {dash.recentContexts.flatMap(c => c.stageResults).length === 0 && (
            <p className="text-zinc-600 text-sm">No timeline entries yet.</p>
          )}
          {dash.recentContexts.slice(0, 3).map(c => (
            <div key={c.id} className="border border-zinc-800 rounded-lg p-3 space-y-1 bg-zinc-900">
              <div className="flex items-center gap-2 mb-2">
                <Badge label={c.state} color={STATE_COLOR[c.state] ?? "gray"} />
                <span className="text-xs text-zinc-400 truncate">{c.objective.slice(0, 50)}</span>
              </div>
              {c.stageResults.map(s => (
                <div key={s.stage} className="flex items-center gap-2 text-xs font-mono text-zinc-500 pl-2">
                  <span>{s.status === "PASS" ? "✅" : s.status === "FAIL" ? "❌" : "⏭"}</span>
                  <span className="w-36 shrink-0 text-zinc-400">{s.stage}</span>
                  <span className="flex-1 truncate">{s.summary}</span>
                  <span className="text-zinc-700">{s.durationMs}ms</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── METRICS ──────────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="TOTAL RUNS"   value={metrics.totalExecutions}      color="gray" />
            <StatCard label="SUCCESS RATE" value={`${metrics.successRate}%`}    color={metrics.successRate >= 80 ? "green" : "yellow"} />
            <StatCard label="AVG DURATION" value={`${metrics.avgDurationMs}ms`} color="blue" />
            <StatCard label="AVG STAGES"   value={metrics.avgStagesCompleted}   color="blue" />
            <StatCard label="REUSE RATE"   value={`${metrics.reuseRate}%`}      color="violet" />
            <StatCard label="APPROVAL RATE" value={`${metrics.approvalRate}%`}  color="gray" />
            <StatCard label="ROLLBACKS"    value={metrics.rollbackCount}        color="orange" />
            <StatCard label="RECOVERIES"   value={metrics.recoveryCount}        color="orange" />
          </div>
          {metrics.lastExecutionAt && (
            <p className="text-xs font-mono text-zinc-500">Last execution: {new Date(metrics.lastExecutionAt).toISOString()}</p>
          )}
        </div>
      )}

      {/* ── AUDIT ────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{dash.auditCount} audit entries</p>
          {dash.auditCount === 0 && <p className="text-zinc-600 text-sm">No audit entries yet.</p>}
        </div>
      )}

      {/* ── HISTORY ──────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">{AEL.history().reportCount()} report(s) — permanent history</p>
          {AEL.history().allReports().length === 0 && <p className="text-zinc-600 text-sm">No history yet. Run the loop to build history.</p>}
          {[...AEL.history().allReports()].reverse().map(r => (
            <div key={r.id} className={`border rounded-lg p-4 space-y-2 ${r.ready ? "border-zinc-800 bg-zinc-900" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={r.ready ? "READY" : "FAILED"} color={r.ready ? "green" : "red"} />
                <Badge label={r.finalState} color={STATE_COLOR[r.finalState] ?? "gray"} size="xs" />
                <Badge label={`Reg: ${r.regressionScore}%`} color="blue" size="xs" />
                <Badge label={`Acc: ${r.acceptanceScore}%`} color="violet" size="xs" />
                <span className="text-zinc-600 text-xs">{r.durationMs}ms</span>
              </div>
              <p className="text-xs text-zinc-400 font-mono truncate">{r.objective}</p>
              <p className="text-xs text-zinc-500">{r.summary}</p>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs font-mono text-zinc-600">
          Sprint 6.3.3 · Autonomous Engineering Loop · EW → EI → EMem → EGov → AA → UCP → SHR → EAF → AEL → READY
        </p>
      </div>
    </div>
  );
}