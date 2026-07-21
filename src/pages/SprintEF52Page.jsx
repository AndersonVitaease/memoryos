/**
 * SprintEF52Page.jsx — Sprint EF-52
 * Knowledge Reasoning Engine Dashboard
 */

import React, { useState, useCallback } from "react";
import { KnowledgeReasoningEngine } from "@/lib/knowledge-reasoning/KnowledgeReasoningEngine";
import { LearningEngine }           from "@/lib/cognitive-learning/LearningEngine";

// ── Seed KnowledgeStore with episodes so retriever has data ──────────────────

function seedKnowledge(episodeCount = 30) {
  const goals      = ["analyze_repository", "read_file", "list_issues", "search_code", "compare_branches"];
  const intents    = ["analyze", "read_single_source", "search_and_retrieve", "compare", "compound"];
  const strategies = ["direct_connector", "multi_step", "parallel_execution", "sequential", "cached"];
  const capSets    = [
    ["repository.read", "ast.parse"],
    ["file.read"],
    ["issue.list", "repository.read"],
    ["code.search", "repository.read"],
    ["branch.compare", "repository.read", "diff.compute"],
  ];

  const episodes = Array.from({ length: episodeCount }, (_, i) => {
    const success = Math.random() > 0.3;
    const gi = i % goals.length;
    return {
      id: `ep_${i}_${Date.now()}`,
      createdAt: Date.now() - (episodeCount - i) * 60000,
      goal: goals[gi], intent: intents[gi],
      context: "general", strategy: strategies[Math.floor(Math.random() * strategies.length)],
      capabilities: capSets[gi],
      connectorChain: ["github"],
      result: success ? "completed" : "error",
      success, failure: !success,
      confidence: 0.55 + Math.random() * 0.45,
      authority:  0.50 + Math.random() * 0.50,
      cost: Math.round(Math.random() * 8),
      durationMs: 400 + Math.floor(Math.random() * 3000),
      metadata: {},
    };
  });

  LearningEngine.learn(episodes);
}

// ── UI Atoms ──────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    blue:   "bg-blue-950/60 text-blue-300 border-blue-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function Bar({ value, max = 100, color = "bg-violet-600" }) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  return (
    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Inference type color ──────────────────────────────────────────────────────

function inferenceColor(type) {
  const m = { deduction: "violet", induction: "sky", abduction: "blue", chain: "green", multi_hop: "amber", composition: "emerald", reduction: "zinc" };
  return m[type] ?? "zinc";
}

function nodeColor(kind) {
  const m = { knowledge: "sky", inference: "violet", decision: "green", conflict: "red", context: "zinc" };
  return m[kind] ?? "zinc";
}

function edgeColor(rel) {
  const m = { supports: "text-emerald-400", contradicts: "text-red-400", requires: "text-sky-400", derived_from: "text-violet-400", related_to: "text-zinc-400" };
  return m[rel] ?? "text-zinc-400";
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "retrieval",   label: "Knowledge Retrieval" },
  { id: "inference",   label: "Inference Chain" },
  { id: "graph",       label: "Reasoning Graph" },
  { id: "conflicts",   label: "Conflict Resolution" },
  { id: "decision",    label: "Decision Builder" },
  { id: "metrics",     label: "Metrics" },
  { id: "timeline",    label: "Timeline" },
];

const PRESET_GOALS = [
  { goal: "analyze_repository", intent: "analyze", capabilities: ["repository.read", "ast.parse"], strategy: "multi_step", domain: "engineering", projectSize: "enterprise" },
  { goal: "read_file", intent: "read_single_source", capabilities: ["file.read"], strategy: "direct_connector", domain: "general", projectSize: "small" },
  { goal: "search_code", intent: "search_and_retrieve", capabilities: ["code.search", "repository.read"], strategy: "sequential", domain: "engineering", projectSize: "large" },
  { goal: "compare_branches", intent: "compare", capabilities: ["branch.compare", "diff.compute"], strategy: "parallel_execution", domain: "devops", projectSize: "medium" },
];

export default function SprintEF52Page() {
  const [tab,     setTab]     = useState("retrieval");
  const [report,  setReport]  = useState(null);
  const [running, setRunning] = useState(false);
  const [seeded,  setSeeded]  = useState(false);
  const [preset,  setPreset]  = useState(0);

  const handleSeed = useCallback(() => {
    seedKnowledge(40);
    setSeeded(true);
  }, []);

  const handleReason = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        if (!seeded) { seedKnowledge(40); setSeeded(true); }
        const input = PRESET_GOALS[preset];
        const result = KnowledgeReasoningEngine.reason(input);
        setReport(result);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [preset, seeded]);

  const r = report;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-950/30 to-zinc-950 border border-blue-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-52" color="blue" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Knowledge Reasoning Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Goal → Retrieval → Inference → Decision</span>
          </div>
          <h1 className="text-xl font-black text-white">Knowledge Reasoning Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Raciocina com conhecimento aprendido pela EF-51. NÃO cria conhecimento. Toda inferência é temporária.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSeed}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-bold transition-colors"
          >
            {seeded ? "✓ Knowledge Seeded" : "Seed Knowledge (EF-51)"}
          </button>
          <div className="flex items-center gap-2">
            <label className="text-zinc-400 text-xs">Goal:</label>
            <select
              value={preset}
              onChange={e => setPreset(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
            >
              {PRESET_GOALS.map((g, i) => <option key={i} value={i}>{g.goal}</option>)}
            </select>
          </div>
          <button
            onClick={handleReason}
            disabled={running}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors"
          >
            {running ? "Raciocinando..." : "Executar Reasoning Pipeline"}
          </button>
          {r && <Badge label={`${r.metrics.knowledgeRetrieved} rules · ${r.metrics.inferenceCount} inferences · ${r.metrics.conflictCount} conflicts`} color="blue" />}
        </div>

        {/* Metrics bar */}
        {r && (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            <Metric label="Retrieved"    value={r.metrics.knowledgeRetrieved}              color="text-sky-400" />
            <Metric label="Matched"      value={r.metrics.knowledgeMatched}                color="text-violet-400" />
            <Metric label="Inferences"   value={r.metrics.inferenceCount}                  color="text-blue-400" />
            <Metric label="Depth"        value={r.metrics.inferenceDepth}                  color="text-zinc-300" />
            <Metric label="Conflicts"    value={r.metrics.conflictCount}                   color="text-red-400" />
            <Metric label="Confidence"   value={`${(r.metrics.decisionConfidence * 100).toFixed(0)}%`} color="text-emerald-400" />
            <Metric label="Authority"    value={`${(r.metrics.decisionAuthority * 100).toFixed(0)}%`}  color="text-amber-400" />
            <Metric label="Duration"     value={`${r.durationMs}ms`}                       color="text-zinc-400" />
          </div>
        )}

        {/* Empty state */}
        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center space-y-2">
            <p className="text-zinc-400 text-sm">Pressione "Executar Reasoning Pipeline" para rodar.</p>
            <p className="text-zinc-600 text-xs">KnowledgeStore → Retriever → Matcher → InferenceEngine → ConflictResolver → DecisionBuilder</p>
          </div>
        )}

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando pipeline de raciocínio...</p>
          </div>
        )}

        {/* Tabs */}
        {r && (
          <>
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto flex-wrap">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-w-fit px-2
                    ${tab === t.id ? "bg-blue-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* RETRIEVAL */}
            {tab === "retrieval" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">Goal: <span className="text-white font-bold">{r.goal}</span> · {r.knowledgeRetrieved.length} regras recuperadas do KnowledgeStore (read-only)</p>
                {r.knowledgeRetrieved.length === 0 && (
                  <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl p-4 text-amber-400 text-sm">
                    Nenhuma regra relevante encontrada. Rode o EF-51 Learning Pipeline primeiro (botão "Seed Knowledge").
                  </div>
                )}
                {r.knowledgeRetrieved.map((rule, i) => (
                  <div key={rule.ruleId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-600 text-xs w-5">{i + 1}</span>
                      <Badge label={`relevance=${(rule.relevanceScore * 100).toFixed(0)}%`} color={rule.relevanceScore > 0.5 ? "green" : rule.relevanceScore > 0.3 ? "amber" : "zinc"} />
                      <span className="text-zinc-200 text-sm font-bold flex-1">{rule.title}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="flex items-center gap-2"><span className="text-zinc-600 w-20">confidence</span><Bar value={rule.confidence * 100} color="bg-emerald-600" /><span className="text-zinc-400 w-10 text-right">{(rule.confidence * 100).toFixed(0)}%</span></div>
                      <div className="flex items-center gap-2"><span className="text-zinc-600 w-20">authority</span><Bar value={rule.authority * 100} color="bg-violet-600" /><span className="text-zinc-400 w-10 text-right">{(rule.authority * 100).toFixed(0)}%</span></div>
                      <div className="flex items-center gap-2"><span className="text-zinc-600 w-20">success</span><Bar value={rule.successRate * 100} color="bg-sky-600" /><span className="text-zinc-400 w-10 text-right">{(rule.successRate * 100).toFixed(0)}%</span></div>
                      <div className="flex items-center gap-2"><span className="text-zinc-600 w-20">recency</span><Bar value={rule.recencyScore * 100} color="bg-amber-600" /><span className="text-zinc-400 w-10 text-right">{(rule.recencyScore * 100).toFixed(0)}%</span></div>
                    </div>
                    <div className="text-xs"><span className="text-zinc-600">Matched fields: </span>{rule.matchedFields.map(f => <Badge key={f} label={f} color="sky" />)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* INFERENCE CHAIN */}
            {tab === "inference" && (
              <div className="space-y-3">
                <div className="bg-blue-950/20 border border-blue-700/30 rounded-xl p-3 flex flex-wrap gap-3 items-center">
                  <Badge label="TEMPORÁRIA" color="amber" />
                  <span className="text-zinc-400 text-xs">Toda inferência é temporária. NÃO entra no KnowledgeStore.</span>
                  <Badge label={`depth=${r.inferenceChain.depth}`} color="blue" />
                  <Badge label={`confidence=${(r.inferenceChain.overallConfidence * 100).toFixed(0)}%`} color="green" />
                </div>
                {r.inferenceChain.steps.length === 0 && <p className="text-zinc-500 text-xs">Nenhuma inferência — KnowledgeStore vazio para este goal.</p>}
                {r.inferenceChain.steps.map((step, i) => (
                  <div key={step.id} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-7 h-7 rounded-full border-2 border-blue-600 bg-blue-950/50 text-blue-300 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                      {i < r.inferenceChain.steps.length - 1 && <div className="w-px h-5 bg-zinc-800 mt-1" />}
                    </div>
                    <div className="flex-1 bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 py-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={step.type} color={inferenceColor(step.type)} />
                        <Badge label={`conf=${(step.confidence * 100).toFixed(0)}%`} color={step.confidence > 0.7 ? "green" : "amber"} />
                        <Badge label="isTemporary=true" color="zinc" />
                      </div>
                      <p className="text-zinc-300 text-sm mt-2">{step.conclusion}</p>
                      <div className="text-xs mt-1 text-zinc-600">premises: {step.premiseRuleIds.length} rules · {step.evidence.length} evidence items</div>
                    </div>
                  </div>
                ))}
                <div className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-4">
                  <p className="text-emerald-400 text-xs font-bold mb-1">Conclusão Final</p>
                  <p className="text-zinc-300 text-sm">{r.inferenceChain.finalConclusion}</p>
                </div>
              </div>
            )}

            {/* REASONING GRAPH */}
            {tab === "graph" && (
              <div className="space-y-3">
                <div className="flex gap-4 text-xs text-zinc-500">
                  <span>Nodes: <strong className="text-white">{r.reasoningGraph.nodes.length}</strong></span>
                  <span>Edges: <strong className="text-white">{r.reasoningGraph.edges.length}</strong></span>
                  <Badge label="isTemporary=true" color="amber" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {r.reasoningGraph.nodes.map(node => (
                    <div key={node.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2">
                      <Badge label={node.kind} color={nodeColor(node.kind)} />
                      <span className="text-zinc-300 text-xs flex-1 truncate">{node.label}</span>
                      <span className="text-zinc-600 text-xs font-mono">{(node.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                {r.reasoningGraph.edges.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs font-bold mb-2">Edges ({r.reasoningGraph.edges.length})</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {r.reasoningGraph.edges.map((edge, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-600 font-mono w-20 truncate">{edge.from.slice(-10)}</span>
                          <span className={`${edgeColor(edge.relation)} font-bold w-28`}>→ {edge.relation}</span>
                          <span className="text-zinc-600 font-mono w-20 truncate">{edge.to.slice(-10)}</span>
                          <span className="text-zinc-700 ml-auto">{(edge.weight * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CONFLICTS */}
            {tab === "conflicts" && (
              <div className="space-y-2">
                {r.conflicts.length === 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-6 text-center">
                    <p className="text-emerald-400 font-bold text-sm">Nenhum conflito detectado.</p>
                    <p className="text-zinc-600 text-xs mt-1">Todas as regras são consistentes para este goal.</p>
                  </div>
                ) : r.conflicts.map(conflict => {
                  const res = r.conflictResolutions.find(r => r.conflictId === conflict.id);
                  return (
                    <div key={conflict.id} className="bg-red-950/15 border border-red-800/30 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={conflict.severity.toUpperCase()} color={conflict.severity === "critical" ? "red" : conflict.severity === "high" ? "amber" : "zinc"} />
                        <Badge label={conflict.conflictType} color="zinc" />
                        <span className="text-red-300 text-sm font-bold flex-1">{conflict.ruleATitle} ↔ {conflict.ruleBTitle}</span>
                      </div>
                      <p className="text-zinc-400 text-xs">{conflict.description}</p>
                      {res && (
                        <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-2">
                          <p className="text-emerald-400 text-xs font-bold">Resolução via {res.method}</p>
                          <p className="text-zinc-400 text-xs">{res.rationale}</p>
                          <div className="flex gap-2 mt-1 text-xs">
                            <Badge label={`winner score=${(res.winnerScore * 100).toFixed(0)}%`} color="green" />
                            <Badge label={`loser score=${(res.loserScore * 100).toFixed(0)}%`}  color="red" />
                            <Badge label={`${res.durationMs}ms`} color="zinc" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* DECISION */}
            {tab === "decision" && (
              <div className="space-y-3">
                <div className="bg-green-950/20 border border-green-700/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label="DECISÃO FINAL" color="green" />
                    <Badge label="isTemporary=true" color="amber" />
                    <Badge label={`conf=${(r.decision.confidence * 100).toFixed(1)}%`} color="green" />
                    <Badge label={`authority=${(r.decision.authority * 100).toFixed(1)}%`} color="violet" />
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Conclusão</p>
                    <p className="text-zinc-200 text-sm mt-1">{r.decision.conclusion}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Justificativa</p>
                    <p className="text-zinc-400 text-xs mt-1">{r.decision.justification}</p>
                  </div>
                </div>

                {/* Explainability */}
                <div className="bg-violet-950/20 border border-violet-700/30 rounded-xl p-4 space-y-3">
                  <p className="text-violet-300 text-xs font-bold">Explainability</p>
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Rules Applied</p>
                    {r.decision.explainability.rulesApplied.map(r => (
                      <div key={r.ruleId} className="flex items-center gap-2 text-xs mb-1">
                        <span className="text-zinc-300 flex-1 truncate">{r.title}</span>
                        <Bar value={r.contribution * 100} color="bg-violet-600" />
                        <span className="text-zinc-500 w-10 text-right">{(r.contribution * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Inference Trace</p>
                    {r.decision.explainability.inferenceTrace.map((trace, i) => (
                      <div key={i} className="text-xs text-zinc-400 pl-2 border-l border-zinc-700 mb-0.5">{trace}</div>
                    ))}
                  </div>
                </div>

                {/* Discarded alternatives */}
                {r.decision.discardedAlternatives.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs font-bold mb-2">Alternativas Descartadas ({r.decision.discardedAlternatives.length})</p>
                    {r.decision.discardedAlternatives.map((alt, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs border-b border-zinc-800/40 py-1 last:border-0">
                        <span className="text-zinc-500 flex-1 truncate">{alt.title}</span>
                        <span className="text-red-400 text-xs">{alt.discardReason.slice(0, 60)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* METRICS */}
            {tab === "metrics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Knowledge Retrieved"  value={r.metrics.knowledgeRetrieved}  color="text-sky-400" />
                  <Metric label="Knowledge Matched"    value={r.metrics.knowledgeMatched}    color="text-violet-400" />
                  <Metric label="Inference Count"      value={r.metrics.inferenceCount}      color="text-blue-400" />
                  <Metric label="Inference Depth"      value={r.metrics.inferenceDepth}      color="text-zinc-300" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  {[
                    { label: "Decision Confidence",  value: r.metrics.decisionConfidence,  color: "bg-emerald-600" },
                    { label: "Decision Authority",   value: r.metrics.decisionAuthority,   color: "bg-violet-600" },
                    { label: "Reasoning Accuracy",   value: r.metrics.reasoningAccuracy,   color: "bg-sky-600" },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400 w-40 shrink-0">{m.label}</span>
                      <Bar value={m.value * 100} color={m.color} />
                      <span className="text-zinc-300 w-12 text-right">{(m.value * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Conflicts"           value={r.metrics.conflictCount}               color="text-red-400" />
                  <Metric label="Resolution Time"     value={`${r.metrics.conflictResolutionTimeMs}ms`} color="text-amber-400" />
                  <Metric label="Avg Reasoning Time"  value={`${r.metrics.avgReasoningTimeMs}ms`}   color="text-zinc-300" />
                </div>
              </div>
            )}

            {/* TIMELINE */}
            {tab === "timeline" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">Execution Timeline — {r.durationMs}ms total · {new Date(r.generatedAt).toLocaleTimeString()}</p>
                {[
                  { step: "1. Context Built",       detail: `goal="${r.goal}" · intent="${r.knowledgeRetrieved[0]?.matchedFields.join(", ") ?? "?"}"` },
                  { step: "2. Knowledge Retrieved",  detail: `${r.metrics.knowledgeRetrieved} rules from KnowledgeStore (read-only)` },
                  { step: "3. Rules Matched",        detail: `${r.metrics.knowledgeMatched} rules used in inference` },
                  { step: "4. Inference Executed",   detail: `${r.metrics.inferenceCount} steps · depth=${r.metrics.inferenceDepth}` },
                  { step: "5. Conflicts Resolved",   detail: `${r.metrics.conflictCount} conflicts · method: authority/confidence/recency` },
                  { step: "6. Decision Built",       detail: `confidence=${(r.decision.confidence * 100).toFixed(1)}% · ${r.decision.discardedAlternatives.length} alternatives discarded` },
                  { step: "7. Graph Built",          detail: `${r.reasoningGraph.nodes.length} nodes · ${r.reasoningGraph.edges.length} edges (temporary)` },
                  { step: "8. Report Generated",     detail: r.summary },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full border-2 border-blue-600 bg-blue-950/50 text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                    <div className="flex-1 bg-zinc-900/60 border border-zinc-800/40 rounded-lg px-3 py-2">
                      <p className="text-zinc-200 text-xs font-bold">{item.step}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{item.detail}</p>
                    </div>
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