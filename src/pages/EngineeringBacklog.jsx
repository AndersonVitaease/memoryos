import React, { useState, useMemo } from "react";
import { Search, ChevronRight, CheckCircle, Circle, AlertTriangle, Clock, ArrowRight, BarChart2, GitBranch, Layers, Flag } from "lucide-react";
import { Link } from "react-router-dom";

// ─── Data ─────────────────────────────────────────────────────────────────

const EPICS = [
  { id: "EPIC-001", name: "Core Runtime",         sprint: "1–7",  status: "in_progress", progress: 72, risk: "low",    refs: ["MRS","MCS"],        rfc: "RFC-001", features: 5 },
  { id: "EPIC-002", name: "Journey Manager",       sprint: "3",    status: "in_progress", progress: 60, risk: "medium", refs: ["MRS Cap.4"],        rfc: "RFC-005", features: 3 },
  { id: "EPIC-003", name: "Working Memory",        sprint: "1",    status: "done",        progress: 100,risk: "low",    refs: ["MRS Cap.3"],        rfc: "RFC-003", features: 3 },
  { id: "EPIC-004", name: "Long Term Memory",      sprint: "5",    status: "planned",     progress: 20, risk: "medium", refs: ["MDS-1.6"],          rfc: "RFC-003", features: 3 },
  { id: "EPIC-005", name: "Execution Engine",      sprint: "5",    status: "in_progress", progress: 55, risk: "high",   refs: ["MCS","MREM"],       rfc: "RFC-001", features: 4 },
  { id: "EPIC-006", name: "Planner",               sprint: "4",    status: "in_progress", progress: 40, risk: "high",   refs: ["MDIS","MREM Cap.2"],rfc: "—",       features: 3 },
  { id: "EPIC-007", name: "Event Bus",             sprint: "2",    status: "done",        progress: 100,risk: "low",    refs: ["MRS Cap.5"],        rfc: "RFC-004", features: 3 },
  { id: "EPIC-008", name: "Security",              sprint: "6",    status: "in_progress", progress: 45, risk: "high",   refs: ["MCS","MDIS"],       rfc: "RFC-002", features: 3 },
  { id: "EPIC-009", name: "Audit Trail",           sprint: "3",    status: "done",        progress: 100,risk: "low",    refs: ["MCS"],              rfc: "RFC-002", features: 3 },
  { id: "EPIC-010", name: "Connector SDK",         sprint: "9",    status: "planned",     progress: 10, risk: "medium", refs: ["MCF","MDPS"],       rfc: "RFC-001", features: 4 },
  { id: "EPIC-011", name: "Specialist SDK",        sprint: "10",   status: "planned",     progress: 5,  risk: "medium", refs: ["MCIS","MDPS"],      rfc: "—",       features: 3 },
  { id: "EPIC-012", name: "Knowledge Engine",      sprint: "11",   status: "planned",     progress: 0,  risk: "medium", refs: ["MGIS","MDS"],       rfc: "—",       features: 3 },
  { id: "EPIC-013", name: "Capability Registry",   sprint: "8",    status: "planned",     progress: 15, risk: "low",    refs: ["MCIS-Registry"],    rfc: "—",       features: 3 },
  { id: "EPIC-014", name: "Marketplace",           sprint: "14",   status: "planned",     progress: 0,  risk: "high",   refs: ["MDPS Cap.4"],       rfc: "—",       features: 2 },
  { id: "EPIC-015", name: "Developer Portal",      sprint: "15",   status: "planned",     progress: 0,  risk: "medium", refs: ["MDPS Cap.5"],       rfc: "—",       features: 2 },
  { id: "EPIC-016", name: "Foundation UI",         sprint: "16",   status: "planned",     progress: 60, risk: "low",    refs: ["MEB"],              rfc: "—",       features: 2 },
];

const FEATURES = [
  { id: "FEAT-001", epic: "EPIC-001", name: "IConnector Interface",       status: "done",        priority: "P0", effort: "S", deps: [] },
  { id: "FEAT-002", epic: "EPIC-001", name: "ISpecialist Interface",      status: "done",        priority: "P0", effort: "S", deps: ["FEAT-001"] },
  { id: "FEAT-003", epic: "EPIC-001", name: "IMemoryProvider Interface",  status: "done",        priority: "P0", effort: "S", deps: [] },
  { id: "FEAT-004", epic: "EPIC-001", name: "IEventBus Interface",        status: "done",        priority: "P0", effort: "S", deps: [] },
  { id: "FEAT-005", epic: "EPIC-001", name: "IAuditTrail Interface",      status: "done",        priority: "P0", effort: "S", deps: [] },
  { id: "FEAT-010", epic: "EPIC-003", name: "WorkingMemoryEngine Core",   status: "done",        priority: "P0", effort: "M", deps: ["FEAT-003"] },
  { id: "FEAT-011", epic: "EPIC-003", name: "Memory Eviction Priority",   status: "done",        priority: "P0", effort: "S", deps: ["FEAT-010"] },
  { id: "FEAT-012", epic: "EPIC-003", name: "Memory Promotion to LTM",   status: "in_progress", priority: "P1", effort: "M", deps: ["FEAT-010"] },
  { id: "FEAT-020", epic: "EPIC-007", name: "EventBus Priority Scheduler",status: "done",        priority: "P0", effort: "M", deps: ["FEAT-004"] },
  { id: "FEAT-021", epic: "EPIC-007", name: "Dead Letter Queue",          status: "done",        priority: "P0", effort: "S", deps: ["FEAT-020"] },
  { id: "FEAT-022", epic: "EPIC-007", name: "Wildcard Subscriptions",     status: "done",        priority: "P1", effort: "S", deps: ["FEAT-020"] },
  { id: "FEAT-030", epic: "EPIC-002", name: "Journey Lifecycle Core",     status: "done",        priority: "P0", effort: "L", deps: ["FEAT-004","FEAT-005"] },
  { id: "FEAT-031", epic: "EPIC-002", name: "Journey Context Persistence",status: "in_progress", priority: "P0", effort: "M", deps: ["FEAT-030"] },
  { id: "FEAT-032", epic: "EPIC-002", name: "Journey Events Log",         status: "in_progress", priority: "P1", effort: "S", deps: ["FEAT-030"] },
  { id: "FEAT-040", epic: "EPIC-005", name: "ExecutionEngine Core",       status: "in_progress", priority: "P0", effort: "XL",deps: ["FEAT-001","FEAT-004","FEAT-005"] },
  { id: "FEAT-041", epic: "EPIC-005", name: "Retry Backoff Exponencial",  status: "in_progress", priority: "P0", effort: "M", deps: ["FEAT-040"] },
  { id: "FEAT-042", epic: "EPIC-005", name: "Rollback em Ordem Inversa",  status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-040"] },
  { id: "FEAT-043", epic: "EPIC-005", name: "Execução Paralela",          status: "planned",     priority: "P1", effort: "M", deps: ["FEAT-040"] },
  { id: "FEAT-050", epic: "EPIC-008", name: "SecurityGate Pipeline",      status: "in_progress", priority: "P0", effort: "L", deps: ["FEAT-005"] },
  { id: "FEAT-051", epic: "EPIC-008", name: "Human Approval Gate",        status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-050","FEAT-030"] },
  { id: "FEAT-052", epic: "EPIC-008", name: "IPolicy Interface + Engine", status: "planned",     priority: "P1", effort: "M", deps: ["FEAT-050"] },
  { id: "FEAT-060", epic: "EPIC-009", name: "AuditTrail Core Imutável",   status: "done",        priority: "P0", effort: "M", deps: [] },
  { id: "FEAT-061", epic: "EPIC-009", name: "Query Filtros + Wildcards",  status: "done",        priority: "P0", effort: "S", deps: ["FEAT-060"] },
  { id: "FEAT-062", epic: "EPIC-009", name: "Export JSON/CSV",            status: "done",        priority: "P2", effort: "S", deps: ["FEAT-061"] },
  { id: "FEAT-070", epic: "EPIC-010", name: "BaseConnector Scaffold",     status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-001"] },
  { id: "FEAT-071", epic: "EPIC-010", name: "HttpConnector Reference",    status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-070"] },
  { id: "FEAT-072", epic: "EPIC-010", name: "OAuthConnector Reference",   status: "planned",     priority: "P1", effort: "L", deps: ["FEAT-070"] },
  { id: "FEAT-073", epic: "EPIC-010", name: "Connector Versioning",       status: "planned",     priority: "P1", effort: "M", deps: ["FEAT-070"] },
  { id: "FEAT-080", epic: "EPIC-011", name: "BaseSpecialist Scaffold",    status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-002"] },
  { id: "FEAT-081", epic: "EPIC-011", name: "GeneralSpecialist",          status: "planned",     priority: "P0", effort: "S", deps: ["FEAT-080"] },
  { id: "FEAT-082", epic: "EPIC-011", name: "GovernmentSpecialist",       status: "planned",     priority: "P1", effort: "L", deps: ["FEAT-080"] },
  { id: "FEAT-090", epic: "EPIC-012", name: "KnowledgeProvider Core",     status: "planned",     priority: "P0", effort: "L", deps: [] },
  { id: "FEAT-091", epic: "EPIC-012", name: "KnowledgePackage Loader",    status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-090"] },
  { id: "FEAT-092", epic: "EPIC-012", name: "Knowledge Evolution",        status: "planned",     priority: "P2", effort: "L", deps: ["FEAT-090"] },
  { id: "FEAT-100", epic: "EPIC-013", name: "ConnectorRegistry Core",     status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-001"] },
  { id: "FEAT-101", epic: "EPIC-013", name: "SpecialistRegistry Core",    status: "planned",     priority: "P0", effort: "M", deps: ["FEAT-002"] },
  { id: "FEAT-102", epic: "EPIC-013", name: "HealthCheck Monitor",        status: "planned",     priority: "P1", effort: "M", deps: ["FEAT-100"] },
];

const SPRINTS = [
  { n: 1,  name: "Working Memory",         epics: ["EPIC-003"],                    status: "done"        },
  { n: 2,  name: "Event Bus",              epics: ["EPIC-007"],                    status: "done"        },
  { n: 3,  name: "Audit + Journey",        epics: ["EPIC-009","EPIC-002"],         status: "in_progress" },
  { n: 4,  name: "Planner",               epics: ["EPIC-006"],                    status: "in_progress" },
  { n: 5,  name: "Execution + LTM",        epics: ["EPIC-005","EPIC-004"],         status: "in_progress" },
  { n: 6,  name: "Security",              epics: ["EPIC-008"],                    status: "in_progress" },
  { n: 7,  name: "Core Runtime Integrado", epics: ["EPIC-001"],                    status: "planned"     },
  { n: 8,  name: "Capability Registry",    epics: ["EPIC-013"],                    status: "planned"     },
  { n: 9,  name: "Connector SDK",          epics: ["EPIC-010"],                    status: "planned"     },
  { n: 10, name: "Specialist SDK",         epics: ["EPIC-011"],                    status: "planned"     },
  { n: 11, name: "Knowledge Engine",       epics: ["EPIC-012"],                    status: "planned"     },
  { n: 12, name: "Connectors Oficiais",    epics: [],                              status: "planned"     },
  { n: 13, name: "Specialists Oficiais",   epics: [],                              status: "planned"     },
  { n: 14, name: "Marketplace",            epics: ["EPIC-014"],                    status: "planned"     },
  { n: 15, name: "Developer Portal",       epics: ["EPIC-015"],                    status: "planned"     },
  { n: 16, name: "Foundation UI",          epics: ["EPIC-016"],                    status: "planned"     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  done:        { dot: "bg-green-500",  badge: "bg-green-900/40 text-green-400 border-green-800",  label: "Concluído"    },
  in_progress: { dot: "bg-yellow-500", badge: "bg-yellow-900/40 text-yellow-400 border-yellow-800",label: "Em progresso" },
  planned:     { dot: "bg-zinc-500",   badge: "bg-zinc-800 text-zinc-400 border-zinc-700",         label: "Planejado"    },
  blocked:     { dot: "bg-red-500",    badge: "bg-red-900/40 text-red-400 border-red-800",          label: "Bloqueado"    },
};

const RISK_STYLE = {
  low:    "text-green-400",
  medium: "text-yellow-400",
  high:   "text-red-400",
};

const EFFORT_STYLE = {
  S: "bg-blue-900/40 text-blue-300 border-blue-800",
  M: "bg-cyan-900/40 text-cyan-300 border-cyan-800",
  L: "bg-orange-900/40 text-orange-300 border-orange-800",
  XL:"bg-red-900/40 text-red-300 border-red-800",
};

const PRIORITY_STYLE = {
  P0: "text-red-400 font-bold",
  P1: "text-orange-400",
  P2: "text-zinc-500",
};

const TABS = ["Overview", "Epics", "Features", "Sprints", "Rastreabilidade"];

// ─── Components ───────────────────────────────────────────────────────────

function ProgressBar({ value, color = "violet" }) {
  const colors = { violet: "bg-violet-500", green: "bg-green-500", yellow: "bg-yellow-500", red: "bg-red-500", blue: "bg-blue-500" };
  const bar = value === 100 ? colors.green : value > 50 ? colors.yellow : colors.violet;
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all ${bar}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function OverviewPanel() {
  const total = EPICS.length;
  const done  = EPICS.filter(e => e.status === "done").length;
  const inProg= EPICS.filter(e => e.status === "in_progress").length;
  const planned = EPICS.filter(e => e.status === "planned").length;
  const avgProgress = Math.round(EPICS.reduce((s, e) => s + e.progress, 0) / total);
  const featDone = FEATURES.filter(f => f.status === "done").length;
  const featTotal = FEATURES.length;

  const topRisks = EPICS.filter(e => e.risk === "high" && e.status !== "done");

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Epics Totais",    value: total,    color: "violet" },
          { label: "Concluídos",      value: done,     color: "green"  },
          { label: "Em Progresso",    value: inProg,   color: "yellow" },
          { label: "Planejados",      value: planned,  color: "zinc"   },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color === "violet" ? "text-violet-400" : s.color === "green" ? "text-green-400" : s.color === "yellow" ? "text-yellow-400" : "text-zinc-400"}`}>{s.value}</div>
            <div className="text-zinc-500 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress Geral */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-zinc-300">Progresso Geral da Plataforma</span>
          <span className="text-violet-400 font-bold">{avgProgress}%</span>
        </div>
        <ProgressBar value={avgProgress} />
        <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
          <span>Features: {featDone}/{featTotal} ({Math.round(featDone/featTotal*100)}%)</span>
          <span>Foundation v1.0 — Phase: Engineering First</span>
        </div>
      </div>

      {/* Burndown visual simplificado */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <BarChart2 size={14} className="text-violet-400" /> Progresso por Epic
        </h3>
        <div className="space-y-2">
          {EPICS.map(epic => (
            <div key={epic.id} className="flex items-center gap-3">
              <span className="text-zinc-600 font-mono text-xs w-20 shrink-0">{epic.id}</span>
              <span className="text-zinc-400 text-xs truncate w-40 shrink-0">{epic.name}</span>
              <div className="flex-1">
                <ProgressBar value={epic.progress} />
              </div>
              <span className="text-xs text-zinc-500 w-8 text-right shrink-0">{epic.progress}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Riscos */}
      {topRisks.length > 0 && (
        <div className="bg-zinc-900 border border-red-900/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} /> Riscos Ativos
          </h3>
          <div className="space-y-2">
            {topRisks.map(e => (
              <div key={e.id} className="flex items-center gap-3 text-sm">
                <span className="text-red-400 font-mono text-xs shrink-0">{e.id}</span>
                <span className="text-zinc-300 flex-1">{e.name}</span>
                <span className="text-xs text-zinc-500">Sprint {e.sprint}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EpicsPanel() {
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? EPICS : EPICS.filter(e => e.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["all","done","in_progress","planned"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${filter === s ? "border-violet-500 text-violet-300 bg-violet-950" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
            {s === "all" ? "Todos" : STATUS_STYLE[s]?.label}
          </button>
        ))}
      </div>
      {filtered.map(epic => {
        const epicFeatures = FEATURES.filter(f => f.epic === epic.id);
        const ss = STATUS_STYLE[epic.status];
        return (
          <div key={epic.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button onClick={() => setExpanded(expanded === epic.id ? null : epic.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/60 transition-colors text-left gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${ss.dot}`} />
                <span className="text-zinc-500 font-mono text-xs shrink-0">{epic.id}</span>
                <span className="text-white font-medium text-sm truncate">{epic.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-zinc-500">S{epic.sprint}</span>
                <span className={`text-xs ${RISK_STYLE[epic.risk]}`}>▲ {epic.risk}</span>
                <span className="text-violet-400 text-xs font-bold">{epic.progress}%</span>
                <ChevronRight size={14} className={`text-zinc-600 transition-transform ${expanded === epic.id ? "rotate-90" : ""}`} />
              </div>
            </button>
            {expanded === epic.id && (
              <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
                <ProgressBar value={epic.progress} />
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-zinc-500">Refs:</span>
                  {epic.refs.map(r => <span key={r} className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono border border-zinc-700">{r}</span>)}
                  {epic.rfc !== "—" && <span className="bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded font-mono border border-violet-800">{epic.rfc}</span>}
                </div>
                <div className="space-y-1.5">
                  {epicFeatures.map(f => {
                    const fs = STATUS_STYLE[f.status];
                    return (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${fs.dot}`} />
                        <span className="text-zinc-500 font-mono shrink-0">{f.id}</span>
                        <span className="text-zinc-300 flex-1 truncate">{f.name}</span>
                        <span className={`border px-1 py-0.5 rounded text-xs ${EFFORT_STYLE[f.effort]}`}>{f.effort}</span>
                        <span className={`text-xs ${PRIORITY_STYLE[f.priority]}`}>{f.priority}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FeaturesPanel() {
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");

  const filtered = useMemo(() => {
    let list = FEATURES;
    if (statusF !== "all") list = list.filter(f => f.status === statusF);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
    }
    return list;
  }, [search, statusF]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar feature..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-600" />
        </div>
        {["all","done","in_progress","planned"].map(s => (
          <button key={s} onClick={() => setStatusF(s)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${statusF === s ? "border-violet-500 text-violet-300 bg-violet-950" : "border-zinc-700 text-zinc-400"}`}>
            {s === "all" ? "Todos" : STATUS_STYLE[s]?.label}
          </button>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-600 font-semibold uppercase tracking-wider">
          <div className="col-span-2">ID</div>
          <div className="col-span-4">Feature</div>
          <div className="col-span-2">Epic</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Effort</div>
          <div className="col-span-1">Prio.</div>
        </div>
        {filtered.map((f, i) => {
          const ss = STATUS_STYLE[f.status];
          return (
            <div key={f.id} className={`grid grid-cols-6 md:grid-cols-12 gap-2 px-4 py-2.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors`}>
              <div className="col-span-2 md:col-span-2 font-mono text-violet-400 text-xs">{f.id}</div>
              <div className="col-span-4 md:col-span-4 text-zinc-300 text-xs">{f.name}</div>
              <div className="hidden md:block md:col-span-2 text-zinc-500 text-xs">{f.epic}</div>
              <div className="hidden md:flex md:col-span-2 items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} />
                <span className="text-xs text-zinc-400">{ss.label}</span>
              </div>
              <div className="hidden md:block md:col-span-1">
                <span className={`text-xs border px-1 py-0.5 rounded ${EFFORT_STYLE[f.effort]}`}>{f.effort}</span>
              </div>
              <div className="hidden md:block md:col-span-1">
                <span className={`text-xs ${PRIORITY_STYLE[f.priority]}`}>{f.priority}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-600 text-right">{filtered.length} de {FEATURES.length} features</p>
    </div>
  );
}

function SprintsPanel() {
  return (
    <div className="space-y-2">
      {SPRINTS.map(sp => {
        const ss = STATUS_STYLE[sp.status];
        const epicObjs = sp.epics.map(id => EPICS.find(e => e.id === id)).filter(Boolean);
        const avgProg = epicObjs.length ? Math.round(epicObjs.reduce((s, e) => s + e.progress, 0) / epicObjs.length) : (sp.status === "done" ? 100 : 0);
        return (
          <div key={sp.n} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ss.dot}`} />
              <span className="text-zinc-500 font-mono text-xs shrink-0">Sprint {sp.n}</span>
              <span className="text-white text-sm font-medium flex-1 truncate">{sp.name}</span>
              <span className="text-xs text-zinc-500">{avgProg}%</span>
            </div>
            <ProgressBar value={avgProg} />
            {epicObjs.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {epicObjs.map(e => (
                  <span key={e.id} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono border border-zinc-700">{e.id}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TracePanel() {
  const matrix = [
    { tasks: "TASK-001..007", foundation: "MRS Cap.3", rfc: "RFC-003", adr: "ADR-003", mpar: "IWorkingMemoryEngine", mrem: "Etapa 10" },
    { tasks: "TASK-020..026", foundation: "MRS Cap.5", rfc: "RFC-004", adr: "ADR-004", mpar: "IEventBus",            mrem: "Etapa 9"  },
    { tasks: "TASK-030..036", foundation: "MRS Cap.4", rfc: "RFC-005", adr: "ADR-005", mpar: "IJourneyManager",      mrem: "Etapas 4,13" },
    { tasks: "TASK-040..046", foundation: "MCS",       rfc: "RFC-001", adr: "ADR-001", mpar: "IExecutionEngine",     mrem: "Etapas 7,8" },
    { tasks: "TASK-050..056", foundation: "MCS",       rfc: "RFC-002", adr: "ADR-002", mpar: "ISecurityGate",        mrem: "Etapa 7"  },
    { tasks: "TASK-060..066", foundation: "MCS",       rfc: "RFC-002", adr: "ADR-006", mpar: "IAuditTrail",          mrem: "Etapa 11" },
    { tasks: "TASK-070..076", foundation: "MCF",       rfc: "RFC-001", adr: "ADR-001", mpar: "IConnector",           mrem: "Etapas 6,8" },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-500">
        Toda Task deverá apontar para Foundation · RFC · ADR · MPAR · MREM · MQCCS (rastreabilidade obrigatória)
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-600 font-semibold uppercase">
          <div className="col-span-2">Tasks</div>
          <div className="col-span-2">Foundation</div>
          <div className="col-span-2">RFC</div>
          <div className="col-span-2">ADR</div>
          <div className="col-span-2">MPAR</div>
          <div className="col-span-2">MREM</div>
        </div>
        {matrix.map((row, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-12 gap-2 px-4 py-3 border-b border-zinc-800/50 last:border-0 text-xs">
            <div className="col-span-2 md:col-span-2 font-mono text-violet-400">{row.tasks}</div>
            <div className="col-span-1 md:col-span-2 text-zinc-400">{row.foundation}</div>
            <div className="col-span-1 md:col-span-2 text-blue-400">{row.rfc}</div>
            <div className="col-span-1 md:col-span-2 text-cyan-400">{row.adr}</div>
            <div className="col-span-1 md:col-span-2 text-zinc-300 truncate">{row.mpar}</div>
            <div className="col-span-1 md:col-span-2 text-zinc-500">{row.mrem}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function EngineeringBacklog() {
  const [tab, setTab] = useState("Overview");

  const totalProgress = Math.round(EPICS.reduce((s, e) => s + e.progress, 0) / EPICS.length);
  const doneCount = EPICS.filter(e => e.status === "done").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 md:px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers size={18} className="text-violet-400" />
                <h1 className="text-white font-bold text-base md:text-lg">MEB — Engineering Backlog</h1>
              </div>
              <p className="text-zinc-500 text-xs">Official Master Engineering Backlog · Foundation v1.0 · Phase: Engineering First</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-violet-400 font-bold text-lg">{totalProgress}%</div>
                <div className="text-zinc-600 text-xs">{doneCount}/{EPICS.length} epics</div>
              </div>
              <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800 px-2 py-1 rounded">In Progress</span>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${tab === t ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {tab === "Overview"       && <OverviewPanel />}
        {tab === "Epics"          && <EpicsPanel />}
        {tab === "Features"       && <FeaturesPanel />}
        {tab === "Sprints"        && <SprintsPanel />}
        {tab === "Rastreabilidade"&& <TracePanel />}
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 border-t border-zinc-800">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span>Refs:</span>
          {["MAS","MRS","MCS","MPAR","MREM","MQCCS","MPEGS"].map(r => (
            <span key={r} className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono border border-zinc-700">{r}</span>
          ))}
          <span className="ml-auto flex gap-3">
            <Link to="/developer-handbook" className="text-violet-400 hover:underline">Dev Handbook</Link>
            <Link to="/execution-model" className="text-violet-400 hover:underline">Execution Model</Link>
            <Link to="/mpegs" className="text-violet-400 hover:underline">MPEGS</Link>
          </span>
        </div>
      </div>
    </div>
  );
}