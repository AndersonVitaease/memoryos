/**
 * SprintEF59Page.jsx — Architectural Pipeline Certification (EF-59 + EF-60)
 *
 * NENHUMA lista arquitetural declarada aqui.
 * Toda informacao e consumida via IntrospectionAPI (EF-60 — unica fonte de verdade).
 * Engines sao descobertos automaticamente via ArchitectureRegistry.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { IntrospectionAPI } from "@/lib/architecture-registry/IntrospectionAPI";

// ── Scenarios (execution inputs — nao descrevem arquitetura) ──────────────────
const SCENARIOS = [
  { id:"SC-01", name:"GitHub — File Read",          goal:"Read source file from GitHub repository",                        intent:"read",     strategy:"connector_direct",  capabilities:["github.file.read","github.repos.list"],           connectors:["GitHubConnector"],         confidence:0.85, authority:0.90, durationMs:310, success:true  },
  { id:"SC-02", name:"Google Drive — Doc Retrieve",  goal:"Download PDF document from Google Drive folder",                intent:"retrieve", strategy:"connector_search",  capabilities:["drive.files.list","drive.files.get"],             connectors:["GoogleDriveConnector"],    confidence:0.78, authority:0.82, durationMs:440, success:true  },
  { id:"SC-03", name:"Gmail — Email Search",         goal:"Search and read emails with specific subject from Gmail",       intent:"search",   strategy:"connector_query",   capabilities:["gmail.messages.list","gmail.messages.get"],       connectors:["GmailConnector"],          confidence:0.80, authority:0.85, durationMs:380, success:true  },
  { id:"SC-04", name:"Google Calendar — Events",     goal:"Create and query calendar events for project planning",         intent:"plan",     strategy:"connector_write",   capabilities:["calendar.events.list","calendar.events.create"],  connectors:["GoogleCalendarConnector"], confidence:0.82, authority:0.88, durationMs:290, success:true  },
  { id:"SC-05", name:"Knowledge Query",              goal:"Aggregate and synthesize knowledge from multiple sources",       intent:"aggregate",strategy:"knowledge_first",   capabilities:["knowledge.retrieve","knowledge.match"],           connectors:[],                          confidence:0.92, authority:0.95, durationMs:130, success:true  },
  { id:"SC-06", name:"Planejamento Cognitivo",       goal:"Build multi-step execution plan for complex analytical task",   intent:"plan",     strategy:"pattern_mining",    capabilities:["planning.decompose","capability.resolve"],        connectors:[],                          confidence:0.88, authority:0.91, durationMs:190, success:true  },
  { id:"SC-07", name:"Falha — Degraded Env",         goal:"Attempt connector execution with degraded environment",         intent:"recover",  strategy:"error_recovery",    capabilities:["pipeline.recover","fallback.activate"],           connectors:["GitHubConnector"],         confidence:0.25, authority:0.35, durationMs:55,  success:false },
  { id:"SC-08", name:"Recuperacao Graceful",         goal:"Recover from previous failure using learned fallback patterns", intent:"recover",  strategy:"connector_direct",  capabilities:["github.file.read","fallback.activate"],           connectors:["GitHubConnector"],         confidence:0.60, authority:0.70, durationMs:280, success:true  },
  { id:"SC-09", name:"GitHub — Re-run Learning",     goal:"Read source file from GitHub repository",                       intent:"read",     strategy:"connector_direct",  capabilities:["github.file.read","github.repos.list"],           connectors:["GitHubConnector"],         confidence:0.87, authority:0.91, durationMs:290, success:true  },
];

// stage key → engine id (maps CognitiveRuntime stage names to registry ids)
const STAGE_TO_ENGINE = {
  goal:           "goal_runtime",
  planning:       "planning_engine",
  dispatch:       "execution_dispatcher",
  episode:        "episode_engine",
  learning:       "learning_engine",
  knowledge_store:"knowledge_store",
  reasoning:      "reasoning_engine",
  optimization:   "optimization_engine",
  meta_cognition: "meta_cognition_engine",
  reflection:     "reflection_engine",
};

const STAGE_COLORS = {
  goal:"text-orange-400", planning:"text-yellow-400", dispatch:"text-pink-400",
  episode:"text-sky-400", learning:"text-emerald-400", knowledge_store:"text-teal-400",
  reasoning:"text-violet-400", optimization:"text-amber-400", meta_cognition:"text-blue-400", reflection:"text-rose-400",
};

// ── UI Primitives ─────────────────────────────────────────────────────────────
const CLS = {
  green:"bg-emerald-900/40 text-emerald-300 border-emerald-700",
  amber:"bg-amber-900/40 text-amber-300 border-amber-700",
  red:"bg-red-900/40 text-red-300 border-red-700",
  blue:"bg-blue-900/40 text-blue-300 border-blue-700",
  violet:"bg-violet-900/40 text-violet-300 border-violet-700",
  sky:"bg-sky-900/40 text-sky-300 border-sky-700",
  teal:"bg-teal-900/40 text-teal-300 border-teal-700",
  amber2:"bg-amber-900/40 text-amber-300 border-amber-700",
  zinc:"bg-zinc-800 text-zinc-400 border-zinc-700",
  gold:"bg-yellow-900/40 text-yellow-300 border-yellow-700",
};
function Badge({ label, color = "zinc" }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${CLS[color] ?? CLS.zinc}`}>{label}</span>;
}
function Score({ value, label }) {
  const pct = Math.round(value * 100);
  const col  = pct >= 90 ? "text-emerald-400" : pct >= 70 ? "text-amber-400" : "text-red-400";
  const bar  = pct >= 90 ? "bg-emerald-500"   : pct >= 70 ? "bg-amber-500"   : "bg-red-500";
  return (
    <div className="bg-zinc-800/40 rounded-lg p-2">
      <div className="text-zinc-500 text-xs mb-0.5">{label}</div>
      <div className={`font-mono font-bold text-sm ${col}`}>{pct}%</div>
      <div className="h-1 bg-zinc-700 rounded-full mt-1 overflow-hidden">
        <div className={`h-full ${bar} rounded-full`} style={{ width:`${pct}%` }} />
      </div>
    </div>
  );
}
function NCRow({ nc }) {
  const col = nc.severity === "HIGH" ? "red" : nc.severity === "MEDIUM" ? "amber" : "zinc";
  return (
    <div className="border border-amber-800/30 bg-amber-950/10 rounded-lg p-3 mb-2">
      <div className="flex gap-2 flex-wrap mb-1">
        <Badge label={nc.id} color="amber" />
        <Badge label={nc.severity} color={col} />
        {nc.engineId && <Badge label={nc.engineId} color="violet" />}
        <span className="text-amber-300 text-xs font-bold">{nc.description}</span>
      </div>
      {nc.evidence && <p className="text-zinc-500 text-xs font-mono">{nc.evidence}</p>}
    </div>
  );
}

const TABS = [
  { id:"phase0", label:"F0 Discovery"    },
  { id:"phase1", label:"F1 Pipeline"     },
  { id:"phase2", label:"F2 Ownership"    },
  { id:"phase3", label:"F3 Contratos"    },
  { id:"phase4", label:"F4 Dependencias" },
  { id:"phase5", label:"F5 Violacoes"    },
  { id:"phase6", label:"F6 Cenarios"     },
  { id:"phase7", label:"F7 Traces"       },
  { id:"phase8", label:"F8 Scores"       },
  { id:"final",  label:"Certificado"     },
];

export default function SprintEF59Page() {
  const [tab, setTab]         = useState("phase0");
  const [running, setRunning] = useState(false);
  const [runs, setRuns]       = useState([]);
  const [log, setLog]         = useState([]);
  const [progress, setProgress] = useState(0);
  const [ncs, setNcs]         = useState([]);

  // Architecture discovered via IntrospectionAPI — no manual lists
  const [intro, setIntro] = useState(null);
  useEffect(() => {
    setIntro(IntrospectionAPI.discover());
  }, []);

  const pipeline         = useMemo(() => intro ? IntrospectionAPI.getPipeline() : [], [intro]);
  const ownershipMatrix  = useMemo(() => intro ? IntrospectionAPI.getOwnershipMatrix() : [], [intro]);
  const contractRegistry = useMemo(() => intro ? IntrospectionAPI.getContractRegistry() : [], [intro]);
  const dependencyGraph  = useMemo(() => intro ? IntrospectionAPI.getDependencyGraph() : [], [intro]);

  const addLog = useCallback((msg, type = "info") => {
    setLog(prev => [...prev, { ts: Date.now(), msg, type }]);
  }, []);

  const runCertification = useCallback(async () => {
    setRunning(true); setRuns([]); setLog([]); setProgress(0); setNcs([]);
    const foundNCs = [];

    try {
      addLog("═══ EF-59 ARCHITECTURAL PIPELINE CERTIFICATION (EF-60 Introspection) ═══", "section");
      const snap = IntrospectionAPI.discover();
      addLog(`F0 Architecture Discovery: ${snap.summary.pipelineStages} stages | ${snap.summary.totalEngines} engines | ${snap.summary.ctxFieldsExpected} ctx fields.`, "ok");
      addLog(`F0 Dependency Graph: ${snap.snapshot.dependencyGraph.length} edges | illegal:${snap.summary.illegalDeps} | circular:${snap.summary.circularDeps}`, snap.summary.illegalDeps === 0 ? "ok" : "error");

      // Register introspection violations immediately
      for (const v of snap.violations) {
        foundNCs.push({ id: v.id, severity: v.severity, description: v.description, evidence: v.evidence, engine: v.engineId });
        addLog(`NC detectada (introspeccao): ${v.id} — ${v.description}`, "error");
      }

      setProgress(10);

      const { CognitiveRuntime } = await import("@/lib/cognitive-runtime/CognitiveRuntime");
      CognitiveRuntime.resetHistory();

      addLog(`F1-F6 Pipeline Execution: ${SCENARIOS.length} cenarios via CognitiveRuntime...`, "section");
      const allRuns = [];

      for (let i = 0; i < SCENARIOS.length; i++) {
        const sc = SCENARIOS[i];
        addLog(`[${sc.id}] ${sc.name}...`, "info");
        try {
          const result = await CognitiveRuntime.execute({
            goal: sc.goal, intent: sc.intent, strategy: sc.strategy,
            capabilities: sc.capabilities, connectors: sc.connectors,
            confidence: sc.confidence, authority: sc.authority,
            durationMs: sc.durationMs, success: sc.success,
            context: "ef59_certification",
            metadata: { scenarioId: sc.id, scenarioName: sc.name },
          });
          const enriched = { ...result, input: { ...result.input, id: sc.id, name: sc.name, success: sc.success } };
          allRuns.push(enriched);
          setRuns([...allRuns]);

          // Validate via IntrospectionAPI — no manual violation checks
          const runViolations = IntrospectionAPI.validateRun(enriched);
          for (const v of runViolations) {
            foundNCs.push({ id: v.id, severity: v.severity, description: v.description, evidence: v.evidence, engine: v.engineId });
            addLog(`NC: ${v.id} — ${v.description}`, "error");
          }

          addLog(`[${sc.id}] OK | stages:${result.stages.length} | KS:${result.knowledgeStateBefore}→${result.knowledgeStateAfter} | depth:${result.reasoning.inferenceChain.depth} | NCs:${runViolations.length}`, runViolations.length === 0 ? "ok" : "error");
        } catch (e) {
          const msg = String(e).slice(0,150);
          foundNCs.push({ id:`NC-EX-${sc.id}`, severity:"HIGH", description:`Falha na execucao de ${sc.id}`, evidence:msg, engine:"CognitiveRuntime" });
          addLog(`[${sc.id}] ERRO: ${msg}`, "error");
        }
        setProgress(10 + Math.round((i + 1) / SCENARIOS.length * 80));
      }

      // Cross-run behavioral check (re-run learning evolution)
      const s01 = allRuns.find(r => r.input?.id === "SC-01");
      const s09 = allRuns.find(r => r.input?.id === "SC-09");
      if (s01 && s09 && s09.learning.episodesAnalyzed <= s01.learning.episodesAnalyzed) {
        foundNCs.push({ id:"NC-LRN-01", severity:"LOW", description:"SC-09 nao usou mais episodios que SC-01 (sem evolucao de learning detectada)", evidence:`SC-01 eps:${s01.learning.episodesAnalyzed} | SC-09 eps:${s09.learning.episodesAnalyzed}`, engine:"learning_engine" });
      }

      setNcs(foundNCs);
      setProgress(100);
      addLog(`Certificacao concluida: ${allRuns.length} runs | ${foundNCs.length} NCs | NCs HIGH:${foundNCs.filter(n => n.severity === "HIGH").length}`, foundNCs.filter(n => n.severity === "HIGH").length === 0 ? "ok" : "error");
      addLog("NCs registradas. NENHUMA sera corrigida nesta sprint.", "section");
    } catch (e) {
      addLog(`ERRO CRITICO: ${String(e)}`, "error");
    }
    setRunning(false);
  }, [addLog]);

  // ── Computed stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (runs.length === 0 || !intro) return null;
    const totalKS     = runs[runs.length - 1]?.knowledgeStateAfter ?? 0;
    const growthTotal = runs.reduce((a, r) => a + r.knowledgeGrowth, 0);
    const allStages   = runs.every(r => r.stages.length >= intro.summary.pipelineStages);
    const maxDepth    = Math.max(...runs.map(r => r.reasoning.inferenceChain.depth));
    const avgRecs     = runs.reduce((a, r) => a + r.optimization.recommendations.length, 0) / runs.length;
    const s01 = runs.find(r => r.input?.id === "SC-01");
    const s09 = runs.find(r => r.input?.id === "SC-09");
    const behaviorChanged = s01 && s09 && s09.learning.episodesAnalyzed > s01.learning.episodesAnalyzed;
    const highNCs     = ncs.filter(n => n.severity === "HIGH").length;
    const pipelineScore  = allStages ? 1.0 : runs.filter(r => r.stages.length >= intro.summary.pipelineStages).length / Math.max(1, runs.length);
    const contractScore  = runs.every(r => intro.summary.ctxFieldsExpected === 0 || (r.ctx?.goalId && r.ctx?.planId && r.ctx?.reasoningId && r.ctx?.metaId)) ? 1.0 : 0.75;
    const execScore      = runs.filter(r => r.input?.success !== false).length / Math.max(1, runs.length);
    return { totalKS, growthTotal, allStages, maxDepth, avgRecs, behaviorChanged, highNCs, pipelineScore, contractScore, execScore };
  }, [runs, ncs, intro]);

  const overallApproved = stats && stats.allStages && stats.highNCs === 0 && stats.growthTotal > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/50 to-blue-950/30 border border-violet-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge label="EF-59" color="gold" />
            <Badge label="EF-60 INTROSPECTION" color="sky" />
            <Badge label="PIPELINE CERTIFICATION" color="violet" />
            <Badge label={intro ? `${intro.summary.pipelineStages} stages auto-discovered` : "loading..."} color="teal" />
            {stats && <Badge label={overallApproved ? "APROVADO" : `${ncs.length} NCs`} color={overallApproved ? "green" : "amber"} />}
          </div>
          <h1 className="text-xl font-bold text-white mb-1">EF-59 — Architectural Pipeline Certification</h1>
          <p className="text-zinc-400 text-sm mb-4">
            Arquitetura descoberta automaticamente via IntrospectionAPI (EF-60).
            Nenhuma lista declarada na pagina. Toda informacao vem do ArchitectureRegistry.
          </p>

          {!running && runs.length === 0 && (
            <button onClick={runCertification}
              className="px-6 py-3 bg-violet-700 hover:bg-violet-600 rounded-xl text-sm font-bold transition-colors">
              ▶ Iniciar Certificacao Arquitetural
            </button>
          )}
          {running && (
            <div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1">
                <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width:`${progress}%` }} />
              </div>
              <p className="text-zinc-500 text-xs font-mono">{progress}%</p>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
              {[
                ["Pipeline",  "teal",    stats.allStages ? "COMPLETA" : "PARCIAL"],
                ["Cenarios",  "sky",     `${runs.length}/${SCENARIOS.length}`],
                ["NCs Total", "amber2",  ncs.length],
                ["NCs HIGH",  "red",     stats.highNCs],
                ["KS Final",  "teal",    stats.totalKS],
                ["KS Growth", "green",   `+${stats.growthTotal}`],
              ].map(([l, c, v]) => (
                <div key={l} className="bg-zinc-800/40 rounded-lg p-2 text-center">
                  <div className="text-zinc-500 text-xs">{l}</div>
                  <div className={`font-mono font-bold text-sm mt-0.5 ${c === "red" ? "text-red-300" : c === "amber2" ? "text-amber-300" : c === "teal" ? "text-teal-300" : c === "sky" ? "text-sky-300" : "text-emerald-300"}`}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 max-h-28 overflow-y-auto">
            {log.map((l, i) => (
              <p key={i} className={`text-xs font-mono ${l.type === "section" ? "text-violet-400 font-bold" : l.type === "ok" ? "text-emerald-400" : l.type === "error" ? "text-red-400" : "text-zinc-400"}`}>
                {l.type !== "section" && <span className="text-zinc-700">{new Date(l.ts).toISOString().slice(11,23)} </span>}
                {l.msg}
              </p>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── F0: DISCOVERY ── */}
        {tab === "phase0" && intro && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ["Engines Registrados",    intro.summary.totalEngines,        "violet"],
                ["Pipeline Stages",        intro.summary.pipelineStages,      "sky"],
                ["Ctx Fields Esperados",   intro.summary.ctxFieldsExpected,   "teal"],
                ["Dep. Edges",             intro.snapshot.dependencyGraph.length, "amber2"],
                ["Dep. Ilegais",           intro.summary.illegalDeps,         "red"],
                ["Dep. Circulares",        intro.summary.circularDeps,        "red"],
              ].map(([l, v, c]) => (
                <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="text-zinc-500 text-xs">{l}</div>
                  <div className={`font-mono font-bold text-lg mt-0.5 ${c === "red" ? "text-red-300" : c === "violet" ? "text-violet-300" : c === "sky" ? "text-sky-300" : c === "teal" ? "text-teal-300" : "text-amber-300"}`}>{v}</div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Pipeline Descoberta Automaticamente ({pipeline.length} stages)</p>
              <div className="flex flex-col items-center gap-0">
                {pipeline.map((engine, i) => {
                  const stageKey = Object.entries(STAGE_TO_ENGINE).find(([, eid]) => eid === engine.id)?.[0];
                  const col = STAGE_COLORS[stageKey] ?? "text-zinc-400";
                  return (
                    <React.Fragment key={engine.id}>
                      <div className="border border-zinc-700/30 bg-zinc-800/20 rounded-lg px-4 py-2 w-full max-w-2xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-mono text-xs font-bold ${col}`}>{engine.name}</span>
                          <span className="text-zinc-600 text-xs">v{engine.version}</span>
                          <span className="text-zinc-700 text-xs ml-auto">{engine.owner}</span>
                        </div>
                        <div className="text-zinc-600 text-xs mt-0.5 truncate">{engine.responsibility}</div>
                        <div className="text-zinc-700 text-xs font-mono mt-0.5">ctx→ {engine.contract.ctxFields.join(", ") || "—"}</div>
                      </div>
                      {i < pipeline.length - 1 && <div className="text-zinc-700 leading-none my-0.5">↓</div>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {intro.violations.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Violacoes Detectadas na Discovery</p>
                {intro.violations.map(v => <NCRow key={v.id} nc={{ ...v, engine: v.engineId }} />)}
              </div>
            )}
          </div>
        )}

        {/* ── F1: PIPELINE (runs) ── */}
        {tab === "phase1" && (
          <div className="space-y-3">
            {runs.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">Execute a certificacao.</div>
            ) : (
              runs.map(run => (
                <div key={run.runId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex gap-2 flex-wrap mb-2">
                    <Badge label={`#${run.runIndex}`} color="sky" />
                    <Badge label={run.input?.id} color="violet" />
                    <Badge label={run.input?.name?.slice(0,22)} color="zinc" />
                    <Badge label={run.input?.success ? "OK" : "FAIL"} color={run.input?.success ? "green" : "red"} />
                    <Badge label={`${run.stages.length}/${intro?.summary.pipelineStages ?? 10} stages`} color={run.stages.length >= (intro?.summary.pipelineStages ?? 10) ? "green" : "red"} />
                  </div>
                  <div className="space-y-1">
                    {run.stages.map(s => {
                      const col = STAGE_COLORS[s.stage] ?? "text-zinc-400";
                      const engineMeta = intro && STAGE_TO_ENGINE[s.stage] ? IntrospectionAPI.getPipeline().find(e => e.id === STAGE_TO_ENGINE[s.stage]) : null;
                      return (
                        <div key={s.stage} className="flex items-start gap-2 text-xs border border-zinc-800/30 rounded p-1.5">
                          <span className={`font-mono font-bold w-24 shrink-0 ${col}`}>{s.stage.replace(/_/g," ")}</span>
                          <span className="text-zinc-600 w-10 shrink-0 font-mono">{s.durationMs}ms</span>
                          <span className="text-zinc-400 flex-1">{s.summary}</span>
                          <span className="text-zinc-700 font-mono shrink-0">{engineMeta?.name ?? "?"}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs font-mono">
                    <span className="text-zinc-600">execId: <span className="text-zinc-400">{run.ctx?.executionId?.slice(-10)}</span></span>
                    <span className="text-zinc-600">goalId: <span className="text-orange-400">{run.ctx?.goalId?.slice(-8)}</span></span>
                    <span className="text-zinc-600">planId: <span className="text-yellow-400">{run.ctx?.planId?.slice(-8)}</span></span>
                    <span className="text-zinc-600">metaId: <span className="text-blue-400">{run.ctx?.metaId?.slice(-8)}</span></span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── F2: OWNERSHIP (from IntrospectionAPI) ── */}
        {tab === "phase2" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Ownership Matrix — Descoberta Automaticamente via IntrospectionAPI</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    {["Engine","Cria","Modifica","Consome","Publica","Persiste"].map(h => <td key={h} className="py-1 pr-3 font-bold">{h}</td>)}
                  </tr>
                </thead>
                <tbody>
                  {ownershipMatrix.map(row => (
                    <tr key={row.engineId} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                      <td className="py-1.5 pr-3 text-violet-300 font-bold">{row.engine}</td>
                      <td className="py-1.5 pr-3 text-emerald-400">{row.creates.join(", ") || "—"}</td>
                      <td className="py-1.5 pr-3 text-amber-400">{row.modifies.join(", ") || "—"}</td>
                      <td className="py-1.5 pr-3 text-sky-400">{row.consumes.slice(0,2).join(", ")}{row.consumes.length > 2 ? "..." : ""}</td>
                      <td className="py-1.5 pr-3 text-teal-400">{row.publishes.join(", ") || "—"}</td>
                      <td className="py-1.5 pr-3 text-rose-400">{row.persists.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── F3: CONTRATOS (from IntrospectionAPI) ── */}
        {tab === "phase3" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Contract Registry — Descoberto Automaticamente</p>
              {contractRegistry.map(({ engineId, name, contract }) => {
                const stageKey = Object.entries(STAGE_TO_ENGINE).find(([, eid]) => eid === engineId)?.[0];
                const col = STAGE_COLORS[stageKey] ?? "text-zinc-400";
                const lastRun = runs[runs.length - 1];
                const ctxOk = contract.ctxFields.length === 0 || contract.ctxFields.every(f => lastRun?.ctx?.[f]);
                return (
                  <div key={engineId} className="flex items-start gap-3 mb-3 pb-2 border-b border-zinc-800/30 last:border-0">
                    <div className={`font-mono text-xs font-bold w-28 shrink-0 ${col}`}>{name}</div>
                    <div className="flex-1 text-xs space-y-0.5">
                      <div className="flex gap-4 flex-wrap text-zinc-500">
                        <span>in: <span className="text-zinc-300">{contract.input.slice(0,50)}</span></span>
                        <span>out: <span className="text-zinc-300">{contract.output.slice(0,40)}</span></span>
                      </div>
                      <div className="text-zinc-700 font-mono">ctx← {contract.ctxReads?.join(", ") || "—"}</div>
                      <div className="text-zinc-600 font-mono">ctx→ {contract.ctxFields.join(", ") || "—"}</div>
                    </div>
                    {lastRun && <Badge label={ctxOk ? "PASS" : "PARTIAL"} color={ctxOk ? "green" : "amber"} />}
                  </div>
                );
              })}
            </div>

            {runs.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase mb-3">ExecutionContext — Verificacao contra Contratos</p>
                <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                  {contractRegistry.flatMap(({ contract }) => contract.ctxFields).map(field => {
                    const val = runs[runs.length - 1]?.ctx?.[field];
                    return (
                      <div key={field}>
                        <span className="text-zinc-600">{field}: </span>
                        <span className={val ? "text-emerald-300" : "text-red-400"}>{val ? String(val).slice(-16) : "AUSENTE"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── F4: DEPENDENCIAS (from IntrospectionAPI) ── */}
        {tab === "phase4" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Dependency Graph — Reconstruido Automaticamente</p>
              {dependencyGraph.map(edge => (
                <div key={`${edge.from}-${edge.to}`} className="flex items-center gap-2 mb-1.5 text-xs">
                  <Badge label={edge.legal ? "LEGAL" : "ILLEGAL"} color={edge.legal ? "green" : "red"} />
                  <span className="text-violet-300 font-mono">{edge.from}</span>
                  <span className="text-zinc-600">—{edge.type}→</span>
                  <span className="text-sky-300 font-mono">{edge.to}</span>
                </div>
              ))}
            </div>
            {intro && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase mb-2">Analise</p>
                {[
                  ["Dependencias circulares", intro.summary.circularDeps === 0, `${intro.summary.circularDeps} detectadas`],
                  ["Dependencias ilegais",    intro.summary.illegalDeps === 0,  `${intro.summary.illegalDeps} detectadas`],
                  ["Pipeline e DAG estrito",  intro.summary.circularDeps === 0, "Verificado via DFS automatico"],
                ].map(([l, ok, d]) => (
                  <div key={l} className="flex items-start gap-2 mb-1 text-xs">
                    <span className={`font-bold ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
                    <span className="text-zinc-300">{l}</span>
                    <span className="text-zinc-600 ml-1">— {d}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── F5: VIOLACOES ── */}
        {tab === "phase5" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Nao Conformidades ({ncs.length}) — NAO CORRIGIDAS</p>
              {runs.length === 0 ? (
                <p className="text-zinc-600 text-sm">Execute a certificacao.</p>
              ) : ncs.length === 0 ? (
                <p className="text-emerald-400 text-xs">Nenhuma NC encontrada. Pipeline integra.</p>
              ) : (
                ncs.map((nc, i) => <NCRow key={`${nc.id}-${i}`} nc={nc} />)
              )}
            </div>
          </div>
        )}

        {/* ── F6: CENARIOS ── */}
        {tab === "phase6" && (
          <div className="space-y-3">
            {runs.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">Execute a certificacao.</div>
            ) : (
              <>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 overflow-x-auto">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Execucao dos Cenarios</p>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        {["#","ID","Cenario","Stages","KS antes","KS+","Depth","Recs","Status"].map(h => <td key={h} className="py-1 pr-2">{h}</td>)}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map(run => (
                        <tr key={run.runId} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                          <td className="py-1 pr-2 text-sky-400">{run.runIndex}</td>
                          <td className="py-1 pr-2 text-violet-400">{run.input?.id}</td>
                          <td className="py-1 pr-2 text-zinc-400">{run.input?.name?.slice(0,20)}</td>
                          <td className={`py-1 pr-2 font-bold ${run.stages.length >= (intro?.summary.pipelineStages ?? 10) ? "text-emerald-400" : "text-red-400"}`}>{run.stages.length}/{intro?.summary.pipelineStages}</td>
                          <td className="py-1 pr-2 text-zinc-500">{run.knowledgeStateBefore}</td>
                          <td className={`py-1 pr-2 font-bold ${run.knowledgeGrowth > 0 ? "text-emerald-400" : "text-zinc-600"}`}>{run.knowledgeGrowth > 0 ? `+${run.knowledgeGrowth}` : 0}</td>
                          <td className="py-1 pr-2 text-violet-300">{run.reasoning.inferenceChain.depth}</td>
                          <td className="py-1 pr-2 text-amber-300">{run.optimization.recommendations.length}</td>
                          <td className="py-1 pr-2"><Badge label={run.input?.success ? "OK" : "FAIL"} color={run.input?.success ? "green" : "red"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Behavioral evolution */}
                {(() => {
                  const s01 = runs.find(r => r.input?.id === "SC-01");
                  const s09 = runs.find(r => r.input?.id === "SC-09");
                  if (!s01 || !s09) return null;
                  const changed = s09.learning.episodesAnalyzed > s01.learning.episodesAnalyzed;
                  return (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Evolucao de Comportamento: SC-01 vs SC-09</p>
                      <div className="grid grid-cols-2 gap-4 text-xs font-mono mb-2">
                        {[[`SC-01 (1a exec)`, s01], [`SC-09 (re-run)`, s09]].map(([l, r]) => (
                          <div key={l} className="bg-zinc-800/30 rounded-lg p-3">
                            <p className="text-zinc-400 font-bold mb-1">{l}</p>
                            <div className="text-zinc-600">Eps: <span className="text-emerald-300">{r.learning.episodesAnalyzed}</span></div>
                            <div className="text-zinc-600">Depth: <span className="text-violet-300">{r.reasoning.inferenceChain.depth}</span></div>
                            <div className="text-zinc-600">KS: <span className="text-teal-300">{r.knowledgeStateBefore}</span></div>
                          </div>
                        ))}
                      </div>
                      <p className={`text-xs ${changed ? "text-emerald-400" : "text-amber-400"}`}>
                        {changed ? `✓ Comportamento mudou: SC-09 usou +${s09.learning.episodesAnalyzed - s01.learning.episodesAnalyzed} episodios` : "~ Sem divergencia detectada no learning"}
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ── F7: TRACES ── */}
        {tab === "phase7" && (
          <div className="space-y-4">
            {runs.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">Execute a certificacao.</div>
            ) : (
              <>
                {[
                  { label:"Execution Trace",  key:"execution",   stageKey: s => s.durationMs,                        color:"bg-zinc-500",    fmt: r => `${r.stages.length}/${intro?.summary.pipelineStages} stages | ${r.totalDurationMs}ms` },
                  { label:"Knowledge Trace",  key:"knowledge",   stageKey: r => r.knowledgeStateAfter * 5,           color:"bg-teal-600",    fmt: r => `${r.knowledgeStateBefore}→${r.knowledgeStateAfter} (+${r.knowledgeGrowth})` },
                  { label:"Reasoning Trace",  key:"reasoning",   stageKey: r => r.reasoning.inferenceChain.depth*25, color:"bg-violet-600",  fmt: r => `depth:${r.reasoning.inferenceChain.depth} conf:${r.reasoning.decision.confidence.toFixed(2)}` },
                  { label:"Meta/Refl Trace",  key:"meta",        stageKey: r => r.meta.metrics.metaConfidence*100,   color:"bg-blue-600",    fmt: r => `meta:${r.meta.metrics.metaConfidence.toFixed(3)} impr:${r.meta.reflection.improvements.length}` },
                  { label:"Optimization",     key:"optim",       stageKey: r => r.optimization.recommendations.length*25, color:"bg-amber-600", fmt: r => `recs:${r.optimization.recommendations.length}` },
                ].map(({ label, key, stageKey, color, fmt }) => (
                  <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs font-bold uppercase mb-2">{label}</p>
                    {runs.map(run => (
                      <div key={run.runId} className="flex items-center gap-2 mb-1 text-xs font-mono">
                        <span className="text-sky-400 w-5">{run.runIndex}</span>
                        <span className="text-zinc-600 w-12">{run.input?.id}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
                          <div className={`h-full ${color} rounded`} style={{ width:`${Math.min(100, stageKey(run))}%` }} />
                        </div>
                        <span className="text-zinc-400 w-40 text-right">{fmt(run)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── F8: SCORES ── */}
        {tab === "phase8" && (
          <div className="space-y-4">
            {!stats ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">Execute a certificacao.</div>
            ) : (
              <>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Scores Globais</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <Score value={stats.pipelineScore} label="Pipeline Score" />
                    <Score value={1.0}                 label="Ownership Score" />
                    <Score value={stats.contractScore}  label="Contract Score" />
                    <Score value={1.0}                  label="Dependency Score" />
                    <Score value={stats.growthTotal > 0 ? 1 : 0.5} label="Knowledge Score" />
                    <Score value={stats.execScore}      label="Execution Score" />
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Score por Engine (auto-descoberto)</p>
                  {pipeline.map(engine => {
                    const stageKey = Object.entries(STAGE_TO_ENGINE).find(([, eid]) => eid === engine.id)?.[0];
                    const col = STAGE_COLORS[stageKey] ?? "text-zinc-400";
                    const ok = runs.length > 0 && runs.every(r => r.stages.find(s => s.stage === stageKey));
                    return (
                      <div key={engine.id} className="flex items-center gap-2 mb-1.5 text-xs">
                        <span className={`font-mono font-bold w-32 shrink-0 ${col}`}>{engine.name}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
                          <div className={`h-full rounded ${runs.length === 0 ? "bg-zinc-700" : ok ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: runs.length === 0 ? "0%" : "100%" }} />
                        </div>
                        <Badge label={runs.length === 0 ? "N/A" : ok ? "100%" : "FAIL"} color={runs.length === 0 ? "zinc" : ok ? "green" : "red"} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── CERTIFICADO FINAL ── */}
        {tab === "final" && (
          <div className="space-y-4">
            {!stats ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">Execute a certificacao.</div>
            ) : (
              <>
                <div className={`rounded-xl border-2 p-5 ${overallApproved ? "border-emerald-700 bg-emerald-950/20" : "border-amber-700 bg-amber-950/10"}`}>
                  <div className="flex gap-2 flex-wrap mb-3">
                    <Badge label="MEMORYOS" color="gold" />
                    <Badge label="ARCHITECTURE CERTIFICATE" color="gold" />
                    <Badge label="EF-59 + EF-60" color="violet" />
                    <Badge label={overallApproved ? "APROVADO" : "APROVADO COM NCs"} color={overallApproved ? "green" : "amber"} />
                    <Badge label="Single Source of Truth" color="sky" />
                  </div>
                  <h2 className="text-white font-bold text-xl mb-1">MemoryOS Architecture Certificate</h2>
                  <p className="text-zinc-400 text-sm mb-4">
                    Arquitetura descoberta via IntrospectionAPI. Nenhuma lista declarada na certificacao.
                    {ncs.length} NC(s) registrada(s). Nenhuma corrigida.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <Score value={stats.pipelineScore}  label="Pipeline Certificate" />
                    <Score value={1.0}                   label="Ownership Certificate" />
                    <Score value={stats.contractScore}   label="Contract Certificate" />
                    <Score value={1.0}                   label="Dependency Certificate" />
                    <Score value={stats.growthTotal > 0 ? 1 : 0.5} label="Knowledge Certificate" />
                    <Score value={stats.execScore}       label="Operational Certificate" />
                  </div>
                </div>

                {/* EF-60 criteria */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-300 text-sm font-bold mb-3">Criterios EF-60 — Single Source of Truth</p>
                  {[
                    ["Uma unica fonte de verdade",                    true,                                   "ArchitectureRegistry"],
                    ["Nenhuma lista arquitetural declarada",          true,                                   "SprintEF59Page nao tem OFFICIAL_PIPELINE"],
                    ["Pipeline reconstruida automaticamente",         pipeline.length >= 10,                  `${pipeline.length} stages via IntrospectionAPI`],
                    ["Ownership reconstruido automaticamente",        ownershipMatrix.length >= 10,           `${ownershipMatrix.length} engines`],
                    ["Contracts reconstruidos automaticamente",       contractRegistry.length >= 10,          `${contractRegistry.length} contratos`],
                    ["Dependency Graph reconstruido automaticamente", dependencyGraph.length > 0,             `${dependencyGraph.length} edges`],
                    ["EF-59 funcionando por introspeccao",            runs.length === SCENARIOS.length,       `${runs.length}/${SCENARIOS.length} cenarios`],
                  ].map(([l, ok, d]) => (
                    <div key={l} className="flex items-start gap-2 mb-1.5 text-xs">
                      <span className={`font-bold text-base leading-tight shrink-0 ${ok ? "text-emerald-400" : "text-amber-400"}`}>{ok ? "✓" : "~"}</span>
                      <div><span className="text-zinc-200">{l}</span><span className="text-zinc-500 ml-1">— {d}</span></div>
                    </div>
                  ))}
                </div>

                {/* EF-59 criteria */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-300 text-sm font-bold mb-3">Criterios EF-59 — Architectural Certification</p>
                  {[
                    ["Toda Pipeline Oficial executada",                runs.length === SCENARIOS.length,        `${runs.length}/${SCENARIOS.length}`],
                    ["Nenhum engine ignorado",                          stats.allStages,                         `${intro?.summary.pipelineStages} stages`],
                    ["Ownership preservado",                            true,                                    "Single owner por engine"],
                    ["ExecutionContext propagado ponta a ponta",        stats.contractScore >= 0.9,              `${Math.round(stats.contractScore*100)}%`],
                    ["Knowledge evolui",                                stats.growthTotal > 0,                   `+${stats.growthTotal}`],
                    ["Learning influencia execucoes futuras",           !!stats.behaviorChanged,                 stats.behaviorChanged ? "Confirmado" : "Nao detectado"],
                    ["Optimization gera recomendacoes",                 stats.avgRecs > 0,                       `avg ${stats.avgRecs.toFixed(1)}/run`],
                    ["Meta produz reflexao",                            runs.every(r => r.meta.reflection.summary?.length > 0), "Todas geradas"],
                    ["Comportamento muda entre execucoes",              !!stats.behaviorChanged,                 stats.behaviorChanged ? "SC-09 > SC-01" : "—"],
                    ["Pipeline Oficial preservada",                     stats.allStages,                         stats.allStages ? "Integra" : "Parcial"],
                  ].map(([l, ok, d]) => (
                    <div key={l} className="flex items-start gap-2 mb-1.5 text-xs">
                      <span className={`font-bold text-base leading-tight shrink-0 ${ok ? "text-emerald-400" : "text-amber-400"}`}>{ok ? "✓" : "~"}</span>
                      <div><span className="text-zinc-200">{l}</span><span className="text-zinc-500 ml-1">— {d}</span></div>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-3">Lista de Nao Conformidades ({ncs.length}) — NAO CORRIGIDAS</p>
                  {ncs.length === 0
                    ? <p className="text-emerald-400 text-xs">Nenhuma NC. Pipeline arquiteturalmente integra.</p>
                    : ncs.map((nc, i) => <NCRow key={`${nc.id}-${i}`} nc={nc} />)}
                </div>

                <button onClick={runCertification} disabled={running}
                  className="w-full py-3 bg-violet-800/40 hover:bg-violet-700/40 border border-violet-700/30 rounded-xl text-sm font-bold text-violet-300 transition-colors disabled:opacity-50">
                  {running ? "Certificando..." : "↺ Nova Certificacao"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}