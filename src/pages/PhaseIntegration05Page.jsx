/**
 * PhaseIntegration05Page.jsx — Sprint INTEGRATION-05 Dashboard
 * Knowledge-Aware Engineering Runtime
 * Route: /integration05
 */

import React, { useState, useMemo } from "react";
import { EngineeringKnowledgePipeline } from "@/lib/engineering-runtime/integration/EngineeringKnowledgePipeline";
import { EngineeringKnowledgeAudit }    from "@/lib/engineering-runtime/integration/EngineeringKnowledgeAudit";

const RESULT_COLORS = {
  APPROVED:     "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  BLOCKED:      "bg-red-900/40 text-red-300 border-red-800",
  DEFERRED:     "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  NEEDS_REVIEW: "bg-orange-900/40 text-orange-300 border-orange-800",
  COMPLETED:    "bg-sky-900/40 text-sky-300 border-sky-800",
};

const RISK_COLORS = {
  CRITICAL: "text-red-400", HIGH: "text-orange-400",
  MEDIUM: "text-yellow-400", LOW: "text-sky-400", NONE: "text-zinc-500",
};

const CONF_COLORS = {
  VERY_HIGH: "text-emerald-400", HIGH: "text-sky-400",
  MEDIUM: "text-yellow-400", LOW: "text-orange-400", INSUFFICIENT: "text-red-400",
};

const DEPLOY_COLORS = {
  READY: "text-emerald-400", NEEDS_REVIEW: "text-orange-400",
  BLOCKED: "text-red-400", DEFERRED: "text-yellow-400",
};

const TABS = [
  { id: "context",     label: "Context"       },
  { id: "knowledge",   label: "Knowledge"     },
  { id: "risks",       label: "Arch Risks"    },
  { id: "governance",  label: "Governance"    },
  { id: "constraints", label: "Reviews/Tests" },
  { id: "confidence",  label: "Confidence"    },
  { id: "strategy",    label: "Strategy"      },
  { id: "advisory",    label: "Advisory"      },
  { id: "report",      label: "Report"        },
  { id: "audit",       label: "Audit"         },
  { id: "metrics",     label: "Metrics"       },
];

const DEMO_TASKS = [
  { taskId: "TASK-001", task: "IMPLEMENT", intent: "add knowledge query facade to decision engine",    module: "decision-engine", component: "DecisionKnowledgeProvider", files: ["DecisionKnowledgeProvider.ts"], sprint: "INT-05", branch: "feature/int-05", priority: "HIGH",     tags: ["integration"]  },
  { taskId: "TASK-002", task: "REFACTOR",  intent: "refactor connector runtime integration layer",     module: "connector-runtime",component: "ConnectorKnowledgePipeline", files: ["ConnectorKnowledgePipeline.ts"], sprint: "INT-05", branch: "refactor/int-05", priority: "MEDIUM",  tags: ["refactor"]     },
  { taskId: "TASK-003", task: "BUG_FIX",   intent: "fix regression in knowledge query cache",          module: "knowledge-query",  component: "KnowledgeQueryCache",     files: ["KnowledgeQueryCache.ts"],        sprint: "INT-05", branch: "fix/kqc",       priority: "HIGH",     tags: ["bug","cache"]  },
  { taskId: "TASK-004", task: "DEPLOY",    intent: "deploy integration layer to production",           module: "all",              component: "pipeline",                files: [],                               sprint: "INT-05", branch: "main",          priority: "CRITICAL", tags: ["deploy"]       },
  { taskId: "TASK-005", task: "MIGRATION", intent: "migrate operational knowledge registry to facade", module: "operational-knowledge",component: "OKRegistry",           files: ["OperationalKnowledgeRegistry.ts"],sprint:"INT-05",branch:"migration/ok",priority:"HIGH",     tags: ["migration"]    },
];

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-2 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>{label}</span>;
}

function Metric({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className={"text-2xl font-bold font-mono " + (color || "text-violet-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-1">{label}</div>
    </div>
  );
}

function ScoreBar({ value, color = "bg-violet-600" }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={color + " h-full"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-zinc-500 text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex gap-3 text-sm border-b border-zinc-800 py-1.5 last:border-0">
      <span className="text-zinc-500 w-40 shrink-0">{k}</span>
      <span className="text-zinc-300">{String(v)}</span>
    </div>
  );
}

function ListSection({ title, items, color }) {
  return (
    <div className="border border-zinc-700 rounded-lg bg-zinc-900">
      <div className={"px-4 py-2 border-b border-zinc-800 text-xs tracking-widest " + (color || "text-zinc-400")}>
        {title} — {items.length}
      </div>
      {items.length === 0
        ? <div className="px-4 py-4 text-zinc-600 text-xs">None.</div>
        : items.map(function(item, i) {
            const isString = typeof item === "string";
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                {isString
                  ? <span className="text-zinc-300 text-sm">{item}</span>
                  : <>
                      <span className="text-zinc-300 text-sm flex-1">{item.title}</span>
                      {item.evidenceScore !== undefined && <span className="text-zinc-500 text-xs">ev:{item.evidenceScore}</span>}
                    </>
                }
              </div>
            );
          })}
    </div>
  );
}

export default function PhaseIntegration05Page() {
  const [tab,        setTab]        = useState("context");
  const [running,    setRunning]    = useState(false);
  const [results,    setResults]    = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics  = useMemo(function() { return EngineeringKnowledgePipeline.getMetrics(); }, [refreshKey]);
  const timeline = useMemo(function() { return EngineeringKnowledgeAudit.getTimeline();   }, [refreshKey]);

  function runDemo() {
    setRunning(true);
    const out = DEMO_TASKS.map(function(t) {
      return { label: t.taskId, result: EngineeringKnowledgePipeline.run(t) };
    });
    setResults(out);
    setSelected(out[0] || null);
    setRefreshKey(function(k) { return k + 1; });
    setRunning(false);
  }

  const s = selected ? selected.result : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT INTEGRATION-05 — KNOWLEDGE-AWARE ENGINEERING RUNTIME</div>
          <div className="text-xl font-bold text-white">Knowledge-Aware Engineering Runtime</div>
          <div className="text-zinc-400 text-sm mt-1">Every engineering task consults the Knowledge Base before executing. Architecture risks, governance, reviews, tests and deployment readiness are always considered.</div>
        </div>

        {/* Pipeline */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Task","Context","Provider","RiskAnalyzer","GovernanceValidator","Constraints","ConfidenceCalc","Strategy","Advisor","EngineeringRuntime","Report"].map(function(node, i, arr) {
              return (
                <React.Fragment key={node}>
                  <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{node}</span>
                  {i < arr.length-1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Tasks Run"      value={metrics.totalTasks} />
          <Metric label="Success Rate"   value={metrics.successRate + "%"}  color="text-emerald-400" />
          <Metric label="Avg Confidence" value={Math.round(metrics.avgConfidence * 100) + "%"} color="text-sky-400" />
          <Metric label="Block Rate"     value={metrics.blockRate + "%"}    color="text-red-400" />
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={runDemo} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "Run 5 Engineering Tasks"}
          </button>
          {results.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {results.map(function(r, i) {
                return (
                  <button key={i} onClick={function() { setSelected(r); setTab("context"); }}
                    className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (selected === r ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white")}>
                    {r.result.ctx.taskId}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(function(t) {
            return (
              <button key={t.id} onClick={function() { setTab(t.id); }}
                className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Empty state */}
        {!s && tab !== "metrics" && tab !== "audit" && (
          <div className="border border-zinc-700 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
            Run demo engineering tasks to populate the dashboard.
          </div>
        )}

        {/* Context */}
        {s && tab === "context" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
              <div className="text-zinc-400 text-xs tracking-widest mb-2">ENGINEERING CONTEXT</div>
              <Row k="Task ID"    v={s.ctx.taskId} />
              <Row k="Task Type"  v={s.ctx.task} />
              <Row k="Intent"     v={s.ctx.intent} />
              <Row k="Module"     v={s.ctx.module} />
              <Row k="Component"  v={s.ctx.component} />
              <Row k="Branch"     v={s.ctx.branch} />
              <Row k="Sprint"     v={s.ctx.sprint} />
              <Row k="Priority"   v={s.ctx.priority} />
              <Row k="Files"      v={s.ctx.files.length > 0 ? s.ctx.files.join(", ") : "—"} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Knowledge Used" value={s.bundle.all.length} />
              <Metric label="Risks Found"    value={s.risk.risks.length}         color="text-orange-400" />
              <Metric label="Reviews Req."   value={s.constraints.mandatoryReviews.length} color="text-yellow-400" />
              <Metric label="Duration"       value={s.durationMs + "ms"}         color="text-zinc-400" />
            </div>
          </div>
        )}

        {/* Knowledge */}
        {s && tab === "knowledge" && (
          <div className="space-y-3">
            <ListSection title="LESSONS APPLIED"       items={s.advisory.lessonsApplied}       color="text-sky-400"     />
            <ListSection title="BEST PRACTICES APPLIED"items={s.advisory.bestPracticesApplied} color="text-emerald-400" />
            <ListSection title="GOVERNANCE APPLIED"    items={s.advisory.governanceApplied}    color="text-yellow-400"  />
          </div>
        )}

        {/* Architecture Risks */}
        {s && tab === "risks" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Overall"       value={s.risk.overallLevel}        color={RISK_COLORS[s.risk.overallLevel]} />
              <Metric label="Risk Score"    value={s.risk.riskScore}           color="text-orange-400" />
              <Metric label="Blockers"      value={s.risk.blockers.length}     color="text-red-400" />
              <Metric label="Warnings"      value={s.risk.warnings.length}     color="text-yellow-400" />
            </div>
            <div className="flex gap-2 flex-wrap text-xs">
              <Badge label={s.risk.breakingChangeRisk ? "BREAKING CHANGE RISK" : "NO BREAKING CHANGE"} style={s.risk.breakingChangeRisk ? "bg-red-900/40 text-red-300 border-red-800" : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
              <Badge label={s.risk.regressionRisk ? "REGRESSION RISK" : "NO REGRESSION RISK"}          style={s.risk.regressionRisk     ? "bg-orange-900/40 text-orange-300 border-orange-800" : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-orange-400 tracking-widest">RISK ENTRIES — {s.risk.risks.length}</div>
              {s.risk.risks.length === 0
                ? <div className="px-4 py-4 text-zinc-600 text-xs">No risks identified.</div>
                : s.risk.risks.map(function(r) {
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                        <span className={"text-xs font-bold w-16 " + RISK_COLORS[r.level]}>{r.level}</span>
                        <span className="text-zinc-300 text-sm flex-1">{r.title}</span>
                        <Badge label={r.category} />
                      </div>
                    );
                  })}
            </div>
          </div>
        )}

        {/* Governance */}
        {s && tab === "governance" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Badge label={s.governance.compliant ? "COMPLIANT" : "VIOLATIONS"} style={s.governance.compliant ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-red-900/40 text-red-300 border-red-800"} />
              <Badge label={s.governance.blocked ? "BLOCKED" : "CLEAR"} style={s.governance.blocked ? "bg-red-900/40 text-red-300 border-red-800" : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">GOVERNANCE CHECKS — {s.governance.checks.length}</div>
              {s.governance.checks.length === 0
                ? <div className="px-4 py-4 text-zinc-600 text-xs">No policies matched.</div>
                : s.governance.checks.map(function(c) {
                    return (
                      <div key={c.policyId} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                        <div className={"w-2 h-2 rounded-full shrink-0 " + (c.compliant ? "bg-emerald-500" : "bg-red-500")} />
                        <span className="text-zinc-300 text-sm flex-1">{c.policyName}</span>
                        <Badge label={c.category} />
                      </div>
                    );
                  })}
            </div>
          </div>
        )}

        {/* Constraints */}
        {s && tab === "constraints" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Mandatory Reviews"  value={s.constraints.mandatoryReviews.length}     color="text-yellow-400" />
              <Metric label="Required Tests"     value={s.constraints.requiredTests.length}        color="text-sky-400"    />
            </div>
            <ListSection title="MANDATORY REVIEWS"    items={s.constraints.mandatoryReviews}     color="text-yellow-400" />
            <ListSection title="REQUIRED TESTS"       items={s.constraints.requiredTests}        color="text-sky-400"    />
            <ListSection title="REQUIRED DOCS"        items={s.constraints.requiredDocumentation}color="text-violet-400" />
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
              <Row k="Requires Approval"    v={s.constraints.requiresApproval     ? "YES" : "NO"} />
              <Row k="Requires Rollback"    v={s.constraints.requiresRollbackPlan ? "YES" : "NO"} />
              <Row k="Blocked Modules"      v={s.constraints.blockedModules.length > 0 ? s.constraints.blockedModules.join(", ") : "None"} />
            </div>
          </div>
        )}

        {/* Confidence */}
        {s && tab === "confidence" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-5 space-y-4">
            <div className="text-center">
              <div className={"text-4xl font-bold font-mono " + CONF_COLORS[s.confidence.level]}>
                {Math.round(s.confidence.score * 100)}%
              </div>
              <div className={"text-sm mt-1 " + CONF_COLORS[s.confidence.level]}>{s.confidence.level}</div>
            </div>
            <div className="space-y-3">
              {Object.entries(s.confidence.breakdown).map(function([k, v]) {
                return (
                  <div key={k} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500 capitalize">{k}</span>
                      <span className="text-zinc-400 font-mono">{Math.round(Number(v) * 100)}%</span>
                    </div>
                    <ScoreBar value={Number(v) / 0.35} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strategy */}
        {s && tab === "strategy" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Metric label="Validation"    value={s.plan.validationStrategy}   color="text-sky-400"    />
              <Metric label="Review"        value={s.plan.reviewStrategy}       color="text-yellow-400" />
              <Metric label="Testing"       value={s.plan.testingStrategy}      color="text-violet-400" />
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
              <Row k="Rollback Strategy"   v={s.plan.rollbackStrategy}   />
              <Row k="Merge Strategy"      v={s.plan.mergeStrategy}      />
              <Row k="Deploy Readiness"    v={s.plan.deploymentReadiness} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-xs">Deployment Readiness:</span>
              <span className={"text-sm font-bold " + (DEPLOY_COLORS[s.plan.deploymentReadiness] || "text-zinc-400")}>{s.plan.deploymentReadiness}</span>
            </div>
          </div>
        )}

        {/* Advisory */}
        {s && tab === "advisory" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
              <div className="flex items-center gap-3 mb-3">
                <Badge label={s.advisory.proceed ? "PROCEED" : "BLOCKED"} style={s.advisory.proceed ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-red-900/40 text-red-300 border-red-800"} />
                <Badge label={s.advisory.recommendedAction} />
              </div>
              <div className="text-zinc-400 text-sm mb-3">{s.advisory.reason}</div>
            </div>
            <ListSection title="REQUIRED REVIEWS" items={s.advisory.requiredReviews} color="text-yellow-400" />
            <ListSection title="REQUIRED TESTS"   items={s.advisory.requiredTests}   color="text-sky-400"    />
            <ListSection title="KNOWN RISKS"       items={s.advisory.knownRisks}      color="text-red-400"    />
          </div>
        )}

        {/* Report */}
        {s && tab === "report" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Badge label={s.report.result} style={RESULT_COLORS[s.report.result]} />
              <span className="text-zinc-500 text-xs">{s.report.reportId}</span>
            </div>
            <Row k="Module"           v={s.report.module} />
            <Row k="Component"        v={s.report.component} />
            <Row k="Files Modified"   v={s.report.filesModified} />
            <Row k="Knowledge Used"   v={s.report.knowledgeUsed} />
            <Row k="Governance Used"  v={s.report.governanceUsed} />
            <Row k="Strategy"         v={s.report.strategyUsed} />
            <Row k="Reviews Required" v={s.report.reviewsRequired} />
            <Row k="Tests Required"   v={s.report.testsRequired} />
            <Row k="Risk Level"       v={s.report.riskLevel} />
            <Row k="Confidence"       v={Math.round(s.report.confidence * 100) + "%"} />
            <Row k="Duration"         v={s.report.durationMs + "ms"} />
          </div>
        )}

        {/* Audit */}
        {tab === "audit" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              ENGINEERING KNOWLEDGE AUDIT — {timeline.length}
            </div>
            {timeline.length === 0
              ? <div className="px-4 py-8 text-center text-zinc-500 text-sm">Run tasks first.</div>
              : timeline.map(function(e) {
                  return (
                    <div key={e.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 last:border-0 text-xs flex-wrap">
                      <span className="text-zinc-600 w-20 shrink-0">{e.id}</span>
                      <span className="text-violet-300 w-20 shrink-0">{e.taskId}</span>
                      <span className="text-zinc-400 w-24 shrink-0">{e.task}</span>
                      <span className="text-zinc-500 flex-1 truncate">{e.module}</span>
                      <Badge label={e.result} style={RESULT_COLORS[e.result]} />
                      <span className="text-sky-400">{Math.round(e.confidence * 100)}%</span>
                      <span className="text-orange-400">{e.risks}R</span>
                      <span className="text-yellow-400">{e.reviews}Rev</span>
                      <span className="text-zinc-500">{e.durationMs}ms</span>
                    </div>
                  );
                })}
          </div>
        )}

        {/* Metrics */}
        {tab === "metrics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Total Tasks"    value={metrics.totalTasks} />
              <Metric label="Success Rate"   value={metrics.successRate + "%"}              color="text-emerald-400" />
              <Metric label="Block Rate"     value={metrics.blockRate + "%"}               color="text-red-400"     />
              <Metric label="Avg Confidence" value={Math.round(metrics.avgConfidence * 100) + "%"} color="text-sky-400" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Avg Duration"   value={metrics.avgDurationMs + "ms"}          color="text-zinc-400"    />
              <Metric label="Avg Risks"      value={metrics.avgRisks}                      color="text-orange-400"  />
              <Metric label="Avg Reviews"    value={metrics.avgReviews}                    color="text-yellow-400"  />
              <Metric label="Avg Tests"      value={metrics.avgTests}                      color="text-violet-400"  />
            </div>
            {Object.keys(metrics.resultBreakdown).length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">RESULT BREAKDOWN</div>
                {Object.entries(metrics.resultBreakdown).map(function([r, c]) {
                  return (
                    <div key={r} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <Badge label={r} style={RESULT_COLORS[r] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                      <span className="flex-1" />
                      <span className="text-violet-400 font-mono text-xs">{String(c)}x</span>
                    </div>
                  );
                })}
              </div>
            )}
            {Object.keys(metrics.taskBreakdown).length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TASK TYPE BREAKDOWN</div>
                {Object.entries(metrics.taskBreakdown).map(function([t, c]) {
                  return (
                    <div key={t} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <span className="text-zinc-300 text-sm flex-1">{t}</span>
                      <span className="text-violet-400 font-mono text-xs">{String(c)}x</span>
                    </div>
                  );
                })}
              </div>
            )}
            {metrics.totalTasks === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">Run tasks to generate metrics.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}