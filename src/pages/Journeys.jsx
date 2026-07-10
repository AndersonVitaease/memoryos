import React, { useState, useEffect, useCallback } from "react";
import {
  createJourney, listJourneys, startJourney, pauseJourney,
  resumeJourney, cancelJourney, completeJourney, archiveJourney, addTask,
} from "@/lib/journey/JourneyManager";
import { orchestrateJourney } from "@/lib/journey/JourneyOrchestrator";
import { journeyEventBus }    from "@/lib/journey/JourneyEventBus";
import { runJourneyTests }    from "@/lib/journey/journeyTests";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import { isValidTransition }  from "@/lib/journey/types";
import {
  Map, Play, Pause, RotateCcw, CheckCircle, XCircle, Clock,
  Activity, FlaskConical, ChevronDown, ChevronRight, Cpu,
  AlertTriangle, Target, ListTodo, Eye
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
  Created: "zinc", Planning: "blue", Ready: "teal", Running: "green",
  Waiting: "yellow", Paused: "orange", Completed: "green",
  Cancelled: "zinc", Failed: "red", Archived: "zinc",
};

const TASK_STATUS_COLOR = {
  Pending: "zinc", Running: "blue", Completed: "green", Failed: "red", Skipped: "yellow",
};

const TABS = [
  { id: "journeys",    label: "Journeys" },
  { id: "detail",      label: "Detalhe" },
  { id: "events",      label: "Eventos" },
  { id: "tests",       label: "Testes" },
];

// ── Demo data seed ────────────────────────────────────────────────────────────

let _seeded = false;
function seedDemoJourney() {
  if (_seeded || listJourneys().length > 0) { _seeded = true; return; }
  _seeded = true;
  const j = createJourney({
    title: "Demo: Validate MRI Pipeline",
    objective: "Run all 4 review engines and verify output",
    description: "Automated demo journey to showcase the Journey Engine",
    goal: {
      title: "MRI Pipeline Validation",
      description: "Ensure all core review engines produce correct results",
      subGoals: ["Run MRI", "Run MQCCS", "Run MERS", "Run MADS"],
      constraints: ["Must use CapabilityRegistry", "No external dependencies"],
      acceptanceCriteria: ["All 4 engines complete", "Working Memory updated"],
      expectedOutcome: "Green orchestration pipeline",
      priority: "High",
    },
    priority: "High",
    owner: "platform",
    identityContext: { userId: "demo_user", projectId: "demo_project", sessionId: "demo_session" },
  });
  addTask(j.id, { description: "Run MRI — Reference Implementation",   requiredCapability: "mri",   dependencies: [], input: { sprint: "demo" }, output: {}, metadata: {} });
  addTask(j.id, { description: "Run MQCCS — Quality & Certification",  requiredCapability: "mqccs", dependencies: [], input: {}, output: {}, metadata: {} });
  addTask(j.id, { description: "Run MERS — Engineering Review",        requiredCapability: "mers",  dependencies: [], input: {}, output: {}, metadata: {} });
  addTask(j.id, { description: "Run MADS — Drift & Sustainability",    requiredCapability: "mads",  dependencies: [], input: {}, output: {}, metadata: {} });
}

// ── Journey Card ──────────────────────────────────────────────────────────────

function JourneyCard({ journey, onSelect, selected, onAction }) {
  const statusColor = STATUS_COLOR[journey.status] ?? "zinc";
  const completedTasks = journey.tasks.filter(t => t.status === "Completed").length;

  return (
    <div onClick={() => onSelect(journey.id)}
      className={`border rounded-xl p-3 cursor-pointer transition-all ${selected ? "border-violet-600 bg-violet-950/20" : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/50"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-200 truncate">{journey.title}</p>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{journey.id}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap shrink-0">
          <Badge label={journey.status} color={statusColor} />
          <Badge label={journey.priority} color={journey.priority === "Critical" ? "red" : journey.priority === "High" ? "orange" : "zinc"} />
        </div>
      </div>
      <p className="text-xs text-zinc-500 mb-2 line-clamp-1">{journey.objective}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <span>{journey.tasks.length} tasks · {completedTasks} done</span>
          <span>·</span>
          <span>{journey.auditLog.length} audit</span>
        </div>
        <div className="flex gap-1">
          {isValidTransition(journey.status, "Running") && (
            <button onClick={e => { e.stopPropagation(); onAction(journey.id, "start"); }}
              className="text-xs px-2 py-1 bg-green-900/40 border border-green-700 text-green-300 rounded-lg hover:bg-green-800/40 transition-colors">
              <Play size={10} className="inline mr-1" />Start
            </button>
          )}
          {journey.status === "Running" && (
            <>
              <button onClick={e => { e.stopPropagation(); onAction(journey.id, "pause"); }}
                className="text-xs px-2 py-1 bg-yellow-900/40 border border-yellow-700 text-yellow-300 rounded-lg hover:bg-yellow-800/40 transition-colors">
                <Pause size={10} className="inline mr-1" />Pause
              </button>
              <button onClick={e => { e.stopPropagation(); onAction(journey.id, "orchestrate"); }}
                className="text-xs px-2 py-1 bg-violet-900/40 border border-violet-700 text-violet-300 rounded-lg hover:bg-violet-800/40 transition-colors">
                <Cpu size={10} className="inline mr-1" />Run Tasks
              </button>
              <button onClick={e => { e.stopPropagation(); onAction(journey.id, "complete"); }}
                className="text-xs px-2 py-1 bg-blue-900/40 border border-blue-700 text-blue-300 rounded-lg hover:bg-blue-800/40 transition-colors">
                <CheckCircle size={10} className="inline mr-1" />Complete
              </button>
            </>
          )}
          {journey.status === "Paused" && (
            <button onClick={e => { e.stopPropagation(); onAction(journey.id, "resume"); }}
              className="text-xs px-2 py-1 bg-teal-900/40 border border-teal-700 text-teal-300 rounded-lg hover:bg-teal-800/40 transition-colors">
              <RotateCcw size={10} className="inline mr-1" />Resume
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function JourneyDetail({ journey }) {
  const [panel, setPanel] = useState("goal");
  if (!journey) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <Eye size={24} className="text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-500 text-sm">Selecione uma Journey para ver os detalhes</p>
    </div>
  );

  const panels = [
    { id: "goal", label: "Goal" }, { id: "tasks", label: "Tasks" },
    { id: "timeline", label: "Timeline" }, { id: "audit", label: "Auditoria" },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-base font-bold text-zinc-100">{journey.title}</p>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">{journey.id}</p>
          </div>
          <Badge label={journey.status} color={STATUS_COLOR[journey.status] ?? "zinc"} />
        </div>
        <p className="text-xs text-zinc-400 mt-2">{journey.objective}</p>
        <div className="flex gap-4 mt-2 text-xs text-zinc-600">
          <span>Criado: {new Date(journey.createdAt).toLocaleString("pt-BR")}</span>
          {journey.completedAt && <span>Concluído: {new Date(journey.completedAt).toLocaleString("pt-BR")}</span>}
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

      {panel === "goal" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">Título do Goal</p>
            <p className="text-sm text-zinc-200">{journey.goal.title}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">Resultado Esperado</p>
            <p className="text-xs text-zinc-300">{journey.goal.expectedOutcome}</p>
          </div>
          {journey.goal.subGoals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">Sub-Goals</p>
              {journey.goal.subGoals.map((sg, i) => <p key={i} className="text-xs text-zinc-400">· {sg}</p>)}
            </div>
          )}
          {journey.goal.acceptanceCriteria.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">Critérios de Aceite</p>
              {journey.goal.acceptanceCriteria.map((ac, i) => (
                <div key={i} className="flex gap-2 text-xs text-zinc-400">
                  <CheckCircle size={10} className="text-green-500 mt-0.5 shrink-0" />{ac}
                </div>
              ))}
            </div>
          )}
          {journey.goal.constraints.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">Constraints</p>
              {journey.goal.constraints.map((c, i) => <p key={i} className="text-xs text-zinc-500">· {c}</p>)}
            </div>
          )}
        </div>
      )}

      {panel === "tasks" && (
        <div className="space-y-2">
          {journey.tasks.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Nenhuma task</p>}
          {journey.tasks.map(t => (
            <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200">{t.description}</p>
                  <p className="text-xs text-zinc-600 font-mono mt-0.5">{t.id}</p>
                </div>
                <Badge label={t.status} color={TASK_STATUS_COLOR[t.status] ?? "zinc"} />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-zinc-600">
                <span>Capability: <span className="text-violet-400 font-mono">{t.requiredCapability}</span></span>
                {t.assignedCapability && <span>Assigned: <span className="text-green-400 font-mono">{t.assignedCapability}</span></span>}
              </div>
              {t.finishedAt && t.startedAt && (
                <p className="text-xs text-zinc-700 mt-1">{t.finishedAt - t.startedAt}ms</p>
              )}
            </div>
          ))}
        </div>
      )}

      {panel === "timeline" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            {journey.timeline.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Sem entradas</p>}
            {[...journey.timeline].reverse().map(e => (
              <div key={e.id} className="flex items-start gap-3 px-3 py-1.5 border-b border-zinc-800/30 last:border-0">
                <span className="text-xs text-violet-400 font-mono shrink-0 w-36 truncate">{e.event}</span>
                <span className="text-xs text-zinc-400 flex-1">{e.detail}</span>
                <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === "audit" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            {journey.auditLog.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Sem entradas</p>}
            {[...journey.auditLog].reverse().map(e => (
              <div key={e.id} className="flex items-start gap-3 px-3 py-1.5 border-b border-zinc-800/30 last:border-0">
                {e.success ? <CheckCircle size={10} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />}
                <span className="text-xs font-mono text-zinc-400 w-32 shrink-0">{e.operation}</span>
                {e.fromStatus && <span className="text-xs text-zinc-600">{e.fromStatus} → {e.toStatus}</span>}
                {e.error && <span className="text-xs text-red-400 truncate max-w-xs">{e.error}</span>}
                <span className="text-xs text-zinc-700 ml-auto shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Journeys() {
  const [tab,          setTab]          = useState("journeys");
  const [journeys,     setJourneys]     = useState([]);
  const [selectedId,   setSelectedId]   = useState(null);
  const [events,       setEvents]       = useState([]);
  const [testResults,  setTestResults]  = useState(null);
  const [testing,      setTesting]      = useState(false);
  const [running,      setRunning]      = useState(null);

  const refresh = useCallback(() => {
    setJourneys([...listJourneys()].reverse());
    setEvents(journeyEventBus.getHistory().slice(-60).reverse());
  }, []);

  useEffect(() => {
    seedDemoJourney();
    refresh();
    const unsub = journeyEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const handleAction = async (id, action) => {
    setRunning(id);
    try {
      if (action === "start")       startJourney(id);
      if (action === "pause")       pauseJourney(id);
      if (action === "resume")      resumeJourney(id);
      if (action === "complete")    completeJourney(id);
      if (action === "cancel")      cancelJourney(id);
      if (action === "archive")     archiveJourney(id);
      if (action === "orchestrate") {
        const j = listJourneys().find(j => j.id === id);
        if (j) await orchestrateJourney(j);
      }
    } catch (e) {
      console.error(e);
    }
    setRunning(null);
    refresh();
  };

  const runTests = async () => {
    setTesting(true);
    const r = await runJourneyTests();
    setTestResults(r);
    setTesting(false);
    refresh();
  };

  const selectedJourney = journeys.find(j => j.id === selectedId) ?? null;
  const passed = testResults?.filter(r => r.passed).length ?? 0;

  const stats = {
    total:     journeys.length,
    running:   journeys.filter(j => j.status === "Running").length,
    completed: journeys.filter(j => j.status === "Completed").length,
    failed:    journeys.filter(j => j.status === "Failed").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-700 flex items-center justify-center shrink-0">
            <Map size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Journey Engine</h1>
            <p className="text-zinc-500 text-xs">MemoryOS Journey Runtime · Foundation v1.0 · Unidade Operacional</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["JourneyManager","JourneyOrchestrator","WorkingMemory","CapabilityRegistry","EventBus","Audit"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",     value: stats.total,     color: "text-zinc-300" },
            { label: "Running",   value: stats.running,   color: "text-green-400" },
            { label: "Completed", value: stats.completed, color: "text-blue-400" },
            { label: "Failed",    value: stats.failed,    color: "text-red-400" },
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

        {/* ── JOURNEYS ─────────────────────────────────────────────────────── */}
        {tab === "journeys" && (
          <div className="space-y-3">
            {journeys.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <Map size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Nenhuma Journey criada</p>
              </div>
            )}
            {journeys.map(j => (
              <JourneyCard key={j.id} journey={j} selected={selectedId === j.id}
                onSelect={id => { setSelectedId(id); setTab("detail"); }}
                onAction={handleAction} />
            ))}
          </div>
        )}

        {/* ── DETAIL ───────────────────────────────────────────────────────── */}
        {tab === "detail" && <JourneyDetail journey={selectedJourney} />}

        {/* ── EVENTS ───────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <Section title="Journey Event Bus" icon={Activity} iconColor="text-blue-400">
            {events.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Nenhum evento publicado</p>}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map(e => {
                const color = e.type.includes("Completed") ? "text-green-400"
                  : e.type.includes("Failed") || e.type.includes("Cancelled") ? "text-red-400"
                  : e.type.includes("Started") || e.type.includes("Created") ? "text-blue-400"
                  : e.type.includes("Paused") ? "text-yellow-400"
                  : "text-zinc-400";
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-40 ${color}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 font-mono truncate flex-1">{e.journeyId}</span>
                    {e.taskId && <span className="text-xs text-zinc-600 font-mono shrink-0">{e.taskId}</span>}
                    <span className="text-xs text-zinc-700 shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── TESTS ────────────────────────────────────────────────────────── */}
        {tab === "tests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-zinc-400">Lifecycle · Manager · Orchestrator · Tasks · Memory · Audit · Events · Capability</p>
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
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes" para validar a Journey Engine</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}