// FKM-2 Sprint Panel — Foundation Knowledge API Validation Interface
// Foundation v1.0 · Engineering First · Sprint FKM-2
// Responsabilidade UNICA: exibir resultados de runFKMTests()

import React, { useState, useCallback } from "react";
import { runFKMTests } from "@/lib/fce/fkmTests";
import { FoundationKnowledgeAPI } from "@/lib/fce/FoundationKnowledgeAPI";

// ── UI Primitives (locais — sem duplicar os de FCESprintPage) ─────────────────

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

// ── Test Row ──────────────────────────────────────────────────────────────────

function FKMTestRow({ r }) {
  const [open, setOpen] = useState(false);
  const isHardening = r.name.startsWith("[Hardening]");
  const hasExtra = r.detail || r.observation || r.error;
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
          {r.detail      && <p className="text-xs text-zinc-400">{r.detail}</p>}
          {r.observation && <p className="text-xs text-yellow-400/80 italic">obs: {r.observation}</p>}
          {r.error       && <p className="text-xs text-red-400 font-mono">error: {r.error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Inner Tabs ────────────────────────────────────────────────────────────────

const INNER_TABS = [
  { id: "results",  label: "Criterios" },
  { id: "metrics",  label: "Metricas" },
  { id: "logs",     label: "Logs" },
  { id: "arch",     label: "Arquitetura" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function FKMSprintPanel() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [stats, setStats]         = useState(null);
  const [logs, setLogs]           = useState([]);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setData(null);
    setStats(null);
    setLogs([]);
    setError(null);
    try {
      const result = await runFKMTests();
      setData(result);
      // Collect post-run metrics and logs from the API
      try {
        const statsResult = await FoundationKnowledgeAPI.statistics();
        setStats(statsResult.data);
      } catch { /* hardening: stats failure never breaks UI */ }
      try {
        setLogs(FoundationKnowledgeAPI.getLogs());
      } catch { /* hardening: logs failure never breaks UI */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-violet-950/50 to-indigo-950/50 border border-violet-800/40 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex flex-wrap gap-2 mb-1 text-xs font-mono">
              <span className="text-violet-400">FKM-2 — Reusability Validation</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">Foundation v1.0</span>
              <span className="text-zinc-600">·</span>
              <span className="text-emerald-400">Engineering First</span>
            </div>
            <p className="text-white font-semibold text-sm">Foundation Knowledge API — Validation Interface</p>
            <p className="text-zinc-400 text-xs mt-0.5">
              FoundationKnowledgeAPI · 5 consumers · 12 criterios + 4 hardening
            </p>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            {running ? "Executando..." : "Executar FKM-2"}
          </button>
        </div>

        {data && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Metric label="Pass"     value={data.passed}                             color="text-emerald-400" />
            <Metric label="Fail"     value={data.total - data.passed}               color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
            <Metric label="Total"    value={data.total}                              color="text-zinc-200" />
            <Metric label="Tempo"    value={`${data.durationMs}ms`}                 color="text-violet-400" />
          </div>
        )}
      </div>

      {/* ── Running ── */}
      {running && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">KnowledgeModel {"→"} API {"→"} 5 consumers {"→"} validando...</p>
          <p className="text-zinc-600 text-xs mt-1">12 criterios de aceitacao + 4 hardening</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !running && (
        <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
          <p className="text-red-300 text-sm font-bold mb-1">Erro durante execucao</p>
          <p className="text-red-400 text-xs font-mono">{error}</p>
        </div>
      )}

      {/* ── Verdict ── */}
      {data && !running && (
        <div className={`rounded-xl border-2 p-3 ${allPass ? "bg-emerald-950/30 border-emerald-700" : "bg-red-950/30 border-red-800"}`}>
          <div className="flex items-center gap-3">
            <Badge
              label={allPass ? "FKM-2 PASS" : "FKM-2 FAIL"}
              style={allPass
                ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                : "bg-red-900/60 text-red-300 border-red-700"}
            />
            <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
              {allPass
                ? "Foundation Knowledge API certificada."
                : `${data.total - data.passed} criterio(s) reprovado(s).`}
            </p>
          </div>
          {!allPass && failedOnly.length > 0 && (
            <div className="mt-2 space-y-1">
              {failedOnly.map(r => (
                <p key={r.criterion} className="text-xs text-red-400 font-mono pl-2">
                  C{r.criterion}: {r.name}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Inner Tabs ── */}
      {data && (
        <>
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {INNER_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Criterios ── */}
          {activeTab === "results" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200">
                  16 Criterios (12 aceitacao + 4 hardening)
                </span>
                <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                  {data.passed}/{data.total}
                </span>
              </div>
              {data.results.map(r => <FKMTestRow key={r.criterion} r={r} />)}
            </div>
          )}

          {/* ── Metricas ── */}
          {activeTab === "metrics" && (
            <div className="space-y-3">
              {stats ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Metric label="Total Queries"       value={stats.queryStats.totalQueries}       color="text-violet-400" />
                    <Metric label="Cache Hits"          value={stats.queryStats.cacheHits}          color="text-emerald-400" />
                    <Metric label="Cache Misses"        value={stats.queryStats.cacheMisses}        color="text-amber-400" />
                    <Metric label="Avg Time"            value={`${stats.queryStats.avgExecutionTimeMs}ms`} color="text-sky-400" />
                    <Metric label="Atoms Returned"      value={stats.queryStats.totalAtomsReturned} color="text-indigo-400" />
                    <Metric label="Docs Consultados"    value={stats.totalDocuments}               color="text-zinc-300" />
                  </div>
                  {Object.keys(stats.queryStats.queriesByType ?? {}).length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Queries por Tipo</p>
                      <div className="space-y-1">
                        {Object.entries(stats.queryStats.queriesByType).map(([type, count]) => (
                          <div key={type} className="flex items-center justify-between text-xs">
                            <span className="text-violet-300 font-mono">{type}</span>
                            <span className="text-zinc-400">{String(count)} queries</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                  <p className="text-zinc-500 text-xs">Metricas nao disponiveis</p>
                </div>
              )}
            </div>
          )}

          {/* ── Logs ── */}
          {activeTab === "logs" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200">API Query Logs ({logs.length})</span>
                <span className="text-zinc-600 text-xs font-mono">queryId · type · time · cache · results</span>
              </div>
              {logs.length === 0 ? (
                <p className="text-zinc-600 text-xs p-4 text-center italic">Nenhum log registrado</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {logs.map((log, i) => (
                    <div key={i} className="border-b border-zinc-800 last:border-0 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          label={log.cacheHit ? "HIT" : "MISS"}
                          style={log.cacheHit
                            ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                            : "bg-amber-900/50 text-amber-300 border-amber-700"}
                        />
                        <span className="text-violet-300 font-mono shrink-0">{log.queryType}</span>
                        <span className="text-zinc-600 font-mono shrink-0">{log.executionTimeMs}ms</span>
                        <span className="text-zinc-400 shrink-0">{log.resultsFound} results</span>
                        <span className="text-zinc-700 font-mono flex-1 truncate">{log.queryId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Arquitetura ── */}
          {activeTab === "arch" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Cadeia FKM-2</p>
              {[
                ["OfficialLibraryManager",   "Single Source of Truth"],
                ["FoundationDocumentParser", "Parsing de Markdown"],
                ["FoundationKnowledgeModel", "Representacao do conhecimento"],
                ["FoundationKnowledgeAPI",   "API publica somente-leitura"],
                ["Consumers (5)",            "FCE · Auditor · Goal · Planner · PIE"],
              ].map(([comp, desc]) => (
                <div key={comp} className="flex items-center gap-3 text-xs">
                  <span className="text-violet-300 font-mono w-48 shrink-0">{comp}</span>
                  <span className="text-zinc-600">{"→"}</span>
                  <span className="text-zinc-400">{desc}</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Invariantes</p>
                {[
                  "API publica somente-leitura — sem side-effects",
                  "Zero duplicacao de logica entre consumers",
                  "Cache interno — sem acesso direto ao Model",
                  "Toda consulta registra log auditavel",
                  "Objetos retornados sao imutaveis (Object.freeze)",
                ].map((inv, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="text-emerald-400 shrink-0">{"→"}</span>{inv}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Pre-run ── */}
      {!data && !running && !error && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-400 text-sm font-medium mb-1">Foundation Knowledge API — Validation Interface</p>
          <p className="text-zinc-600 text-xs">getAllAtoms · getByType · search · count · statistics · 5 consumers</p>
        </div>
      )}

    </div>
  );
}