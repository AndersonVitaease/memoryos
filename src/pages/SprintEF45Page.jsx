/**
 * SprintEF45Page.jsx — Sprint EF-45 · Dynamic Planning Engine
 *
 * Demonstra o fluxo completo com revisão dinâmica de planos:
 *   Goal → CognitiveOrchestrator → DynamicPlanningEngine → Planner
 *
 * Permite simular falhas, novas informações e remoções de tasks
 * e observar as revisões geradas em tempo real.
 */

import React, { useState, useCallback, useRef } from "react";

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
    teal:   "bg-teal-950/60 text-teal-300 border-teal-700",
    rose:   "bg-rose-950/60 text-rose-300 border-rose-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-xl px-3 py-2.5 text-center">
      <div className={`text-sm font-black font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

const KIND_COLOR = {
  no_change: "zinc", reorder: "sky", skip_task: "amber",
  retry_task: "indigo", replace_task: "violet", inject_task: "teal",
  abort: "red", full_replan: "rose",
};

const STATUS_COLOR = {
  pending: "text-zinc-500", running: "text-sky-400", completed: "text-emerald-400",
  failed: "text-red-400", skipped: "text-zinc-600", retrying: "text-amber-400",
};

const STATUS_DOT = {
  pending: "bg-zinc-700", running: "bg-sky-400 animate-pulse", completed: "bg-emerald-500",
  failed: "bg-red-500", skipped: "bg-zinc-700", retrying: "bg-amber-400 animate-pulse",
};

// ── Task control row ──────────────────────────────────────────────────────────

function TaskRow({ task, record, onComplete, onFail, onSkip }) {
  const status = record?.status ?? "pending";
  return (
    <div className={`flex items-center gap-2 py-2 border-b border-zinc-800/40 last:border-0 text-xs`}>
      <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      <span className={`flex-1 font-mono ${STATUS_COLOR[status]}`}>{task.title}</span>
      <Badge label={task.type} color={{ fetch:"sky",read:"indigo",compare:"violet",transform:"amber",synthesize:"green",validate:"teal",analyze:"rose" }[task.type] ?? "zinc"} />
      {task.canParallelize && <Badge label="‖" color="sky" />}
      <span className={`w-20 text-right font-bold ${STATUS_COLOR[status]}`}>{status}</span>
      {status === "pending" || status === "retrying" ? (
        <div className="flex gap-1 ml-1">
          <button onClick={() => onComplete(task.id)} className="px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 border border-emerald-800 rounded text-xs hover:bg-emerald-800">✓</button>
          <button onClick={() => onFail(task.id)}     className="px-1.5 py-0.5 bg-red-950/50 text-red-400 border border-red-900 rounded text-xs hover:bg-red-900">✗</button>
          <button onClick={() => onSkip(task.id)}     className="px-1.5 py-0.5 bg-zinc-800 text-zinc-500 border border-zinc-700 rounded text-xs hover:text-white">–</button>
        </div>
      ) : <div className="w-20" />}
    </div>
  );
}

// ── Revision card ─────────────────────────────────────────────────────────────

function RevisionCard({ rev, idx }) {
  const [open, setOpen] = useState(idx === 0);
  return (
    <div className={`border rounded-xl overflow-hidden ${rev.kind === "no_change" ? "border-zinc-800" : "border-violet-800/40"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-zinc-900/60 hover:bg-zinc-800/40">
        <span className="text-zinc-600 font-mono text-xs">#{idx + 1}</span>
        <Badge label={rev.kind.replace(/_/g," ").toUpperCase()} color={KIND_COLOR[rev.kind] ?? "zinc"} />
        <Badge label={rev.trigger.replace(/_/g," ")} color="zinc" />
        <span className="flex-1 text-zinc-400 text-xs truncate">{rev.rationale}</span>
        <span className="text-zinc-700 text-xs font-mono">{rev.durationMs}ms</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-zinc-800/50 pt-2">
          <p className="text-zinc-400 text-xs">{rev.rationale}</p>
          {rev.affectedTaskIds.length > 0 && (
            <p className="text-xs"><span className="text-zinc-600">affected: </span>
              <span className="text-amber-400 font-mono">{rev.affectedTaskIds.join(", ")}</span>
            </p>
          )}
          {rev.removedTaskIds.length > 0 && (
            <p className="text-xs"><span className="text-zinc-600">removed: </span>
              <span className="text-red-400 font-mono">{rev.removedTaskIds.join(", ")}</span>
            </p>
          )}
          {rev.revisedPlan && (
            <p className="text-xs"><span className="text-zinc-600">new plan: </span>
              <span className="text-violet-400 font-mono">{rev.revisedPlan.id}</span>
              <span className="text-zinc-600 ml-2">· {rev.revisedPlan.tasks.length} tasks</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "simulate",     label: "Simulação" },
  { id: "revisions",   label: "Revisões"  },
  { id: "progress",    label: "Progresso" },
  { id: "architecture",label: "Arquitetura" },
];

const EXAMPLES = [
  { label: "Compare README vs Drive", intent: "Compare meu README do GitHub com a documentação do Drive" },
  { label: "Analisar repositório",    intent: "Analise e revise meu código do repositório" },
  { label: "Criar relatório",         intent: "Crie um relatório de status com base nos dados do Drive e GitHub" },
  { label: "Abrir empresa",           intent: "Quero abrir uma empresa LTDA no Brasil" },
];

export default function SprintEF45Page() {
  const [intent,     setIntent]     = useState(EXAMPLES[0].intent);
  const [running,    setRunning]    = useState(false);
  const [error,      setError]      = useState(null);
  const [tab,        setTab]        = useState("simulate");
  const [plan,       setPlan]       = useState(null);      // CognitivePlan
  const [stateSnap,  setStateSnap]  = useState(null);      // PlanningStateSnapshot
  const [revisions,  setRevisions]  = useState([]);
  const [progress,   setProgress]   = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [newInfoKey, setNewInfoKey] = useState("external_fact");
  const [newInfoVal, setNewInfoVal] = useState("nova premissa detectada");

  // Hold mutable references between renders
  const stateRef   = useRef(null);   // PlanningState instance
  const engRef     = useRef(null);   // DynamicPlanningEngine instance
  const planRef    = useRef(null);   // current active CognitivePlan

  const refreshUI = useCallback(() => {
    if (!stateRef.current || !engRef.current || !planRef.current) return;
    const snap  = stateRef.current.snapshot();
    const { revision, activePlan: ap, progress: prog } = engRef.current.evaluate(planRef.current, stateRef.current);
    const revLog = engRef.current.getRevisionLog(planRef.current.id);
    setStateSnap(snap);
    setRevisions([...revLog].reverse());
    setProgress(prog);
    if (ap.id !== planRef.current.id) {
      planRef.current = ap;
      setActivePlan(ap);
    }
  }, []);

  const handleBuild = useCallback(async () => {
    if (!intent.trim()) return;
    setRunning(true); setError(null); setPlan(null); setStateSnap(null);
    setRevisions([]); setProgress(null); setActivePlan(null);
    stateRef.current = null; engRef.current = null; planRef.current = null;

    try {
      const [
        { processIntent, validateAndPromote },
        { CognitiveOrchestrator },
        { PlanningState },
        { DynamicPlanningEngine },
      ] = await Promise.all([
        import("@/lib/goal-engine/GoalEngine"),
        import("@/lib/cognitive-orchestrator/CognitiveOrchestrator"),
        import("@/lib/cognitive-orchestrator/PlanningState"),
        import("@/lib/cognitive-orchestrator/DynamicPlanningEngine"),
      ]);

      const identityContext = { userId: "demo-user", sessionId: "ef45-demo", workspaceId: "default" };
      const g  = await processIntent({ userIntent: intent, identityContext });
      await validateAndPromote(g.id);
      g.status = "Validated";

      const orch = CognitiveOrchestrator.orchestrate(g);
      const cp   = orch.plan;

      const state = new PlanningState(cp);
      stateRef.current  = state;
      engRef.current    = DynamicPlanningEngine;
      planRef.current   = cp;

      setPlan(cp);
      setActivePlan(cp);
      setTab("simulate");

      const snap = state.snapshot();
      setStateSnap(snap);

      // Initial evaluation
      const { progress: prog, revision } = DynamicPlanningEngine.evaluate(cp, state);
      setProgress(prog);
      setRevisions([revision].reverse());
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [intent]);

  const handleComplete = useCallback((taskId) => {
    if (!stateRef.current) return;
    stateRef.current.markRunning(taskId);
    stateRef.current.markCompleted(taskId, { result: "mock output" });
    refreshUI();
  }, [refreshUI]);

  const handleFail = useCallback((taskId) => {
    if (!stateRef.current) return;
    stateRef.current.markRunning(taskId);
    stateRef.current.markFailed(taskId, "Simulated failure");
    refreshUI();
  }, [refreshUI]);

  const handleSkip = useCallback((taskId) => {
    if (!stateRef.current) return;
    stateRef.current.markSkipped(taskId);
    refreshUI();
  }, [refreshUI]);

  const handleInjectInfo = useCallback(() => {
    if (!stateRef.current || !engRef.current || !planRef.current) return;
    const result = engRef.current.injectAndEvaluate(planRef.current, stateRef.current, {
      key: newInfoKey, value: newInfoVal,
    });
    const revLog = engRef.current.getRevisionLog(planRef.current.id);
    setRevisions([...revLog].reverse());
    setProgress(result.progress);
    setStateSnap(stateRef.current.snapshot());
  }, [newInfoKey, newInfoVal]);

  const currentTasks = activePlan?.tasks ?? plan?.tasks ?? [];
  const records = stateSnap?.taskRecords ?? {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-45" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Dynamic Planning Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Revisão contínua de planos cognitivos</span>
          </div>
          <h1 className="text-xl font-black text-white">Dynamic Planning Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            CognitiveOrchestrator → <span className="text-violet-400 font-bold">DynamicPlanningEngine</span> → Planner → Connector Router → Runtime
          </p>
        </div>

        {/* Input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map(e => (
              <button key={e.label} onClick={() => setIntent(e.intent)}
                className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors
                  ${intent === e.intent ? "bg-violet-800 text-violet-100 border-violet-600" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"}`}>
                {e.label}
              </button>
            ))}
          </div>
          <textarea value={intent} onChange={e => setIntent(e.target.value)} rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 resize-none focus:outline-none focus:border-violet-600" />
          <button onClick={handleBuild} disabled={running || !intent.trim()}
            className="w-full py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
            {running ? "Construindo plano..." : "▶ Construir plano + DynamicPlanningEngine"}
          </button>
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">GoalEngine → CognitiveOrchestrator → PlanningState → DynamicPlanningEngine...</p>
          </div>
        )}

        {error && <div className="bg-red-950/30 border border-red-800 rounded-xl p-4"><p className="text-red-400 text-xs">{error}</p></div>}

        {/* Metrics */}
        {progress && !running && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <Metric label="Total"     value={progress.totalTasks}      color="text-zinc-400" />
            <Metric label="Concluídas" value={progress.completedCount} color="text-emerald-400" />
            <Metric label="Falhas"    value={progress.failedCount}     color={progress.failedCount > 0 ? "text-red-400" : "text-zinc-600"} />
            <Metric label="Prontas"   value={progress.readyTaskIds.length} color="text-sky-400" />
            <Metric label="Progresso" value={`${progress.completionPct}%`} color="text-violet-400" />
            <Metric label="Revisões"  value={revisions.length}         color="text-amber-400" />
          </div>
        )}

        {/* Tabs */}
        {plan && !running && (
          <>
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                    ${tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── SIMULAÇÃO ── */}
            {tab === "simulate" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-3">
                    Tasks do plano ativo
                    {activePlan?.id !== plan.id && <span className="text-violet-400 ml-2">[REVISADO]</span>}
                  </p>
                  <p className="text-zinc-600 text-xs mb-3">
                    ✓ concluir · ✗ falhar · – pular · O DynamicPlanningEngine revisará automaticamente.
                  </p>
                  <div>
                    {currentTasks.length === 0
                      ? <p className="text-zinc-600 text-xs text-center py-4">Todas as tasks foram removidas ou concluídas.</p>
                      : currentTasks.map(t => (
                        <TaskRow key={t.id} task={t} record={records[t.id]}
                          onComplete={handleComplete} onFail={handleFail} onSkip={handleSkip} />
                      ))
                    }
                  </div>
                </div>

                {/* Inject new information */}
                <div className="bg-zinc-900 border border-zinc-700/30 rounded-xl p-4 space-y-3">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider font-bold">Injetar nova informação</p>
                  <div className="flex gap-2">
                    <input value={newInfoKey} onChange={e => setNewInfoKey(e.target.value)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-600"
                      placeholder="key (ex: external_fact)" />
                    <input value={newInfoVal} onChange={e => setNewInfoVal(e.target.value)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-600"
                      placeholder="valor / premissa" />
                    <button onClick={handleInjectInfo}
                      className="px-3 py-1.5 bg-teal-900/60 text-teal-300 border border-teal-700 rounded text-xs hover:bg-teal-800/60">
                      Injetar
                    </button>
                  </div>
                </div>

                {/* Blocked / ready indicators */}
                {progress && (progress.readyTaskIds.length > 0 || progress.blockedTaskIds.length > 0) && (
                  <div className="grid grid-cols-2 gap-2">
                    {progress.readyTaskIds.length > 0 && (
                      <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-3">
                        <p className="text-emerald-400 text-xs font-bold mb-1">Prontas para executar</p>
                        {progress.readyTaskIds.map(id => {
                          const t = currentTasks.find(x => x.id === id);
                          return <p key={id} className="text-zinc-400 text-xs">· {t?.title ?? id}</p>;
                        })}
                      </div>
                    )}
                    {progress.blockedTaskIds.length > 0 && (
                      <div className="bg-red-950/20 border border-red-800/30 rounded-xl p-3">
                        <p className="text-red-400 text-xs font-bold mb-1">Bloqueadas por falha</p>
                        {progress.blockedTaskIds.map(id => {
                          const t = currentTasks.find(x => x.id === id);
                          return <p key={id} className="text-zinc-400 text-xs">· {t?.title ?? id}</p>;
                        })}
                      </div>
                    )}
                  </div>
                )}

                {progress?.parallelOpportunities.length > 0 && (
                  <div className="bg-sky-950/20 border border-sky-800/30 rounded-xl p-3">
                    <p className="text-sky-400 text-xs font-bold mb-1">Oportunidade paralela detectada</p>
                    {progress.parallelOpportunities.map((group, i) => (
                      <p key={i} className="text-zinc-400 text-xs">{group.length} tasks podem executar em paralelo</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── REVISÕES ── */}
            {tab === "revisions" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{revisions.length} revisão(ões) · mais recente primeiro</p>
                {revisions.length === 0
                  ? <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-600 text-sm">Nenhuma revisão ainda.</div>
                  : revisions.map((r, i) => <RevisionCard key={r.id} rev={r} idx={revisions.length - 1 - i} />)
                }
              </div>
            )}

            {/* ── PROGRESSO ── */}
            {tab === "progress" && progress && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${progress.completionPct}%` }} />
                    </div>
                    <span className="text-violet-400 font-mono text-sm font-bold">{progress.completionPct}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      ["isComplete",          progress.isComplete,          "green"],
                      ["isStalled",           progress.isStalled,           "red"],
                      ["criticalPathBlocked", progress.criticalPathBlocked, "red"],
                      ["parallelOpportunity", progress.parallelOpportunities.length > 0, "sky"],
                    ].map(([k, v, c]) => (
                      <div key={k} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${v ? `bg-${c}-500` : "bg-zinc-700"}`} />
                        <span className="text-zinc-500 font-mono">{k}</span>
                        <span className={`ml-auto font-bold ${v ? `text-${c}-400` : "text-zinc-600"}`}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-zinc-600 text-xs">elapsedMs: {progress.elapsedMs}ms</p>
                </div>
              </div>
            )}

            {/* ── ARQUITETURA ── */}
            {tab === "architecture" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Arquivos criados — Sprint EF-45</p>
                  {[
                    ["PlanningState.ts",        "Estado mutável da execução · markRunning/Completed/Failed/Skipped · snapshot()"],
                    ["ExecutionProgress.ts",    "Métricas de progresso · Kahn sort · critical path · parallel opportunities"],
                    ["PlanningRevision.ts",     "Decisão imutável de revisão · RevisionKind · RevisionLog"],
                    ["DynamicPlanningEngine.ts","5 regras prioridade: failure→replan→skip→parallel→abort · HMR singleton"],
                  ].map(([f, d]) => (
                    <div key={f} className="border-b border-zinc-800/40 pb-2 last:border-0 space-y-0.5">
                      <p className="text-violet-400 font-mono text-xs">src/lib/cognitive-orchestrator/{f}</p>
                      <p className="text-zinc-600 text-xs">{d}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Fluxo EF-45 completo</p>
                  {[
                    ["GoalEngine",             "processIntent → validateAndPromote → Goal{status:Validated}"],
                    ["CognitiveOrchestrator",  "orchestrate(Goal) → CognitivePlan (EF-43)"],
                    ["PlanningState",          "new PlanningState(plan) → todos pending"],
                    ["DynamicPlanningEngine",  "evaluate(plan, state) → PlanningRevision em cada mudança"],
                    ["Planner",                "createPlan(goalId) → ExecutionPlan (sem modificação)"],
                    ["Connector Router",       "routing por capability → connector (sem modificação)"],
                    ["Connector Runtime",      "execução real (sem modificação)"],
                  ].map(([layer, desc], i) => (
                    <div key={layer} className="flex gap-3">
                      {i > 0 && i === 3 ? (
                        <span className="text-violet-500 text-xs mt-0.5 shrink-0">▼</span>
                      ) : (
                        <span className="text-zinc-700 text-xs mt-0.5 shrink-0">{i > 0 ? "↓" : "·"}</span>
                      )}
                      <div>
                        <span className={`text-xs font-bold ${i === 3 ? "text-violet-400" : "text-zinc-300"}`}>{layer}</span>
                        <span className="text-zinc-600 text-xs ml-2">{desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Justificativa — Zero modificações</p>
                  {[
                    ["GoalEngine intacto",            "DPE consome CognitivePlan (EF-43 output). Sem hooks ou patches."],
                    ["PlannerEngine intacto",         "Hand-off permanece via PlannerEngine.createPlan(goalId). DPE não interfere."],
                    ["ConnectorRouter/Runtime intactos","DPE decide sobre plano — não sobre execução de conectores."],
                    ["Regras por prioridade",         "failure > new_info > skip_unnecessary > parallel > abort. Determinístico."],
                    ["Imutabilidade",                 "PlanningRevision e CognitivePlan são Object.freeze. PlanningState é mutável internamente mas exporta apenas snapshots."],
                  ].map(([title, text]) => (
                    <div key={title} className="border-l-2 border-violet-800/40 pl-3 space-y-0.5">
                      <p className="text-zinc-300 text-xs font-semibold">{title}</p>
                      <p className="text-zinc-600 text-xs">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!plan && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Dynamic Planning Engine v1.0</p>
            <p className="text-zinc-600 text-xs">Selecione um exemplo · Construa o plano · Simule falhas e revisões</p>
          </div>
        )}
      </div>
    </div>
  );
}