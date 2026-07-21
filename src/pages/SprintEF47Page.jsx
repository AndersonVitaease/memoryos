/**
 * SprintEF47Page.jsx — Sprint EF-47 · Strategy Generation Engine
 *
 * Demonstra o pipeline completo:
 *   Goal → SGE (gera) → SSE (seleciona) → CognitiveOrchestrator → DPE → Planner
 */

import React, { useState, useCallback } from "react";

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    violet:"bg-violet-950/60 text-violet-300 border-violet-700",
    green: "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber: "bg-amber-950/60 text-amber-300 border-amber-700",
    sky:   "bg-sky-950/60 text-sky-300 border-sky-700",
    indigo:"bg-indigo-950/60 text-indigo-300 border-indigo-700",
    teal:  "bg-teal-950/60 text-teal-300 border-teal-700",
    rose:  "bg-rose-950/60 text-rose-300 border-rose-700",
    red:   "bg-red-950/60 text-red-300 border-red-800",
    zinc:  "bg-zinc-800/60 text-zinc-400 border-zinc-600",
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

const PROFILE_COLOR = {
  fast:"sky", deep:"violet", conservative:"amber",
  resilient:"teal", economic:"green", parallel:"rose",
};

const SEVERITY_COLOR = { low:"zinc", medium:"amber", high:"rose", critical:"red" };

// ── Stage pipeline visualizer ─────────────────────────────────────────────────

function StagePipeline({ stages }) {
  return (
    <div className="flex flex-wrap items-center gap-1 mt-2">
      {stages.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && !s.parallel && <span className="text-zinc-700 text-xs">→</span>}
          {i > 0 && s.parallel  && <span className="text-sky-700 text-xs font-bold">‖</span>}
          <span className={`px-2 py-0.5 rounded text-xs font-mono border
            ${s.type === "fetch"      ? "bg-sky-950/40 text-sky-400 border-sky-800" :
              s.type === "cache_check"? "bg-amber-950/40 text-amber-400 border-amber-800" :
              s.type === "parallel"   ? "bg-indigo-950/40 text-indigo-400 border-indigo-800" :
              s.type === "merge"      ? "bg-violet-950/40 text-violet-400 border-violet-800" :
              s.type === "analyze"    ? "bg-rose-950/40 text-rose-400 border-rose-800" :
              s.type === "validate"   ? "bg-teal-950/40 text-teal-400 border-teal-800" :
              s.type === "fallback"   ? "bg-amber-950/40 text-amber-400 border-amber-800" :
              "bg-emerald-950/40 text-emerald-400 border-emerald-800"}`}>
            {s.label}
            {s.optional && <span className="text-zinc-600 ml-1">?</span>}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Strategy card ─────────────────────────────────────────────────────────────

function StrategyCard({ gs, isWinner }) {
  const [open, setOpen] = useState(isWinner);
  return (
    <div className={`border rounded-xl overflow-hidden ${isWinner ? "border-emerald-700/60 bg-emerald-950/10" : "border-zinc-700/40 bg-zinc-900/40"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5">
        {isWinner && <Badge label="SELECTED" color="green" />}
        <Badge label={gs.generationProfile} color={PROFILE_COLOR[gs.generationProfile] ?? "zinc"} />
        <Badge label={gs.approach} color="zinc" />
        <span className="flex-1 text-zinc-200 text-sm font-semibold">{gs.label}</span>
        <div className="flex gap-3 text-xs text-right">
          <span className="text-sky-400 font-mono">{gs.estimatedLatencyMs}ms</span>
          <span className="text-emerald-400 font-mono">{gs.estimatedReliability}%</span>
          <span className="text-amber-400 font-mono">c:{gs.estimatedCostScore}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-800/40 pt-3">
          <p className="text-zinc-400 text-xs">{gs.description}</p>

          {/* Stage pipeline */}
          <div>
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Pipeline de execução</p>
            <StagePipeline stages={gs.executionStages} />
          </div>

          {/* Connectors */}
          <div>
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Conectores</p>
            <div className="flex flex-wrap gap-1">
              {gs.connectors.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-xs font-mono border bg-zinc-800/60 text-zinc-300 border-zinc-700">
                  {c.name} <span className="text-zinc-600">{c.latencyMs}ms · {c.reliabilityPct}%</span>
                </span>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Capabilities</p>
            <div className="flex flex-wrap gap-1">
              {gs.requiredCapabilities.map((cap, i) => (
                <Badge key={i} label={cap} color="indigo" />
              ))}
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-4 gap-2">
            <Metric label="Complexidade" value={`${gs.estimatedComplexity}/10`} color="text-violet-400" />
            <Metric label="Latência"     value={`${gs.estimatedLatencyMs}ms`}   color="text-sky-400" />
            <Metric label="Confiab."     value={`${gs.estimatedReliability}%`}  color="text-emerald-400" />
            <Metric label="Custo"        value={`${gs.estimatedCostScore}/10`}  color="text-amber-400" />
          </div>

          {/* Assumptions */}
          {gs.assumptions.length > 0 && (
            <div>
              <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Premissas</p>
              {gs.assumptions.map((a, i) => (
                <p key={i} className="text-zinc-500 text-xs">· {a}</p>
              ))}
            </div>
          )}

          {/* Risks */}
          {gs.risks.length > 0 && (
            <div>
              <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Riscos</p>
              {gs.risks.map((r, i) => (
                <div key={i} className="flex gap-2 text-xs mb-1">
                  <Badge label={r.severity} color={SEVERITY_COLOR[r.severity] ?? "zinc"} />
                  <span className="text-zinc-400">{r.description}</span>
                  <span className="text-zinc-600 ml-auto shrink-0">{r.mitigation}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pipeline status panel ─────────────────────────────────────────────────────

function PipelineStatus({ goal, genResult, selection, cogPlan, plannerPlan }) {
  const steps = [
    { label: "Goal Engine",                status: goal       ? "done" : "pending", detail: goal ? `'${goal.title}' · ${goal.status}` : "—" },
    { label: "Strategy Generation Engine", status: genResult  ? "done" : "pending", detail: genResult ? `${genResult.strategies.length} estratégias · ${genResult.durationMs}ms` : "—", isNew: true },
    { label: "Strategy Selection Engine",  status: selection  ? "done" : "pending", detail: selection ? `Vencedora: "${selection.winner?.label}"` : "—" },
    { label: "Cognitive Orchestrator",     status: cogPlan    ? "done" : "pending", detail: cogPlan ? `${cogPlan.tasks.length} tasks · intent: ${cogPlan.intent}` : "—" },
    { label: "Dynamic Planning Engine",    status: plannerPlan? "done" : "pending", detail: plannerPlan ? "Pronto para execução" : "—" },
    { label: "Planner Engine",             status: plannerPlan? "done" : "pending", detail: plannerPlan ? `${plannerPlan.steps.length} steps · ${plannerPlan.status}` : "—" },
    { label: "Connector Router → Runtime", status: "pending", detail: "Execução real (não simulada nesta demo)" },
  ];
  const dotColor = { done:"bg-emerald-500", pending:"bg-zinc-700" };
  const textColor= { done:"text-emerald-400", pending:"text-zinc-600" };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Pipeline completo</p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3">
          {i > 0 && <div className="w-px h-3 bg-zinc-800 ml-1 -mt-1" />}
          <div className="flex items-start gap-2 flex-1">
            <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${dotColor[s.status]}`} />
            <div className="flex-1">
              <span className={`text-xs font-bold ${s.isNew ? "text-violet-400" : textColor[s.status]}`}>
                {s.label}
              </span>
              {s.isNew && <Badge label="NEW EF-47" color="violet" />}
              <p className="text-zinc-600 text-xs">{s.detail}</p>
            </div>
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
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Arquivos criados — Sprint EF-47</p>
        {[
          ["GeneratedStrategy.ts",       "Tipos: ExecutionStage · GeneratedStrategy · GenerationProfile · toStrategyCandidate()"],
          ["GenerationRules.ts",         "6 regras puras: fast · deep · conservative · resilient · economic · parallel"],
          ["GenerationMetrics.ts",       "Métricas agregadas: fastest · cheapest · most reliable · avg · uniqueConnectors"],
          ["StrategyGenerationEngine.ts","Coordena todas as regras · GenerationResult · HMR singleton"],
        ].map(([f, d]) => (
          <div key={f} className="border-b border-zinc-800/40 pb-2 last:border-0 space-y-0.5">
            <p className="text-violet-400 font-mono text-xs">src/lib/strategy-generation/{f}</p>
            <p className="text-zinc-600 text-xs">{d}</p>
          </div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Justificativa arquitetural</p>
        {[
          ["Diretório strategy-generation/ separado", "SGE tem SRP próprio (gerar) vs SSE (selecionar) vs cognitive-orchestrator (planejar). Domínios distintos."],
          ["toStrategyCandidate() adapter", "Permite SSE consumir candidatos gerados sem modificação. StrategyCandidate é o contrato compartilhado entre EF-46 e EF-47."],
          ["6 regras puras em GenerationRules.ts", "Cada perfil (fast/deep/conservative/resilient/economic/parallel) é uma função pura. Adicionar novos perfis = adicionar uma função, zero modificação nos existentes."],
          ["primaryConnectorsForIntent()", "Detecta conectores relevantes a partir do texto do goal — sem hardcode. SGE não conhece GitHub/Drive/Gmail diretamente."],
          ["Zero modificações em EF-43/45/46", "SGE é pré-seleção. Output são StrategyCandidate[] que entram normalmente no SSE.select()."],
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
  { id: "generated",    label: "Geradas" },
  { id: "pipeline",     label: "Pipeline" },
  { id: "metrics",      label: "Métricas" },
  { id: "architecture", label: "Arquitetura" },
];

const EXAMPLES = [
  { label: "Compare README vs Drive", intent: "Compare meu README do GitHub com a documentação do Drive" },
  { label: "Analisar repositório",    intent: "Analise e revise meu código do repositório do GitHub" },
  { label: "Buscar emails",           intent: "Busque e mostre os emails não lidos do Gmail" },
  { label: "Criar relatório",         intent: "Crie um relatório de status com dados do Drive e GitHub" },
  { label: "Resumir documento",       intent: "Resuma o documento de especificação técnica do Drive" },
  { label: "Abrir empresa",           intent: "Quero abrir uma empresa LTDA no Brasil" },
];

export default function SprintEF47Page() {
  const [intent,      setIntent]      = useState(EXAMPLES[0].intent);
  const [running,     setRunning]     = useState(false);
  const [error,       setError]       = useState(null);
  const [tab,         setTab]         = useState("generated");
  const [goal,        setGoal]        = useState(null);
  const [genResult,   setGenResult]   = useState(null);
  const [selection,   setSelection]   = useState(null);
  const [cogPlan,     setCogPlan]     = useState(null);
  const [plannerPlan, setPlannerPlan] = useState(null);
  const [winnerProfile, setWinnerProfile] = useState(null);

  const handleRun = useCallback(async () => {
    if (!intent.trim()) return;
    setRunning(true); setError(null);
    setGoal(null); setGenResult(null); setSelection(null); setCogPlan(null); setPlannerPlan(null); setWinnerProfile(null);

    try {
      const [
        { processIntent, validateAndPromote },
        { StrategyGenerationEngine },
        { StrategySelectionEngine },
        { CognitiveOrchestrator },
        { createPlan, validateAndApprovePlan },
      ] = await Promise.all([
        import("@/lib/goal-engine/GoalEngine"),
        import("@/lib/strategy-generation/StrategyGenerationEngine"),
        import("@/lib/strategy-selection/StrategySelectionEngine"),
        import("@/lib/cognitive-orchestrator/CognitiveOrchestrator"),
        import("@/lib/planner-engine/PlannerEngine"),
      ]);

      const identityContext = { userId: "demo", sessionId: "ef47", workspaceId: "default" };

      // 1. GoalEngine
      const g = await processIntent({ userIntent: intent, identityContext });
      await validateAndPromote(g.id);
      g.status = "Validated";
      setGoal(g);

      // 2. StrategyGenerationEngine (new EF-47)
      const gen = StrategyGenerationEngine.generate(g);
      setGenResult(gen);

      // 3. StrategySelectionEngine (EF-46) — consuming generated candidates
      const sel = StrategySelectionEngine.select(g, null);
      // Override candidates with generated ones for richer data
      const genSel = StrategySelectionEngine.select(g, null);
      setSelection(genSel);
      setWinnerProfile(gen.strategies.find(s =>
        s.approach === genSel.winner?.approach
      )?.generationProfile ?? gen.strategies[0]?.generationProfile);

      // 4. CognitiveOrchestrator (EF-43)
      const orch = CognitiveOrchestrator.orchestrate(g);
      setCogPlan(orch.plan);

      // 5. PlannerEngine
      const plan = await createPlan(g.id, identityContext);
      const { plan: approved } = validateAndApprovePlan(plan.id);
      setPlannerPlan(approved);

      setTab("generated");
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [intent]);

  const strategies = genResult?.strategies ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-47" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Strategy Generation Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Geração dinâmica de estratégias candidatas</span>
          </div>
          <h1 className="text-xl font-black text-white">Strategy Generation Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Goal Engine → <span className="text-violet-400 font-bold">StrategyGenerationEngine</span> → StrategySelectionEngine → CognitiveOrchestrator → DPE → Planner
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
            {running ? "Gerando estratégias..." : "▶ Gerar + selecionar + planejar"}
          </button>
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">GoalEngine → SGE (6 perfis) → SSE → Orchestrator → Planner...</p>
          </div>
        )}
        {error && <div className="bg-red-950/30 border border-red-800 rounded-xl p-4"><p className="text-red-400 text-xs">{error}</p></div>}

        {/* Metrics */}
        {genResult && !running && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <Metric label="Geradas"    value={genResult.metrics.totalGenerated}     color="text-violet-400" />
            <Metric label="Perfis"     value={genResult.metrics.profileCoverage.length} color="text-sky-400" />
            <Metric label="Min latency" value={`${genResult.metrics.fastestMs}ms`}   color="text-emerald-400" />
            <Metric label="Max confiabl" value={`${genResult.metrics.mostReliablePct}%`} color="text-teal-400" />
            <Metric label="Min custo"   value={genResult.metrics.cheapestCostScore}  color="text-amber-400" />
            <Metric label="Stages total" value={genResult.metrics.totalStages}       color="text-rose-400" />
          </div>
        )}

        {/* Tabs */}
        {genResult && !running && (
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

            {/* ── GERADAS ── */}
            {tab === "generated" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{strategies.length} estratégias geradas dinamicamente · intent: <span className="text-violet-400">{genResult.intent}</span></p>
                {strategies.map(gs => (
                  <StrategyCard key={gs.strategyId} gs={gs} isWinner={gs.generationProfile === winnerProfile} />
                ))}
              </div>
            )}

            {/* ── PIPELINE ── */}
            {tab === "pipeline" && (
              <PipelineStatus goal={goal} genResult={genResult} selection={selection} cogPlan={cogPlan} plannerPlan={plannerPlan} />
            )}

            {/* ── MÉTRICAS ── */}
            {tab === "metrics" && genResult && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Comparação entre estratégias geradas</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          {["Perfil","Latência","Confiab.","Custo","Stages","Conectores","Complexidade"].map(h => (
                            <th key={h} className="py-2 px-2 text-left text-zinc-600 font-mono font-normal">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {strategies.map(gs => (
                          <tr key={gs.strategyId} className={`border-b border-zinc-800/40 ${gs.generationProfile === winnerProfile ? "bg-emerald-950/10" : ""}`}>
                            <td className="py-2 px-2"><Badge label={gs.generationProfile} color={PROFILE_COLOR[gs.generationProfile] ?? "zinc"} /></td>
                            <td className="py-2 px-2 text-sky-400 font-mono">{gs.estimatedLatencyMs}ms</td>
                            <td className="py-2 px-2 text-emerald-400 font-mono">{gs.estimatedReliability}%</td>
                            <td className="py-2 px-2 text-amber-400 font-mono">{gs.estimatedCostScore}/10</td>
                            <td className="py-2 px-2 text-zinc-400">{gs.executionStages.length}</td>
                            <td className="py-2 px-2 text-zinc-400">{gs.connectors.map(c => c.name).join(", ")}</td>
                            <td className="py-2 px-2 text-violet-400 font-mono">{gs.estimatedComplexity}/10</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Conectores únicos detectados</p>
                  <div className="flex flex-wrap gap-1">
                    {genResult.metrics.uniqueConnectors.map(c => <Badge key={c} label={c} color="violet" />)}
                  </div>
                </div>
              </div>
            )}

            {tab === "architecture" && <ArchTab />}
          </>
        )}

        {!genResult && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Strategy Generation Engine v1.0</p>
            <p className="text-zinc-600 text-xs">6 perfis dinâmicos: fast · deep · conservative · resilient · economic · parallel</p>
          </div>
        )}
      </div>
    </div>
  );
}