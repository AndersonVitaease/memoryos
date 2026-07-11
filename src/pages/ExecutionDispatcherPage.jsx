// Execution Dispatcher v1.0 — Dashboard
// Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runExecutionDispatcherTests } from "@/lib/execution-dispatcher/executionDispatcherTests";

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

export default function ExecutionDispatcherPage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runExecutionDispatcherTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-emerald-400">Execution Dispatcher v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Scheduler → Queue Bridge</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                ExecutionDispatcher · dispatch · dispatchReadyGoals · cancelDispatch
              </p>
              <p className="text-zinc-500 text-xs mt-1">16 criterios + 8 hardening = 24 cenarios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar Dispatcher v1.0"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}                    color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed}       color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}                     color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}        color="text-emerald-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">GoalRuntime → Registry → Scheduler → Dispatcher → Queue → Hardening...</p>
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
                  label={allPass ? "EXECUTION DISPATCHER v1.0 — PASS" : "EXECUTION DISPATCHER v1.0 — FAIL"}
                  style={allPass
                    ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    : "bg-red-900/60 text-red-300 border-red-700"}
                />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass ? "Dispatcher certificado." : `${data.total - data.passed} criterio(s) reprovado(s).`}
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
                    activeTab === t.id ? "bg-emerald-700 text-white" : "text-zinc-400 hover:text-white"}`}>
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
                  <Metric label="Despachados"  value={data.statistics.dispatchTotal}   color="text-emerald-400" />
                  <Metric label="Cancelados"   value={data.statistics.cancelledTotal}  color="text-amber-400" />
                  <Metric label="Falhos"       value={data.statistics.failedTotal}     color="text-red-400" />
                  <Metric label="Queue Disp."  value={data.statistics.queueDispatches} color="text-cyan-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Avg Dispatch" value={`${data.statistics.avgDispatchTime}ms`} color="text-sky-400" />
                  <Metric label="Max Rate"     value={data.statistics.maxDispatchRate}         color="text-zinc-300" />
                  <Metric label="Min Rate"     value={data.statistics.minDispatchRate}         color="text-zinc-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Status das Entradas</p>
                  {["DISPATCHED","CANCELLED","FAILED","PENDING"].map(s => {
                    const count = { DISPATCHED: data.statistics.dispatchTotal - data.statistics.cancelledTotal - data.statistics.failedTotal, CANCELLED: data.statistics.cancelledTotal, FAILED: data.statistics.failedTotal, PENDING: 0 }[s] ?? 0;
                    const col   = { DISPATCHED: "text-emerald-400", CANCELLED: "text-amber-400", FAILED: "text-red-400", PENDING: "text-violet-400" }[s];
                    return (
                      <div key={s} className="flex items-center gap-3 text-xs mb-1.5">
                        <span className={`font-mono w-24 shrink-0 ${col}`}>{s}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-600 rounded-full"
                            style={{ width: data.statistics.dispatchTotal > 0 ? `${Math.max(0, count / data.statistics.dispatchTotal) * 100}%` : "0%" }} />
                        </div>
                        <span className="text-zinc-400 w-6 text-right">{Math.max(0, count)}</span>
                      </div>
                    );
                  })}
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
                      <span className={`w-3 h-3 rounded-full shrink-0 ${v === true ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="text-zinc-300 font-mono flex-1">{k}</span>
                      <span className={`font-bold ${v === true ? "text-emerald-400" : "text-red-400"}`}>
                        {typeof v === "boolean" ? (v ? "OK" : "FAIL") : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metricas */}
            {activeTab === "metrics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Total Disp."  value={data.metrics.dispatchTotal}   color="text-emerald-400" />
                  <Metric label="Cancelados"   value={data.metrics.cancelledTotal}  color="text-amber-400" />
                  <Metric label="Falhos"       value={data.metrics.failedTotal}     color="text-red-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Avg Op"    value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
                  <Metric label="Max Rate"  value={data.metrics.maxDispatchRate}       color="text-zinc-300" />
                  <Metric label="Min Rate"  value={data.metrics.minDispatchRate}       color="text-zinc-400" />
                </div>
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === "arch" && (
              <div className="space-y-3">
                {/* Flow diagram */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Fluxo de Arquitetura</p>
                  <div className="flex flex-col items-center gap-0">
                    {[
                      ["Goal Runtime v0.1",          "bg-blue-900/60 text-blue-300 border-blue-700"],
                      ["Goal Registry Service v1.0", "bg-indigo-900/60 text-indigo-300 border-indigo-700"],
                      ["Goal Scheduler v1.0",        "bg-cyan-900/60 text-cyan-300 border-cyan-700"],
                      ["Execution Dispatcher v1.0",  "bg-emerald-900/60 text-emerald-300 border-emerald-700"],
                      ["Goal Execution Queue v1.0",  "bg-violet-900/60 text-violet-300 border-violet-700"],
                      ["Capability Runtime",          "bg-zinc-800 text-zinc-400 border-zinc-700"],
                    ].map(([label, cls], i, arr) => (
                      <React.Fragment key={label}>
                        <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-56 text-center ${cls} ${label.includes("Dispatcher") ? "ring-2 ring-emerald-500" : ""}`}>
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Components */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Componentes</p>
                  {[
                    ["ExecutionDispatcher", "Coordena transicao Scheduler → Queue"],
                    ["DispatchEntry",       "Objeto imutavel: dispatchId, goalId, queueId, scheduledAt, dispatchTime, status, attempts"],
                    ["dispatch(goalId)",    "Despacha um Goal especifico para a Queue"],
                    ["dispatchReadyGoals()","Despacha todos os Goals prontos do Scheduler"],
                    ["cancelDispatch(id)",  "Cancela um despacho pendente"],
                  ].map(([comp, desc]) => (
                    <div key={comp} className="flex items-start gap-3 text-xs">
                      <span className="text-emerald-300 font-mono w-44 shrink-0">{comp}</span>
                      <span className="text-zinc-600">{"→"}</span>
                      <span className="text-zinc-400">{desc}</span>
                    </div>
                  ))}
                </div>

                {/* SRP */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {[
                    "Nao executa Goals",
                    "Nao interpreta intencao",
                    "Nao cria planos",
                    "Nao executa Capability",
                    "Nao executa Connector",
                    "Nao modifica Goal",
                    "Nao modifica GoalContext",
                    "Nao modifica GoalResult",
                    "Apenas despacha Goals do Scheduler para a Execution Queue",
                  ].map((inv, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className={`shrink-0 ${i === 8 ? "text-emerald-400" : "text-red-400"}`}>{i === 8 ? "✓" : "✗"}</span>
                      {inv}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Execution Dispatcher v1.0 — Scheduler → Queue Bridge</p>
            <p className="text-zinc-600 text-xs">dispatch · dispatchReadyGoals · cancelDispatch · Health · Statistics</p>
            <p className="text-zinc-700 text-xs mt-1">Reutiliza Goal Runtime + Registry Service + Scheduler + Queue</p>
          </div>
        )}
      </div>
    </div>
  );
}