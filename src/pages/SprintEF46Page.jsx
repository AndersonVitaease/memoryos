/**
 * SprintEF46Page.jsx — Sprint EF-46 · Strategy Selection Engine
 *
 * Dashboard interativo demonstrando:
 *   Goal → StrategySelectionEngine → CognitiveOrchestrator → DynamicPlanningEngine → Planner
 *
 * Permite alterar pesos (custo, latência, confiabilidade, paralelismo)
 * e observar como a estratégia recomendada muda em tempo real.
 */

import React, { useState, useCallback, useEffect } from "react";

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

function Metric({ label, value, color = "text-zinc-200", sub }) {
  return (
    <div className="bg-zinc-800/80 rounded-xl px-3 py-2.5 text-center">
      <div className={`text-sm font-black font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
      {sub && <div className="text-zinc-700 text-xs">{sub}</div>}
    </div>
  );
}

function WeightSlider({ label, value, onChange, color }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-mono font-bold ${color}`}>{label}</span>
        <span className="text-zinc-400 font-mono">{(value * 100).toFixed(0)}%</span>
      </div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)}
        onChange={e => onChange(parseInt(e.target.value) / 100)}
        className="w-full accent-violet-500 h-1.5 bg-zinc-700 rounded-full" />
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, max = 10, color = "bg-violet-600" }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-zinc-400 font-mono w-10 text-right">{typeof value === "number" ? value.toFixed(1) : value}</span>
    </div>
  );
}

// ── Connector chips ───────────────────────────────────────────────────────────

function ConnectorChips({ connectors }) {
  const typeColor = { live_api: "violet", cache: "amber", local: "green", hybrid: "sky" };
  return (
    <div className="flex flex-wrap gap-1">
      {connectors.map((c, i) => (
        <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border font-mono
          ${typeColor[c.type] === "violet" ? "bg-violet-950/40 text-violet-400 border-violet-800" :
            typeColor[c.type] === "amber"  ? "bg-amber-950/40 text-amber-400 border-amber-800" :
            typeColor[c.type] === "green"  ? "bg-emerald-950/40 text-emerald-400 border-emerald-800" :
            "bg-sky-950/40 text-sky-400 border-sky-800"}`}>
          {c.name}
          <span className="text-zinc-600">{c.latencyMs}ms</span>
        </span>
      ))}
    </div>
  );
}

// ── Strategy card ─────────────────────────────────────────────────────────────

function StrategyCard({ ev, rank }) {
  const [open, setOpen] = useState(rank === 0);
  const approachColor = {
    direct:"violet", cache_first:"amber", parallel:"sky",
    sequential:"indigo", fallback:"teal", aggregated:"rose", hybrid:"green",
  };
  return (
    <div className={`border rounded-xl overflow-hidden transition-colors
      ${ev.recommended ? "border-emerald-700/60 bg-emerald-950/10" : "border-zinc-700/40 bg-zinc-900/40"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5">
        <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">#{rank + 1}</span>
        {ev.recommended && <Badge label="WINNER" color="green" />}
        <Badge label={ev.approach} color={approachColor[ev.approach] ?? "zinc"} />
        <span className="flex-1 text-zinc-200 text-sm font-semibold">{ev.label}</span>
        <span className="text-zinc-400 font-mono text-xs font-bold">{ev.totalScore.toFixed(3)}</span>
        <span className={`w-3 h-3 text-zinc-500 ml-1 ${open ? "rotate-90" : ""} transition-transform`}>▶</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-800/40 pt-3">
          <p className="text-zinc-400 text-xs">{ev.description}</p>
          <ConnectorChips connectors={ev.connectors} />
          <div className="space-y-1.5">
            <ScoreBar label="Custo (invertido)" value={10 - ev.estimatedCost}             max={10} color="bg-emerald-600" />
            <ScoreBar label="Latência (invertida)" value={Math.max(0, 10 - ev.estimatedLatencyMs / 500)} max={10} color="bg-sky-600" />
            <ScoreBar label="Confiabilidade" value={ev.estimatedReliability / 10}         max={10} color="bg-violet-600" />
            <ScoreBar label="Paralelismo"    value={ev.parallelismScore}                  max={10} color="bg-amber-600" />
            <ScoreBar label="Complexidade"   value={10 - ev.complexityScore}              max={10} color="bg-rose-600" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-zinc-800/40 rounded p-2 text-center">
              <div className="text-zinc-300 font-bold">{ev.estimatedLatencyMs}ms</div>
              <div className="text-zinc-600">latência est.</div>
            </div>
            <div className="bg-zinc-800/40 rounded p-2 text-center">
              <div className="text-zinc-300 font-bold">{ev.estimatedReliability}%</div>
              <div className="text-zinc-600">confiabilidade</div>
            </div>
            <div className="bg-zinc-800/40 rounded p-2 text-center">
              <div className="text-zinc-300 font-bold">{ev.connectorCount}</div>
              <div className="text-zinc-600">conectores</div>
            </div>
          </div>
          <p className="text-zinc-500 text-xs border-l-2 border-zinc-700 pl-2">{ev.rationale}</p>
        </div>
      )}
    </div>
  );
}

// ── Weight panel ──────────────────────────────────────────────────────────────

function WeightsPanel({ weights, onChange }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-zinc-400 text-xs uppercase tracking-wider font-bold">Pesos de avaliação</p>
      <p className="text-zinc-600 text-xs">Ajuste os pesos para ver como a estratégia recomendada muda.</p>
      <WeightSlider label="Custo"         value={weights.cost}        onChange={v => onChange({ ...weights, cost: v })}        color="text-emerald-400" />
      <WeightSlider label="Latência"      value={weights.latency}     onChange={v => onChange({ ...weights, latency: v })}     color="text-sky-400" />
      <WeightSlider label="Confiabilidade" value={weights.reliability} onChange={v => onChange({ ...weights, reliability: v })} color="text-violet-400" />
      <WeightSlider label="Paralelismo"   value={weights.parallelism} onChange={v => onChange({ ...weights, parallelism: v })} color="text-amber-400" />
    </div>
  );
}

// ── Architecture tab ──────────────────────────────────────────────────────────

function ArchTab() {
  const files = [
    ["StrategyEvaluation.ts",    "Tipos imutáveis: StrategyCandidate, StrategyEvaluation, SelectionResult, ScoringWeights"],
    ["StrategyCatalog.ts",       "Gera candidatos por OperationalIntent · ConnectorProfile library · sem lógica de scoring"],
    ["StrategyScorer.ts",        "5 dimensões: cost · latency · reliability · parallelism · complexity · weighted total"],
    ["StrategySelectionEngine.ts","Coordena Catalog + Scorer · select() + reselect() · HMR singleton"],
  ];
  const flow = [
    ["Goal Engine",              "processIntent → validateAndPromote",                       false],
    ["StrategySelectionEngine",  "select(goal, plan, weights) → SelectionResult",            true],
    ["CognitiveOrchestrator",    "orchestrate(goal) → CognitivePlan  (EF-43)",               false],
    ["DynamicPlanningEngine",    "evaluate(plan, state) → PlanningRevision  (EF-45)",        false],
    ["Planner Engine",           "createPlan(goalId) → ExecutionPlan",                       false],
    ["Connector Router",         "capability → connector routing",                           false],
    ["Connector Runtime",        "execução real",                                            false],
  ];
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Arquivos criados — Sprint EF-46</p>
        {files.map(([f, d]) => (
          <div key={f} className="border-b border-zinc-800/40 pb-2 last:border-0 space-y-0.5">
            <p className="text-violet-400 font-mono text-xs">src/lib/strategy-selection/{f}</p>
            <p className="text-zinc-600 text-xs">{d}</p>
          </div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Fluxo EF-46</p>
        {flow.map(([layer, desc, isNew], i) => (
          <div key={layer} className="flex gap-2 items-start">
            <span className="text-zinc-700 text-xs mt-0.5 shrink-0">{i === 0 ? "·" : "↓"}</span>
            <div>
              <span className={`text-xs font-bold ${isNew ? "text-violet-400" : "text-zinc-300"}`}>{layer}</span>
              {isNew && <Badge label="NEW EF-46" color="violet" />}
              <span className="text-zinc-600 text-xs ml-2">{desc}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Justificativa arquitetural</p>
        {[
          ["Diretório separado strategy-selection/", "SSE não pertence ao cognitive-orchestrator. É uma camada anterior de decisão com SRP próprio."],
          ["StrategyCatalog ≠ TaskDecomposer",       "Catalog gera ConnectorProfiles (quem faz). Decomposer gera CognitiveTasks (o que fazer). Domínios diferentes."],
          ["reselect() para DynamicPlanningEngine",  "Quando DPE emite full_replan, o caller invoca SSE.reselect() com novos pesos antes de re-orquestrar."],
          ["Sem modificação de EF-43/EF-45",         "SSE é pré-orquestração. Não altera CognitivePlan nem PlanningRevision."],
          ["Weights normalizados internamente",       "Usuário pode usar qualquer escala — StrategyScorer normaliza para soma=1 antes de calcular."],
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
  { id: "strategies",   label: "Estratégias" },
  { id: "winner",       label: "Vencedora"   },
  { id: "architecture", label: "Arquitetura" },
];

const EXAMPLES = [
  { label: "Compare README vs Drive", intent: "Compare meu README do GitHub com a documentação do Drive" },
  { label: "Buscar emails",           intent: "Busque e mostre os emails não lidos do Gmail" },
  { label: "Analisar repositório",    intent: "Analise e revise meu código do repositório" },
  { label: "Criar relatório",         intent: "Crie um relatório de status com dados do Drive e GitHub" },
  { label: "Resumir documento",       intent: "Resuma o documento de especificação do Drive" },
  { label: "Abrir empresa",           intent: "Quero abrir uma empresa LTDA no Brasil" },
];

const DEFAULT_W = { cost: 0.25, latency: 0.25, reliability: 0.30, parallelism: 0.20 };

export default function SprintEF46Page() {
  const [intent,    setIntent]    = useState(EXAMPLES[0].intent);
  const [running,   setRunning]   = useState(false);
  const [error,     setError]     = useState(null);
  const [tab,       setTab]       = useState("strategies");
  const [selection, setSelection] = useState(null);
  const [plan,      setPlan]      = useState(null);
  const [weights,   setWeights]   = useState(DEFAULT_W);
  const [goalRef,   setGoalRef]   = useState(null);

  // Re-score live when weights change (no network call needed)
  useEffect(() => {
    if (!goalRef) return;
    import("@/lib/strategy-selection/StrategySelectionEngine").then(({ StrategySelectionEngine }) => {
      const sel = StrategySelectionEngine.reselect(goalRef, plan, weights);
      setSelection(sel);
    });
  }, [weights, goalRef, plan]);

  const handleBuild = useCallback(async () => {
    if (!intent.trim()) return;
    setRunning(true); setError(null); setSelection(null); setPlan(null); setGoalRef(null);
    try {
      const [
        { processIntent, validateAndPromote },
        { CognitiveOrchestrator },
        { StrategySelectionEngine },
      ] = await Promise.all([
        import("@/lib/goal-engine/GoalEngine"),
        import("@/lib/cognitive-orchestrator/CognitiveOrchestrator"),
        import("@/lib/strategy-selection/StrategySelectionEngine"),
      ]);

      const identityContext = { userId: "demo", sessionId: "ef46", workspaceId: "default" };
      const g  = await processIntent({ userIntent: intent, identityContext });
      await validateAndPromote(g.id);
      g.status = "Validated";
      setGoalRef(g);

      // 1. Strategy Selection (new EF-46 layer — runs BEFORE Orchestrator)
      const sel = StrategySelectionEngine.select(g, null, weights);
      setSelection(sel);

      // 2. CognitiveOrchestrator (EF-43) — unchanged
      const orch = CognitiveOrchestrator.orchestrate(g);
      setPlan(orch.plan);

      setTab("strategies");
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [intent, weights]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-46" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Strategy Selection Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Avaliação multi-critério de estratégias</span>
          </div>
          <h1 className="text-xl font-black text-white">Strategy Selection Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Goal Engine → <span className="text-violet-400 font-bold">StrategySelectionEngine</span> → CognitiveOrchestrator → DynamicPlanningEngine → Planner
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
            {running ? "Avaliando estratégias..." : "▶ Selecionar estratégia"}
          </button>
        </div>

        {/* Weights — always visible once goal built */}
        {goalRef && <WeightsPanel weights={weights} onChange={setWeights} />}

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">GoalEngine → StrategySelectionEngine → CognitiveOrchestrator...</p>
          </div>
        )}

        {error && <div className="bg-red-950/30 border border-red-800 rounded-xl p-4"><p className="text-red-400 text-xs">{error}</p></div>}

        {/* Metrics */}
        {selection && !running && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Metric label="Intent"      value={selection.intent.replace(/_/g," ")} color="text-violet-400" />
            <Metric label="Candidatas"  value={selection.candidates.length}        color="text-sky-400" />
            <Metric label="Score"       value={selection.winner?.totalScore.toFixed(3)} color="text-emerald-400" />
            <Metric label="Latência"    value={`~${selection.winner?.estimatedLatencyMs}ms`} color="text-amber-400" />
            <Metric label="Confiab."    value={`${selection.winner?.estimatedReliability}%`} color="text-teal-400" />
          </div>
        )}

        {/* Tabs */}
        {selection && !running && (
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

            {/* ── ESTRATÉGIAS ── */}
            {tab === "strategies" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{selection.candidates.length} candidatas · ranqueadas por score ponderado · clique para expandir</p>
                {selection.candidates.map((ev, i) => (
                  <StrategyCard key={ev.strategyId} ev={ev} rank={i} />
                ))}
              </div>
            )}

            {/* ── VENCEDORA ── */}
            {tab === "winner" && selection.winner && (
              <div className="space-y-3">
                <div className="bg-emerald-950/20 border border-emerald-700/40 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge label="ESTRATÉGIA SELECIONADA" color="green" />
                    <Badge label={selection.winner.approach} color="violet" />
                  </div>
                  <h2 className="text-lg font-black text-white">{selection.winner.label}</h2>
                  <p className="text-zinc-400 text-sm">{selection.winner.description}</p>
                  <ConnectorChips connectors={selection.winner.connectors} />
                  <p className="text-zinc-400 text-xs border-l-2 border-emerald-700 pl-3">{selection.rationale}</p>
                </div>

                {/* CognitivePlan integration */}
                {plan && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">CognitivePlan gerado (EF-43)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Metric label="Tasks"    value={plan.tasks.length}     color="text-violet-400" />
                      <Metric label="Strategy" value={plan.strategy}         color="text-sky-400" />
                      <Metric label="Intent"   value={plan.intent.replace(/_/g," ")} color="text-amber-400" />
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {plan.tasks.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-700 w-4 text-right">{i + 1}.</span>
                          <Badge label={t.type} color={{ fetch:"sky",read:"indigo",compare:"violet",transform:"amber",synthesize:"green",validate:"teal",analyze:"rose" }[t.type] ?? "zinc"} />
                          <span className="text-zinc-400">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alternatives */}
                {selection.alternatives.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                      Alternativas para replanejamento (DynamicPlanningEngine)
                    </p>
                    {selection.alternatives.slice(0, 2).map((alt, i) => (
                      <div key={alt.strategyId} className="flex items-center gap-2 text-xs border-b border-zinc-800/40 pb-2 last:border-0">
                        <span className="text-zinc-600">#{i + 2}</span>
                        <Badge label={alt.approach} color="zinc" />
                        <span className="flex-1 text-zinc-400">{alt.label}</span>
                        <span className="text-zinc-500 font-mono">{alt.totalScore.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "architecture" && <ArchTab />}
          </>
        )}

        {!selection && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Strategy Selection Engine v1.0</p>
            <p className="text-zinc-600 text-xs">Selecione um exemplo · Ajuste os pesos · Observe como a estratégia recomendada muda</p>
          </div>
        )}
      </div>
    </div>
  );
}