import React, { useState, useEffect, useCallback } from "react";
import { fuseStrategies, fusionSessionGet, fusionSessionList } from "@/lib/strategy-fusion/StrategyFusionEngine";
import { fusionEventBus } from "@/lib/strategy-fusion/SFEEvents";
import { runSFETests }    from "@/lib/strategy-fusion/sfeTests";
import { routeSpecialists, routingSessionList } from "@/lib/specialist-router/SpecialistRouter";
import { bootstrapSpecialists } from "@/lib/specialist-router/SpecialistCatalog";
import { processIntent, validateAndPromote, repoList as listGoals } from "@/lib/goal-engine/GoalEngine";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import {
  Layers, CheckCircle, XCircle, RotateCcw, FlaskConical, Zap,
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Activity,
  Shield, Star, Users, GitMerge,
} from "lucide-react";

bootstrapCapabilities();
bootstrapSpecialists();

// ── Primitives ────────────────────────────────────────────────────────────────

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

function ScoreBar({ label, value }) {
  const color = value >= 75 ? "bg-green-500" : value >= 55 ? "bg-teal-500" : value >= 35 ? "bg-yellow-500" : "bg-red-500";
  const text  = value >= 75 ? "text-green-400" : value >= 55 ? "text-teal-400" : value >= 35 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className={`font-bold ${text}`}>{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Session Detail ────────────────────────────────────────────────────────────

function SessionDetail({ session }) {
  const [panel,    setPanel]    = useState("overview");
  const [expanded, setExpanded] = useState({});

  if (!session) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <GitMerge size={24} className="text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-500 text-sm">Execute o Strategy Fusion Engine para visualizar resultados</p>
    </div>
  );

  const us = session.unifiedStrategy;
  const panels = [
    { id: "overview",  label: "Visão Geral" },
    { id: "strategies",label: `Estratégias (${session.strategies.length})` },
    { id: "conflicts", label: `Conflitos (${session.conflicts.length})` },
    { id: "unified",   label: "Estratégia Unificada" },
    { id: "scores",    label: "Scores" },
    { id: "audit",     label: "Auditoria" },
  ];

  const conflictStatusColor = { Resolved: "green", RequiresHumanApproval: "yellow", Detected: "red" };
  const confTypeLabel = {
    IncompatibleRecommendation: "Recomendação Incompatível",
    ConflictingPriority:        "Prioridade Conflitante",
    ContradictoryConstraint:    "Restrição Contraditória",
    ImpossibleDependency:       "Dependência Impossível",
    IncompatibleRisk:           "Risco Incompatível",
  };

  return (
    <div className="space-y-3">
      {/* Session header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-zinc-100">{session.goalTitle}</p>
            <p className="text-xs text-zinc-500 font-mono">{session.id}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Badge label={session.status} color={session.status === "Completed" ? "green" : "zinc"} />
            <Badge label={`${session.strategies.length} specialists`} color="teal" />
            <Badge label={`${session.conflicts.length} conflitos`} color={session.conflicts.length > 0 ? "yellow" : "green"} />
          </div>
        </div>
      </div>

      {/* Panels */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
        {panels.map(p => (
          <button key={p.id} onClick={() => setPanel(p.id)}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex-1 ${panel === p.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {panel === "overview" && us && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Specialists", value: session.strategies.length, color: "text-teal-400" },
              { label: "Conflitos",   value: session.conflicts.length,  color: session.conflicts.length > 0 ? "text-yellow-400" : "text-green-400" },
              { label: "Resolvidos",  value: session.conflicts.filter(c => c.status === "Resolved").length, color: "text-green-400" },
              { label: "Score",       value: `${us.scores?.overallScore ?? 0}`, color: "text-violet-400" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
                <div className="text-xs text-zinc-500">{m.label}</div>
              </div>
            ))}
          </div>
          <Section title="Sequência da Estratégia Unificada" icon={ArrowRight} iconColor="text-teal-400">
            {[...new Set(us.sequence.map(s => s.order))].sort((a, b) => a - b).map(order => {
              const steps = us.sequence.filter(s => s.order === order);
              const isParallel = steps.some(s => s.parallel);
              return (
                <div key={order} className="mb-3">
                  <p className="text-xs text-zinc-600 font-mono mb-1">Fase {order} — {isParallel ? "Paralelo" : "Sequencial"}</p>
                  <div className={`flex gap-2 flex-wrap ${isParallel ? "border border-dashed border-zinc-700 rounded-lg p-2" : ""}`}>
                    {steps.map(step => (
                      <div key={step.specialistId} className="bg-zinc-800 rounded-lg px-3 py-2 min-w-0">
                        <p className="text-xs font-semibold text-zinc-200">{step.specialistName}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{step.action}</p>
                      </div>
                    ))}
                  </div>
                  {order < Math.max(...us.sequence.map(s => s.order)) && (
                    <div className="flex justify-center mt-1"><ArrowRight size={12} className="text-zinc-600" /></div>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      )}

      {/* ── Strategies ── */}
      {panel === "strategies" && (
        <div className="space-y-2">
          {session.strategies.map(s => (
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button onClick={() => setExpanded(e => ({ ...e, [s.id]: !e[s.id] }))}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800/20 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-zinc-200">{s.specialistName}</span>
                    <Badge label={s.domain} color="teal" />
                    <Badge label={`${(s.confidenceLevel*100).toFixed(0)}% conf.`} color="violet" />
                    <Badge label={`${s.recommendations.length} recs`} color="zinc" />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{s.objective}</p>
                </div>
                {expanded[s.id] ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-500" />}
              </button>
              {expanded[s.id] && (
                <div className="border-t border-zinc-800 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 mb-1.5">Recomendações</p>
                    {s.recommendations.map(r => (
                      <div key={r.id} className={`flex items-start gap-2 py-1.5 border-b border-zinc-800/30 last:border-0`}>
                        {r.status === "Rejected"
                          ? <XCircle size={10} className="text-red-500 shrink-0 mt-0.5" />
                          : <CheckCircle size={10} className="text-green-500 shrink-0 mt-0.5" />}
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-zinc-300">{r.title}</span>
                            <Badge label={r.priority} color={r.priority === "Critical" ? "red" : r.priority === "High" ? "orange" : "zinc"} />
                            {r.status === "Rejected" && <Badge label="REJEITADA" color="red" />}
                          </div>
                          <p className="text-xs text-zinc-600 mt-0.5">{r.description}</p>
                          {r.rejectionReason && <p className="text-xs text-red-400 mt-0.5">↳ {r.rejectionReason}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {s.risks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-400 mb-1">Riscos</p>
                      {s.risks.map((r, i) => <p key={i} className="text-xs text-zinc-500 flex gap-1"><AlertTriangle size={9} className="text-yellow-500 shrink-0 mt-0.5" />{r}</p>)}
                    </div>
                  )}
                  {s.limitations.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-400 mb-1">Limitações</p>
                      {s.limitations.map((l, i) => <p key={i} className="text-xs text-zinc-600">{l}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Conflicts ── */}
      {panel === "conflicts" && (
        <div className="space-y-2">
          {session.conflicts.length === 0 && (
            <div className="bg-green-950/20 border border-green-800 rounded-xl p-4 text-center">
              <CheckCircle size={20} className="text-green-400 mx-auto mb-2" />
              <p className="text-green-300 text-sm font-semibold">Nenhum conflito detectado</p>
            </div>
          )}
          {session.conflicts.map(c => (
            <div key={c.id} className={`border rounded-xl p-3 ${c.status === "Resolved" ? "border-green-800 bg-green-950/10" : c.status === "RequiresHumanApproval" ? "border-yellow-800 bg-yellow-950/10" : "border-red-800 bg-red-950/10"}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                <Badge label={confTypeLabel[c.type] ?? c.type} color={c.status === "Resolved" ? "green" : "yellow"} />
                <Badge label={c.status} color={conflictStatusColor[c.status] ?? "zinc"} />
              </div>
              <p className="text-xs text-zinc-300 mb-2">{c.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="bg-zinc-900/60 rounded p-2"><p className="text-zinc-500 mb-0.5">Specialist A</p><p className="text-zinc-300">{c.recommendationA}</p></div>
                <div className="bg-zinc-900/60 rounded p-2"><p className="text-zinc-500 mb-0.5">Specialist B</p><p className="text-zinc-300">{c.recommendationB}</p></div>
              </div>
              {c.resolution && (
                <div className="mt-2 pt-2 border-t border-zinc-800/40">
                  <p className="text-xs text-zinc-500">Resolução (<span className="text-violet-400">{c.resolution.rule}</span>): {c.resolution.justification}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Unified Strategy ── */}
      {panel === "unified" && us && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Prioridades Críticas</p>
            {us.priorities.map((p, i) => <p key={i} className="text-xs text-zinc-300 flex gap-1.5"><span className="text-red-400 shrink-0">●</span>{p}</p>)}
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Decisões Tomadas ({us.decisions.length})</p>
            {us.decisions.map(d => (
              <div key={d.id} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/30 last:border-0">
                {d.accepted ? <CheckCircle size={10} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />}
                <div className="flex-1">
                  <p className="text-xs text-zinc-300">{d.description}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{d.reason} · Regra: <span className="text-violet-400">{d.rule}</span></p>
                </div>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Riscos Consolidados ({us.risks.length})</p>
            {us.risks.map((r, i) => <p key={i} className="text-xs text-zinc-500 flex gap-1.5"><AlertTriangle size={9} className="text-yellow-500 shrink-0 mt-0.5" />{r}</p>)}
          </div>
        </div>
      )}

      {/* ── Scores ── */}
      {panel === "scores" && session.scores && (
        <div className="space-y-3">
          <div className="space-y-2">
            {Object.entries(session.scores).filter(([k]) => k !== "overallScore").map(([k, v]) => (
              <ScoreBar key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={v} />
            ))}
            <div className="pt-1 border-t border-zinc-800">
              <ScoreBar label="Overall Score" value={session.scores.overallScore} />
            </div>
          </div>
          {session.scoreExplanations.length > 0 && (
            <Section title="Explicações" icon={Shield} iconColor="text-violet-400">
              {session.scoreExplanations.map(e => (
                <div key={e.dimension} className="flex gap-3 text-xs py-1 border-b border-zinc-800/30 last:border-0">
                  <span className="text-zinc-500 w-36 shrink-0">{e.dimension}</span>
                  <span className="text-zinc-400 flex-1">{e.rationale}</span>
                  <span className={`font-bold shrink-0 ${e.value >= 70 ? "text-green-400" : e.value >= 45 ? "text-yellow-400" : "text-red-400"}`}>{e.value}</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}

      {/* ── Audit ── */}
      {panel === "audit" && (
        <Section title="Auditoria" icon={Activity} iconColor="text-blue-400">
          <div className="max-h-80 overflow-y-auto">
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
  { id: "run",      label: "Executar" },
  { id: "sessions", label: "Sessões" },
  { id: "detail",   label: "Detalhe" },
  { id: "events",   label: "Eventos" },
  { id: "tests",    label: "Testes" },
];

export default function StrategyFusionPage() {
  const [tab,          setTab]         = useState("run");
  const [sessions,     setSessions]    = useState([]);
  const [selectedSid,  setSelectedSid] = useState(null);
  const [events,       setEvents]      = useState([]);
  const [goals,        setGoals]       = useState([]);
  const [routingSessions, setRoutingSessions] = useState([]);
  const [selectedGoal, setSelectedGoal]  = useState(null);
  const [selectedRid,  setSelectedRid]   = useState(null);
  const [running,      setRunning]       = useState(false);
  const [runError,     setRunError]      = useState(null);
  const [testResults,  setTestResults]   = useState(null);
  const [testing,      setTesting]       = useState(false);

  const refresh = useCallback(() => {
    setSessions([...fusionSessionList()].reverse());
    setEvents(fusionEventBus.getHistory().slice(-100).reverse());
    setGoals(listGoals().filter(g => g.status === "Validated"));
    setRoutingSessions([...routingSessionList()].reverse());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = fusionEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const handleFuse = async () => {
    if (!selectedGoal || !selectedRid) return;
    setRunning(true); setRunError(null);
    const ctx = { userId: "sfe_ui", projectId: "sfe_proj", sessionId: `sess_${Date.now()}` };
    const s = await fuseStrategies({ goalId: selectedGoal, routingSessionId: selectedRid, identityContext: ctx })
      .catch(e => { setRunError(String(e)); return null; });
    if (s) { setSelectedSid(s.id); setTab("detail"); }
    setRunning(false); refresh();
  };

  const handleDemo = async () => {
    setRunning(true); setRunError(null);
    const ctx = { userId: "sfe_ui", projectId: "sfe_proj", sessionId: `sess_${Date.now()}` };
    const g   = await processIntent({ userIntent: "importar suplemento", identityContext: ctx });
    await validateAndPromote(g.id);
    const routing = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Collaborative" });
    const s = await fuseStrategies({ goalId: g.id, routingSessionId: routing.id, identityContext: ctx })
      .catch(e => { setRunError(String(e)); return null; });
    if (s) { setSelectedSid(s.id); setTab("detail"); }
    setRunning(false); refresh();
  };

  const runTests = async () => {
    setTesting(true);
    const r = await runSFETests();
    setTestResults(r); setTesting(false); refresh();
  };

  const selectedSession = sessions.find(s => s.id === selectedSid) ?? null;
  const passed = testResults?.filter(r => r.passed).length ?? 0;
  const filteredRS = selectedGoal ? routingSessions.filter(rs => rs.goalId === selectedGoal && rs.status === "Completed") : routingSessions.filter(rs => rs.status === "Completed");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-700 flex items-center justify-center shrink-0">
            <GitMerge size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Strategy Fusion Engine</h1>
            <p className="text-zinc-500 text-xs">Collaborative Reasoning · Conflict Detection · Conflict Resolution · Unified Strategy · Foundation v1.0</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["StrategyBuilder","ConflictEngine","ScoreEngine","FusionSession","UnifiedStrategy","SFEEventBus"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Flow */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 flex-wrap text-xs overflow-x-auto">
          {["RoutingSession","StrategyBuilder (×N)","ConflictDetection","ConflictResolution","ScoreEngine","Unified Strategy","Journey Ready"].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span className={`px-2 py-0.5 rounded font-mono shrink-0 ${s === "Unified Strategy" ? "bg-violet-900/50 text-violet-300 border border-violet-700" : s === "ConflictDetection" ? "bg-yellow-900/50 text-yellow-300 border border-yellow-700" : "bg-zinc-800 text-zinc-400"}`}>{s}</span>
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

        {/* ── RUN ── */}
        {tab === "run" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              {goals.length === 0
                ? <div className="bg-yellow-950/20 border border-yellow-800 rounded-lg p-3"><p className="text-xs text-yellow-300"><AlertTriangle size={10} className="inline mr-1" />Nenhum Goal Validado. Use o Demo.</p></div>
                : <>
                    <select value={selectedGoal ?? ""} onChange={e => { setSelectedGoal(e.target.value || null); setSelectedRid(null); }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-violet-500">
                      <option value="">Selecione um Goal Validado...</option>
                      {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                    </select>
                    <select value={selectedRid ?? ""} onChange={e => setSelectedRid(e.target.value || null)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-violet-500">
                      <option value="">Selecione uma Routing Session...</option>
                      {filteredRS.map(rs => <option key={rs.id} value={rs.id}>{rs.goalTitle} — {rs.selectionMode} ({rs.selected.length} specialists)</option>)}
                    </select>
                  </>
              }
              <div className="flex gap-2 flex-wrap">
                <button onClick={handleFuse} disabled={!selectedGoal || !selectedRid || running}
                  className="text-xs px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors">
                  {running ? <><RotateCcw size={10} className="inline mr-1 animate-spin" />Fundindo...</> : <><GitMerge size={10} className="inline mr-1" />Executar Fusão</>}
                </button>
                <button onClick={handleDemo} disabled={running}
                  className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 rounded-lg transition-colors">
                  <Zap size={10} className="inline mr-1" />Demo — Importar Suplemento
                </button>
              </div>
            </div>
            {runError && <div className="bg-red-950/20 border border-red-800 rounded-xl p-3"><p className="text-xs text-red-400"><XCircle size={10} className="inline mr-1" />{runError}</p></div>}
          </div>
        )}

        {/* ── SESSIONS ── */}
        {tab === "sessions" && (
          <div className="space-y-2">
            {sessions.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <Layers size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Nenhuma sessão de fusão executada</p>
              </div>
            )}
            {sessions.map(s => (
              <div key={s.id} onClick={() => { setSelectedSid(s.id); setTab("detail"); }}
                className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 cursor-pointer hover:border-zinc-600 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm text-zinc-300">{s.goalTitle}</p>
                    <p className="text-xs text-zinc-600 font-mono">{s.id}</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge label={s.status} color={s.status === "Completed" ? "green" : "zinc"} />
                    <Badge label={`${s.strategies.length} strategies`} color="teal" />
                    <Badge label={`${s.conflicts.length} conflicts`} color={s.conflicts.length > 0 ? "yellow" : "green"} />
                    {s.scores && <Badge label={`Score ${s.scores.overallScore}`} color="violet" />}
                  </div>
                </div>
                <p className="text-xs text-zinc-600 mt-1">{new Date(s.createdAt).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── DETAIL ── */}
        {tab === "detail" && <SessionDetail session={selectedSession} />}

        {/* ── EVENTS ── */}
        {tab === "events" && (
          <Section title="SFE Event Bus" icon={Activity} iconColor="text-violet-400">
            {events.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Nenhum evento publicado</p>}
            <div className="max-h-96 overflow-y-auto space-y-0">
              {events.map(e => {
                const c = e.type === "FusionCompleted" || e.type === "UnifiedStrategyCreated" ? "text-violet-400"
                  : e.type === "ConflictDetected" ? "text-yellow-400"
                  : e.type === "ConflictResolved" ? "text-green-400"
                  : e.type === "StrategyRequested" ? "text-blue-400"
                  : "text-zinc-400";
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-52 ${c}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 font-mono truncate flex-1">{e.sessionId}</span>
                    <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── TESTS ── */}
        {tab === "tests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-zinc-400">Collaboration · Fusion · Conflicts · Resolution · Scores · Events · Audit · Integration</p>
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
                  <p className={`text-sm font-bold ${passed === testResults.length ? "text-green-300" : "text-red-300"}`}>{passed}/{testResults.length} testes aprovados</p>
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
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes" para validar o Strategy Fusion Engine</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}