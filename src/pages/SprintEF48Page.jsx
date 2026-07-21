/**
 * SprintEF48Page.jsx — Sprint EF-48 · Capability Reasoning Engine
 *
 * Pipeline completo:
 *   Goal → CRE (CapabilityGraph) → SGE (Estratégias) → SSE (Seleção) → Orchestrator → Planner
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
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-xl px-3 py-2.5 text-center">
      <div className={`text-sm font-black font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

// ── Category config ───────────────────────────────────────────────────────────

const CAT_COLOR = {
  read:       "sky",
  write:      "teal",
  transform:  "amber",
  analyze:    "violet",
  compare:    "rose",
  search:     "indigo",
  validate:   "green",
  synthesize: "emerald",
  orchestrate:"zinc",
};

const CAT_LABEL = {
  read:"READ", write:"WRITE", transform:"TRANSFORM", analyze:"ANALYZE",
  compare:"COMPARE", search:"SEARCH", validate:"VALIDATE",
  synthesize:"SYNTHESIZE", orchestrate:"ORCHESTRATE",
};

// ── Capability node card ──────────────────────────────────────────────────────

function CapNode({ node, index, isLast }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3">
      {/* Timeline */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold
          ${node.status === "required" ? "border-violet-600 bg-violet-950/50 text-violet-300" : "border-zinc-600 bg-zinc-900 text-zinc-500"}`}>
          {index + 1}
        </div>
        {!isLast && <div className="w-px flex-1 min-h-4 bg-zinc-800 mt-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 mb-3 border rounded-xl overflow-hidden
        ${node.status === "required" ? "border-zinc-700/60 bg-zinc-900/60" : "border-zinc-800/40 bg-zinc-900/20"}`}>
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5">
          <Badge label={CAT_LABEL[node.category] ?? node.category} color={CAT_COLOR[node.category] ?? "zinc"} />
          {node.status === "optional" && <Badge label="optional" color="zinc" />}
          {node.parallelizable && <Badge label="‖ parallel" color="sky" />}
          <span className="flex-1 text-zinc-200 text-sm font-semibold font-mono">{node.capabilityName}</span>
          <span className="text-zinc-600 text-xs font-mono">{Math.round(node.confidence * 100)}% conf</span>
        </button>
        {open && (
          <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/40 pt-2">
            <p className="text-zinc-400 text-xs">{node.description}</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-zinc-800/40 rounded p-1.5 text-center">
                <div className="text-amber-400 font-mono font-bold">{node.estimatedCostScore}/10</div>
                <div className="text-zinc-600">custo</div>
              </div>
              <div className="bg-zinc-800/40 rounded p-1.5 text-center">
                <div className="text-violet-400 font-mono font-bold">{node.estimatedComplexity}/10</div>
                <div className="text-zinc-600">complexidade</div>
              </div>
              <div className="bg-zinc-800/40 rounded p-1.5 text-center">
                <div className="text-emerald-400 font-mono font-bold">{Math.round(node.confidence * 100)}%</div>
                <div className="text-zinc-600">confiança</div>
              </div>
            </div>
            {node.compatibleConnectors.length > 0 && (
              <div>
                <p className="text-zinc-600 text-xs mb-1">Conectores compatíveis</p>
                <div className="flex flex-wrap gap-1">
                  {node.compatibleConnectors.map(c => <Badge key={c} label={c} color="indigo" />)}
                </div>
              </div>
            )}
            {node.dependencies.length > 0 && (
              <div>
                <p className="text-zinc-600 text-xs mb-1">Dependências</p>
                <div className="flex flex-wrap gap-1">
                  {node.dependencies.map(d => <Badge key={d} label={d} color="amber" />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Full pipeline status ──────────────────────────────────────────────────────

function PipelinePanel({ goal, capResult, genResult, selection, cogPlan, plannerPlan }) {
  const steps = [
    { label: "Goal Engine",                isNew: false, done: !!goal,        detail: goal ? `'${goal.title}'` : "—" },
    { label: "Capability Reasoning Engine",isNew: true,  done: !!capResult,   detail: capResult ? `${capResult.graph.nodes.length} capabilities · intent: ${capResult.intent}` : "—" },
    { label: "Strategy Generation Engine", isNew: false, done: !!genResult,   detail: genResult ? `${genResult.strategies.length} estratégias geradas` : "—" },
    { label: "Strategy Selection Engine",  isNew: false, done: !!selection,   detail: selection ? `Vencedora: "${selection.winner?.label}"` : "—" },
    { label: "Cognitive Orchestrator",     isNew: false, done: !!cogPlan,     detail: cogPlan ? `${cogPlan.tasks.length} tasks` : "—" },
    { label: "Planner Engine",             isNew: false, done: !!plannerPlan, detail: plannerPlan ? `${plannerPlan.steps.length} steps` : "—" },
    { label: "Connector Router → Runtime", isNew: false, done: false,         detail: "Execução real (fora do escopo desta demo)" },
  ];
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Pipeline EF-48</p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${s.done ? "bg-emerald-500" : "bg-zinc-700"}`} />
          <div className="flex-1">
            <span className={`text-xs font-bold ${s.isNew ? "text-violet-400" : s.done ? "text-emerald-400" : "text-zinc-600"}`}>{s.label}</span>
            {s.isNew && <Badge label="NEW EF-48" color="violet" />}
            <p className="text-zinc-600 text-xs">{s.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Architecture tab ──────────────────────────────────────────────────────────

function ArchTab() {
  const files = [
    ["CapabilityGraph.ts",            "Tipos: CapabilityNode · CapabilityGraph · buildCapabilityGraph() · topoSort()"],
    ["CapabilityRegistry.ts",         "22 capabilities catalogadas em 8 categorias com metadados completos"],
    ["CapabilityResolver.ts",         "Mapeia OperationalIntent + corpus do goal → lista de CapabilityNodes"],
    ["CapabilityReasoningEngine.ts",  "Coordena Resolver + Graph · reason(goal) → CapabilityReasoningResult · HMR singleton"],
  ];
  const flow = [
    ["Goal Engine",                "processIntent → validateAndPromote",                              false],
    ["CapabilityReasoningEngine",  "reason(goal) → CapabilityGraph",                                 true],
    ["StrategyGenerationEngine",   "generate(goal) → GeneratedStrategy[]  (EF-47)",                  false],
    ["StrategySelectionEngine",    "select(goal, plan, weights) → SelectionResult  (EF-46)",         false],
    ["CognitiveOrchestrator",      "orchestrate(goal) → CognitivePlan  (EF-43)",                     false],
    ["DynamicPlanningEngine",      "evaluate(plan, state) → PlanningRevision  (EF-45)",              false],
    ["Planner Engine",             "createPlan → ExecutionPlan",                                     false],
    ["Connector Router → Runtime", "execução real",                                                  false],
  ];
  const rationale = [
    ["CapabilityGraph desacoplado de conectores",
     "O CRE raciocina sobre O QUE é necessário (capabilities) sem saber COMO (connectors). O SGE é quem mapeia capabilities → conectores. Separação de concerns."],
    ["CapabilityRegistry estático mas extensível",
     "22 capabilities cobrindo 8 categorias. Adicionar nova capability = adicionar uma entrada. Zero modificação no engine."],
    ["topoSort via Kahn's algorithm",
     "O grafo garante que nós dependentes só executam após seus predecessores. Suporta paralelismo onde parallelizable=true e dependências estão satisfeitas."],
    ["Zero modificações em EF-43/45/46/47",
     "CRE é uma camada pré-geração. Seu output (CapabilityGraph) informa o SGE, mas não o modifica. O SGE continua aceitando goals diretamente para retro-compatibilidade."],
    ["Preparação para memória episódica",
     "CapabilityNode armazena confidence por capability, abrindo caminho para ajuste contínuo via aprendizado em sprints futuras."],
  ];
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Arquivos criados — Sprint EF-48</p>
        {files.map(([f, d]) => (
          <div key={f} className="border-b border-zinc-800/40 pb-2 last:border-0 space-y-0.5">
            <p className="text-violet-400 font-mono text-xs">src/lib/capability-reasoning/{f}</p>
            <p className="text-zinc-600 text-xs">{d}</p>
          </div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Fluxo EF-48</p>
        {flow.map(([layer, desc, isNew], i) => (
          <div key={layer} className="flex gap-2 items-start">
            <span className="text-zinc-700 text-xs mt-0.5 shrink-0">{i === 0 ? "·" : "↓"}</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-bold ${isNew ? "text-violet-400" : "text-zinc-300"}`}>{layer}</span>
              {isNew && <Badge label="NEW" color="violet" />}
              <span className="text-zinc-600 text-xs">{desc}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Justificativa arquitetural</p>
        {rationale.map(([t, d]) => (
          <div key={t} className="border-l-2 border-violet-800/40 pl-3 space-y-0.5">
            <p className="text-zinc-300 text-xs font-semibold">{t}</p>
            <p className="text-zinc-600 text-xs">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "graph",        label: "Capability Graph" },
  { id: "strategies",   label: "Estratégias"      },
  { id: "pipeline",     label: "Pipeline"         },
  { id: "architecture", label: "Arquitetura"      },
];

const EXAMPLES = [
  { label: "Compare README vs Drive", intent: "Compare meu README do GitHub com a documentação do Drive" },
  { label: "Analisar repositório",    intent: "Analise e revise meu código do repositório do GitHub" },
  { label: "Buscar emails",           intent: "Busque e mostre os emails não lidos do Gmail" },
  { label: "Criar relatório",         intent: "Crie um relatório de status com dados do Drive e GitHub" },
  { label: "Resumir documento",       intent: "Resuma o documento de especificação técnica do Drive" },
  { label: "Análise de segurança",    intent: "Faça uma auditoria de segurança no repositório do GitHub" },
];

export default function SprintEF48Page() {
  const [intent,      setIntent]      = useState(EXAMPLES[0].intent);
  const [running,     setRunning]     = useState(false);
  const [error,       setError]       = useState(null);
  const [tab,         setTab]         = useState("graph");
  const [goal,        setGoal]        = useState(null);
  const [capResult,   setCapResult]   = useState(null);
  const [genResult,   setGenResult]   = useState(null);
  const [selection,   setSelection]   = useState(null);
  const [cogPlan,     setCogPlan]     = useState(null);
  const [plannerPlan, setPlannerPlan] = useState(null);

  const handleRun = useCallback(async () => {
    if (!intent.trim()) return;
    setRunning(true); setError(null);
    setGoal(null); setCapResult(null); setGenResult(null);
    setSelection(null); setCogPlan(null); setPlannerPlan(null);

    try {
      const [
        { processIntent, validateAndPromote },
        { CapabilityReasoningEngine },
        { StrategyGenerationEngine },
        { StrategySelectionEngine },
        { CognitiveOrchestrator },
        { createPlan, validateAndApprovePlan },
      ] = await Promise.all([
        import("@/lib/goal-engine/GoalEngine"),
        import("@/lib/capability-reasoning/CapabilityReasoningEngine"),
        import("@/lib/strategy-generation/StrategyGenerationEngine"),
        import("@/lib/strategy-selection/StrategySelectionEngine"),
        import("@/lib/cognitive-orchestrator/CognitiveOrchestrator"),
        import("@/lib/planner-engine/PlannerEngine"),
      ]);

      const identityContext = { userId: "demo", sessionId: "ef48", workspaceId: "default" };

      // 1. GoalEngine
      const g = await processIntent({ userIntent: intent, identityContext });
      await validateAndPromote(g.id);
      g.status = "Validated";
      setGoal(g);

      // 2. CapabilityReasoningEngine (new EF-48) — informs strategy generation
      const cap = CapabilityReasoningEngine.reason(g);
      setCapResult(cap);

      // 3. StrategyGenerationEngine (EF-47)
      const gen = StrategyGenerationEngine.generate(g);
      setGenResult(gen);

      // 4. StrategySelectionEngine (EF-46)
      const sel = StrategySelectionEngine.select(g, null);
      setSelection(sel);

      // 5. CognitiveOrchestrator (EF-43)
      const orch = CognitiveOrchestrator.orchestrate(g);
      setCogPlan(orch.plan);

      // 6. PlannerEngine
      const plan = await createPlan(g.id, identityContext);
      const { plan: approved } = validateAndApprovePlan(plan.id);
      setPlannerPlan(approved);

      setTab("graph");
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [intent]);

  const graph = capResult?.graph;
  const orderedNodes = graph
    ? graph.orderedNodeIds.map(id => graph.nodes.find(n => n.capabilityId === id)).filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-48" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Capability Reasoning Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">O que fazer → como fazer</span>
          </div>
          <h1 className="text-xl font-black text-white">Capability Reasoning Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Goal → <span className="text-violet-400 font-bold">CapabilityReasoningEngine</span> → CapabilityGraph → StrategyGenerationEngine → StrategySelectionEngine → Planner
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
          <button onClick={handleRun} disabled={running || !intent.trim()}
            className="w-full py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
            {running ? "Raciocinando sobre capabilities..." : "▶ Goal → Capability Graph → Plano"}
          </button>
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">GoalEngine → CRE → SGE → SSE → Orchestrator → Planner...</p>
          </div>
        )}
        {error && <div className="bg-red-950/30 border border-red-800 rounded-xl p-4"><p className="text-red-400 text-xs">{error}</p></div>}

        {/* Metrics */}
        {capResult && !running && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <Metric label="Capabilities"  value={graph.nodes.length}             color="text-violet-400" />
            <Metric label="Required"      value={graph.requiredNodes.length}     color="text-emerald-400" />
            <Metric label="Optional"      value={graph.optionalNodes.length}     color="text-zinc-400" />
            <Metric label="Custo total"   value={`${graph.totalEstimatedCost}/10`}  color="text-amber-400" />
            <Metric label="Confiança"     value={`${Math.round(graph.averageConfidence * 100)}%`} color="text-sky-400" />
            <Metric label="Conectores"    value={graph.uniqueConnectors.length}  color="text-teal-400" />
          </div>
        )}

        {/* Tabs */}
        {capResult && !running && (
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

            {/* ── GRAPH ── */}
            {tab === "graph" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                  <span>intent: <span className="text-violet-400">{capResult.intent}</span></span>
                  <span>·</span>
                  <span>{orderedNodes.length} nodes em ordem topológica</span>
                  <span>·</span>
                  <div className="flex gap-1">
                    {graph.uniqueConnectors.map(c => <Badge key={c} label={c} color="indigo" />)}
                  </div>
                </div>
                <div className="pl-1">
                  {orderedNodes.map((node, i) => (
                    <CapNode key={node.capabilityId} node={node} index={i} isLast={i === orderedNodes.length - 1} />
                  ))}
                </div>
              </div>
            )}

            {/* ── STRATEGIES ── */}
            {tab === "strategies" && genResult && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{genResult.strategies.length} estratégias · selecionada: <span className="text-emerald-400">"{selection?.winner?.label}"</span></p>
                {genResult.strategies.map((gs, i) => (
                  <div key={gs.strategyId}
                    className={`border rounded-xl p-3 ${selection?.winner?.approach === gs.approach && i === 0 ? "border-emerald-700/60 bg-emerald-950/10" : "border-zinc-700/40"}`}>
                    <div className="flex flex-wrap gap-2 items-center">
                      {selection?.winner?.approach === gs.approach && i === 0 && <Badge label="SELECTED" color="green" />}
                      <Badge label={gs.generationProfile} color="violet" />
                      <Badge label={gs.approach} color="zinc" />
                      <span className="text-zinc-200 text-sm font-semibold">{gs.label}</span>
                      <span className="ml-auto text-zinc-500 text-xs font-mono">{gs.estimatedLatencyMs}ms · {gs.estimatedReliability}% · c:{gs.estimatedCostScore}</span>
                    </div>
                    <p className="text-zinc-500 text-xs mt-1">{gs.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── PIPELINE ── */}
            {tab === "pipeline" && (
              <PipelinePanel goal={goal} capResult={capResult} genResult={genResult}
                selection={selection} cogPlan={cogPlan} plannerPlan={plannerPlan} />
            )}

            {tab === "architecture" && <ArchTab />}
          </>
        )}

        {!capResult && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Capability Reasoning Engine v1.0</p>
            <p className="text-zinc-600 text-xs">22 capabilities · 8 categorias · ordenação topológica · grafo de dependências</p>
          </div>
        )}
      </div>
    </div>
  );
}