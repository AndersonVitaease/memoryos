import React, { useState, useEffect, useCallback } from "react";
import {
  createPlan, validateAndApprovePlan, buildJourneyFromPlan,
  planRepoList, planRepoSearch, planRepoArchive,
} from "@/lib/planner-engine/PlannerEngine";
import { plannerEventBus }       from "@/lib/planner-engine/PlannerEvents";
import { runPlannerTests }       from "@/lib/planner-engine/plannerTests";
import { processIntent, validateAndPromote, repoList as listGoals } from "@/lib/goal-engine/GoalEngine";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import { getJourney }            from "@/lib/journey/JourneyManager";
import {
  GitBranch, CheckCircle, XCircle, RotateCcw, FlaskConical,
  Activity, Eye, ArrowRight, AlertTriangle, Search, Play,
  Layers, Shield, Zap,
} from "lucide-react";

bootstrapCapabilities();

// ── UI Primitives ─────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const cls = {
    green:  "bg-green-900/40 text-green-300 border-green-700",
    red:    "bg-red-900/40 text-red-300 border-red-700",
    yellow: "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    violet: "bg-violet-900/40 text-violet-300 border-violet-700",
    blue:   "bg-blue-900/40 text-blue-300 border-blue-700",
    zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
    orange: "bg-orange-900/40 text-orange-300 border-orange-700",
    teal:   "bg-teal-900/40 text-teal-300 border-teal-700",
  };
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${cls[color] ?? cls.zinc}`}>{label}</span>;
}

function Section({ title, icon: Icon, iconColor = "text-violet-400", children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Icon size={14} className={iconColor} />
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const PLAN_STATUS_COLOR = {
  Draft: "zinc", Validated: "green", Rejected: "red",
  ConvertedToJourney: "violet", Archived: "zinc",
};

const RISK_LEVEL_COLOR = { Low: "teal", Medium: "yellow", High: "orange", Critical: "red" };
const STRATEGY_COLOR   = { Sequential: "blue", Parallel: "violet", Conditional: "yellow", Approval: "orange", Manual: "zinc", Automatic: "green" };

const TABS = [
  { id: "plans",   label: "Plans" },
  { id: "create",  label: "Novo Plano" },
  { id: "detail",  label: "Detalhe" },
  { id: "events",  label: "Eventos" },
  { id: "tests",   label: "Testes" },
];

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, selected, onSelect, onValidate, onConvert, onArchive, processing }) {
  return (
    <div onClick={() => onSelect(plan.id)}
      className={`border rounded-xl p-3 cursor-pointer transition-all ${selected ? "border-violet-600 bg-violet-950/20" : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/50"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-200 truncate">{plan.title}</p>
          <p className="text-xs text-zinc-600 font-mono mt-0.5">{plan.id}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap shrink-0">
          <Badge label={plan.status} color={PLAN_STATUS_COLOR[plan.status] ?? "zinc"} />
          <Badge label={plan.executionStrategy} color={STRATEGY_COLOR[plan.executionStrategy] ?? "zinc"} />
        </div>
      </div>
      <p className="text-xs text-zinc-500 mb-2 line-clamp-1">{plan.objective}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-zinc-600 flex gap-3">
          <span>{plan.steps.length} steps</span>
          <span>{plan.risks.length} risks</span>
          <span>Cost: {plan.estimatedCost}</span>
          <span>{plan.estimatedDuration}</span>
        </div>
        <div className="flex gap-1">
          {plan.status === "Draft" && (
            <button onClick={e => { e.stopPropagation(); onValidate(plan.id); }} disabled={processing}
              className="text-xs px-2 py-1 bg-blue-900/40 border border-blue-700 text-blue-300 rounded-lg hover:bg-blue-800/40 transition-colors disabled:opacity-50">
              <CheckCircle size={10} className="inline mr-1" />Validar
            </button>
          )}
          {plan.status === "Validated" && (
            <button onClick={e => { e.stopPropagation(); onConvert(plan.id); }} disabled={processing}
              className="text-xs px-2 py-1 bg-violet-900/40 border border-violet-700 text-violet-300 rounded-lg hover:bg-violet-800/40 transition-colors disabled:opacity-50">
              <ArrowRight size={10} className="inline mr-1" />→ Journey
            </button>
          )}
          {!["Archived","ConvertedToJourney"].includes(plan.status) && (
            <button onClick={e => { e.stopPropagation(); onArchive(plan.id); }} disabled={processing}
              className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
              Arquivar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Plan Detail ───────────────────────────────────────────────────────────────

function PlanDetail({ plan }) {
  const [panel, setPanel] = useState("steps");
  if (!plan) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <Eye size={24} className="text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-500 text-sm">Selecione um plano para ver os detalhes</p>
    </div>
  );

  const journey = plan.journeyId ? getJourney(plan.journeyId) : null;
  const panels = [
    { id: "steps",   label: `Steps (${plan.steps.length})` },
    { id: "risks",   label: `Riscos (${plan.risks.length})` },
    { id: "journey", label: "Journey" },
    { id: "audit",   label: "Auditoria" },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-base font-bold text-zinc-100">{plan.title}</p>
            <p className="text-xs text-zinc-500 font-mono">{plan.id}</p>
          </div>
          <Badge label={plan.status} color={PLAN_STATUS_COLOR[plan.status] ?? "zinc"} />
        </div>
        <p className="text-xs text-zinc-400 mt-2">{plan.objective}</p>
        <div className="flex gap-4 mt-2 text-xs text-zinc-600">
          <span>Strategy: <span className="text-zinc-400">{plan.executionStrategy}</span></span>
          <span>Cost: <span className="text-zinc-400">{plan.estimatedCost}</span></span>
          <span>Duration: <span className="text-zinc-400">{plan.estimatedDuration}</span></span>
          <span>Confidence: <span className={plan.confidenceScore >= 0.8 ? "text-green-400" : "text-yellow-400"}>{(plan.confidenceScore * 100).toFixed(0)}%</span></span>
        </div>
      </div>

      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
        {panels.map(p => (
          <button key={p.id} onClick={() => setPanel(p.id)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex-1 whitespace-nowrap transition-colors ${panel === p.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {panel === "steps" && (
        <div className="space-y-2">
          {plan.steps.map((step, i) => (
            <div key={step.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-violet-900/50 border border-violet-700 flex items-center justify-center shrink-0 text-xs text-violet-300 font-bold">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-zinc-200">{step.title}</p>
                    {step.approvalRequired && <Badge label="APPROVAL" color="orange" />}
                    <Badge label={step.executionStrategy} color={STRATEGY_COLOR[step.executionStrategy] ?? "zinc"} />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
                  <div className="flex gap-3 mt-1 text-xs text-zinc-600">
                    <span>Duration: {step.estimatedDuration}</span>
                    {step.dependencies.length > 0 && <span>Deps: {step.dependencies.length}</span>}
                    <span>Caps: {step.requiredCapabilities.join(", ")}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {panel === "risks" && (
        <div className="space-y-2">
          {plan.risks.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Nenhum risco identificado</p>}
          {plan.risks.map(r => (
            <div key={r.id} className={`bg-zinc-900 border rounded-xl p-3 ${r.level === "Critical" ? "border-red-800/50" : r.level === "High" ? "border-orange-800/50" : "border-zinc-800"}`}>
              <div className="flex items-start gap-2 mb-1">
                <AlertTriangle size={12} className={r.level === "Critical" ? "text-red-400" : r.level === "High" ? "text-orange-400" : "text-yellow-400"} />
                <p className="text-xs font-semibold text-zinc-200 flex-1">{r.description}</p>
                <Badge label={r.level} color={RISK_LEVEL_COLOR[r.level] ?? "zinc"} />
              </div>
              <p className="text-xs text-zinc-500 pl-5">Mitigação: {r.mitigation}</p>
            </div>
          ))}
        </div>
      )}

      {panel === "journey" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          {!journey
            ? <p className="text-xs text-zinc-500 text-center py-4">Nenhuma Journey gerada para este plano</p>
            : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-200">{journey.title}</p>
                  <Badge label={journey.status} color="violet" />
                </div>
                <p className="text-xs text-zinc-500 font-mono">{journey.id}</p>
                <p className="text-xs text-zinc-400">{journey.objective}</p>
                <p className="text-xs text-zinc-600">{journey.tasks.length} tasks · {journey.auditLog.length} audit entries</p>
              </div>
            )
          }
        </div>
      )}

      {panel === "audit" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {[...plan.auditLog].reverse().map(e => (
              <div key={e.id} className="flex items-start gap-3 px-3 py-1.5 border-b border-zinc-800/30 last:border-0">
                {e.success ? <CheckCircle size={10} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />}
                <span className="text-xs font-mono text-zinc-400 w-40 shrink-0">{e.operation}</span>
                {e.detail && <span className="text-xs text-zinc-500 flex-1 truncate">{e.detail}</span>}
                <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Plan Panel ─────────────────────────────────────────────────────────

function CreatePlanPanel({ onCreated }) {
  const [goals,       setGoals]       = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    setGoals(listGoals().filter(g => g.status === "Validated"));
  }, []);

  const handleCreate = async () => {
    if (!selectedGoal) return;
    setLoading(true); setError(null); setResult(null);
    const ctx = { userId: "planner_ui", projectId: "planner_proj", sessionId: `sess_${Date.now()}` };
    try {
      const p = await createPlan(selectedGoal, ctx);
      setResult(p);
      onCreated();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  const handleQuickDemo = async () => {
    setLoading(true); setError(null); setResult(null);
    const ctx = { userId: "planner_ui", projectId: "planner_proj", sessionId: `sess_${Date.now()}` };
    try {
      const g = await processIntent({ userIntent: "abrir empresa", identityContext: ctx });
      await validateAndPromote(g.id);
      const p = await createPlan(g.id, ctx);
      setResult(p);
      onCreated();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-400">Criar Plano a partir de Goal Validado</p>
        {goals.length === 0 ? (
          <div className="bg-yellow-950/20 border border-yellow-800 rounded-lg p-3">
            <p className="text-xs text-yellow-300"><AlertTriangle size={10} className="inline mr-1" />Nenhum Goal Validado disponível. Valide um Goal primeiro ou use o Demo.</p>
          </div>
        ) : (
          <select value={selectedGoal ?? ""} onChange={e => setSelectedGoal(e.target.value || null)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-violet-500">
            <option value="">Selecione um Goal Validado...</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.title} — {g.id}</option>)}
          </select>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleCreate} disabled={!selectedGoal || loading}
            className="text-xs px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors">
            {loading ? <><RotateCcw size={10} className="inline mr-1 animate-spin" />Planejando...</> : <><GitBranch size={10} className="inline mr-1" />Gerar Plano</>}
          </button>
          <button onClick={handleQuickDemo} disabled={loading}
            className="text-xs px-3 py-1.5 bg-teal-900/40 border border-teal-700 text-teal-300 hover:bg-teal-800/40 disabled:opacity-40 rounded-lg transition-colors">
            <Zap size={10} className="inline mr-1" />Demo Rápido (Abertura de Empresa)
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-red-800 rounded-xl p-3">
          <p className="text-xs text-red-400"><XCircle size={10} className="inline mr-1" />{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-green-950/20 border border-green-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-400" />
            <p className="text-sm font-bold text-green-300">Plano criado com {result.steps.length} steps!</p>
          </div>
          <p className="text-xs text-zinc-400 font-mono">{result.id}</p>
          <p className="text-xs text-zinc-400">{result.title} · {result.executionStrategy} · {result.estimatedDuration}</p>
          <p className="text-xs text-zinc-600">Próximo: Validar o plano na aba "Plans"</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Planner() {
  const [tab,         setTab]         = useState("plans");
  const [plans,       setPlans]       = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [events,      setEvents]      = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [testing,     setTesting]     = useState(false);
  const [processing,  setProcessing]  = useState(false);
  const [searchQ,     setSearchQ]     = useState("");

  const refresh = useCallback(() => {
    setPlans([...planRepoList()].reverse());
    setEvents(plannerEventBus.getHistory().slice(-60).reverse());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = plannerEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const handleValidate = (id) => { setProcessing(true); validateAndApprovePlan(id); setProcessing(false); refresh(); };

  const handleConvert = async (id) => {
    setProcessing(true);
    const ctx = { userId: "planner_ui", projectId: "planner_proj", sessionId: `sess_${Date.now()}` };
    await buildJourneyFromPlan(id, ctx).catch(console.error);
    setProcessing(false); refresh();
  };

  const handleArchive = (id) => { planRepoArchive(id); refresh(); };

  const runTests = async () => {
    setTesting(true);
    const r = await runPlannerTests();
    setTestResults(r);
    setTesting(false);
    refresh();
  };

  const displayed = searchQ.trim()
    ? plans.filter(p =>
        p.title.toLowerCase().includes(searchQ.toLowerCase()) ||
        p.status.toLowerCase().includes(searchQ.toLowerCase()) ||
        p.executionStrategy.toLowerCase().includes(searchQ.toLowerCase())
      )
    : plans;

  const selectedPlan = plans.find(p => p.id === selectedId) ?? null;
  const passed       = testResults?.filter(r => r.passed).length ?? 0;

  const stats = {
    total:     plans.length,
    validated: plans.filter(p => p.status === "Validated").length,
    converted: plans.filter(p => p.status === "ConvertedToJourney").length,
    rejected:  plans.filter(p => p.status === "Rejected").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shrink-0">
            <GitBranch size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Planner Engine</h1>
            <p className="text-zinc-500 text-xs">Goal → ExecutionPlan → Journey · Foundation v1.0 · Decomposição Hierárquica</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["GoalDecomposer","PlanValidator","PlanRepository","JourneyBuilder","WorkingMemory","CapabilityRegistry"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Architecture flow */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 flex-wrap text-xs">
          {["Goal (Validated)", "PlannerEngine", "ExecutionPlan", "PlanValidator", "JourneyBuilder", "Journey"].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span className={`px-2 py-0.5 rounded font-mono ${i === 2 ? "bg-indigo-900/50 text-indigo-300 border border-indigo-700" : "bg-zinc-800 text-zinc-400"}`}>{s}</span>
              {i < arr.length - 1 && <ArrowRight size={10} className="text-zinc-600 shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",     value: stats.total,     color: "text-zinc-300" },
            { label: "Validated", value: stats.validated, color: "text-green-400" },
            { label: "→ Journey", value: stats.converted, color: "text-violet-400" },
            { label: "Rejected",  value: stats.rejected,  color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex-1 ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PLANS ──────────────────────────────────────────────────────── */}
        {tab === "plans" && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Pesquisar planos..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
            </div>
            {displayed.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <Layers size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Nenhum plano criado</p>
                <p className="text-zinc-600 text-xs mt-1">Use "Novo Plano" para decompor um Goal em etapas</p>
              </div>
            )}
            {displayed.map(p => (
              <PlanCard key={p.id} plan={p} selected={selectedId === p.id}
                onSelect={id => { setSelectedId(id); setTab("detail"); }}
                onValidate={handleValidate} onConvert={handleConvert}
                onArchive={handleArchive} processing={processing} />
            ))}
          </div>
        )}

        {/* ── CREATE ─────────────────────────────────────────────────────── */}
        {tab === "create" && <CreatePlanPanel onCreated={() => { refresh(); setTab("plans"); }} />}

        {/* ── DETAIL ─────────────────────────────────────────────────────── */}
        {tab === "detail" && <PlanDetail plan={selectedPlan} />}

        {/* ── EVENTS ─────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <Section title="Planner Event Bus" icon={Activity} iconColor="text-blue-400">
            {events.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Nenhum evento publicado</p>}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map(e => {
                const color = e.type.includes("Converted") ? "text-violet-400"
                  : e.type.includes("Validated") ? "text-green-400"
                  : e.type.includes("Rejected") || e.type.includes("Archived") ? "text-red-400"
                  : e.type.includes("Created") ? "text-blue-400"
                  : "text-zinc-400";
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-48 ${color}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 font-mono truncate flex-1">{e.planId}</span>
                    {e.journeyId && <span className="text-xs text-violet-400 font-mono truncate max-w-xs">{e.journeyId}</span>}
                    <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── TESTS ──────────────────────────────────────────────────────── */}
        {tab === "tests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-zinc-400">Decomposer · Validator · Repository · Events · Audit · Journey integration</p>
              <button onClick={runTests} disabled={testing}
                className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                {testing ? <><RotateCcw size={12} className="animate-spin" />Testando...</> : <><FlaskConical size={12} />Executar Testes</>}
              </button>
            </div>
            {testResults && (
              <>
                <div className={`rounded-xl border p-3 flex items-center gap-3 ${passed === testResults.length ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
                  {passed === testResults.length
                    ? <CheckCircle size={18} className="text-green-400 shrink-0" />
                    : <XCircle size={18} className="text-red-400 shrink-0" />}
                  <p className={`text-sm font-bold ${passed === testResults.length ? "text-green-300" : "text-red-300"}`}>
                    {passed}/{testResults.length} testes aprovados
                  </p>
                </div>
                <Section title="Resultados" icon={FlaskConical} iconColor="text-violet-400">
                  {testResults.map(r => (
                    <div key={r.name} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/30 last:border-0">
                      {r.passed ? <CheckCircle size={11} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />}
                      <span className="text-xs text-zinc-300 flex-1">{r.name}</span>
                      <span className="text-xs text-zinc-600 font-mono shrink-0">{r.durationMs.toFixed(2)}ms</span>
                      {r.error && <span className="text-xs text-red-400 font-mono max-w-xs truncate ml-2">{r.error}</span>}
                    </div>
                  ))}
                </Section>
              </>
            )}
            {!testResults && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <FlaskConical size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes" para validar o Planner Engine</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}