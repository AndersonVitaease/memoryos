// Planning Engine v1.0 — Dashboard
// Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runPlanningEngineTests } from "@/lib/planning-engine/planningEngineTests";

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
  ["Goal Runtime v0.1",          "bg-blue-900/60 text-blue-300 border-blue-700"],
  ["Goal Registry Service v1.0", "bg-indigo-900/60 text-indigo-300 border-indigo-700"],
  ["Goal Scheduler v1.0",        "bg-cyan-900/60 text-cyan-300 border-cyan-700"],
  ["Execution Dispatcher v1.0",  "bg-emerald-900/60 text-emerald-300 border-emerald-700"],
  ["Goal Execution Queue v1.0",  "bg-violet-900/60 text-violet-300 border-violet-700"],
  ["Decision Engine v1.0",       "bg-amber-900/60 text-amber-300 border-amber-700"],
  ["Planning Engine v1.0",       "bg-orange-900/60 text-orange-300 border-orange-700"],
  ["Capability Runtime",         "bg-zinc-800 text-zinc-400 border-zinc-700"],
];

const COMPLEXITY_COLORS = {
  LOW:      "text-emerald-400",
  MEDIUM:   "text-yellow-400",
  HIGH:     "text-orange-400",
  CRITICAL: "text-red-400",
};

const STEP_TYPE_MS = {
  CAPABILITY: 300, VALIDATION: 100, DECISION: 150,
  NOTIFICATION: 50, CONDITION: 80, FALLBACK: 200,
};

export default function PlanningEnginePage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runPlanningEngineTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-950/60 to-amber-950/40 border border-orange-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-orange-400">Planning Engine v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Goal → Execution Plan</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                plan · validate · invalidate · cancel · Complexity · Steps · estimatedMs
              </p>
              <p className="text-zinc-500 text-xs mt-1">16 criterios + 8 hardening = 24 cenarios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar Planning Engine v1.0"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}                    color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed}       color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}                     color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}        color="text-orange-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">GoalRuntime → Registry → Scheduler → Queue → Decision → PlanningEngine → Hardening...</p>
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
                  label={allPass ? "PLANNING ENGINE v1.0 — PASS" : "PLANNING ENGINE v1.0 — FAIL"}
                  style={allPass
                    ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    : "bg-red-900/60 text-red-300 border-red-700"}
                />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass ? "Planning Engine certificado." : `${data.total - data.passed} criterio(s) reprovado(s).`}
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
                    activeTab === t.id ? "bg-orange-700 text-white" : "text-zinc-400 hover:text-white"}`}>
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
                  <Metric label="Planejados"   value={data.statistics.totalPlanned}     color="text-orange-400" />
                  <Metric label="Invalidados"  value={data.statistics.totalInvalidated} color="text-amber-400" />
                  <Metric label="Cancelados"   value={data.statistics.totalCancelled}   color="text-red-400" />
                  <Metric label="Avg Steps"    value={data.statistics.averageSteps}     color="text-sky-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Avg Estimated" value={`${data.statistics.averageEstimatedMs}ms`} color="text-violet-400" />
                  <Metric label="Plan Rate"     value={data.statistics.planRate}                   color="text-zinc-300" />
                </div>
                {/* Complexity breakdown */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Complexity Breakdown</p>
                  {Object.entries(data.statistics.complexityBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono w-20 shrink-0 ${COMPLEXITY_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-600 rounded-full"
                          style={{ width: data.statistics.totalPlanned > 0 ? `${(v / data.statistics.totalPlanned) * 100}%` : "0%" }} />
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
                <Metric label="Planes"       value={data.metrics.planTotal}       color="text-orange-400" />
                <Metric label="Validados"    value={data.metrics.validateTotal}   color="text-emerald-400" />
                <Metric label="Invalidados"  value={data.metrics.invalidateTotal} color="text-amber-400" />
                <Metric label="Cancelados"   value={data.metrics.cancelTotal}     color="text-red-400" />
                <Metric label="Avg Op"       value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
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
                        <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-56 text-center ${cls} ${label.includes("Planning Engine") ? "ring-2 ring-orange-500" : ""}`}>
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Step types */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Step Types & Cost</p>
                  {Object.entries(STEP_TYPE_MS).map(([type, ms]) => (
                    <div key={type} className="flex items-center gap-3 text-xs">
                      <span className="text-orange-300 font-mono w-28 shrink-0">{type}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-600 rounded-full" style={{ width: `${(ms / 300) * 100}%` }} />
                      </div>
                      <span className="text-zinc-400 w-12 text-right font-mono">{ms}ms</span>
                    </div>
                  ))}
                </div>

                {/* Complexity thresholds */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Complexity Thresholds</p>
                  {[["LOW","≤ 2 steps"],["MEDIUM","3–5 steps"],["HIGH","6–8 steps"],["CRITICAL","> 8 steps"]].map(([c, desc]) => (
                    <div key={c} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-20 shrink-0 ${COMPLEXITY_COLORS[c]}`}>{c}</span>
                      <span className="text-zinc-400">{desc}</span>
                    </div>
                  ))}
                </div>

                {/* SRP */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {[
                    ["✓", "text-emerald-400", "Transforma Goal em Execution Plan estruturado"],
                    ["✓", "text-emerald-400", "Calcula complexity e estimatedMs"],
                    ["✓", "text-emerald-400", "Gera steps por tipo com metadata imutavel"],
                    ["✓", "text-emerald-400", "Valida, invalida e cancela planos"],
                    ["✗", "text-red-400",     "Nao executa Goals"],
                    ["✗", "text-red-400",     "Nao interpreta intencao"],
                    ["✗", "text-red-400",     "Nao conversa com LLM"],
                    ["✗", "text-red-400",     "Nao executa Capabilities"],
                    ["✗", "text-red-400",     "Nao executa Connectors"],
                    ["✗", "text-red-400",     "Nao agenda nem despacha Goals"],
                    ["✗", "text-red-400",     "Nao modifica Goal, GoalContext nem GoalResult"],
                  ].map(([icon, col, text], i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className={`shrink-0 ${col}`}>{icon}</span>{text}
                    </div>
                  ))}
                </div>

                {/* Plan status lifecycle */}
                <div className="bg-orange-950/20 border border-orange-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-orange-300 mb-2">Plan Status Lifecycle</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    {["DRAFT","→","READY","→","INVALIDATED"].map((s, i) => (
                      <span key={i} className={s === "→" ? "text-zinc-600" : "bg-zinc-800 text-orange-300 px-2 py-0.5 rounded border border-orange-900"}>{s}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono mt-2">
                    <span className="text-zinc-600">any →</span>
                    <span className="bg-zinc-800 text-red-300 px-2 py-0.5 rounded border border-red-900">CANCELLED</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Planning Engine v1.0 — Goal → Execution Plan</p>
            <p className="text-zinc-600 text-xs">plan · validate · invalidate · cancel · Complexity · Steps · estimatedMs</p>
            <p className="text-zinc-700 text-xs mt-1">Reutiliza GoalRuntime + Registry + Scheduler + Queue + Dispatcher + Decision Engine</p>
          </div>
        )}
      </div>
    </div>
  );
}