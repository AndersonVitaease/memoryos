// CognitivePipelineAdapterPage.jsx
// Sprint INT-01 · Engineering First
// Dashboard: Cognitive Pipeline Adapter v1.0

import React, { useState, useCallback } from "react";
import { runCognitivePipelineAdapterTests } from "@/lib/cognitive-pipeline-adapter/cognitivePipelineAdapterTests";

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

const TABS = [
  { id: "results",    label: "Criterios"   },
  { id: "pipeline",   label: "Pipeline"    },
  { id: "health",     label: "Health"      },
  { id: "statistics", label: "Estatisticas"},
  { id: "metrics",    label: "Metricas"    },
  { id: "todos",      label: "TODOs"       },
];

const STAGES = [
  { stage: "INTENT_ADAPTER",       label: "Intent Adapter (stub)",    color: "bg-zinc-700/60 text-zinc-300 border-zinc-600",     note: "TODO INT-01-001" },
  { stage: "GOAL_RUNTIME",         label: "Goal Runtime v0.1",        color: "bg-blue-900/60 text-blue-300 border-blue-700",     note: "EF-01" },
  { stage: "GOAL_REGISTRY",        label: "Goal Registry Service v1", color: "bg-indigo-900/60 text-indigo-300 border-indigo-700", note: "EF-02" },
  { stage: "GOAL_SCHEDULER",       label: "Goal Scheduler v1.0",      color: "bg-cyan-900/60 text-cyan-300 border-cyan-700",     note: "EF-03" },
  { stage: "EXECUTION_DISPATCHER", label: "Execution Dispatcher v1",  color: "bg-emerald-900/60 text-emerald-300 border-emerald-700", note: "EF-05" },
  { stage: "GOAL_EXECUTION_QUEUE", label: "Goal Execution Queue v1",  color: "bg-violet-900/60 text-violet-300 border-violet-700", note: "EF-04" },
  { stage: "DECISION_ENGINE",      label: "Decision Engine v1.0",     color: "bg-amber-900/60 text-amber-300 border-amber-700",  note: "EF-06" },
  { stage: "PLANNING_ENGINE",      label: "Planning Engine v1.0",     color: "bg-orange-900/60 text-orange-300 border-orange-700", note: "EF-07" },
  { stage: "REFLECTION_ENGINE",    label: "Reflection Engine v1.0",   color: "bg-rose-900/60 text-rose-300 border-rose-700",     note: "EF-08" },
  { stage: "CAPABILITY_RUNTIME",   label: "Capability Runtime (stub)",color: "bg-zinc-700/60 text-zinc-400 border-zinc-600",     note: "TODO INT-01-002" },
  { stage: "MEMORY_ENGINE",        label: "Memory Engine v1.0",       color: "bg-purple-900/60 text-purple-300 border-purple-700", note: "EF-12" },
  { stage: "KNOWLEDGE_ENGINE",     label: "Knowledge Engine v1.0",    color: "bg-teal-900/60 text-teal-300 border-teal-700",     note: "EF-10" },
  { stage: "RESPONSE",             label: "Response",                  color: "bg-green-900/60 text-green-300 border-green-700",   note: "output" },
];

const STATUS_STYLE = {
  COMPLETED: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  SKIPPED:   "bg-zinc-800 text-zinc-400 border-zinc-700",
  FAILED:    "bg-red-900/50 text-red-300 border-red-700",
  PENDING:   "bg-zinc-800 text-zinc-500 border-zinc-700",
  RUNNING:   "bg-blue-900/50 text-blue-300 border-blue-700",
};

const TODOS = [
  {
    id:    "INT-01-001",
    title: "Intent Layer (EF-22)",
    desc:  "Substituir stub por IntentLayer.detect(message). Analisa intencao do usuario e produz structured intent.",
    stage: "INTENT_ADAPTER",
    sprint: "EF-22",
    severity: "high",
  },
  {
    id:    "INT-01-002",
    title: "Capability Runtime execute() (EF-15)",
    desc:  "CapabilityRuntime ainda nao possui execute(plan) publico. Aguardar EF-15 Capability Runtime v2.0.",
    stage: "CAPABILITY_RUNTIME",
    sprint: "EF-15",
    severity: "high",
  },
  {
    id:    "INT-01-003",
    title: "Memory e Knowledge injecao real (EF-20)",
    desc:  "MemoryEngine e KnowledgeEngine recebem apenas health check. Injecao de dados de producao aguarda Context Engine (EF-20).",
    stage: "MEMORY_ENGINE / KNOWLEDGE_ENGINE",
    sprint: "EF-20",
    severity: "medium",
  },
];

export default function CognitivePipelineAdapterPage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runCognitivePipelineAdapterTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/60 to-emerald-950/60 border border-violet-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-violet-400">Cognitive Pipeline Adapter v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Sprint INT-01</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Pipeline Integration Layer</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                IntentAdapter → GoalRuntime → Registry → Scheduler → Dispatcher → Queue → Decision → Planning → Reflection → Memory → Knowledge
              </p>
              <p className="text-zinc-500 text-xs mt-1">16 acceptance + 8 hardening = 24 criterios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar INT-01"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}              color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed} color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}               color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}  color="text-violet-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Intent → GoalRuntime → Registry → Scheduler → Dispatcher → Queue → Decision → Planning → Reflection → Capability → Memory → Knowledge...</p>
            <p className="text-zinc-600 text-xs mt-1">16 acceptance + 8 hardening</p>
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
                  label={allPass ? "PIPELINE ADAPTER v1.0 — PASS" : "PIPELINE ADAPTER v1.0 — FAIL"}
                  style={allPass ? "bg-emerald-900/60 text-emerald-300 border-emerald-700" : "bg-red-900/60 text-red-300 border-red-700"} />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass ? "Pipeline certificado — modulos EF conectados ao produto." : `${data.total - data.passed} criterio(s) reprovado(s).`}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge label={data.health.status}
                  style={data.health.status === "SUCCESS" ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"} />
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
                    activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Criterios */}
            {activeTab === "results" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">24 Cenarios (16 acceptance + 8 hardening)</span>
                  <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>{data.passed}/{data.total}</span>
                </div>
                {data.results.map(r => <TestRow key={r.criterion} r={r} />)}
              </div>
            )}

            {/* Pipeline diagram */}
            {activeTab === "pipeline" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline Oficial — 13 Estagios</p>
                  <div className="flex flex-col items-center gap-0">
                    {STAGES.map((s, i) => (
                      <React.Fragment key={s.stage}>
                        <div className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border w-72 ${s.color}`}>
                          <div className="flex items-center justify-between">
                            <span>{s.label}</span>
                            <span className="opacity-60 text-[10px]">{s.note}</span>
                          </div>
                        </div>
                        {i < STAGES.length - 1 && <div className="text-zinc-700 text-base leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div className="bg-violet-950/20 border border-violet-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-violet-300 mb-2">Integracao com Chat</p>
                  <p className="text-xs text-zinc-400">ChatPage.sendAndReceive() invoca o Adapter antes de runReasoningPlan(). O pipeline processa o Goal por todos os modulos certificados EF. A resposta LLM permanece gerenciada pelo runReasoningPlan() existente.</p>
                </div>
              </div>
            )}

            {/* Health */}
            {activeTab === "health" && (
              <div className="space-y-3">
                <div className={`rounded-xl border p-4 ${data.health.status === "SUCCESS" ? "bg-emerald-950/20 border-emerald-800" : "bg-red-950/20 border-red-800"}`}>
                  <Badge label={`HEALTH: ${data.health.status}`}
                    style={data.health.status === "SUCCESS" ? "bg-emerald-900/60 text-emerald-300 border-emerald-700" : "bg-red-900/60 text-red-300 border-red-700"} />
                  <p className="text-xs text-zinc-400 font-mono mt-2">{data.health.details}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Health Checks por Modulo</p>
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

            {/* Estatisticas */}
            {activeTab === "statistics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Execucoes"  value={data.statistics.executionTotal} color="text-violet-400" />
                  <Metric label="Sucesso"    value={data.statistics.successTotal}   color="text-emerald-400" />
                  <Metric label="Falhas"     value={data.statistics.failureTotal}   color="text-red-400" />
                  <Metric label="Taxa"       value={`${Math.round(data.statistics.successRate * 100)}%`} color="text-sky-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Avg Ms"  value={`${data.statistics.avgDurationMs}ms`} color="text-zinc-300" />
                  <Metric label="Min Ms"  value={`${data.statistics.minDurationMs}ms`} color="text-zinc-400" />
                  <Metric label="Max Ms"  value={`${data.statistics.maxDurationMs}ms`} color="text-zinc-400" />
                </div>
                {Object.keys(data.statistics.stageCounts).length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Stage Counts</p>
                    {Object.entries(data.statistics.stageCounts).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-300 font-mono">{k}</span>
                        <span className="text-zinc-400">{String(v)}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Metricas */}
            {activeTab === "metrics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Metric label="Total"   value={data.metrics.executionTotal} color="text-violet-400" />
                  <Metric label="Sucesso" value={data.metrics.successTotal}   color="text-emerald-400" />
                  <Metric label="Falhas"  value={data.metrics.failureTotal}   color="text-red-400" />
                  <Metric label="Avg Ms"  value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
                </div>
                {Object.keys(data.metrics.avgStageMs).length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Avg ms por Stage</p>
                    {Object.entries(data.metrics.avgStageMs).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                        <span className="text-zinc-300 font-mono w-44 shrink-0">{k}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-600 rounded-full" style={{ width: `${Math.min(100, (v / 50) * 100)}%` }} />
                        </div>
                        <span className="text-zinc-400 w-12 text-right">{v}ms</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TODOs */}
            {activeTab === "todos" && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs uppercase tracking-wider px-1">TODOs Tecnicos Registrados</p>
                {TODOS.map(t => (
                  <div key={t.id} className={`rounded-xl border p-4 ${t.severity === "high" ? "bg-amber-950/20 border-amber-800/50" : "bg-zinc-900/80 border-zinc-800"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${t.severity === "high" ? "bg-amber-900/50 text-amber-300 border-amber-700" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                        {t.id}
                      </span>
                      <span className="text-xs text-zinc-500">Sprint: {t.sprint}</span>
                    </div>
                    <p className="text-sm font-semibold text-zinc-200 mb-1">{t.title}</p>
                    <p className="text-xs text-zinc-400">{t.desc}</p>
                    <p className="text-xs text-zinc-600 font-mono mt-1">stage: {t.stage}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Cognitive Pipeline Adapter v1.0 — Sprint INT-01</p>
            <p className="text-zinc-600 text-xs">13 estagios · 10 modulos EF certificados · 3 TODOs documentados</p>
            <p className="text-zinc-700 text-xs mt-1">Conecta o produto ao Pipeline Cognitivo certificado via APIs publicas</p>
          </div>
        )}
      </div>
    </div>
  );
}