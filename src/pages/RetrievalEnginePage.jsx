// Retrieval Engine v1.0 -- Dashboard
// Foundation v1.0 · Engineering First · Sprint EF-13

import React, { useState, useCallback } from "react";
import { runRetrievalEngineTests } from "@/lib/retrieval-engine/retrievalEngineTests";

// ── UI Primitives ──────────────────────────────────────────────────────────────

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

function ScoreBar({ label, value, color = "bg-sky-600" }) {
  const pct = Math.round(value * 100);
  const textColor = pct >= 75 ? "text-emerald-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={`font-mono font-bold ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  const isHardening = r.name.startsWith("[Hardening]");
  const hasExtra    = r.detail || r.error;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2.5 px-3 text-left">
        <Badge
          label={r.passed ? "PASS" : "FAIL"}
          style={r.passed ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"} />
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

// ── Config ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "results",    label: "Resultados"  },
  { id: "retrieval",  label: "Retrieval"   },
  { id: "statistics", label: "Estatisticas"},
  { id: "health",     label: "Health"      },
  { id: "metrics",    label: "Metricas"    },
  { id: "arch",       label: "Arquitetura" },
];

const STRATEGY_COLORS = {
  EXACT:     "text-emerald-400",
  FUZZY:     "text-yellow-400",
  SEMANTIC:  "text-blue-400",
  COMPOSITE: "text-sky-400",
};

const TYPE_COLORS = {
  LESSON:        "text-sky-400",
  BEST_PRACTICE: "text-emerald-400",
  WARNING:       "text-yellow-400",
  RULE:          "text-violet-400",
  PATTERN:       "text-blue-400",
  ANTI_PATTERN:  "text-red-400",
  OBSERVATION:   "text-zinc-400",
};

const ARCH_NODES = [
  ["Goal Runtime v0.1",           "bg-blue-900/60 text-blue-300 border-blue-700"],
  ["Decision Engine v1.0",        "bg-amber-900/60 text-amber-300 border-amber-700"],
  ["Planning Engine v1.0",        "bg-orange-900/60 text-orange-300 border-orange-700"],
  ["Execution",                   "bg-zinc-700 text-zinc-200 border-zinc-600"],
  ["Reflection Engine v1.0",      "bg-rose-900/60 text-rose-300 border-rose-700"],
  ["Self Evaluation Engine v1.0", "bg-purple-900/60 text-purple-300 border-purple-700"],
  ["Knowledge Engine v1.0",       "bg-teal-900/60 text-teal-300 border-teal-700"],
  ["Learning Engine v1.0",        "bg-green-900/60 text-green-300 border-green-700"],
  ["Memory Engine v1.0",          "bg-indigo-900/60 text-indigo-300 border-indigo-700"],
  ["Retrieval Engine v1.0",       "bg-sky-900/60 text-sky-300 border-sky-700"],
];

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RetrievalEnginePage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runRetrievalEngineTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-sky-950/60 to-cyan-950/40 border border-sky-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-sky-400">Retrieval Engine v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First · Sprint EF-13</span>
              </div>
              <h1 className="text-lg font-bold text-white">Memory → Query</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                query · queryByGoal · queryByKeywords · queryByType · queryTopScoring · Ranking · Strategies
              </p>
              <p className="text-zinc-500 text-xs mt-1">18 criterios + 10 hardening = 28 cenarios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar Retrieval Engine v1.0"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}              color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed} color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}               color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}  color="text-sky-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-sky-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Pipeline completo → Memory → Retrieval → Hardening...</p>
            <p className="text-zinc-600 text-xs mt-1">18 criterios + 10 hardening</p>
          </div>
        )}

        {/* Error */}
        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro durante execucao</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Results */}
        {data && !running && (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border-2 p-3 ${allPass ? "bg-emerald-950/30 border-emerald-700" : "bg-red-950/30 border-red-800"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  label={allPass ? "RETRIEVAL ENGINE v1.0 -- PASS" : "RETRIEVAL ENGINE v1.0 -- FAIL"}
                  style={allPass ? "bg-emerald-900/60 text-emerald-300 border-emerald-700" : "bg-red-900/60 text-red-300 border-red-700"} />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass
                    ? "Retrieval Engine certificado -- pipeline cognitivo EF-13 completo."
                    : `${data.total - data.passed} criterio(s) reprovado(s).`}
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
                    activeTab === t.id ? "bg-sky-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Resultados */}
            {activeTab === "results" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">28 Cenarios (18 aceitacao + 10 hardening)</span>
                  <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                    {data.passed}/{data.total}
                  </span>
                </div>
                {data.results.map(r => <TestRow key={r.criterion} r={r} />)}
              </div>
            )}

            {/* Retrieval */}
            {activeTab === "retrieval" && (
              <div className="space-y-3">
                {/* Hit Rate */}
                <div className="bg-sky-950/30 border border-sky-800 rounded-xl p-4">
                  <p className="text-sky-300 text-xs font-bold uppercase tracking-wider mb-3">Query Results</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Metric label="Queries"  value={data.statistics.totalQueries}  color="text-sky-400" />
                    <Metric label="Hits"     value={data.statistics.totalHits}     color="text-emerald-400" />
                    <Metric label="Misses"   value={data.statistics.totalMisses}   color="text-red-400" />
                  </div>
                  <ScoreBar label="Hit Rate" value={data.statistics.hitRate} color="bg-sky-600" />
                </div>

                {/* Strategies */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Queries por Estrategia</p>
                  {Object.entries(data.statistics.queryByStrategy).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-24 shrink-0 ${STRATEGY_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-600 rounded-full"
                          style={{ width: data.statistics.totalQueries > 0 ? `${(v / data.statistics.totalQueries) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-zinc-400 w-5 text-right">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Status Lifecycle */}
                <div className="bg-sky-950/20 border border-sky-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-sky-300 mb-2">RetrievalResult Status</p>
                  <div className="flex flex-wrap gap-3 text-xs font-mono">
                    {[
                      ["HIT", "bg-emerald-900/40 text-emerald-300 border-emerald-800", "Resultados encontrados"],
                      ["PARTIAL", "bg-amber-900/40 text-amber-300 border-amber-800", "Resultados parciais"],
                      ["MISS", "bg-red-900/40 text-red-300 border-red-800", "Nenhum resultado"],
                    ].map(([s, cls, desc]) => (
                      <div key={s} className={`px-2 py-1.5 rounded border ${cls} flex items-center gap-2`}>
                        <span className="font-bold">{s}</span>
                        <span className="text-zinc-500 text-xs font-normal">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sort strategies */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Sort Orders Disponiveis</p>
                  {[
                    ["SCORE_DESC",      "Maior relevanceScore primeiro (default)"],
                    ["SCORE_ASC",       "Menor relevanceScore primeiro"],
                    ["RECENCY_DESC",    "Memory mais recente primeiro"],
                    ["IMPORTANCE_DESC", "CRITICAL > HIGH > MEDIUM > LOW"],
                  ].map(([s, desc]) => (
                    <div key={s} className="flex items-start gap-2 text-xs mb-1.5">
                      <span className="text-sky-300 font-mono w-32 shrink-0">{s}</span>
                      <span className="text-zinc-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Estatisticas */}
            {activeTab === "statistics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Queries"   value={data.statistics.totalQueries}         color="text-sky-400" />
                  <Metric label="Hits"      value={data.statistics.totalHits}            color="text-emerald-400" />
                  <Metric label="Misses"    value={data.statistics.totalMisses}          color="text-red-400" />
                  <Metric label="Parciais"  value={data.statistics.totalPartial}         color="text-amber-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Hit Rate"     value={`${Math.round(data.statistics.hitRate * 100)}%`} color="text-emerald-400" />
                  <Metric label="Avg Relevance" value={data.statistics.avgRelevanceScore.toFixed(3)}    color="text-sky-400" />
                  <Metric label="Avg Hits/Q"    value={data.statistics.avgHitsPerQuery.toFixed(1)}      color="text-zinc-300" />
                </div>

                {/* By Type */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Hits por Tipo de Memory</p>
                  {Object.entries(data.statistics.queryByType).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-28 shrink-0 ${TYPE_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-600 rounded-full"
                          style={{ width: data.statistics.totalHits > 0 ? `${(v / data.statistics.totalHits) * 100}%` : "0%" }} />
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Metric label="Queries"     value={data.metrics.queryTotal}      color="text-sky-400" />
                <Metric label="Hits"        value={data.metrics.hitTotal}        color="text-emerald-400" />
                <Metric label="Misses"      value={data.metrics.missTotal}       color="text-red-400" />
                <Metric label="Parciais"    value={data.metrics.partialTotal}    color="text-amber-400" />
                <Metric label="Avg Op"      value={`${data.metrics.avgDurationMs}ms`} color="text-zinc-300" />
                <Metric label="Avg Hits/Q"  value={data.metrics.avgHitsPerQuery.toFixed(1)} color="text-sky-300" />
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === "arch" && (
              <div className="space-y-3">
                {/* Pipeline completo */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline Cognitivo Completo</p>
                  <div className="flex flex-col items-center gap-0">
                    {ARCH_NODES.map(([label, cls], i, arr) => (
                      <React.Fragment key={label}>
                        <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-64 text-center ${cls} ${label.includes("Retrieval Engine") ? "ring-2 ring-sky-400" : ""}`}>
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Strategies */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Estrategias de Retrieval</p>
                  {[
                    ["EXACT",     "text-emerald-400", "Filtro por campos exatos (goalId, type)"],
                    ["FUZZY",     "text-yellow-400",  "Busca por keywords em texto (title, summary, insights)"],
                    ["SEMANTIC",  "text-blue-400",    "Reservado para embeddings reais (Sprint EF-14+)"],
                    ["COMPOSITE", "text-sky-400",     "Combina score + keywords + importance + confidence"],
                  ].map(([s, col, desc]) => (
                    <div key={s} className="flex items-start gap-3 text-xs">
                      <span className={`font-mono font-bold w-24 shrink-0 ${col}`}>{s}</span>
                      <span className="text-zinc-500">{desc}</span>
                    </div>
                  ))}
                </div>

                {/* Relevance scoring */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Relevance Score (0..1)</p>
                  {[
                    ["Base",          "memoryScore / 100"],
                    ["Keyword bonus", "+0.30 * (matched / total keywords)"],
                    ["CRITICAL imp",  "+0.10"],
                    ["HIGH imp",      "+0.06"],
                    ["HIGH conf",     "+0.05"],
                    ["MEDIUM conf",   "+0.02"],
                  ].map(([comp, formula]) => (
                    <div key={comp} className="flex items-start gap-3 text-xs">
                      <span className="text-sky-300 font-mono w-28 shrink-0">{comp}</span>
                      <span className="text-zinc-500 font-mono">{formula}</span>
                    </div>
                  ))}
                </div>

                {/* SRP */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {[
                    ["+", "text-emerald-400", "Query, filtra e ranqueia Memories da MemoryEngine"],
                    ["+", "text-emerald-400", "Calcula relevanceScore por estrategia"],
                    ["+", "text-emerald-400", "Ordena por SCORE/RECENCY/IMPORTANCE"],
                    ["+", "text-emerald-400", "Detecta HIT / PARTIAL / MISS"],
                    ["+", "text-emerald-400", "Produz RetrievalHit imutavel com matchedKeywords"],
                    ["x", "text-red-400",     "NAO modifica Memory, Learning, Knowledge, Reflection"],
                    ["x", "text-red-400",     "NAO gera embeddings reais (SEMANTIC reservado)"],
                    ["x", "text-red-400",     "NAO persiste queries em banco de dados"],
                    ["x", "text-red-400",     "NAO usa LLM para re-ranking"],
                    ["x", "text-red-400",     "NAO executa Goals nem cria planos"],
                  ].map(([icon, col, text], i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className={`shrink-0 font-bold ${col}`}>{icon}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>

                {/* Next sprint */}
                <div className="bg-sky-950/20 border border-sky-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-sky-300 mb-2">Proxima Sprint — EF-14</p>
                  <p className="text-xs text-zinc-400">Capability Runtime v2.0 — executar um ExecutionPlan completo usando os Engines do pipeline cognitivo como Capabilities reais.</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Pre-run */}
        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Retrieval Engine v1.0 -- Memory to Query</p>
            <p className="text-zinc-600 text-xs">query · queryByGoal · queryByKeywords · queryByType · queryTopScoring</p>
            <p className="text-zinc-700 text-xs mt-1">Pipeline cognitivo completo: GoalRuntime to Memory to Retrieval</p>
          </div>
        )}
      </div>
    </div>
  );
}