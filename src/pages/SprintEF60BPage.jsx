/**
 * SprintEF60BPage.jsx — EF-60B
 * Auditoria Arquitetural Baseada no Runtime Trace
 *
 * Toda evidencia vem exclusivamente do OfficialRuntimeTraceStore (EF-60A).
 * Nenhuma regra arquitetural codificada aqui.
 */

import React, { useState, useEffect, useCallback } from "react";

// ── Helpers visuais ──────────────────────────────────────────────────────────

const NC_COLORS = {
  STAGE_REPEATED:           "text-orange-400 border-orange-700 bg-orange-950/20",
  CHRONOLOGICAL_VIOLATION:  "text-red-400    border-red-700    bg-red-950/20",
  MISSING_EXECUTION_ID:     "text-red-400    border-red-700    bg-red-950/20",
  MISSING_ARTIFACT_ID:      "text-amber-400  border-amber-700  bg-amber-950/20",
  INCOMPLETE_TRACE:         "text-amber-400  border-amber-700  bg-amber-950/20",
  INCONSISTENT_DURATION:    "text-yellow-400 border-yellow-700 bg-yellow-950/20",
  CONTEXT_BREAK:            "text-red-400    border-red-700    bg-red-950/20",
  ZERO_EVENTS:              "text-zinc-400   border-zinc-700   bg-zinc-900/40",
};

const INTEGRITY_COLORS = {
  HIGH:    { bg: "bg-emerald-900/30 border-emerald-700", text: "text-emerald-300", chip: "bg-emerald-900/60 text-emerald-300 border-emerald-700" },
  MEDIUM:  { bg: "bg-amber-900/30 border-amber-700",     text: "text-amber-300",   chip: "bg-amber-900/60 text-amber-300 border-amber-700" },
  LOW:     { bg: "bg-red-900/30 border-red-700",         text: "text-red-300",     chip: "bg-red-900/60 text-red-300 border-red-700" },
  UNKNOWN: { bg: "bg-zinc-900 border-zinc-700",          text: "text-zinc-400",    chip: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

const STAGE_COLORS = [
  "text-orange-400","text-yellow-400","text-pink-400","text-sky-400",
  "text-emerald-400","text-teal-400","text-violet-400","text-amber-400",
  "text-blue-400","text-rose-400",
];
function stageColor(stage, stages) {
  const idx = stages.indexOf(stage);
  return STAGE_COLORS[idx % STAGE_COLORS.length] ?? "text-zinc-400";
}

function ts(ms) {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(11, 23);
}

function Chip({ label, style = "bg-zinc-800 text-zinc-400 border-zinc-700" }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-300" }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

const TABS = [
  { id: "report",    label: "1. Relatório"      },
  { id: "timeline",  label: "2. Timeline"        },
  { id: "ctx",       label: "3. ExecutionContext" },
  { id: "artifacts", label: "4. Artefatos"       },
  { id: "ncs",       label: "5. NCs"             },
  { id: "sequences", label: "6. Sequências"      },
  { id: "metrics",   label: "7. Métricas"        },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SprintEF60BPage() {
  const [report,  setReport]  = useState(null);
  const [running, setRunning] = useState(false);
  const [tab,     setTab]     = useState("report");
  const [traces,  setTraces]  = useState([]);

  // Carregar traces do store e re-auditar automaticamente ao mudar
  useEffect(() => {
    let mounted = true;
    import("@/lib/runtime-trace/OfficialRuntimeTraceStore").then(({ OfficialRuntimeTraceStore }) => {
      if (!mounted) return;
      const run = () => {
        if (!mounted) return;
        setTraces(OfficialRuntimeTraceStore.getAll());
      };
      run();
      const unsub = OfficialRuntimeTraceStore.subscribe(run);
      return () => { mounted = false; unsub(); };
    });
    return () => { mounted = false; };
  }, []);

  // Executar auditoria sobre os traces disponíveis
  const runAudit = useCallback(async () => {
    setRunning(true);
    try {
      const { OfficialRuntimeTraceStore } = await import("@/lib/runtime-trace/OfficialRuntimeTraceStore");
      const { RuntimeArchitectureAuditor } = await import("@/lib/runtime-audit/RuntimeArchitectureAuditor");
      const all = OfficialRuntimeTraceStore.getAll();
      const auditor = new RuntimeArchitectureAuditor();
      setReport(auditor.audit(all));
    } catch (e) {
      console.error("[EF-60B] Audit error:", e);
    }
    setRunning(false);
  }, []);

  // Executar pipeline EF-60A e depois auditar
  const runPipelineThenAudit = useCallback(async () => {
    setRunning(true);
    try {
      const { CognitiveRuntime } = await import("@/lib/cognitive-runtime/CognitiveRuntime");
      await CognitiveRuntime.execute({
        goal:         "Audit target: GitHub file analysis",
        intent:       "read",
        strategy:     "connector_direct",
        capabilities: ["github.file.read", "knowledge.retrieve"],
        connectors:   ["GitHubConnector"],
        confidence:   0.85,
        authority:    0.90,
        durationMs:   280,
        success:      true,
        context:      "ef60b_audit",
        metadata:     { source: "EF-60B" },
      });
    } catch (e) {
      console.error("[EF-60B] Pipeline error:", e);
    }
    // Auditar após execução
    try {
      const { OfficialRuntimeTraceStore } = await import("@/lib/runtime-trace/OfficialRuntimeTraceStore");
      const { RuntimeArchitectureAuditor } = await import("@/lib/runtime-audit/RuntimeArchitectureAuditor");
      const all = OfficialRuntimeTraceStore.getAll();
      setReport(new RuntimeArchitectureAuditor().audit(all));
    } catch {}
    setRunning(false);
  }, []);

  const r = report;
  const integrityStyle = r ? (INTEGRITY_COLORS[r.integrity.label] ?? INTEGRITY_COLORS.UNKNOWN) : null;
  const allStages = r ? [...new Set(r.timeline.map(e => e.stage))] : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-violet-950/40 to-zinc-900/60 border border-violet-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2">
            <Chip label="EF-60B" style="bg-violet-900/60 text-violet-300 border-violet-700" />
            <Chip label="AUDITORIA ARQUITETURAL" style="bg-blue-900/60 text-blue-300 border-blue-700" />
            <Chip label="BASEADA NO RUNTIME TRACE" style="bg-teal-900/60 text-teal-300 border-teal-700" />
            {r && <Chip label={`${r.tracesAnalyzed} traces`} style="bg-zinc-800 text-zinc-400 border-zinc-700" />}
            {r && <Chip label={`${r.metrics.totalEvents} eventos`} style="bg-zinc-800 text-zinc-400 border-zinc-700" />}
          </div>
          <h1 className="text-xl font-bold text-white mb-1">
            EF-60B — Runtime Architecture Audit Report
          </h1>
          <p className="text-zinc-400 text-sm mb-4">
            Toda evidência provém exclusivamente do{" "}
            <span className="text-teal-400 font-mono">OfficialRuntimeTraceStore</span> (EF-60A).
            Nenhuma regra arquitetural codificada. Nenhuma presunção.
          </p>

          <div className="flex gap-3 flex-wrap">
            <button onClick={runPipelineThenAudit} disabled={running}
              className="px-5 py-2.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-xl text-sm font-bold transition-colors">
              {running ? "Executando..." : "▶ Executar Pipeline + Auditar"}
            </button>
            {traces.length > 0 && (
              <button onClick={runAudit} disabled={running}
                className="px-4 py-2.5 bg-teal-800 hover:bg-teal-700 disabled:opacity-50 rounded-xl text-sm font-bold transition-colors">
                Auditar Traces Existentes ({traces.length})
              </button>
            )}
          </div>

          {/* Integridade */}
          {r && (
            <div className={`mt-4 border rounded-xl p-4 ${integrityStyle.bg}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Chip label={`INTEGRIDADE: ${r.integrity.label}`} style={integrityStyle.chip} />
                <span className={`text-2xl font-bold font-mono ${integrityStyle.text}`}>{r.integrity.score}/100</span>
                <span className="text-zinc-500 text-xs">Gerado: {ts(r.generatedAt)}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                {r.integrity.details.map((d, i) => (
                  <p key={i} className={`text-xs ${integrityStyle.text}`}>• {d}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Nenhum relatório disponível</p>
            <p className="text-zinc-600 text-xs">
              Execute a pipeline para gerar traces (EF-60A) e depois execute a auditoria (EF-60B).
            </p>
          </div>
        )}

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando pipeline e auditando traces...</p>
          </div>
        )}

        {/* ── Tabs ── */}
        {r && r.tracesAnalyzed > 0 && (
          <>
            <div className="flex flex-wrap gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"
                  }`}>
                  {t.label}
                  {t.id === "ncs" && r.nonConformities.length > 0 && (
                    <span className="ml-1.5 bg-red-700 text-white rounded-full px-1.5 text-xs">
                      {r.nonConformities.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── TAB 1: Relatório ── */}
            {tab === "report" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Metric label="Traces analisados" value={r.tracesAnalyzed} color="text-violet-400" />
                  <Metric label="Completos"          value={r.metrics.completeTraces} color="text-emerald-400" />
                  <Metric label="Incompletos"        value={r.metrics.incompleteTraces} color={r.metrics.incompleteTraces > 0 ? "text-red-400" : "text-zinc-500"} />
                  <Metric label="Não-conformidades"  value={r.nonConformities.length} color={r.nonConformities.length > 0 ? "text-amber-400" : "text-emerald-400"} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Metric label="Eventos observados" value={r.metrics.totalEvents}     color="text-sky-400" />
                  <Metric label="Artefatos"          value={r.metrics.totalArtifacts}  color="text-teal-400" />
                  <Metric label="Mudanças ctx"       value={r.metrics.totalCtxChanges} color="text-blue-400" />
                  <Metric label="Integridade"        value={`${r.integrity.score}/100`} color={integrityStyle.text} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Duração média" value={`${r.metrics.avgDurationMs}ms`} color="text-zinc-300" />
                  <Metric label="Duração min"   value={`${r.metrics.minDurationMs}ms`} color="text-zinc-300" />
                  <Metric label="Duração max"   value={`${r.metrics.maxDurationMs}ms`} color="text-zinc-300" />
                </div>

                {/* Resumo das sequências observadas */}
                {r.stageSequences.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Sequências de Stages Observadas</p>
                    {r.stageSequences.map((seq, i) => (
                      <div key={i} className="mb-3 last:mb-0">
                        <p className="text-zinc-600 font-mono text-xs mb-1">
                          Run #{seq.runIndex} · exec={seq.executionId.slice(-12)}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {seq.sequence.map((s, j) => (
                            <React.Fragment key={j}>
                              <span className={`font-mono text-xs font-bold ${stageColor(s, allStages)}`}>
                                {s.replace(/_/g, " ")}
                              </span>
                              {j < seq.sequence.length - 1 && (
                                <span className="text-zinc-700 text-xs">→</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 2: Timeline ── */}
            {tab === "timeline" && (
              <div>
                <p className="text-zinc-600 text-xs font-mono mb-3">
                  {r.timeline.length} eventos • ordem cronológica por startedAt observado
                </p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-600 border-b border-zinc-800 bg-zinc-900/80">
                        {["Pos","Stage","ArtifactId","Status","Duração","Timestamp"].map(h => (
                          <td key={h} className="py-2 px-3">{h}</td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.timeline.map((ev, i) => (
                        <tr key={ev.traceId} className={`border-b border-zinc-800/30 hover:bg-zinc-800/20 ${i % 2 === 0 ? "" : "bg-zinc-900/30"}`}>
                          <td className="py-1.5 px-3 text-zinc-600">{ev.position}.</td>
                          <td className={`py-1.5 px-3 font-bold ${stageColor(ev.stage, allStages)}`}>
                            {ev.stage.replace(/_/g, " ")}
                          </td>
                          <td className="py-1.5 px-3 text-emerald-400 max-w-[180px] truncate">{ev.artifactId}</td>
                          <td className="py-1.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              ev.status === "ok" ? "bg-emerald-900/40 text-emerald-300" : "bg-amber-900/40 text-amber-300"
                            }`}>{ev.status}</span>
                          </td>
                          <td className="py-1.5 px-3 text-zinc-400">{ev.durationMs}ms</td>
                          <td className="py-1.5 px-3 text-zinc-600">{ts(ev.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 3: ExecutionContext changelog ── */}
            {tab === "ctx" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                    Propagação do ExecutionContext — Campos Observados ({r.ctxChangelog.length} adições)
                  </p>
                  {r.ctxChangelog.length === 0 ? (
                    <p className="text-zinc-600 text-xs">Nenhuma alteração de ctx registrada.</p>
                  ) : (
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-zinc-600 border-b border-zinc-800">
                          {["Campo","Stage (observado)","Posição","Tipo"].map(h => (
                            <td key={h} className="py-1.5 pr-4">{h}</td>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.ctxChangelog.map((c, i) => (
                          <tr key={i} className="border-b border-zinc-800/30">
                            <td className="py-1.5 pr-4 text-teal-400 font-bold">{c.field}</td>
                            <td className={`py-1.5 pr-4 ${stageColor(c.stage, allStages)}`}>
                              {c.stage.replace(/_/g, " ")}
                            </td>
                            <td className="py-1.5 pr-4 text-zinc-500">{c.position}</td>
                            <td className="py-1.5">
                              <span className="bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded">{c.type}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* ctx final observado do último trace */}
                {traces.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs font-bold uppercase mb-3">
                      ExecutionContext Final — Último Trace (observado)
                    </p>
                    <div className="max-h-72 overflow-y-auto space-y-0.5">
                      {Object.entries(traces[traces.length - 1]?.ctxFinal ?? {}).map(([k, v]) => (
                        <div key={k} className="flex gap-3 border-b border-zinc-800/30 py-0.5 font-mono text-xs">
                          <span className="text-zinc-400 w-36 shrink-0">{k}</span>
                          <span className="text-zinc-300 break-all flex-1">{String(v).slice(0, 80)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 4: Artefatos ── */}
            {tab === "artifacts" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                  <p className="text-zinc-400 text-xs font-bold uppercase">
                    Artefatos Observados ({r.artifacts.length})
                  </p>
                  <p className="text-zinc-600 text-xs font-mono">Sem presunção de ownership ou contrato</p>
                </div>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-zinc-600 border-b border-zinc-800">
                      {["Stage","ArtifactId (observado)","Run#","Criado em","Duração","Status"].map(h => (
                        <td key={h} className="py-2 px-3">{h}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.artifacts.map((a, i) => (
                      <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                        <td className={`py-1.5 px-3 font-bold ${stageColor(a.stage, allStages)}`}>
                          {a.stage.replace(/_/g, " ")}
                        </td>
                        <td className="py-1.5 px-3 text-emerald-400 max-w-[200px] truncate">{a.artifactId}</td>
                        <td className="py-1.5 px-3 text-zinc-500">#{a.runIndex}</td>
                        <td className="py-1.5 px-3 text-zinc-600">{ts(a.createdAt)}</td>
                        <td className="py-1.5 px-3 text-zinc-400">{a.durationMs}ms</td>
                        <td className="py-1.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded ${
                            a.status === "ok" ? "bg-emerald-900/40 text-emerald-300" : "bg-amber-900/40 text-amber-300"
                          }`}>{a.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── TAB 5: Não-conformidades ── */}
            {tab === "ncs" && (
              <div>
                {r.nonConformities.length === 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-800 rounded-xl p-8 text-center">
                    <p className="text-emerald-300 font-bold text-sm">Nenhuma não-conformidade detectada</p>
                    <p className="text-emerald-700 text-xs mt-1">Todos os traces observados estão dentro dos padrões detectáveis.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-zinc-600 text-xs font-mono mb-2">
                      {r.nonConformities.length} NC(s) detectada(s) — baseadas exclusivamente em evidências observáveis
                    </p>
                    {r.nonConformities.map(nc => (
                      <div key={nc.id} className={`border rounded-xl p-4 ${NC_COLORS[nc.type] ?? "border-zinc-700 bg-zinc-900"}`}>
                        <div className="flex flex-wrap gap-2 mb-2 items-center">
                          <span className="font-mono font-bold text-xs">{nc.id}</span>
                          <span className="font-mono text-xs opacity-70">{nc.type}</span>
                          {nc.stage && (
                            <span className={`font-mono text-xs font-bold ${stageColor(nc.stage, allStages)}`}>
                              {nc.stage.replace(/_/g, " ")}
                            </span>
                          )}
                          {nc.position && <span className="text-zinc-600 font-mono text-xs">pos={nc.position}</span>}
                        </div>
                        <p className="text-sm text-zinc-200">{nc.description}</p>
                        <p className="text-xs text-zinc-500 font-mono mt-1">Evidência: {nc.evidence}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 6: Sequências ── */}
            {tab === "sequences" && (
              <div className="space-y-3">
                {r.stageSequences.map((seq, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex flex-wrap gap-2 items-center mb-3">
                      <Chip label={`Run #${seq.runIndex}`} style="bg-zinc-800 text-zinc-300 border-zinc-700" />
                      <span className="text-zinc-600 font-mono text-xs">exec={seq.executionId.slice(-14)}</span>
                      <span className="text-zinc-700 font-mono text-xs">{seq.sequence.length} stages observados</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {seq.sequence.map((s, j) => (
                        <React.Fragment key={j}>
                          <div className={`font-mono text-xs font-bold px-2 py-1 rounded bg-zinc-800/60 ${stageColor(s, allStages)}`}>
                            {j + 1}. {s.replace(/_/g, " ")}
                          </div>
                          {j < seq.sequence.length - 1 && (
                            <span className="text-zinc-700">→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── TAB 7: Métricas por Stage ── */}
            {tab === "metrics" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-zinc-800">
                    <p className="text-zinc-400 text-xs font-bold uppercase">Métricas por Stage (observadas)</p>
                  </div>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-600 border-b border-zinc-800">
                        {["Stage","Execuções","Total ms","Avg ms","Min ms","Max ms","Statuses"].map(h => (
                          <td key={h} className="py-2 px-3">{h}</td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.metrics.stageMetrics.map((sm, i) => (
                        <tr key={sm.stage} className={`border-b border-zinc-800/30 ${i % 2 === 0 ? "" : "bg-zinc-900/30"}`}>
                          <td className={`py-1.5 px-3 font-bold ${stageColor(sm.stage, allStages)}`}>
                            {sm.stage.replace(/_/g, " ")}
                          </td>
                          <td className="py-1.5 px-3 text-zinc-300">{sm.count}</td>
                          <td className="py-1.5 px-3 text-zinc-400">{sm.totalMs}</td>
                          <td className="py-1.5 px-3 text-violet-400 font-bold">{sm.avgMs}</td>
                          <td className="py-1.5 px-3 text-zinc-500">{sm.minMs}</td>
                          <td className="py-1.5 px-3 text-zinc-500">{sm.maxMs}</td>
                          <td className="py-1.5 px-3 text-zinc-600">
                            {Object.entries(sm.statuses).map(([s, n]) => `${s}:${n}`).join(" ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Barra visual de tempo por stage */}
                {r.metrics.stageMetrics.length > 0 && (() => {
                  const maxAvg = Math.max(...r.metrics.stageMetrics.map(s => s.avgMs), 1);
                  return (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Tempo Médio por Stage (ms)</p>
                      {r.metrics.stageMetrics.map(sm => (
                        <div key={sm.stage} className="flex items-center gap-3 mb-2 text-xs font-mono">
                          <span className={`w-32 shrink-0 ${stageColor(sm.stage, allStages)}`}>
                            {sm.stage.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${stageColor(sm.stage, allStages).replace("text-", "bg-")}`}
                              style={{ width: `${(sm.avgMs / maxAvg) * 100}%`, opacity: 0.7 }}
                            />
                          </div>
                          <span className="text-zinc-400 w-14 text-right">{sm.avgMs}ms</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}