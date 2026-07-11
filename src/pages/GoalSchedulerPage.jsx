// Goal Scheduler v1.0 — Dashboard
// Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runGoalSchedulerTests } from "@/lib/goal-scheduler/goalSchedulerTests";

// ── UI Primitives ──────────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>
      {label}
    </span>
  );
}

function Metric({ label, value, color = "text-zinc-200", sub }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
      {sub && <div className="text-zinc-600 text-[10px] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  const isHardening = r.name.startsWith("[Hardening]");
  const hasExtra = r.detail || r.error;
  const passBadge = r.passed
    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
    : "bg-red-900/50 text-red-300 border-red-700";
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button
        onClick={() => hasExtra && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2.5 px-3 text-left"
      >
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

const STATUS_COLORS = {
  PENDING:     "text-violet-400",
  RESCHEDULED: "text-blue-400",
  CANCELLED:   "text-amber-400",
  DISPATCHED:  "text-emerald-400",
};

export default function GoalSchedulerPage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setData(null);
    setError(null);
    try {
      setData(await runGoalSchedulerTests());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-950/60 to-indigo-950/60 border border-cyan-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-cyan-400">Goal Scheduler v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Goal Temporal Management</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                GoalScheduler · GoalSchedule · Queue · Statistics · Health
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                14 criterios de aceitacao + 8 hardening = 22 cenarios
              </p>
            </div>
            <button
              onClick={handleRun}
              disabled={running}
              className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0"
            >
              {running ? "Executando..." : "Executar Goal Scheduler v1.0"}
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}                      color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed}         color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}                       color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}          color="text-cyan-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">GoalRuntime → RegistryService → Scheduler → Queue → Hardening...</p>
            <p className="text-zinc-600 text-xs mt-1">14 criterios + 8 hardening</p>
          </div>
        )}

        {/* Error */}
        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro durante execucao</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Verdict + tabs */}
        {data && !running && (
          <>
            <div className={`rounded-xl border-2 p-3 ${allPass ? "bg-emerald-950/30 border-emerald-700" : "bg-red-950/30 border-red-800"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  label={allPass ? "GOAL SCHEDULER v1.0 — PASS" : "GOAL SCHEDULER v1.0 — FAIL"}
                  style={allPass
                    ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    : "bg-red-900/60 text-red-300 border-red-700"}
                />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass
                    ? "Primeira camada de agendamento certificada."
                    : `${data.total - data.passed} criterio(s) reprovado(s).`}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  label={data.health.status}
                  style={data.health.status === "SUCCESS"
                    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                    : "bg-red-900/50 text-red-300 border-red-700"}
                />
                <span className="text-xs text-zinc-500 font-mono">{data.health.details}</span>
              </div>
              {!allPass && failedOnly.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {failedOnly.map(r => (
                    <p key={r.criterion} className="text-xs text-red-400 font-mono pl-2">
                      C{r.criterion}: {r.name}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === t.id ? "bg-cyan-700 text-white" : "text-zinc-400 hover:text-white"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Criterios */}
            {activeTab === "results" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">22 Cenarios (14 aceitacao + 8 hardening)</span>
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
                  <Metric label="Agendados"   value={data.statistics.scheduled}   color="text-cyan-400" />
                  <Metric label="Cancelados"  value={data.statistics.cancelled}   color="text-amber-400" />
                  <Metric label="Reagendados" value={data.statistics.rescheduled} color="text-blue-400" />
                  <Metric label="Despachados" value={data.statistics.dispatched}  color="text-emerald-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Fila Atual"  value={data.statistics.queueSize}    color="text-violet-400" />
                  <Metric label="Fila Max"    value={data.statistics.maxQueueSize} color="text-zinc-300" />
                  <Metric label="Avg Wait"    value={`${data.statistics.avgWaitMs}ms`} color="text-sky-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Status da Fila</p>
                  {["PENDING","RESCHEDULED","CANCELLED","DISPATCHED"].map(s => (
                    <div key={s} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono w-24 shrink-0 ${STATUS_COLORS[s] ?? "text-zinc-400"}`}>{s}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-600 rounded-full"
                          style={{
                            width: data.statistics.scheduled > 0
                              ? `${(({ PENDING: data.statistics.queueSize, RESCHEDULED: data.statistics.rescheduled, CANCELLED: data.statistics.cancelled, DISPATCHED: data.statistics.dispatched }[s] ?? 0) / data.statistics.scheduled) * 100}%`
                              : "0%"
                          }}
                        />
                      </div>
                      <span className="text-zinc-400 w-6 text-right">
                        {{ PENDING: data.statistics.queueSize, RESCHEDULED: data.statistics.rescheduled, CANCELLED: data.statistics.cancelled, DISPATCHED: data.statistics.dispatched }[s] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Health */}
            {activeTab === "health" && (
              <div className="space-y-3">
                <div className={`rounded-xl border p-4 ${data.health.status === "SUCCESS" ? "bg-emerald-950/20 border-emerald-800" : "bg-red-950/20 border-red-800"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      label={`HEALTH: ${data.health.status}`}
                      style={data.health.status === "SUCCESS"
                        ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                        : "bg-red-900/60 text-red-300 border-red-700"}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 font-mono">{data.health.details}</p>
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
                  <Metric label="Criados"    value={data.metrics.createdTotal}    color="text-cyan-400" />
                  <Metric label="Cancelados" value={data.metrics.cancelledTotal}  color="text-amber-400" />
                  <Metric label="Despachados" value={data.metrics.dispatchedTotal} color="text-emerald-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Avg Op"   value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
                  <Metric label="Fila Max" value={data.metrics.maxQueueSeen}          color="text-zinc-300" />
                  <Metric label="Fila Min" value={data.metrics.minQueueSeen}          color="text-zinc-400" />
                </div>
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === "arch" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Componentes — Scheduler v1.0</p>
                  {[
                    ["GoalScheduler",      "Administra quando um Goal sera executado"],
                    ["GoalSchedule",       "Objeto imutavel: scheduleId, goalId, scheduledAt, status, priority, attempts"],
                    ["GoalIndex (queue)",  "Fila ordenada: scheduledAt ASC + priority DESC (tiebreak)"],
                    ["GoalRuntime v0.1",   "Ciclo de vida individual — reutilizado"],
                    ["GoalRegistryService","Administracao global — reutilizado"],
                  ].map(([comp, desc]) => (
                    <div key={comp} className="flex items-start gap-3 text-xs">
                      <span className="text-cyan-300 font-mono w-44 shrink-0">{comp}</span>
                      <span className="text-zinc-600">{"→"}</span>
                      <span className="text-zinc-400">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {[
                    "Nao executa Goals",
                    "Nao cria planos",
                    "Nao interpreta intencao",
                    "Nao seleciona Capability",
                    "Nao executa Connector",
                    "Nao modifica Goal, GoalContext nem GoalResult",
                    "Apenas: registrar, cancelar, reagendar, consultar, ordenar fila",
                  ].map((inv, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className="text-emerald-400 shrink-0">{"→"}</span>{inv}
                    </div>
                  ))}
                </div>
                <div className="bg-cyan-950/20 border border-cyan-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-cyan-300 mb-2">Schedule Status Lifecycle</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    {["PENDING", "→", "RESCHEDULED", "→", "DISPATCHED"].map((s, i) => (
                      <span key={i} className={s === "→" ? "text-zinc-600" : "bg-zinc-800 text-cyan-300 px-2 py-0.5 rounded border border-cyan-900"}>{s}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono mt-2">
                    <span className="text-zinc-600">PENDING/RESCHEDULED →</span>
                    <span className="bg-zinc-800 text-amber-300 px-2 py-0.5 rounded border border-amber-900">CANCELLED</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Pre-run */}
        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Goal Scheduler v1.0 — Temporal Management</p>
            <p className="text-zinc-600 text-xs">GoalScheduler · GoalSchedule · Queue · Statistics · Health</p>
            <p className="text-zinc-700 text-xs mt-1">Reutiliza Goal Runtime v0.1 + Goal Registry Service v1.0</p>
          </div>
        )}
      </div>
    </div>
  );
}