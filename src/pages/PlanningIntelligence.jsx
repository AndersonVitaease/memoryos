import React, { useState, useEffect, useCallback } from "react";
import { runPIE, buildJourneyFromPIE, pieSessionList, pieSessionGet } from "@/lib/pie/PIEEngine";
import { pieEventBus }           from "@/lib/pie/PIEEvents";
import { runPIETests }           from "@/lib/pie/pieTests";
import { processIntent, validateAndPromote, repoList as listGoals } from "@/lib/goal-engine/GoalEngine";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import { getJourney }            from "@/lib/journey/JourneyManager";
import {
  Brain, ChevronDown, ChevronRight, CheckCircle, XCircle, RotateCcw,
  FlaskConical, ArrowRight, AlertTriangle, Zap, Activity, Trophy,
  BarChart2, Search, Layers,
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
    teal:   "bg-teal-900/40 text-teal-300 border-teal-700",
    orange: "bg-orange-900/40 text-orange-300 border-orange-700",
    zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
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

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color = "violet" }) {
  const fill = { violet: "bg-violet-500", green: "bg-green-500", blue: "bg-blue-500", yellow: "bg-yellow-500", red: "bg-red-500", teal: "bg-teal-500" };
  const c = value >= 80 ? "green" : value >= 60 ? "teal" : value >= 40 ? "yellow" : "red";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className={`font-bold ${value >= 80 ? "text-green-400" : value >= 60 ? "text-teal-400" : value >= 40 ? "text-yellow-400" : "text-red-400"}`}>{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${fill[c]}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Candidate Card ────────────────────────────────────────────────────────────

const VARIANT_COLOR = { Standard: "blue", Fast: "teal", Conservative: "violet", Minimal: "yellow", Comprehensive: "orange" };

function CandidateCard({ cand, expanded, onToggle }) {
  const isWinner = cand.selected;
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isWinner ? "border-yellow-600 bg-yellow-950/10" : "border-zinc-700 bg-zinc-900/50"}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/20 transition-colors">
        {isWinner && <Trophy size={14} className="text-yellow-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-200">{cand.variant}</span>
            <Badge label={`#${cand.rankPosition}`} color={isWinner ? "yellow" : "zinc"} />
            <Badge label={cand.variant} color={VARIANT_COLOR[cand.variant] ?? "zinc"} />
            {isWinner && <Badge label="SELECIONADO" color="yellow" />}
          </div>
          <div className="flex gap-4 mt-0.5 text-xs text-zinc-600">
            <span>Overall: <span className={`font-bold ${cand.scores.overallScore >= 80 ? "text-green-400" : cand.scores.overallScore >= 60 ? "text-yellow-400" : "text-red-400"}`}>{cand.scores.overallScore}/100</span></span>
            <span>Steps: {cand.plan.steps.length}</span>
            <span>Cost: {cand.plan.estimatedCost}</span>
          </div>
        </div>
        {expanded ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          {/* Scores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(cand.scores).map(([k, v]) => (
              k !== "overallScore" && <ScoreBar key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={v} />
            ))}
          </div>
          <ScoreBar label="Overall Score" value={cand.scores.overallScore} />

          {/* Explanations */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Explicações</p>
            <div className="space-y-1">
              {cand.explanations.map(e => (
                <div key={e.dimension} className="flex gap-2 text-xs">
                  <span className="text-zinc-600 w-40 shrink-0 truncate">{e.dimension}</span>
                  <span className="text-zinc-400 flex-1">{e.rationale}</span>
                  <span className={`font-bold shrink-0 ${e.value >= 70 ? "text-green-400" : e.value >= 40 ? "text-yellow-400" : "text-red-400"}`}>{e.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Benefits & Limitations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-green-400 mb-1">Benefícios</p>
              {cand.benefits.map(b => <p key={b} className="text-xs text-zinc-400 flex gap-1"><CheckCircle size={10} className="text-green-400 mt-0.5 shrink-0" />{b}</p>)}
            </div>
            <div>
              <p className="text-xs font-semibold text-yellow-400 mb-1">Limitações</p>
              {cand.limitations.map(l => <p key={l} className="text-xs text-zinc-400 flex gap-1"><AlertTriangle size={10} className="text-yellow-400 mt-0.5 shrink-0" />{l}</p>)}
            </div>
          </div>

          {/* Steps preview */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">Steps ({cand.plan.steps.length})</p>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {cand.plan.steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-700 w-4 shrink-0">{i + 1}</span>
                  <span className="text-zinc-400 truncate">{s.title}</span>
                  {s.approvalRequired && <span className="text-orange-400 text-xs shrink-0">APROV.</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session Detail ────────────────────────────────────────────────────────────

function SessionDetail({ session }) {
  const [expanded, setExpanded] = useState({});
  const [panel,    setPanel]    = useState("ranking");
  const [converting, setConverting] = useState(false);
  const [journeyId, setJourneyId] = useState(session?.metadata?.journeyId ?? null);

  if (!session) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <Brain size={24} className="text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-500 text-sm">Execute o PIE para visualizar a análise de inteligência</p>
    </div>
  );

  const winner = session.candidates.find(c => c.selected);

  const handleConvert = async () => {
    setConverting(true);
    const ctx = { userId: "pie_ui", projectId: "pie_proj", sessionId: `sess_${Date.now()}` };
    const jId = await buildJourneyFromPIE(session.id, ctx).catch(e => { alert(String(e)); return null; });
    if (jId) setJourneyId(jId);
    setConverting(false);
  };

  const journey = journeyId ? getJourney(journeyId) : null;

  const panels = [
    { id: "ranking",  label: `Ranking (${session.candidates.length})` },
    { id: "decision", label: "Decisão" },
    { id: "opts",     label: `Otimizações (${session.optimizations.length})` },
    { id: "journey",  label: "Journey" },
    { id: "audit",    label: "Auditoria" },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-zinc-100">Sessão PIE</p>
            <p className="text-xs text-zinc-500 font-mono">{session.id}</p>
          </div>
          <Badge label={session.status} color={session.status === "Completed" ? "green" : "zinc"} />
        </div>
        {winner && (
          <div className="mt-2 p-2 bg-yellow-950/20 border border-yellow-800/50 rounded-lg">
            <p className="text-xs text-yellow-300"><Trophy size={10} className="inline mr-1" />Plano selecionado: <strong>{winner.variant}</strong> — Score {winner.scores.overallScore}/100</p>
          </div>
        )}
        {!journeyId && winner && (
          <button onClick={handleConvert} disabled={converting}
            className="mt-2 text-xs px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
            {converting ? <><RotateCcw size={10} className="inline mr-1 animate-spin" />Convertendo...</> : <><ArrowRight size={10} className="inline mr-1" />Criar Journey</>}
          </button>
        )}
        {journeyId && <p className="mt-2 text-xs text-violet-400 font-mono">Journey: {journeyId}</p>}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
        {panels.map(p => (
          <button key={p.id} onClick={() => setPanel(p.id)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex-1 whitespace-nowrap transition-colors ${panel === p.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Ranking */}
      {panel === "ranking" && (
        <div className="space-y-2">
          {session.candidates.map(c => (
            <CandidateCard key={c.id} cand={c}
              expanded={!!expanded[c.id]}
              onToggle={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))} />
          ))}
        </div>
      )}

      {/* Decision */}
      {panel === "decision" && (
        <Section title="Justificativa da Decisão" icon={Trophy} iconColor="text-yellow-400">
          <p className="text-sm text-zinc-300 leading-relaxed">{session.decisionRationale}</p>
          {winner && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: "Risk Score",    value: winner.scores.riskScore },
                { label: "Time Score",    value: winner.scores.timeScore },
                { label: "Overall Score", value: winner.scores.overallScore },
              ].map(({ label, value }) => (
                <div key={label} className="text-center bg-zinc-800/50 rounded-lg p-2">
                  <div className={`text-2xl font-bold ${value >= 80 ? "text-green-400" : value >= 60 ? "text-yellow-400" : "text-red-400"}`}>{value}</div>
                  <div className="text-xs text-zinc-500">{label}</div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Optimizations */}
      {panel === "opts" && (
        <Section title="Otimizações Identificadas" icon={Zap} iconColor="text-yellow-400">
          {session.optimizations.length === 0
            ? <p className="text-xs text-zinc-600 text-center py-4">Nenhuma otimização identificada</p>
            : session.optimizations.map(o => (
                <div key={o.id} className="flex items-start gap-3 py-2 border-b border-zinc-800/40 last:border-0">
                  {o.applied
                    ? <CheckCircle size={11} className="text-green-400 shrink-0 mt-0.5" />
                    : <AlertTriangle size={11} className="text-yellow-400 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="text-xs text-zinc-300">{o.description}</p>
                    <div className="flex gap-2 mt-0.5">
                      <Badge label={o.type} color="zinc" />
                      <Badge label={o.impact} color={o.impact === "High" ? "red" : o.impact === "Medium" ? "yellow" : "teal"} />
                      <Badge label={o.applied ? "APLICADA" : "SUGESTÃO"} color={o.applied ? "green" : "zinc"} />
                    </div>
                  </div>
                </div>
              ))
          }
        </Section>
      )}

      {/* Journey */}
      {panel === "journey" && (
        <Section title="Journey Gerada" icon={ArrowRight} iconColor="text-violet-400">
          {!journey
            ? <p className="text-xs text-zinc-500 text-center py-4">Nenhuma Journey criada ainda. Use "Criar Journey" acima.</p>
            : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-200">{journey.title}</p>
                  <Badge label={journey.status} color="violet" />
                </div>
                <p className="text-xs text-zinc-500 font-mono">{journey.id}</p>
                <p className="text-xs text-zinc-400">{journey.objective}</p>
                <p className="text-xs text-zinc-600">{journey.tasks.length} tasks</p>
              </div>
            )
          }
        </Section>
      )}

      {/* Audit */}
      {panel === "audit" && (
        <Section title="Auditoria da Sessão" icon={Activity} iconColor="text-blue-400">
          <div className="space-y-0 max-h-72 overflow-y-auto">
            {[...session.auditLog].reverse().map(e => (
              <div key={e.id} className="flex items-start gap-3 py-1.5 border-b border-zinc-800/30 last:border-0">
                {e.success ? <CheckCircle size={10} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />}
                <span className="text-xs font-mono text-zinc-400 w-44 shrink-0">{e.operation}</span>
                {e.detail && <span className="text-xs text-zinc-500 flex-1 truncate">{e.detail}</span>}
                <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "run",     label: "Executar PIE" },
  { id: "sessions",label: "Sessões" },
  { id: "detail",  label: "Detalhe" },
  { id: "events",  label: "Eventos" },
  { id: "tests",   label: "Testes" },
];

export default function PlanningIntelligence() {
  const [tab,         setTab]        = useState("run");
  const [sessions,    setSessions]   = useState([]);
  const [selectedSid, setSelectedSid] = useState(null);
  const [events,      setEvents]     = useState([]);
  const [goals,       setGoals]      = useState([]);
  const [selectedGoal,setSelectedGoal] = useState(null);
  const [variants,    setVariants]   = useState({ Standard: true, Fast: true, Conservative: true, Minimal: false });
  const [running,     setRunning]    = useState(false);
  const [runError,    setRunError]   = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [testing,     setTesting]    = useState(false);

  const refresh = useCallback(() => {
    setSessions([...pieSessionList()].reverse());
    setEvents(pieEventBus.getHistory().slice(-80).reverse());
    setGoals(listGoals().filter(g => g.status === "Validated"));
  }, []);

  useEffect(() => {
    refresh();
    const unsub = pieEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const handleRun = async () => {
    if (!selectedGoal) return;
    setRunning(true); setRunError(null);
    const ctx = { userId: "pie_ui", projectId: "pie_proj", sessionId: `sess_${Date.now()}` };
    const chosen = Object.entries(variants).filter(([,v]) => v).map(([k]) => k);
    const s = await runPIE({ goalId: selectedGoal, identityContext: ctx, variants: chosen }).catch(e => { setRunError(String(e)); return null; });
    if (s) { setSelectedSid(s.id); setTab("detail"); }
    setRunning(false); refresh();
  };

  const handleQuickDemo = async () => {
    setRunning(true); setRunError(null);
    const ctx = { userId: "pie_ui", projectId: "pie_proj", sessionId: `sess_${Date.now()}` };
    const g = await processIntent({ userIntent: "abrir empresa", identityContext: ctx });
    await validateAndPromote(g.id);
    const s = await runPIE({ goalId: g.id, identityContext: ctx }).catch(e => { setRunError(String(e)); return null; });
    if (s) { setSelectedSid(s.id); setTab("detail"); }
    setRunning(false); refresh();
  };

  const runTests = async () => {
    setTesting(true);
    const r = await runPIETests();
    setTestResults(r); setTesting(false); refresh();
  };

  const selectedSession = sessions.find(s => s.id === selectedSid) ?? null;
  const passed = testResults?.filter(r => r.passed).length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-600 to-orange-700 flex items-center justify-center shrink-0">
            <Brain size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Planning Intelligence Engine</h1>
            <p className="text-zinc-500 text-xs">Geração · Avaliação · Comparação · Otimização · Seleção determinística · Foundation v1.0</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["MultiPlanGen","PlanScorer","StrategyComparator","PlanOptimizer","DecisionEngine","LearningReady"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Flow */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 flex-wrap text-xs">
          {["Goal (Validated)","PIE","Candidates (N)","Scorer","Ranking","Optimizer","Selected Plan","JourneyBuilder","Journey"].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span className={`px-2 py-0.5 rounded font-mono ${s === "PIE" ? "bg-yellow-900/50 text-yellow-300 border border-yellow-700" : s === "Selected Plan" ? "bg-green-900/50 text-green-300 border border-green-700" : "bg-zinc-800 text-zinc-400"}`}>{s}</span>
              {i < arr.length - 1 && <ArrowRight size={10} className="text-zinc-600 shrink-0" />}
            </React.Fragment>
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

        {/* ── RUN ──────────────────────────────────────────────────────────── */}
        {tab === "run" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-400">Goal Validado</p>
              {goals.length === 0
                ? <div className="bg-yellow-950/20 border border-yellow-800 rounded-lg p-3"><p className="text-xs text-yellow-300"><AlertTriangle size={10} className="inline mr-1" />Nenhum Goal Validado disponível. Use o Demo Rápido.</p></div>
                : <select value={selectedGoal ?? ""} onChange={e => setSelectedGoal(e.target.value || null)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-yellow-500">
                    <option value="">Selecione um Goal Validado...</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
              }

              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-2">Variantes a gerar</p>
                <div className="flex gap-3 flex-wrap">
                  {Object.keys(variants).map(v => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-300">
                      <input type="checkbox" checked={variants[v]} onChange={e => setVariants(prev => ({ ...prev, [v]: e.target.checked }))}
                        className="rounded" />
                      {v}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={handleRun} disabled={!selectedGoal || running}
                  className="text-xs px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors">
                  {running ? <><RotateCcw size={10} className="inline mr-1 animate-spin" />Analisando...</> : <><Brain size={10} className="inline mr-1" />Executar PIE</>}
                </button>
                <button onClick={handleQuickDemo} disabled={running}
                  className="text-xs px-3 py-1.5 bg-teal-900/40 border border-teal-700 text-teal-300 hover:bg-teal-800/40 disabled:opacity-40 rounded-lg transition-colors">
                  <Zap size={10} className="inline mr-1" />Demo Rápido (Abertura de Empresa)
                </button>
              </div>
            </div>
            {runError && <div className="bg-red-950/20 border border-red-800 rounded-xl p-3"><p className="text-xs text-red-400"><XCircle size={10} className="inline mr-1" />{runError}</p></div>}
          </div>
        )}

        {/* ── SESSIONS ─────────────────────────────────────────────────────── */}
        {tab === "sessions" && (
          <div className="space-y-2">
            {sessions.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <Layers size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Nenhuma sessão PIE executada</p>
              </div>
            )}
            {sessions.map(s => {
              const winner = s.candidates.find(c => c.selected);
              return (
                <div key={s.id} onClick={() => { setSelectedSid(s.id); setTab("detail"); }}
                  className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 cursor-pointer hover:border-zinc-600 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-mono text-zinc-500">{s.id}</p>
                      <p className="text-sm text-zinc-300 mt-0.5">{String(s.metadata?.goalTitle ?? "Goal")}</p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <Badge label={s.status} color={s.status === "Completed" ? "green" : "zinc"} />
                      {winner && <Badge label={`Winner: ${winner.variant} (${winner.scores.overallScore})`} color="yellow" />}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">{s.candidates.length} candidatos · {s.optimizations.length} otimizações · {new Date(s.createdAt).toLocaleString("pt-BR")}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DETAIL ─────────────────────────────────────────────────────── */}
        {tab === "detail" && <SessionDetail session={selectedSession} />}

        {/* ── EVENTS ─────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <Section title="PIE Event Bus" icon={Activity} iconColor="text-yellow-400">
            {events.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Nenhum evento publicado</p>}
            <div className="space-y-0 max-h-96 overflow-y-auto">
              {events.map(e => {
                const color = e.type === "PlanSelected" || e.type === "PlanningCompleted" ? "text-green-400"
                  : e.type === "PlanningStarted" ? "text-blue-400"
                  : e.type === "AlternativePlanGenerated" ? "text-violet-400"
                  : e.type === "PlanOptimized" ? "text-yellow-400"
                  : "text-zinc-400";
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-52 ${color}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 font-mono truncate flex-1">{e.sessionId}</span>
                    <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── TESTS ─────────────────────────────────────────────────────── */}
        {tab === "tests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-zinc-400">Multi-plan gen · Scoring · Ranking · Optimization · Events · Audit · Journey integration</p>
              <button onClick={runTests} disabled={testing}
                className="flex items-center gap-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                {testing ? <><RotateCcw size={12} className="animate-spin" />Testando...</> : <><FlaskConical size={12} />Executar Testes PIE</>}
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
                <Section title="Resultados" icon={FlaskConical} iconColor="text-yellow-400">
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
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes PIE" para validar o Planning Intelligence Engine</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}