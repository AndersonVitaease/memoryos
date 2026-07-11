// Self Evaluation Engine v1.0 — Dashboard
// Foundation v1.0 · Engineering First · Sprint 20

import React, { useState, useCallback } from "react";
import { runSelfEvaluationEngineTests } from "@/lib/self-evaluation-engine/selfEvaluationEngineTests";

function Badge({ label, style }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  const isHardening = r.name.startsWith("[Hardening]");
  const hasExtra    = r.detail || r.error;
  const passBadge   = r.passed
    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
    : "bg-red-900/50 text-red-300 border-red-700";
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2.5 px-3 text-left">
        <Badge label={r.passed ? "PASS" : "FAIL"} style={passBadge} />
        <span className="text-zinc-500 font-mono text-xs w-5 shrink-0 mt-0.5">C{r.criterion}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${r.passed ? "text-zinc-200" : "text-red-300"}`}>{r.name}</p>
          {isHardening && <span className="text-xs text-violet-400 font-mono">hardening</span>}
        </div>
        <span className="text-zinc-600 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700 space-y-1">
          {r.detail && <p className="text-xs text-zinc-400">{r.detail}</p>}
          {r.error  && <p className="text-xs text-red-400 font-mono">error: {r.error}</p>}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "results",    label: "Criterios"   },
  { id: "statistics", label: "Estatisticas"},
  { id: "health",     label: "Health"      },
  { id: "metrics",    label: "Metricas"    },
  { id: "arch",       label: "Arquitetura" },
];

const ARCH_NODES = [
  ["Goal Runtime v0.1",           "bg-blue-900/60 text-blue-300 border-blue-700"],
  ["Decision Engine v1.0",        "bg-amber-900/60 text-amber-300 border-amber-700"],
  ["Planning Engine v1.0",        "bg-orange-900/60 text-orange-300 border-orange-700"],
  ["Execution Dispatcher v1.0",   "bg-emerald-900/60 text-emerald-300 border-emerald-700"],
  ["Execution Result",            "bg-zinc-700 text-zinc-200 border-zinc-600"],
  ["Reflection Engine v1.0",      "bg-rose-900/60 text-rose-300 border-rose-700"],
  ["Self Evaluation Engine v1.0", "bg-purple-900/60 text-purple-300 border-purple-700"],
  ["Knowledge Engine",            "bg-zinc-800 text-zinc-400 border-zinc-700"],
];

const CLASS_COLORS = {
  EXCELLENT:  "text-emerald-400",
  GOOD:       "text-green-400",
  ACCEPTABLE: "text-yellow-400",
  POOR:       "text-orange-400",
  FAILED:     "text-red-400",
};

const CLASS_BG = {
  EXCELLENT:  "bg-emerald-900/40 border-emerald-700",
  GOOD:       "bg-green-900/40 border-green-700",
  ACCEPTABLE: "bg-yellow-900/40 border-yellow-700",
  POOR:       "bg-orange-900/40 border-orange-700",
  FAILED:     "bg-red-900/40 border-red-700",
};

function ScoreBar({ label, value, color = "bg-purple-600" }) {
  const textColor = value >= 75 ? "text-emerald-400" : value >= 55 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={`font-mono font-bold ${textColor}`}>{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function SelfEvaluationEnginePage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runSelfEvaluationEngineTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-950/60 to-violet-950/40 border border-purple-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-purple-400">Self Evaluation Engine v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Reflection → SelfEvaluation</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                evaluate · classify · scores · strengths · weaknesses · forward-compat
              </p>
              <p className="text-zinc-500 text-xs mt-1">16 criterios + 8 hardening = 24 cenarios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar Self Evaluation Engine v1.0"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}                    color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed}       color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}                     color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}        color="text-purple-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-purple-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">GoalRuntime → Decision → Planning → Reflection → SelfEvaluation → Hardening...</p>
            <p className="text-zinc-600 text-xs mt-1">16 criterios + 8 hardening</p>
          </div>
        )}

        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro durante execucao</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {data && !running && (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border-2 p-3 ${allPass ? "bg-emerald-950/30 border-emerald-700" : "bg-red-950/30 border-red-800"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  label={allPass ? "SELF EVALUATION ENGINE v1.0 — PASS" : "SELF EVALUATION ENGINE v1.0 — FAIL"}
                  style={allPass ? "bg-emerald-900/60 text-emerald-300 border-emerald-700" : "bg-red-900/60 text-red-300 border-red-700"} />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass ? "Self Evaluation Engine certificado." : `${data.total - data.passed} criterio(s) reprovado(s).`}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge label={data.health.status}
                  style={data.health.status === "SUCCESS"
                    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                    : "bg-red-900/50 text-red-300 border-red-700"} />
                <span className="text-xs text-zinc-500 font-mono">{data.health.details}</span>
              </div>
              {!allPass && failedOnly.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {failedOnly.map(r => (
                    <p key={r.criterion} className="text-xs text-red-400 font-mono pl-2">C{r.criterion}: {r.name}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === t.id ? "bg-purple-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Criterios */}
            {activeTab === "results" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">24 Cenarios (16 aceitacao + 8 hardening)</span>
                  <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                    {data.passed}/{data.total}
                  </span>
                </div>
                {data.results.map(r => <TestRow key={r.criterion} r={r} />)}
              </div>
            )}

            {/* Estatisticas */}
            {activeTab === "statistics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Avaliados"   value={data.statistics.totalEvaluated}   color="text-purple-400" />
                  <Metric label="Invalidados" value={data.statistics.totalInvalidated} color="text-amber-400" />
                  <Metric label="Arquivados"  value={data.statistics.totalArchived}    color="text-zinc-400" />
                  <Metric label="Avg Score"   value={`${data.statistics.avgOverallScore}/100`} color="text-sky-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Revisao Humana" value={data.statistics.requiresHumanReviewCount} color="text-orange-400" />
                  <Metric label="Pronto p/ Learn" value={data.statistics.readyForLearningCount}   color="text-emerald-400" />
                </div>

                {/* Classification breakdown */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Classification Breakdown</p>
                  {Object.entries(data.statistics.classificationBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-24 shrink-0 ${CLASS_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-600 rounded-full"
                          style={{ width: data.statistics.totalEvaluated > 0 ? `${(v / data.statistics.totalEvaluated) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-zinc-400 w-5 text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Health */}
            {activeTab === "health" && (
              <div className="space-y-3">
                <div className={`rounded-xl border p-4 ${data.health.status === "SUCCESS" ? "bg-emerald-950/20 border-emerald-800" : "bg-red-950/20 border-red-800"}`}>
                  <Badge label={`HEALTH: ${data.health.status}`}
                    style={data.health.status === "SUCCESS"
                      ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                      : "bg-red-900/60 text-red-300 border-red-700"} />
                  <p className="text-xs text-zinc-400 font-mono mt-2">{data.health.details}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Health Checks</p>
                  {Object.entries(data.health.checks).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${v ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="text-zinc-300 font-mono flex-1">{k}</span>
                      <span className={`font-bold ${v ? "text-emerald-400" : "text-red-400"}`}>{v ? "OK" : "FAIL"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metricas */}
            {activeTab === "metrics" && (
              <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
                <Metric label="Avaliados"   value={data.metrics.evaluateTotal}   color="text-purple-400" />
                <Metric label="Invalidados" value={data.metrics.invalidateTotal} color="text-amber-400" />
                <Metric label="Arquivados"  value={data.metrics.archiveTotal}    color="text-zinc-400" />
                <Metric label="Avg Op"      value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === "arch" && (
              <div className="space-y-3">
                {/* Flow */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Fluxo de Arquitetura</p>
                  <div className="flex flex-col items-center gap-0">
                    {ARCH_NODES.map(([label, cls], i, arr) => (
                      <React.Fragment key={label}>
                        <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-64 text-center ${cls} ${label.includes("Self Evaluation") ? "ring-2 ring-purple-500" : ""}`}>
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Classification thresholds */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Classification Thresholds</p>
                  {[
                    ["EXCELLENT",  "≥ 90", "text-emerald-400"],
                    ["GOOD",       "75 – 89", "text-green-400"],
                    ["ACCEPTABLE", "55 – 74", "text-yellow-400"],
                    ["POOR",       "35 – 54", "text-orange-400"],
                    ["FAILED",     "< 35",   "text-red-400"],
                  ].map(([c, r, col]) => (
                    <div key={c} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-24 shrink-0 ${col}`}>{c}</span>
                      <span className="text-zinc-400">{r}/100</span>
                    </div>
                  ))}
                </div>

                {/* Score weights */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Score Weights (Overall)</p>
                  {[
                    ["performanceScore",  "25%"],
                    ["qualityScore",      "25%"],
                    ["reliabilityScore",  "20%"],
                    ["consistencyScore",  "10%"],
                    ["confidenceScore",   "10%"],
                    ["riskScore",         "10%"],
                  ].map(([k, w]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-mono">{k}</span>
                      <span className="text-purple-400 font-bold font-mono">{w}</span>
                    </div>
                  ))}
                </div>

                {/* Forward compat */}
                <div className="bg-purple-950/20 border border-purple-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-purple-300 mb-2">Forward-Compatibility Fields (v1.0 empty)</p>
                  <div className="grid grid-cols-2 gap-1">
                    {["evaluationFingerprint","learningCandidates","knowledgeCandidates","optimizationCandidates","automationCandidates","futureCapabilities","futureConnectors","executionSignature","evaluationVersion","architectureVersion","foundationVersion"].map(f => (
                      <span key={f} className="text-xs text-zinc-500 font-mono bg-zinc-800/60 px-2 py-0.5 rounded">{f}</span>
                    ))}
                  </div>
                </div>

                {/* SRP */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {[
                    ["✓","text-emerald-400","Avalia Reflection e produz SelfEvaluation imutavel"],
                    ["✓","text-emerald-400","Calcula 7 scores (0-100) independentes"],
                    ["✓","text-emerald-400","Classifica execucao (EXCELLENT/GOOD/ACCEPTABLE/POOR/FAILED)"],
                    ["✓","text-emerald-400","Extrai strengths, weaknesses, recommendations, improvementActions"],
                    ["✓","text-emerald-400","Determina requiresHumanReview e readyForLearning"],
                    ["✗","text-red-400","NAO executa Goals"],
                    ["✗","text-red-400","NAO modifica Reflection, Goal, DecisionResult ou ExecutionPlan"],
                    ["✗","text-red-400","NAO aprende nem cria conhecimento"],
                    ["✗","text-red-400","NAO conversa com LLM"],
                    ["✗","text-red-400","NAO agenda nem despacha"],
                  ].map(([icon, col, text], i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className={`shrink-0 ${col}`}>{icon}</span>{text}
                    </div>
                  ))}
                </div>

                {/* Status lifecycle */}
                <div className="bg-purple-950/20 border border-purple-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-purple-300 mb-2">Evaluation Status Lifecycle</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    {["EVALUATED","→","INVALIDATED"].map((s, i) => (
                      <span key={i} className={s === "→" ? "text-zinc-600" : "bg-zinc-800 text-purple-300 px-2 py-0.5 rounded border border-purple-900"}>{s}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono mt-2">
                    <span className="text-zinc-600">any →</span>
                    <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">ARCHIVED</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Self Evaluation Engine v1.0 — Reflection → SelfEvaluation</p>
            <p className="text-zinc-600 text-xs">evaluate · classify · scores · strengths · weaknesses</p>
            <p className="text-zinc-700 text-xs mt-1">Reutiliza GoalRuntime + DecisionEngine + PlanningEngine + ReflectionEngine</p>
          </div>
        )}
      </div>
    </div>
  );
}