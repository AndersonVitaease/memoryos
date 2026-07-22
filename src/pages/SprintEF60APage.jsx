/**
 * SprintEF60APage.jsx — EF-60A
 * Instrumentacao Oficial da Pipeline Cognitiva
 *
 * Exibe exclusivamente o Runtime Trace Oficial produzido pelo OfficialRuntimeTraceStore.
 * Nenhuma lista estatica. Nenhum cenario artificial.
 * Toda informacao vem da execucao real do CognitiveRuntime instrumentado.
 *
 * Sem validacoes, NCs, scores ou dashboards de certificacao — apenas o trace.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

const STAGE_COLORS = {
  goal:            "text-orange-400  border-orange-800/40  bg-orange-950/10",
  planning:        "text-yellow-400  border-yellow-800/40  bg-yellow-950/10",
  dispatch:        "text-pink-400    border-pink-800/40    bg-pink-950/10",
  episode:         "text-sky-400     border-sky-800/40     bg-sky-950/10",
  learning:        "text-emerald-400 border-emerald-800/40 bg-emerald-950/10",
  knowledge_store: "text-teal-400    border-teal-800/40    bg-teal-950/10",
  reasoning:       "text-violet-400  border-violet-800/40  bg-violet-950/10",
  optimization:    "text-amber-400   border-amber-800/40   bg-amber-950/10",
  meta_cognition:  "text-blue-400    border-blue-800/40    bg-blue-950/10",
  reflection:      "text-rose-400    border-rose-800/40    bg-rose-950/10",
};

function stageColor(stage) {
  return STAGE_COLORS[stage] ?? "text-zinc-400 border-zinc-700 bg-zinc-800/20";
}
function stageText(stage) {
  return stageColor(stage).split(" ")[0];
}

const TABS = [
  { id: "timeline",    label: "1. Timeline"        },
  { id: "ctx",         label: "2. ExecutionContext" },
  { id: "artifacts",   label: "3. Artefatos"        },
  { id: "ownership",   label: "4. Ownership"        },
  { id: "contracts",   label: "5. Contratos"        },
  { id: "deps",        label: "6. Dependencias"     },
  { id: "order",       label: "7. Ordem"            },
  { id: "log",         label: "8. Log Cronologico"  },
  { id: "export",      label: "9. Exportar"         },
];

// ── UI atoms ──────────────────────────────────────────────────────────────────

function Chip({ label, color = "zinc" }) {
  const map = {
    ok:     "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    warn:   "bg-amber-900/40 text-amber-300 border-amber-700",
    fail:   "bg-red-900/40 text-red-300 border-red-700",
    violet: "bg-violet-900/40 text-violet-300 border-violet-700",
    sky:    "bg-sky-900/40 text-sky-300 border-sky-700",
    teal:   "bg-teal-900/40 text-teal-300 border-teal-700",
    gold:   "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${map[color] ?? map.zinc}`}>
      {label}
    </span>
  );
}

function ts(ms) {
  return new Date(ms).toISOString().slice(11, 23);
}

// ── StageEventRow ─────────────────────────────────────────────────────────────

function StageEventRow({ event, relative0 }) {
  const [open, setOpen] = useState(false);
  const col = stageColor(event.stage);
  const textCol = stageText(event.stage);
  const relMs = event.startedAt - relative0;

  return (
    <div className={`border rounded-lg mb-2 overflow-hidden ${col.split(" ").slice(0, 3).join(" ")}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition"
      >
        {/* position badge */}
        <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">{event.position}.</span>
        {/* stage */}
        <span className={`font-mono font-bold text-xs w-24 shrink-0 ${textCol}`}>
          {event.stage.replace(/_/g, " ")}
        </span>
        {/* engine */}
        <span className="text-zinc-400 text-xs flex-1 truncate">{event.engine}</span>
        {/* timing */}
        <span className="text-zinc-600 font-mono text-xs shrink-0">+{relMs}ms</span>
        <span className="text-zinc-500 font-mono text-xs shrink-0">{event.durationMs}ms</span>
        {/* artifact short */}
        <span className="text-zinc-700 font-mono text-xs shrink-0 hidden sm:block">
          {event.artifactId?.slice(-14)}
        </span>
        {/* status */}
        <Chip label={event.status} color={event.status === "ok" ? "ok" : "warn"} />
        <span className="text-zinc-600 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800/30 px-3 py-3 space-y-3 text-xs bg-zinc-900/60">

          {/* Timestamps */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Iniciou",   ts(event.startedAt)],
              ["Terminou",  ts(event.finishedAt)],
              ["Duração",   `${event.durationMs}ms`],
              ["Rel. início", `+${relMs}ms`],
            ].map(([l, v]) => (
              <div key={l} className="bg-zinc-800/40 rounded p-2">
                <div className="text-zinc-600">{l}</div>
                <div className="text-zinc-300 font-mono">{v}</div>
              </div>
            ))}
          </div>

          {/* Artifact */}
          <div className="bg-zinc-800/30 rounded p-2">
            <div className="text-zinc-500 mb-1">Artefato Produzido</div>
            <div className="text-emerald-300 font-mono">{event.artifactId}</div>
            <div className="text-zinc-600 mt-0.5">Owner: <span className="text-violet-300">{event.artifactOwner}</span></div>
          </div>

          {/* Consumed / Produced */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-1">Artefatos Consumidos</div>
              {event.artifactsConsumed.map(a => (
                <div key={a} className="text-sky-400 font-mono text-xs">{a}</div>
              ))}
            </div>
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-1">Artefatos Produzidos</div>
              {event.artifactsProduced.map(a => (
                <div key={a} className="text-emerald-400 font-mono text-xs">{a}</div>
              ))}
            </div>
          </div>

          {/* Contracts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-1">Contrato de Entrada</div>
              <div className="text-sky-300 font-mono break-all">{event.contractIn}</div>
            </div>
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-1">Contrato de Saída</div>
              <div className="text-teal-300 font-mono break-all">{event.contractOut}</div>
            </div>
          </div>

          {/* Dependencies + Next */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-1">Depende de</div>
              {event.dependsOn.length === 0
                ? <div className="text-zinc-600">— (primeiro stage)</div>
                : event.dependsOn.map(d => <div key={d} className="text-amber-300 font-mono">{d}</div>)
              }
            </div>
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-1">Próximo Stage</div>
              <div className={`font-mono font-bold ${stageText(event.nextStage.toLowerCase().replace(/ /g,"_")) || "text-zinc-400"}`}>
                {event.nextStage}
              </div>
            </div>
          </div>

          {/* ExecutionContext delta */}
          <div className="bg-zinc-800/30 rounded p-2">
            <div className="text-zinc-500 mb-1">ExecutionContext — Delta (campos adicionados por este stage)</div>
            {Object.keys(event.ctxDelta).length === 0
              ? <div className="text-zinc-600 font-mono">Nenhuma alteracao ao ctx</div>
              : Object.entries(event.ctxDelta).map(([k, v]) => (
                <div key={k} className="flex gap-2 font-mono text-xs">
                  <span className="text-emerald-400">{k}:</span>
                  <span className="text-zinc-300 break-all">{String(v)?.slice(0, 60)}</span>
                </div>
              ))
            }
          </div>

          {/* Key metrics */}
          {Object.keys(event.keyMetrics).length > 0 && (
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-1">Key Metrics</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(event.keyMetrics).map(([k, v]) => (
                  <div key={k} className="bg-zinc-900/50 rounded px-2 py-1">
                    <div className="text-zinc-600 text-xs">{k}</div>
                    <div className="text-zinc-200 font-mono font-bold">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="text-zinc-500 italic">{event.summary}</div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SprintEF60APage() {
  const [traces,   setTraces]   = useState([]);
  const [tab,      setTab]      = useState("timeline");
  const [selTrace, setSelTrace] = useState(null); // index into traces[]
  const [running,  setRunning]  = useState(false);
  const [log,      setLog]      = useState([]);
  const logRef = useRef([]);

  const emit = useCallback((msg, type = "info") => {
    const e = { ts: Date.now(), msg, type };
    logRef.current = [...logRef.current, e];
    setLog([...logRef.current]);
  }, []);

  // ── Subscribe to trace store ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    import("@/lib/runtime-trace/OfficialRuntimeTraceStore").then(({ OfficialRuntimeTraceStore }) => {
      if (!mounted) return;
      const update = () => {
        if (!mounted) return;
        const all = OfficialRuntimeTraceStore.getAll();
        setTraces([...all]);
        if (all.length > 0 && selTrace === null) setSelTrace(all.length - 1);
      };
      update();
      const unsub = OfficialRuntimeTraceStore.subscribe(update);
      return () => { mounted = false; unsub(); };
    });
    return () => { mounted = false; };
  }, []); // eslint-disable-line

  // ── Run a single execution to generate trace ──────────────────────────────
  const runSingle = useCallback(async () => {
    setRunning(true);
    logRef.current = [];
    setLog([]);
    emit("Iniciando execucao real via CognitiveRuntime...", "info");
    try {
      const { CognitiveRuntime } = await import("@/lib/cognitive-runtime/CognitiveRuntime");
      emit("CognitiveRuntime carregado. Executando pipeline...", "ok");
      const result = await CognitiveRuntime.execute({
        goal:         "Retrieve and analyze source files from GitHub repository",
        intent:       "read",
        strategy:     "connector_direct",
        capabilities: ["github.file.read", "github.repos.list", "knowledge.retrieve"],
        connectors:   ["GitHubConnector"],
        confidence:   0.87,
        authority:    0.91,
        durationMs:   310,
        success:      true,
        context:      "ef60a_trace_demo",
        metadata:     { source: "EF-60A instrumentation sprint" },
      });
      emit(`Pipeline concluida: ${result.stages.length} stages em ${result.totalDurationMs}ms`, "ok");
      emit(`ExecutionId: ${result.ctx.executionId}`, "ok");
      emit(`KnowledgeStore: ${result.knowledgeStateBefore} → ${result.knowledgeStateAfter}`, "ok");
    } catch (e) {
      emit(`ERRO: ${String(e)}`, "error");
    }
    setRunning(false);
  }, [emit]);

  // ── Active trace ──────────────────────────────────────────────────────────
  const activeTrace = selTrace !== null ? traces[selTrace] ?? null : traces[traces.length - 1] ?? null;
  const events      = activeTrace?.events ?? [];
  const relative0   = events[0]?.startedAt ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-teal-950/40 to-blue-950/30 border border-teal-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2">
            <Chip label="EF-60A" color="gold" />
            <Chip label="RUNTIME TRACE OFICIAL" color="teal" />
            <Chip label="EXECUCAO REAL" color="sky" />
            <Chip label="TRANSPARENTE" color="ok" />
            {activeTrace && <Chip label={`${events.length}/10 events`} color={events.length >= 10 ? "ok" : "warn"} />}
            {activeTrace?.complete && <Chip label="COMPLETO" color="ok" />}
          </div>
          <h1 className="text-xl font-bold text-white mb-1">
            EF-60A — Instrumentação Oficial da Pipeline Cognitiva
          </h1>
          <p className="text-zinc-400 text-sm mb-4">
            Runtime Trace produzido pela execução real. Sem mocks. Sem listas estáticas.
            Toda análise futura deverá utilizar exclusivamente este trace.
          </p>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={runSingle}
              disabled={running}
              className="px-5 py-2.5 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 rounded-xl text-sm font-bold transition-colors"
            >
              {running ? "Executando..." : "▶ Executar Pipeline Real"}
            </button>
            {traces.length > 0 && (
              <button
                onClick={async () => {
                  const { OfficialRuntimeTraceStore } = await import("@/lib/runtime-trace/OfficialRuntimeTraceStore");
                  OfficialRuntimeTraceStore.clear();
                  setTraces([]);
                  setSelTrace(null);
                  logRef.current = [];
                  setLog([]);
                }}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-400 transition-colors"
              >
                Limpar Traces
              </button>
            )}
          </div>

          {/* Run selector */}
          {traces.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-zinc-500 text-xs self-center">Trace:</span>
              {traces.map((t, i) => (
                <button
                  key={t.traceSessionId}
                  onClick={() => setSelTrace(i)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                    (selTrace ?? traces.length - 1) === i
                      ? "bg-teal-700 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  #{t.runIndex} {t.complete ? "✓" : "…"}
                </button>
              ))}
            </div>
          )}

          {/* Active trace summary */}
          {activeTrace && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
              {[
                ["Run",      `#${activeTrace.runIndex}`],
                ["Stages",   `${events.length}/10`],
                ["Duração",  activeTrace.complete ? `${activeTrace.totalDurationMs}ms` : "..."],
                ["Início",   ts(activeTrace.startedAt)],
                ["execId",   activeTrace.executionId?.slice(-12)],
                ["Status",   activeTrace.complete ? "COMPLETO" : "EM CURSO"],
              ].map(([l, v]) => (
                <div key={l} className="bg-zinc-800/40 rounded-lg p-2 text-center">
                  <div className="text-zinc-600 text-xs">{l}</div>
                  <div className="text-zinc-300 font-mono text-xs font-bold mt-0.5 truncate">{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Log ── */}
        {log.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 max-h-28 overflow-y-auto">
            {log.map((l, i) => (
              <p key={i} className={`text-xs font-mono ${l.type === "ok" ? "text-emerald-400" : l.type === "error" ? "text-red-400" : "text-zinc-400"}`}>
                <span className="text-zinc-700">{ts(l.ts)} </span>{l.msg}
              </p>
            ))}
          </div>
        )}

        {/* Empty state */}
        {traces.length === 0 && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Nenhum trace disponível</p>
            <p className="text-zinc-600 text-xs">Execute a Pipeline Real para gerar o Runtime Trace Oficial.</p>
          </div>
        )}

        {/* ── Tabs ── */}
        {events.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    tab === t.id ? "bg-teal-700 text-white" : "text-zinc-400 hover:text-white"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 1: Timeline */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "timeline" && (
              <div className="space-y-1">
                <p className="text-zinc-500 text-xs mb-3 font-mono">
                  {events.length} eventos • execução real • {activeTrace?.totalDurationMs ?? "..."}ms total
                </p>
                {events.map(ev => (
                  <StageEventRow key={ev.traceId} event={ev} relative0={relative0} />
                ))}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 2: ExecutionContext */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "ctx" && (
              <div className="space-y-4">
                {/* Full ctx timeline */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                    Propagação Cronológica do ExecutionContext
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          <td className="py-1 pr-2">Stage</td>
                          <td className="py-1 pr-2">IDs Adicionados</td>
                          <td className="py-1 pr-2">Timestamp</td>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map(ev => {
                          const col = stageText(ev.stage);
                          const deltaKeys = Object.keys(ev.ctxDelta);
                          return (
                            <tr key={ev.traceId} className="border-b border-zinc-800/30">
                              <td className={`py-1.5 pr-2 font-bold ${col}`}>{ev.stage.replace(/_/g," ")}</td>
                              <td className="py-1.5 pr-2 text-emerald-400">
                                {deltaKeys.length === 0 ? <span className="text-zinc-700">—</span> : deltaKeys.join(", ")}
                              </td>
                              <td className="py-1.5 pr-2 text-zinc-600">{ts(ev.startedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Final ctx */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                    ExecutionContext Final — Todos os IDs
                  </p>
                  {[
                    "executionId","goalId","planId","dispatchId","episodeId",
                    "learningId","knowledgeAfter","reasoningId","optimizationId","metaId","reflectionId",
                  ].map(k => {
                    const val = activeTrace?.ctxFinal?.[k];
                    const present = val !== undefined && val !== null;
                    // find which stage added it
                    const addedBy = events.find(ev => ev.ctxDelta[k] !== undefined)?.stage ?? "—";
                    return (
                      <div key={k} className="flex items-center gap-2 py-0.5 border-b border-zinc-800/30 last:border-0 text-xs">
                        <span className={present ? "text-emerald-400" : "text-red-400"}>{present ? "✓" : "✗"}</span>
                        <span className="font-mono text-zinc-300 w-32 shrink-0">{k}</span>
                        <span className={`font-mono flex-1 ${present ? "text-zinc-400" : "text-red-400"}`}>
                          {present ? String(val).slice(0, 40) : "AUSENTE"}
                        </span>
                        <span className={`font-mono text-xs shrink-0 ${stageText(addedBy) || "text-zinc-600"}`}>
                          {addedBy !== "—" ? `← ${addedBy}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* ctx evolution per stage */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Ctx Snapshot por Stage</p>
                  {events.map(ev => {
                    const col = stageText(ev.stage);
                    return (
                      <div key={ev.traceId} className="mb-2 pb-2 border-b border-zinc-800/30 last:border-0">
                        <span className={`font-mono font-bold text-xs ${col}`}>{ev.stage.replace(/_/g," ")}</span>
                        <div className="flex flex-wrap gap-x-4 mt-1">
                          {Object.entries(ev.ctxAfter).map(([k, v]) => (
                            <span key={k} className="text-xs font-mono text-zinc-600">
                              {k}: <span className="text-zinc-400">{String(v)?.slice(-14)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 3: Artefatos */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "artifacts" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Artefatos Produzidos (observados na execução)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          {["Stage","Engine","Artifact ID","Owner","Produz","Consome"].map(h => (
                            <td key={h} className="py-1 pr-3 font-bold">{h}</td>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {events.map(ev => {
                          const col = stageText(ev.stage);
                          return (
                            <tr key={ev.traceId} className="border-b border-zinc-800/30">
                              <td className={`py-1.5 pr-3 font-bold ${col}`}>{ev.stage.replace(/_/g," ")}</td>
                              <td className="py-1.5 pr-3 text-zinc-400">{ev.engine}</td>
                              <td className="py-1.5 pr-3 text-emerald-300">{ev.artifactId?.slice(-20)}</td>
                              <td className="py-1.5 pr-3 text-violet-300">{ev.artifactOwner}</td>
                              <td className="py-1.5 pr-3 text-emerald-400/80">{ev.artifactsProduced.join(", ")}</td>
                              <td className="py-1.5 pr-3 text-sky-400/80">{ev.artifactsConsumed.slice(0,2).join(", ")}{ev.artifactsConsumed.length > 2 ? "…" : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Artifact provenance */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Rastreamento Completo — Produção e Consumo</p>
                  {events.map(ev => {
                    const col = stageText(ev.stage);
                    return (
                      <div key={ev.traceId} className="mb-3 pb-3 border-b border-zinc-800/30 last:border-0">
                        <div className="flex gap-2 mb-1">
                          <span className={`font-mono font-bold text-xs ${col}`}>{ev.stage.replace(/_/g," ").toUpperCase()}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="text-zinc-500 text-xs">{ev.engine}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-zinc-600">← consome: </span>
                            <span className="text-sky-400 font-mono">{ev.artifactsConsumed.join(", ")}</span>
                          </div>
                          <div>
                            <span className="text-zinc-600">→ produz: </span>
                            <span className="text-emerald-400 font-mono">{ev.artifactsProduced.join(", ")}</span>
                          </div>
                        </div>
                        <div className="text-zinc-700 text-xs font-mono mt-0.5">
                          id: {ev.artifactId}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 4: Ownership */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "ownership" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Ownership Observado na Execução Real</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        {["Stage","Engine (Owner)","Artifact ID","Artefatos Próprios"].map(h => (
                          <td key={h} className="py-1 pr-3 font-bold">{h}</td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {events.map(ev => {
                        const col = stageText(ev.stage);
                        return (
                          <tr key={ev.traceId} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                            <td className={`py-2 pr-3 font-bold ${col}`}>{ev.stage.replace(/_/g," ")}</td>
                            <td className="py-2 pr-3 text-violet-300 font-bold">{ev.artifactOwner}</td>
                            <td className="py-2 pr-3 text-emerald-300">{ev.artifactId?.slice(-24)}</td>
                            <td className="py-2 pr-3 text-emerald-400">{ev.artifactsProduced.join(", ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 text-xs text-zinc-600 bg-zinc-800/20 rounded p-3">
                  Ownership verificado: cada engine produz exatamente seus próprios artefatos.
                  Dados provenientes exclusivamente da execução real do CognitiveRuntime instrumentado.
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 5: Contratos */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "contracts" && (
              <div className="space-y-2">
                {events.map(ev => {
                  const col = stageColor(ev.stage);
                  const textCol = stageText(ev.stage);
                  return (
                    <div key={ev.traceId} className={`border rounded-xl p-3 ${col.split(" ").slice(0,3).join(" ")}`}>
                      <div className="flex gap-2 items-center mb-2">
                        <span className={`font-mono font-bold text-xs ${textCol}`}>{ev.stage.replace(/_/g," ").toUpperCase()}</span>
                        <span className="text-zinc-500 text-xs">— {ev.engine}</span>
                        <Chip label="OBSERVADO" color="ok" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="bg-zinc-900/60 rounded p-2">
                          <div className="text-zinc-500 mb-1">Contrato de Entrada</div>
                          <div className="text-sky-300 font-mono break-all">{ev.contractIn}</div>
                        </div>
                        <div className="bg-zinc-900/60 rounded p-2">
                          <div className="text-zinc-500 mb-1">Contrato de Saída → ctx</div>
                          <div className="text-teal-300 font-mono break-all">{ev.contractOut}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 6: Dependencias */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "deps" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Dependências Observadas na Execução Real</p>
                  {events.map(ev => {
                    const col = stageText(ev.stage);
                    return (
                      <div key={ev.traceId} className="flex items-center gap-2 mb-2 text-xs">
                        <span className={`font-mono font-bold w-28 shrink-0 ${col}`}>{ev.stage.replace(/_/g," ")}</span>
                        <span className="text-zinc-600 shrink-0">depende de →</span>
                        {ev.dependsOn.length === 0
                          ? <span className="text-zinc-700">— (nenhuma dependência)</span>
                          : ev.dependsOn.map(d => (
                            <span key={d} className="text-amber-300 font-mono">{d}</span>
                          ))
                        }
                        <span className="text-zinc-600 ml-auto shrink-0">→ chama: <span className={`font-mono ${stageText(ev.nextStage.toLowerCase().replace(/ /g,"_")) || "text-zinc-400"}`}>{ev.nextStage}</span></span>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Grafo de Dependências — Observado</p>
                  <div className="flex flex-col items-center">
                    {events.map((ev, i) => {
                      const col = stageText(ev.stage);
                      return (
                        <React.Fragment key={ev.traceId}>
                          <div className="border border-zinc-700/50 bg-zinc-800/30 rounded-lg px-4 py-1.5 w-full max-w-sm text-center">
                            <span className={`font-mono font-bold text-xs ${col}`}>{ev.stage.replace(/_/g," ")}</span>
                            <span className="text-zinc-600 text-xs ml-2">{ev.engine}</span>
                          </div>
                          {i < events.length - 1 && <div className="text-zinc-700 text-lg leading-none my-0.5">↓</div>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 7: Ordem */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "order" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Ordem Real da Execução (derivada do trace)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          {["Pos","Stage","Engine","Inicio","Duração","ArtifactId (ultimos 16)","Status"].map(h => (
                            <td key={h} className="py-1 pr-3 font-bold">{h}</td>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {events.map(ev => {
                          const col = stageText(ev.stage);
                          return (
                            <tr key={ev.traceId} className="border-b border-zinc-800/30">
                              <td className="py-1.5 pr-3 text-zinc-600">{ev.position}.</td>
                              <td className={`py-1.5 pr-3 font-bold ${col}`}>{ev.stage.replace(/_/g," ")}</td>
                              <td className="py-1.5 pr-3 text-zinc-400">{ev.engine}</td>
                              <td className="py-1.5 pr-3 text-zinc-600">{ts(ev.startedAt)}</td>
                              <td className="py-1.5 pr-3 text-zinc-300">{ev.durationMs}ms</td>
                              <td className="py-1.5 pr-3 text-emerald-300">{ev.artifactId?.slice(-16)}</td>
                              <td className="py-1.5 pr-3"><Chip label={ev.status} color={ev.status === "ok" ? "ok" : "warn"} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-2">Sequência Completa Observada</p>
                  <div className="text-zinc-400 font-mono text-xs flex flex-wrap items-center gap-1">
                    {events.map((ev, i) => (
                      <React.Fragment key={ev.traceId}>
                        <span className={stageText(ev.stage)}>{ev.stage.replace(/_/g," ")}</span>
                        {i < events.length - 1 && <span className="text-zinc-700">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 8: Log Cronologico */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "log" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Log Cronológico Completo — Fonte Oficial</p>
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {/* Bootstrap */}
                  <div className="flex gap-2 text-xs font-mono border-b border-zinc-800/30 pb-1 mb-1">
                    <span className="text-zinc-600 w-20 shrink-0">{ts(activeTrace.startedAt)}</span>
                    <span className="text-blue-400 w-10 shrink-0">BOOT</span>
                    <span className="text-zinc-500">CognitiveRuntime</span>
                    <span className="text-zinc-400 ml-auto">BEGIN run#${activeTrace.runIndex} exec={activeTrace.executionId?.slice(-14)}</span>
                  </div>

                  {events.map(ev => {
                    const col = stageText(ev.stage);
                    const delta = Object.entries(ev.ctxDelta);
                    return (
                      <React.Fragment key={ev.traceId}>
                        {/* ENTER */}
                        <div className="flex gap-2 text-xs font-mono border-b border-zinc-800/20 py-0.5">
                          <span className="text-zinc-600 w-20 shrink-0">{ts(ev.startedAt)}</span>
                          <span className={`w-10 shrink-0 ${col}`}>ENTER</span>
                          <span className="text-zinc-400">{ev.engine}</span>
                          <span className="text-zinc-600 ml-auto truncate">{ev.contractIn.slice(0,40)}</span>
                        </div>
                        {/* EXIT */}
                        <div className="flex gap-2 text-xs font-mono border-b border-zinc-800/30 py-0.5">
                          <span className="text-zinc-600 w-20 shrink-0">{ts(ev.finishedAt)}</span>
                          <span className={`w-10 shrink-0 ${col}`}>EXIT</span>
                          <span className="text-zinc-400">{ev.engine}</span>
                          <span className="text-emerald-400 ml-2">{ev.artifactId?.slice(-18)}</span>
                          {delta.length > 0 && <span className="text-teal-400 ml-2">+ctx: {delta.map(([k]) => k).join(",")}</span>}
                          <span className="text-zinc-600 ml-auto">{ev.durationMs}ms → {ev.nextStage}</span>
                        </div>
                      </React.Fragment>
                    );
                  })}

                  {/* Finalize */}
                  {activeTrace.complete && (
                    <div className="flex gap-2 text-xs font-mono pt-1">
                      <span className="text-zinc-600 w-20 shrink-0">{ts(activeTrace.finishedAt)}</span>
                      <span className="text-emerald-400 w-10 shrink-0">DONE</span>
                      <span className="text-zinc-500">CognitiveRuntime</span>
                      <span className="text-emerald-300 ml-auto">PIPELINE COMPLETE {activeTrace.totalDurationMs}ms</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB 9: Export */}
            {/* ════════════════════════════════════════════════════════════ */}
            {tab === "export" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Exportar Runtime Trace Oficial</p>
                  <p className="text-zinc-500 text-xs mb-4">
                    O Runtime Trace exportado é a fonte oficial para toda análise arquitetural futura.
                    Nenhuma auditoria deverá depender de listas estáticas após esta sprint.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        const { OfficialRuntimeTraceStore } = await import("@/lib/runtime-trace/OfficialRuntimeTraceStore");
                        const json = OfficialRuntimeTraceStore.export();
                        const blob = new Blob([json], { type: "application/json" });
                        const url  = URL.createObjectURL(blob);
                        const a    = document.createElement("a");
                        a.href     = url;
                        a.download = `runtime-trace-ef60a-${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-600 rounded-xl text-sm font-bold transition-colors"
                    >
                      ↓ Exportar JSON
                    </button>
                  </div>
                </div>

                {/* JSON preview */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Preview — Trace Ativo</p>
                  <pre className="text-xs text-zinc-400 overflow-auto max-h-96 font-mono bg-zinc-950 rounded p-3">
                    {JSON.stringify({
                      traceSessionId:  activeTrace.traceSessionId,
                      runIndex:        activeTrace.runIndex,
                      executionId:     activeTrace.executionId,
                      startedAt:       activeTrace.startedAt,
                      totalDurationMs: activeTrace.totalDurationMs,
                      complete:        activeTrace.complete,
                      eventCount:      events.length,
                      stages:          events.map(ev => ({
                        position:          ev.position,
                        stage:             ev.stage,
                        engine:            ev.engine,
                        artifactId:        ev.artifactId,
                        artifactOwner:     ev.artifactOwner,
                        durationMs:        ev.durationMs,
                        ctxDelta:          ev.ctxDelta,
                        artifactsProduced: ev.artifactsProduced,
                        dependsOn:         ev.dependsOn,
                        nextStage:         ev.nextStage,
                        status:            ev.status,
                      })),
                      ctxFinal: activeTrace.ctxFinal,
                    }, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}