/**
 * PhaseKB05Page.jsx — Sprint KB-05 Dashboard
 * Knowledge Governance Policy Engine
 * Route: /kb05
 */

import React, { useState, useMemo } from "react";
import { GovernancePolicyRegistry }      from "@/lib/operational-knowledge/governance/GovernancePolicyRegistry";
import { GovernancePolicyPipeline }      from "@/lib/operational-knowledge/governance/GovernancePolicyPipeline";
import { GovernancePolicyValidator }     from "@/lib/operational-knowledge/governance/GovernancePolicyValidator";
import { GovernancePolicyAudit }         from "@/lib/operational-knowledge/governance/GovernancePolicyAudit";
import { GovernancePolicyMetricsEngine } from "@/lib/operational-knowledge/governance/GovernancePolicyMetrics";

// ── Constants ─────────────────────────────────────────────────────────────────

const DECISION_COLORS = {
  APPROVE:              "text-emerald-400",
  REJECT:               "text-red-400",
  MERGE:                "text-violet-400",
  REQUEST_ENGINEERING:  "text-sky-400",
  REQUEST_SPECIALIST:   "text-yellow-400",
  REQUEST_FINAL:        "text-orange-400",
  ESCALATE:             "text-pink-400",
  ARCHIVE:              "text-zinc-500",
};

const DECISION_BADGES = {
  APPROVE:              "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  REJECT:               "bg-red-900/40 text-red-300 border-red-800",
  MERGE:                "bg-violet-900/40 text-violet-300 border-violet-800",
  REQUEST_ENGINEERING:  "bg-sky-900/40 text-sky-300 border-sky-800",
  REQUEST_SPECIALIST:   "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  REQUEST_FINAL:        "bg-orange-900/40 text-orange-300 border-orange-800",
  ESCALATE:             "bg-pink-900/40 text-pink-300 border-pink-800",
  ARCHIVE:              "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const PRIORITY_COLORS = {
  P0: "text-red-400",
  P1: "text-orange-400",
  P2: "text-yellow-400",
  P3: "text-sky-400",
  P4: "text-zinc-400",
};

const TABS = [
  { id: "policies",  label: "Policies"    },
  { id: "rules",     label: "Rules"       },
  { id: "flow",      label: "Decision Flow"},
  { id: "queue",     label: "Decision Queue"},
  { id: "matched",   label: "Matched Rules"},
  { id: "audit",     label: "Audit"       },
  { id: "metrics",   label: "Metrics"     },
];

// Sample scenarios for demo
const DEMO_SCENARIOS = [
  { label: "High Evidence (score=85, conf=0.80)", captureId: "KCE-S01", reviewId: "KRV-S01", evidenceScore: 85, confidence: 0.80, priority: "HIGH",     isLesson: true, isBestPractice: false, isAntiPattern: false, isKnownIssue: false, regressionCount: 0, duplicatesCount: 0 },
  { label: "Best Practice (score=70, conf=0.70)", captureId: "KCE-S02", reviewId: "KRV-S02", evidenceScore: 70, confidence: 0.70, priority: "MEDIUM",   isLesson: false, isBestPractice: true, isAntiPattern: false, isKnownIssue: false, regressionCount: 0, duplicatesCount: 0 },
  { label: "Anti-Pattern (score=60)",             captureId: "KCE-S03", reviewId: "KRV-S03", evidenceScore: 60, confidence: 0.60, priority: "HIGH",     isLesson: false, isBestPractice: false, isAntiPattern: true,  isKnownIssue: false, regressionCount: 0, duplicatesCount: 0 },
  { label: "Known Issue (score=55)",              captureId: "KCE-S04", reviewId: "KRV-S04", evidenceScore: 55, confidence: 0.55, priority: "MEDIUM",   isLesson: false, isBestPractice: false, isAntiPattern: false, isKnownIssue: true,  regressionCount: 0, duplicatesCount: 0 },
  { label: "Regression Detected (count=1)",       captureId: "KCE-S05", reviewId: "KRV-S05", evidenceScore: 65, confidence: 0.65, priority: "HIGH",     isLesson: true,  isBestPractice: false, isAntiPattern: false, isKnownIssue: false, regressionCount: 1, duplicatesCount: 0 },
  { label: "Critical Priority",                   captureId: "KCE-S06", reviewId: "KRV-S06", evidenceScore: 75, confidence: 0.72, priority: "CRITICAL", isLesson: true,  isBestPractice: false, isAntiPattern: false, isKnownIssue: false, regressionCount: 0, duplicatesCount: 0 },
  { label: "Duplicate Found (count=1)",           captureId: "KCE-S07", reviewId: "KRV-S07", evidenceScore: 70, confidence: 0.70, priority: "MEDIUM",   isLesson: true,  isBestPractice: false, isAntiPattern: false, isKnownIssue: false, regressionCount: 0, duplicatesCount: 1 },
  { label: "Low Evidence (score=15)",             captureId: "KCE-S08", reviewId: "KRV-S08", evidenceScore: 15, confidence: 0.30, priority: "LOW",      isLesson: true,  isBestPractice: false, isAntiPattern: false, isKnownIssue: false, regressionCount: 0, duplicatesCount: 0 },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-2 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>{label}</span>;
}

function Metric({ label, value, color, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className={"text-2xl font-bold font-mono " + (color || "text-violet-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-1">{label}</div>
      {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function ScoreBar({ score, max, color }) {
  const pct = ((score || 0) / (max || 100)) * 100;
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={"h-full rounded-full " + (color || "bg-violet-600")} style={{ width: pct + "%" }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PhaseKB05Page() {
  const [activeTab,    setActiveTab]    = useState("policies");
  const [running,      setRunning]      = useState(false);
  const [pipelineResults, setPipelineResults] = useState([]);
  const [selectedResult,  setSelectedResult]  = useState(null);
  const [refreshKey,   setRefreshKey]   = useState(0);

  const policies    = useMemo(() => GovernancePolicyRegistry.getAll(),   [refreshKey]);
  const activePols  = useMemo(() => GovernancePolicyRegistry.getActive(), [refreshKey]);
  const allRules    = useMemo(() => activePols.flatMap(p => p.rules),    [activePols]);
  const timeline    = useMemo(() => GovernancePolicyAudit.getTimeline(), [refreshKey]);
  const metrics     = useMemo(() => GovernancePolicyMetricsEngine.generate(), [refreshKey]);
  const validation  = useMemo(() => GovernancePolicyValidator.auditRegistry(), [refreshKey]);

  function runDemo() {
    setRunning(true);
    const results = DEMO_SCENARIOS.map(function(s) {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId:       s.captureId,
        reviewId:        s.reviewId,
        evidenceScore:   s.evidenceScore,
        confidence:      s.confidence,
        regressionCount: s.regressionCount,
        duplicatesCount: s.duplicatesCount,
        priority:        s.priority,
        isAntiPattern:   s.isAntiPattern,
        isBestPractice:  s.isBestPractice,
        isKnownIssue:    s.isKnownIssue,
        isLesson:        s.isLesson,
      });
      const pr = GovernancePolicyPipeline.run(ctx);
      return { label: s.label, ...pr };
    });
    setPipelineResults(results);
    setSelectedResult(results[0] || null);
    setRefreshKey(function(k) { return k + 1; });
    setRunning(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT KB-05 — KNOWLEDGE GOVERNANCE POLICY ENGINE</div>
          <div className="text-xl font-bold text-white">Knowledge Governance Policy Engine</div>
          <div className="text-zinc-400 text-sm mt-1">Every decision is policy-driven. No hardcoded logic. Fully configurable.</div>
        </div>

        {/* Pipeline flow */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["KnowledgeReview","GovernanceContext","PolicyRegistry","RuleEvaluator","DecisionEngine","Audit","Metrics"].map(function(s, i, arr) {
              return (
                <React.Fragment key={s}>
                  <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length - 1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{s}</span>
                  {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Overview metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Active Policies"  value={metrics.activePolicies}   />
          <Metric label="Total Rules"      value={allRules.length}           color="text-sky-300"    />
          <Metric label="Total Decisions"  value={metrics.totalDecisions}    color="text-violet-300" />
          <Metric label="Approval Rate"    value={Math.round(metrics.approvalRate * 100) + "%"} color="text-emerald-400" />
        </div>

        {/* Run button */}
        <div className="flex gap-3 items-center">
          <button onClick={runDemo} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "Run 8 Demo Scenarios"}
          </button>
          {!validation.certified && (
            <span className="text-red-400 text-xs">{validation.invalid} policy validation error(s)</span>
          )}
          {validation.certified && (
            <span className="text-emerald-400 text-xs">All policies valid</span>
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

        {/* Policies */}
        {activeTab === "policies" && (
          <div className="space-y-3">
            {policies.map(function(p) {
              return (
                <div key={p.id} className={"border rounded-xl bg-zinc-900 overflow-hidden " + (p.status === "ACTIVE" ? "border-zinc-700" : "border-zinc-800 opacity-50")}>
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
                    <Badge label={p.id} style="bg-zinc-800 text-violet-300 border-violet-800" />
                    <span className="text-white font-semibold text-sm flex-1">{p.name}</span>
                    <span className={"text-xs font-mono " + PRIORITY_COLORS[p.priority]}>Priority {p.priority}</span>
                    <Badge label={p.status} style={p.status === "ACTIVE" ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
                    <span className="text-zinc-500 text-xs">v{p.version}</span>
                  </div>
                  <div className="px-4 py-2 text-zinc-400 text-xs">{p.description}</div>
                  <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {p.rules.map(function(r) {
                      return (
                        <span key={r.id} className={"text-xs font-mono px-2 py-0.5 rounded border " + (DECISION_BADGES[r.decision] || "bg-zinc-800 text-zinc-400 border-zinc-700")}>
                          {r.id}: {r.decision}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rules */}
        {activeTab === "rules" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              ALL GOVERNANCE RULES — {allRules.length} active
            </div>
            {allRules.map(function(r) {
              return (
                <div key={r.id} className="px-4 py-3 border-b border-zinc-800 last:border-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-zinc-500 font-mono text-xs">{r.id}</span>
                    <span className="text-zinc-300 text-sm font-medium flex-1">{r.name}</span>
                    <Badge label={r.decision} style={DECISION_BADGES[r.decision]} />
                    <span className={"text-xs " + PRIORITY_COLORS[r.priority]}>{r.priority}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.conditions.map(function(c, i) {
                      return (
                        <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">
                          {c.field} {c.operator} {JSON.stringify(c.value)}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-zinc-500 text-xs">{r.reason}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Decision Flow */}
        {activeTab === "flow" && (
          <div className="space-y-4">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-5 space-y-4">
              <div className="text-zinc-400 text-xs tracking-widest">GOVERNANCE DECISION FLOW</div>
              {[
                ["Evidence Score >= 80 AND Confidence >= 75%", "APPROVE",             "GP-001 / GR-001"],
                ["isBestPractice AND Evidence >= 65",           "APPROVE",             "GP-001 / GR-002"],
                ["isKnownIssue",                                "REQUEST_ENGINEERING", "GP-002 / GR-003"],
                ["Evidence 40–79",                             "REQUEST_ENGINEERING", "GP-002 / GR-004"],
                ["Regression Count > 0",                       "REQUEST_SPECIALIST",  "GP-003 / GR-005"],
                ["isAntiPattern",                              "REQUEST_SPECIALIST",  "GP-003 / GR-006"],
                ["Priority = CRITICAL",                        "REQUEST_FINAL",       "GP-004 / GR-007"],
                ["Duplicates Count > 0",                       "MERGE",               "GP-004 / GR-008"],
                ["Evidence Score < 20",                        "REJECT",              "GP-005 / GR-009"],
                ["Confidence >= 95%",                          "ESCALATE",            "GP-005 / GR-010"],
              ].map(function(row, i) {
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-400 flex-1 text-xs">{row[0]}</span>
                    <span className="text-zinc-600">→</span>
                    <Badge label={row[1]} style={DECISION_BADGES[row[1]] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                    <span className="text-zinc-600 text-xs">{row[2]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Decision Queue */}
        {activeTab === "queue" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              DECISION QUEUE — {pipelineResults.length}
            </div>
            {pipelineResults.length === 0 && (
              <div className="px-4 py-8 text-center text-zinc-500 text-sm">Run demo scenarios to populate.</div>
            )}
            {pipelineResults.map(function(pr, i) {
              return (
                <button key={i} onClick={function() { setSelectedResult(pr); setActiveTab("matched"); }}
                  className={"w-full flex items-center px-4 py-3 border-b border-zinc-800 last:border-0 gap-3 text-left hover:bg-zinc-800/40 transition-colors " + (selectedResult === pr ? "bg-zinc-800/60" : "")}>
                  <span className="text-zinc-500 text-xs w-20 shrink-0">{pr.result.captureId}</span>
                  <span className="text-zinc-300 text-sm flex-1 truncate">{pr.label}</span>
                  <Badge label={pr.result.finalDecision} style={DECISION_BADGES[pr.result.finalDecision]} />
                  <span className="text-zinc-500 text-xs">{Math.round(pr.result.confidence * 100)}%</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Matched Rules detail */}
        {activeTab === "matched" && (
          <div className="space-y-4">
            {pipelineResults.length === 0 && (
              <div className="border border-zinc-700 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">Run demo scenarios first.</div>
            )}
            {pipelineResults.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pipelineResults.map(function(pr, i) {
                  return (
                    <button key={i} onClick={function() { setSelectedResult(pr); }}
                      className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (selectedResult === pr ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white")}>
                      {pr.result.captureId}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedResult && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-zinc-400 text-xs font-mono">{selectedResult.result.captureId}</span>
                    <span className="text-white font-semibold flex-1">{selectedResult.label}</span>
                    <Badge label={selectedResult.result.finalDecision} style={DECISION_BADGES[selectedResult.result.finalDecision]} />
                  </div>
                  <div className="text-zinc-400 text-xs">{selectedResult.result.reason}</div>
                  <div className="text-zinc-500 text-xs">Policy: {selectedResult.result.appliedPolicyId} · Reviewer Level: {selectedResult.result.reviewerLevel} · Confidence: {Math.round(selectedResult.result.confidence * 100)}%</div>
                </div>

                <div className="border border-emerald-900/40 rounded-lg bg-zinc-900">
                  <div className="px-4 py-2 border-b border-zinc-800 text-xs text-emerald-400 tracking-widest">MATCHED RULES — {selectedResult.result.matchedRules.length}</div>
                  {selectedResult.result.matchedRules.map(function(r) {
                    return (
                      <div key={r.ruleId} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                        <span className="text-zinc-500 font-mono text-xs">{r.ruleId}</span>
                        <span className="text-zinc-300 text-sm flex-1">{r.ruleName}</span>
                        <Badge label={r.decision} style={DECISION_BADGES[r.decision]} />
                        <span className={"text-xs " + PRIORITY_COLORS[r.priority]}>{r.priority}</span>
                      </div>
                    );
                  })}
                  {selectedResult.result.matchedRules.length === 0 && (
                    <div className="px-4 py-3 text-zinc-500 text-xs">No rules matched.</div>
                  )}
                </div>

                <div className="border border-red-900/30 rounded-lg bg-zinc-900">
                  <div className="px-4 py-2 border-b border-zinc-800 text-xs text-red-400 tracking-widest">REJECTED RULES — {selectedResult.result.rejectedRules.length}</div>
                  {selectedResult.result.rejectedRules.slice(0, 5).map(function(r) {
                    return (
                      <div key={r.ruleId} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 last:border-0 opacity-50">
                        <span className="text-zinc-600 font-mono text-xs">{r.ruleId}</span>
                        <span className="text-zinc-500 text-sm flex-1">{r.ruleName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit */}
        {activeTab === "audit" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              GOVERNANCE AUDIT TIMELINE — {timeline.length}
            </div>
            {timeline.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">Run demo scenarios first.</div>}
            {timeline.map(function(e) {
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
                  <div className="w-24 shrink-0">
                    <div className="text-zinc-600 text-xs">{e.id}</div>
                    <div className="text-zinc-500 text-xs">{e.timestamp.split("T")[0]}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-300 text-sm truncate">{e.event}</div>
                    <div className="text-zinc-500 text-xs mt-0.5 truncate">{e.result}</div>
                  </div>
                  <div className="text-zinc-600 text-xs shrink-0">{e.reviewer}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Metrics */}
        {activeTab === "metrics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Total Decisions"  value={metrics.totalDecisions}    />
              <Metric label="Auto Decisions"   value={metrics.autoDecisions}     color="text-emerald-400" />
              <Metric label="Human Decisions"  value={metrics.humanDecisions}    color="text-sky-400" />
              <Metric label="Escalations"      value={metrics.escalations}       color="text-orange-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border border-zinc-700 rounded-lg bg-zinc-900 p-4 space-y-3">
                <div className="text-zinc-400 text-xs tracking-widest">APPROVAL / REJECTION</div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-500">Approval Rate</span>
                    <span className="text-emerald-400 font-mono">{Math.round(metrics.approvalRate * 100)}%</span>
                  </div>
                  <ScoreBar score={metrics.approvalRate * 100} color="bg-emerald-600" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-500">Rejection Rate</span>
                    <span className="text-red-400 font-mono">{Math.round(metrics.rejectionRate * 100)}%</span>
                  </div>
                  <ScoreBar score={metrics.rejectionRate * 100} color="bg-red-600" />
                </div>
              </div>

              <div className="border border-zinc-700 rounded-lg bg-zinc-900 p-4">
                <div className="text-zinc-400 text-xs tracking-widest mb-3">POLICY HEALTH</div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span className="text-zinc-400 text-xs flex-1">Active</span>
                  <span className="text-zinc-300 font-mono text-xs">{metrics.activePolicies}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  <span className="text-zinc-400 text-xs flex-1">Inactive</span>
                  <span className="text-zinc-300 font-mono text-xs">{metrics.inactivePolicies}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <span className={"text-xs " + (validation.certified ? "text-emerald-400" : "text-red-400")}>
                    {validation.certified ? "All policies valid" : validation.invalid + " policy errors"}
                  </span>
                </div>
              </div>
            </div>

            {metrics.topPolicies.length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TOP POLICIES BY USAGE</div>
                {metrics.topPolicies.map(function(p) {
                  return (
                    <div key={p.policyId} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge label={p.policyId} style="bg-zinc-800 text-violet-300 border-violet-800" />
                        <span className="text-zinc-300 text-sm">{p.name}</span>
                      </div>
                      <span className="text-violet-400 font-mono text-xs">{p.hitCount}x</span>
                    </div>
                  );
                })}
              </div>
            )}

            {metrics.topRules.length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TOP RULES BY USAGE</div>
                {metrics.topRules.map(function(r) {
                  return (
                    <div key={r.ruleId} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 font-mono text-xs">{r.ruleId}</span>
                        <span className="text-zinc-300 text-sm">{r.name}</span>
                      </div>
                      <span className="text-sky-400 font-mono text-xs">{r.hitCount}x</span>
                    </div>
                  );
                })}
              </div>
            )}

            {metrics.totalDecisions === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
                Run demo scenarios to generate metrics.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}