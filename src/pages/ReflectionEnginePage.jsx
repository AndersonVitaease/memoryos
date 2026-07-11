// Reflection Engine v1.0 — Dashboard
// Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runReflectionEngineTests } from "@/lib/reflection-engine/reflectionEngineTests";

// ── UI Primitives ─────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "results",    label: "Criterios"   },
  { id: "statistics", label: "Estatisticas"},
  { id: "health",     label: "Health"      },
  { id: "metrics",    label: "Metricas"    },
  { id: "arch",       label: "Arquitetura" },
];

const ARCH_NODES = [
  ["Goal Runtime v0.1",          "bg-blue-900/60 text-blue-300 border-blue-700"],
  ["Decision Engine v1.0",       "bg-amber-900/60 text-amber-300 border-amber-700"],
  ["Planning Engine v1.0",       "bg-orange-900/60 text-orange-300 border-orange-700"],
  ["Execution Dispatcher v1.0",  "bg-emerald-900/60 text-emerald-300 border-emerald-700"],
  ["Execution Result",           "bg-zinc-700 text-zinc-200 border-zinc-600"],
  ["Reflection Engine v1.0",     "bg-rose-900/60 text-rose-300 border-rose-700"],
  ["Self Evaluation Engine",     "bg-zinc-800 text-zinc-400 border-zinc-700"],
];

const CONF_COLORS   = { HIGH: "text-emerald-400", MEDIUM: "text-yellow-400", LOW: "text-red-400" };
const RISK_COLORS   = { LOW: "text-emerald-400", MEDIUM: "text-yellow-400", HIGH: "text-orange-400", CRITICAL: "text-red-400" };
const STATUS_COLORS = { GENERATED: "text-emerald-400", INVALIDATED: "text-amber-400", ARCHIVED: "text-zinc-400" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReflectionEnginePage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runReflectionEngineTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-rose-950/60 to-pink-950/40 border border-rose-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-rose-400">Reflection Engine v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">ExecutionResult → Reflection</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                reflect · invalidate · archive · confidence · riskLevel · MDS v1.7 forward-compat
              </p>
              <p className="text-zinc-500 text-xs mt-1">16 criterios + 8 hardening = 24 cenarios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar Reflection Engine v1.0"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}                    color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed}       color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}                     color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}        color="text-rose-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-rose-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">GoalRuntime → DecisionEngine → PlanningEngine → ReflectionEngine → Hardening...</p>
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
                  label={allPass ? "REFLECTION ENGINE v1.0 — PASS" : "REFLECTION ENGINE v1.0 — FAIL"}
                  style={allPass
                    ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    : "bg-red-900/60 text-red-300 border-red-700"}
                />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass ? "Reflection Engine certificado." : `${data.total - data.passed} criterio(s) reprovado(s).`}
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
                    activeTab === t.id ? "bg-rose-700 text-white" : "text-zinc-400 hover:text-white"}`}>
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
                  <Metric label="Geradas"     value={data.statistics.totalGenerated}   color="text-rose-400" />
                  <Metric label="Invalidadas" value={data.statistics.totalInvalidated} color="text-amber-400" />
                  <Metric label="Arquivadas"  value={data.statistics.totalArchived}    color="text-zinc-400" />
                  <Metric label="Avg Duration" value={`${data.statistics.avgExecutionDuration}ms`} color="text-sky-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Avg Confidence" value={data.statistics.avgConfidenceScore.toFixed(3)} color="text-emerald-400" />
                  <Metric label="Avg Risk"        value={data.statistics.avgRiskScore.toFixed(3)}      color="text-orange-400" />
                </div>

                {/* Confidence breakdown */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Confidence Breakdown</p>
                  {Object.entries(data.statistics.confidenceBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono w-16 shrink-0 ${CONF_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-600 rounded-full"
                          style={{ width: data.statistics.totalGenerated > 0 ? `${(v / data.statistics.totalGenerated) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-zinc-400 w-5 text-right">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Risk breakdown */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Risk Breakdown</p>
                  {Object.entries(data.statistics.riskBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono w-16 shrink-0 ${RISK_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-600 rounded-full"
                          style={{ width: data.statistics.totalGenerated > 0 ? `${(v / data.statistics.totalGenerated) * 100}%` : "0%" }} />
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
                <Metric label="Geradas"     value={data.metrics.generateTotal}   color="text-rose-400" />
                <Metric label="Invalidadas" value={data.metrics.invalidateTotal} color="text-amber-400" />
                <Metric label="Arquivadas"  value={data.metrics.archiveTotal}    color="text-zinc-400" />
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
                        <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-60 text-center ${cls} ${label.includes("Reflection Engine") ? "ring-2 ring-rose-500" : ""}`}>
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Score legend */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider">Confidence Classification</p>
                  {[["HIGH","≥ 0.75","text-emerald-400"],["MEDIUM","0.45 – 0.74","text-yellow-400"],["LOW","< 0.45","text-red-400"]].map(([c, d, col]) => (
                    <div key={c} className="flex items-center gap-3 text-xs">
                      <span className={`font-mono font-bold w-16 shrink-0 ${col}`}>{c}</span>
                      <span className="text-zinc-400">{d}</span>
                    </div>
                  ))}
                  <p className="text-zinc-400 text-xs uppercase tracking-wider pt-2">Risk Classification</p>
                  {[["LOW","< 0.25","text-emerald-400"],["MEDIUM","0.25 – 0.49","text-yellow-400"],["HIGH","0.50 – 0.74","text-orange-400"],["CRITICAL","≥ 0.75","text-red-400"]].map(([c, d, col]) => (
                    <div key={c} className="flex items-center gap-3 text-xs">
                      <span className={`font-mono font-bold w-16 shrink-0 ${col}`}>{c}</span>
                      <span className="text-zinc-400">{d}</span>
                    </div>
                  ))}
                </div>

                {/* MDS v1.7 compat */}
                <div className="bg-rose-950/20 border border-rose-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-rose-300 mb-2">MDS v1.7 Forward-Compatibility Fields</p>
                  <div className="grid grid-cols-2 gap-1">
                    {["requiredCapabilities","usedCapabilities","usedConnectors","dependencyGraph","preconditionsSatisfied","postconditionsSatisfied","retryCount","rollbackExecuted","performanceScore","qualityScore","reliabilityScore","improvementPriority"].map(f => (
                      <span key={f} className="text-xs text-zinc-500 font-mono bg-zinc-800/60 px-2 py-0.5 rounded">{f}</span>
                    ))}
                  </div>
                </div>

                {/* SRP */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {[
                    ["✓","text-emerald-400","Analisa ExecutionResult e produz Reflection imutavel"],
                    ["✓","text-emerald-400","Calcula confidence (LOW/MEDIUM/HIGH)"],
                    ["✓","text-emerald-400","Calcula riskLevel (LOW/MEDIUM/HIGH/CRITICAL)"],
                    ["✓","text-emerald-400","Extrai successes, failures, warnings, lessons, improvements"],
                    ["✓","text-emerald-400","Suporta campos MDS v1.7 para evolucao futura"],
                    ["✗","text-red-400","NAO executa Goals"],
                    ["✗","text-red-400","NAO modifica Goals, DecisionResult ou ExecutionPlan"],
                    ["✗","text-red-400","NAO conversa com LLM"],
                    ["✗","text-red-400","NAO agenda nem despacha"],
                    ["✗","text-red-400","NAO decide nem planeja"],
                  ].map(([icon, col, text], i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className={`shrink-0 ${col}`}>{icon}</span>{text}
                    </div>
                  ))}
                </div>

                {/* Status lifecycle */}
                <div className="bg-rose-950/20 border border-rose-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-rose-300 mb-2">Reflection Status Lifecycle</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    {["GENERATED","→","INVALIDATED"].map((s, i) => (
                      <span key={i} className={s === "→" ? "text-zinc-600" : "bg-zinc-800 text-rose-300 px-2 py-0.5 rounded border border-rose-900"}>{s}</span>
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
            <p className="text-zinc-400 text-sm font-medium mb-1">Reflection Engine v1.0 — ExecutionResult → Reflection</p>
            <p className="text-zinc-600 text-xs">reflect · invalidate · archive · confidence · riskLevel</p>
            <p className="text-zinc-700 text-xs mt-1">Reutiliza GoalRuntime + DecisionEngine + PlanningEngine · MDS v1.7 forward-compat</p>
          </div>
        )}
      </div>
    </div>
  );
}