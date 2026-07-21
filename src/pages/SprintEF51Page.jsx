/**
 * SprintEF51Page.jsx — Sprint EF-51
 * Cognitive Learning Engine Dashboard
 */

import React, { useState, useCallback } from "react";
import { LearningEngine } from "@/lib/cognitive-learning/LearningEngine";

// ── Sample episode factory ────────────────────────────────────────────────────

function makeSampleEpisodes(count = 20) {
  const goals       = ["analyze_repository", "read_file", "list_issues", "search_code", "compare_branches"];
  const intents     = ["analyze", "read_single_source", "search_and_retrieve", "compare", "compound"];
  const strategies  = ["direct_connector", "multi_step", "parallel_execution", "sequential", "cached"];
  const capSets     = [
    ["repository.read", "ast.parse"],
    ["file.read"],
    ["issue.list", "repository.read"],
    ["code.search", "repository.read"],
    ["branch.compare", "repository.read", "diff.compute"],
  ];
  const connectors  = [["github"], ["github", "drive"], ["github", "base44"]];

  return Array.from({ length: count }, (_, i) => {
    const success = Math.random() > 0.35;
    const failure = !success && Math.random() > 0.5;
    const gi = i % goals.length;
    return {
      id:           `ep_${i}_${Date.now()}`,
      createdAt:    Date.now() - (count - i) * 60000,
      goal:         goals[gi],
      intent:       intents[gi],
      strategy:     strategies[Math.floor(Math.random() * strategies.length)],
      capabilities: capSets[gi],
      connectorChain: connectors[Math.floor(Math.random() * connectors.length)],
      result:       success ? "completed" : failure ? "error" : "partial",
      success,
      failure,
      confidence:   0.5 + Math.random() * 0.5,
      authority:    0.4 + Math.random() * 0.6,
      cost:         Math.round(Math.random() * 10),
      durationMs:   500 + Math.floor(Math.random() * 4500),
      metadata:     {},
    };
  });
}

// ── UI Atoms ──────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    blue:   "bg-blue-950/60 text-blue-300 border-blue-700",
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

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "pipeline",    label: "Pipeline" },
  { id: "patterns",   label: "Patterns" },
  { id: "knowledge",  label: "Knowledge" },
  { id: "graph",      label: "Knowledge Graph" },
  { id: "metrics",    label: "Metrics" },
  { id: "capabilities", label: "Capabilities" },
  { id: "strategies", label: "Strategies" },
  { id: "antipatterns", label: "Anti-Patterns" },
];

// ── Pipeline Steps ────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { label: "Episode Store",        desc: "Episódios produzidos pela EF-50", file: "EF-50 EpisodeStore" },
  { label: "Episode Analyzer",     desc: "Extrai goal, intent, strategy, capabilities, resultado, confiança", file: "EpisodeAnalyzer.ts" },
  { label: "Pattern Miner",        desc: "Detecta padrões recorrentes: capability_sequence, goal_type, execution_flow, success/failure", file: "PatternMiner.ts" },
  { label: "Knowledge Extractor",  desc: "Converte CandidatePatterns em KnowledgeRules (status=candidate)", file: "KnowledgeExtractor.ts" },
  { label: "Knowledge Validator",  desc: "Valida contra LearningPolicy: min episodes, confidence, successRate, authority, generalization", file: "KnowledgeValidator.ts" },
  { label: "Knowledge Store",      desc: "Repositório cognitivo independente do EpisodeStore (append-only, imutável)", file: "KnowledgeStore.ts" },
];

export default function SprintEF51Page() {
  const [tab,    setTab]    = useState("pipeline");
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [episodeCount, setEpisodeCount] = useState(25);

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        const episodes = makeSampleEpisodes(episodeCount);
        const result   = LearningEngine.learn(episodes);
        setReport(result);
      } catch (e) {
        console.error(e);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [episodeCount]);

  const r = report;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-green-950/30 to-zinc-950 border border-green-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-51" color="green" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Cognitive Learning Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Episode → Pattern → Knowledge → Graph</span>
          </div>
          <h1 className="text-xl font-black text-white">Cognitive Learning Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Aprende com episódios reais. Descobre padrões. Gera e valida conhecimento. Sem IA inventada.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-zinc-400 text-xs">Episodes:</label>
            <select
              value={episodeCount}
              onChange={e => setEpisodeCount(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
            >
              {[5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors"
          >
            {running ? "Executando..." : "Executar Learning Pipeline"}
          </button>
          {r && <Badge label={`${r.episodesAnalyzed} episódios · ${r.patternsFound} padrões · ${r.knowledgeCreated} rules`} color="green" />}
        </div>

        {/* Metrics bar */}
        {r && (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            <Metric label="Episódios"   value={r.episodesAnalyzed}  color="text-sky-400" />
            <Metric label="Padrões"     value={r.patternsFound}     color="text-violet-400" />
            <Metric label="Aprovados"   value={r.patternsApproved}  color="text-emerald-400" />
            <Metric label="Rejeitados"  value={r.patternsRejected}  color="text-amber-400" />
            <Metric label="Knowledge"   value={r.knowledgeCreated}  color="text-green-400" />
            <Metric label="AntiPat"     value={r.antiPatternsDetected.length} color="text-red-400" />
            <Metric label="Graph Nodes" value={r.knowledgeGraph.nodes.length} color="text-blue-400" />
            <Metric label="Opt.Gain"    value={`${(r.metrics.optimizationGain * 100).toFixed(1)}%`} color="text-amber-300" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-w-fit px-2
                ${tab === t.id ? "bg-green-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* No report yet */}
        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <p className="text-zinc-400 text-sm">Pressione "Executar Learning Pipeline" para rodar.</p>
            <p className="text-zinc-600 text-xs mt-1">Episode → Analyzer → PatternMiner → Extractor → Validator → KnowledgeStore</p>
          </div>
        )}

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando pipeline de aprendizado...</p>
          </div>
        )}

        {/* PIPELINE TAB */}
        {r && tab === "pipeline" && (
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs mb-3">{r.summary}</p>
            {PIPELINE_STEPS.map((step, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full border-2 border-green-600 bg-green-950/50 text-green-400 flex items-center justify-center font-bold text-xs">
                    {i + 1}
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && <div className="w-px h-6 bg-zinc-800 mt-1" />}
                </div>
                <div className="flex-1 mb-3 bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-green-300 font-black text-sm">{step.label}</span>
                    <Badge label={step.file} color="zinc" />
                    <Badge label="EXECUTADO" color="green" />
                  </div>
                  <p className="text-zinc-400 text-xs mt-1">{step.desc}</p>
                </div>
              </div>
            ))}
            {r.optimizationSuggestions.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl p-4 space-y-1">
                <p className="text-amber-300 text-xs font-bold">Sugestões de Otimização</p>
                {r.optimizationSuggestions.map((s, i) => (
                  <p key={i} className="text-zinc-400 text-xs">• {s}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PATTERNS TAB */}
        {r && tab === "patterns" && (
          <div className="space-y-2">
            <div className="flex gap-4 text-xs text-zinc-500 mb-2">
              <span>Total: <strong className="text-white">{r.patternsFound}</strong></span>
              <span>Aprovados: <strong className="text-emerald-400">{r.patternsApproved}</strong></span>
              <span>Rejeitados: <strong className="text-amber-400">{r.patternsRejected}</strong></span>
            </div>
            {r.topPatterns.length === 0 && <p className="text-zinc-500 text-xs">Nenhum padrão encontrado.</p>}
            {r.topPatterns.map((p, i) => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-600 text-xs w-5">{i + 1}</span>
                  <Badge label={p.kind} color="violet" />
                  <span className="text-zinc-200 text-sm font-bold flex-1">{p.description}</span>
                  <Badge label={`freq=${p.frequency}`} color="sky" />
                  <Badge label={`${(p.successRate * 100).toFixed(0)}% success`} color={p.successRate > 0.7 ? "green" : p.successRate > 0.5 ? "amber" : "red"} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><span className="text-zinc-600">confidence: </span><span className="text-zinc-300">{(p.avgConfidence * 100).toFixed(1)}%</span></div>
                  <div><span className="text-zinc-600">authority: </span><span className="text-zinc-300">{(p.avgAuthority * 100).toFixed(1)}%</span></div>
                  <div><span className="text-zinc-600">generalization: </span><span className="text-zinc-300">{(p.generalizationScore * 100).toFixed(1)}%</span></div>
                  <div><span className="text-zinc-600">episodes: </span><span className="text-zinc-300">{p.supportingEpisodeIds.length}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* KNOWLEDGE TAB */}
        {r && tab === "knowledge" && (
          <div className="space-y-2">
            {r.promotedRules.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                <p className="text-zinc-400 text-sm">Nenhuma regra promovida ainda.</p>
                <p className="text-zinc-600 text-xs mt-1">Aumente o número de episódios para atingir os thresholds de validação.</p>
              </div>
            )}
            {r.promotedRules.map((rule, i) => (
              <div key={rule.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-600 text-xs w-5">{i + 1}</span>
                  <Badge label={rule.status.toUpperCase()} color={rule.status === "promoted" ? "green" : rule.status === "validated" ? "sky" : "zinc"} />
                  <span className="text-zinc-200 text-sm font-bold flex-1">{rule.title}</span>
                  <span className="text-zinc-600 text-xs font-mono">rev.{rule.revision}</span>
                </div>
                <p className="text-zinc-500 text-xs">{rule.description}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 w-24">confidence</span>
                    <Bar value={rule.confidence * 100} color="bg-green-600" />
                    <span className="text-zinc-400 w-10 text-right">{(rule.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 w-24">authority</span>
                    <Bar value={rule.authority * 100} color="bg-violet-600" />
                    <span className="text-zinc-400 w-10 text-right">{(rule.authority * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 w-24">successRate</span>
                    <Bar value={rule.successRate * 100} color="bg-emerald-600" />
                    <span className="text-zinc-400 w-10 text-right">{(rule.successRate * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="text-xs">
                  <span className="text-zinc-600">Conditions: </span>
                  {rule.conditions.map((c, ci) => (
                    <span key={ci} className="mr-2 text-sky-400 font-mono">{c.field} {c.operator} "{String(c.value).slice(0, 40)}"</span>
                  ))}
                </div>
                <div className="text-xs">
                  <span className="text-zinc-600">Consequences: </span>
                  {rule.consequences.map((c, ci) => (
                    <span key={ci} className="mr-2 text-amber-400">{c.action}({c.target.slice(0, 30)})</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* KNOWLEDGE GRAPH TAB */}
        {r && tab === "graph" && (
          <div className="space-y-3">
            <div className="flex gap-4 text-xs text-zinc-500">
              <span>Nodes: <strong className="text-white">{r.knowledgeGraph.nodes.length}</strong></span>
              <span>Edges: <strong className="text-white">{r.knowledgeGraph.edges.length}</strong></span>
            </div>
            {r.knowledgeGraph.nodes.length === 0 && (
              <p className="text-zinc-500 text-xs">Grafo vazio — nenhuma regra promovida.</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {r.knowledgeGraph.nodes.map(node => (
                <div key={node.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Badge label={node.kind} color={
                    node.kind === "anti_pattern" ? "red" :
                    node.kind === "pattern" ? "violet" :
                    node.kind === "capability" ? "sky" :
                    node.kind === "goal" ? "green" : "zinc"
                  } />
                  <span className="text-zinc-300 text-xs flex-1 truncate">{node.label}</span>
                  <span className="text-zinc-600 text-xs font-mono">{(node.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            {r.knowledgeGraph.edges.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold mb-2">Relações</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {r.knowledgeGraph.edges.map((edge, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500 font-mono w-16 truncate">{edge.from.slice(-8)}</span>
                      <span className="text-violet-400">→ {edge.relation}</span>
                      <span className="text-zinc-500 font-mono w-16 truncate">{edge.to.slice(-8)}</span>
                      <span className="text-zinc-600 ml-auto">{(edge.weight * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* METRICS TAB */}
        {r && tab === "metrics" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Episodes"          value={r.metrics.episodesProcessed}  color="text-sky-400" />
              <Metric label="Patterns Found"    value={r.metrics.patternsFound}       color="text-violet-400" />
              <Metric label="Knowledge Created" value={r.metrics.knowledgeCreated}    color="text-green-400" />
              <Metric label="Deprecated"        value={r.metrics.knowledgeDeprecated} color="text-zinc-400" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              {[
                { label: "Knowledge Accuracy",  value: r.metrics.knowledgeAccuracy,  color: "bg-emerald-600" },
                { label: "Pattern Coverage",    value: r.metrics.patternCoverage,    color: "bg-violet-600" },
                { label: "Learning Confidence", value: r.metrics.learningConfidence, color: "bg-sky-600" },
                { label: "Optimization Gain",   value: r.metrics.optimizationGain,   color: "bg-amber-600" },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-3 text-xs">
                  <span className="text-zinc-400 w-40 shrink-0">{m.label}</span>
                  <Bar value={m.value * 100} color={m.color} />
                  <span className="text-zinc-300 w-12 text-right">{(m.value * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Avg Learning Time" value={`${r.metrics.avgLearningTimeMs.toFixed(1)}ms`} color="text-zinc-300" />
              <Metric label="Knowledge Growth"  value={`+${r.metrics.knowledgeGrowth}`}              color="text-emerald-400" />
            </div>
          </div>
        )}

        {/* CAPABILITIES TAB */}
        {r && tab === "capabilities" && (
          <div className="space-y-2">
            {r.capabilityReinforcements.length === 0 && <p className="text-zinc-500 text-xs">Nenhuma capability registrada.</p>}
            {[...r.capabilityReinforcements].sort((a, b) => b.score - a.score).map(cap => (
              <div key={cap.capability} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sky-300 font-mono text-sm font-bold flex-1">{cap.capability}</span>
                  <Badge label={`score=${cap.score}`} color={cap.score >= 70 ? "green" : cap.score >= 50 ? "amber" : "red"} />
                  <span className="text-zinc-500 text-xs">×{cap.occurrences}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-600 w-28">Success Rate</span>
                  <Bar value={cap.successRate * 100} color="bg-emerald-600" />
                  <span className="text-zinc-400 w-12 text-right">{(cap.successRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-600 w-28">Learning Weight</span>
                  <Bar value={cap.learningWeight * 100} color="bg-violet-600" />
                  <span className="text-zinc-400 w-12 text-right">{(cap.learningWeight * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STRATEGIES TAB */}
        {r && tab === "strategies" && (
          <div className="space-y-2">
            {r.strategyReinforcements.length === 0 && <p className="text-zinc-500 text-xs">Nenhuma strategy registrada.</p>}
            {[...r.strategyReinforcements].sort((a, b) => b.learningScore - a.learningScore).map(str => (
              <div key={str.strategy} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-amber-300 font-mono text-sm font-bold flex-1">{str.strategy}</span>
                  <Badge label={`score=${str.learningScore}`} color={str.learningScore >= 70 ? "green" : str.learningScore >= 50 ? "amber" : "red"} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-zinc-600">Success: </span><span className="text-emerald-400">{str.executionSuccess}</span></div>
                  <div><span className="text-zinc-600">Failure: </span><span className="text-red-400">{str.executionFailure}</span></div>
                  <div><span className="text-zinc-600">Avg Cost: </span><span className="text-zinc-300">{str.avgCost.toFixed(1)}</span></div>
                  <div><span className="text-zinc-600">Avg Time: </span><span className="text-zinc-300">{str.avgDurationMs.toFixed(0)}ms</span></div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-600 w-20">Weight</span>
                  <Bar value={str.weight * 100} color="bg-amber-600" />
                  <span className="text-zinc-400 w-12 text-right">{(str.weight * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ANTI-PATTERNS TAB */}
        {r && tab === "antipatterns" && (
          <div className="space-y-2">
            {r.antiPatternsDetected.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                <p className="text-emerald-400 text-sm font-bold">Nenhum anti-pattern detectado.</p>
                <p className="text-zinc-600 text-xs mt-1">Todos os padrões estão dentro dos limites aceitáveis.</p>
              </div>
            )}
            {r.antiPatternsDetected.map(ap => (
              <div key={ap.id} className="bg-red-950/20 border border-red-800/40 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={ap.severity.toUpperCase()} color={ap.severity === "critical" ? "red" : ap.severity === "high" ? "amber" : "zinc"} />
                  <span className="text-red-300 font-bold text-sm flex-1">{ap.title}</span>
                </div>
                <p className="text-zinc-400 text-xs">{ap.description}</p>
                <p className="text-zinc-500 text-xs border-l-2 border-amber-700/40 pl-3">{ap.recommendation}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-zinc-600">Strategy: </span><span className="text-zinc-300 font-mono">{ap.strategy.slice(0, 40)}</span></div>
                  <div><span className="text-zinc-600">Failures: </span><span className="text-red-400">{ap.totalFailures}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}