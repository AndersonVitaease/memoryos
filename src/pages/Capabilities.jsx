import React, { useState, useEffect, useCallback } from "react";
import { globalCapabilityRegistry } from "@/lib/capabilities/registry/CapabilityRegistry";
import { capabilityEventBus }        from "@/lib/capabilities/registry/CapabilityEventBus";
import { capabilityHistory }          from "@/lib/capabilities/registry/CapabilityHistoryStore";
import { discoverySummary }           from "@/lib/capabilities/registry/CapabilityDiscovery";
import { runCapabilityTests }         from "@/lib/capabilities/registry/capabilityTests";
import { bootstrapCapabilities }      from "@/lib/capabilities/registry/bootstrapCapabilities";
import {
  CheckCircle, XCircle, Search, Layers, Cpu, Plug, BookOpen,
  Wrench, Puzzle, Activity, Clock, FlaskConical, RotateCcw,
  ChevronDown, ChevronRight, Tag, Info
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

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  ReviewEngine:     { icon: Cpu,     color: "blue",   label: "Review Engine" },
  Connector:        { icon: Plug,    color: "violet",  label: "Connector" },
  Specialist:       { icon: Cpu,     color: "orange",  label: "Specialist" },
  KnowledgePackage: { icon: BookOpen,color: "teal",   label: "Knowledge Package" },
  Tool:             { icon: Wrench,  color: "yellow",  label: "Tool" },
  Plugin:           { icon: Puzzle,  color: "green",   label: "Plugin" },
};

const STATUS_COLOR = { active: "green", inactive: "zinc", deprecated: "yellow", experimental: "orange" };
const CATEGORY_COLOR = {
  Testing: "blue", Quality: "green", Architecture: "yellow", Security: "red",
  Performance: "orange", Custom: "zinc", Memory: "violet", Reasoning: "teal",
};

const ALL_TYPES = ["All", "ReviewEngine", "Connector", "Specialist", "KnowledgePackage", "Tool", "Plugin"];
const TABS = [
  { id: "capabilities", label: "Capabilities" },
  { id: "events",       label: "Eventos" },
  { id: "history",      label: "Histórico" },
  { id: "tests",        label: "Testes" },
];

// ── Capability Card ───────────────────────────────────────────────────────────

function CapabilityCard({ entry }) {
  const [open, setOpen] = useState(false);
  const { capability, active, registeredAt } = entry;
  const m = capability.manifest;
  const TypeIcon = TYPE_CONFIG[m.type]?.icon ?? Layers;
  const typeColor = TYPE_CONFIG[m.type]?.color ?? "zinc";

  return (
    <div className={`border rounded-xl overflow-hidden ${active ? "border-zinc-700" : "border-zinc-800 opacity-60"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 p-3 hover:bg-zinc-800/30 transition-colors text-left">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0`}>
            <TypeIcon size={14} className={`text-${typeColor}-400`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-zinc-200">{m.name}</span>
              <Badge label={`v${m.version}`} color="zinc" />
              {!active && <Badge label="DISABLED" color="zinc" />}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">{m.id}</p>
            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{m.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Badge label={m.type} color={typeColor} />
          <Badge label={m.status} color={STATUS_COLOR[m.status] ?? "zinc"} />
          {open ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-3 space-y-3 bg-zinc-900/50">
          {/* Manifest details */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1"><Info size={10} /> Manifest</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {[
                ["Categoria",  m.category],
                ["Autor",      m.author],
                ["Foundation", m.minimumFoundationVersion],
                ["Registrado", new Date(registeredAt).toLocaleString("pt-BR")],
              ].map(([k, v]) => (
                <div key={k}>
                  <span className="text-zinc-600">{k}: </span>
                  <span className="text-zinc-300">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          {m.tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1 flex items-center gap-1"><Tag size={10} /> Tags</p>
              <div className="flex flex-wrap gap-1">
                {m.tags.map(t => <span key={t} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">{t}</span>)}
              </div>
            </div>
          )}

          {/* Dependencies */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">Dependências</p>
            {m.dependencies.length === 0
              ? <p className="text-xs text-zinc-600">Nenhuma dependência declarada</p>
              : m.dependencies.map(d => (
                  <div key={d.id} className="flex gap-3 text-xs">
                    <span className="text-zinc-300 font-mono">{d.id}@{d.version}</span>
                    <span className={d.required ? "text-red-400" : "text-zinc-500"}>{d.required ? "required" : "optional"}</span>
                  </div>
                ))
            }
          </div>

          {/* Permissions */}
          {m.permissions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">Permissões</p>
              {m.permissions.map((p, i) => (
                <div key={i} className="text-xs text-zinc-400">
                  <span className="font-mono text-zinc-300">{p.resource}</span>
                  <span className="text-zinc-600 ml-2">[{p.actions.join(", ")}]</span>
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          {Object.keys(m.metadata).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">Metadata</p>
              <pre className="text-xs text-zinc-500 font-mono bg-zinc-800/50 rounded p-2 overflow-x-auto">
                {JSON.stringify(m.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Capabilities() {
  const [tab,          setTab]          = useState("capabilities");
  const [typeFilter,   setTypeFilter]   = useState("All");
  const [query,        setQuery]        = useState("");
  const [entries,      setEntries]      = useState([]);
  const [events,       setEvents]       = useState([]);
  const [history,      setHistory]      = useState([]);
  const [summary,      setSummary]      = useState({});
  const [testResults,  setTestResults]  = useState(null);
  const [testing,      setTesting]      = useState(false);

  const refresh = useCallback(() => {
    let all = globalCapabilityRegistry.list();
    if (typeFilter !== "All") all = all.filter(e => e.capability.manifest.type === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      all = all.filter(e => {
        const m = e.capability.manifest;
        return m.id.includes(q) || m.name.toLowerCase().includes(q) ||
               m.description.toLowerCase().includes(q) || m.tags.some(t => t.includes(q));
      });
    }
    setEntries(all);
    setEvents(capabilityEventBus.getHistory().slice(-60).reverse());
    setHistory(capabilityHistory.getAll().slice(0, 40));
    setSummary(discoverySummary());
  }, [typeFilter, query]);

  useEffect(() => {
    refresh();
    const unsub = capabilityEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const runTests = async () => {
    setTesting(true);
    const r = await runCapabilityTests();
    setTestResults(r);
    setTesting(false);
    refresh();
  };

  const totalActive = globalCapabilityRegistry.discover().length;
  const totalAll    = globalCapabilityRegistry.size();
  const passed      = testResults?.filter(r => r.passed).length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-700 flex items-center justify-center shrink-0">
            <Layers size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Capability Registry</h1>
            <p className="text-zinc-500 text-xs">MemoryOS Unified Discovery Infrastructure · Foundation v1.0</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["CapabilityContract","CapabilityRegistry","CapabilityDiscovery","EventBus","HistoryStore"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
            const count = summary[type] ?? 0;
            const Icon = cfg.icon;
            return (
              <button key={type} onClick={() => { setTypeFilter(t => t === type ? "All" : type); }}
                className={`rounded-xl p-2 border text-center transition-colors ${typeFilter === type ? "border-violet-500 bg-violet-950/30" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                <Icon size={14} className={`text-${cfg.color}-400 mx-auto mb-1`} />
                <div className="text-sm font-bold text-white">{count}</div>
                <div className="text-xs text-zinc-500 leading-tight">{cfg.label}</div>
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); refresh(); }}
              className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex-1 ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CAPABILITIES ─────────────────────────────────────────────────── */}
        {tab === "capabilities" && (
          <div className="space-y-3">
            {/* Search + filter bar */}
            <div className="flex gap-2 flex-wrap">
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 flex-1 min-w-48">
                <Search size={13} className="text-zinc-500 shrink-0" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar por id, nome, tag..."
                  className="bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none w-full" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {ALL_TYPES.map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`text-xs px-3 py-2 rounded-xl border transition-colors ${typeFilter === t ? "border-violet-500 text-violet-300 bg-violet-950/30" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}>
                    {t === "All" ? "Todos" : t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-xs text-zinc-500">{entries.length} capability(ies) · {totalActive} ativas / {totalAll} total</p>
            </div>

            {entries.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <Layers size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Nenhuma capability encontrada</p>
              </div>
            )}

            <div className="space-y-2">
              {entries.map(e => <CapabilityCard key={e.capability.manifest.id} entry={e} />)}
            </div>
          </div>
        )}

        {/* ── EVENTS ───────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <Section title="Eventos do Ciclo de Vida" icon={Activity} iconColor="text-blue-400">
            {events.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">Nenhum evento publicado</p>}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map(e => {
                const color = e.type.includes("Registered") ? "text-green-400"
                  : e.type.includes("Removed") ? "text-red-400"
                  : e.type.includes("Disabled") ? "text-yellow-400"
                  : e.type.includes("Enabled") ? "text-blue-400"
                  : "text-zinc-400";
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-44 ${color}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 font-mono shrink-0">{e.capabilityId}</span>
                    <span className="text-xs text-zinc-700 ml-auto shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── HISTORY ──────────────────────────────────────────────────────── */}
        {tab === "history" && (
          <Section title="Histórico de Alterações" icon={Clock} iconColor="text-orange-400">
            {history.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">Sem alterações registradas</p>}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {history.map(r => {
                const actionColor = {
                  registered: "text-green-400", updated: "text-blue-400",
                  enabled: "text-teal-400", disabled: "text-yellow-400", removed: "text-red-400",
                };
                return (
                  <div key={r.id} className="flex items-center gap-3 py-1 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-24 ${actionColor[r.action] ?? "text-zinc-400"}`}>{r.action}</span>
                    <span className="text-xs text-zinc-300 font-mono shrink-0">{r.capabilityId}</span>
                    <span className="text-xs text-zinc-600 shrink-0">{r.snapshot.version}</span>
                    <span className="text-xs text-zinc-700 ml-auto shrink-0">{new Date(r.timestamp).toLocaleTimeString("pt-BR")}</span>
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
              <p className="text-xs text-zinc-400">Registry · Discovery · Manifest · Events · History · Compat — {testResults?.length ?? "?"} cenários</p>
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
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes" para validar a infraestrutura completa</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}