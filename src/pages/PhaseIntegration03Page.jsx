/**
 * PhaseIntegration03Page.jsx — Sprint INTEGRATION-03 Dashboard
 * Knowledge-Aware Decision Engine
 * Route: /integration03
 */

import React, { useState, useMemo } from "react";
import { DecisionKnowledgePipeline } from "@/lib/decision-engine/integration/DecisionKnowledgePipeline";
import { DecisionKnowledgeAudit }    from "@/lib/decision-engine/integration/DecisionKnowledgeAudit";

const DECISION_COLORS = {
  APPROVE:  "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  REJECT:   "bg-red-900/40 text-red-300 border-red-800",
  DEFER:    "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  DELEGATE: "bg-sky-900/40 text-sky-300 border-sky-800",
  ESCALATE: "bg-orange-900/40 text-orange-300 border-orange-800",
  MERGE:    "bg-violet-900/40 text-violet-300 border-violet-800",
  ARCHIVE:  "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const RISK_COLORS = {
  CRITICAL: "text-red-400",
  HIGH:     "text-orange-400",
  MEDIUM:   "text-yellow-400",
  LOW:      "text-sky-400",
  NONE:     "text-zinc-500",
};

const CONFIDENCE_COLORS = {
  VERY_HIGH:    "text-emerald-400",
  HIGH:         "text-sky-400",
  MEDIUM:       "text-yellow-400",
  LOW:          "text-orange-400",
  INSUFFICIENT: "text-red-400",
};

const TABS = [
  { id: "context",    label: "Decision Context" },
  { id: "knowledge",  label: "Knowledge Used"   },
  { id: "risks",      label: "Known Risks"      },
  { id: "constraints",label: "Constraints"      },
  { id: "governance", label: "Governance"       },
  { id: "confidence", label: "Confidence"       },
  { id: "advisory",   label: "Advisory"         },
  { id: "audit",      label: "Audit"            },
  { id: "metrics",    label: "Metrics"          },
];

const DEMO_DECISIONS = [
  { decisionId: "DEC-001", goalId: "GOAL-001", intent: "approve connector runtime deployment",         decisionType: "APPROVE",  priority: "HIGH",     domain: "CONNECTOR",  components: ["connector-runtime"], project: "MemoryOS", sprint: "INT-03", tags: ["connector"] },
  { decisionId: "DEC-002", goalId: "GOAL-002", intent: "merge duplicate knowledge entries",            decisionType: "MERGE",    priority: "MEDIUM",   domain: "GOVERNANCE", components: ["kce","kre"],         project: "MemoryOS", sprint: "INT-03", tags: ["knowledge"]  },
  { decisionId: "DEC-003", goalId: "GOAL-003", intent: "reject anti-pattern architecture proposal",   decisionType: "REJECT",   priority: "HIGH",     domain: "ARCHITECTURE",components: ["planning-engine"],  project: "MemoryOS", sprint: "INT-03", tags: ["architecture"]},
  { decisionId: "DEC-004", goalId: "GOAL-004", intent: "escalate critical security regression",       decisionType: "ESCALATE", priority: "CRITICAL", domain: "SECURITY",   components: ["auth","gateway"],    project: "MemoryOS", sprint: "INT-03", tags: ["security"]   },
  { decisionId: "DEC-005", goalId: "GOAL-005", intent: "defer low-evidence planning change",          decisionType: "DEFER",    priority: "LOW",      domain: "PLANNING",   components: ["planning-engine"],   project: "MemoryOS", sprint: "INT-03", tags: ["planning"]   },
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

function ScoreBar({ value, max = 1, color = "bg-violet-600" }) {
  const pct = Math.round((Math.min(value, max) / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={color + " h-full"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-zinc-500 text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function PhaseIntegration03Page() {
  const [activeTab,  setActiveTab]  = useState("context");
  const [running,    setRunning]    = useState(false);
  const [results,    setResults]    = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics  = useMemo(() => DecisionKnowledgePipeline.getMetrics(), [refreshKey]);
  const timeline = useMemo(() => DecisionKnowledgeAudit.getTimeline(),   [refreshKey]);

  function runDemo() {
    setRunning(true);
    const out = DEMO_DECISIONS.map(function(d) {
      return { label: d.intent, result: DecisionKnowledgePipeline.run(d) };
    });
    setResults(out);
    setSelected(out[0] || null);
    setRefreshKey(function(k) { return k + 1; });
    setRunning(false);
  }

  const sel = selected ? selected.result : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT INTEGRATION-03 — KNOWLEDGE-AWARE DECISION ENGINE</div>
          <div className="text-xl font-bold text-white">Knowledge-Aware Decision Engine</div>
          <div className="text-zinc-400 text-sm mt-1">Every decision consults Knowledge Base before committing. Risk, Governance & Confidence are always considered.</div>
        </div>

        {/* Pipeline */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Request","Context","Provider","RiskAnalyzer","ConstraintResolver","GovernanceValidator","ConfidenceCalc","Advisor","Decision"].map(function(s, i, arr) {
              return (
                <React.Fragment key={s}>
                  <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{s}</span>
                  {i < arr.length-1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Overview metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Decisions Run"   value={metrics.totalDecisions}                          />
          <Metric label="Avg Confidence"  value={Math.round(metrics.avgConfidence * 100) + "%"}  color="text-sky-300"     />
          <Metric label="Avg Risks/Run"   value={metrics.avgRisks}                               color="text-orange-400"  />
          <Metric label="Blocked"         value={metrics.blockedDecisions}                       color="text-red-400"     />
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={runDemo} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "Run 5 Demo Decisions"}
          </button>
          {results.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {results.map(function(r, i) {
                return (
                  <button key={i} onClick={function() { setSelected(r); }}
                    className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (selected === r ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white")}>
                    {r.result.ctx.decisionId}
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
              <button key={t.id} onClick={function() { setActiveTab(t.id); }}
                className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Empty state */}
        {!sel && activeTab !== "metrics" && activeTab !== "audit" && (
          <div className="border border-zinc-700 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">Run demo decisions to populate the dashboard.</div>
        )}

        {/* Decision Context */}
        {sel && activeTab === "context" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
              <div className="text-zinc-400 text-xs tracking-widest mb-2">DECISION CONTEXT</div>
              {[
                ["Decision ID",   sel.ctx.decisionId],
                ["Goal ID",       sel.ctx.goalId],
                ["Intent",        sel.ctx.intent],
                ["Decision Type", sel.ctx.decisionType],
                ["Priority",      sel.ctx.priority],
                ["Domain",        sel.ctx.domain],
                ["Components",    sel.ctx.components.join(", ") || "—"],
                ["Sprint",        sel.ctx.sprint],
              ].map(function([k, v]) {
                return (
                  <div key={k} className="flex gap-3 text-sm border-b border-zinc-800 py-1.5 last:border-0">
                    <span className="text-zinc-500 w-32 shrink-0">{k}</span>
                    <span className="text-zinc-300">{v}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Knowledge Used"  value={sel.advisory.lessonsApplied.length + sel.advisory.bestPracticesApplied.length} />
              <Metric label="Risks Found"     value={sel.risk.risks.length}        color="text-orange-400" />
              <Metric label="Constraints"     value={sel.constraints.constraints.length} color="text-yellow-400" />
              <Metric label="Duration"        value={sel.durationMs + "ms"}        color="text-zinc-400"   />
            </div>
          </div>
        )}

        {/* Knowledge Used */}
        {sel && activeTab === "knowledge" && (
          <div className="space-y-3">
            {[
              { label: "LESSONS APPLIED",        items: sel.advisory.lessonsApplied,        color: "text-sky-400"     },
              { label: "BEST PRACTICES APPLIED",  items: sel.advisory.bestPracticesApplied,  color: "text-emerald-400" },
              { label: "GOVERNANCE APPLIED",      items: sel.advisory.governanceApplied,     color: "text-yellow-400"  },
            ].map(function(section) {
              return (
                <div key={section.label} className="border border-zinc-700 rounded-lg bg-zinc-900">
                  <div className={"px-4 py-2 border-b border-zinc-800 text-xs tracking-widest " + section.color}>{section.label} — {section.items.length}</div>
                  {section.items.length === 0 && <div className="px-4 py-4 text-zinc-600 text-xs">None found for this context.</div>}
                  {section.items.map(function(e) {
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                        <span className="text-zinc-300 text-sm flex-1">{e.title}</span>
                        <span className="text-zinc-500 text-xs">ev:{e.evidenceScore}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Known Risks */}
        {sel && activeTab === "risks" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Overall Risk"   value={sel.risk.overallLevel} color={RISK_COLORS[sel.risk.overallLevel]} />
              <Metric label="Risk Score"     value={sel.risk.riskScore}    color="text-orange-400" />
              <Metric label="Blockers"       value={sel.risk.blockers.length}  color="text-red-400"  />
              <Metric label="Warnings"       value={sel.risk.warnings.length}  color="text-yellow-400" />
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-orange-400 tracking-widest">RISK ENTRIES — {sel.risk.risks.length}</div>
              {sel.risk.risks.length === 0 && <div className="px-4 py-4 text-zinc-600 text-xs">No risks identified.</div>}
              {sel.risk.risks.map(function(r) {
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                    <span className={"text-xs font-bold w-16 " + RISK_COLORS[r.level]}>{r.level}</span>
                    <span className="text-zinc-300 text-sm flex-1">{r.title}</span>
                    <Badge label={r.source} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Constraints */}
        {sel && activeTab === "constraints" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge label={sel.constraints.blocked ? "BLOCKED" : "CLEAR"} style={sel.constraints.blocked ? "bg-red-900/40 text-red-300 border-red-800" : "bg-emerald-900/40 text-emerald-300 border-emerald-800"} />
              <span className="text-zinc-400 text-sm">{sel.constraints.constraints.length} constraints found</span>
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">MANDATORY — {sel.constraints.mandatory.length}</div>
              {sel.constraints.mandatory.length === 0 && <div className="px-4 py-3 text-zinc-600 text-xs">None.</div>}
              {sel.constraints.mandatory.map(function(c) {
                return (
                  <div key={c.id} className="px-4 py-2.5 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge label={c.type} style="bg-red-900/30 text-red-300 border-red-800" />
                      <span className="text-zinc-300 text-sm">{c.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">OPTIONAL — {sel.constraints.optional.length}</div>
              {sel.constraints.optional.length === 0 && <div className="px-4 py-3 text-zinc-600 text-xs">None.</div>}
              {sel.constraints.optional.map(function(c) {
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                    <Badge label={c.type} />
                    <span className="text-zinc-400 text-sm">{c.description}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Governance */}
        {sel && activeTab === "governance" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge label={sel.governance.compliant ? "COMPLIANT" : "VIOLATIONS"} style={sel.governance.compliant ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-red-900/40 text-red-300 border-red-800"} />
              <span className="text-zinc-400 text-sm">{sel.governance.checks.length} policies checked</span>
            </div>
            <div className="border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">GOVERNANCE CHECKS</div>
              {sel.governance.checks.length === 0 && <div className="px-4 py-4 text-zinc-600 text-xs">No governance policies matched.</div>}
              {sel.governance.checks.map(function(c) {
                return (
                  <div key={c.policyId} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                    <div className={"w-2 h-2 rounded-full shrink-0 " + (c.compliant ? "bg-emerald-500" : "bg-red-500")} />
                    <span className="text-zinc-300 text-sm flex-1">{c.policyName}</span>
                    <Badge label={c.priority} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Confidence */}
        {sel && activeTab === "confidence" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-5">
              <div className="text-center mb-4">
                <div className={"text-4xl font-bold font-mono " + CONFIDENCE_COLORS[sel.confidence.level]}>
                  {Math.round(sel.confidence.score * 100)}%
                </div>
                <div className={"text-sm mt-1 " + CONFIDENCE_COLORS[sel.confidence.level]}>{sel.confidence.level}</div>
              </div>
              <div className="space-y-3">
                {Object.entries(sel.confidence.breakdown).map(function([k, v]) {
                  const numV = Number(v);
                  return (
                    <div key={k} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500 capitalize">{k}</span>
                        <span className="text-zinc-400 font-mono">{Math.round(numV * 100)}%</span>
                      </div>
                      <ScoreBar value={numV / 0.40} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Advisory */}
        {sel && activeTab === "advisory" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
              <div className="text-zinc-400 text-xs tracking-widest mb-3">RECOMMENDED DECISION</div>
              <div className="flex items-center gap-3">
                <Badge label={sel.advisory.recommendedDecision} style={DECISION_COLORS[sel.advisory.recommendedDecision] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                <div className="flex gap-1">
                  {sel.advisory.alternativeDecisions.map(function(d) {
                    return <Badge key={d} label={d} style="bg-zinc-800 text-zinc-500 border-zinc-700" />;
                  })}
                </div>
              </div>
              {sel.advisory.rejectedDecisions.length > 0 && (
                <div className="mt-3 space-y-1">
                  {sel.advisory.rejectedDecisions.map(function(r, i) {
                    return <div key={i} className="text-red-400 text-xs">✗ {r.decision}: {r.reason}</div>;
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit */}
        {activeTab === "audit" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              DECISION KNOWLEDGE AUDIT — {timeline.length}
            </div>
            {timeline.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">Run demo decisions first.</div>}
            {timeline.map(function(e) {
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 text-xs flex-wrap">
                  <span className="text-zinc-600 w-20 shrink-0">{e.id}</span>
                  <span className="text-violet-300 w-20 shrink-0">{e.decisionId}</span>
                  <span className="text-zinc-400 flex-1 truncate">{e.intent}</span>
                  <Badge label={e.recommended} style={DECISION_COLORS[e.recommended] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                  <span className="text-sky-400">{Math.round(e.confidence * 100)}%</span>
                  <span className="text-orange-400">{e.risks}R</span>
                  <span className="text-zinc-500">{e.durationMs}ms</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Metrics */}
        {activeTab === "metrics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric label="Total Decisions"   value={metrics.totalDecisions}                            />
              <Metric label="Avg Confidence"    value={Math.round(metrics.avgConfidence * 100) + "%"}    color="text-sky-300"    />
              <Metric label="Avg Risks"         value={metrics.avgRisks}                                 color="text-orange-400" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric label="Blocked"           value={metrics.blockedDecisions}                         color="text-red-400"    />
              <Metric label="Avg Duration"      value={metrics.avgDurationMs + "ms"}                    color="text-zinc-400"   />
              <Metric label="Violation Count"   value={metrics.governanceViolations}                    color="text-yellow-400" />
            </div>
            {Object.keys(metrics.decisionBreakdown).length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">DECISION BREAKDOWN</div>
                {Object.entries(metrics.decisionBreakdown).map(function([d, c]) {
                  return (
                    <div key={d} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <Badge label={d} style={DECISION_COLORS[d] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                      <span className="flex-1" />
                      <span className="text-violet-400 font-mono text-xs">{c}x</span>
                    </div>
                  );
                })}
              </div>
            )}
            {metrics.totalDecisions === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">Run demo decisions to generate metrics.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}