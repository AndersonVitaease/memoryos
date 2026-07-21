/**
 * SprintEF49Page.jsx — Sprint EF-49 · Capability Binding Engine
 *
 * Pipeline completo:
 *   Goal → CRE → CBE (binding) → SGE → SSE → Orchestrator → Planner
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

const PROVIDER_TYPE_COLOR = {
  connector: "sky", llm: "violet", local: "teal", cache: "amber", hybrid: "indigo",
};

const STATUS_COLOR = { resolved: "green", partial: "amber", unresolved: "red" };

// ── Binding card ──────────────────────────────────────────────────────────────

function BindingCard({ binding, index }) {
  const [open, setOpen] = useState(index < 3);
  const hasFallbacks = binding.fallbackProviders.length > 0;

  return (
    <div className={`border rounded-xl overflow-hidden ${binding.status === "resolved" ? "border-zinc-700/60 bg-zinc-900/50" : "border-red-800/50 bg-red-950/10"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5">
        {/* Step number */}
        <span className="text-zinc-700 text-xs font-mono w-5 shrink-0">{index + 1}</span>

        {/* Capability */}
        <span className="text-zinc-300 text-sm font-semibold font-mono flex-1 truncate">
          {binding.capabilityName}
        </span>

        {/* Arrow */}
        <span className="text-zinc-700 text-xs shrink-0">→</span>

        {/* Primary provider */}
        <Badge label={binding.providerName} color={PROVIDER_TYPE_COLOR[binding.providerType] ?? "zinc"} />
        <Badge label={binding.status} color={STATUS_COLOR[binding.status] ?? "zinc"} />

        {/* Quick stats */}
        <div className="hidden md:flex gap-3 text-xs text-right shrink-0">
          <span className="text-sky-400 font-mono">{binding.estimatedLatencyMs}ms</span>
          <span className="text-emerald-400 font-mono">{binding.estimatedReliability}%</span>
          <span className="text-amber-400 font-mono">c:{binding.estimatedCostScore}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/40 pt-2">
          {/* Implementation */}
          <p className="text-zinc-600 text-xs font-mono">impl: {binding.implementationId}</p>

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-2">
            <Metric label="Latência"     value={`${binding.estimatedLatencyMs}ms`} color="text-sky-400" />
            <Metric label="Confiab."     value={`${binding.estimatedReliability}%`} color="text-emerald-400" />
            <Metric label="Custo"        value={`${binding.estimatedCostScore}/10`} color="text-amber-400" />
            <Metric label="Confiança"    value={`${Math.round(binding.confidence * 100)}%`} color="text-violet-400" />
          </div>

          {/* Auth + Rate */}
          <div className="flex gap-2 text-xs">
            {binding.authRequired && <Badge label="auth required" color="amber" />}
            <span className="text-zinc-600">rate limit: <span className="text-zinc-400">{binding.rateLimit}</span></span>
          </div>

          {/* Fallbacks */}
          {hasFallbacks && (
            <div>
              <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Fallback chain</p>
              <div className="space-y-1">
                {binding.fallbackProviders.map((fb, i) => (
                  <div key={fb.providerId} className="flex items-center gap-2 text-xs border border-zinc-800 rounded-lg px-2 py-1">
                    <span className="text-zinc-700">#{fb.priority}</span>
                    <Badge label={fb.providerName} color={PROVIDER_TYPE_COLOR[fb.providerType] ?? "zinc"} />
                    <span className="text-zinc-600 flex-1">{fb.reason}</span>
                    <span className="text-sky-500 font-mono">{fb.estimatedLatencyMs}ms</span>
                    <span className="text-emerald-500 font-mono">{fb.estimatedReliability}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pipeline panel ─────────────────────────────────────────────────────────────

function PipelinePanel({ goal, capResult, bindResult, genResult, selection, cogPlan, plannerPlan }) {
  const steps = [
    { label: "Goal Engine",                isNew: false, done: !!goal,        detail: goal ? `'${goal.title}'` : "—" },
    { label: "Capability Reasoning Engine",isNew: false, done: !!capResult,   detail: capResult ? `${capResult.graph.nodes.length} capabilities` : "—" },
    { label: "Capability Binding Engine",  isNew: true,  done: !!bindResult,  detail: bindResult ? `${bindResult.boundGraph.resolvedCount} resolved · ${bindResult.boundGraph.uniqueProviders.length} providers` : "—" },
    { label: "Strategy Generation Engine", isNew: false, done: !!genResult,   detail: genResult ? `${genResult.strategies.length} estratégias` : "—" },
    { label: "Strategy Selection Engine",  isNew: false, done: !!selection,   detail: selection ? `"${selection.winner?.label}"` : "—" },
    { label: "Cognitive Orchestrator",     isNew: false, done: !!cogPlan,     detail: cogPlan ? `${cogPlan.tasks.length} tasks` : "—" },
    { label: "Planner Engine",             isNew: false, done: !!plannerPlan, detail: plannerPlan ? `${plannerPlan.steps.length} steps` : "—" },
    { label: "Connector Router → Runtime", isNew: false, done: false,         detail: "Execução real (fora do escopo desta demo)" },
  ];
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Pipeline EF-49</p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${s.done ? "bg-emerald-500" : "bg-zinc-700"}`} />
          <div className="flex-1">
            <span className={`text-xs font-bold ${s.isNew ? "text-violet-400" : s.done ? "text-emerald-400" : "text-zinc-600"}`}>{s.label}</span>
            {s.isNew && <Badge label="NEW EF-49" color="violet" />}
            <p className="text-zinc-600 text-xs">{s.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Architecture tab ──────────────────────────────────────────────────────────

function ArchTab() {
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Arquivos criados — Sprint EF-49</p>
        {[
          ["BoundCapabilityGraph.ts",     "Tipos: ProviderBinding · FallbackProvider · BoundCapabilityGraph · buildBoundCapabilityGraph()"],
          ["ProviderRegistry.ts",         "13 providers catalogados: connectors + LLMs + local/cache · getProvidersForCapability()"],
          ["BindingResolver.ts",          "resolveBinding(node) → ProviderBinding · primary + secondary + emergency fallbacks"],
          ["CapabilityBindingEngine.ts",  "bind(CapabilityGraph) → BindingResult · HMR singleton"],
        ].map(([f, d]) => (
          <div key={f} className="border-b border-zinc-800/40 pb-2 last:border-0 space-y-0.5">
            <p className="text-violet-400 font-mono text-xs">src/lib/capability-binding/{f}</p>
            <p className="text-zinc-600 text-xs">{d}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Fluxo EF-49</p>
        {[
          ["Goal Engine",                "processIntent → validateAndPromote",                         false],
          ["CapabilityReasoningEngine",  "reason(goal) → CapabilityGraph  (EF-48)",                   false],
          ["CapabilityBindingEngine",    "bind(graph) → BoundCapabilityGraph",                        true],
          ["StrategyGenerationEngine",   "generate(goal) → GeneratedStrategy[]  (EF-47)",             false],
          ["StrategySelectionEngine",    "select(goal) → SelectionResult  (EF-46)",                   false],
          ["CognitiveOrchestrator",      "orchestrate(goal) → CognitivePlan  (EF-43)",                false],
          ["DynamicPlanningEngine",      "evaluate → PlanningRevision  (EF-45)",                      false],
          ["Planner Engine",             "createPlan → ExecutionPlan",                                false],
          ["Connector Router → Runtime", "execução real",                                             false],
        ].map(([layer, desc, isNew], i) => (
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
        {[
          ["Capability ≠ Provider", "CapabilityReasoningEngine descobre O QUE é necessário. CapabilityBindingEngine decide COM QUEM. Domínios diferentes, SRP preservado."],
          ["Fallback chain: primary → secondary → emergency", "Cada binding carrega até 3 providers. DynamicPlanningEngine pode usar os fallbacks em caso de falha em runtime sem alterar o plano."],
          ["ProviderRegistry independente do CapabilityRegistry", "Adicionar um novo provider (ex: Notion) exige apenas uma entrada no ProviderRegistry. Nenhuma outra camada precisa ser modificada."],
          ["Zero modificações em EF-43/45/46/47/48", "CBE é inserido entre CRE e SGE. Seu output (BoundCapabilityGraph) é informação adicional — o SGE continua aceitando goals diretamente."],
          ["Preparação para multi-LLM e multi-connector", "A mesma capability (ex: GenerateSummary) pode ser satisfeita por OpenAI, Claude, Gemini ou LLM local, sem alterar nenhuma outra camada."],
        ].map(([t, d]) => (
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
  { id: "bindings",     label: "Provider Bindings" },
  { id: "pipeline",     label: "Pipeline"          },
  { id: "providers",    label: "Providers"         },
  { id: "architecture", label: "Arquitetura"       },
];

const EXAMPLES = [
  { label: "Compare README vs Drive", intent: "Compare meu README do GitHub com a documentação do Drive" },
  { label: "Analisar repositório",    intent: "Analise e revise meu código do repositório do GitHub" },
  { label: "Buscar emails",           intent: "Busque e mostre os emails não lidos do Gmail" },
  { label: "Criar relatório",         intent: "Crie um relatório de status com dados do Drive e GitHub" },
  { label: "Resumir documento",       intent: "Resuma o documento de especificação técnica do Drive" },
  { label: "Análise de segurança",    intent: "Faça uma auditoria de segurança no repositório do GitHub" },
];

export default function SprintEF49Page() {
  const [intent,      setIntent]      = useState(EXAMPLES[0].intent);
  const [running,     setRunning]     = useState(false);
  const [error,       setError]       = useState(null);
  const [tab,         setTab]         = useState("bindings");
  const [goal,        setGoal]        = useState(null);
  const [capResult,   setCapResult]   = useState(null);
  const [bindResult,  setBindResult]  = useState(null);
  const [genResult,   setGenResult]   = useState(null);
  const [selection,   setSelection]   = useState(null);
  const [cogPlan,     setCogPlan]     = useState(null);
  const [plannerPlan, setPlannerPlan] = useState(null);
  const [allProviders, setAllProviders] = useState([]);

  const handleRun = useCallback(async () => {
    if (!intent.trim()) return;
    setRunning(true); setError(null);
    setGoal(null); setCapResult(null); setBindResult(null);
    setGenResult(null); setSelection(null); setCogPlan(null); setPlannerPlan(null);

    try {
      const [
        { processIntent, validateAndPromote },
        { CapabilityReasoningEngine },
        { CapabilityBindingEngine },
        { StrategyGenerationEngine },
        { StrategySelectionEngine },
        { CognitiveOrchestrator },
        { createPlan, validateAndApprovePlan },
        { getAllProviders },
      ] = await Promise.all([
        import("@/lib/goal-engine/GoalEngine"),
        import("@/lib/capability-reasoning/CapabilityReasoningEngine"),
        import("@/lib/capability-binding/CapabilityBindingEngine"),
        import("@/lib/strategy-generation/StrategyGenerationEngine"),
        import("@/lib/strategy-selection/StrategySelectionEngine"),
        import("@/lib/cognitive-orchestrator/CognitiveOrchestrator"),
        import("@/lib/planner-engine/PlannerEngine"),
        import("@/lib/capability-binding/ProviderRegistry"),
      ]);

      setAllProviders(getAllProviders());
      const identityContext = { userId: "demo", sessionId: "ef49", workspaceId: "default" };

      // 1. GoalEngine
      const g = await processIntent({ userIntent: intent, identityContext });
      await validateAndPromote(g.id);
      g.status = "Validated";
      setGoal(g);

      // 2. CapabilityReasoningEngine (EF-48)
      const cap = CapabilityReasoningEngine.reason(g);
      setCapResult(cap);

      // 3. CapabilityBindingEngine (new EF-49)
      const bind = CapabilityBindingEngine.bind(cap.graph);
      setBindResult(bind);

      // 4. StrategyGenerationEngine (EF-47)
      const gen = StrategyGenerationEngine.generate(g);
      setGenResult(gen);

      // 5. StrategySelectionEngine (EF-46)
      const sel = StrategySelectionEngine.select(g, null);
      setSelection(sel);

      // 6. CognitiveOrchestrator (EF-43)
      const orch = CognitiveOrchestrator.orchestrate(g);
      setCogPlan(orch.plan);

      // 7. PlannerEngine
      const plan = await createPlan(g.id, identityContext);
      const { plan: approved } = validateAndApprovePlan(plan.id);
      setPlannerPlan(approved);

      setTab("bindings");
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [intent]);

  const bound = bindResult?.boundGraph;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-49" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Capability Binding Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Capability → Provider</span>
          </div>
          <h1 className="text-xl font-black text-white">Capability Binding Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Goal → CRE → <span className="text-violet-400 font-bold">CapabilityBindingEngine</span> → BoundCapabilityGraph → SGE → SSE → Planner
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
            {running ? "Resolvendo providers..." : "▶ Goal → Capability Binding → Plano"}
          </button>
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">GoalEngine → CRE → CBE → SGE → SSE → Orchestrator → Planner...</p>
          </div>
        )}
        {error && <div className="bg-red-950/30 border border-red-800 rounded-xl p-4"><p className="text-red-400 text-xs">{error}</p></div>}

        {/* Metrics */}
        {bound && !running && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <Metric label="Bindings"    value={bound.bindings.length}     color="text-violet-400" />
            <Metric label="Resolved"    value={bound.resolvedCount}       color="text-emerald-400" />
            <Metric label="Providers"   value={bound.uniqueProviders.length} color="text-sky-400" />
            <Metric label="Avg latência" value={`${bound.avgLatencyMs}ms`} color="text-amber-400" />
            <Metric label="Avg confiabl" value={`${bound.avgReliability}%`} color="text-teal-400" />
            <Metric label="Custo total"  value={`${bound.totalEstimatedCost}`} color="text-rose-400" />
          </div>
        )}

        {/* Tabs */}
        {bound && !running && (
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

            {/* ── BINDINGS ── */}
            {tab === "bindings" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">
                  {bound.bindings.length} capabilities → providers · status: <Badge label={bound.bindingStatus} color={STATUS_COLOR[bound.bindingStatus] ?? "zinc"} />
                </p>
                {bound.bindings.map((b, i) => (
                  <BindingCard key={b.capabilityId} binding={b} index={i} />
                ))}
              </div>
            )}

            {/* ── PIPELINE ── */}
            {tab === "pipeline" && (
              <PipelinePanel goal={goal} capResult={capResult} bindResult={bindResult}
                genResult={genResult} selection={selection} cogPlan={cogPlan} plannerPlan={plannerPlan} />
            )}

            {/* ── PROVIDERS ── */}
            {tab === "providers" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{allProviders.length} providers catalogados no ProviderRegistry</p>
                {allProviders.map(p => (
                  <div key={p.id} className="border border-zinc-700/40 bg-zinc-900/40 rounded-xl p-3 space-y-1.5">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge label={p.type} color={PROVIDER_TYPE_COLOR[p.type] ?? "zinc"} />
                      <span className="text-zinc-200 text-sm font-semibold">{p.name}</span>
                      <span className="text-zinc-600 text-xs font-mono ml-auto">priority: {p.priority}</span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-sky-400 font-mono">{p.estimatedLatencyMs}ms</span>
                      <span className="text-emerald-400 font-mono">{p.estimatedReliability}%</span>
                      <span className="text-amber-400 font-mono">c:{p.estimatedCostScore}</span>
                      <span className="text-zinc-500">{p.rateLimit}</span>
                      {p.authRequired && <Badge label="auth" color="amber" />}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.supportedCapabilities.map(cap => (
                        <span key={cap} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 font-mono">{cap}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "architecture" && <ArchTab />}
          </>
        )}

        {!bound && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Capability Binding Engine v1.0</p>
            <p className="text-zinc-600 text-xs">13 providers · primary + secondary + emergency fallbacks · Capability → Provider</p>
          </div>
        )}
      </div>
    </div>
  );
}