import React, { useState } from "react";
import { EngineeringOrchestrator } from "@/lib/engineering-workflow/EngineeringOrchestrator";

const orc = new EngineeringOrchestrator();

function Badge({ label, color = "gray" }) {
  const c = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    purple: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  return <span className={`text-xs font-mono px-2 py-0.5 rounded ${c[color]}`}>{label}</span>;
}

function Card({ title, children }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
      <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  );
}

const STATUS_COLOR = {
  IDLE: "gray", INSPECTING: "blue", PLANNING: "blue", PENDING_APPROVAL: "yellow",
  APPROVED: "blue", IMPLEMENTING: "blue", VALIDATING: "blue", REPAIRING: "red",
  UPDATING_KG: "blue", REPORTING: "blue", ARCHIVING: "blue", COMPLETE: "green",
  REJECTED: "red", FAILED: "red",
};

const COMPLEXITY_COLOR = { LOW: "green", MEDIUM: "yellow", HIGH: "red", CRITICAL: "red" };

const TABS = ["pipeline", "plan", "memory", "optimization", "log"];

export default function Phase620Page() {
  const [objective, setObjective]     = useState("");
  const [exec, setExec]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab]                 = useState("pipeline");
  const [memFilter, setMemFilter]     = useState("");

  async function handleRequest() {
    if (!objective.trim()) return;
    setLoading(true);
    try {
      const e = await orc.request(objective.trim());
      setExec({ ...e });
      setTab("plan");
    } finally {
      setLoading(false);
    }
  }

  function handleApprove() {
    if (!exec) return;
    setExec({ ...orc.approve(exec) });
  }

  function handleReject() {
    if (!exec || !rejectReason.trim()) return;
    setExec({ ...orc.reject(exec, rejectReason.trim()) });
    setRejectReason("");
  }

  function handleComplete() {
    if (!exec) return;
    const mockValidations = [
      { name: "Acceptance Validation (5/5)", passed: true, detail: "All KG queries route correctly" },
      { name: "Regression Validation",       passed: true, detail: "No stable components modified" },
      { name: "Integration Validation",      passed: true, detail: "Pipeline operational" },
      { name: "Knowledge Graph Validation",  passed: true, detail: "KGStore healthy" },
    ];
    const completed = orc.complete(exec, {
      filesModified:      ["example/NewFeature.ts"],
      componentsModified: ["ExampleComponent"],
      linesAdded:         120,
      linesRemoved:       8,
      validations:        mockValidations,
    });
    setExec({ ...completed });
    setTab("optimization");
  }

  const status = exec?.status ?? "IDLE";
  const plan   = exec?.session?.plan;
  const insp   = exec?.session?.inspectionSummary;
  const opt    = exec?.optimizationReport;
  const memStats = orc.memory.stats();
  const memEntries = orc.memory.query({ keyword: memFilter || undefined, limit: 30 }).entries;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.2.0</span>
          <Badge label="AUTONOMOUS ENGINEERING ORCHESTRATOR" color="purple" />
        </div>
        <h1 className="text-2xl font-bold">Engineering Orchestrator</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Single entry point for all engineering activity · Full lifecycle · Engineering Memory · Self-improvement
        </p>
      </div>

      {/* Pipeline diagram */}
      <div className="flex flex-wrap gap-1 items-center text-xs font-mono">
        {[
          "Objective","Inspect Architecture","Inspect KG","Inspect GitHub",
          "Inspect Commits","Inspect Diagnostics","Find Reusable","Check Previous Reports",
          "Detect Duplicates","Generate Plan","⏸ APPROVAL","Implement",
          "Validate","Auto-Repair","Update KG","Report","Archive",
        ].map((s, i, arr) => {
          const active = exec && (
            (s === "Inspect Architecture" && exec.status === "INSPECTING") ||
            (s === "Generate Plan"        && exec.status === "PLANNING") ||
            (s === "⏸ APPROVAL"           && exec.status === "PENDING_APPROVAL") ||
            (s === "Validate"             && exec.status === "VALIDATING") ||
            (s === "Auto-Repair"          && exec.status === "REPAIRING") ||
            (s === "Update KG"            && exec.status === "UPDATING_KG") ||
            (s === "Report"               && exec.status === "REPORTING") ||
            (s === "Archive"              && exec.status === "ARCHIVING")
          );
          return (
            <React.Fragment key={s}>
              <span className={`px-2 py-1 rounded border text-zinc-400 ${active ? "border-violet-500 text-violet-300 bg-violet-950/30" : "border-zinc-800 bg-zinc-900"}`}>
                {s}
              </span>
              {i < arr.length - 1 && <span className="text-zinc-700">→</span>}
            </React.Fragment>
          );
        })}
      </div>

      {/* Input */}
      <Card title="Engineering Request">
        <div className="flex gap-3">
          <input
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder='e.g. "Add semantic caching to the retrieval engine"'
            value={objective}
            onChange={e => setObjective(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !exec && handleRequest()}
            disabled={loading || !!exec}
          />
          <button
            onClick={handleRequest}
            disabled={loading || !!exec || !objective.trim()}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-medium transition-colors"
          >
            {loading ? "Analyzing…" : "Request Feature"}
          </button>
          {exec && (
            <button onClick={() => { setExec(null); setObjective(""); setTab("pipeline"); }}
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">
              Reset
            </button>
          )}
        </div>
      </Card>

      {/* Status */}
      {exec && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900">
          <span className="text-xs text-zinc-500 font-mono">STATUS</span>
          <Badge label={status} color={STATUS_COLOR[status] ?? "gray"} />
          <span className="text-xs text-zinc-600 font-mono">{exec.id}</span>
          {exec.repairCycles > 0 && <Badge label={`${exec.repairCycles} repair cycle(s)`} color="yellow" />}
          {exec.completedAt && (
            <Badge label={`${exec.completedAt - exec.startedAt}ms`} color="gray" />
          )}
        </div>
      )}

      {/* Tabs */}
      {exec && (
        <div className="flex gap-1 border-b border-zinc-800">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-mono transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t.toUpperCase()}
            </button>
          ))}
          <button onClick={() => setTab("memory")}
            className={`px-4 py-2 text-sm font-mono transition-colors ml-auto ${tab === "memory" ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            MEMORY ({memStats.total})
          </button>
        </div>
      )}

      {/* TAB: PIPELINE */}
      {exec && tab === "pipeline" && (
        <div className="space-y-4">
          {insp && (
            <div className="grid grid-cols-2 gap-4">
              <Card title="Architecture Inspection">
                <div className="text-sm text-zinc-300">KG Entities: <span className="text-white font-mono">{insp.kgEntities}</span></div>
                <div className="text-sm text-zinc-300">KG Modules: <span className="text-white font-mono">{insp.kgModules}</span></div>
                <div className="text-sm text-zinc-300">KG Ready: <Badge label={insp.kgReady ? "YES" : "NO"} color={insp.kgReady ? "green" : "red"} /></div>
                <div className="text-sm text-zinc-300">GitHub Commits: <span className="text-white font-mono">{insp.recentCommits.length}</span></div>
              </Card>
              <Card title="Reusable Components">
                {insp.reusableCandidates.length === 0
                  ? <span className="text-zinc-500 text-sm">None detected</span>
                  : insp.reusableCandidates.map(c => <div key={c} className="text-sm text-blue-300 font-mono">↩ {c}</div>)}
              </Card>
              <Card title="Duplicate Risk">
                {insp.duplicateRisk.length === 0
                  ? <span className="text-green-400 text-sm">No duplicates detected ✅</span>
                  : insp.duplicateRisk.map((r, i) => <div key={i} className="text-sm text-yellow-300">{r}</div>)}
              </Card>
              <Card title="Previous Reports">
                {exec.previousReports.length === 0
                  ? <span className="text-zinc-500 text-sm">No previous reports</span>
                  : exec.previousReports.map(id => <div key={id} className="text-xs text-zinc-400 font-mono">{id}</div>)}
              </Card>
            </div>
          )}

          {/* Approval gate */}
          {status === "PENDING_APPROVAL" && (
            <div className="border border-yellow-700/50 rounded-lg p-4 bg-yellow-950/20 space-y-3">
              <p className="text-yellow-300 text-sm font-medium">
                ⏸ Engineering Plan ready. No implementation until approved.
              </p>
              <div className="flex gap-3">
                <button onClick={handleApprove}
                  className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-sm font-medium transition-colors">
                  ✅ Approve
                </button>
                <input
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none"
                  placeholder="Rejection reason"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
                <button onClick={handleReject} disabled={!rejectReason.trim()}
                  className="px-4 py-2 rounded bg-red-800 hover:bg-red-700 disabled:opacity-40 text-sm transition-colors">
                  ❌ Reject
                </button>
              </div>
            </div>
          )}

          {status === "APPROVED" && (
            <div className="border border-green-700/50 rounded-lg p-4 bg-green-950/20 space-y-3">
              <p className="text-green-300 text-sm">✅ Approved. Implementation authorized.</p>
              <button onClick={handleComplete}
                className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 text-sm font-medium transition-colors">
                ▶ Simulate Implementation + Validate
              </button>
            </div>
          )}

          {status === "COMPLETE" && (
            <div className="border border-green-700/50 rounded-lg p-4 bg-green-950/20">
              <p className="text-green-300 text-sm font-medium">✅ Execution complete. KG updated. Report archived.</p>
              {exec.kgUpdateSummary && <p className="text-zinc-400 text-xs font-mono mt-1">KG: {exec.kgUpdateSummary}</p>}
            </div>
          )}
        </div>
      )}

      {/* TAB: PLAN */}
      {exec && tab === "plan" && plan && (
        <div className="space-y-4">
          <Card title="Engineering Plan">
            <div className="flex gap-3 text-sm"><span className="text-zinc-500 w-44">Objective</span><span className="text-zinc-200">{plan.objective}</span></div>
            <div className="flex gap-3 text-sm"><span className="text-zinc-500 w-44">Complexity</span><Badge label={plan.estimatedComplexity} color={COMPLEXITY_COLOR[plan.estimatedComplexity]} /></div>
            <div className="flex gap-3 text-sm"><span className="text-zinc-500 w-44">Arch. Impact</span><span className="text-zinc-200">{plan.architecturalImpact}</span></div>
            <div className="flex gap-3 text-sm"><span className="text-zinc-500 w-44">Rollback</span><span className="text-zinc-200">{plan.rollbackStrategy}</span></div>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <Card title="Stable Components Touched">
              {plan.stableComponentsTouched.length === 0
                ? <span className="text-green-400 text-sm">None — additive only ✅</span>
                : plan.stableComponentsTouched.map(c => <div key={c} className="text-sm text-red-400 font-mono">⚠ {c}</div>)}
            </Card>
            <Card title="Regression Risks">
              {plan.regressionRisks.map((r, i) => <div key={i} className="text-sm text-yellow-300">{r}</div>)}
            </Card>
          </div>
          <Card title="Implementation Order">
            {plan.implementationOrder.map((s, i) => <div key={i} className="text-sm text-zinc-300 font-mono">{s}</div>)}
          </Card>
          <Card title="Validation Strategy">
            <div className="flex flex-wrap gap-2">
              {plan.validationStrategy.map(v => <Badge key={v} label={v} color="blue" />)}
            </div>
          </Card>
        </div>
      )}

      {/* TAB: MEMORY */}
      {tab === "memory" && (
        <div className="space-y-4">
          <Card title="Engineering Memory Statistics">
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(memStats.byType).map(([type, count]) => (
                <div key={type} className="bg-zinc-900 rounded p-3">
                  <div className="text-xs font-mono text-zinc-500">{type.replace(/_/g, " ").toUpperCase()}</div>
                  <div className="text-2xl font-bold text-white mt-1">{count}</div>
                </div>
              ))}
              {memStats.total === 0 && <span className="text-zinc-500 text-sm col-span-3">No memory entries yet</span>}
            </div>
          </Card>
          <Card title="Memory Query">
            <input
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              placeholder="Filter by keyword, component name…"
              value={memFilter}
              onChange={e => setMemFilter(e.target.value)}
            />
            <div className="space-y-2 max-h-96 overflow-y-auto mt-2">
              {memEntries.length === 0 && <span className="text-zinc-500 text-sm">No entries match</span>}
              {memEntries.map(e => (
                <div key={e.id} className="bg-zinc-900 rounded p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge label={e.type.replace(/_/g, " ")} color={
                      e.type === "completed_work" ? "green" :
                      e.type === "rejected_plan"  ? "red"   :
                      e.type === "regression"     ? "red"   :
                      e.type === "engineering_report" ? "blue" : "gray"
                    } />
                    <span className="text-xs text-zinc-500 font-mono">{new Date(e.timestamp).toISOString().slice(11, 19)}</span>
                  </div>
                  <p className="text-sm text-zinc-300">{e.objective}</p>
                  <p className="text-xs text-zinc-500">{e.summary}</p>
                  {e.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {e.tags.slice(0, 5).map(t => <Badge key={t} label={t} color="gray" />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB: OPTIMIZATION */}
      {exec && tab === "optimization" && (
        <div className="space-y-4">
          {!opt && <p className="text-zinc-500 text-sm">Optimization report generated after implementation completes.</p>}
          {opt && (
            <>
              <Card title="Self-Improvement Evaluation">
                <div className="flex gap-3 text-sm"><span className="text-zinc-500 w-44">Fewer files possible</span><Badge label={opt.fewerFilessPossible ? "YES" : "NO"} color={opt.fewerFilessPossible ? "yellow" : "green"} /></div>
                <div className="flex gap-3 text-sm"><span className="text-zinc-500 w-44">Oversized impl.</span><Badge label={opt.oversizedImpl ? "YES" : "NO"} color={opt.oversizedImpl ? "red" : "green"} /></div>
                <div className="flex gap-3 text-sm"><span className="text-zinc-500 w-44">Regressions</span><Badge label={opt.regressionsIntroduced ? "YES" : "NONE"} color={opt.regressionsIntroduced ? "red" : "green"} /></div>
              </Card>
              <Card title="Reuse Missed">
                {opt.reuseMissed.length === 0
                  ? <span className="text-green-400 text-sm">All reusable components utilized ✅</span>
                  : opt.reuseMissed.map(r => <div key={r} className="text-sm text-yellow-300">↩ {r}</div>)}
              </Card>
              <Card title="Recommendations">
                {opt.recommendations.map((r, i) => <div key={i} className="text-sm text-zinc-300">• {r}</div>)}
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB: LOG */}
      {exec && tab === "log" && (
        <Card title="Execution Log">
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {exec.log.map((line, i) => <div key={i} className="text-xs font-mono text-zinc-400">{line}</div>)}
          </div>
        </Card>
      )}

      {/* Stable baseline footer */}
      <div className="border-t border-zinc-800 pt-4 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-zinc-600">BASELINE STABLE:</span>
          {["RepositoryKnowledgeBuilder","SourceCodeParser","KnowledgeGraphStore","LiveCognitivePipeline",
            "ConversationCognitiveGateway","GitHubQueryRouter","CognitiveAnswerComposer",
            "ConnectorInvocationService","GitHubConnector","Base44Connector"].map(c => (
            <Badge key={c} label={c} color="green" />
          ))}
        </div>
        <p className="text-xs text-zinc-600 font-mono">
          Acceptance 5/5 · Phase 6.0.4 COMPLETE · Sprint 6.1.0 COMPLETE · Sprint 6.2.0 ACTIVE
        </p>
      </div>
    </div>
  );
}