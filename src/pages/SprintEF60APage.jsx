/**
 * SprintEF60APage.jsx — EF-60A
 * Visualizador do Runtime Trace Oficial
 *
 * Exibe exclusivamente fatos observados durante a execucao real.
 * Nenhum conhecimento arquitetural. Nenhuma regra da pipeline.
 * Nenhum owner, contrato, dependencia ou stage esperado.
 * Apenas registra e exibe o que foi observado.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

// ── Cores por stage (puramente visuais — sem significado arquitetural) ─────────

const STAGE_COLORS = {
  goal:            "text-orange-400  bg-orange-950/10  border-orange-800/30",
  planning:        "text-yellow-400  bg-yellow-950/10  border-yellow-800/30",
  dispatch:        "text-pink-400    bg-pink-950/10    border-pink-800/30",
  episode:         "text-sky-400     bg-sky-950/10     border-sky-800/30",
  learning:        "text-emerald-400 bg-emerald-950/10 border-emerald-800/30",
  knowledge_store: "text-teal-400    bg-teal-950/10    border-teal-800/30",
  reasoning:       "text-violet-400  bg-violet-950/10  border-violet-800/30",
  optimization:    "text-amber-400   bg-amber-950/10   border-amber-800/30",
  meta_cognition:  "text-blue-400    bg-blue-950/10    border-blue-800/30",
  reflection:      "text-rose-400    bg-rose-950/10    border-rose-800/30",
};

function stageClass(stage) {
  return STAGE_COLORS[stage] ?? "text-zinc-400 bg-zinc-800/20 border-zinc-700/30";
}
function stageTextColor(stage) {
  return stageClass(stage).split(" ")[0];
}

function ts(ms) {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(11, 23);
}

// ── Tabs — somente fatos observados ──────────────────────────────────────────

const TABS = [
  { id: "timeline",  label: "1. Timeline"   },
  { id: "ctx",       label: "2. Context"    },
  { id: "artifacts", label: "3. Artefatos"  },
  { id: "log",       label: "4. Log"        },
  { id: "export",    label: "5. Exportar"   },
];

// ── UI atoms ──────────────────────────────────────────────────────────────────

function Chip({ label, color = "zinc" }) {
  const styles = {
    ok:     "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    warn:   "bg-amber-900/40   text-amber-300   border-amber-700",
    fail:   "bg-red-900/40     text-red-300     border-red-700",
    teal:   "bg-teal-900/40   text-teal-300    border-teal-700",
    sky:    "bg-sky-900/40    text-sky-300     border-sky-700",
    gold:   "bg-yellow-900/40 text-yellow-300  border-yellow-700",
    zinc:   "bg-zinc-800      text-zinc-400    border-zinc-700",
  };
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${styles[color] ?? styles.zinc}`}>
      {label}
    </span>
  );
}

// ── StageEventRow ─────────────────────────────────────────────────────────────

function StageEventRow({ event, relative0 }) {
  const [open, setOpen] = useState(false);
  const cls      = stageClass(event.stage);
  const textCol  = stageTextColor(event.stage);
  const relMs    = event.startedAt - relative0;
  const deltaKeys = Object.keys(event.ctxDelta);

  return (
    <div className={`border rounded-lg mb-2 overflow-hidden ${cls}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition"
      >
        <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">{event.position}.</span>
        <span className={`font-mono font-bold text-xs w-28 shrink-0 ${textCol}`}>
          {event.stage.replace(/_/g, " ")}
        </span>
        <span className="text-zinc-500 text-xs flex-1 truncate">{event.summary}</span>
        <span className="text-zinc-600 font-mono text-xs shrink-0 hidden sm:block">+{relMs}ms</span>
        <span className="text-zinc-500 font-mono text-xs shrink-0">{event.durationMs}ms</span>
        <Chip label={event.status} color={event.status === "ok" ? "ok" : "warn"} />
        <span className="text-zinc-600 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800/30 px-3 py-3 space-y-3 text-xs bg-zinc-900/60">

          {/* Timestamps observados */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Iniciou",      ts(event.startedAt)],
              ["Terminou",     ts(event.finishedAt)],
              ["Duração",      `${event.durationMs}ms`],
              ["Relativo",     `+${relMs}ms`],
            ].map(([l, v]) => (
              <div key={l} className="bg-zinc-800/40 rounded p-2">
                <div className="text-zinc-600">{l}</div>
                <div className="text-zinc-300 font-mono">{v}</div>
              </div>
            ))}
          </div>

          {/* Artefato observado */}
          <div className="bg-zinc-800/30 rounded p-2">
            <div className="text-zinc-500 mb-1">Artefato produzido (observado)</div>
            <div className={`font-mono font-bold ${textCol}`}>{event.artifactId}</div>
          </div>

          {/* ExecutionContext delta (observado) */}
          <div className="bg-zinc-800/30 rounded p-2">
            <div className="text-zinc-500 mb-1">
              Campos adicionados ao ExecutionContext por este stage ({deltaKeys.length})
            </div>
            {deltaKeys.length === 0
              ? <div className="text-zinc-600 font-mono">Nenhum campo novo</div>
              : deltaKeys.map(k => (
                <div key={k} className="flex gap-2 font-mono text-xs">
                  <span className="text-emerald-400">{k}:</span>
                  <span className="text-zinc-300 break-all">{String(event.ctxDelta[k]).slice(0, 60)}</span>
                </div>
              ))
            }
          </div>

          {/* Key metrics observadas */}
          {Object.keys(event.keyMetrics).length > 0 && (
            <div className="bg-zinc-800/30 rounded p-2">
              <div className="text-zinc-500 mb-2">Métricas observadas</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(event.keyMetrics).map(([k, v]) => (
                  <div key={k} className="bg-zinc-900/50 rounded px-2 py-1">
                    <div className="text-zinc-600">{k}</div>
                    <div className={`font-mono font-bold ${textCol}`}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IDs de rastreabilidade */}
          <div className="bg-zinc-800/30 rounded p-2">
            <div className="text-zinc-500 mb-1">Rastreabilidade</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-xs">
              <div><span className="text-zinc-600">traceId: </span><span className="text-zinc-400">{event.traceId}</span></div>
              <div><span className="text-zinc-600">executionId: </span><span className="text-zinc-400">{event.executionId}</span></div>
              <div><span className="text-zinc-600">runId: </span><span className="text-zinc-400">{event.runId}</span></div>
              <div><span className="text-zinc-600">runIndex: </span><span className="text-zinc-400">#{event.runIndex}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SprintEF60APage() {
  const [traces,   setTraces]   = useState([]);
  const [tab,      setTab]      = useState("timeline");
  const [selTrace, setSelTrace] = useState(null);
  const [running,  setRunning]  = useState(false);
  const [log,      setLog]      = useState([]);
  const logRef = useRef([]);

  const emit = useCallback((msg, type = "info") => {
    const e = { ts: Date.now(), msg, type };
    logRef.current = [...logRef.current, e];
    setLog([...logRef.current]);
  }, []);

  // ── Subscribe ao trace store ──────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    import("@/lib/runtime-trace/OfficialRuntimeTraceStore").then(({ OfficialRuntimeTraceStore }) => {
      if (!mounted) return;
      const update = () => {
        if (!mounted) return;
        const all = OfficialRuntimeTraceStore.getAll();
        setTraces([...all]);
        if (all.length > 0) setSelTrace(i => i ?? all.length - 1);
      };
      update();
      const unsub = OfficialRuntimeTraceStore.subscribe(update);
      return () => { mounted = false; unsub(); };
    });
    return () => { mounted = false; };
  }, []);

  // ── Executar pipeline real ────────────────────────────────────────────────

  const runPipeline = useCallback(async () => {
    setRunning(true);
    logRef.current = [];
    setLog([]);
    emit("Iniciando execucao real do CognitiveRuntime...");
    try {
      const { CognitiveRuntime } = await import("@/lib/cognitive-runtime/CognitiveRuntime");
      emit("Engine carregado. Executando pipeline...", "ok");
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
        context:      "ef60a_trace",
        metadata:     { source: "EF-60A" },
      });
      emit(`Concluido: ${result.stages.length} stages em ${result.totalDurationMs}ms`, "ok");
    } catch (e) {
      emit(`ERRO: ${String(e)}`, "error");
    }
    setRunning(false);
  }, [emit]);

  // ── Dados do trace ativo ─────────────────────────────────────────────────

  const activeIdx   = selTrace ?? (traces.length > 0 ? traces.length - 1 : null);
  const activeTrace = activeIdx !== null ? traces[activeIdx] ?? null : null;
  const events      = activeTrace?.events ?? [];
  const relative0   = events[0]?.startedAt ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-teal-950/40 to-zinc-900/60 border border-teal-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2">
            <Chip label="EF-60A" color="gold" />
            <Chip label="RUNTIME TRACE OFICIAL" color="teal" />
            <Chip label="SOMENTE FATOS OBSERVADOS" color="sky" />
            {activeTrace?.complete && <Chip label={`${events.length} eventos`} color="ok" />}
          </div>
          <h1 className="text-xl font-bold text-white mb-1">
            EF-60A — Infraestrutura de Telemetria da Pipeline Cognitiva
          </h1>
          <p className="text-zinc-400 text-sm mb-4">
            Registra exclusivamente fatos observados durante a execucao real.
            Sem conhecimento arquitetural. Sem regras da pipeline. Sem presuncoes.
          </p>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={runPipeline}
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
                  setTraces([]); setSelTrace(null);
                  logRef.current = []; setLog([]);
                }}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-400 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Seletor de runs */}
          {traces.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 items-center">
              <span className="text-zinc-600 text-xs">Run:</span>
              {traces.map((t, i) => (
                <button key={t.traceSessionId} onClick={() => setSelTrace(i)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                    activeIdx === i ? "bg-teal-700 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}>
                  #{t.runIndex} {t.complete ? "✓" : "…"} {t.events.length}ev
                </button>
              ))}
            </div>
          )}

          {/* Resumo do trace ativo */}
          {activeTrace && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
              {[
                ["Eventos",   `${events.length}`],
                ["Duração",   activeTrace.complete ? `${activeTrace.totalDurationMs}ms` : "..."],
                ["Início",    ts(activeTrace.startedAt)],
                ["Término",   ts(activeTrace.finishedAt)],
                ["execId",    activeTrace.executionId?.slice(-10)],
                ["Completo",  activeTrace.complete ? "sim" : "não"],
              ].map(([l, v]) => (
                <div key={l} className="bg-zinc-800/40 rounded-lg p-2 text-center">
                  <div className="text-zinc-600 text-xs">{l}</div>
                  <div className="text-zinc-300 font-mono text-xs font-bold mt-0.5 truncate">{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Log de execucao ── */}
        {log.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 max-h-24 overflow-y-auto">
            {log.map((l, i) => (
              <p key={i} className={`text-xs font-mono ${
                l.type === "ok" ? "text-emerald-400" : l.type === "error" ? "text-red-400" : "text-zinc-500"
              }`}>
                <span className="text-zinc-700">{ts(l.ts)} </span>{l.msg}
              </p>
            ))}
          </div>
        )}

        {/* Empty state */}
        {traces.length === 0 && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    tab === t.id ? "bg-teal-700 text-white" : "text-zinc-400 hover:text-white"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── TAB 1: Timeline ── */}
            {tab === "timeline" && (
              <div>
                <p className="text-zinc-600 text-xs font-mono mb-3">
                  {events.length} eventos observados • {activeTrace?.totalDurationMs ?? "..."}ms total
                </p>
                {events.map(ev => (
                  <StageEventRow key={ev.traceId} event={ev} relative0={relative0} />
                ))}
              </div>
            )}

            {/* ── TAB 2: ExecutionContext ── */}
            {tab === "ctx" && (
              <div className="space-y-4">

                {/* Propagacao cronologica */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                    Propagação Cronológica do ExecutionContext (observada)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-zinc-600 border-b border-zinc-800">
                          <td className="py-1 pr-3">Stage</td>
                          <td className="py-1 pr-3">Campos adicionados (observados)</td>
                          <td className="py-1">Timestamp</td>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map(ev => {
                          const deltaKeys = Object.keys(ev.ctxDelta);
                          return (
                            <tr key={ev.traceId} className="border-b border-zinc-800/30">
                              <td className={`py-1.5 pr-3 font-bold ${stageTextColor(ev.stage)}`}>
                                {ev.stage.replace(/_/g, " ")}
                              </td>
                              <td className="py-1.5 pr-3 text-emerald-400">
                                {deltaKeys.length === 0
                                  ? <span className="text-zinc-700">—</span>
                                  : deltaKeys.join(", ")
                                }
                              </td>
                              <td className="py-1.5 text-zinc-600">{ts(ev.startedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ctx final observado */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                    ExecutionContext Final (observado)
                  </p>
                  {Object.entries(activeTrace.ctxFinal ?? {}).map(([k, v]) => (
                    <div key={k} className="flex gap-2 py-0.5 border-b border-zinc-800/30 last:border-0 text-xs font-mono">
                      <span className="text-zinc-400 w-36 shrink-0">{k}</span>
                      <span className="text-zinc-300 break-all flex-1">{String(v).slice(0, 80)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 3: Artefatos ── */}
            {tab === "artifacts" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                  Artefatos Produzidos (observados na execucao)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-600 border-b border-zinc-800">
                        {["Pos","Stage","Artifact ID (observado)","Status","Duração"].map(h => (
                          <td key={h} className="py-1 pr-3">{h}</td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {events.map(ev => (
                        <tr key={ev.traceId} className="border-b border-zinc-800/30">
                          <td className="py-1.5 pr-3 text-zinc-600">{ev.position}.</td>
                          <td className={`py-1.5 pr-3 font-bold ${stageTextColor(ev.stage)}`}>
                            {ev.stage.replace(/_/g, " ")}
                          </td>
                          <td className="py-1.5 pr-3 text-emerald-300 break-all">{ev.artifactId}</td>
                          <td className="py-1.5 pr-3">
                            <Chip label={ev.status} color={ev.status === "ok" ? "ok" : "warn"} />
                          </td>
                          <td className="py-1.5 text-zinc-400">{ev.durationMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 4: Log Cronologico ── */}
            {tab === "log" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                  Log Cronológico Completo (fatos observados)
                </p>
                <div className="space-y-0.5 max-h-[600px] overflow-y-auto font-mono text-xs">
                  <div className="flex gap-2 border-b border-zinc-800/30 pb-1 mb-1">
                    <span className="text-zinc-700 w-20 shrink-0">{ts(activeTrace.startedAt)}</span>
                    <span className="text-blue-400 w-12 shrink-0">BEGIN</span>
                    <span className="text-zinc-500">run#{activeTrace.runIndex} exec={activeTrace.executionId?.slice(-12)}</span>
                  </div>

                  {events.map(ev => {
                    const textCol = stageTextColor(ev.stage);
                    const deltaKeys = Object.keys(ev.ctxDelta);
                    return (
                      <React.Fragment key={ev.traceId}>
                        <div className="flex gap-2 border-b border-zinc-800/20 py-0.5">
                          <span className="text-zinc-700 w-20 shrink-0">{ts(ev.startedAt)}</span>
                          <span className={`w-12 shrink-0 ${textCol}`}>ENTER</span>
                          <span className="text-zinc-500">{ev.stage.replace(/_/g, " ")}</span>
                          <span className="text-zinc-700 ml-auto">pos={ev.position}</span>
                        </div>
                        <div className="flex gap-2 border-b border-zinc-800/30 py-0.5">
                          <span className="text-zinc-700 w-20 shrink-0">{ts(ev.finishedAt)}</span>
                          <span className={`w-12 shrink-0 ${textCol}`}>EXIT</span>
                          <span className="text-zinc-500">{ev.stage.replace(/_/g, " ")}</span>
                          <span className="text-emerald-400 ml-2 truncate">{ev.artifactId.slice(-20)}</span>
                          {deltaKeys.length > 0 && (
                            <span className="text-teal-400 ml-2">+ctx:{deltaKeys.join(",")}</span>
                          )}
                          <span className="text-zinc-700 ml-auto">{ev.durationMs}ms</span>
                        </div>
                      </React.Fragment>
                    );
                  })}

                  {activeTrace.complete && (
                    <div className="flex gap-2 pt-1">
                      <span className="text-zinc-700 w-20 shrink-0">{ts(activeTrace.finishedAt)}</span>
                      <span className="text-emerald-400 w-12 shrink-0">DONE</span>
                      <span className="text-emerald-300">{activeTrace.totalDurationMs}ms total</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB 5: Exportar ── */}
            {tab === "export" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-2">Exportar Runtime Trace Oficial</p>
                  <p className="text-zinc-600 text-xs mb-4">
                    O trace exportado contém exclusivamente fatos observados.
                    A interpretacao arquitetural será responsabilidade da EF-60B.
                  </p>
                  <button
                    onClick={async () => {
                      const { OfficialRuntimeTraceStore } = await import("@/lib/runtime-trace/OfficialRuntimeTraceStore");
                      const blob = new Blob([OfficialRuntimeTraceStore.export()], { type: "application/json" });
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

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Preview — Trace Ativo (estrutura)</p>
                  <pre className="text-xs text-zinc-400 overflow-auto max-h-96 font-mono bg-zinc-950 rounded p-3">
                    {JSON.stringify({
                      traceSessionId:  activeTrace.traceSessionId,
                      runIndex:        activeTrace.runIndex,
                      executionId:     activeTrace.executionId,
                      startedAt:       activeTrace.startedAt,
                      finishedAt:      activeTrace.finishedAt,
                      totalDurationMs: activeTrace.totalDurationMs,
                      complete:        activeTrace.complete,
                      eventCount:      events.length,
                      events: events.map(ev => ({
                        position:    ev.position,
                        stage:       ev.stage,
                        startedAt:   ev.startedAt,
                        finishedAt:  ev.finishedAt,
                        durationMs:  ev.durationMs,
                        artifactId:  ev.artifactId,
                        status:      ev.status,
                        ctxDelta:    ev.ctxDelta,
                        keyMetrics:  ev.keyMetrics,
                        summary:     ev.summary,
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