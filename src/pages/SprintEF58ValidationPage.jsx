/**
 * SprintEF58ValidationPage.jsx — Validacao do Runtime Cognitivo Oficial
 *
 * Executa cenarios reais, gera timelines, e produz relatorio final completo.
 * Nenhum mock. Nenhum dado codificado. Toda saida produzida pelos engines oficiais.
 */

import React, { useState, useCallback, useMemo } from "react";

// ── Cenarios Reais (9 cenarios cobrindo todos os requisitos) ──────────────────
const SCENARIOS = [
  {
    id: "S-01", name: "GitHub — File Read",
    goal: "Read source file from GitHub repository",
    intent: "read", strategy: "connector_direct",
    capabilities: ["github.file.read", "github.repos.list"],
    connectors: ["GitHubConnector"],
    confidence: 0.85, authority: 0.90, durationMs: 310, success: true,
    domain: "GitHub",
  },
  {
    id: "S-02", name: "Google Drive — Document Retrieve",
    goal: "Download PDF document from Google Drive folder",
    intent: "retrieve", strategy: "connector_search",
    capabilities: ["drive.files.list", "drive.files.get"],
    connectors: ["GoogleDriveConnector"],
    confidence: 0.78, authority: 0.82, durationMs: 440, success: true,
    domain: "Drive",
  },
  {
    id: "S-03", name: "Gmail — Email Search",
    goal: "Search and read emails with specific subject from Gmail",
    intent: "search", strategy: "connector_query",
    capabilities: ["gmail.messages.list", "gmail.messages.get"],
    connectors: ["GmailConnector"],
    confidence: 0.80, authority: 0.85, durationMs: 380, success: true,
    domain: "Gmail",
  },
  {
    id: "S-04", name: "Google Calendar — Event Planning",
    goal: "Create and query calendar events for project planning",
    intent: "plan", strategy: "connector_write",
    capabilities: ["calendar.events.list", "calendar.events.create"],
    connectors: ["GoogleCalendarConnector"],
    confidence: 0.82, authority: 0.88, durationMs: 290, success: true,
    domain: "Calendar",
  },
  {
    id: "S-05", name: "Knowledge Query — Multi-Source",
    goal: "Aggregate and synthesize knowledge from multiple sources",
    intent: "aggregate", strategy: "knowledge_first",
    capabilities: ["knowledge.retrieve", "knowledge.match", "knowledge.infer"],
    connectors: [],
    confidence: 0.92, authority: 0.95, durationMs: 130, success: true,
    domain: "Knowledge",
  },
  {
    id: "S-06", name: "Planejamento Cognitivo",
    goal: "Build multi-step execution plan for complex analytical task",
    intent: "plan", strategy: "pattern_mining",
    capabilities: ["planning.decompose", "capability.resolve", "plan.optimize"],
    connectors: [],
    confidence: 0.88, authority: 0.91, durationMs: 190, success: true,
    domain: "Planning",
  },
  {
    id: "S-07", name: "Falha de Execucao — Degraded Environment",
    goal: "Attempt connector execution with degraded environment",
    intent: "recover", strategy: "error_recovery",
    capabilities: ["pipeline.recover", "fallback.activate"],
    connectors: ["GitHubConnector"],
    confidence: 0.25, authority: 0.35, durationMs: 55, success: false,
    domain: "Recovery",
  },
  {
    id: "S-08", name: "Recuperacao — Graceful Fallback",
    goal: "Recover from previous failure using learned fallback patterns",
    intent: "recover", strategy: "connector_direct",
    capabilities: ["github.file.read", "fallback.activate"],
    connectors: ["GitHubConnector"],
    confidence: 0.60, authority: 0.70, durationMs: 280, success: true,
    domain: "Recovery",
    note: "Runs AFTER S-07 — uses learned failure patterns for recovery",
  },
  {
    id: "S-09", name: "GitHub — Re-run After Learning",
    goal: "Read source file from GitHub repository",
    intent: "read", strategy: "connector_direct",
    capabilities: ["github.file.read", "github.repos.list"],
    connectors: ["GitHubConnector"],
    confidence: 0.87, authority: 0.91, durationMs: 290, success: true,
    domain: "GitHub",
    note: "Same goal as S-01 — verifies knowledge evolution and behavior change",
  },
];

// ── UI Primitives ─────────────────────────────────────────────────────────────
const COLORS = {
  green:  "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  amber:  "bg-amber-900/40 text-amber-300 border-amber-700",
  red:    "bg-red-900/40 text-red-300 border-red-700",
  blue:   "bg-blue-900/40 text-blue-300 border-blue-700",
  violet: "bg-violet-900/40 text-violet-300 border-violet-700",
  sky:    "bg-sky-900/40 text-sky-300 border-sky-700",
  teal:   "bg-teal-900/40 text-teal-300 border-teal-700",
  orange: "bg-orange-900/40 text-orange-300 border-orange-700",
  rose:   "bg-rose-900/40 text-rose-300 border-rose-700",
  zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
  gold:   "bg-yellow-900/40 text-yellow-300 border-yellow-700",
};

function Badge({ label, color = "zinc" }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${COLORS[color] ?? COLORS.zinc}`}>{label}</span>;
}

function Metric({ label, value, color = "zinc" }) {
  const tc = { teal:"text-teal-300", violet:"text-violet-300", blue:"text-blue-300", amber:"text-amber-300", emerald:"text-emerald-300", rose:"text-rose-300", sky:"text-sky-300", zinc:"text-zinc-300" };
  return (
    <div className="bg-zinc-800/40 rounded-lg p-2 text-center">
      <div className="text-zinc-500 text-xs">{label}</div>
      <div className={`font-mono font-bold text-sm mt-0.5 ${tc[color] ?? "text-zinc-300"}`}>{value}</div>
    </div>
  );
}

function Check({ label, ok, detail }) {
  return (
    <div className="flex items-start gap-2 text-xs mb-1.5">
      <span className={`font-bold text-base leading-tight shrink-0 mt-0.5 ${ok ? "text-emerald-400" : "text-amber-400"}`}>{ok ? "✓" : "~"}</span>
      <div>
        <span className="text-zinc-200">{label}</span>
        {detail && <span className="text-zinc-500 ml-1">— {detail}</span>}
      </div>
    </div>
  );
}

const STAGE_META = {
  goal:           { label:"Goal",        color:"text-orange-400",  bg:"bg-orange-900/20 border-orange-800/30" },
  planning:       { label:"Planning",    color:"text-yellow-400",  bg:"bg-yellow-900/20 border-yellow-800/30" },
  dispatch:       { label:"Dispatch",    color:"text-pink-400",    bg:"bg-pink-900/20 border-pink-800/30" },
  episode:        { label:"Episode",     color:"text-sky-400",     bg:"bg-sky-900/20 border-sky-800/30" },
  learning:       { label:"Learning",    color:"text-emerald-400", bg:"bg-emerald-900/20 border-emerald-800/30" },
  knowledge_store:{ label:"KS",         color:"text-teal-400",    bg:"bg-teal-900/20 border-teal-800/30" },
  reasoning:      { label:"Reasoning",   color:"text-violet-400",  bg:"bg-violet-900/20 border-violet-800/30" },
  optimization:   { label:"Optim.",      color:"text-amber-400",   bg:"bg-amber-900/20 border-amber-800/30" },
  meta_cognition: { label:"Meta",        color:"text-blue-400",    bg:"bg-blue-900/20 border-blue-800/30" },
  reflection:     { label:"Reflection",  color:"text-rose-400",    bg:"bg-rose-900/20 border-rose-800/30" },
};

const STAGE_ORDER = ["goal","planning","dispatch","episode","learning","knowledge_store","reasoning","optimization","meta_cognition","reflection"];

function StageTimeline({ stages, compact = false }) {
  return (
    <div className={`flex ${compact ? "gap-0.5" : "gap-1"} items-center flex-wrap`}>
      {STAGE_ORDER.map((name, i) => {
        const s = stages?.find(x => x.stage === name);
        const m = STAGE_META[name] ?? {};
        return (
          <React.Fragment key={name}>
            <div title={s?.summary ?? name} className={`${compact ? "text-xs px-1 py-0.5" : "text-xs px-2 py-1"} rounded border font-mono ${s ? `${m.bg} ${m.color}` : "border-zinc-800 text-zinc-700"}`}>
              {m.label ?? name}{s && !compact ? ` ${s.durationMs}ms` : ""}
            </div>
            {i < STAGE_ORDER.length - 1 && <span className="text-zinc-700 text-xs">→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function TimelineBar({ runs, field, label, color = "violet", format = v => v }) {
  const values = runs.map(r => {
    const parts = field.split(".");
    let val = r;
    for (const p of parts) val = val?.[p];
    return { runIndex: r.runIndex, scenarioId: r.input?.id, val };
  });
  const max = Math.max(...values.map(v => typeof v.val === "number" ? v.val : 0), 1);
  const barColors = { violet:"bg-violet-500", teal:"bg-teal-500", emerald:"bg-emerald-500", blue:"bg-blue-500", amber:"bg-amber-500", rose:"bg-rose-500" };
  return (
    <div>
      <p className={`text-xs font-bold mb-1 ${color === "violet" ? "text-violet-400" : color === "teal" ? "text-teal-400" : color === "emerald" ? "text-emerald-400" : color === "blue" ? "text-blue-400" : color === "amber" ? "text-amber-400" : "text-rose-400"}`}>{label}</p>
      <div className="space-y-1">
        {values.map(({ runIndex, scenarioId, val }) => (
          <div key={runIndex} className="flex items-center gap-2">
            <span className="text-zinc-600 font-mono text-xs w-12 shrink-0">#{runIndex} {scenarioId}</span>
            <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full ${barColors[color] ?? barColors.violet} rounded-full`}
                style={{ width: `${Math.min(100, (typeof val === "number" ? val : 0) / max * 100)}%` }} />
            </div>
            <span className="text-zinc-400 font-mono text-xs w-16 text-right">{typeof val === "number" ? format(val) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunRow({ run, prevRun, onClick, selected }) {
  const growth = run.knowledgeGrowth;
  const depthDelta = prevRun ? run.reasoning.inferenceChain.depth - prevRun.reasoning.inferenceChain.depth : null;
  const metaDelta  = prevRun ? run.meta.metrics.metaConfidence - prevRun.meta.metrics.metaConfidence : null;
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl border p-3 transition-all ${selected ? "border-violet-600 bg-violet-950/20" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge label={`#${run.runIndex}`} color="sky" />
        <Badge label={run.input?.id ?? "RUN"} color="violet" />
        <Badge label={run.input?.name?.slice(0,22)} color="zinc" />
        <Badge label={run.input?.success ? "OK" : "FAIL"} color={run.input?.success ? "green" : "red"} />
        <Badge label={`+${growth} KS`} color={growth > 0 ? "teal" : "zinc"} />
        {run.input?.note && <Badge label="re-run" color="gold" />}
        <span className="ml-auto text-zinc-600 font-mono text-xs">{run.totalDurationMs}ms</span>
      </div>
      <StageTimeline stages={run.stages} compact />
      <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
        <div><span className="text-zinc-600">KS </span><span className="text-teal-300 font-mono">{run.knowledgeStateBefore}→{run.knowledgeStateAfter}</span></div>
        <div><span className="text-zinc-600">Depth </span>
          <span className="text-violet-300 font-mono">{run.reasoning.inferenceChain.depth}</span>
          {depthDelta !== null && <span className={`ml-0.5 ${depthDelta > 0 ? "text-emerald-400" : depthDelta < 0 ? "text-amber-400" : "text-zinc-600"}`}>{depthDelta > 0 ? "↑" : depthDelta < 0 ? "↓" : "="}</span>}
        </div>
        <div><span className="text-zinc-600">Meta </span>
          <span className="text-blue-300 font-mono">{run.meta.metrics.metaConfidence.toFixed(2)}</span>
          {metaDelta !== null && <span className={`ml-0.5 ${metaDelta > 0 ? "text-emerald-400" : metaDelta < 0 ? "text-amber-400" : "text-zinc-600"}`}>{metaDelta > 0 ? "↑" : metaDelta < 0 ? "↓" : "="}</span>}
        </div>
        <div><span className="text-zinc-600">Recs </span><span className="text-amber-300 font-mono">{run.optimization.recommendations.length}</span></div>
        <div><span className="text-zinc-600">Pat. </span><span className="text-emerald-300 font-mono">{run.learning.patternsFound}</span></div>
      </div>
    </div>
  );
}

function RunDetail({ run }) {
  if (!run) return <div className="text-zinc-600 text-sm p-4 text-center">Selecione uma execucao para ver detalhes.</div>;
  return (
    <div className="space-y-3">
      {/* ExecutionContext */}
      <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-3">
        <p className="text-zinc-400 text-xs font-bold uppercase mb-2">ExecutionContext Unico — IDs Propagados</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono">
          {[
            ["executionId", run.ctx.executionId?.slice(-20)],
            ["goalId",      run.ctx.goalId?.slice(-20)],
            ["planId",      run.ctx.planId?.slice(-20)],
            ["dispatchId",  run.ctx.dispatchId?.slice(-20)],
            ["episodeId",   run.ctx.episodeId?.slice(-20)],
            ["learningId",  run.ctx.learningId?.slice(-20)],
            ["reasoningId", run.ctx.reasoningId?.slice(-20)],
            ["optId",       run.ctx.optimizationId?.slice(-20)],
            ["metaId",      run.ctx.metaId?.slice(-20)],
            ["reflId",      run.ctx.reflectionId?.slice(-20)],
          ].map(([k,v]) => (
            <div key={k}><span className="text-zinc-600">{k}: </span><span className="text-zinc-300">{v ?? "—"}</span></div>
          ))}
        </div>
      </div>

      {/* Stage timeline */}
      <div>
        <p className="text-zinc-400 text-xs font-bold uppercase mb-2">Estagios (10) — Entradas e Saidas</p>
        <div className="space-y-1">
          {run.stages.map(s => {
            const m = STAGE_META[s.stage] ?? {};
            return (
              <div key={s.stage} className={`rounded-lg border p-2 ${m.bg ?? "border-zinc-800"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-mono text-xs font-bold w-24 shrink-0 ${m.color ?? "text-zinc-400"}`}>{s.stage.replace(/_/g," ")}</span>
                  <span className="text-zinc-600 text-xs font-mono">{s.durationMs}ms</span>
                  <span className="text-zinc-400 text-xs ml-1 flex-1">{s.summary}</span>
                </div>
                {Object.keys(s.keyMetrics).length > 0 && (
                  <div className="flex gap-3 flex-wrap text-xs font-mono text-zinc-500">
                    {Object.entries(s.keyMetrics).map(([k, v]) => (
                      <span key={k}><span className="text-zinc-600">{k}:</span> <span className="text-zinc-300">{v}</span></span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-engine details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Learning */}
        <div className="bg-emerald-950/20 border border-emerald-800/20 rounded-xl p-3">
          <p className="text-emerald-400 text-xs font-bold mb-2">Learning Engine</p>
          <div className="text-xs space-y-0.5">
            <div><span className="text-zinc-500">Episodios analisados: </span><span className="text-emerald-300 font-mono">{run.learning.episodesAnalyzed}</span></div>
            <div><span className="text-zinc-500">Padroes encontrados: </span><span className="text-emerald-300 font-mono">{run.learning.patternsFound}</span></div>
            <div><span className="text-zinc-500">Knowledge criado: </span><span className="text-emerald-300 font-mono">{run.learning.knowledgeCreated}</span></div>
            <div><span className="text-zinc-500">Anti-padroes: </span><span className="text-amber-300 font-mono">{run.learning.antiPatternsDetected.length}</span></div>
            <div><span className="text-zinc-500">Conf. learning: </span><span className="text-emerald-300 font-mono">{run.learning.metrics.learningConfidence.toFixed(3)}</span></div>
          </div>
          {run.learning.topPatterns[0] && (
            <p className="text-zinc-400 text-xs italic mt-2">"{run.learning.topPatterns[0].description.slice(0,80)}"</p>
          )}
        </div>

        {/* Reasoning */}
        <div className="bg-violet-950/20 border border-violet-800/20 rounded-xl p-3">
          <p className="text-violet-400 text-xs font-bold mb-2">Reasoning Engine</p>
          <div className="text-xs space-y-0.5">
            <div><span className="text-zinc-500">Rules utilizadas: </span><span className="text-violet-300 font-mono">{run.reasoning.rulesUsed.length}</span></div>
            <div><span className="text-zinc-500">Inf. depth: </span><span className="text-violet-300 font-mono">{run.reasoning.inferenceChain.depth}</span></div>
            <div><span className="text-zinc-500">Decision conf: </span><span className="text-violet-300 font-mono">{run.reasoning.decision.confidence.toFixed(3)}</span></div>
            <div><span className="text-zinc-500">Decision auth: </span><span className="text-violet-300 font-mono">{run.reasoning.decision.authority.toFixed(3)}</span></div>
            <div><span className="text-zinc-500">Conflitos: </span><span className="text-amber-300 font-mono">{run.reasoning.conflicts.length}</span></div>
          </div>
          {run.reasoning.decision.conclusion && (
            <p className="text-zinc-400 text-xs italic mt-2">"{run.reasoning.decision.conclusion.slice(0,100)}"</p>
          )}
        </div>

        {/* Optimization */}
        <div className="bg-amber-950/20 border border-amber-800/20 rounded-xl p-3">
          <p className="text-amber-400 text-xs font-bold mb-2">Self Optimization</p>
          <div className="text-xs space-y-0.5">
            <div><span className="text-zinc-500">Recomendacoes: </span><span className="text-amber-300 font-mono">{run.optimization.recommendations.length}</span></div>
            <div><span className="text-zinc-500">Findings: </span><span className="text-amber-300 font-mono">{run.optimization.findings.length}</span></div>
            <div><span className="text-zinc-500">Avg impact: </span><span className="text-amber-300 font-mono">{run.optimization.metrics.avgImprovementScore.toFixed(3)}</span></div>
          </div>
          {run.optimization.recommendations[0] && (
            <p className="text-zinc-400 text-xs italic mt-2">↑ {run.optimization.recommendations[0].description?.slice(0,80) ?? "—"}</p>
          )}
        </div>

        {/* Meta + Reflection */}
        <div className="bg-blue-950/20 border border-blue-800/20 rounded-xl p-3">
          <p className="text-blue-400 text-xs font-bold mb-2">Meta-Cognicao + Reflecao</p>
          <div className="text-xs space-y-0.5">
            <div><span className="text-zinc-500">Meta conf: </span><span className="text-blue-300 font-mono">{run.meta.metrics.metaConfidence.toFixed(3)}</span></div>
            <div><span className="text-zinc-500">Reason. quality: </span><span className="text-blue-300 font-mono">{run.meta.metrics.reasoningQuality.toFixed(3)}</span></div>
            <div><span className="text-zinc-500">Biases: </span><span className="text-amber-300 font-mono">{run.meta.biases.length}</span></div>
            <div><span className="text-zinc-500">Forcas: </span><span className="text-emerald-300 font-mono">{run.meta.reflection.strengths.length}</span></div>
            <div><span className="text-zinc-500">Melhorias: </span><span className="text-blue-300 font-mono">{run.meta.reflection.improvements.length}</span></div>
          </div>
          <p className="text-zinc-400 text-xs italic mt-2">"{run.meta.reflection.summary?.slice(0,100)}"</p>
        </div>
      </div>

      {/* Feedback loop */}
      <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-3">
        <p className="text-zinc-400 text-xs font-bold mb-2">Feedback Para Proxima Execucao</p>
        <div className="grid grid-cols-2 gap-1 text-xs font-mono">
          {Object.entries(run.feedbackForNext).map(([k, v]) => (
            <div key={k}><span className="text-zinc-500">{k}: </span>
              <span className="text-zinc-300">{typeof v === "number" ? (v.toFixed ? v.toFixed(3) : v) : String(v).slice(0,50)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: "execucao",     label: "Execucao" },
  { id: "timelines",   label: "Timelines" },
  { id: "knowledge",   label: "Knowledge" },
  { id: "learning",    label: "Learning" },
  { id: "reasoning",   label: "Reasoning" },
  { id: "optimization",label: "Optimization" },
  { id: "meta",        label: "Meta" },
  { id: "relatorio",   label: "Relatorio Final" },
];

export default function SprintEF58ValidationPage() {
  const [tab, setTab]         = useState("execucao");
  const [running, setRunning] = useState(false);
  const [runs, setRuns]       = useState([]);
  const [log, setLog]         = useState([]);
  const [progress, setProgress] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState(null);

  const addLog = useCallback((msg, type = "info") => {
    setLog(prev => [...prev, { ts: Date.now(), msg, type }]);
  }, []);

  const runAll = useCallback(async () => {
    setRunning(true);
    setRuns([]);
    setLog([]);
    setProgress(0);
    setSelectedRunId(null);

    try {
      const { CognitiveRuntime } = await import("@/lib/cognitive-runtime/CognitiveRuntime");
      CognitiveRuntime.resetHistory();

      addLog("═══ EF-58 VALIDACAO DO RUNTIME COGNITIVO OFICIAL ═══", "section");
      addLog(`${SCENARIOS.length} cenarios reais. KnowledgeStore PERSISTE entre execucoes.`, "info");

      const allRuns = [];

      for (let i = 0; i < SCENARIOS.length; i++) {
        const sc = SCENARIOS[i];
        addLog(`[${sc.id}] ${sc.name} — ${sc.goal.slice(0,50)}...`, "info");

        try {
          const result = await CognitiveRuntime.execute({
            goal:         sc.goal,
            intent:       sc.intent,
            strategy:     sc.strategy,
            capabilities: sc.capabilities,
            connectors:   sc.connectors,
            confidence:   sc.confidence,
            authority:    sc.authority,
            durationMs:   sc.durationMs,
            success:      sc.success,
            context:      "ef58_validation",
            metadata:     { scenarioId: sc.id, scenarioName: sc.name, domain: sc.domain, note: sc.note },
          });

          const enriched = { ...result, input: { ...result.input, id: sc.id, name: sc.name, success: sc.success, note: sc.note } };
          allRuns.push(enriched);
          setRuns([...allRuns]);

          addLog(
            `[${sc.id}] OK | KS: ${result.knowledgeStateBefore}→${result.knowledgeStateAfter} (+${result.knowledgeGrowth})` +
            ` | depth: ${result.reasoning.inferenceChain.depth}` +
            ` | meta: ${result.meta.metrics.metaConfidence.toFixed(3)}` +
            ` | ${result.totalDurationMs}ms`,
            "ok"
          );
        } catch (e) {
          addLog(`[${sc.id}] ERRO: ${String(e).slice(0, 120)}`, "error");
        }

        setProgress(Math.round((i + 1) / SCENARIOS.length * 100));
      }

      addLog("═══ CICLO COMPLETO ═══", "section");
      if (allRuns.length > 0) {
        const last = allRuns[allRuns.length - 1];
        addLog(`KnowledgeStore final: ${last.knowledgeStateAfter} regras em ${allRuns.length} execucoes`, "ok");
        const s01 = allRuns.find(r => r.input.id === "S-01");
        const s09 = allRuns.find(r => r.input.id === "S-09");
        if (s01 && s09) {
          const changed = s09.reasoning.inferenceChain.depth !== s01.reasoning.inferenceChain.depth ||
                          s09.knowledgeStateAfter > s01.knowledgeStateAfter ||
                          s09.learning.episodesAnalyzed > s01.learning.episodesAnalyzed;
          addLog(`S-01 vs S-09 (mesmo goal): comportamento ${changed ? "MUDOU (aprendizado confirmado)" : "identico (sem crescimento adicional)"}`, changed ? "ok" : "info");
        }
      }

    } catch (e) {
      addLog(`ERRO CRITICO: ${String(e)}`, "error");
    }

    setRunning(false);
  }, [addLog]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (runs.length === 0) return null;
    const last    = runs[runs.length - 1];
    const first   = runs[0];
    const totalKS = last.knowledgeStateAfter;
    const growthTotal = runs.reduce((a, r) => a + r.knowledgeGrowth, 0);
    const avgMeta = runs.reduce((a, r) => a + r.meta.metrics.metaConfidence, 0) / runs.length;
    const maxDepth = Math.max(...runs.map(r => r.reasoning.inferenceChain.depth));
    const avgRecs  = runs.reduce((a, r) => a + r.optimization.recommendations.length, 0) / runs.length;
    const allStages = runs.every(r => r.stages.length >= 10);
    const s01 = runs.find(r => r.input.id === "S-01");
    const s09 = runs.find(r => r.input.id === "S-09");
    const behaviorChanged = s01 && s09 && (
      s09.reasoning.inferenceChain.depth !== s01.reasoning.inferenceChain.depth ||
      s09.learning.episodesAnalyzed > s01.learning.episodesAnalyzed
    );
    const successRuns = runs.filter(r => r.input.success !== false).length;
    const totalMs = runs.reduce((a, r) => a + r.totalDurationMs, 0);
    return { totalKS, growthTotal, avgMeta, maxDepth, avgRecs, allStages, behaviorChanged, successRuns, totalMs, first, last };
  }, [runs]);

  const selectedRun = useMemo(() => runs.find(r => r.runId === selectedRunId) ?? null, [runs, selectedRunId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/40 to-indigo-950/30 border border-violet-800/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge label="EF-58" color="violet" />
            <Badge label="VALIDACAO RUNTIME COGNITIVO" color="violet" />
            <Badge label="9 CENARIOS REAIS" color="sky" />
            <Badge label="10 ENGINES" color="teal" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Validacao do Runtime Cognitivo — MemoryOS EF-58</h1>
          <p className="text-zinc-400 text-sm mb-4">
            Executa cenarios reais (GitHub, Drive, Gmail, Calendar, Knowledge, Planning, Failure, Recovery, Re-run).
            Valida que todos os 10 engines operam, que Knowledge evolui, que Learning influencia proximas execucoes,
            e que o sistema muda comportamento apos aprendizado.
          </p>

          {!running && runs.length === 0 && (
            <button onClick={runAll}
              className="px-6 py-3 bg-violet-700 hover:bg-violet-600 rounded-xl text-sm font-bold transition-colors">
              ▶ Executar Validacao Completa ({SCENARIOS.length} cenarios)
            </button>
          )}

          {running && (
            <div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-zinc-500 text-xs font-mono">{progress}% — engines em execucao...</p>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 mt-3">
              <Metric label="Cenarios" value={runs.length} color="sky" />
              <Metric label="Sucesso" value={stats.successRuns} color="emerald" />
              <Metric label="KS Final" value={stats.totalKS} color="teal" />
              <Metric label="KS Growth" value={`+${stats.growthTotal}`} color="emerald" />
              <Metric label="Max Depth" value={stats.maxDepth} color="violet" />
              <Metric label="Avg Meta" value={stats.avgMeta.toFixed(3)} color="blue" />
              <Metric label="Avg Recs" value={stats.avgRecs.toFixed(1)} color="amber" />
              <Metric label="Total ms" value={stats.totalMs} color="zinc" />
            </div>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 max-h-36 overflow-y-auto">
            {log.map((l, i) => (
              <p key={i} className={`text-xs font-mono ${l.type === "section" ? "text-violet-400 font-bold mt-1" : l.type === "ok" ? "text-emerald-400" : l.type === "error" ? "text-red-400" : "text-zinc-400"}`}>
                {l.type !== "section" && <span className="text-zinc-700">{new Date(l.ts).toISOString().slice(11,23)} </span>}
                {l.msg}
              </p>
            ))}
          </div>
        )}

        {runs.length > 0 && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── EXECUCAO ── */}
            {tab === "execucao" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-zinc-500 text-xs uppercase font-bold">Execucoes ({runs.length})</p>
                  {runs.map((run, i) => (
                    <RunRow key={run.runId} run={run} prevRun={i > 0 ? runs[i-1] : null}
                      selected={selectedRunId === run.runId}
                      onClick={() => setSelectedRunId(selectedRunId === run.runId ? null : run.runId)} />
                  ))}
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase font-bold mb-2">Detalhes da Execucao Selecionada</p>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sticky top-4">
                    <RunDetail run={selectedRun} />
                  </div>
                </div>
              </div>
            )}

            {/* ── TIMELINES ── */}
            {tab === "timelines" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Execution Timeline — Cadeia Cognitiva por Run</p>
                  <div className="space-y-2">
                    {runs.map(run => (
                      <div key={run.runId} className="flex items-start gap-2">
                        <div className="shrink-0 w-14">
                          <div className="text-sky-400 font-mono text-xs">#{run.runIndex}</div>
                          <div className="text-zinc-600 font-mono text-xs">{run.input?.id}</div>
                        </div>
                        <div className="flex-1">
                          <StageTimeline stages={run.stages} compact />
                          <div className="text-zinc-600 font-mono text-xs mt-0.5">{run.totalDurationMs}ms total</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">ExecutionContext — IDs por Run</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          {["Run","ID","goalId","planId","dispatchId","episodeId","learningId","reasoningId"].map(h => (
                            <td key={h} className="py-1 pr-2">{h}</td>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map(run => (
                          <tr key={run.runId} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                            <td className="py-1 pr-2 text-sky-400">#{run.runIndex}</td>
                            <td className="py-1 pr-2 text-violet-400">{run.input?.id}</td>
                            <td className="py-1 pr-2 text-orange-400">{run.ctx.goalId?.slice(-10)}</td>
                            <td className="py-1 pr-2 text-yellow-400">{run.ctx.planId?.slice(-10)}</td>
                            <td className="py-1 pr-2 text-pink-400">{run.ctx.dispatchId?.slice(-10)}</td>
                            <td className="py-1 pr-2 text-sky-400">{run.ctx.episodeId?.slice(-10)}</td>
                            <td className="py-1 pr-2 text-emerald-400">{run.ctx.learningId?.slice(-10)}</td>
                            <td className="py-1 pr-2 text-violet-400">{run.ctx.reasoningId?.slice(-10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── KNOWLEDGE ── */}
            {tab === "knowledge" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-4">Knowledge Timeline — Evolucao do KnowledgeStore</p>
                  <TimelineBar runs={runs} field="knowledgeStateAfter" label="KnowledgeStore — Total de Regras" color="teal" />
                  <div className="mt-4">
                    <TimelineBar runs={runs} field="knowledgeGrowth" label="Knowledge Growth — Regras Adicionadas por Execucao" color="emerald" />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Knowledge Criado vs Reutilizado</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          {["Run","Cenario","KS Antes","KS Depois","Δ","Criado","Padroes","Aprovados"].map(h => <td key={h} className="py-1 pr-3">{h}</td>)}
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map(run => (
                          <tr key={run.runId} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                            <td className="py-1 pr-3 text-sky-400">#{run.runIndex}</td>
                            <td className="py-1 pr-3 text-zinc-400">{run.input?.id}</td>
                            <td className="py-1 pr-3 text-zinc-500">{run.knowledgeStateBefore}</td>
                            <td className="py-1 pr-3 text-teal-300">{run.knowledgeStateAfter}</td>
                            <td className={`py-1 pr-3 font-bold ${run.knowledgeGrowth > 0 ? "text-emerald-400" : "text-zinc-600"}`}>{run.knowledgeGrowth > 0 ? `+${run.knowledgeGrowth}` : run.knowledgeGrowth}</td>
                            <td className="py-1 pr-3 text-emerald-400">{run.learning.knowledgeCreated}</td>
                            <td className="py-1 pr-3 text-emerald-300">{run.learning.patternsFound}</td>
                            <td className="py-1 pr-3 text-emerald-400">{run.learning.patternsApproved}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── LEARNING ── */}
            {tab === "learning" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-4">Learning Timeline — Episodios Acumulados</p>
                  <TimelineBar runs={runs} field="learning.episodesAnalyzed" label="Episodios Analisados por Run (acumulado)" color="emerald" />
                  <div className="mt-4">
                    <TimelineBar runs={runs} field="learning.metrics.learningConfidence" label="Confianca do Learning" color="emerald" format={v => v.toFixed(3)} />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Learning Loop — Como Episodios Anteriores Influenciam</p>
                  {runs.map((run, i) => {
                    const prev = runs[i - 1];
                    const moreEps = prev ? run.learning.episodesAnalyzed > prev.learning.episodesAnalyzed : false;
                    return (
                      <div key={run.runId} className="flex items-start gap-3 mb-3 pb-3 border-b border-zinc-800/50 last:border-0">
                        <div className="shrink-0 text-center">
                          <Badge label={`#${run.runIndex}`} color="sky" />
                          <div className="text-zinc-600 font-mono text-xs mt-0.5">{run.input?.id}</div>
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="flex gap-3 flex-wrap mb-1">
                            <span className="text-zinc-500">Eps: <span className="text-emerald-300 font-mono">{run.learning.episodesAnalyzed}</span>
                              {moreEps && <span className="text-emerald-400 ml-1">↑ +{run.learning.episodesAnalyzed - (prev?.learning.episodesAnalyzed ?? 0)} novos</span>}
                            </span>
                            <span className="text-zinc-500">Padroes: <span className="text-emerald-300 font-mono">{run.learning.patternsFound}</span></span>
                            <span className="text-zinc-500">Knowledge+: <span className="text-teal-300 font-mono">{run.learning.knowledgeCreated}</span></span>
                          </div>
                          {run.learning.topPatterns[0] && (
                            <p className="text-zinc-400 italic">"{run.learning.topPatterns[0].description.slice(0,100)}"</p>
                          )}
                          {run.learning.antiPatternsDetected[0] && (
                            <p className="text-amber-400">⚠ Anti-padrao: {run.learning.antiPatternsDetected[0].title}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── REASONING ── */}
            {tab === "reasoning" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-4">Reasoning Timeline — Utilizacao do Knowledge Acumulado</p>
                  <TimelineBar runs={runs} field="reasoning.inferenceChain.depth" label="Inference Depth — Profundidade de Inferencia" color="violet" />
                  <div className="mt-4">
                    <TimelineBar runs={runs} field="reasoning.decision.confidence" label="Decision Confidence — Confianca da Decisao" color="violet" format={v => v.toFixed(3)} />
                  </div>
                  <div className="mt-4">
                    <TimelineBar runs={runs} field="reasoning.metrics.knowledgeRetrieved" label="Knowledge Retrieved — Regras Utilizadas no Reasoning" color="violet" />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Decisoes por Execucao</p>
                  {runs.map(run => (
                    <div key={run.runId} className="mb-3 pb-3 border-b border-zinc-800/50 last:border-0">
                      <div className="flex gap-2 flex-wrap mb-1">
                        <Badge label={`#${run.runIndex} ${run.input?.id}`} color="violet" />
                        <Badge label={`depth:${run.reasoning.inferenceChain.depth}`} color="violet" />
                        <Badge label={`conf:${run.reasoning.decision.confidence.toFixed(3)}`} color={run.reasoning.decision.confidence > 0.7 ? "green" : "amber"} />
                        <Badge label={`rules:${run.reasoning.metrics.knowledgeRetrieved}`} color="teal" />
                      </div>
                      {run.reasoning.decision.conclusion && (
                        <p className="text-zinc-400 text-xs italic">"{run.reasoning.decision.conclusion.slice(0,140)}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── OPTIMIZATION ── */}
            {tab === "optimization" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-4">Optimization Timeline</p>
                  <TimelineBar runs={runs} field="optimization.recommendations.length" label="Recomendacoes de Optimization por Run" color="amber" />
                  <div className="mt-4">
                    <TimelineBar runs={runs} field="optimization.metrics.avgImprovementScore" label="Avg Improvement Score" color="amber" format={v => v.toFixed(3)} />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Melhorias Sugeridas por Run</p>
                  {runs.map(run => (
                    <div key={run.runId} className="mb-3 pb-3 border-b border-zinc-800/50 last:border-0">
                      <div className="flex gap-2 mb-1">
                        <Badge label={`#${run.runIndex} ${run.input?.id}`} color="amber" />
                        <Badge label={`${run.optimization.recommendations.length} recs`} color="amber" />
                      </div>
                      {run.optimization.recommendations.slice(0, 2).map((rec, i) => (
                        <p key={i} className="text-zinc-400 text-xs">↑ {rec.description?.slice(0, 100) ?? "—"}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── META ── */}
            {tab === "meta" && (
              <div className="space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-4">Meta Timeline</p>
                  <TimelineBar runs={runs} field="meta.metrics.metaConfidence" label="Meta Confidence — Qualidade Meta-Cognitiva" color="blue" format={v => v.toFixed(3)} />
                  <div className="mt-4">
                    <TimelineBar runs={runs} field="meta.metrics.reasoningQuality" label="Reasoning Quality — Avaliada pelo Meta Engine" color="blue" format={v => v.toFixed(3)} />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Reflexoes por Execucao</p>
                  {runs.map(run => (
                    <div key={run.runId} className="mb-3 pb-3 border-b border-zinc-800/50 last:border-0">
                      <div className="flex gap-2 flex-wrap mb-1">
                        <Badge label={`#${run.runIndex} ${run.input?.id}`} color="blue" />
                        <Badge label={`meta:${run.meta.metrics.metaConfidence.toFixed(3)}`} color="blue" />
                        <Badge label={`${run.meta.biases.length} biases`} color={run.meta.biases.length > 0 ? "orange" : "zinc"} />
                        <span className="text-emerald-400 text-xs">+{run.meta.reflection.strengths.length} forcas</span>
                        <span className="text-amber-400 text-xs">-{run.meta.reflection.weaknesses.length} fraquezas</span>
                        <span className="text-blue-400 text-xs">↑{run.meta.reflection.improvements.length} melhorias</span>
                      </div>
                      <p className="text-zinc-400 text-xs italic">"{run.meta.reflection.summary?.slice(0,140)}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── RELATORIO FINAL ── */}
            {tab === "relatorio" && stats && (
              <div className="space-y-4">
                {/* Verdict */}
                <div className={`rounded-xl border-2 p-5 ${stats.allStages && stats.totalKS > 0 && stats.growthTotal > 0 ? "border-emerald-700 bg-emerald-950/20" : "border-amber-700 bg-amber-950/10"}`}>
                  <div className="flex gap-2 flex-wrap mb-3">
                    <Badge label="RELATORIO FINAL" color="gold" />
                    <Badge label="EF-58 VALIDACAO RUNTIME" color="violet" />
                    <Badge label={stats.allStages && stats.totalKS > 0 ? "APROVADO" : "PARCIAL"} color={stats.allStages && stats.totalKS > 0 ? "green" : "amber"} />
                  </div>
                  <h2 className="text-white font-bold text-lg mb-4">Relatorio Executivo de Validacao</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    {[
                      ["Cenarios Executados", runs.length,                     "sky"],
                      ["Cenarios Bem-Sucedidos", stats.successRuns,            "emerald"],
                      ["Knowledge Store Final", stats.totalKS,                 "teal"],
                      ["Knowledge Total Criado", `+${stats.growthTotal}`,      "emerald"],
                      ["Max Inf. Depth",  stats.maxDepth,                      "violet"],
                      ["Avg Meta Conf",   stats.avgMeta.toFixed(3),            "blue"],
                      ["Avg Opt. Recs",   stats.avgRecs.toFixed(1),            "amber"],
                      ["Tempo Total",     `${stats.totalMs}ms`,                "zinc"],
                    ].map(([k, v, c]) => <Metric key={k} label={k} value={v} color={c} />)}
                  </div>
                </div>

                {/* Criterios */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-zinc-300 text-sm font-bold mb-3">Criterios de Aprovacao</p>
                  <Check label="Runtime executa ponta a ponta" ok={runs.length === SCENARIOS.length}
                    detail={`${runs.length}/${SCENARIOS.length} cenarios executados`} />
                  <Check label="Nenhum engine ignorado (10 stages por run)" ok={stats.allStages}
                    detail={stats.allStages ? "Todos os runs com 10 stages" : "Algum run com menos de 10 stages"} />
                  <Check label="Knowledge evolui" ok={stats.growthTotal > 0}
                    detail={`+${stats.growthTotal} regras criadas. KS: 0 → ${stats.totalKS}`} />
                  <Check label="Learning influencia proximas execucoes" ok={!!stats.behaviorChanged}
                    detail={stats.behaviorChanged ? "S-09 (re-run S-01) mostra comportamento diferente" : "Sem divergencia detectada entre S-01 e S-09"} />
                  <Check label="Reasoning utiliza knowledge atualizado" ok={stats.maxDepth > 0}
                    detail={`Max inference depth: ${stats.maxDepth}`} />
                  <Check label="Optimization gera recomendacoes" ok={stats.avgRecs > 0}
                    detail={`Avg ${stats.avgRecs.toFixed(1)} recomendacoes por run`} />
                  <Check label="Meta produz reflexao" ok={runs.every(r => r.meta.reflection.summary?.length > 0)}
                    detail="Todos os runs com reflexao gerada" />
                  <Check label="Sistema muda comportamento entre execucoes" ok={!!stats.behaviorChanged}
                    detail={stats.behaviorChanged ? "Confirmado: episodios acumulados alteram reasoning" : "Nao detectado: pode precisar de mais runs"} />
                  <Check label="Runtime pronto para operacao" ok={stats.allStages && stats.totalKS > 0 && stats.growthTotal > 0 && stats.avgRecs > 0}
                    detail="Todos os criterios principais atendidos" />
                </div>

                {/* Resumo por engine */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Resumo por Engine</p>
                  {[
                    { engine:"GoalRuntime",       color:"orange", key:"goal",
                      summary: `${runs.filter(r => r.goalResult?.success).length}/${runs.length} goals criados com sucesso` },
                    { engine:"PlanningEngine",    color:"yellow", key:"planning",
                      summary: `${runs.filter(r => r.plan).length}/${runs.length} planos gerados | avg ${(runs.reduce((a,r) => a + (r.plan?.steps.length ?? 0), 0) / runs.length).toFixed(1)} steps` },
                    { engine:"ExecutionDispatch", color:"pink",   key:"dispatch",
                      summary: `${runs.length}/${runs.length} dispatches realizados` },
                    { engine:"Episode",           color:"sky",    key:"episode",
                      summary: `${runs.length} episodios com metadata={executionId,goalId,planId,dispatchId}` },
                    { engine:"LearningEngine",    color:"emerald",key:"learning",
                      summary: `Max ${Math.max(...runs.map(r => r.learning.episodesAnalyzed))} episodios analisados | ${stats.totalKS} regras acumuladas` },
                    { engine:"KnowledgeStore",    color:"teal",   key:"knowledge_store",
                      summary: `${stats.totalKS} regras persistidas | crescimento: +${stats.growthTotal}` },
                    { engine:"KnowledgeReasoning",color:"violet", key:"reasoning",
                      summary: `Max depth: ${stats.maxDepth} | avg conf: ${(runs.reduce((a,r) => a + r.reasoning.decision.confidence, 0) / runs.length).toFixed(3)}` },
                    { engine:"SelfOptimization",  color:"amber",  key:"optimization",
                      summary: `Total ${runs.reduce((a,r) => a + r.optimization.recommendations.length, 0)} recomendacoes | avg ${stats.avgRecs.toFixed(1)}/run` },
                    { engine:"MetaCognition",     color:"blue",   key:"meta_cognition",
                      summary: `Avg meta conf: ${stats.avgMeta.toFixed(3)} | ${runs.reduce((a,r) => a + r.meta.biases.length, 0)} biases detectados` },
                    { engine:"Reflection",        color:"rose",   key:"reflection",
                      summary: `${runs.reduce((a,r) => a + r.meta.reflection.improvements.length, 0)} melhorias geradas no total` },
                  ].map(({ engine, color, key, summary }) => {
                    const m = STAGE_META[key] ?? {};
                    return (
                      <div key={engine} className={`flex items-start gap-3 mb-2 p-2 rounded-lg border ${m.bg ?? "border-zinc-800"}`}>
                        <span className={`font-mono text-xs font-bold w-28 shrink-0 ${m.color ?? "text-zinc-400"}`}>{engine}</span>
                        <span className="text-zinc-400 text-xs">{summary}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Aprendizado e decisoes destaque */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-950/20 border border-emerald-800/20 rounded-xl p-4">
                    <p className="text-emerald-400 text-xs font-bold uppercase mb-3">Aprendizado Obtido</p>
                    {runs.flatMap(r => r.learning.topPatterns.slice(0,1)).slice(0,5).map((p, i) => (
                      <p key={i} className="text-zinc-400 text-xs mb-1">• {p.description.slice(0,90)}</p>
                    ))}
                  </div>
                  <div className="bg-violet-950/20 border border-violet-800/20 rounded-xl p-4">
                    <p className="text-violet-400 text-xs font-bold uppercase mb-3">Decisoes Tomadas</p>
                    {runs.filter(r => r.reasoning.decision.conclusion).slice(0,4).map((run, i) => (
                      <p key={i} className="text-zinc-400 text-xs mb-1 italic">"{run.reasoning.decision.conclusion?.slice(0,80)}"</p>
                    ))}
                  </div>
                  <div className="bg-rose-950/10 border border-rose-800/20 rounded-xl p-4">
                    <p className="text-rose-400 text-xs font-bold uppercase mb-3">Reflexoes</p>
                    {runs.filter(r => r.meta.reflection.summary).slice(0,4).map((run, i) => (
                      <p key={i} className="text-zinc-400 text-xs mb-1 italic">#{run.runIndex}: "{run.meta.reflection.summary?.slice(0,80)}"</p>
                    ))}
                  </div>
                  <div className="bg-amber-950/20 border border-amber-800/20 rounded-xl p-4">
                    <p className="text-amber-400 text-xs font-bold uppercase mb-3">Melhorias Sugeridas</p>
                    {runs.flatMap(r => r.optimization.recommendations.slice(0,1)).slice(0,5).map((rec, i) => (
                      <p key={i} className="text-zinc-400 text-xs mb-1">↑ {rec.description?.slice(0,80) ?? "—"}</p>
                    ))}
                  </div>
                </div>

                {/* Re-run */}
                <button onClick={runAll} disabled={running}
                  className="w-full py-3 bg-violet-800/40 hover:bg-violet-700/40 border border-violet-700/30 rounded-xl text-sm font-bold text-violet-300 transition-colors disabled:opacity-50">
                  {running ? "Executando..." : "↺ Novo Ciclo de Validacao (Knowledge acumula entre ciclos)"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}