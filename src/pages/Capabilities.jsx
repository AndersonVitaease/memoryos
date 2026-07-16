/**
 * Capabilities — Engineering Sprint 7.0.2
 * Universal Capability Lifecycle Dashboard
 * Rota: /capabilities
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, CheckCircle, XCircle, AlertTriangle, Zap, ChevronDown, ChevronRight, RotateCcw, Award } from "lucide-react";

const STATE_CONFIG = {
  draft:        { label: "Draft",        color: "zinc",    icon: "⬜" },
  experimental: { label: "Experimental", color: "purple",  icon: "🧪" },
  internal:     { label: "Internal",     color: "blue",    icon: "🔵" },
  beta:         { label: "Beta",         color: "amber",   icon: "🟡" },
  certified:    { label: "Certified",    color: "teal",    icon: "🏅" },
  production:   { label: "Production",   color: "emerald", icon: "🟢" },
  enterprise:   { label: "Enterprise",   color: "gold",    icon: "🏆" },
  deprecated:   { label: "Deprecated",   color: "orange",  icon: "⚠️"  },
  disabled:     { label: "Disabled",     color: "red",     icon: "🔴" },
};

const STATE_FLOW = ["draft","experimental","internal","beta","certified","production","enterprise","deprecated","disabled"];

const COLOR_MAP = {
  zinc:    "bg-zinc-700/30 text-zinc-400 border-zinc-600",
  purple:  "bg-purple-500/15 text-purple-300 border-purple-500/30",
  blue:    "bg-blue-500/15 text-blue-300 border-blue-500/30",
  amber:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  teal:    "bg-teal-500/15 text-teal-300 border-teal-500/30",
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  gold:    "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  orange:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  red:     "bg-red-500/15 text-red-400 border-red-500/30",
};

function StateBadge({ state }) {
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${COLOR_MAP[cfg.color] ?? COLOR_MAP.zinc}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function Btn({ children, onClick, disabled, color = "zinc", small }) {
  const c = {
    zinc:    "bg-zinc-700/40 border-zinc-600 text-zinc-300 hover:bg-zinc-700",
    amber:   "bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25",
    emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25",
    red:     "bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25",
    teal:    "bg-teal-500/15 border-teal-500/30 text-teal-300 hover:bg-teal-500/25",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-1 border rounded-lg font-medium disabled:opacity-40 transition ${small ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"} ${c[color] ?? c.zinc}`}>
      {children}
    </button>
  );
}

function MiniStepper({ current }) {
  const idx = STATE_FLOW.indexOf(current);
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto mt-2">
      {STATE_FLOW.map((s, i) => {
        const cfg  = STATE_CONFIG[s];
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} className="flex items-center gap-0.5">
            <div className={`text-[8px] px-1.5 py-0.5 rounded border whitespace-nowrap ${active ? `${COLOR_MAP[cfg.color]} font-bold` : done ? "bg-zinc-700/20 border-zinc-700 text-zinc-600" : "bg-zinc-800/30 border-zinc-800 text-zinc-700"}`}>
              {cfg.icon} {cfg.label}
            </div>
            {i < STATE_FLOW.length - 1 && <div className={`h-px w-2 ${i < idx ? "bg-emerald-600/50" : "bg-zinc-800"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function CapabilityRow({ record, metrics, policy, onTransition, onCertify }) {
  const [open, setOpen] = useState(false);
  const successPct = metrics ? Math.round(metrics.successRate * 100) : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${policy?.blocked ? "border-red-500/30 bg-red-500/5" : policy?.warning ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 bg-muted/5"}`}>
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-semibold text-sm">{record.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">v{record.version}</span>
              <StateBadge state={record.state} />
              {record.certified && <span className="inline-flex items-center gap-0.5 text-[10px] text-teal-400"><Award className="w-2.5 h-2.5" />Certified</span>}
              {policy?.warning && <span className="inline-flex items-center gap-1 text-[10px] text-amber-400"><AlertTriangle className="w-2.5 h-2.5" />Deprecated</span>}
              {policy?.blocked && <span className="inline-flex items-center gap-1 text-[10px] text-red-400"><XCircle className="w-2.5 h-2.5" />Blocked</span>}
            </div>
            <p className="text-[11px] text-muted-foreground">{record.description}</p>
            <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground font-mono">
              <span>Owner: {record.owner}</span>
              <span>Since: {record.introducedIn}</span>
              <span>Executions: {record.executionCount}</span>
              {successPct !== null && <span className={successPct >= 90 ? "text-emerald-400" : "text-red-400"}>Success: {successPct}%</span>}
              {metrics && <span>Avg: {metrics.averageLatency}ms</span>}
              {record.lastExecution && <span>Last: {new Date(record.lastExecution).toLocaleDateString("pt-BR")}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!record.certified && ["beta","certified","production"].includes(record.state) && (
              <Btn small color="teal" onClick={() => onCertify(record.id)}><Award className="w-3 h-3" />Certify</Btn>
            )}
            <Btn small onClick={() => setOpen((v) => !v)}>
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </Btn>
          </div>
        </div>
        <MiniStepper current={record.state} />
      </div>

      {open && (
        <div className="border-t border-border/20 px-3 py-2 bg-muted/5">
          <div className="flex items-center gap-1 flex-wrap mb-2">
            <span className="text-[10px] text-muted-foreground mr-1">Transicionar para:</span>
            {["experimental","internal","beta","certified","production","enterprise","deprecated","disabled"].map((s) => (
              <Btn key={s} small color={s === "disabled" ? "red" : s === "deprecated" ? "amber" : "zinc"}
                onClick={() => onTransition(record.id, s)}>
                {STATE_CONFIG[s]?.icon} {s}
              </Btn>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <p>Scopes: {record.requiredScopes.join(", ") || "—"}</p>
            <p>Deps: {record.dependencies.join(", ") || "—"}</p>
            <p>Last cert: {record.lastCertification ? new Date(record.lastCertification).toLocaleString("pt-BR") : "—"}</p>
            {policy && <p className={policy.blocked ? "text-red-400" : policy.warning ? "text-amber-400" : "text-emerald-400"}>Policy: {policy.reason}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Capabilities() {
  const [records,   setRecords]   = useState([]);
  const [metricsMap,setMetrics]   = useState({});
  const [policyMap, setPolicies]  = useState({});
  const [lifecycle, setLifecycle] = useState(null);
  const [log,       setLog]       = useState([]);
  const [filter,    setFilter]    = useState("all");

  const load = useCallback(async (lc) => {
    const recs = lc.list();
    setRecords(recs);
    const { evaluatePolicy } = await import("@/lib/capability-lifecycle/CapabilityPolicies");
    const mm = {}, pm = {};
    recs.forEach((r) => {
      mm[r.id] = lc.metrics(r.id);
      pm[r.id] = evaluatePolicy(r, "prod");
    });
    setMetrics(mm);
    setPolicies(pm);
  }, []);

  useEffect(() => {
    (async () => {
      const { capLifecycle } = await import("@/lib/capability-lifecycle/CapabilityLifecycle");
      setLifecycle(capLifecycle);
      await load(capLifecycle);
    })();
  }, []);

  const addLog = (msg) => setLog((l) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...l.slice(0, 29)]);

  const handleTransition = useCallback(async (id, next) => {
    if (!lifecycle) return;
    const r = lifecycle.transition(id, next);
    addLog(`${id}: ${r.ok ? "OK" : "ERRO"} → ${next}${r.ok ? "" : ` (${r.reason})`}`);
    await load(lifecycle);
  }, [lifecycle, load]);

  const handleCertify = useCallback(async (id) => {
    if (!lifecycle) return;
    lifecycle.certify(id);
    addLog(`Certificado: ${id}`);
    await load(lifecycle);
  }, [lifecycle, load]);

  const handleSimExec = useCallback(async (id) => {
    if (!lifecycle) return;
    await lifecycle.execute(id, "developer", async () => ({ success: true, ok: true, error: null }), "prod");
    addLog(`Exec simulada: ${id}`);
    await load(lifecycle);
  }, [lifecycle, load]);

  const grouped = records.reduce((acc, r) => {
    (acc[r.serviceId] ??= []).push(r);
    return acc;
  }, {});

  const filtered = filter === "all" ? records
    : filter === "blocked" ? records.filter((r) => policyMap[r.id]?.blocked)
    : records.filter((r) => r.state === filter);

  const total    = records.length;
  const blocked  = records.filter((r) => policyMap[r.id]?.blocked).length;
  const certified = records.filter((r) => r.certified).length;
  const deprecated = records.filter((r) => r.state === "deprecated").length;

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-5xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Zap className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold">Capability Lifecycle</h1>
        <span className="text-xs font-mono text-muted-foreground border border-border px-2 py-0.5 rounded">Sprint 7.0.2</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Universal Capability Lifecycle — governanca completa do ciclo de vida de cada capability registrada.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ["Total",       total,      ""],
          ["Certificadas", certified, "teal"],
          ["Bloqueadas",   blocked,   "red"],
          ["Deprecated",   deprecated,"amber"],
        ].map(([l, v, c]) => (
          <div key={l} className={`p-3 rounded-xl border text-center ${c === "teal" ? "border-teal-500/30 bg-teal-500/5" : c === "red" ? "border-red-500/30 bg-red-500/5" : c === "amber" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/10"}`}>
            <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
            <p className={`text-2xl font-bold ${c === "teal" ? "text-teal-300" : c === "red" ? "text-red-300" : c === "amber" ? "text-amber-300" : ""}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* State machine reference */}
      <div className="p-3 rounded-xl border border-border bg-muted/5 mb-6">
        <p className="text-xs font-semibold mb-2 flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-violet-400" />Maquina de Estados</p>
        <div className="flex items-center gap-1 flex-wrap text-[10px]">
          {STATE_FLOW.map((s, i) => {
            const cfg = STATE_CONFIG[s];
            return (
              <span key={s} className="flex items-center gap-1">
                <span className={`px-1.5 py-0.5 rounded border ${COLOR_MAP[cfg.color]}`}>{cfg.icon} {cfg.label}</span>
                {i < STATE_FLOW.length - 1 && <span className="text-muted-foreground">→</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* Policy rules */}
      <div className="p-3 rounded-xl border border-border bg-muted/5 mb-6">
        <p className="text-xs font-semibold mb-2 flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-amber-400" />Regras de Policy (Quality Gate)</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] text-muted-foreground">
          <span><XCircle className="w-2.5 h-2.5 inline text-red-400 mr-1" />disabled → bloqueado</span>
          <span><XCircle className="w-2.5 h-2.5 inline text-red-400 mr-1" />draft → bloqueado</span>
          <span><XCircle className="w-2.5 h-2.5 inline text-purple-400 mr-1" />experimental → somente dev</span>
          <span><AlertTriangle className="w-2.5 h-2.5 inline text-amber-400 mr-1" />deprecated → permite + warning</span>
          <span><XCircle className="w-2.5 h-2.5 inline text-red-400 mr-1" />production sem cert → bloqueado</span>
          <span><CheckCircle className="w-2.5 h-2.5 inline text-emerald-400 mr-1" />certified production → permitido</span>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap text-xs">
        {["all","blocked","production","beta","certified","deprecated","disabled"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg border transition ${filter === f ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-border text-muted-foreground hover:border-border/80"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Capabilities */}
      <div className="space-y-3 mb-6">
        {filtered.map((r) => (
          <div key={r.id}>
            <CapabilityRow
              record={r}
              metrics={metricsMap[r.id]}
              policy={policyMap[r.id]}
              onTransition={handleTransition}
              onCertify={handleCertify}
            />
            <div className="flex justify-end mt-0.5">
              <button onClick={() => handleSimExec(r.id)}
                className="text-[10px] text-muted-foreground hover:text-violet-400 transition flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" />Simular execucao
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhuma capability encontrada.</p>
        )}
      </div>

      {/* Activity log */}
      {log.length > 0 && (
        <div className="p-3 rounded-xl border border-border bg-muted/5 mb-6 text-xs">
          <p className="font-semibold mb-2">Log de Atividade</p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto font-mono">
            {log.map((l, i) => <p key={i} className="text-muted-foreground">{l}</p>)}
          </div>
        </div>
      )}

      {/* Core invariance */}
      <div className="p-3 rounded-xl border border-border/30 bg-muted/5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-2">Zero alteracoes no Core</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {["Runtime","Planning","ConversationPipeline","GoalEngine","ConnectorRuntime","UniversalConnectorRouter","ConnectorRegistry"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1">
              <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />{f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}