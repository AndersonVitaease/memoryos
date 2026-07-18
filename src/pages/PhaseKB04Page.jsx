/**
 * PhaseKB04Page.jsx — Sprint KB-04 Dashboard
 * Knowledge Review & Governance Engine
 * Route: /kb04
 */

import React, { useState, useMemo } from "react";
import { KnowledgeReviewPipeline }  from "@/lib/operational-knowledge/review/KnowledgeReviewPipeline";
import { KnowledgeReviewRegistry }  from "@/lib/operational-knowledge/review/KnowledgeReviewRegistry";
import { KnowledgeAuditEngine }     from "@/lib/operational-knowledge/review/KnowledgeAuditEngine";
import { KnowledgeMetricsEngine }   from "@/lib/operational-knowledge/review/KnowledgeMetricsEngine";
import { KCEPipeline }              from "@/lib/operational-knowledge/capture/KCEPipeline";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  PENDING:      "text-sky-400",
  UNDER_REVIEW: "text-yellow-400",
  APPROVED:     "text-emerald-400",
  REJECTED:     "text-red-400",
  DUPLICATE:    "text-amber-400",
  MERGED:       "text-violet-400",
  ARCHIVED:     "text-zinc-500",
};

const DECISION_COLORS = {
  APPROVE:        "text-emerald-400",
  REJECT:         "text-red-400",
  MERGE:          "text-violet-400",
  REQUEST_REVIEW: "text-yellow-400",
  ARCHIVE:        "text-zinc-500",
};

const APPROVAL_COLORS = {
  AUTO:        "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  ENGINEERING: "bg-sky-900/40 text-sky-300 border-sky-800",
  SPECIALIST:  "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  FINAL:       "bg-red-900/40 text-red-300 border-red-800",
};

const TABS = [
  { id: "pending",    label: "Pending"     },
  { id: "duplicates", label: "Duplicates"  },
  { id: "evidence",   label: "Evidence"    },
  { id: "queue",      label: "Review Queue"},
  { id: "promotion",  label: "Promotion"   },
  { id: "audit",      label: "Audit"       },
  { id: "metrics",    label: "Metrics"     },
];

const SAMPLE_CAPTURES = [
  {
    title: "TDZ Error on Boot",
    what: "App crashed on startup due to static module instantiation.",
    why: "WorkingMemoryEngine instantiated at top-level module scope before bundler resolved dependencies.",
    how: "Migrated to lazy async factory pattern using async factory functions.",
    outcome: "Boot errors eliminated. Engine initializes correctly on demand.",
    sprint: "Sprint 1",
    components: ["WorkingMemoryEngine"],
    files: [],
    tags: ["boot","TDZ","factory"],
    priority: "HIGH",
    sourceType: "INCIDENT_REPORT",
  },
  {
    title: "OAuth Token Lost on Page Refresh",
    what: "Google OAuth token lost after every browser refresh.",
    why: "Token stored in React component state which resets on unmount.",
    how: "Persisted token to GoogleOAuthToken entity immediately after OAuth exchange backend call.",
    outcome: "Sessions now survive page refresh. OAuth flow is persistent.",
    sprint: "OAuth Sprint",
    components: ["GoogleAuthSession","GoogleOAuthToken"],
    files: [],
    tags: ["oauth","token","session"],
    priority: "HIGH",
    sourceType: "INCIDENT_REPORT",
  },
  {
    title: "Shared State Mutation in ExecutionState",
    what: "Pipeline runs corrupted each other due to shared execution state object.",
    why: "EMPTY_EXECUTION_STATE was a global constant passed by reference — all stages wrote to the same object.",
    how: "Replaced constant with createEmptyExecutionState factory and applied Object.freeze.",
    outcome: "Zero state bleed between executions. Each run gets isolated immutable state.",
    sprint: "P-01.11B",
    components: ["ExecutionState","ExecutionChain"],
    files: ["src/lib/execution-chain/ExecutionState.ts"],
    tags: ["state","mutation","pipeline","freeze"],
    priority: "CRITICAL",
    sourceType: "ROOT_CAUSE_ANALYSIS",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return (
    <span className={"text-xs font-mono px-2 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>
      {label}
    </span>
  );
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

export default function PhaseKB04Page() {
  const [activeTab,  setActiveTab]  = useState("pending");
  const [running,    setRunning]    = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reviews    = useMemo(() => KnowledgeReviewRegistry.getAllReviews(),    [refreshKey]);
  const promotions = useMemo(() => KnowledgeReviewRegistry.getAllPromotions(), [refreshKey]);
  const timeline   = useMemo(() => KnowledgeAuditEngine.getTimeline(),        [refreshKey]);
  const metrics    = useMemo(() => KnowledgeMetricsEngine.generate(),         [refreshKey]);

  const pending    = reviews.filter(function(r) { return r.status === "PENDING" || r.status === "UNDER_REVIEW"; });
  const duplicates = reviews.filter(function(r) { return r.status === "DUPLICATE"; }).flatMap(function(r) { return r.duplicates; });

  function runPipeline() {
    setRunning(true);
    const ids = [];
    for (var i = 0; i < SAMPLE_CAPTURES.length; i++) {
      const s = SAMPLE_CAPTURES[i];
      const result = KCEPipeline.run({
        title:       s.title,
        what:        s.what,
        why:         s.why,
        how:         s.how,
        outcome:     s.outcome,
        sprint:      s.sprint,
        components:  s.components,
        files:       s.files,
        tags:        s.tags,
        sourceType:  s.sourceType,
        priority:    s.priority,
        capturedAt:  new Date().toISOString().split("T")[0],
        capturedBy:  "Engineering",
      });
      ids.push(result.capture.id);
    }
    KnowledgeReviewPipeline.runBatch(ids);
    setRefreshKey(function(k) { return k + 1; });
    setRunning(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT KB-04 — KNOWLEDGE REVIEW & GOVERNANCE ENGINE</div>
          <div className="text-xl font-bold text-white">Knowledge Review & Governance Engine</div>
          <div className="text-zinc-400 text-sm mt-1">
            No knowledge becomes consolidated without passing through this pipeline.
          </div>
        </div>

        {/* Pipeline flow */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["KCE Capture","Duplicate Detect","Evidence Score","Review","Promotion","Audit","Metrics"].map(function(s, i, arr) {
              return (
                <React.Fragment key={s}>
                  <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length - 1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>
                    {s}
                  </span>
                  {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Metrics overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Total Reviews"  value={metrics.totalCaptures} />
          <Metric label="Approved"       value={metrics.approved}      color="text-emerald-400" />
          <Metric label="Pending"        value={metrics.pending}       color={metrics.pending > 0 ? "text-yellow-400" : "text-zinc-500"} />
          <Metric label="Avg Evidence"   value={metrics.avgEvidenceScore + "/100"} color="text-sky-300" />
        </div>

        {/* Run pipeline button */}
        <div className="flex gap-3">
          <button onClick={runPipeline} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "Run Review Pipeline (3 sample captures)"}
          </button>
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

        {/* Pending */}
        {activeTab === "pending" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">PENDING REVIEWS — {pending.length}</div>
            {pending.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">No pending reviews. Run the pipeline to populate.</div>}
            {pending.map(function(r) {
              return (
                <div key={r.id} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-zinc-500 font-mono text-xs">{r.id}</span>
                    <span className={"text-xs font-mono " + (STATUS_COLORS[r.status] || "text-zinc-400")}>{r.status}</span>
                    <Badge label={r.approvalLevel} style={APPROVAL_COLORS[r.approvalLevel]} />
                  </div>
                  <div className="text-zinc-300 text-sm">{r.title}</div>
                  <div className="flex items-center gap-3 mt-1 text-zinc-500 text-xs">
                    <span>reviewer: {r.reviewer}</span>
                    <span>confidence: {Math.round(r.evidenceScore.confidence * 100)}%</span>
                    <span>evidence: {r.evidenceScore.score}/100</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Duplicates */}
        {activeTab === "duplicates" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">DUPLICATE DETECTION — {duplicates.length} pair(s)</div>
            {duplicates.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">No duplicates detected.</div>}
            {duplicates.map(function(d, i) {
              return (
                <div key={i} className="px-4 py-3 border-b border-zinc-800 last:border-0 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge label={d.originalId} style="bg-zinc-800 text-sky-300 border-sky-800" />
                    <span className="text-zinc-600">vs</span>
                    <Badge label={d.duplicateId} style="bg-zinc-800 text-amber-300 border-amber-800" />
                    <span className={"ml-auto text-sm font-bold font-mono " + (d.overallScore >= 0.7 ? "text-red-400" : "text-amber-400")}>
                      {Math.round(d.overallScore * 100)}% similar
                    </span>
                  </div>
                  <ScoreBar score={d.overallScore} max={1} color={d.overallScore >= 0.7 ? "bg-red-600" : "bg-amber-600"} />
                  <div className="flex gap-4 text-xs text-zinc-500">
                    <span>title: {Math.round(d.titleSimilarity * 100)}%</span>
                    <span>keywords: {Math.round(d.keywordOverlap * 100)}%</span>
                    <span>root cause: {Math.round(d.rootCauseSimilarity * 100)}%</span>
                  </div>
                  {d.mergeRecommended && <div className="text-violet-400 text-xs">Merge recommended</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Evidence */}
        {activeTab === "evidence" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">EVIDENCE SCORES — {reviews.length}</div>
            {reviews.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">No evidence data. Run the pipeline first.</div>}
            {reviews.map(function(r) {
              const sc = r.evidenceScore.score;
              return (
                <div key={r.id} className="px-4 py-3 border-b border-zinc-800 last:border-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-zinc-500 font-mono text-xs mr-2">{r.captureId}</span>
                      <span className="text-zinc-300 text-sm">{r.title}</span>
                    </div>
                    <span className={"text-lg font-bold font-mono " + (sc >= 70 ? "text-emerald-400" : sc >= 40 ? "text-yellow-400" : "text-red-400")}>{sc}</span>
                  </div>
                  <ScoreBar score={sc} color={sc >= 70 ? "bg-emerald-600" : sc >= 40 ? "bg-yellow-600" : "bg-red-600"} />
                  <div className="flex gap-4 text-xs text-zinc-500">
                    <span>confidence: {Math.round(r.evidenceScore.confidence * 100)}%</span>
                    <span>approvals: {r.evidenceScore.approvalCount}</span>
                    <span>regressions: {r.evidenceScore.regressionCount}</span>
                    <span>recency: {r.evidenceScore.recency}d ago</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Review Queue */}
        {activeTab === "queue" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">REVIEW QUEUE — {reviews.length}</div>
            {reviews.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">Queue is empty. Run the pipeline first.</div>}
            {reviews.map(function(r) {
              return (
                <div key={r.id} className="flex items-center px-4 py-3 border-b border-zinc-800 last:border-0 gap-3">
                  <span className="text-zinc-500 font-mono text-xs w-16 shrink-0">{r.id}</span>
                  <span className="text-zinc-300 text-sm flex-1 truncate">{r.title}</span>
                  <span className={"text-xs font-mono " + (r.decision ? (DECISION_COLORS[r.decision] || "text-zinc-500") : "text-zinc-500")}>{r.decision || "-"}</span>
                  <span className="text-zinc-600 text-xs">{r.reviewer}</span>
                  <span className={"text-xs font-mono " + (STATUS_COLORS[r.status] || "text-zinc-400")}>{r.status}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Promotion Queue */}
        {activeTab === "promotion" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">PROMOTION QUEUE — {promotions.length}</div>
            {promotions.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">No promotions yet.</div>}
            {promotions.map(function(p) {
              return (
                <div key={p.id} className="px-4 py-3 border-b border-zinc-800 last:border-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={p.id} style="bg-zinc-800 text-violet-300 border-violet-800" />
                    <span className="text-zinc-300 text-sm flex-1 truncate">{p.summary}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.targets.map(function(t) { return <Badge key={t} label={t} style="bg-zinc-800 text-emerald-400 border-emerald-800" />; })}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.generatedIds.map(function(id) { return <Badge key={id} label={id} style="bg-emerald-900/40 text-emerald-300 border-emerald-800" />; })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Audit Timeline */}
        {activeTab === "audit" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">AUDIT TIMELINE — {timeline.length}</div>
            {timeline.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">No audit entries. Run the pipeline first.</div>}
            {timeline.map(function(e) {
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
                  <div className="w-28 shrink-0">
                    <div className="text-zinc-600 text-xs">{e.id}</div>
                    <div className="text-zinc-500 text-xs">{e.timestamp.split("T")[0]}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-300 text-sm">{e.event}</div>
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
              <Metric label="Approval Rate"  value={Math.round(metrics.approvalRate  * 100) + "%"} color="text-emerald-400" />
              <Metric label="Duplicate Rate" value={Math.round(metrics.duplicateRate * 100) + "%"} color="text-amber-400"   />
              <Metric label="Merge Rate"     value={Math.round(metrics.mergeRate     * 100) + "%"} color="text-violet-400"  />
              <Metric label="Promotion Rate" value={Math.round(metrics.promotionRate * 100) + "%"} color="text-sky-300"     />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border border-zinc-700 rounded-lg bg-zinc-900 p-4">
                <div className="text-zinc-400 text-xs tracking-widest mb-3">KNOWLEDGE DISTRIBUTION</div>
                {[
                  ["Approved",   metrics.approved,   "bg-emerald-600"],
                  ["Rejected",   metrics.rejected,   "bg-red-600"],
                  ["Duplicated", metrics.duplicated, "bg-amber-600"],
                  ["Merged",     metrics.merged,     "bg-violet-600"],
                  ["Pending",    metrics.pending,    "bg-sky-600"],
                ].map(function(row) {
                  return (
                    <div key={row[0]} className="flex items-center gap-2 mb-2">
                      <div className={"w-2 h-2 rounded-full " + row[2]} />
                      <span className="text-zinc-400 text-xs flex-1">{row[0]}</span>
                      <span className="text-zinc-300 font-mono text-xs">{row[1]}</span>
                    </div>
                  );
                })}
              </div>

              <div className="border border-zinc-700 rounded-lg bg-zinc-900 p-4">
                <div className="text-zinc-400 text-xs tracking-widest mb-3">QUALITY METRICS</div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">Avg Evidence Score</span>
                      <span className="text-zinc-300 font-mono">{metrics.avgEvidenceScore}/100</span>
                    </div>
                    <ScoreBar score={metrics.avgEvidenceScore} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">Avg Confidence</span>
                      <span className="text-zinc-300 font-mono">{Math.round(metrics.avgConfidence * 100)}%</span>
                    </div>
                    <ScoreBar score={metrics.avgConfidence * 100} color="bg-sky-600" />
                  </div>
                </div>
              </div>
            </div>

            {metrics.topProblems.length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TOP PROBLEMS REVIEWED</div>
                {metrics.topProblems.map(function(p, i) {
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <span className="text-zinc-600 font-mono text-xs w-4">{i + 1}</span>
                      <span className="text-zinc-300 text-sm">{p}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {metrics.totalCaptures === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
                Run the pipeline to generate metrics.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}