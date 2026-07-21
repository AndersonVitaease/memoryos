/**
 * SprintEF43Page.jsx — Sprint EF-43 · Cognitive Orchestrator v1.0
 *
 * Dashboard interativo que demonstra o fluxo completo:
 *   Goal (via GoalEngine) → CognitiveOrchestrator → CognitivePlan → PlannerEngine → Journey
 *
 * NÃO executa conectores reais.
 * Demonstra a camada de raciocínio antes da execução.
 */

import React, { useState, useCallback } from "react";

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

function taskTypeColor(type) {
  return { fetch:"sky", read:"indigo", compare:"violet", transform:"amber", synthesize:"green", validate:"teal", analyze:"rose" }[type] ?? "zinc";
}

// ── Example intents ───────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: "Compare README vs Drive", intent: "Compare meu README do GitHub com a documentação do Drive" },
  { label: "Abrir empresa",           intent: "Quero abrir uma empresa LTDA no Brasil" },
  { label: "Analisar código",         intent: "Analise e revise meu código do repositório" },
  { label: "Resumir documento",       intent: "Resuma o documento de especificação do Drive" },
  { label: "Emitir nota fiscal",      intent: "Preciso emitir uma nota fiscal eletrônica" },
  { label: "Buscar emails",           intent: "Busque e mostre os emails não lidos do Gmail" },
  { label: "Registrar marca",         intent: "Registrar minha marca no INPI" },
  { label: "Criar relatório",         intent: "Crie um relatório de status do projeto com base nos dados do Drive e GitHub" },
];

// ── Task graph visualizer ─────────────────────────────────────────────────────

function TaskGraph({ plan }) {
  const [open, setOpen] = useState({});
  const taskMap = new Map(plan.tasks.map(t => [t.id, t]));

  // Build parallel groups from orderedTaskIds + canParallelize
  const groups = [];
  const assigned = new Set();
  for (const id of plan.orderedTaskIds) {
    if (assigned.has(id)) continue;
    const task = taskMap.get(id);
    if (!task) continue;
    const depKey = [...task.dependsOn].sort().join(",");
    if (task.canParallelize) {
      const siblings = plan.orderedTaskIds.filter(sid => {
        if (assigned.has(sid)) return false;
        const s = taskMap.get(sid);
        return s?.canParallelize && [...s.dependsOn].sort().join(",") === depKey;
      });
      if (siblings.length > 1) {
        groups.push(siblings);
        siblings.forEach(s => assigned.add(s));
        continue;
      }
    }
    groups.push([id]);
    assigned.add(id);
  }

  return (
    <div className="space-y-2">
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && (
            <div className="flex justify-center">
              <span className="text-zinc-700 text-sm">↓</span>
            </div>
          )}
          <div className={`flex gap-2 ${group.length > 1 ? "flex-row flex-wrap" : "flex-col"}`}>
            {group.map(id => {
              const t = taskMap.get(id);
              if (!t) return null;
              const isOpen = open[id];
              return (
                <button key={id} onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
                  className={`flex-1 min-w-[200px] border rounded-xl px-4 py-3 text-left transition-colors
                    ${isOpen ? "border-violet-700 bg-violet-950/20" : "border-zinc-700/50 bg-zinc-900/60 hover:border-zinc-600"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-zinc-600 font-mono text-xs">#{t.index + 1}</span>
                    <Badge label={t.type} color={taskTypeColor(t.type)} />
                    {t.canParallelize && <Badge label="parallel" color="sky" />}
                  </div>
                  <p className="text-zinc-200 text-sm font-semibold">{t.title}</p>
                  {isOpen && (
                    <div className="mt-2 space-y-1 border-t border-zinc-700 pt-2 text-xs">
                      <p className="text-zinc-400">{t.description}</p>
                      <p><span className="text-zinc-600">input: </span><span className="text-zinc-400">{t.expectedInput}</span></p>
                      <p><span className="text-zinc-600">output: </span><span className="text-zinc-400">{t.expectedOutput}</span></p>
                      <p><span className="text-zinc-600">capability: </span><span className="text-violet-400 font-mono">{t.requiredCapability}</span></p>
                      {t.dependsOn.length > 0 && (
                        <p><span className="text-zinc-600">depends on: </span>
                          <span className="text-amber-400 font-mono">{t.dependsOn.length} task(s)</span>
                        </p>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Plan panel ────────────────────────────────────────────────────────────────

function PlanPanel({ result }) {
  const { plan } = result;
  return (
    <div className="space-y-4">
      {/* Plan header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge label={`INTENT: ${plan.intent.replace(/_/g," ").toUpperCase()}`} color="violet" />
          <Badge label={plan.strategy} color="sky" />
          <Badge label={plan.complexity} color={plan.complexity === "Simple" ? "green" : plan.complexity === "Moderate" ? "amber" : "rose"} />
          <Badge label={plan.canHandOff ? "READY FOR PLANNER" : "NOT READY"} color={plan.canHandOff ? "green" : "red"} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="Tasks"       value={plan.tasks.length}              color="text-violet-400" />
          <Metric label="Paralelas"   value={plan.tasks.filter(t => t.canParallelize).length} color="text-sky-400" />
          <Metric label="Confidence"  value={`${Math.round(plan.confidenceScore * 100)}%`}   color="text-emerald-400" />
          <Metric label="Tempo"       value={`${plan.durationMs}ms`}          color="text-zinc-400" />
        </div>
        <div className="bg-zinc-800/40 rounded-lg px-3 py-2 text-xs">
          <span className="text-zinc-600">expectedOutput: </span>
          <span className="text-zinc-300">{plan.expectedOutput}</span>
        </div>
      </div>

      {/* Task graph */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4 font-bold">
          Grafo de Execução — {plan.tasks.length} tasks · ordem topológica
        </p>
        <TaskGraph plan={plan} />
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="border border-amber-800/30 rounded-xl p-3 space-y-1">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">Avisos</p>
          {result.warnings.map((w, i) => <p key={i} className="text-amber-400/60 text-xs">{w}</p>)}
        </div>
      )}
    </div>
  );
}

// ── Integration panel ─────────────────────────────────────────────────────────

function IntegrationPanel({ result, goal, plannerPlan }) {
  const steps = [
    { label: "Goal Engine",           status: "done",    detail: `Goal '${goal?.title ?? "—"}' · status: ${goal?.status ?? "—"}` },
    { label: "Cognitive Orchestrator",status: "done",    detail: `Intent: ${result.plan.intent} · ${result.plan.tasks.length} tasks · ${result.plan.durationMs}ms` },
    { label: "Planner Engine",        status: plannerPlan ? "done" : "pending", detail: plannerPlan ? `Plan '${plannerPlan.id}' · ${plannerPlan.steps.length} steps · status: ${plannerPlan.status}` : "Aguardando hand-off" },
    { label: "Connector Router",      status: "pending", detail: "Routing por capability → connector" },
    { label: "Connector Runtime",     status: "pending", detail: "Execução real dos conectores" },
    { label: "Result Synthesizer",    status: "pending", detail: "Síntese da resposta final" },
  ];

  const statusColor = { done: "text-emerald-400", pending: "text-zinc-600", error: "text-red-400" };
  const statusDot   = { done: "bg-emerald-400", pending: "bg-zinc-700", error: "bg-red-500" };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Fluxo de Integração com Arquitetura Existente</p>
      <div className="flex flex-col gap-0">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className="flex items-start gap-3 py-2">
              <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${statusDot[s.status]}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold font-mono ${statusColor[s.status]}`}>{s.label}</p>
                <p className="text-zinc-600 text-xs mt-0.5">{s.detail}</p>
              </div>
            </div>
            {i < steps.length - 1 && <div className="ml-1 border-l border-zinc-800 h-3" />}
          </React.Fragment>
        ))}
      </div>

      {plannerPlan && (
        <div className="border border-zinc-700/30 rounded-lg p-3 space-y-2 mt-2">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Planner ExecutionPlan gerado</p>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Steps"    value={plannerPlan.steps.length}                   color="text-violet-400" />
            <Metric label="Strategy" value={plannerPlan.executionStrategy}               color="text-sky-400" />
            <Metric label="Status"   value={plannerPlan.status}                          color="text-emerald-400" />
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {plannerPlan.steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-700 w-4 text-right">{i + 1}.</span>
                <span className="text-zinc-400">{s.title}</span>
                {s.approvalRequired && <Badge label="approval" color="amber" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Architecture doc ──────────────────────────────────────────────────────────

function ArchPanel() {
  const files = [
    ["COTypes.ts",                "Tipos imutáveis e contratos da camada cognitiva",   "Zero"],
    ["IntentAnalyzer.ts",         "Extrai OperationalIntent do Goal via pattern matching", "Zero"],
    ["TaskDecomposer.ts",         "Mapeia intent → CognitiveTasks por template",        "Zero"],
    ["TaskDependencyResolver.ts", "Sort topológico (Kahn) + grupos paralelos",           "Zero"],
    ["CognitiveOrchestrator.ts",  "Coordena os 4 módulos acima · HMR-safe singleton",   "Zero"],
  ];
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Arquivos criados — Sprint EF-43</p>
        <div className="space-y-2">
          {files.map(([f, d, mod]) => (
            <div key={f} className="flex flex-wrap items-start gap-2 text-xs border-b border-zinc-800/40 pb-2 last:border-0">
              <span className="text-violet-400 font-mono min-w-[240px]">src/lib/cognitive-orchestrator/{f}</span>
              <span className="text-zinc-500 flex-1">{d}</span>
              <Badge label={`Modifica existente: ${mod}`} color={mod === "Zero" ? "green" : "amber"} />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Justificativa arquitetural</p>
        {[
          ["GoalEngine não foi modificado", "O CognitiveOrchestrator consome um Goal já processado. Nenhum hook adicionado ao GoalEngine."],
          ["PlannerEngine não foi modificado", "O hand-off é feito pelo caller (dashboard) via PlannerEngine.createPlan(goalId). O Orchestrator apenas produz o CognitivePlan."],
          ["IntentAnalyzer ≠ GoalAnalyzer", "GoalAnalyzer mapeia keywords → AnalysisResult (domínio jurídico). IntentAnalyzer mapeia AnalysisResult → OperationalIntent (domínio cognitivo). SRPs distintos."],
          ["Imutabilidade total", "Todos os objetos produzidos usam Object.freeze(). Tasks têm dependsOn como readonly array."],
          ["Sem hardcode de conectores", "O Orchestrator não conhece GitHub, Drive ou Gmail. Usa 'requiredCapability' genérico — o Planner resolve para conectores."],
        ].map(([title, text]) => (
          <div key={title} className="border-l-2 border-violet-800/40 pl-3 space-y-0.5">
            <p className="text-zinc-300 text-xs font-semibold">{title}</p>
            <p className="text-zinc-600 text-xs">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "demo",         label: "Demo Interativa" },
  { id: "plan",         label: "CognitivePlan"   },
  { id: "integration",  label: "Integração"      },
  { id: "architecture", label: "Arquitetura"     },
];

export default function SprintEF43Page() {
  const [intent,      setIntent]      = useState(EXAMPLES[0].intent);
  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [goal,        setGoal]        = useState(null);
  const [plannerPlan, setPlannerPlan] = useState(null);
  const [error,       setError]       = useState(null);
  const [tab,         setTab]         = useState("demo");
  const [includeHandoff, setIncludeHandoff] = useState(true);

  const handleRun = useCallback(async () => {
    if (!intent.trim()) return;
    setRunning(true); setResult(null); setGoal(null); setPlannerPlan(null); setError(null);
    try {
      const [
        { processIntent, validateAndPromote },
        { CognitiveOrchestrator },
        { createPlan, validateAndApprovePlan },
      ] = await Promise.all([
        import("@/lib/goal-engine/GoalEngine"),
        import("@/lib/cognitive-orchestrator/CognitiveOrchestrator"),
        import("@/lib/planner-engine/PlannerEngine"),
      ]);

      const identityContext = { userId: "demo-user", sessionId: "ef43-demo", workspaceId: "default" };

      // Step 1: GoalEngine — process intent
      const g = await processIntent({ userIntent: intent, identityContext });
      await validateAndPromote(g.id);
      g.status = "Validated"; // reflect locally
      setGoal({ ...g });

      // Step 2: CognitiveOrchestrator — orchestrate
      const orch = CognitiveOrchestrator.orchestrate(g);
      setResult(orch);
      setTab("plan");

      // Step 3 (optional): Hand-off to PlannerEngine
      if (includeHandoff) {
        const plan = await createPlan(g.id, identityContext);
        const { plan: approved } = validateAndApprovePlan(plan.id);
        setPlannerPlan(approved);
        setTab("integration");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [intent, includeHandoff]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-43" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Cognitive Orchestrator v1.0</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Início da camada cognitiva do MemoryOS</span>
          </div>
          <h1 className="text-xl font-black text-white">Cognitive Orchestrator</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Goal Engine → <span className="text-violet-400 font-bold">Cognitive Orchestrator</span> → Planner → Connector Router → Runtime
          </p>
        </div>

        {/* Input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <p className="text-zinc-400 text-xs uppercase tracking-wider font-bold">Intenção do usuário</p>

          {/* Examples */}
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
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 resize-none focus:outline-none focus:border-violet-600"
            placeholder="Digite ou edite a intenção..." />

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={includeHandoff} onChange={e => setIncludeHandoff(e.target.checked)}
                className="accent-violet-500" />
              Hand-off automático para o Planner
            </label>
            <button onClick={handleRun} disabled={running || !intent.trim()}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors ml-auto">
              {running ? "Orquestrando..." : "▶ Orquestrar"}
            </button>
          </div>
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">GoalEngine → IntentAnalyzer → TaskDecomposer → DependencyResolver → Planner...</p>
          </div>
        )}

        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Metrics bar */}
        {result && !running && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Metric label="Intent"    value={result.plan.intent.replace(/_/g," ")} color="text-violet-400" />
            <Metric label="Tasks"     value={result.plan.tasks.length}             color="text-sky-400" />
            <Metric label="Parallel"  value={result.plan.tasks.filter(t => t.canParallelize).length} color="text-teal-400" />
            <Metric label="Strategy"  value={result.plan.strategy}                 color="text-amber-400" />
            <Metric label="Planner"   value={result.plannerReady ? "READY" : "—"} color={result.plannerReady ? "text-emerald-400" : "text-zinc-600"} />
          </div>
        )}

        {/* Tabs */}
        {result && !running && (
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

            {tab === "demo" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <p className="text-zinc-400 text-xs uppercase tracking-wider font-bold">Resumo da Orquestração</p>
                <p className="text-zinc-300 text-sm">{result.summary}</p>
                <div className="bg-zinc-800/40 rounded-lg px-3 py-2 text-xs space-y-1 mt-2">
                  <p><span className="text-zinc-600">Goal ID: </span><span className="text-violet-400 font-mono">{goal?.id}</span></p>
                  <p><span className="text-zinc-600">Plan ID: </span><span className="text-violet-400 font-mono">{result.plan.id}</span></p>
                  <p><span className="text-zinc-600">expectedOutput: </span><span className="text-zinc-300">{result.plan.expectedOutput}</span></p>
                </div>
              </div>
            )}
            {tab === "plan"        && <PlanPanel result={result} />}
            {tab === "integration" && <IntegrationPanel result={result} goal={goal} plannerPlan={plannerPlan} />}
            {tab === "architecture"&& <ArchPanel />}
          </>
        )}

        {!result && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Cognitive Orchestrator v1.0</p>
            <p className="text-zinc-600 text-xs">Selecione um exemplo ou digite uma intenção · Pressione Orquestrar</p>
            <p className="text-zinc-700 text-xs mt-3">
              GoalEngine → <span className="text-violet-700">CognitiveOrchestrator</span> → Planner → Connector Router → Runtime
            </p>
          </div>
        )}
      </div>
    </div>
  );
}