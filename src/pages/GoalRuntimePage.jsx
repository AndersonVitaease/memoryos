// Goal Runtime v0.1 — Validation Dashboard
// Foundation v1.0 · Engineering First · Sprint Goal Runtime v0.1

import React, { useState, useCallback } from "react";
import { runGoalRuntimeTests } from "@/lib/goal-runtime-v01/goalRuntimeTests";

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
      {sub && <div className="text-zinc-600 text-[10px] mt-0.5">{sub}</div>}
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

// ── Inner tabs ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "results",  label: "Criterios"   },
  { id: "metrics",  label: "Metricas"    },
  { id: "logs",     label: "Logs"        },
  { id: "arch",     label: "Arquitetura" },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GoalRuntimePage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setData(null);
    setError(null);
    try {
      setData(await runGoalRuntimeTests());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-950/60 to-violet-950/60 border border-blue-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-blue-400">Goal Runtime v0.1</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Goal Lifecycle Foundation</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                GoalRuntime · GoalRegistry · GoalContext · GoalResult · GoalStatus
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                14 criterios de aceitacao + 7 hardening = 21 cenarios
              </p>
            </div>
            <button
              onClick={handleRun}
              disabled={running}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0"
            >
              {running ? "Executando..." : "Executar Goal Runtime v0.1"}
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"    value={data.passed}                         color="text-emerald-400" />
              <Metric label="Fail"    value={data.total - data.passed}            color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total"   value={data.total}                          color="text-zinc-200" />
              <Metric label="Tempo"   value={`${data.durationMs}ms`}             color="text-blue-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">GoalRuntime → Registry → Context → Lifecycle → Hardening...</p>
            <p className="text-zinc-600 text-xs mt-1">14 criterios + 7 hardening</p>
          </div>
        )}

        {/* Error */}
        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro durante execucao</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Verdict */}
        {data && !running && (
          <>
            <div className={`rounded-xl border-2 p-3 ${allPass ? "bg-emerald-950/30 border-emerald-700" : "bg-red-950/30 border-red-800"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  label={allPass ? "GOAL RUNTIME v0.1 — PASS" : "GOAL RUNTIME v0.1 — FAIL"}
                  style={allPass
                    ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    : "bg-red-900/60 text-red-300 border-red-700"}
                />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass
                    ? "Primeiro componente cognitivo certificado."
                    : `${data.total - data.passed} criterio(s) reprovado(s).`}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  label={data.healthCheck.status}
                  style={data.healthCheck.status === "SUCCESS"
                    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                    : "bg-red-900/50 text-red-300 border-red-700"}
                />
                <span className="text-xs text-zinc-500 font-mono">{data.healthCheck.details}</span>
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

            {/* Inner tab bar */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === t.id ? "bg-blue-700 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Criterios */}
            {activeTab === "results" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">
                    21 Cenarios (14 aceitacao + 7 hardening)
                  </span>
                  <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                    {data.passed}/{data.total}
                  </span>
                </div>
                {data.results.map(r => <TestRow key={r.criterion} r={r} />)}
              </div>
            )}

            {/* Metricas */}
            {activeTab === "metrics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Metric label="Goals Criados"    value={data.metrics.created}        color="text-blue-400" />
                  <Metric label="Goals Ativos"     value={data.metrics.active}         color="text-violet-400" />
                  <Metric label="Goals Concluidos" value={data.metrics.completed}      color="text-emerald-400" />
                  <Metric label="Goals Cancelados" value={data.metrics.cancelled}      color="text-amber-400" />
                  <Metric label="Goals Invalidos"  value={data.metrics.invalid}        color="text-red-400" />
                  <Metric label="Goals Falhos"     value={data.metrics.failed}         color="text-red-500" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Avg Duration" value={`${data.metrics.avgDurationMs}ms`}   color="text-sky-400" />
                  <Metric label="Total Exec"   value={data.metrics.executionCount}          color="text-zinc-300" />
                  <Metric label="Total Time"   value={`${data.metrics.totalDurationMs}ms`} color="text-zinc-400" />
                </div>
              </div>
            )}

            {/* Logs */}
            {activeTab === "logs" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">
                    Logs (apenas criterios com detail)
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {data.results.filter(r => r.detail || r.error).map(r => (
                    <div key={r.criterion} className="border-b border-zinc-800 last:border-0 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          label={r.passed ? "PASS" : "FAIL"}
                          style={r.passed
                            ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                            : "bg-red-900/50 text-red-300 border-red-700"}
                        />
                        <span className="text-zinc-500 font-mono">C{r.criterion}</span>
                        <span className="text-zinc-600 font-mono">{r.durationMs}ms</span>
                      </div>
                      {r.detail && <p className="text-zinc-400 pl-1">{r.detail}</p>}
                      {r.error  && <p className="text-red-400 font-mono pl-1">error: {r.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === "arch" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Componentes — Goal Runtime v0.1</p>
                  {[
                    ["GoalRuntime",  "Administra ciclo de vida completo de Goals"],
                    ["GoalRegistry", "Registra, localiza, impede duplicidade"],
                    ["Goal",        "Implementa contrato IGoal — ciclo de vida isolado"],
                    ["GoalContext",  "Estado imutavel por execucao — sem compartilhamento"],
                    ["GoalResult",  "Resultado padronizado — success, status, logs"],
                    ["GoalStatus",  "CREATED → VALIDATED → ACTIVE → COMPLETED/FAILED/CANCELLED"],
                  ].map(([comp, desc]) => (
                    <div key={comp} className="flex items-center gap-3 text-xs">
                      <span className="text-blue-300 font-mono w-32 shrink-0">{comp}</span>
                      <span className="text-zinc-600">{"→"}</span>
                      <span className="text-zinc-400">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Principio de Responsabilidade</p>
                  {[
                    "Nao interpreta intencao",
                    "Nao escolhe Capabilities",
                    "Nao cria planos",
                    "Nao consulta Connectors",
                    "Nao executa inferencias",
                    "Nao executa IA",
                    "Ciclo de vida: criar, validar, registrar, atualizar, concluir, cancelar",
                  ].map((inv, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className="text-emerald-400 shrink-0">{"→"}</span>{inv}
                    </div>
                  ))}
                </div>
                <div className="bg-blue-950/20 border border-blue-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-300 mb-2">Status Lifecycle</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    {["CREATED", "→", "VALIDATED", "→", "ACTIVE", "→", "COMPLETED"].map((s, i) => (
                      <span key={i} className={s === "→" ? "text-zinc-600" : "bg-zinc-800 text-blue-300 px-2 py-0.5 rounded border border-blue-900"}>{s}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono mt-2">
                    <span className="text-zinc-600">ACTIVE →</span>
                    <span className="bg-zinc-800 text-amber-300 px-2 py-0.5 rounded border border-amber-900">CANCELLED</span>
                    <span className="text-zinc-600">| any →</span>
                    <span className="bg-zinc-800 text-red-300 px-2 py-0.5 rounded border border-red-900">FAILED</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Pre-run */}
        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Goal Runtime v0.1 — Goal Lifecycle Foundation</p>
            <p className="text-zinc-600 text-xs">Primeiro componente cognitivo do MemoryOS</p>
            <p className="text-zinc-700 text-xs mt-1">GoalRuntime · GoalRegistry · GoalContext · GoalResult · GoalStatus</p>
          </div>
        )}

      </div>
    </div>
  );
}