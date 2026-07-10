import React, { useState, useEffect, useCallback } from "react";
import {
  processIntent, validateAndPromote, convertToJourney,
  repoList, repoSearch, repoArchive,
} from "@/lib/goal-engine/GoalEngine";
import { analyzeIntent }     from "@/lib/goal-engine/GoalAnalyzer";
import { goalEventBus }      from "@/lib/goal-engine/GoalEvents";
import { runGoalTests }      from "@/lib/goal-engine/goalTests";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import { getJourney }        from "@/lib/journey/JourneyManager";
import {
  Target, CheckCircle, XCircle, RotateCcw, FlaskConical,
  Activity, Eye, ArrowRight, Zap, AlertTriangle, Search,
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

const STATUS_COLOR = {
  Draft: "zinc", Analyzing: "blue", PendingInfo: "yellow", Validated: "green",
  Rejected: "red", ConvertedToJourney: "violet", Archived: "zinc",
};

const COMPLEXITY_COLOR = {
  Simple: "teal", Moderate: "blue", Complex: "yellow", Critical: "red",
};

const EXAMPLE_INTENTS = [
  "Quero abrir uma empresa",
  "Preciso emitir uma nota fiscal",
  "Quero consultar meu CPF",
  "Preciso registrar uma marca",
  "Quero importar um suplemento",
  "Declarar imposto de renda",
  "Obter alvará de funcionamento",
];

const TABS = [
  { id: "goals",    label: "Goals" },
  { id: "create",   label: "Nova Intent" },
  { id: "detail",   label: "Detalhe" },
  { id: "events",   label: "Eventos" },
  { id: "tests",    label: "Testes" },
];

// ── Goal Card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onSelect, selected, onValidate, onConvert, onArchive, processing }) {
  const statusColor = STATUS_COLOR[goal.status] ?? "zinc";
  return (
    <div onClick={() => onSelect(goal.id)}
      className={`border rounded-xl p-3 cursor-pointer transition-all ${selected ? "border-violet-600 bg-violet-950/20" : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/50"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-200 truncate">{goal.title}</p>
          <p className="text-xs text-zinc-500 mt-0.5 italic truncate">"{goal.userIntent}"</p>
        </div>
        <div className="flex gap-1.5 flex-wrap shrink-0">
          <Badge label={goal.status} color={statusColor} />
          <Badge label={goal.estimatedComplexity} color={COMPLEXITY_COLOR[goal.estimatedComplexity] ?? "zinc"} />
        </div>
      </div>
      <p className="text-xs text-zinc-500 mb-2 line-clamp-1">{goal.primaryObjective}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <span>Confiança: <span className={goal.confidenceScore >= 0.8 ? "text-green-400" : goal.confidenceScore >= 0.6 ? "text-yellow-400" : "text-red-400"}>{(goal.confidenceScore * 100).toFixed(0)}%</span></span>
          <span>·</span>
          <span>{goal.estimatedDuration}</span>
        </div>
        <div className="flex gap-1">
          {(goal.status === "Draft" || goal.status === "Analyzing") && (
            <button onClick={e => { e.stopPropagation(); onValidate(goal.id); }} disabled={processing}
              className="text-xs px-2 py-1 bg-blue-900/40 border border-blue-700 text-blue-300 rounded-lg hover:bg-blue-800/40 transition-colors disabled:opacity-50">
              <CheckCircle size={10} className="inline mr-1" />Validar
            </button>
          )}
          {goal.status === "Validated" && (
            <button onClick={e => { e.stopPropagation(); onConvert(goal.id); }} disabled={processing}
              className="text-xs px-2 py-1 bg-violet-900/40 border border-violet-700 text-violet-300 rounded-lg hover:bg-violet-800/40 transition-colors disabled:opacity-50">
              <ArrowRight size={10} className="inline mr-1" />→ Journey
            </button>
          )}
          {!["Archived", "ConvertedToJourney"].includes(goal.status) && (
            <button onClick={e => { e.stopPropagation(); onArchive(goal.id); }} disabled={processing}
              className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
              Arquivar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Goal Detail ───────────────────────────────────────────────────────────────

function GoalDetail({ goal }) {
  const [panel, setPanel] = useState("overview");

  if (!goal) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <Eye size={24} className="text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-500 text-sm">Selecione um Goal para ver os detalhes</p>
    </div>
  );
  const panels = [
    { id: "overview", label: "Overview" }, { id: "audit", label: "Auditoria" },
    { id: "journey",  label: "Journey" },
  ];
  const journey = goal.journeyId ? getJourney(goal.journeyId) : null;

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-base font-bold text-zinc-100">{goal.title}</p>
            <p className="text-xs text-zinc-500 font-mono mt-0.5 italic">"{goal.userIntent}"</p>
          </div>
          <Badge label={goal.status} color={STATUS_COLOR[goal.status] ?? "zinc"} />
        </div>
        <p className="text-xs text-zinc-400 mt-2">{goal.primaryObjective}</p>
      </div>

      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
        {panels.map(p => (
          <button key={p.id} onClick={() => setPanel(p.id)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex-1 whitespace-nowrap transition-colors ${panel === p.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {panel === "overview" && (
        <div className="space-y-3">
          {[
            { label: "Objetivo Secundários",   items: goal.secondaryObjectives  },
            { label: "Constraints",            items: goal.constraints          },
            { label: "Informações Necessárias",items: goal.requiredInformation  },
            { label: "Documentos Necessários", items: goal.requiredDocuments    },
            { label: "Critérios de Aceite",    items: goal.acceptanceCriteria   },
          ].filter(s => s.items.length > 0).map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-xs font-semibold text-zinc-400 mb-1.5">{s.label}</p>
              {s.items.map((item, i) => (
                <p key={i} className="text-xs text-zinc-300">· {item}</p>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className={`text-lg font-bold ${COMPLEXITY_COLOR[goal.estimatedComplexity] === "red" ? "text-red-400" : COMPLEXITY_COLOR[goal.estimatedComplexity] === "yellow" ? "text-yellow-400" : COMPLEXITY_COLOR[goal.estimatedComplexity] === "teal" ? "text-teal-400" : "text-blue-400"}`}>{goal.estimatedComplexity}</div>
              <div className="text-xs text-zinc-500">Complexidade</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className={`text-lg font-bold ${goal.confidenceScore >= 0.8 ? "text-green-400" : goal.confidenceScore >= 0.6 ? "text-yellow-400" : "text-red-400"}`}>{(goal.confidenceScore * 100).toFixed(0)}%</div>
              <div className="text-xs text-zinc-500">Confiança</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className="text-xs font-bold text-zinc-300">{goal.estimatedDuration}</div>
              <div className="text-xs text-zinc-500">Duração</div>
            </div>
          </div>
        </div>
      )}

      {panel === "audit" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            {[...goal.auditLog].reverse().map(e => (
              <div key={e.id} className="flex items-start gap-3 px-3 py-1.5 border-b border-zinc-800/30 last:border-0">
                {e.success ? <CheckCircle size={10} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />}
                <span className="text-xs font-mono text-zinc-400 w-40 shrink-0">{e.operation}</span>
                {e.detail && <span className="text-xs text-zinc-500 flex-1 truncate">{e.detail}</span>}
                {e.error && <span className="text-xs text-red-400 flex-1 truncate">{e.error}</span>}
                <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === "journey" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          {!journey ? (
            <p className="text-xs text-zinc-500 text-center py-4">Nenhuma Journey gerada para este Goal</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-200">{journey.title}</p>
                <Badge label={journey.status} color="violet" />
              </div>
              <p className="text-xs text-zinc-500 font-mono">{journey.id}</p>
              <p className="text-xs text-zinc-400">{journey.objective}</p>
              <p className="text-xs text-zinc-600">{journey.tasks.length} tasks geradas · {journey.auditLog.length} audit entries</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Intent Panel ───────────────────────────────────────────────────────

function CreateIntentPanel({ onCreated }) {
  const [intent, setIntent]       = useState("");
  const [priority, setPriority]   = useState("Normal");
  const [preview, setPreview]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);

  const handlePreview = () => {
    if (!intent.trim()) return;
    setPreview(analyzeIntent(intent));
  };

  const handleCreate = async () => {
    if (!intent.trim()) return;
    setLoading(true);
    setResult(null);
    const g = await processIntent({
      userIntent: intent,
      priority,
      identityContext: { userId: "ui_user", projectId: "ui_project", sessionId: `sess_${Date.now()}` },
    });
    setResult(g);
    setLoading(false);
    setIntent("");
    setPreview(null);
    onCreated();
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-400">Intenção do Usuário</p>
        <textarea
          value={intent}
          onChange={e => { setIntent(e.target.value); setPreview(null); setResult(null); }}
          placeholder='Ex: "Quero abrir uma empresa"'
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
        />
        <div className="flex flex-wrap gap-2">
          <select value={priority} onChange={e => setPriority(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500">
            {["Critical","High","Normal","Low"].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={handlePreview} disabled={!intent.trim()}
            className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors disabled:opacity-40">
            <Eye size={10} className="inline mr-1" />Preview Análise
          </button>
          <button onClick={handleCreate} disabled={!intent.trim() || loading}
            className="text-xs px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors">
            {loading ? <><RotateCcw size={10} className="inline mr-1 animate-spin" />Processando...</> : <><Zap size={10} className="inline mr-1" />Processar Intent</>}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <p className="text-xs text-zinc-600 w-full">Exemplos:</p>
          {EXAMPLE_INTENTS.map(ex => (
            <button key={ex} onClick={() => setIntent(ex)}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded transition-colors">
              {ex}
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <Section title="Preview da Análise" icon={Eye} iconColor="text-blue-400">
          <div className="space-y-2">
            <div className="flex gap-4 flex-wrap text-xs">
              <span className="text-zinc-500">Confiança: <span className={preview.confidenceScore >= 0.8 ? "text-green-400 font-bold" : "text-yellow-400 font-bold"}>{(preview.confidenceScore * 100).toFixed(0)}%</span></span>
              <span className="text-zinc-500">Complexidade: <span className="text-zinc-300">{preview.estimatedComplexity}</span></span>
              <span className="text-zinc-500">Duração: <span className="text-zinc-300">{preview.estimatedDuration}</span></span>
            </div>
            <p className="text-xs text-zinc-300"><span className="text-zinc-500">Título: </span>{preview.suggestedTitle}</p>
            <p className="text-xs text-zinc-300"><span className="text-zinc-500">Objetivo: </span>{preview.primaryObjective}</p>
            {preview.needsClarification && (
              <div className="bg-yellow-950/30 border border-yellow-800 rounded-lg p-2">
                <p className="text-xs text-yellow-300 font-semibold mb-1"><AlertTriangle size={10} className="inline mr-1" />Esclarecimentos necessários:</p>
                {preview.clarificationQuestions.map((q, i) => <p key={i} className="text-xs text-yellow-400">· {q}</p>)}
              </div>
            )}
          </div>
        </Section>
      )}

      {result && (
        <div className="bg-green-950/20 border border-green-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-green-400" />
            <p className="text-sm font-bold text-green-300">Goal criado com sucesso!</p>
          </div>
          <p className="text-xs text-zinc-400 font-mono">{result.id}</p>
          <p className="text-xs text-zinc-400 mt-1">{result.title}</p>
          <p className="text-xs text-zinc-600 mt-1">Próximo passo: Validar o Goal na aba "Goals"</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Goals() {
  const [tab,         setTab]         = useState("goals");
  const [goals,       setGoals]       = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [events,      setEvents]      = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [testing,     setTesting]     = useState(false);
  const [processing,  setProcessing]  = useState(false);
  const [searchQ,     setSearchQ]     = useState("");

  const refresh = useCallback(() => {
    setGoals([...repoList()].reverse());
    setEvents(goalEventBus.getHistory().slice(-60).reverse());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = goalEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const handleValidate = async (id) => {
    setProcessing(true);
    await validateAndPromote(id);
    setProcessing(false);
    refresh();
  };

  const handleConvert = async (id) => {
    setProcessing(true);
    const ctx = { userId: "ui_user", projectId: "ui_project", sessionId: `sess_${Date.now()}` };
    await convertToJourney(id, ctx).catch(console.error);
    setProcessing(false);
    refresh();
  };

  const handleArchive = (id) => { repoArchive(id); refresh(); };

  const runTests = async () => {
    setTesting(true);
    const r = await runGoalTests();
    setTestResults(r);
    setTesting(false);
    refresh();
  };

  const displayed = searchQ.trim()
    ? goals.filter(g =>
        g.title.toLowerCase().includes(searchQ.toLowerCase()) ||
        g.userIntent.toLowerCase().includes(searchQ.toLowerCase()) ||
        g.status.toLowerCase().includes(searchQ.toLowerCase())
      )
    : goals;

  const selectedGoal  = goals.find(g => g.id === selectedId) ?? null;
  const passed        = testResults?.filter(r => r.passed).length ?? 0;

  const stats = {
    total:     goals.length,
    validated: goals.filter(g => g.status === "Validated").length,
    converted: goals.filter(g => g.status === "ConvertedToJourney").length,
    rejected:  goals.filter(g => g.status === "Rejected").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-blue-700 flex items-center justify-center shrink-0">
            <Target size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Goal Engine</h1>
            <p className="text-zinc-500 text-xs">Intent → Goal → Journey · Foundation v1.0 · Componente Cognitivo</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["GoalAnalyzer","GoalBuilder","GoalValidator","GoalRepository","JourneyIntegration","WorkingMemory"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
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

        {/* ── GOALS ──────────────────────────────────────────────────────── */}
        {tab === "goals" && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Pesquisar goals..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
            </div>
            {displayed.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <Target size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Nenhum Goal criado</p>
                <p className="text-zinc-600 text-xs mt-1">Use "Nova Intent" para criar seu primeiro Goal</p>
              </div>
            )}
            {displayed.map(g => (
              <GoalCard key={g.id} goal={g} selected={selectedId === g.id}
                onSelect={id => { setSelectedId(id); setTab("detail"); }}
                onValidate={handleValidate} onConvert={handleConvert}
                onArchive={handleArchive} processing={processing} />
            ))}
          </div>
        )}

        {/* ── CREATE ─────────────────────────────────────────────────────── */}
        {tab === "create" && <CreateIntentPanel onCreated={() => { refresh(); setTab("goals"); }} />}

        {/* ── DETAIL ─────────────────────────────────────────────────────── */}
        {tab === "detail" && <GoalDetail goal={selectedGoal} />}

        {/* ── EVENTS ─────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <Section title="Goal Event Bus" icon={Activity} iconColor="text-blue-400">
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
                    <span className={`text-xs font-mono shrink-0 w-44 ${color}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 font-mono truncate flex-1">{e.goalId}</span>
                    {e.journeyId && <span className="text-xs text-violet-400 font-mono shrink-0 truncate max-w-xs">{e.journeyId}</span>}
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
              <p className="text-xs text-zinc-400">Analyzer · Builder · Validator · Repository · Events · Audit · Journey Integration</p>
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
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes" para validar o Goal Engine</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}