import React, { useState, useRef, useEffect, useCallback } from "react";
import { OrchestratorLifecycle } from "@/lib/engineering-workflow/OrchestratorLifecycle";

// ── Singleton lifecycle engine ────────────────────────────────────────────────
const lc = new OrchestratorLifecycle();

// ── Ordered stages for the pipeline diagram ───────────────────────────────────
const STAGES = [
  { id: "IDLE",                     label: "IDLE" },
  { id: "ANALYZE",                  label: "ANALYZE" },
  { id: "INSPECT_CODEBASE",         label: "INSPECT CODEBASE" },
  { id: "INSPECT_KNOWLEDGE_GRAPH",  label: "INSPECT KG" },
  { id: "INSPECT_CONNECTORS",       label: "INSPECT CONNECTORS" },
  { id: "RUN_REGRESSION_SHIELD",    label: "RUN REGRESSION SHIELD" },
  { id: "PRECONDITIONS_CHECK",      label: "PRECONDITIONS OK?" },
  { id: "AUTO_PREPARE_ENVIRONMENT", label: "AUTO PREPARE ENV", isBranch: true },
  { id: "GENERATE_PLAN",            label: "GENERATE PLAN" },
  { id: "WAIT_APPROVAL",            label: "⏸ WAIT APPROVAL", isGate: true },
  { id: "IMPLEMENT",                label: "IMPLEMENT" },
  { id: "RUN_FULL_REGRESSION",      label: "FULL REGRESSION" },
  { id: "REPORT",                   label: "REPORT" },
  { id: "DONE",                     label: "DONE" },
];

const STAGE_COLOR = {
  OK:      "border-green-600 bg-green-900/20 text-green-300",
  WARN:    "border-yellow-600 bg-yellow-900/20 text-yellow-300",
  FAIL:    "border-red-700 bg-red-900/20 text-red-300",
  ACTIVE:  "border-violet-500 bg-violet-900/30 text-violet-200 ring-1 ring-violet-500/50",
  IDLE:    "border-zinc-700 bg-zinc-900 text-zinc-500",
};

const STATUS_BADGE = {
  OK:      "bg-green-900/50 text-green-300 border-green-700/50",
  WARN:    "bg-yellow-900/50 text-yellow-300 border-yellow-700/50",
  FAIL:    "bg-red-900/50 text-red-400 border-red-700/50",
  SKIPPED: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

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

// ── Pipeline Diagram ──────────────────────────────────────────────────────────

function PipelineDiagram({ exec }) {
  const activeStage   = exec?.stage ?? "IDLE";
  const stageHistory  = exec?.stageHistory ?? [];

  function getStageStyle(stageId) {
    if (stageId === activeStage) return STAGE_COLOR.ACTIVE;
    const result = stageHistory.find(s => s.stage === stageId);
    if (!result) return STAGE_COLOR.IDLE;
    return STAGE_COLOR[result.status] ?? STAGE_COLOR.IDLE;
  }

  function getIcon(stageId) {
    if (stageId === activeStage) return <span className="animate-pulse">●</span>;
    const result = stageHistory.find(s => s.stage === stageId);
    if (!result) return null;
    return result.status === "OK" ? "✓" : result.status === "WARN" ? "⚠" : result.status === "FAIL" ? "✗" : null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {STAGES.map((s, i) => (
        <React.Fragment key={s.id}>
          {s.isBranch && <span className="text-yellow-600 text-xs font-mono">↙ NO</span>}
          <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-mono transition-all ${s.isGate ? "font-bold" : ""} ${getStageStyle(s.id)}`}>
            {getIcon(s.id) && <span className="text-[10px]">{getIcon(s.id)}</span>}
            {s.label}
          </div>
          {!s.isBranch && i < STAGES.length - 1 && !STAGES[i + 1]?.isBranch && (
            <span className="text-zinc-700 text-xs">→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Stage History Table ───────────────────────────────────────────────────────

function StageHistory({ history }) {
  if (!history?.length) return null;
  return (
    <div className="space-y-1">
      {history.map((s, i) => (
        <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded border text-xs font-mono ${STATUS_BADGE[s.status] ?? STATUS_BADGE.SKIPPED} border`}>
          <span className="w-5 shrink-0">
            {s.status === "OK" ? "✓" : s.status === "WARN" ? "⚠" : s.status === "FAIL" ? "✗" : "⏭"}
          </span>
          <span className="text-zinc-400 w-56 shrink-0">{s.stage}</span>
          <span className="flex-1 text-zinc-300">{s.summary}</span>
          <span className="text-zinc-600 shrink-0">{s.durationMs}ms</span>
        </div>
      ))}
    </div>
  );
}

// ── Preconditions Panel ───────────────────────────────────────────────────────

function PreconditionsPanel({ pc, shieldReport }) {
  if (!pc) return null;
  const checks = [
    { label: "KG Built",             ok: pc.kgBuilt,            note: pc.kgBuilt ? "Knowledge graph populated" : "Build KG via Phase 6.0.2" },
    { label: "KG Healthy",           ok: pc.kgHealthy,           note: pc.kgHealthy ? "Graph is healthy" : "KG health degraded" },
    { label: "Connector Reachable",  ok: pc.connectorReachable,  note: pc.connectorReachable ? "Base44 OK" : "Base44 connector probe failed" },
    { label: "Regression Clean",     ok: pc.regressionClean,     note: `Shield: ${pc.regressionShield}` },
  ];
  return (
    <div className={`rounded-lg border p-4 space-y-3 ${pc.overall ? "border-green-700/40 bg-green-950/10" : "border-yellow-700/40 bg-yellow-950/10"}`}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">{pc.overall ? "✅ Preconditions OK" : "⚠ Preconditions need attention"}</span>
        {!pc.overall && <Badge label="AUTO_PREPARE will run" color="yellow" />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-2 text-xs">
            <span>{c.ok ? "✅" : "⚠"}</span>
            <span className="font-mono text-zinc-400 w-36">{c.label}</span>
            <span className={c.ok ? "text-green-400" : "text-yellow-400"}>{c.note}</span>
          </div>
        ))}
      </div>
      {pc.failures.length > 0 && (
        <div className="text-xs text-yellow-300 font-mono">
          Blocking: {pc.failures.join(" · ")}
        </div>
      )}
    </div>
  );
}

// ── Shield Summary ────────────────────────────────────────────────────────────

function ShieldSummary({ report, label }) {
  if (!report) return null;
  const color = report.shield === "PASS" ? "green" : report.shield === "BLOCKED" ? "red" : "yellow";
  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-zinc-500">{label}</span>
        <Badge label={`Shield: ${report.shield}`} color={color} />
        <Badge label={`${report.passed}/${report.total} passed`} color={report.failed === 0 ? "green" : "yellow"} />
        {report.skipped > 0 && <Badge label={`${report.skipped} skipped`} color="gray" />}
        <Badge label={`Acceptance ${report.acceptanceScore}/5`} color={report.acceptanceScore === 5 ? "green" : "red"} />
      </div>
      {report.rcaSummary.length > 0 && (
        <div className="space-y-1">
          {report.rcaSummary.slice(0, 3).map((r, i) => (
            <p key={i} className="text-xs text-red-400 font-mono">{r}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plan Summary ──────────────────────────────────────────────────────────────

function PlanSummary({ plan }) {
  if (!plan) return null;
  const complexityColor = { LOW: "green", MEDIUM: "yellow", HIGH: "red", CRITICAL: "red" };
  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-mono text-zinc-500">ENGINEERING PLAN</span>
        <Badge label={`Complexity: ${plan.estimatedComplexity}`} color={complexityColor[plan.estimatedComplexity] ?? "gray"} />
        {plan.requiresArchitectApproval && <Badge label="REQUIRES ARCHITECT APPROVAL" color="red" />}
      </div>
      <p className="text-sm text-zinc-300">{plan.architecturalImpact}</p>
      {plan.stableComponentsTouched.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {plan.stableComponentsTouched.map(c => <Badge key={c} label={`⚠ ${c}`} color="red" size="xs" />)}
        </div>
      )}
      <div className="space-y-1">
        {plan.implementationOrder.map((s, i) => (
          <p key={i} className="text-xs font-mono text-zinc-400">{s}</p>
        ))}
      </div>
    </div>
  );
}

// ── Log Panel ─────────────────────────────────────────────────────────────────

function LogPanel({ log }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [log?.length]);
  return (
    <div ref={ref} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-64 overflow-y-auto space-y-0.5">
      {!log?.length && <p className="text-zinc-600 text-xs font-mono">No log entries yet.</p>}
      {log?.map((line, i) => (
        <p key={i} className="text-xs font-mono text-zinc-400 leading-relaxed">{line}</p>
      ))}
    </div>
  );
}

// ── Approval Gate ─────────────────────────────────────────────────────────────

function ApprovalGate({ exec, onApprove, onReject }) {
  const [reason, setReason] = useState("");

  if (exec?.stage !== "WAIT_APPROVAL") return null;

  return (
    <div className="border border-yellow-700/60 rounded-lg p-5 bg-yellow-950/20 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-yellow-300 text-lg">⏸</span>
        <div>
          <p className="text-yellow-200 font-semibold text-sm">Engineering Plan ready — awaiting Architect approval</p>
          <p className="text-yellow-500 text-xs mt-0.5">No code will be written until you approve. Review the plan above, then proceed.</p>
        </div>
      </div>
      <div className="flex gap-3 items-center">
        <button
          onClick={onApprove}
          className="px-5 py-2.5 rounded bg-green-700 hover:bg-green-600 text-sm font-semibold transition-colors"
        >
          ✅ Approve — Begin Implementation
        </button>
        <input
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500"
          placeholder="Rejection reason (required to reject)…"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <button
          onClick={() => reason.trim() && onReject(reason.trim())}
          disabled={!reason.trim()}
          className="px-4 py-2.5 rounded bg-red-800 hover:bg-red-700 disabled:opacity-40 text-sm font-semibold transition-colors"
        >
          ❌ Reject
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ["overview", "stages", "plan", "shield", "prepare", "log"];

export default function Phase620Page() {
  const [objective, setObjective]   = useState("");
  const [exec, setExec]             = useState(null);
  const [running, setRunning]       = useState(false);
  const [approving, setApproving]   = useState(false);
  const [tab, setTab]               = useState("overview");
  const execRef                     = useRef(null);

  // Wire streaming callback once
  useEffect(() => {
    lc.onStageChange = (updated) => {
      execRef.current = updated;
      setExec({ ...updated });
    };
    return () => { lc.onStageChange = undefined; };
  }, []);

  async function handleStart() {
    if (!objective.trim() || running) return;
    setRunning(true);
    setTab("overview");
    try {
      await lc.start(objective.trim());
      // exec is updated via streaming callback; final state is WAIT_APPROVAL
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove() {
    if (!exec || exec.stage !== "WAIT_APPROVAL" || approving) return;
    setApproving(true);
    try {
      await lc.approve(exec);
    } finally {
      setApproving(false);
    }
  }

  function handleReject(reason) {
    if (!exec || exec.stage !== "WAIT_APPROVAL") return;
    lc.reject(exec, reason);
  }

  function handleReset() {
    setExec(null);
    execRef.current = null;
    setObjective("");
    setTab("overview");
  }

  const stage    = exec?.stage ?? "IDLE";
  const isDone   = stage === "DONE" || stage === "REJECTED" || stage === "FAILED";
  const plan     = exec?.plan;
  const pc       = exec?.preconditions;
  const shieldR  = exec?.firstShieldReport;
  const finalR   = exec?.finalShieldReport;

  const stageColor = {
    DONE:     "green", REJECTED: "red", FAILED: "red",
    WAIT_APPROVAL: "yellow", AUTO_PREPARE_ENVIRONMENT: "orange",
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.2.0</span>
          <Badge label="AUTONOMOUS ENGINEERING ORCHESTRATOR" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Engineering Orchestrator</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Full autonomous lifecycle · IDLE → ANALYZE → INSPECT → REGRESSION → PREPARE → PLAN → APPROVAL → IMPLEMENT → REPORT → DONE
        </p>
      </div>

      {/* Pipeline Diagram */}
      <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
        <span className="text-xs font-mono text-zinc-600 uppercase tracking-widest">Lifecycle Pipeline</span>
        <PipelineDiagram exec={exec} />
      </div>

      {/* Status bar */}
      {exec && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900">
          <span className="text-xs font-mono text-zinc-500">STAGE</span>
          <Badge label={stage} color={stageColor[stage] ?? "blue"} />
          <span className="text-xs text-zinc-600 font-mono">{exec.id}</span>
          {exec.autoPrepareAttempts > 0 && (
            <Badge label={`Auto-prepare attempts: ${exec.autoPrepareAttempts}`} color="orange" />
          )}
          {exec.completedAt && (
            <Badge label={`${exec.completedAt - exec.startedAt}ms total`} color="gray" />
          )}
        </div>
      )}

      {/* Input */}
      <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Engineering Request</span>
        <div className="flex gap-3">
          <input
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder='e.g. "Add semantic caching to the retrieval engine"'
            value={objective}
            onChange={e => setObjective(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !exec && handleStart()}
            disabled={running || !!exec}
          />
          {!exec && (
            <button
              onClick={handleStart}
              disabled={running || !objective.trim()}
              className="px-5 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-semibold transition-colors whitespace-nowrap"
            >
              {running ? "Running…" : "▶ Start Lifecycle"}
            </button>
          )}
          {exec && isDone && (
            <button onClick={handleReset} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">
              ↺ Reset
            </button>
          )}
        </div>
      </div>

      {/* Approval gate */}
      {exec && (
        <ApprovalGate
          exec={exec}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Done / Rejected banners */}
      {stage === "DONE" && (
        <div className="border border-green-700/50 rounded-lg p-4 bg-green-950/20 flex items-center gap-3">
          <span className="text-green-300 text-lg">✅</span>
          <div>
            <p className="text-green-200 font-semibold text-sm">Lifecycle complete</p>
            <p className="text-green-500 text-xs">All stages passed · Final regression shield: {finalR?.shield ?? "N/A"}</p>
          </div>
        </div>
      )}
      {stage === "REJECTED" && (
        <div className="border border-red-700/50 rounded-lg p-4 bg-red-950/20">
          <p className="text-red-300 font-semibold text-sm">❌ Rejected</p>
          <p className="text-red-500 text-xs mt-1">{exec?.rejectionReason}</p>
        </div>
      )}

      {/* Tabs */}
      {exec && (
        <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-mono whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t === "shield" ? `SHIELD ${shieldR ? `(${shieldR.shield})` : ""}` : t.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* ── TAB: OVERVIEW ─────────────────────────────────────────── */}
      {exec && tab === "overview" && (
        <div className="space-y-4">
          {/* Env snapshot */}
          {exec.envSnapshot && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "KG Ready",    val: exec.envSnapshot.kgReady ? "YES" : "NO",      color: exec.envSnapshot.kgReady ? "green" : "yellow" },
                { label: "KG Entities", val: exec.envSnapshot.kgEntityCount,                color: exec.envSnapshot.kgEntityCount > 0 ? "green" : "yellow" },
                { label: "KG Health",   val: exec.envSnapshot.kgHealth,                     color: exec.envSnapshot.kgHealth === "HEALTHY" ? "green" : "yellow" },
                { label: "Base44",      val: exec.envSnapshot.base44Connected ? "OK" : "—", color: exec.envSnapshot.base44Connected ? "green" : "gray" },
              ].map(c => (
                <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="text-xs font-mono text-zinc-500">{c.label}</div>
                  <div className="mt-1"><Badge label={String(c.val)} color={c.color} /></div>
                </div>
              ))}
            </div>
          )}

          <PreconditionsPanel pc={pc} shieldReport={shieldR} />

          {exec.inspectionSummary && (
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <span className="text-xs font-mono text-zinc-500 uppercase">Codebase Inspection</span>
                <div className="text-sm text-zinc-300">Entities: <span className="font-mono text-white">{exec.inspectionSummary.kgEntities}</span></div>
                <div className="text-sm text-zinc-300">Modules: <span className="font-mono text-white">{exec.inspectionSummary.kgModules}</span></div>
                <div className="text-sm text-zinc-300">GitHub commits: <span className="font-mono text-white">{exec.inspectionSummary.recentCommits.length}</span></div>
              </div>
              <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <span className="text-xs font-mono text-zinc-500 uppercase">Reusable Candidates</span>
                {exec.inspectionSummary.reusableCandidates.length === 0
                  ? <p className="text-zinc-500 text-sm">None detected</p>
                  : exec.inspectionSummary.reusableCandidates.map(c => (
                    <p key={c} className="text-sm text-blue-300 font-mono">↩ {c}</p>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: STAGES ───────────────────────────────────────────── */}
      {exec && tab === "stages" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">Stage execution history — {exec.stageHistory.length} completed</p>
          <StageHistory history={exec.stageHistory} />
        </div>
      )}

      {/* ── TAB: PLAN ─────────────────────────────────────────────── */}
      {exec && tab === "plan" && (
        <div className="space-y-4">
          {!plan && <p className="text-zinc-500 text-sm">Plan generated during GENERATE_PLAN stage.</p>}
          {plan && (
            <>
              <PlanSummary plan={plan} />
              <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <span className="text-xs font-mono text-zinc-500 uppercase">Validation Strategy</span>
                <div className="flex flex-wrap gap-2">
                  {plan.validationStrategy.map(v => <Badge key={v} label={v} color="blue" size="xs" />)}
                </div>
              </div>
              <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                <span className="text-xs font-mono text-zinc-500 uppercase">Rollback Strategy</span>
                <p className="text-sm text-zinc-300">{plan.rollbackStrategy}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: SHIELD ───────────────────────────────────────────── */}
      {exec && tab === "shield" && (
        <div className="space-y-4">
          <ShieldSummary report={shieldR} label="PRE-IMPLEMENTATION SHIELD" />
          {finalR && <ShieldSummary report={finalR} label="POST-IMPLEMENTATION SHIELD" />}
          {!shieldR && <p className="text-zinc-500 text-sm">Regression shield runs during RUN_REGRESSION_SHIELD stage.</p>}
        </div>
      )}

      {/* ── TAB: PREPARE ──────────────────────────────────────────── */}
      {exec && tab === "prepare" && (
        <div className="space-y-3">
          {exec.prepareLog.length === 0 && (
            <p className="text-zinc-500 text-sm">
              AUTO_PREPARE_ENVIRONMENT only runs when preconditions fail.
              {pc?.overall ? " Preconditions were OK — no preparation needed." : " Preparation ran — see log below."}
            </p>
          )}
          {exec.prepareLog.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-1">
              <span className="text-xs font-mono text-zinc-500 uppercase">Preparation Log</span>
              {exec.prepareLog.map((l, i) => (
                <p key={i} className="text-xs font-mono text-zinc-400">{l}</p>
              ))}
            </div>
          )}
          {exec.autoPrepareAttempts > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <Badge label={`Auto-prepare attempts: ${exec.autoPrepareAttempts}/${exec.maxPrepareAttempts}`} color="orange" />
              <Badge label={pc?.overall ? "Environment stabilized" : "Still unstable"} color={pc?.overall ? "green" : "yellow"} />
            </div>
          )}
        </div>
      )}

      {/* ── TAB: LOG ──────────────────────────────────────────────── */}
      {exec && tab === "log" && (
        <div className="space-y-2">
          <span className="text-xs font-mono text-zinc-500">{exec.log.length} log entries</span>
          <LogPanel log={exec.log} />
        </div>
      )}

      {/* Idle state */}
      {!exec && !running && (
        <div className="text-center py-16 text-zinc-600 space-y-3">
          <p className="text-5xl">⚙</p>
          <p className="text-sm">Enter an engineering objective above to start the autonomous lifecycle.</p>
          <p className="text-xs text-zinc-700">
            IDLE → ANALYZE → INSPECT CODEBASE → INSPECT KG → INSPECT CONNECTORS →
            RUN REGRESSION SHIELD → PRECONDITIONS? → (AUTO PREPARE if needed) →
            GENERATE PLAN → ⏸ WAIT APPROVAL → IMPLEMENT → FULL REGRESSION → REPORT → DONE
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-zinc-600">STABLE BASELINE:</span>
        {["RKB","SourceCodeParser","KGStore","LiveCognitivePipeline","CCG","GitHubQueryRouter",
          "CognitiveAnswerComposer","CIS","GitHubConnector","Base44Connector"].map(c => (
          <Badge key={c} label={c} color="green" size="xs" />
        ))}
      </div>
    </div>
  );
}