// Learning Engine v1.0 -- Dashboard
// Foundation v1.0 - Engineering First - Sprint 22

import React, { useState, useCallback } from "react";
import { runLearningEngineTests } from "@/lib/learning-engine/learningEngineTests";

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
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2.5 px-3 text-left">
        <Badge label={r.passed ? "PASS" : "FAIL"}
          style={r.passed
            ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
            : "bg-red-900/50 text-red-300 border-red-700"} />
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
  { id: "results",    label: "Resultados"  },
  { id: "learning",   label: "Learning"    },
  { id: "statistics", label: "Estatisticas"},
  { id: "health",     label: "Health"      },
  { id: "metrics",    label: "Metricas"    },
  { id: "arch",       label: "Arquitetura" },
];

const TYPE_COLORS = {
  LESSON:        "text-sky-400",
  BEST_PRACTICE: "text-emerald-400",
  WARNING:       "text-yellow-400",
  RULE:          "text-violet-400",
  PATTERN:       "text-blue-400",
  ANTI_PATTERN:  "text-red-400",
  OBSERVATION:   "text-zinc-400",
};

const IMP_COLORS = {
  CRITICAL: "text-red-400",
  HIGH:     "text-orange-400",
  MEDIUM:   "text-yellow-400",
  LOW:      "text-zinc-400",
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
  ["Memory Engine (Sprint 23+)",  "bg-zinc-800 text-zinc-500 border-zinc-700"],
];

const FWD_FIELDS = [
  "learningFingerprint","learningEmbedding","learningVector","learningCluster",
  "learningRelations","learningDependencies","learningConflicts","learningOpportunities",
  "futureCapabilities","futureConnectors",
];

const SRP_RULES = [
  ["check", "text-emerald-400", "Filtra qualidade: status=ACTIVE + score >= 60"],
  ["check", "text-emerald-400", "Espelha learningType, score, confidence, importance do Knowledge"],
  ["check", "text-emerald-400", "Transforma evidence em insights, patterns, recommendations"],
  ["check", "text-emerald-400", "Produz Learning completamente imutavel (Object.freeze)"],
  ["check", "text-emerald-400", "Prepara campos forward-compat para Sprint 23+"],
  ["x",     "text-red-400",     "NAO executa Goals, altera Decision, Planning, Reflection ou SelfEvaluation"],
  ["x",     "text-red-400",     "NAO acessa Memory Engine diretamente"],
  ["x",     "text-red-400",     "NAO recalcula scores -- Mirror Principle"],
  ["x",     "text-red-400",     "NAO usa LLM, embeddings reais ou vetores reais"],
  ["x",     "text-red-400",     "NAO persiste dados em banco de dados"],
];

export default function LearningEnginePage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runLearningEngineTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-green-950/60 to-emerald-950/40 border border-green-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-green-400">Learning Engine v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First · Sprint 22</span>
              </div>
              <h1 className="text-lg font-bold text-white">Knowledge → Learning</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Quality Gate · createLearning · reject · archive · forwardCompat · pipelineIntegrity
              </p>
              <p className="text-zinc-500 text-xs mt-1">18 criterios + 10 hardening = 28 cenarios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar Learning Engine v1.0"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}              color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed} color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}               color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}  color="text-green-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">GoalRuntime to Decision to Planning to Reflection to SelfEval to Knowledge to Learning...</p>
            <p className="text-zinc-600 text-xs mt-1">18 criterios + 10 hardening</p>
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
                  label={allPass ? "LEARNING ENGINE v1.0 -- PASS" : "LEARNING ENGINE v1.0 -- FAIL"}
                  style={allPass ? "bg-emerald-900/60 text-emerald-300 border-emerald-700" : "bg-red-900/60 text-red-300 border-red-700"} />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass ? "Learning Engine certificado -- pronto para Sprint 23." : `${data.total - data.passed} criterio(s) reprovado(s).`}
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
                    activeTab === t.id ? "bg-green-700 text-white" : "text-zinc-400 hover:text-white"}`}>
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

            {/* Learning */}
            {activeTab === "learning" && (
              <div className="space-y-3">
                <div className="bg-green-950/30 border border-green-800 rounded-xl p-4">
                  <p className="text-green-300 text-xs font-bold uppercase tracking-wider mb-2">Quality Gate</p>
                  <p className="text-zinc-300 text-xs">Learning criado SOMENTE quando:</p>
                  <div className="mt-2 space-y-1">
                    {["Knowledge.status == ACTIVE", "Knowledge.knowledgeScore >= 60"].map(c => (
                      <div key={c} className="flex items-center gap-2 text-xs">
                        <span className="text-green-400">-&gt;</span>
                        <span className="text-zinc-300 font-mono">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Mirror Principle -- Sem Re-derivacao</p>
                  {[
                    ["learningType",   "knowledgeType",                             "mirror"],
                    ["learningScore",  "knowledgeScore",                            "mirror"],
                    ["confidence",     "confidence",                                "mirror"],
                    ["importance",     "importance",                                "mirror"],
                    ["insights",       "evidence.lessonsLearned + strengths",       "transform"],
                    ["patterns",       "evidence.improvementPatterns + bestPractices","transform"],
                    ["recommendations","evidence.recommendations",                  "transform"],
                  ].map(([field, src, mode]) => (
                    <div key={field} className="flex items-start gap-2 mb-1.5 text-xs">
                      <span className="text-green-300 font-mono w-32 shrink-0">{field}</span>
                      <span className="text-zinc-600">{"<--"}</span>
                      <span className="text-zinc-500 flex-1">{src}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${
                        mode === "mirror" ? "bg-blue-900/40 text-blue-300" : "bg-amber-900/40 text-amber-300"
                      }`}>{mode}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-green-950/20 border border-green-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-green-300 mb-2">Learning Status Lifecycle</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono mb-2">
                    {["ACTIVE", "->", "REJECTED"].map((s, i) => (
                      <span key={i} className={s === "->" ? "text-zinc-600" : "bg-zinc-800 text-green-300 px-2 py-0.5 rounded border border-green-900"}>{s}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-zinc-600">any --&gt;</span>
                    <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">ARCHIVED</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Criados"        value={data.statistics.totalLearning}   color="text-green-400" />
                  <Metric label="Rejeitados"     value={data.statistics.totalRejected}   color="text-red-400" />
                  <Metric label="Pronto Memoria" value={data.statistics.readyForMemory}  color="text-emerald-400" />
                </div>
              </div>
            )}

            {/* Estatisticas */}
            {activeTab === "statistics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Criados"    value={data.statistics.totalLearning}        color="text-green-400" />
                  <Metric label="Rejeitados" value={data.statistics.totalRejected}        color="text-red-400" />
                  <Metric label="Arquivados" value={data.statistics.totalArchived}        color="text-zinc-400" />
                  <Metric label="Avg Score"  value={`${data.statistics.averageLearningScore}/100`} color="text-sky-400" />
                </div>
                <Metric label="Prontos para Memory Engine" value={data.statistics.readyForMemory} color="text-emerald-400" />

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Por Tipo</p>
                  {Object.entries(data.statistics.learningByType).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-28 shrink-0 ${TYPE_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-600 rounded-full"
                          style={{ width: data.statistics.totalLearning > 0 ? `${(v / data.statistics.totalLearning) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-zinc-400 w-5 text-right">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Por Importancia</p>
                  {Object.entries(data.statistics.learningByImportance).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-20 shrink-0 ${IMP_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-600 rounded-full"
                          style={{ width: data.statistics.totalLearning > 0 ? `${(v / data.statistics.totalLearning) * 100}%` : "0%" }} />
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
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Criados"    value={data.metrics.createTotal}  color="text-green-400" />
                <Metric label="Rejeitados" value={data.metrics.rejectTotal}  color="text-red-400" />
                <Metric label="Arquivados" value={data.metrics.archiveTotal} color="text-zinc-400" />
                <Metric label="Avg Op"     value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === "arch" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline Cognitivo Completo</p>
                  <div className="flex flex-col items-center gap-0">
                    {ARCH_NODES.map(([label, cls], i, arr) => (
                      <React.Fragment key={label}>
                        <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-64 text-center ${cls} ${label.includes("Learning Engine v1.0") ? "ring-2 ring-green-500" : ""}`}>
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="bg-green-950/20 border border-green-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-green-300 mb-2">Forward-Compatibility Fields (v1.0 empty)</p>
                  <div className="grid grid-cols-2 gap-1">
                    {FWD_FIELDS.map(f => (
                      <span key={f} className="text-xs text-zinc-500 font-mono bg-zinc-800/60 px-2 py-0.5 rounded">{f}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {SRP_RULES.map(([type, col, text], i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className={`shrink-0 font-bold ${col}`}>{type === "check" ? "+" : "x"}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Learning Engine v1.0 -- Knowledge to Learning</p>
            <p className="text-zinc-600 text-xs">Quality Gate (score 60+) · Mirror Principle · pipelineIntegrity · forward-compat</p>
            <p className="text-zinc-700 text-xs mt-1">Ultima etapa antes da futura Sprint 23 -- Memory Engine</p>
          </div>
        )}
      </div>
    </div>
  );
}