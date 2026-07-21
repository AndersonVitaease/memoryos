/**
 * SprintEF53Page.jsx — Sprint EF-53 · Self Optimization Engine Dashboard
 */

import React, { useState, useCallback } from "react";
import { SelfOptimizationEngine } from "@/lib/self-optimization/SelfOptimizationEngine";
import { KnowledgeStore }         from "@/lib/cognitive-learning/KnowledgeStore";
import { LearningEngine }         from "@/lib/cognitive-learning/LearningEngine";
import { OptimizationHistory }    from "@/lib/self-optimization/OptimizationHistory";

// ── Seed helper ───────────────────────────────────────────────────────────────

function buildEpisodes(n = 40) {
  const goals      = ["analyze_repository", "read_file", "list_issues", "search_code", "compare_branches"];
  const strategies = ["direct_connector", "multi_step", "parallel_execution", "sequential", "cached"];
  const capSets    = [
    ["repository.read", "ast.parse"],
    ["file.read"],
    ["issue.list", "repository.read"],
    ["code.search"],
    ["branch.compare", "diff.compute"],
  ];
  const connectors = ["github", "google_drive", "gmail"];

  return Array.from({ length: n }, (_, i) => {
    const gi = i % goals.length;
    const success = Math.random() > 0.3;
    return {
      id: `ep_${i}`, createdAt: Date.now() - (n - i) * 60000,
      goal: goals[gi], intent: "analyze", context: "general",
      strategy: strategies[Math.floor(Math.random() * strategies.length)],
      capabilities: capSets[gi], connectorChain: [connectors[Math.floor(Math.random() * connectors.length)]],
      result: success ? "completed" : "error", success, failure: !success,
      confidence: 0.45 + Math.random() * 0.50,
      authority:  0.40 + Math.random() * 0.55,
      cost: Math.round(1 + Math.random() * 9),
      durationMs: 300 + Math.floor(Math.random() * 8000),
      metadata: {},
    };
  });
}

// ── UI Atoms ──────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:    "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:    "bg-amber-950/60  text-amber-300  border-amber-700",
    red:      "bg-red-950/60    text-red-300    border-red-800",
    critical: "bg-red-950/80    text-red-200    border-red-700",
    violet:   "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:      "bg-sky-950/60    text-sky-300    border-sky-700",
    blue:     "bg-blue-950/60   text-blue-300   border-blue-700",
    zinc:     "bg-zinc-800/60   text-zinc-400   border-zinc-600",
    orange:   "bg-orange-950/60 text-orange-300 border-orange-700",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function Bar({ value, max = 1, color = "bg-violet-600" }) {
  const pct = Math.min((value / Math.max(max, 0.001)) * 100, 100);
  return (
    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function severityColor(s) {
  if (s === "critical") return "critical";
  if (s === "high")     return "red";
  if (s === "medium")   return "amber";
  return "zinc";
}

function priorityColor(p) {
  if (p === "critical") return "critical";
  if (p === "high")     return "red";
  if (p === "medium")   return "amber";
  return "zinc";
}

function targetColor(t) {
  const m = { planner: "violet", strategy: "sky", capability: "blue", connector: "orange", authority: "amber", confidence: "green", knowledge: "blue", reasoning: "violet", execution: "red" };
  return m[t] ?? "zinc";
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "opportunities", label: "Opportunities" },
  { id: "planner",       label: "Planner" },
  { id: "strategies",    label: "Strategies" },
  { id: "capabilities",  label: "Capabilities" },
  { id: "knowledge",     label: "Knowledge" },
  { id: "reasoning",     label: "Reasoning" },
  { id: "connectors",    label: "Connectors" },
  { id: "metrics",       label: "Metrics" },
  { id: "history",       label: "History" },
];

export default function SprintEF53Page() {
  const [tab,     setTab]     = useState("opportunities");
  const [report,  setReport]  = useState(null);
  const [running, setRunning] = useState(false);
  const [snap,    setSnap]    = useState(null);

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        // Seed EF-51 if needed
        const episodes = buildEpisodes(40);
        LearningEngine.learn(episodes);

        // Build snapshot from episodes
        const base = SelfOptimizationEngine.buildSnapshot(episodes);

        // Enrich with EF-51/EF-52 knowledge metrics
        const rules = KnowledgeStore.getAll();
        const knowledgeMetrics = {
          knowledgeRuleCount:      rules.length,
          knowledgeAvgConfidence:  rules.length > 0 ? rules.reduce((s, r) => s + r.confidence, 0) / rules.length : 0,
          knowledgeAvgSuccessRate: rules.length > 0 ? rules.reduce((s, r) => s + r.successRate, 0) / rules.length : 0,
        };

        // Simulated reasoning metrics (from prior EF-52 runs)
        const reasoningMetrics = {
          reasoningAvgDepth:       3 + Math.random() * 3,
          reasoningAvgConfidence:  0.45 + Math.random() * 0.35,
          reasoningConflictRate:   0.05 + Math.random() * 0.40,
          reasoningAvgDurationMs:  50 + Math.random() * 200,
        };

        const enriched = SelfOptimizationEngine.enrichSnapshot(base, knowledgeMetrics, reasoningMetrics);
        setSnap(enriched);

        const result = SelfOptimizationEngine.analyze(enriched);
        setReport(result);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, []);

  const r = report;
  const hist = OptimizationHistory.getAll();

  // Filter findings/recs by target tab
  const tabFindings = (target) => r?.findings.filter(f => f.target === target) ?? [];
  const tabRecs     = (target) => r?.recommendations.filter(rc => rc.target === target) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-950/20 to-zinc-950 border border-orange-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-53" color="orange" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Self Optimization Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Observa · Analisa · Identifica · Recomenda</span>
          </div>
          <h1 className="text-xl font-black text-white">Self Optimization Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Analisa continuamente o desempenho cognitivo. NUNCA modifica módulos existentes. Apenas recomenda.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors"
          >
            {running ? "Analisando..." : "Executar Self Optimization"}
          </button>
          {r && (
            <>
              <Badge label={`${r.findings.length} findings`} color="red" />
              <Badge label={`${r.recommendations.length} recommendations`} color="amber" />
              <Badge label={`avg_impact=${(r.metrics.avgImprovementScore * 100).toFixed(0)}%`} color="green" />
              <span className="text-zinc-600 text-xs">{r.durationMs}ms</span>
            </>
          )}
        </div>

        {/* Metrics bar */}
        {r && (
          <div className="grid grid-cols-4 md:grid-cols-10 gap-1.5">
            <Metric label="Opportunities" value={r.metrics.optimizationOpportunities} color="text-orange-400" />
            <Metric label="Avg Impact"    value={`${(r.metrics.avgImprovementScore * 100).toFixed(0)}%`}  color="text-emerald-400" />
            <Metric label="Planner"       value={`${(r.metrics.plannerGain * 100).toFixed(0)}%`}          color="text-violet-400" />
            <Metric label="Strategy"      value={`${(r.metrics.strategyGain * 100).toFixed(0)}%`}         color="text-sky-400" />
            <Metric label="Capability"    value={`${(r.metrics.capabilityGain * 100).toFixed(0)}%`}       color="text-blue-400" />
            <Metric label="Reasoning"     value={`${(r.metrics.reasoningGain * 100).toFixed(0)}%`}        color="text-violet-400" />
            <Metric label="Knowledge"     value={`${(r.metrics.knowledgeGain * 100).toFixed(0)}%`}        color="text-blue-400" />
            <Metric label="Connector"     value={`${(r.metrics.connectorGain * 100).toFixed(0)}%`}        color="text-orange-400" />
            <Metric label="Confidence"    value={`${(r.metrics.confidenceGain * 100).toFixed(0)}%`}       color="text-green-400" />
            <Metric label="Execution"     value={`${(r.metrics.executionGain * 100).toFixed(0)}%`}        color="text-red-400" />
          </div>
        )}

        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <p className="text-zinc-400 text-sm">Pressione "Executar Self Optimization" para rodar.</p>
            <p className="text-zinc-600 text-xs mt-1">Consome EF-51 · EF-52 · Episodes · Knowledge · Reasoning</p>
          </div>
        )}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Analisando Planner · Strategies · Capabilities · Knowledge · Reasoning · Connectors...</p>
          </div>
        )}

        {/* Tabs */}
        {r && (
          <>
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto flex-wrap">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-w-fit px-2
                    ${tab === t.id ? "bg-orange-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* OPPORTUNITIES */}
            {tab === "opportunities" && (
              <div className="space-y-3">
                <div className="bg-orange-950/20 border border-orange-700/30 rounded-xl p-3">
                  <p className="text-orange-300 text-xs font-bold mb-1">Top {r.topImprovements.length} Improvements by Expected Impact × Confidence</p>
                  <p className="text-zinc-500 text-xs">NUNCA aplicadas automaticamente. isAutomatic=false em todas as recomendações.</p>
                </div>
                {r.topImprovements.map((rec, i) => (
                  <div key={rec.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-600 text-xs w-5 shrink-0">{i + 1}</span>
                      <Badge label={rec.priority.toUpperCase()} color={priorityColor(rec.priority)} />
                      <Badge label={rec.target}                 color={targetColor(rec.target)} />
                      <Badge label={`risk=${rec.risk}`}         color={rec.risk === "high" ? "red" : rec.risk === "medium" ? "amber" : "zinc"} />
                      <span className="text-zinc-200 text-sm font-bold flex-1">{rec.title}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{rec.description}</p>
                    <p className="text-zinc-600 text-xs italic">{rec.justification}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-500 w-24 shrink-0">Expected Impact</span>
                      <Bar value={rec.expectedImpact} color="bg-orange-600" />
                      <span className="text-zinc-300 w-10 text-right">{(rec.expectedImpact * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-500 w-24 shrink-0">Confidence</span>
                      <Bar value={rec.confidence} color="bg-emerald-600" />
                      <span className="text-zinc-300 w-10 text-right">{(rec.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-xs text-zinc-600">
                      Estimated Gain: <span className="text-amber-400">{rec.estimatedGain}</span>
                    </div>
                    <div className="text-xs text-zinc-600">
                      Affects: {rec.affectedComponents.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Per-target tabs (Planner, Strategies, Capabilities, etc.) */}
            {["planner", "strategies", "capabilities", "knowledge", "reasoning", "connectors"].includes(tab) && (() => {
              const target = tab === "strategies" ? "strategy" : tab === "capabilities" ? "capability" : tab === "connectors" ? "connector" : tab;
              const findings = tabFindings(target);
              const recs     = tabRecs(target);
              return (
                <div className="space-y-3">
                  {/* Snapshot data */}
                  {snap && tab === "planner" && (
                    <div className="grid grid-cols-3 gap-2">
                      <Metric label="Avg Duration"  value={`${snap.avgEpisodeDurationMs.toFixed(0)}ms`} color={snap.avgEpisodeDurationMs > 5000 ? "text-red-400" : "text-zinc-300"} />
                      <Metric label="Success Rate"  value={`${(snap.avgEpisodeSuccess * 100).toFixed(1)}%`} color={snap.avgEpisodeSuccess > 0.7 ? "text-emerald-400" : "text-red-400"} />
                      <Metric label="Avg Cost"      value={`${snap.avgEpisodeCost.toFixed(1)}/10`}     color={snap.avgEpisodeCost > 7 ? "text-red-400" : "text-zinc-300"} />
                    </div>
                  )}
                  {snap && tab === "knowledge" && (
                    <div className="grid grid-cols-3 gap-2">
                      <Metric label="Rules"         value={snap.knowledgeRuleCount}                           color="text-sky-400" />
                      <Metric label="Avg Confidence" value={`${(snap.knowledgeAvgConfidence * 100).toFixed(1)}%`} color={snap.knowledgeAvgConfidence > 0.65 ? "text-emerald-400" : "text-red-400"} />
                      <Metric label="Avg Success"   value={`${(snap.knowledgeAvgSuccessRate * 100).toFixed(1)}%`} color={snap.knowledgeAvgSuccessRate > 0.7 ? "text-emerald-400" : "text-red-400"} />
                    </div>
                  )}
                  {snap && tab === "reasoning" && (
                    <div className="grid grid-cols-4 gap-2">
                      <Metric label="Avg Depth"      value={snap.reasoningAvgDepth.toFixed(1)}                    color="text-violet-400" />
                      <Metric label="Avg Confidence" value={`${(snap.reasoningAvgConfidence * 100).toFixed(1)}%`} color={snap.reasoningAvgConfidence > 0.6 ? "text-emerald-400" : "text-red-400"} />
                      <Metric label="Conflict Rate"  value={`${(snap.reasoningConflictRate * 100).toFixed(1)}%`}  color={snap.reasoningConflictRate > 0.3 ? "text-red-400" : "text-zinc-300"} />
                      <Metric label="Avg Duration"   value={`${snap.reasoningAvgDurationMs.toFixed(0)}ms`}        color="text-zinc-300" />
                    </div>
                  )}
                  {snap && tab === "strategies" && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5">
                      <p className="text-zinc-400 text-xs font-bold mb-2">Strategy Distribution</p>
                      {Object.entries(snap.strategyDistribution).map(([k, v]) => {
                        const pct = v / snap.episodeCount;
                        return (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-300 w-36 shrink-0 truncate">{k}</span>
                            <Bar value={pct} color="bg-sky-600" />
                            <span className="text-zinc-500 w-12 text-right">{(pct * 100).toFixed(0)}% ({v})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {snap && tab === "capabilities" && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5">
                      <p className="text-zinc-400 text-xs font-bold mb-2">Capability Usage</p>
                      {Object.entries(snap.capabilityUsage).map(([k, v]) => {
                        const pct = v / snap.episodeCount;
                        return (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-300 w-40 shrink-0 truncate">{k}</span>
                            <Bar value={pct} color="bg-blue-600" />
                            <span className="text-zinc-500 w-12 text-right">{(pct * 100).toFixed(0)}% ({v})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {snap && tab === "connectors" && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5">
                      <p className="text-zinc-400 text-xs font-bold mb-2">Connector Usage</p>
                      {Object.entries(snap.connectorUsage).map(([k, v]) => {
                        const pct = v / snap.episodeCount;
                        return (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-300 w-32 shrink-0 truncate">{k}</span>
                            <Bar value={pct} color="bg-orange-600" />
                            <span className="text-zinc-500 w-12 text-right">{(pct * 100).toFixed(0)}% ({v})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Findings */}
                  {findings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Findings ({findings.length})</p>
                      {findings.map(f => (
                        <div key={f.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge label={f.severity.toUpperCase()} color={severityColor(f.severity)} />
                            <span className="text-zinc-200 text-sm font-bold">{f.title}</span>
                          </div>
                          <p className="text-zinc-400 text-xs">{f.description}</p>
                          <div className="text-xs text-zinc-600">Evidence: {f.evidence.join(" · ")}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommendations */}
                  {recs.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Recommendations ({recs.length})</p>
                      {recs.map(rec => (
                        <div key={rec.id} className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge label={rec.priority.toUpperCase()} color={priorityColor(rec.priority)} />
                            <Badge label={`risk=${rec.risk}`} color={rec.risk === "high" ? "red" : rec.risk === "medium" ? "amber" : "zinc"} />
                            <span className="text-zinc-200 text-sm font-bold flex-1">{rec.title}</span>
                            <Badge label="isAutomatic=false" color="zinc" />
                          </div>
                          <p className="text-zinc-400 text-xs">{rec.description}</p>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-zinc-600 w-20 shrink-0">Impact</span>
                            <Bar value={rec.expectedImpact} color="bg-orange-600" />
                            <span className="text-zinc-400 w-8 text-right">{(rec.expectedImpact * 100).toFixed(0)}%</span>
                          </div>
                          <div className="text-xs text-amber-400">{rec.estimatedGain}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {findings.length === 0 && recs.length === 0 && (
                    <div className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-6 text-center">
                      <p className="text-emerald-400 font-bold text-sm">Nenhum problema detectado nesta área.</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* METRICS */}
            {tab === "metrics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Opportunities"  value={r.metrics.optimizationOpportunities} color="text-orange-400" />
                  <Metric label="Avg Improvement" value={`${(r.metrics.avgImprovementScore * 100).toFixed(1)}%`} color="text-emerald-400" />
                  <Metric label="Critical"        value={r.findings.filter(f => f.severity === "critical").length} color="text-red-400" />
                  <Metric label="High"            value={r.findings.filter(f => f.severity === "high").length}     color="text-amber-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  {[
                    { label: "Execution Gain",   value: r.metrics.executionGain,  color: "bg-red-600" },
                    { label: "Planner Gain",     value: r.metrics.plannerGain,    color: "bg-violet-600" },
                    { label: "Strategy Gain",    value: r.metrics.strategyGain,   color: "bg-sky-600" },
                    { label: "Capability Gain",  value: r.metrics.capabilityGain, color: "bg-blue-600" },
                    { label: "Reasoning Gain",   value: r.metrics.reasoningGain,  color: "bg-violet-600" },
                    { label: "Knowledge Gain",   value: r.metrics.knowledgeGain,  color: "bg-blue-600" },
                    { label: "Connector Gain",   value: r.metrics.connectorGain,  color: "bg-orange-600" },
                    { label: "Confidence Gain",  value: r.metrics.confidenceGain, color: "bg-green-600" },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400 w-32 shrink-0">{m.label}</span>
                      <Bar value={m.value} color={m.color} />
                      <span className="text-zinc-300 w-10 text-right">{(m.value * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HISTORY */}
            {tab === "history" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{hist.length} entradas de histórico · Todas as recomendações são rastreadas automaticamente.</p>
                {hist.length === 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 text-sm">
                    Nenhuma recomendação ainda. Execute o pipeline acima.
                  </div>
                )}
                {[...hist].reverse().slice(0, 50).map(entry => (
                  <div key={entry.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap text-xs">
                    <Badge label={entry.target} color={targetColor(entry.target)} />
                    <span className="text-zinc-300 flex-1 truncate">{entry.title}</span>
                    <Badge label={entry.accepted === null ? "PENDING" : entry.accepted ? "ACCEPTED" : "REJECTED"}
                      color={entry.accepted === null ? "zinc" : entry.accepted ? "green" : "red"} />
                    <span className="text-zinc-600">{new Date(entry.createdAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}