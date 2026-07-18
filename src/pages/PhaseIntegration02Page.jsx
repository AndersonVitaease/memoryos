/**
 * PhaseIntegration02Page.jsx — Sprint INTEGRATION-02 Dashboard
 * Knowledge Query Engine
 * Route: /integration02
 */

import React, { useState, useMemo } from "react";
import { KnowledgeQueryFacade }         from "@/lib/knowledge-query/KnowledgeQueryFacade";
import { KnowledgeQueryAudit }          from "@/lib/knowledge-query/KnowledgeQueryAudit";
import { KnowledgeQueryMetricsEngine }  from "@/lib/knowledge-query/KnowledgeQueryMetrics";
import { KnowledgeQueryRegistry }       from "@/lib/knowledge-query/KnowledgeQueryRegistry";
import { KnowledgeQueryCache }          from "@/lib/knowledge-query/KnowledgeQueryCache";

const SOURCE_COLORS = {
  LESSONS:        "bg-sky-900/40 text-sky-300 border-sky-800",
  BEST_PRACTICES: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  KNOWN_ISSUES:   "bg-red-900/40 text-red-300 border-red-800",
  ANTI_PATTERNS:  "bg-orange-900/40 text-orange-300 border-orange-800",
  JOURNAL:        "bg-violet-900/40 text-violet-300 border-violet-800",
  GOVERNANCE:     "bg-yellow-900/40 text-yellow-300 border-yellow-800",
};

const DEMO_QUERIES = [
  { intent: "connector implementation best practices", sources: ["BEST_PRACTICES","GOVERNANCE"], profileId: "RP-DEFAULT"    },
  { intent: "memory retrieval performance issues",     sources: ["KNOWN_ISSUES","LESSONS"],       profileId: "RP-EVIDENCE"   },
  { intent: "planning engine lessons learned",         sources: ["LESSONS","JOURNAL"],            profileId: "RP-RECENCY"    },
  { intent: "architecture governance requirements",    sources: ["GOVERNANCE"],                   profileId: "RP-GOVERNANCE" },
  { intent: "all knowledge for sprint review",         sources: ["ALL"],                          profileId: "RP-DEFAULT"    },
];

const TABS = [
  { id: "builder",  label: "Query Builder"    },
  { id: "plan",     label: "Execution Plan"   },
  { id: "results",  label: "Results"          },
  { id: "ranking",  label: "Ranking Profiles" },
  { id: "cache",    label: "Cache"            },
  { id: "audit",    label: "Audit"            },
  { id: "metrics",  label: "Metrics"          },
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

function ScoreBar({ value, color }) {
  const pct = Math.round(Math.min(1, value) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={(color || "bg-violet-600") + " h-full"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-zinc-500 text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function PhaseIntegration02Page() {
  const [activeTab,  setActiveTab]  = useState("builder");
  const [running,    setRunning]    = useState(false);
  const [responses,  setResponses]  = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics  = useMemo(() => KnowledgeQueryMetricsEngine.snapshot(), [refreshKey]);
  const profiles = useMemo(() => KnowledgeQueryRegistry.getAllProfiles(), []);
  const cache    = useMemo(() => KnowledgeQueryCache.stats(),             [refreshKey]);
  const timeline = useMemo(() => KnowledgeQueryAudit.getTimeline(),       [refreshKey]);

  function runDemo() {
    setRunning(true);
    KnowledgeQueryFacade.invalidateCache();
    const out = DEMO_QUERIES.map(function(q) {
      const res = KnowledgeQueryFacade.query({ intent: q.intent, filter: { sources: q.sources }, profileId: q.profileId });
      return { label: q.intent, profileId: q.profileId, res };
    });
    // Second run of first query → cache hit demonstration
    KnowledgeQueryFacade.query({ intent: DEMO_QUERIES[0].intent, filter: { sources: DEMO_QUERIES[0].sources } });
    setResponses(out);
    setSelected(out[0] || null);
    setRefreshKey(function(k) { return k + 1; });
    setRunning(false);
  }

  const sel = selected ? selected.res : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT INTEGRATION-02 — KNOWLEDGE QUERY ENGINE</div>
          <div className="text-xl font-bold text-white">Knowledge Query Engine</div>
          <div className="text-zinc-400 text-sm mt-1">Single official API for all knowledge access. No component reads Registries directly.</div>
        </div>

        {/* Pipeline */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Request","Parser","Planner","Executor","Filter","Ranking","Resolver","Cache","Audit","Response"].map(function(s, i, arr) {
              return (
                <React.Fragment key={s}>
                  <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{s}</span>
                  {i < arr.length-1 && <span className="text-zinc-600">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Metrics overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Queries Run"    value={metrics.totalQueries}                          />
          <Metric label="Avg Duration"   value={metrics.avgDurationMs + "ms"}  color="text-sky-300"     />
          <Metric label="Cache Hit Rate" value={Math.round(cache.hitRate * 100) + "%"} color="text-emerald-400" />
          <Metric label="Conflicts"      value={metrics.totalConflicts}         color="text-orange-400"  />
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={runDemo} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "Run 5 Demo Queries"}
          </button>
          {responses.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {responses.map(function(r, i) {
                return (
                  <button key={i} onClick={function() { setSelected(r); setActiveTab("results"); }}
                    className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (selected === r ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white")}>
                    {r.res.queryId}
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

        {/* Query Builder */}
        {activeTab === "builder" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-5">
              <div className="text-zinc-400 text-xs tracking-widest mb-3">DEMO QUERY PLANS</div>
              {DEMO_QUERIES.map(function(q, i) {
                return (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-zinc-800 last:border-0 flex-wrap">
                    <span className="text-zinc-500 font-mono text-xs w-6">Q{i+1}</span>
                    <span className="text-zinc-300 text-sm flex-1">{q.intent}</span>
                    <div className="flex gap-1 flex-wrap">
                      {q.sources.map(function(s) {
                        return <Badge key={s} label={s} style={SOURCE_COLORS[s] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />;
                      })}
                    </div>
                    <Badge label={q.profileId} style="bg-violet-900/40 text-violet-300 border-violet-800" />
                  </div>
                );
              })}
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs text-zinc-500 space-y-1">
              <div className="text-zinc-400 font-semibold mb-2">FACADE CONTRACT</div>
              {[
                "KnowledgeQueryFacade.query(req)",
                "KnowledgeQueryFacade.queryLessons(intent, limit?)",
                "KnowledgeQueryFacade.queryBestPractices(intent, limit?)",
                "KnowledgeQueryFacade.queryKnownIssues(intent, limit?)",
                "KnowledgeQueryFacade.queryAntiPatterns(intent, limit?)",
                "KnowledgeQueryFacade.queryGovernance(intent, limit?)",
                "KnowledgeQueryFacade.queryAll(intent, limit?)",
              ].map(function(m) {
                return <div key={m} className="font-mono text-sky-400">{m}</div>;
              })}
            </div>
          </div>
        )}

        {/* Execution Plan */}
        {activeTab === "plan" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">QUERY EXECUTION PLAN</div>
            {!sel && <div className="px-4 py-6 text-zinc-500 text-sm text-center">Run demo queries first.</div>}
            {sel && (
              <div className="p-4 space-y-2">
                <div className="text-zinc-400 text-xs mb-2">Intent: <span className="text-zinc-300">{sel.intent}</span></div>
                {sel.explanation.steps.map(function(step, i) {
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="text-zinc-600 font-mono w-4">{i+1}</span>
                      <div className="w-2 h-2 rounded-full bg-violet-600" />
                      <span className="text-zinc-300">{step}</span>
                    </div>
                  );
                })}
                <div className="mt-3 pt-3 border-t border-zinc-800 text-xs flex flex-wrap gap-2 items-center">
                  <span className="text-zinc-500">Profile:</span>
                  <Badge label={sel.explanation.profileUsed} style="bg-violet-900/40 text-violet-300 border-violet-800" />
                  {sel.explanation.filtersUsed.length > 0 && (
                    <span className="text-zinc-600">{sel.explanation.filtersUsed.join(" · ")}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {activeTab === "results" && (
          <div className="space-y-3">
            {!sel && <div className="border border-zinc-700 rounded-lg p-6 text-center text-zinc-500 text-sm bg-zinc-900">Run demo queries first.</div>}
            {sel && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={sel.queryId} style="bg-zinc-800 text-violet-300 border-violet-800" />
                  <span className="text-zinc-300 text-sm flex-1">{sel.intent}</span>
                  <Badge label={sel.cacheHit ? "CACHE HIT" : "LIVE"} style={sel.cacheHit ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                  <span className="text-zinc-500 text-xs">{sel.durationMs}ms</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Results"   value={sel.results.length}   />
                  <Metric label="Discarded" value={sel.discarded.length} color="text-zinc-500"   />
                  <Metric label="Conflicts" value={sel.conflicts.length} color="text-orange-400" />
                </div>
                <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                  <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">RESULTS — {sel.results.length}</div>
                  {sel.results.slice(0, 15).map(function(r) {
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                        <Badge label={r.source} style={SOURCE_COLORS[r.source] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                        <span className="text-zinc-300 text-sm flex-1 truncate">{r.title}</span>
                        <span className="text-violet-400 font-mono text-xs">{r.score}</span>
                      </div>
                    );
                  })}
                  {sel.results.length === 0 && <div className="px-4 py-4 text-zinc-600 text-xs">No results for this query.</div>}
                </div>
                {sel.conflicts.length > 0 && (
                  <div className="border border-orange-900/30 rounded-lg bg-zinc-900">
                    <div className="px-4 py-2 border-b border-zinc-800 text-xs text-orange-400 tracking-widest">CONFLICTS RESOLVED — {sel.conflicts.length}</div>
                    {sel.conflicts.map(function(c, i) {
                      return (
                        <div key={i} className="px-4 py-2.5 border-b border-zinc-800 last:border-0 text-xs space-y-0.5">
                          <div className="text-emerald-400">Winner: {c.winner.title}</div>
                          <div className="text-red-400 opacity-60">Loser: {c.loser.title}</div>
                          <div className="text-zinc-500">{c.reason}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Ranking Profiles */}
        {activeTab === "ranking" && (
          <div className="space-y-3">
            {profiles.map(function(p) {
              return (
                <div key={p.id} className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge label={p.id} style="bg-violet-900/40 text-violet-300 border-violet-800" />
                    <span className="text-white font-semibold text-sm flex-1">{p.name}</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(p.weights).map(function([k, v]) {
                      const numV = Number(v);
                      return (
                        <div key={k} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500 capitalize">{k}</span>
                            <span className="text-zinc-400 font-mono">{Math.round(numV * 100)}%</span>
                          </div>
                          <ScoreBar value={numV} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cache */}
        {activeTab === "cache" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Cache Size"   value={cache.size + "/" + cache.maxSize} />
              <Metric label="Total Hits"   value={cache.totalHits}   color="text-emerald-400" />
              <Metric label="Total Misses" value={cache.totalMisses} color="text-red-400"     />
              <Metric label="Hit Rate"     value={Math.round(cache.hitRate * 100) + "%"} color="text-sky-300" />
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-5">
              <div className="text-zinc-400 text-xs tracking-widest mb-3">CACHE POLICY</div>
              {[
                ["Strategy",     "LRU (Least Recently Used)"],
                ["Max Entries",  String(cache.maxSize)],
                ["Default TTL",  "5 minutes"],
                ["Invalidation", "On new knowledge promotion or explicit invalidateCache()"],
                ["Key Format",   "intent :: JSON(filter) — deterministic"],
              ].map(function([k, v]) {
                return (
                  <div key={k} className="flex gap-3 text-sm py-1.5 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-500 w-36 shrink-0">{k}</span>
                    <span className="text-zinc-300">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Audit */}
        {activeTab === "audit" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              KNOWLEDGE QUERY AUDIT — {timeline.length}
            </div>
            {timeline.length === 0 && <div className="px-4 py-8 text-center text-zinc-500 text-sm">Run demo queries first.</div>}
            {timeline.map(function(e) {
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 text-xs flex-wrap">
                  <span className="text-zinc-600 w-20 shrink-0">{e.id}</span>
                  <span className="text-violet-300 w-20 shrink-0">{e.queryId}</span>
                  <span className="text-zinc-400 flex-1 truncate">{e.intent}</span>
                  <span className="text-emerald-400">{e.kept} kept</span>
                  <span className="text-zinc-600">{e.discarded} disc</span>
                  <Badge label={e.cacheHit ? "HIT" : "MISS"} style={e.cacheHit ? "bg-emerald-900/40 text-emerald-300 border-emerald-800" : "bg-zinc-800 text-zinc-500 border-zinc-700"} />
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
              <Metric label="Total Queries"   value={metrics.totalQueries}                             />
              <Metric label="Avg Duration"    value={metrics.avgDurationMs + "ms"} color="text-sky-300"     />
              <Metric label="Cache Hit Rate"  value={Math.round(cache.hitRate * 100) + "%"} color="text-emerald-400" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Total Kept"      value={metrics.totalKept}       color="text-emerald-400" />
              <Metric label="Total Discarded" value={metrics.totalDiscarded}  color="text-zinc-500"    />
              <Metric label="Total Conflicts" value={metrics.totalConflicts}  color="text-orange-400"  />
            </div>
            {metrics.topSources.length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TOP SOURCES</div>
                {metrics.topSources.map(function(s) {
                  return (
                    <div key={s.source} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0">
                      <Badge label={s.source} style={SOURCE_COLORS[s.source] || "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                      <span className="flex-1" />
                      <span className="text-violet-400 font-mono text-xs">{s.count}x</span>
                    </div>
                  );
                })}
              </div>
            )}
            {metrics.totalQueries === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
                Run demo queries to generate metrics.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}