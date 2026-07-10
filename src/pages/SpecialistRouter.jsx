import React, { useState, useEffect, useCallback } from "react";
import { routeSpecialists, routingSessionList, routingSessionGet } from "@/lib/specialist-router/SpecialistRouter";
import { bootstrapSpecialists, getSpecialistCatalog } from "@/lib/specialist-router/SpecialistCatalog";
import { routingEventBus }   from "@/lib/specialist-router/SpecialistEvents";
import { runSpecialistTests } from "@/lib/specialist-router/specialistTests";
import { processIntent, validateAndPromote, repoList as listGoals } from "@/lib/goal-engine/GoalEngine";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import {
  Users, Search, CheckCircle, XCircle, RotateCcw, FlaskConical,
  ArrowRight, AlertTriangle, Zap, Activity, Trophy, ChevronDown, ChevronRight,
  Layers, Star,
} from "lucide-react";

bootstrapCapabilities();
bootstrapSpecialists();

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

function ScoreBar({ label, value }) {
  const color = value >= 80 ? "bg-green-500" : value >= 60 ? "bg-teal-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500";
  const textColor = value >= 80 ? "text-green-400" : value >= 60 ? "text-teal-400" : value >= 40 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className={`font-bold ${textColor}`}>{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const DOMAIN_COLOR = {
  juridico: "violet", contabil: "blue", tributario: "yellow", financeiro: "green",
  anvisa: "red", comercio_exterior: "orange", rh: "teal", ti: "blue",
  marketing: "violet", operacional: "zinc", compliance: "orange", geral: "zinc",
};

const MODE_COLOR = { Single: "blue", Multi: "violet", Collaborative: "teal", Sequential: "yellow", Parallel: "orange" };

// ── Match Card ────────────────────────────────────────────────────────────────

function MatchCard({ match, expanded, onToggle }) {
  return (
    <div className={`border rounded-xl overflow-hidden ${match.selected ? "border-teal-700 bg-teal-950/10" : "border-zinc-700 bg-zinc-900/50"}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800/20 transition-colors">
        {match.selected && <Trophy size={12} className="text-teal-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-200">{match.specialist.name}</span>
            <Badge label={`#${match.rankPosition}`} color={match.selected ? "teal" : "zinc"} />
            <Badge label={match.specialist.domain} color={DOMAIN_COLOR[match.specialist.domain] ?? "zinc"} />
            {match.selected && <Badge label="SELECIONADO" color="teal" />}
          </div>
          <div className="text-xs text-zinc-600 mt-0.5 flex gap-3">
            <span>Overall: <span className={`font-bold ${match.scores.overallScore >= 70 ? "text-green-400" : match.scores.overallScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>{match.scores.overallScore}/100</span></span>
            <span>Domain: {match.scores.domainScore}</span>
          </div>
        </div>
        {expanded ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-500" />}
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <p className="text-xs text-zinc-400 italic">"{match.rationale || match.specialist.description}"</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {Object.entries(match.scores).filter(([k]) => k !== "overallScore").map(([k, v]) => (
              <ScoreBar key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={v} />
            ))}
          </div>
          <ScoreBar label="Overall Score" value={match.scores.overallScore} />
          <div>
            <p className="text-xs text-zinc-500 mb-1">Capabilities: <span className="text-zinc-400">{match.specialist.capabilities.join(", ")}</span></p>
            <p className="text-xs text-zinc-500">Tags: {match.specialist.tags.map(t => <span key={t} className="inline-block bg-zinc-800 text-zinc-500 px-1.5 rounded text-xs mr-1">{t}</span>)}</p>
          </div>
          {match.explanations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">Explicações</p>
              {match.explanations.map(e => (
                <div key={e.dimension} className="flex gap-2 text-xs py-0.5">
                  <span className="text-zinc-600 w-36 shrink-0">{e.dimension}</span>
                  <span className="text-zinc-400 flex-1">{e.rationale}</span>
                  <span className={`font-bold shrink-0 ${e.value >= 70 ? "text-green-400" : e.value >= 40 ? "text-yellow-400" : "text-red-400"}`}>{e.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Session Detail ────────────────────────────────────────────────────────────

function SessionDetail({ session }) {
  const [panel,    setPanel]    = useState("ranking");
  const [expanded, setExpanded] = useState({});

  if (!session) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <Users size={24} className="text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-500 text-sm">Execute o Specialist Router para visualizar resultados</p>
    </div>
  );

  const panels = [
    { id: "ranking",  label: `Ranking (${session.matches.length})` },
    { id: "selected", label: `Selecionados (${session.selected.length})` },
    { id: "orch",     label: "Orquestração" },
    { id: "audit",    label: "Auditoria" },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-zinc-100">{session.goalTitle}</p>
            <p className="text-xs text-zinc-500 font-mono">{session.id}</p>
          </div>
          <div className="flex gap-1.5">
            <Badge label={session.status} color={session.status === "Completed" ? "green" : "zinc"} />
            <Badge label={session.selectionMode} color={MODE_COLOR[session.selectionMode] ?? "zinc"} />
          </div>
        </div>
        {session.rationale && <p className="text-xs text-zinc-400 mt-2 italic">"{session.rationale}"</p>}
      </div>

      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
        {panels.map(p => (
          <button key={p.id} onClick={() => setPanel(p.id)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex-1 whitespace-nowrap transition-colors ${panel === p.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {panel === "ranking" && (
        <div className="space-y-2">
          {session.matches.map(m => (
            <MatchCard key={m.specialist.id} match={m}
              expanded={!!expanded[m.specialist.id]}
              onToggle={() => setExpanded(e => ({ ...e, [m.specialist.id]: !e[m.specialist.id] }))} />
          ))}
        </div>
      )}

      {panel === "selected" && (
        <div className="space-y-2">
          {session.selected.map(m => (
            <MatchCard key={m.specialist.id} match={m} expanded={true} onToggle={() => {}} />
          ))}
          {session.rejected.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mt-2">
              <p className="text-xs font-semibold text-zinc-500 mb-2">Descartados (score &lt; 30)</p>
              {session.rejected.map(m => (
                <div key={m.specialist.id} className="flex items-center gap-2 py-1 text-xs">
                  <XCircle size={10} className="text-red-500 shrink-0" />
                  <span className="text-zinc-500">{m.specialist.name}</span>
                  <span className="text-zinc-700 font-mono">{m.scores.overallScore}/100</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {panel === "orch" && (
        <Section title="Estratégia de Orquestração" icon={Activity} iconColor="text-teal-400">
          {session.orchestration.length === 0
            ? <p className="text-xs text-zinc-600 text-center py-4">Nenhuma orquestração gerada</p>
            : (
              <div className="space-y-2">
                {[...new Set(session.orchestration.map(o => o.order))].sort((a, b) => a - b).map(order => {
                  const steps = session.orchestration.filter(o => o.order === order);
                  return (
                    <div key={order} className="space-y-1">
                      <p className="text-xs text-zinc-600 font-mono">Fase {order} — {steps[0]?.mode === "parallel" ? "Paralelo" : "Sequencial"}</p>
                      <div className={`flex gap-2 flex-wrap ${steps.length > 1 ? "border border-dashed border-zinc-700 rounded-lg p-2" : ""}`}>
                        {steps.map(step => (
                          <div key={step.specialistId} className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1">
                            <span className="text-xs text-zinc-300">{step.specialistId.replace("specialist_", "")}</span>
                            {step.dependsOn.length > 0 && <span className="text-zinc-600 text-xs">← {step.dependsOn.map(d => d.replace("specialist_","")).join(",")}</span>}
                          </div>
                        ))}
                      </div>
                      {order < Math.max(...session.orchestration.map(o => o.order)) && (
                        <div className="flex justify-center"><ArrowRight size={12} className="text-zinc-700" /></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          }
        </Section>
      )}

      {panel === "audit" && (
        <Section title="Auditoria" icon={Activity} iconColor="text-blue-400">
          <div className="max-h-64 overflow-y-auto space-y-0">
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
  { id: "catalog",  label: "Specialists" },
  { id: "route",    label: "Executar" },
  { id: "sessions", label: "Sessões" },
  { id: "detail",   label: "Detalhe" },
  { id: "events",   label: "Eventos" },
  { id: "tests",    label: "Testes" },
];

export default function SpecialistRouterPage() {
  const [tab,          setTab]         = useState("catalog");
  const [sessions,     setSessions]    = useState([]);
  const [selectedSid,  setSelectedSid] = useState(null);
  const [events,       setEvents]      = useState([]);
  const [goals,        setGoals]       = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [forceMode,    setForceMode]   = useState("");
  const [topN,         setTopN]        = useState(5);
  const [running,      setRunning]     = useState(false);
  const [runError,     setRunError]    = useState(null);
  const [testResults,  setTestResults] = useState(null);
  const [testing,      setTesting]     = useState(false);
  const [searchQ,      setSearchQ]     = useState("");
  const [domainFilter, setDomainFilter] = useState("");

  const refresh = useCallback(() => {
    setSessions([...routingSessionList()].reverse());
    setEvents(routingEventBus.getHistory().slice(-80).reverse());
    setGoals(listGoals().filter(g => g.status === "Validated"));
  }, []);

  useEffect(() => {
    refresh();
    const unsub = routingEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const handleRoute = async () => {
    if (!selectedGoal) return;
    setRunning(true); setRunError(null);
    const ctx = { userId: "sr_ui", projectId: "sr_proj", sessionId: `sess_${Date.now()}` };
    const s = await routeSpecialists({
      goalId: selectedGoal, identityContext: ctx,
      forceMode: forceMode || undefined,
      topN,
    }).catch(e => { setRunError(String(e)); return null; });
    if (s) { setSelectedSid(s.id); setTab("detail"); }
    setRunning(false); refresh();
  };

  const handleDemo = async () => {
    setRunning(true); setRunError(null);
    const ctx = { userId: "sr_ui", projectId: "sr_proj", sessionId: `sess_${Date.now()}` };
    const g = await processIntent({ userIntent: "importar suplemento", identityContext: ctx });
    await validateAndPromote(g.id);
    const s = await routeSpecialists({ goalId: g.id, identityContext: ctx, forceMode: "Collaborative" }).catch(e => { setRunError(String(e)); return null; });
    if (s) { setSelectedSid(s.id); setTab("detail"); }
    setRunning(false); refresh();
  };

  const runTests = async () => {
    setTesting(true);
    const r = await runSpecialistTests();
    setTestResults(r); setTesting(false); refresh();
  };

  const catalog = getSpecialistCatalog();
  const domains = [...new Set(catalog.map(s => s.domain))];

  const displayedCatalog = catalog.filter(s => {
    const matchSearch = !searchQ || s.name.toLowerCase().includes(searchQ.toLowerCase()) || s.tags.some(t => t.includes(searchQ.toLowerCase()));
    const matchDomain = !domainFilter || s.domain === domainFilter;
    return matchSearch && matchDomain;
  });

  const selectedSession = sessions.find(s => s.id === selectedSid) ?? null;
  const passed = testResults?.filter(r => r.passed).length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-700 flex items-center justify-center shrink-0">
            <Users size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Specialist Router</h1>
            <p className="text-zinc-500 text-xs">Discovery · Matching · Ranking · Seleção · Orquestração · Foundation v1.0</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["SpecialistContract","CapabilityRegistry","MatchingEngine","ScoreEngine","OrchestrationPlanner","RoutingEventBus"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Flow */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 flex-wrap text-xs overflow-x-auto">
          {["Goal (Validated)","Discovery","MatchingEngine","Scoring","Ranking","Selection","Orchestration Plan"].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span className={`px-2 py-0.5 rounded font-mono shrink-0 ${s === "MatchingEngine" ? "bg-teal-900/50 text-teal-300 border border-teal-700" : s === "Selection" ? "bg-green-900/50 text-green-300 border border-green-700" : "bg-zinc-800 text-zinc-400"}`}>{s}</span>
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

        {/* ── CATALOG ──────────────────────────────────────────────────────── */}
        {tab === "catalog" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Pesquisar specialists..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500" />
              </div>
              <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-teal-500">
                <option value="">Todos os domínios</option>
                {domains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {displayedCatalog.map(s => (
                <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-xs font-semibold text-zinc-200">{s.name}</p>
                    <Badge label={s.domain} color={DOMAIN_COLOR[s.domain] ?? "zinc"} />
                  </div>
                  <p className="text-xs text-zinc-500 mb-2 line-clamp-2">{s.description}</p>
                  <div className="flex items-center gap-3 text-xs text-zinc-600">
                    <span className="flex items-center gap-1"><Star size={9} className="text-yellow-500" />{(s.confidenceLevel * 100).toFixed(0)}%</span>
                    <span>{s.capabilities.length} caps</span>
                    <span>{s.supportedGoals.length} goals</span>
                    <span>{s.available ? <span className="text-green-500">●</span> : <span className="text-red-500">●</span>}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {s.tags.slice(0, 4).map(t => <span key={t} className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ROUTE ────────────────────────────────────────────────────────── */}
        {tab === "route" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              {goals.length === 0
                ? <div className="bg-yellow-950/20 border border-yellow-800 rounded-lg p-3"><p className="text-xs text-yellow-300"><AlertTriangle size={10} className="inline mr-1" />Nenhum Goal Validado disponível. Use o Demo.</p></div>
                : <select value={selectedGoal ?? ""} onChange={e => setSelectedGoal(e.target.value || null)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-teal-500">
                    <option value="">Selecione um Goal Validado...</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
              }
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-32">
                  <label className="text-xs text-zinc-500 mb-1 block">Modo de Seleção</label>
                  <select value={forceMode} onChange={e => setForceMode(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-teal-500">
                    <option value="">Auto</option>
                    {["Single","Multi","Collaborative","Sequential","Parallel"].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <label className="text-xs text-zinc-500 mb-1 block">Top N</label>
                  <input type="number" value={topN} min={1} max={9} onChange={e => setTopN(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-teal-500" />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={handleRoute} disabled={!selectedGoal || running}
                  className="text-xs px-3 py-1.5 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors">
                  {running ? <><RotateCcw size={10} className="inline mr-1 animate-spin" />Descobrindo...</> : <><Users size={10} className="inline mr-1" />Executar Router</>}
                </button>
                <button onClick={handleDemo} disabled={running}
                  className="text-xs px-3 py-1.5 bg-violet-900/40 border border-violet-700 text-violet-300 hover:bg-violet-800/40 disabled:opacity-40 rounded-lg transition-colors">
                  <Zap size={10} className="inline mr-1" />Demo — Importar Suplemento (Collaborative)
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
                <p className="text-zinc-500 text-sm">Nenhuma sessão de routing executada</p>
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
                    <Badge label={s.selectionMode} color={MODE_COLOR[s.selectionMode] ?? "zinc"} />
                    <Badge label={`${s.selected.length} selected`} color="teal" />
                  </div>
                </div>
                <p className="text-xs text-zinc-600 mt-1">{new Date(s.createdAt).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── DETAIL ──────────────────────────────────────────────────────── */}
        {tab === "detail" && <SessionDetail session={selectedSession} />}

        {/* ── EVENTS ──────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <Section title="Routing Event Bus" icon={Activity} iconColor="text-teal-400">
            {events.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Nenhum evento publicado</p>}
            <div className="max-h-96 overflow-y-auto space-y-0">
              {events.map(e => {
                const c = e.type === "RoutingCompleted" || e.type === "SpecialistSelected" ? "text-teal-400"
                  : e.type === "SpecialistDiscoveryStarted" ? "text-blue-400"
                  : e.type === "SpecialistRejected" ? "text-red-400"
                  : e.type === "SpecialistRanked" ? "text-yellow-400"
                  : "text-zinc-400";
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-56 ${c}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 font-mono truncate flex-1">{e.sessionId}</span>
                    <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── TESTS ───────────────────────────────────────────────────────── */}
        {tab === "tests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-zinc-400">Discovery · Matching · Ranking · Selection · Collaboration · Events · Audit · topN</p>
              <button onClick={runTests} disabled={testing}
                className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
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
                <Section title="Resultados" icon={FlaskConical} iconColor="text-teal-400">
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
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes" para validar o Specialist Router</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}