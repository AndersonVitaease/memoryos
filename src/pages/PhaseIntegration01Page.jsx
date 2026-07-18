/**
 * PhaseIntegration01Page.jsx — Sprint INTEGRATION-01 Dashboard
 * Knowledge-Aware Planning Engine
 * Route: /integration01
 */

import React, { useState, useMemo } from "react";
import { PlanningKnowledgePipeline } from "@/lib/planning-engine/integration/PlanningKnowledgePipeline";
import { PlanningKnowledgeAudit }    from "@/lib/planning-engine/integration/PlanningKnowledgeAudit";

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_COLORS = {
  LESSON:        "bg-sky-900/40 text-sky-300 border-sky-800",
  BEST_PRACTICE: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  KNOWN_ISSUE:   "bg-red-900/40 text-red-300 border-red-800",
  ANTI_PATTERN:  "bg-orange-900/40 text-orange-300 border-orange-800",
  JOURNAL:       "bg-violet-900/40 text-violet-300 border-violet-800",
  GOVERNANCE:    "bg-yellow-900/40 text-yellow-300 border-yellow-800",
};

const TABS = [
  { id: "context",    label: "Knowledge Context" },
  { id: "search",     label: "Knowledge Search"  },
  { id: "ranking",    label: "Ranking"           },
  { id: "advice",     label: "Recommendations"   },
  { id: "risks",      label: "Known Risks"       },
  { id: "governance", label: "Governance Used"   },
  { id: "audit",      label: "Audit"             },
  { id: "metrics",    label: "Metrics"           },
];

const DEMO_GOALS = [
  { goalId: "GOAL-001", intent: "Implement new connector for Calendar integration", priority: "HIGH",     domain: "CONNECTOR",     components: ["connector-runtime", "calendar"], sprint: "INT-01", tags: ["connector","calendar"] },
  { goalId: "GOAL-002", intent: "Improve memory retrieval performance",             priority: "MEDIUM",   domain: "RUNTIME",       components: ["retrieval-engine"],              sprint: "INT-01", tags: ["performance","memory"] },
  { goalId: "GOAL-003", intent: "Fix critical regression in knowledge pipeline",    priority: "CRITICAL", domain: "GOVERNANCE",    components: ["kce","kre"],                     sprint: "INT-01", tags: ["regression","pipeline"] },
  { goalId: "GOAL-004", intent: "Add end-to-end tests for planning engine",         priority: "LOW",      domain: "TESTING",       components: ["planning-engine"],               sprint: "INT-01", tags: ["testing"] },
];

// ── Small components ──────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-2 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>{label}</span>;
}

function ScoreBar({ value, max = 1, color = "bg-violet-600" }) {
  const pct = Math.round(((value || 0) / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={color + " h-full rounded-full"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-zinc-500 text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className={"text-2xl font-bold font-mono " + (color || "text-violet-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-1">{label}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PhaseIntegration01Page() {
  const [activeTab,  setActiveTab]  = useState("context");
  const [running,    setRunning]    = useState(false);
  const [results,    setResults]    = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics = useMemo(() => PlanningKnowledgePipeline.getMetrics(), [refreshKey]);

  function runDemo() {
    setRunning(true);
    PlanningKnowledgePipeline.invalidateCache();
    const out = DEMO_GOALS.map(function(g) {
      return { goal: g, result: PlanningKnowledgePipeline.run(g) };
    });
    setResults(out);
    setSelected(out[0] || null);
    setRefreshKey(function(k) { return k + 1; });
    setRunning(false);
  }

  const sel = selected?.result;
  const selGoal = selected?.goal;

  const auditTimeline = useMemo(function() {
    return PlanningKnowledgeAudit.getTimeline();
  }, [refreshKey]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT INTEGRATION-01 — KNOWLEDGE-AWARE PLANNING ENGINE</div>
          <div className="text-xl font-bold text-white">Knowledge-Aware Planning Engine</div>
          <div className="text-zinc-400 text-sm mt-1">Every plan is enriched by Operational Knowledge before execution.</div>
        </div>

        {/* Flow */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Goal","PlanningContext","KnowledgeProvider","Filter","Ranking","Resolver","Advisor","PlanningEngine","ExecutionPlan"].map(function(s, i, arr) {
              return (
                <React.Fragment key={s}>
                  <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length - 1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{s}</span>
                  {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Metrics overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Plans Run"             value={metrics.totalPlans}           />
          <Metric label="Knowledge Consulted"   value={metrics.knowledgeConsulted}   color="text-sky-300"    />
          <Metric label="Knowledge Used"        value={metrics.knowledgeUsed}        color="text-emerald-400"/>
          <Metric label="Recommendations"       value={metrics.totalRecommendations} color="text-violet-300" />
        </div>

        {/* Controls */}
        <div className="flex gap-3 items-center">
          <button onClick={runDemo} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "Run 4 Demo Planning Goals"}
          </button>
          {results.length > 0 && (
            <div className="flex gap-2">
              {results.map(function(r, i) {
                return (
                  <button key={i} onClick={function() { setSelected(r); }}
                    className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (selected === r ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white")}>
                    {r.goal.goalId}
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
        {!sel && activeTab !== "metrics" && (
          <div className="border border-zinc-700 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
            Run demo planning goals to populate the dashboard.
          </div>
        )}

        {/* Knowledge Context */}
        {sel && activeTab === "context" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
              <div className="text-zinc-400 text-xs tracking-widest mb-2">PLANNING CONTEXT</div>
              {[
                ["Goal ID",    selGoal.goalId],
                ["Intent",     selGoal.intent],
                ["Priority",   selGoal.priority],
                ["Domain",     selGoal.domain],
                ["Sprint",     selGoal.sprint],
                ["Components", selGoal.components.join(", ") || "—"],
                ["Tags",       selGoal.tags.join(", ") || "—"],
              ].map(function([k, v]) {
                return (
                  <div key={k} className="flex gap-3 text-sm">
                    <span className="text-zinc-500 w-28 shrink-0">{k}</span>
                    <span className="text-zinc-300">{v}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Total Items"    value={sel.itemCount.total}    />
              <Metric label="Kept"          value={sel.itemCount.kept}      color="text-emerald-400" />
              <Metric label="Accepted"      value={sel.itemCount.accepted}  color="text-sky-400"     />
              <Metric label="Conflicts"     value={sel.conflicts.length}    color="text-orange-400"  />
            </div>
            <div className="flex gap-2 items-center">
              <Badge label={sel.cacheHit ? "CACHE HIT" : "CACHE MISS"} style={sel.cacheHit ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-zinc-800 text-zinc-400 border-zinc-700"} />
              <span className="text-zinc-500 text-xs">{sel.durationMs}ms</span>
            </div>
          </div>
        )}

        {/* Knowledge Search */}
        {sel && activeTab === "search" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              ALL KNOWLEDGE ITEMS — {sel.filtered.kept.length} kept / {sel.filtered.removed.length} removed
            </div>
            {sel.filtered.kept.slice(0, 20).map(function(item, i) {
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                  <Badge label={item.kind} style={KIND_COLORS[item.kind] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                  <span className="text-zinc-300 text-sm flex-1 truncate">{item.title}</span>
                  <span className="text-zinc-500 text-xs">ev:{item.evidenceScore}</span>
                </div>
              );
            })}
            {sel.filtered.removed.length > 0 && (
              <div className="px-4 py-3 text-zinc-600 text-xs">
                + {sel.filtered.removed.length} items filtered out
              </div>
            )}
          </div>
        )}

        {/* Ranking */}
        {sel && activeTab === "ranking" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              KNOWLEDGE RANKING — top {Math.min(sel.itemCount.accepted, 10)}
            </div>
            {sel.filtered.kept.slice(0, 10).map(function(item, i) {
              const score = item.evidenceScore / 100 * 0.4 + item.confidence * 0.25 + 0.45;
              return (
                <div key={i} className="px-4 py-3 border-b border-zinc-800 last:border-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 text-xs w-4">{i + 1}</span>
                    <Badge label={item.kind} style={KIND_COLORS[item.kind] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                    <span className="text-zinc-300 text-sm flex-1">{item.title}</span>
                    <span className="text-violet-400 font-mono text-xs">{Math.round(score * 1000) / 1000}</span>
                  </div>
                  <div className="pl-8">
                    <ScoreBar value={item.evidenceScore} max={100} color="bg-violet-600" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recommendations */}
        {sel && activeTab === "advice" && sel.advisory && (
          <div className="space-y-3">
            {[
              { label: "RECOMMENDED PRACTICES",  items: sel.advisory.recommendedPractices, kind: "BEST_PRACTICE" },
              { label: "IMPORTANT LESSONS",      items: sel.advisory.importantLessons,     kind: "LESSON"        },
            ].map(function(section) {
              return (
                <div key={section.label} className="border border-zinc-700 rounded-lg bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">{section.label} — {section.items.length}</div>
                  {section.items.length === 0 && <div className="px-4 py-4 text-zinc-600 text-xs">None found.</div>}
                  {section.items.map(function(e) {
                    return (
                      <div key={e.id} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge label={e.kind} style={KIND_COLORS[e.kind] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                          <span className="text-zinc-300 text-sm flex-1">{e.title}</span>
                          <span className="text-zinc-500 text-xs">ev:{e.evidenceScore}</span>
                        </div>
                        {e.summary && <div className="text-zinc-500 text-xs pl-1">{e.summary.slice(0, 120)}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {sel.advisory.requiredReviews.length > 0 && (
              <div className="border border-orange-900/40 rounded-lg bg-zinc-900 p-4">
                <div className="text-orange-400 text-xs tracking-widest mb-2">REQUIRED REVIEWS</div>
                {sel.advisory.requiredReviews.map(function(r, i) {
                  return <div key={i} className="text-orange-300 text-sm">⚠ {r}</div>;
                })}
              </div>
            )}
          </div>
        )}

        {/* Known Risks */}
        {sel && activeTab === "risks" && sel.advisory && (
          <div className="space-y-3">
            <div className="border border-red-900/30 rounded-lg bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-red-400 tracking-widest">KNOWN RISKS — {sel.advisory.knownRisks.length}</div>
              {sel.advisory.knownRisks.length === 0 && <div className="px-4 py-4 text-zinc-600 text-xs">No known issues for this context.</div>}
              {sel.advisory.knownRisks.map(function(e) {
                return (
                  <div key={e.id} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge label="KNOWN_ISSUE" style={KIND_COLORS.KNOWN_ISSUE} />
                      <span className="text-red-300 text-sm flex-1">{e.title}</span>
                      <span className="text-zinc-500 text-xs">conf:{Math.round(e.confidence * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border border-orange-900/30 rounded-lg bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-orange-400 tracking-widest">ANTI PATTERNS TO AVOID — {sel.advisory.avoidPatterns.length}</div>
              {sel.advisory.avoidPatterns.length === 0 && <div className="px-4 py-4 text-zinc-600 text-xs">No anti-patterns for this context.</div>}
              {sel.advisory.avoidPatterns.map(function(e) {
                return (
                  <div key={e.id} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge label="ANTI_PATTERN" style={KIND_COLORS.ANTI_PATTERN} />
                      <span className="text-orange-300 text-sm flex-1">{e.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Governance */}
        {sel && activeTab === "governance" && sel.advisory && (
          <div className="border border-yellow-900/30 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-yellow-400 tracking-widest">
              GOVERNANCE REQUIREMENTS — {sel.advisory.governanceRequirements.length}
            </div>
            {sel.advisory.governanceRequirements.length === 0 && (
              <div className="px-4 py-4 text-zinc-600 text-xs">No governance requirements for this context.</div>
            )}
            {sel.advisory.governanceRequirements.map(function(g) {
              return (
                <div key={g.policyId} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
                  <Badge label={g.policyId} style="bg-yellow-900/40 text-yellow-300 border-yellow-800" />
                  <span className="text-zinc-300 text-sm flex-1">{g.name}</span>
                  <Badge label={g.decision} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                  <span className="text-zinc-500 text-xs">{g.priority}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Audit */}
        {activeTab === "audit" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              PLANNING KNOWLEDGE AUDIT — {auditTimeline.length}
            </div>
            {auditTimeline.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">Run demo goals first.</div>}
            {auditTimeline.map(function(e) {
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 text-xs">
                  <span className="text-zinc-600 w-20 shrink-0">{e.id}</span>
                  <span className="text-violet-300 w-20 shrink-0">{e.goalId}</span>
                  <span className="text-zinc-500 flex-1">{e.timestamp.split("T")[0]}</span>
                  <span className="text-emerald-400">{e.used} used</span>
                  <span className="text-zinc-600">{e.dropped} dropped</span>
                  <span className="text-orange-400">{e.conflicts} conflicts</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Metrics */}
        {activeTab === "metrics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Total Plans"           value={metrics.totalPlans}           />
              <Metric label="Knowledge Consulted"   value={metrics.knowledgeConsulted}   color="text-sky-300"     />
              <Metric label="Knowledge Used"        value={metrics.knowledgeUsed}        color="text-emerald-400" />
              <Metric label="Discarded"             value={metrics.knowledgeDiscarded}   color="text-zinc-500"    />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric label="Avg Query Time"        value={metrics.avgQueryTimeMs + "ms"} color="text-violet-300"  />
              <Metric label="Total Conflicts"       value={metrics.totalConflicts}         color="text-orange-400" />
              <Metric label="Recommendations"       value={metrics.totalRecommendations}   color="text-sky-300"    />
            </div>
            {metrics.totalPlans === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
                Run demo goals to generate metrics.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}