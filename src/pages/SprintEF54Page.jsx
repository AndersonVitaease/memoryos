/**
 * SprintEF54Page.jsx — Sprint EF-54 · Meta-Cognitive Engine Dashboard
 */

import React, { useState, useCallback } from "react";
import { MetaCognitiveEngine } from "@/lib/meta-cognition/MetaCognitiveEngine";
import { MetaHistory }         from "@/lib/meta-cognition/MetaHistory";
import { LearningEngine }      from "@/lib/cognitive-learning/LearningEngine";
import { KnowledgeStore }      from "@/lib/cognitive-learning/KnowledgeStore";

// ── Seed helper ───────────────────────────────────────────────────────────────

function seedAndBuildSnapshot(preset) {
  const presets = [
    { goal: "analyze_repository", strategy: "multi_step",          success: true,  confidence: 0.82, authority: 0.78, duration: 3200, capabilities: ["repository.read", "ast.parse"],       connectors: ["github"],       inferenceDepth: 4, inferenceConf: 0.74, decisionConf: 0.79, decisionAuth: 0.75, conflicts: 1, optRecs: 2 },
    { goal: "read_file",          strategy: "direct_connector",     success: false, confidence: 0.88, authority: 0.65, duration: 7400, capabilities: ["file.read"],                          connectors: ["google_drive"], inferenceDepth: 2, inferenceConf: 0.60, decisionConf: 0.85, decisionAuth: 0.60, conflicts: 0, optRecs: 4 },
    { goal: "search_code",        strategy: "sequential",           success: true,  confidence: 0.55, authority: 0.50, duration: 1800, capabilities: ["code.search"],                        connectors: ["github"],       inferenceDepth: 1, inferenceConf: 0.50, decisionConf: 0.52, decisionAuth: 0.48, conflicts: 0, optRecs: 1 },
    { goal: "compare_branches",   strategy: "parallel_execution",   success: true,  confidence: 0.70, authority: 0.85, duration: 5100, capabilities: ["branch.compare", "diff.compute"],    connectors: ["github"],       inferenceDepth: 5, inferenceConf: 0.68, decisionConf: 0.72, decisionAuth: 0.83, conflicts: 3, optRecs: 3 },
  ];
  const p = presets[preset % presets.length];

  // Seed EF-51
  const eps = Array.from({ length: 30 }, (_, i) => ({
    id: `ep_${i}`, createdAt: Date.now() - i * 60000,
    goal: p.goal, intent: "analyze", context: "general",
    strategy: p.strategy, capabilities: p.capabilities,
    connectorChain: p.connectors,
    result: p.success ? "completed" : "error", success: p.success, failure: !p.success,
    confidence: p.confidence, authority: p.authority,
    cost: Math.round(1 + Math.random() * 8), durationMs: p.duration + Math.random() * 1000,
    metadata: {},
  }));
  LearningEngine.learn(eps);

  const rules = KnowledgeStore.getAll();

  return {
    goal:             p.goal,
    strategy:         p.strategy,
    capabilities:     p.capabilities,
    connectors:       p.connectors,
    knowledgeRules:   rules.length,
    inferenceDepth:   p.inferenceDepth,
    inferenceConf:    p.inferenceConf,
    decisionConf:     p.decisionConf,
    decisionAuth:     p.decisionAuth,
    optimizationRecs: p.optRecs,
    success:          p.success,
    durationMs:       p.duration,
    conflictCount:    p.conflicts,
    confidence:       p.confidence,
    authority:        p.authority,
  };
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
    teal:     "bg-teal-950/60   text-teal-300   border-teal-700",
    indigo:   "bg-indigo-950/60 text-indigo-300 border-indigo-700",
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

function Bar({ value, color = "bg-violet-600" }) {
  return (
    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value * 100, 100).toFixed(0)}%` }} />
    </div>
  );
}

function sev(s) {
  if (s === "critical") return "critical";
  if (s === "high")     return "red";
  if (s === "medium")   return "amber";
  return "zinc";
}

const STAGE_COLORS = {
  goal: "text-zinc-400", planner: "text-violet-400", strategy: "text-sky-400",
  capability: "text-blue-400", knowledge: "text-teal-400", inference: "text-indigo-400",
  decision: "text-green-400", execution: "text-amber-400", optimization: "text-orange-400",
};

const BIAS_COLORS = {
  overconfidence: "red", confirmation_bias: "amber", authority_bias: "amber",
  recency_bias: "red", connector_bias: "zinc", strategy_bias: "amber",
  capability_bias: "zinc", knowledge_bias: "red",
};

const TABS = [
  { id: "flow",         label: "Thought Flow" },
  { id: "biases",       label: "Biases" },
  { id: "alternatives", label: "Alternatives" },
  { id: "evidence",     label: "Evidence" },
  { id: "consistency",  label: "Consistency" },
  { id: "reflection",   label: "Reflection" },
  { id: "metrics",      label: "Metrics" },
  { id: "history",      label: "History" },
];

const PRESETS = ["analyze_repository", "read_file", "search_code", "compare_branches"];

export default function SprintEF54Page() {
  const [tab,     setTab]     = useState("flow");
  const [report,  setReport]  = useState(null);
  const [running, setRunning] = useState(false);
  const [preset,  setPreset]  = useState(0);

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        const snap = seedAndBuildSnapshot(preset);
        const result = MetaCognitiveEngine.analyze(snap);
        setReport(result);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [preset]);

  const r   = report;
  const hist = MetaHistory.getLast(20);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950/20 to-zinc-950 border border-indigo-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-54" color="indigo" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Meta-Cognitive Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Observa · Reconstrói · Detecta · Reflete</span>
          </div>
          <h1 className="text-xl font-black text-white">Meta-Cognitive Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Analisa COMO o sistema pensou. Detecta vieses, inconsistências e alternativas. NUNCA modifica módulos anteriores.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-zinc-400 text-xs">Scenario:</label>
            <select value={preset} onChange={e => setPreset(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300">
              {PRESETS.map((p, i) => <option key={i} value={i}>{p}</option>)}
            </select>
          </div>
          <button onClick={handleRun} disabled={running}
            className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors">
            {running ? "Analisando..." : "Executar Meta-Cognitive Analysis"}
          </button>
          {r && (
            <>
              <Badge label={`biases=${r.biases.length}`}              color={r.biases.length > 2 ? "red" : "amber"} />
              <Badge label={`issues=${r.consistencyIssues.length}`}   color={r.consistencyIssues.length > 0 ? "red" : "green"} />
              <Badge label={`meta_conf=${(r.metrics.metaConfidence * 100).toFixed(0)}%`} color="indigo" />
            </>
          )}
        </div>

        {/* Metrics */}
        {r && (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
            <Metric label="Flow Quality"    value={`${(r.cognitiveFlow.overallQuality * 100).toFixed(0)}%`} color="text-sky-400" />
            <Metric label="Reasoning"       value={`${(r.metrics.reasoningQuality * 100).toFixed(0)}%`}     color="text-violet-400" />
            <Metric label="Biases"          value={r.metrics.biasCount}                                     color={r.metrics.biasCount > 2 ? "text-red-400" : "text-amber-400"} />
            <Metric label="Consistency"     value={`${(r.metrics.consistencyScore * 100).toFixed(0)}%`}     color={r.metrics.consistencyScore > 0.7 ? "text-emerald-400" : "text-red-400"} />
            <Metric label="Evidence Cov."   value={`${(r.metrics.evidenceCoverage * 100).toFixed(0)}%`}     color="text-teal-400" />
            <Metric label="Calibration"     value={`${(r.metrics.confidenceCalibration * 100).toFixed(0)}%`} color="text-green-400" />
            <Metric label="Alternatives"    value={r.alternatives.length}                                   color="text-zinc-300" />
            <Metric label="Meta Conf."      value={`${(r.metrics.metaConfidence * 100).toFixed(0)}%`}       color="text-indigo-400" />
          </div>
        )}

        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <p className="text-zinc-400 text-sm">Selecione um cenário e pressione "Executar Meta-Cognitive Analysis".</p>
            <p className="text-zinc-600 text-xs mt-1">Consome EF-51 · EF-52 · EF-53 · sem modificar nenhum deles</p>
          </div>
        )}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Reconstruindo fluxo cognitivo · Detectando vieses · Gerando reflexão...</p>
          </div>
        )}

        {r && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto flex-wrap">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-w-fit px-2
                    ${tab === t.id ? "bg-indigo-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* THOUGHT FLOW */}
            {tab === "flow" && (
              <div className="space-y-2">
                <div className="flex gap-3 items-center text-xs text-zinc-500">
                  <span>Goal: <strong className="text-white">{r.goal}</strong></span>
                  <Badge label={`quality=${(r.cognitiveFlow.overallQuality * 100).toFixed(0)}%`} color={r.cognitiveFlow.overallQuality > 0.7 ? "green" : "amber"} />
                </div>
                {r.cognitiveFlow.steps.map((step, i) => (
                  <div key={step.stage} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-7 h-7 rounded-full border-2 border-indigo-600 bg-indigo-950/50 flex items-center justify-center text-xs font-bold ${STAGE_COLORS[step.stage] ?? "text-zinc-300"}`}>{i + 1}</div>
                      {i < r.cognitiveFlow.steps.length - 1 && <div className="w-px h-4 bg-zinc-800 mt-1" />}
                    </div>
                    <div className={`flex-1 border rounded-xl px-4 py-3 mb-1 ${step.issues.length > 0 ? "bg-red-950/10 border-red-800/30" : "bg-zinc-900/60 border-zinc-800/40"}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={step.stage} color={step.issues.length > 0 ? "red" : "zinc"} />
                        <span className="text-zinc-200 text-xs font-bold flex-1">{step.label}</span>
                        <span className="text-zinc-600 text-xs">{step.durationMs.toFixed(0)}ms</span>
                        <span className="text-zinc-500 text-xs">conf={`${(step.confidence * 100).toFixed(0)}%`}</span>
                      </div>
                      <p className="text-zinc-500 text-xs mt-1">{step.description}</p>
                      {step.issues.map((iss, j) => (
                        <p key={j} className="text-red-400 text-xs mt-0.5">⚠ {iss}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BIASES */}
            {tab === "biases" && (
              <div className="space-y-2">
                {r.biases.length === 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-6 text-center">
                    <p className="text-emerald-400 font-bold text-sm">Nenhum viés cognitivo detectado.</p>
                  </div>
                ) : r.biases.map(bias => (
                  <div key={bias.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={bias.severity.toUpperCase()} color={sev(bias.severity)} />
                      <Badge label={bias.type} color={BIAS_COLORS[bias.type] ?? "zinc"} />
                      <span className="text-zinc-200 text-sm font-bold flex-1">{bias.title}</span>
                      <span className="text-zinc-500 text-xs">magnitude={`${(bias.magnitude * 100).toFixed(0)}%`}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{bias.description}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-600 w-20 shrink-0">Magnitude</span>
                      <Bar value={bias.magnitude} color="bg-red-600" />
                      <span className="text-zinc-400 w-10 text-right">{(bias.magnitude * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-xs text-zinc-600">Stages: {bias.affectedStages.join(", ")} · Evidence: {bias.evidence.join(" · ")}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ALTERNATIVES */}
            {tab === "alternatives" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{r.alternatives.length} alternativas geradas — {r.alternatives.filter(a => a.couldImprove).length} poderiam melhorar o resultado.</p>
                {r.alternatives.map(alt => (
                  <div key={alt.id} className={`bg-zinc-900 border rounded-xl p-4 space-y-1.5 ${alt.couldImprove ? "border-amber-700/40" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={alt.kind} color="sky" />
                      {alt.couldImprove && <Badge label="COULD IMPROVE" color="amber" />}
                      <span className="text-zinc-200 text-sm font-bold flex-1">{alt.label}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{alt.description}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-600 w-20 shrink-0">Est. Confidence</span>
                      <Bar value={alt.estimatedConfidence} color="bg-sky-600" />
                      <span className="text-zinc-400 w-10 text-right">{(alt.estimatedConfidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-zinc-600 text-xs italic">Discarded: {alt.discardReason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* EVIDENCE */}
            {tab === "evidence" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  <Metric label="Total"         value={r.evidenceEvaluation.totalCount}                                              color="text-zinc-300" />
                  <Metric label="Quality"       value={`${(r.evidenceEvaluation.qualityScore * 100).toFixed(0)}%`}                   color="text-sky-400" />
                  <Metric label="Diversity"     value={`${(r.evidenceEvaluation.diversityScore * 100).toFixed(0)}%`}                 color="text-violet-400" />
                  <Metric label="Authority"     value={`${(r.evidenceEvaluation.authorityScore * 100).toFixed(0)}%`}                 color="text-amber-400" />
                  <Metric label="Coverage"      value={`${(r.evidenceEvaluation.coverageScore * 100).toFixed(0)}%`}                  color="text-teal-400" />
                  <Metric label="Contradictions" value={r.evidenceEvaluation.contradictionCount}                                    color={r.evidenceEvaluation.contradictionCount > 0 ? "text-red-400" : "text-emerald-400"} />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  {[
                    { label: "Quality Score",   value: r.evidenceEvaluation.qualityScore,   color: "bg-sky-600" },
                    { label: "Diversity Score",  value: r.evidenceEvaluation.diversityScore,  color: "bg-violet-600" },
                    { label: "Coverage Score",   value: r.evidenceEvaluation.coverageScore,   color: "bg-teal-600" },
                    { label: "Overall Score",    value: r.evidenceEvaluation.overallScore,    color: "bg-indigo-600" },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400 w-28 shrink-0">{m.label}</span>
                      <Bar value={m.value} color={m.color} />
                      <span className="text-zinc-300 w-10 text-right">{(m.value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                {r.evidenceEvaluation.weaknesses.length > 0 && (
                  <div className="bg-red-950/15 border border-red-800/30 rounded-xl p-3 space-y-1">
                    <p className="text-red-400 text-xs font-bold">Weaknesses</p>
                    {r.evidenceEvaluation.weaknesses.map((w, i) => <p key={i} className="text-zinc-400 text-xs">• {w}</p>)}
                  </div>
                )}
              </div>
            )}

            {/* CONSISTENCY */}
            {tab === "consistency" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge label={`consistency=${(r.metrics.consistencyScore * 100).toFixed(0)}%`}
                    color={r.metrics.consistencyScore > 0.8 ? "green" : r.metrics.consistencyScore > 0.6 ? "amber" : "red"} />
                  <span className="text-zinc-500 text-xs">Confidence Review: {r.confidenceReview.assessment}</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs font-bold">Confidence Review</p>
                  {[
                    { label: "Predicted",     value: r.confidenceReview.predictedConfidence, color: "bg-sky-600" },
                    { label: "Used in Dec.",  value: r.confidenceReview.usedConfidence,      color: "bg-violet-600" },
                    { label: "Realized",      value: r.confidenceReview.realizedSuccess,     color: "bg-emerald-600" },
                    { label: "Calibration Err", value: r.confidenceReview.calibrationError,  color: "bg-red-600" },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400 w-28 shrink-0">{m.label}</span>
                      <Bar value={m.value} color={m.color} />
                      <span className="text-zinc-300 w-10 text-right">{(m.value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-1">
                    {r.confidenceReview.isOverconfident  && <Badge label="OVERCONFIDENT"  color="red" />}
                    {r.confidenceReview.isUnderconfident && <Badge label="UNDERCONFIDENT" color="amber" />}
                    {!r.confidenceReview.isOverconfident && !r.confidenceReview.isUnderconfident && <Badge label="WELL CALIBRATED" color="green" />}
                  </div>
                </div>
                {r.consistencyIssues.length === 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-4 text-center">
                    <p className="text-emerald-400 font-bold text-sm">Nenhuma inconsistência detectada.</p>
                  </div>
                ) : r.consistencyIssues.map(ci => (
                  <div key={ci.id} className="bg-red-950/10 border border-red-800/30 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge label={ci.severity.toUpperCase()} color={sev(ci.severity)} />
                      <Badge label={ci.kind}                   color="zinc" />
                      <span className="text-zinc-300 text-xs font-bold">{ci.stageA} ↔ {ci.stageB}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{ci.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* REFLECTION */}
            {tab === "reflection" && (
              <div className="space-y-3">
                <div className="bg-indigo-950/20 border border-indigo-700/30 rounded-xl p-3">
                  <p className="text-indigo-300 text-xs font-bold mb-1">Reflexão Final</p>
                  <p className="text-zinc-400 text-sm">{r.reflection.summary}</p>
                </div>
                {[
                  { key: "strengths",    label: "✓ O que foi bem",    items: r.reflection.strengths,    borderColor: "border-emerald-700/30", titleColor: "text-emerald-400" },
                  { key: "weaknesses",   label: "✗ O que foi ruim",   items: r.reflection.weaknesses,   borderColor: "border-red-800/30",     titleColor: "text-red-400" },
                  { key: "improvements", label: "→ O que deve mudar", items: r.reflection.improvements, borderColor: "border-amber-700/30",   titleColor: "text-amber-400" },
                  { key: "retentions",   label: "= O que deve ficar",  items: r.reflection.retentions,   borderColor: "border-zinc-700/40",   titleColor: "text-zinc-400" },
                ].map(section => (
                  <div key={section.key} className={`bg-zinc-900/50 border ${section.borderColor} rounded-xl p-3 space-y-1`}>
                    <p className={`${section.titleColor} text-xs font-bold mb-2`}>{section.label} ({section.items.length})</p>
                    {section.items.length === 0
                      ? <p className="text-zinc-600 text-xs">—</p>
                      : section.items.map((item, i) => (
                        <div key={i} className="text-xs border-b border-zinc-800/30 pb-1 last:border-0">
                          <div className="flex items-center gap-2">
                            <Badge label={item.priority.toUpperCase()} color={item.priority === "critical" ? "critical" : item.priority === "high" ? "red" : item.priority === "medium" ? "amber" : "zinc"} />
                            <span className="text-zinc-300">{item.description}</span>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                ))}
              </div>
            )}

            {/* METRICS */}
            {tab === "metrics" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  {[
                    { label: "Reasoning Quality",       value: r.metrics.reasoningQuality,       color: "bg-violet-600" },
                    { label: "Reflection Quality",      value: r.metrics.reflectionQuality,      color: "bg-indigo-600" },
                    { label: "Alternative Coverage",    value: r.metrics.alternativeCoverage,    color: "bg-sky-600" },
                    { label: "Evidence Coverage",       value: r.metrics.evidenceCoverage,       color: "bg-teal-600" },
                    { label: "Consistency Score",       value: r.metrics.consistencyScore,       color: "bg-emerald-600" },
                    { label: "Confidence Calibration",  value: r.metrics.confidenceCalibration,  color: "bg-green-600" },
                    { label: "Meta Confidence",         value: r.metrics.metaConfidence,         color: "bg-indigo-600" },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400 w-40 shrink-0">{m.label}</span>
                      <Bar value={m.value} color={m.color} />
                      <span className="text-zinc-300 w-10 text-right">{(m.value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Bias Count"       value={r.metrics.biasCount}    color={r.metrics.biasCount > 2 ? "text-red-400" : "text-zinc-300"} />
                  <Metric label="Consistency Iss." value={r.consistencyIssues.length} color={r.consistencyIssues.length > 0 ? "text-red-400" : "text-emerald-400"} />
                  <Metric label="Duration"         value={`${r.durationMs}ms`}    color="text-zinc-400" />
                </div>
              </div>
            )}

            {/* HISTORY */}
            {tab === "history" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{hist.length} análises meta-cognitivas registradas.</p>
                {hist.length === 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 text-sm">Nenhuma análise ainda.</div>
                )}
                {[...hist].reverse().map(entry => (
                  <div key={entry.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap text-xs">
                    <Badge label={`meta_conf=${(entry.metaConfidence * 100).toFixed(0)}%`} color="indigo" />
                    <span className="text-zinc-300 flex-1 truncate">{entry.goal}</span>
                    <span className="text-red-400">{entry.biasCount} bias</span>
                    <span className="text-amber-400">{entry.consistencyIssues} issues</span>
                    <span className="text-sky-400">{entry.alternativesConsidered} alts</span>
                    <span className="text-zinc-600">{new Date(entry.recordedAt).toLocaleTimeString()}</span>
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