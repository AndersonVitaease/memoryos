import React, { useState, useRef, useEffect } from "react";
import { EngineeringIntelligence } from "@/lib/engineering-intelligence/EngineeringIntelligence";

const ei = new EngineeringIntelligence();

function Badge({ label, color = "gray", xs }) {
  const c = {
    green:  "bg-green-900/40 text-green-300 border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border-blue-700/40",
    violet: "bg-violet-900/40 text-violet-300 border-violet-700/40",
    orange: "bg-orange-900/40 text-orange-300 border-orange-700/40",
    teal:   "bg-teal-900/40 text-teal-300 border-teal-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  const sz = xs ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return <span className={`${sz} font-mono rounded border ${c[color] ?? c.gray}`}>{label}</span>;
}

function Section({ title, children, accent }) {
  return (
    <div className={`border rounded-lg p-4 space-y-3 ${accent ? "border-violet-800/40 bg-violet-950/10" : "border-zinc-800"}`}>
      <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{title}</span>
      {children}
    </div>
  );
}

function KV({ k, v, vColor }) {
  return (
    <div className="flex gap-3 text-sm items-start">
      <span className="text-zinc-500 w-44 shrink-0">{k}</span>
      <span className={`${vColor ?? "text-zinc-300"} flex-1`}>{v}</span>
    </div>
  );
}

const EI_STAGES = [
  "ANALYZING_OBJECTIVE","INSPECTING_ARCHITECTURE","SEARCHING_REUSE",
  "ANALYZING_DEPENDENCIES","CALCULATING_RISK","ESTIMATING_CONFIDENCE",
  "CHOOSING_STRATEGY","REPAIRING_ENVIRONMENT","GENERATING_PLAN",
  "WAIT_APPROVAL","IMPLEMENTING","RUNNING_REGRESSION",
  "GENERATING_REPORT","STORING_LESSONS","DONE",
];

const STAGE_LABELS = {
  ANALYZING_OBJECTIVE:     "Analyze",
  INSPECTING_ARCHITECTURE: "Inspect Arch",
  SEARCHING_REUSE:         "Search Reuse",
  ANALYZING_DEPENDENCIES:  "Dependencies",
  CALCULATING_RISK:        "Risk",
  ESTIMATING_CONFIDENCE:   "Confidence",
  CHOOSING_STRATEGY:       "Strategy",
  REPAIRING_ENVIRONMENT:   "Repair Env",
  GENERATING_PLAN:         "Generate Plan",
  WAIT_APPROVAL:           "⏸ APPROVAL",
  IMPLEMENTING:            "Implement",
  RUNNING_REGRESSION:      "Regression",
  GENERATING_REPORT:       "Report",
  STORING_LESSONS:         "Lessons",
  DONE:                    "DONE",
};

function PipelineStrip({ stage }) {
  const activeIdx = EI_STAGES.indexOf(stage);
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {EI_STAGES.map((s, i) => {
        const isActive = s === stage;
        const isDone   = activeIdx > i;
        return (
          <React.Fragment key={s}>
            <div className={`px-2 py-1 rounded border text-[10px] font-mono transition-all
              ${isActive ? "border-violet-500 bg-violet-900/30 text-violet-200 ring-1 ring-violet-500/50" :
                isDone   ? "border-green-800 bg-green-900/20 text-green-500" :
                           "border-zinc-800 text-zinc-600"}`}>
              {isDone && !isActive ? "✓ " : ""}{STAGE_LABELS[s]}
            </div>
            {i < EI_STAGES.length - 1 && <span className="text-zinc-800 text-[10px]">→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const RISK_COLOR  = { LOW: "green", MEDIUM: "yellow", HIGH: "red", CRITICAL: "red" };
const CONF_COLOR  = { VERY_HIGH: "green", HIGH: "green", MEDIUM: "yellow", LOW: "orange", UNCERTAIN: "red" };
const STRAT_COLOR = { REUSE: "teal", EXTEND: "blue", CREATE: "violet", REFACTOR: "yellow", REJECT: "red", ASK_APPROVAL: "orange" };
const REPR_COLOR  = { PASS: "green", AUTO_FIXED: "teal", FAIL: "red", SKIPPED: "gray" };

function LogPane({ log }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [log?.length]);
  return (
    <div ref={ref} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 max-h-56 overflow-y-auto space-y-0.5">
      {!log?.length && <p className="text-zinc-700 text-xs font-mono">Awaiting execution…</p>}
      {log?.map((l, i) => <p key={i} className="text-xs font-mono text-zinc-400 leading-relaxed">{l}</p>)}
    </div>
  );
}

function ConfidenceBar({ score, label }) {
  const color = score >= 85 ? "bg-green-500" : score >= 70 ? "bg-blue-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-zinc-400">Confidence</span>
        <span className={`font-bold ${score >= 70 ? "text-green-300" : score >= 50 ? "text-yellow-300" : "text-red-400"}`}>{score}%</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded overflow-hidden">
        <div className={`h-2 ${color} rounded transition-all`} style={{ width: `${score}%` }} />
      </div>
      <div className="text-[10px] text-zinc-600 font-mono">{label}</div>
    </div>
  );
}

function ImpactGraph({ graph }) {
  if (!graph) return null;
  const direct   = graph.nodes.filter(n => n.impact === "DIRECT");
  const indirect = graph.nodes.filter(n => n.impact === "INDIRECT");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {[
          { label: "Direct",     items: direct.map(n => n.name) },
          { label: "Indirect",   items: indirect.map(n => n.name) },
          { label: "Singletons", items: graph.singletonsTouched },
          { label: "Pipelines",  items: graph.affectedPipelines },
        ].map(({ label, items }) => (
          <div key={label} className="bg-zinc-900 rounded p-2 space-y-1">
            <span className="font-mono text-zinc-500">{label} ({items.length})</span>
            {items.slice(0, 4).map(n => <p key={n} className="text-zinc-300 truncate">{n}</p>)}
            {items.length > 4 && <p className="text-zinc-600">+{items.length - 4} more</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-400 font-mono">KG Impact: {graph.kgImpact}</p>
      <p className="text-xs text-zinc-400 font-mono">Regression Impact: {graph.regressionImpact}</p>
    </div>
  );
}

function TimelinePanel({ timeline }) {
  const [search, setSearch] = useState("");
  const entries = search.trim() ? timeline.search(search) : timeline.all();
  const stats   = timeline.stats();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "TOTAL",   v: stats.total,            c: "gray" },
          { l: "PASSED",  v: stats.passed,           c: "green" },
          { l: "FAILED",  v: stats.failed,           c: stats.failed > 0 ? "red" : "gray" },
          { l: "SUCCESS", v: `${stats.successRate}%`, c: stats.successRate >= 80 ? "green" : "yellow" },
        ].map(({ l, v, c }) => (
          <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-xs font-mono text-zinc-500">{l}</div>
            <div className={`text-xl font-bold mt-1 ${c === "green" ? "text-green-300" : c === "red" ? "text-red-400" : c === "yellow" ? "text-yellow-300" : "text-white"}`}>{v}</div>
          </div>
        ))}
      </div>
      <input
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
        placeholder="Search timeline by keyword, strategy, outcome…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {entries.length === 0 && <p className="text-zinc-600 text-xs font-mono">No timeline entries yet. Complete an implementation to populate.</p>}
        {entries.map(e => (
          <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded border border-zinc-800 bg-zinc-900 text-xs font-mono">
            <Badge label={e.outcome} color={e.outcome === "PASS" ? "green" : e.outcome === "FAIL" ? "red" : e.outcome === "REJECTED" ? "red" : "gray"} xs />
            <Badge label={e.strategy} color={STRAT_COLOR[e.strategy] ?? "gray"} xs />
            <Badge label={e.regressionStatus} color={REPR_COLOR[e.regressionStatus] ?? "gray"} xs />
            <span className="text-zinc-400 flex-1 truncate">{e.objective}</span>
            <span className="text-zinc-600">{e.durationMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = ["overview", "architecture", "reuse", "dependencies", "risk", "decision", "repair", "lessons", "timeline", "log"];

export default function Phase621Page() {
  const [objective, setObjective]       = useState("");
  const [exec, setExec]                 = useState(null);
  const [running, setRunning]           = useState(false);
  const [approving, setApproving]       = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab]                   = useState("overview");
  const prevObjectives                  = useRef([]);

  useEffect(() => {
    ei.onStageChange = (updated) => setExec({ ...updated });
    return () => { ei.onStageChange = undefined; };
  }, []);

  async function handleStart() {
    if (!objective.trim() || running) return;
    setRunning(true);
    setTab("overview");
    try {
      await ei.run(objective.trim(), prevObjectives.current, []);
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove() {
    if (!exec || exec.stage !== "WAIT_APPROVAL" || approving) return;
    setApproving(true);
    try {
      const updated = await ei.approve(exec);
      prevObjectives.current.push(updated.objective);
      setTab("lessons");
    } finally {
      setApproving(false);
    }
  }

  function handleReject() {
    if (!exec || exec.stage !== "WAIT_APPROVAL" || !rejectReason.trim()) return;
    ei.reject(exec, rejectReason.trim());
    setRejectReason("");
  }

  function handleReset() {
    setExec(null);
    setObjective("");
    setTab("overview");
  }

  const stage = exec?.stage ?? "IDLE";
  const plan  = exec?.plan;
  const isDone = ["DONE","REJECTED","FAILED"].includes(stage);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.2.1</span>
          <Badge label="AUTONOMOUS ENGINEERING INTELLIGENCE" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Engineering Intelligence</h1>
        <p className="text-zinc-400 text-sm mt-1">
          11 autonomous engines · Objective → Architecture → Reuse → Dependencies → Risk → Confidence → Strategy → Repair → Plan → Approval → Implement → Regression → Learn
        </p>
      </div>

      {/* Pipeline strip */}
      <div className="border border-zinc-800 rounded-lg p-3">
        <PipelineStrip stage={stage} />
      </div>

      {/* Status bar */}
      {exec && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
          <span className="text-xs font-mono text-zinc-500">STAGE</span>
          <Badge label={stage} color={stage === "DONE" ? "green" : stage === "WAIT_APPROVAL" ? "yellow" : stage === "REJECTED" ? "red" : "violet"} />
          <span className="text-xs text-zinc-600 font-mono">{exec.id}</span>
          {plan?.confidence && <Badge label={`${plan.confidence.score}% confidence`} color={CONF_COLOR[plan.confidence.label] ?? "gray"} />}
          {plan?.risk && <Badge label={`Risk: ${plan.risk.overallRisk}`} color={RISK_COLOR[plan.risk.overallRisk] ?? "gray"} />}
          {plan?.decision && <Badge label={plan.decision.strategy} color={STRAT_COLOR[plan.decision.strategy] ?? "gray"} />}
        </div>
      )}

      {/* Input */}
      <Section title="Engineering Objective">
        <div className="flex gap-3">
          <input
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder='e.g. "Create Gmail Connector" or "Add semantic caching to retrieval engine"'
            value={objective}
            onChange={e => setObjective(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !exec && handleStart()}
            disabled={running || !!exec}
          />
          {!exec && (
            <button onClick={handleStart} disabled={running || !objective.trim()}
              className="px-5 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-semibold transition-colors whitespace-nowrap">
              {running ? "Analyzing…" : "▶ Run Intelligence"}
            </button>
          )}
          {exec && isDone && (
            <button onClick={handleReset} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">
              ↺ New Request
            </button>
          )}
        </div>
      </Section>

      {/* Approval gate */}
      {stage === "WAIT_APPROVAL" && plan && (
        <div className="border border-yellow-700/60 rounded-lg p-5 bg-yellow-950/20 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-yellow-300 text-xl">⏸</span>
            <div>
              <p className="text-yellow-200 font-semibold">Engineering Plan ready — human approval required before implementation</p>
              <p className="text-yellow-600 text-xs mt-0.5">
                Strategy: {plan.decision.strategy} · Risk: {plan.risk.overallRisk} · Confidence: {plan.confidence.score}%
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <button onClick={handleApprove} disabled={approving}
              className="px-5 py-2.5 rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 text-sm font-semibold transition-colors">
              {approving ? "Processing…" : "✅ Approve — Authorize Implementation"}
            </button>
            <input className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500"
              placeholder="Rejection reason (required)…"
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <button onClick={handleReject} disabled={!rejectReason.trim()}
              className="px-4 py-2.5 rounded bg-red-800 hover:bg-red-700 disabled:opacity-40 text-sm font-semibold transition-colors">
              ❌ Reject
            </button>
          </div>
        </div>
      )}

      {/* Done/Rejected banners */}
      {stage === "DONE" && (
        <div className="border border-green-700/40 rounded-lg p-4 bg-green-950/10 flex items-center gap-3">
          <span className="text-green-300 text-xl">✅</span>
          <div>
            <p className="text-green-200 font-semibold">Intelligence lifecycle complete</p>
            <p className="text-green-600 text-xs">Regression: {plan?.regressionStatus ?? "N/A"} · Lessons stored · Timeline updated</p>
          </div>
        </div>
      )}
      {stage === "REJECTED" && (
        <div className="border border-red-700/40 rounded-lg p-4 bg-red-950/10">
          <p className="text-red-300 font-semibold">❌ Rejected: {exec?.rejectionReason}</p>
        </div>
      )}

      {/* Tabs */}
      {exec && (
        <div className="flex gap-1 flex-wrap border-b border-zinc-800">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-mono uppercase whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* TAB: OVERVIEW */}
      {exec && tab === "overview" && (
        <div className="space-y-4">
          {plan?.analysis && (
            <Section title="Objective Analysis">
              <KV k="Goal"              v={plan.analysis.goal} />
              <KV k="Scope"             v={plan.analysis.scope} />
              <KV k="Complexity"        v={<Badge label={plan.analysis.estimatedComplexity} color={RISK_COLOR[plan.analysis.estimatedComplexity]} />} />
              <KV k="Suggested Strategy" v={<Badge label={plan.analysis.suggestedStrategy} color={STRAT_COLOR[plan.analysis.suggestedStrategy] ?? "gray"} />} />
              <KV k="Impact"            v={plan.analysis.estimatedImpact} />
              {plan.analysis.requiredComponents.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {plan.analysis.requiredComponents.map(c => <Badge key={c} label={c} color="blue" xs />)}
                </div>
              )}
            </Section>
          )}
          {plan?.confidence && (
            <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
              <ConfidenceBar score={plan.confidence.score} label={plan.confidence.label} />
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(plan.confidence.breakdown).map(([k, v]) => {
                  const pct = Math.round(Number(v) * 100);
                  const barColor = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
                  return (
                    <div key={k} className="text-xs">
                      <span className="text-zinc-500 font-mono">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <div className="h-1 bg-zinc-800 rounded mt-1">
                        <div className={`h-1 rounded ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: ARCHITECTURE */}
      {exec && tab === "architecture" && plan?.architecture && (
        <div className="space-y-4">
          <Section title="Architecture Report">
            <KV k="KG Ready"    v={<Badge label={plan.architecture.kgReady ? "YES" : "NO"} color={plan.architecture.kgReady ? "green" : "yellow"} />} />
            <KV k="KG Entities" v={plan.architecture.kgEntityCount} />
            <KV k="KG Modules"  v={plan.architecture.kgModuleCount} />
          </Section>
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: "Reusable Components",    items: plan.architecture.reusableComponents,    color: "teal" },
              { title: "Candidate Components",   items: plan.architecture.candidateComponents,   color: "blue" },
              { title: "Conflicting Components", items: plan.architecture.conflictingComponents, color: "red" },
              { title: "Architectural Hotspots", items: plan.architecture.architecturalHotspots, color: "orange" },
            ].map(({ title, items }) => (
              <Section key={title} title={title}>
                {items.length === 0
                  ? <p className="text-zinc-600 text-xs">None</p>
                  : items.map(c => <p key={c} className="text-sm text-zinc-300 font-mono">{c}</p>)}
              </Section>
            ))}
          </div>
        </div>
      )}

      {/* TAB: REUSE */}
      {exec && tab === "reuse" && plan?.reuse && (
        <Section title="Reuse Engine" accent>
          <KV k="Decision"         v={<Badge label={plan.reuse.decision} color={plan.reuse.decision === "REUSE" ? "teal" : plan.reuse.decision === "EXTEND" ? "blue" : "gray"} />} />
          <KV k="Explanation"      v={plan.reuse.explanation} />
          <KV k="Sources searched" v={plan.reuse.sources.join(" → ")} />
          {plan.reuse.found.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Exact matches — must reuse:</p>
              <div className="flex flex-wrap gap-1">{plan.reuse.found.map(c => <Badge key={c} label={c} color="teal" xs />)}</div>
            </div>
          )}
          {plan.reuse.partial.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Partial matches — consider extending:</p>
              <div className="flex flex-wrap gap-1">{plan.reuse.partial.map(c => <Badge key={c} label={c} color="blue" xs />)}</div>
            </div>
          )}
        </Section>
      )}

      {/* TAB: DEPENDENCIES */}
      {exec && tab === "dependencies" && plan?.impactGraph && (
        <Section title="Impact Graph">
          <ImpactGraph graph={plan.impactGraph} />
        </Section>
      )}

      {/* TAB: RISK */}
      {exec && tab === "risk" && plan?.risk && (
        <Section title="Risk Analysis">
          <KV k="Overall Risk" v={<Badge label={plan.risk.overallRisk} color={RISK_COLOR[plan.risk.overallRisk]} />} />
          <KV k="Explanation"  v={plan.risk.explanation} />
          <div className="space-y-2 mt-2">
            {plan.risk.factors.length === 0 && <p className="text-green-400 text-sm">No risk factors — safe to implement.</p>}
            {plan.risk.factors.map((f, i) => (
              <div key={i} className="flex gap-3 text-xs items-start px-3 py-2 rounded bg-zinc-900 border border-zinc-800">
                <Badge label={f.level}    color={RISK_COLOR[f.level]} xs />
                <Badge label={f.category} color="gray" xs />
                <span className="text-zinc-300 flex-1">{f.description}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* TAB: DECISION */}
      {exec && tab === "decision" && plan?.decision && (
        <div className="space-y-4">
          <Section title="Strategy Decision" accent>
            <div className="flex items-center gap-4">
              <Badge label={plan.decision.strategy} color={STRAT_COLOR[plan.decision.strategy] ?? "gray"} />
              <span className="text-zinc-300 text-sm">{plan.decision.rationale}</span>
            </div>
            <KV k="Confidence" v={`${plan.decision.confidence}%`} />
          </Section>
          {plan.decision.alternatives.length > 0 && (
            <Section title="Alternatives Considered">
              {plan.decision.alternatives.map((a, i) => (
                <div key={i} className="flex gap-3 text-sm items-start">
                  <Badge label={a.strategy} color="gray" xs />
                  <span className="text-zinc-400">{a.reason}</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}

      {/* TAB: REPAIR */}
      {exec && tab === "repair" && (
        <Section title="Repair Engine">
          {!plan?.repairReport && <p className="text-zinc-500 text-sm">No environment repairs were needed for this objective.</p>}
          {plan?.repairReport && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge label={`Overall: ${plan.repairReport.overallStatus}`} color={REPR_COLOR[plan.repairReport.overallStatus] ?? "gray"} />
                {plan.repairReport.autoFixed > 0 && <Badge label={`${plan.repairReport.autoFixed} AUTO_FIXED`} color="teal" />}
                {plan.repairReport.failed > 0   && <Badge label={`${plan.repairReport.failed} failed`}     color="red" />}
              </div>
              {plan.repairReport.actions.map(a => (
                <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-1 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Badge label={a.result}   color={REPR_COLOR[a.result] ?? "gray"} xs />
                    <Badge label={a.category} color="gray" xs />
                    <span className="text-zinc-400">{a.strategy}</span>
                  </div>
                  <p className="text-zinc-500">Problem: {a.problem}</p>
                  <p className="text-zinc-300">{a.detail}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* TAB: LESSONS */}
      {exec && tab === "lessons" && (
        <Section title="Learning Engine">
          {!plan?.lessons && <p className="text-zinc-500 text-sm">Lessons generated after implementation completes.</p>}
          {plan?.lessons && (
            <div className="space-y-3">
              <KV k="Problem"        v={plan.lessons.problem} />
              <KV k="Solution"       v={plan.lessons.solution} />
              <KV k="Regression"     v={plan.lessons.regressionOutcome} />
              <KV k="Recommendation" v={plan.lessons.recommendation} vColor="text-violet-300" />
              <div>
                <p className="text-xs text-zinc-500 mb-2">Lessons Learned ({plan.lessons.lessonsLearned.length})</p>
                {plan.lessons.lessonsLearned.map((l, i) => (
                  <p key={i} className="text-sm text-zinc-300 mb-1">• {l}</p>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* TAB: TIMELINE */}
      {exec && tab === "timeline" && (
        <Section title="Engineering Timeline">
          <TimelinePanel timeline={ei.timeline} />
        </Section>
      )}

      {/* TAB: LOG */}
      {exec && tab === "log" && (
        <Section title={`Execution Log (${exec.log.length} entries)`}>
          <LogPane log={exec.log} />
        </Section>
      )}

      {/* Idle */}
      {!exec && !running && (
        <div className="text-center py-16 text-zinc-600 space-y-3">
          <p className="text-5xl">🧠</p>
          <p className="text-sm">Enter an engineering objective to launch the autonomous intelligence loop.</p>
          <p className="text-xs text-zinc-700">
            11 engines: ObjectiveAnalyzer → ArchitectureInspector → ReuseEngine → DependencyAnalyzer →
            RiskAnalyzer → ConfidenceEngine → EIDecisionEngine → RepairEngine →
            ⏸ Approval → Implement → Regression → LearningEngine → EngineeringTimeline
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-1 items-center">
        <span className="text-xs font-mono text-zinc-600 mr-1">ENGINES:</span>
        {["ObjectiveAnalyzer","ArchitectureInspector","ReuseEngine","DependencyAnalyzer",
          "RiskAnalyzer","ConfidenceEngine","EIDecisionEngine","RepairEngine","LearningEngine","EngineeringTimeline"].map(e => (
          <Badge key={e} label={e} color="violet" xs />
        ))}
      </div>
    </div>
  );
}