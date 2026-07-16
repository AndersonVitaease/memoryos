/**
 * Phase700Page — Engineering Sprint 7.0
 * Google Workspace Connector Suite Foundation Dashboard
 * Rota: /phase700
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, Circle, Shield, Zap, Activity, Globe, Lock } from "lucide-react";

const SERVICE_META = {
  gmail:    { icon: "📧", label: "Gmail",           status: "active",   note: "Connector existente — reutiliza GWS Auth/Token/Error" },
  drive:    { icon: "📁", label: "Google Drive",    status: "stub",     note: "Capability stubs registrados" },
  calendar: { icon: "📅", label: "Google Calendar", status: "stub",     note: "Capability stubs registrados" },
  contacts: { icon: "👥", label: "Google Contacts", status: "stub",     note: "Capability stubs registrados" },
  docs:     { icon: "📄", label: "Google Docs",     status: "stub",     note: "Capability stubs registrados" },
  sheets:   { icon: "📊", label: "Google Sheets",   status: "stub",     note: "Capability stubs registrados" },
  tasks:    { icon: "✅", label: "Google Tasks",    status: "stub",     note: "Capability stubs registrados" },
  keep:     { icon: "🗒️", label: "Google Keep",     status: "planned",  note: "Sem scope publico disponivel ainda" },
};

const MODULE_DOCS = [
  { file: "GoogleWorkspaceTypes.ts",              resp: "Tipos compartilhados: GWSToken, GWSCapability, GWSError, GWSAuditEntry, GWSQuota" },
  { file: "GoogleWorkspaceScopes.ts",             resp: "Fonte unica de verdade para todos os OAuth scopes por servico" },
  { file: "GoogleWorkspaceAuth.ts",               resp: "OAuth orchestration: store/get/revoke token, authHeader, isAuthenticated" },
  { file: "GoogleWorkspaceTokenManager.ts",       resp: "Cache em memoria + refresh automatico via googleOAuthRefresh backend fn" },
  { file: "GoogleWorkspacePermissionValidator.ts",resp: "Valida scopes antes de toda execucao de capability" },
  { file: "GoogleWorkspaceErrorHandler.ts",       resp: "Normaliza erros HTTP 401/403/404/429/5xx em GWSError com retry guidance" },
  { file: "GoogleWorkspaceRateLimiter.ts",        resp: "Quota por servico (RPM/RPD) com sliding window e backoff" },
  { file: "GoogleWorkspaceAuditLogger.ts",        resp: "Log append-only de todas as chamadas API (persiste no localStorage)" },
  { file: "GoogleWorkspaceCapabilityRegistry.ts", resp: "Registro central de capabilities com stubs para todos os servicos" },
  { file: "GoogleWorkspaceConnector.ts",          resp: "Orquestrador: compoe todos os modulos em uma superficie de execucao" },
];

const ARCH_LAYERS = [
  { label: "GmailConnector (existente)", color: "blue",    note: "Reutiliza Auth/Token/Error via GWS modules" },
  { label: "GoogleWorkspaceConnector",   color: "violet",  note: "Orquestrador central — Sprint 7.0" },
  { label: "CapabilityRegistry",         color: "indigo",  note: "14 capabilities registradas (stubs + gmail ativo)" },
  { label: "Auth + TokenManager",        color: "emerald", note: "OAuth + cache + refresh" },
  { label: "PermissionValidator",        color: "emerald", note: "Scopes por servico" },
  { label: "ErrorHandler + RateLimiter", color: "amber",   note: "Retry + quota + backoff" },
  { label: "AuditLogger",               color: "zinc",    note: "Todas as chamadas registradas" },
  { label: "Core (INALTERADO)",         color: "red",     note: "Runtime · Pipeline · GoalEngine · Planning · Dispatchers" },
];

function Badge({ color, children }) {
  const c = {
    active:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    stub:    "bg-zinc-700/40 text-zinc-400 border-zinc-600",
    planned: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${c[color] ?? c.stub}`}>
      {children}
    </span>
  );
}

function LayerBar({ label, color, note }) {
  const c = {
    blue:    "bg-blue-500/15 border-blue-500/30 text-blue-300",
    violet:  "bg-violet-500/15 border-violet-500/30 text-violet-300",
    indigo:  "bg-indigo-500/15 border-indigo-500/30 text-indigo-300",
    emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    amber:   "bg-amber-500/15 border-amber-500/30 text-amber-300",
    zinc:    "bg-zinc-700/30 border-zinc-600 text-zinc-400",
    red:     "bg-red-500/10 border-red-500/20 text-red-400",
  };
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${c[color] ?? c.zinc}`}>
      <span className="text-xs font-mono font-semibold min-w-56">{label}</span>
      <span className="text-[11px] text-muted-foreground">{note}</span>
    </div>
  );
}

export default function Phase700Page() {
  const [capCount,    setCapCount]    = useState(null);
  const [auditStats,  setAuditStats]  = useState(null);
  const [quotaStatus, setQuotaStatus] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { GoogleWorkspaceConnector } = await import("@/lib/google-workspace/GoogleWorkspaceConnector");
        const h = GoogleWorkspaceConnector.health();
        setCapCount(h.capabilityCount);
        setAuditStats(h.auditStats);
        setQuotaStatus(h.rateLimits);
      } catch { /* non-blocking */ }
    })();
  }, []);

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Globe className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold">Google Workspace Connector Suite</h1>
        <span className="text-xs font-mono text-muted-foreground border border-border px-2 py-0.5 rounded">Sprint 7.0</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Fundacao oficial dos connectors Google Workspace — infraestrutura comum centralizada.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          ["Capabilities Registradas", capCount ?? "…", "Zap", "violet"],
          ["Servicos Cobertos",         8,               "Globe", "blue"],
          ["Modulos Criados",           10,              "Shield", "emerald"],
        ].map(([l, v, , color]) => (
          <div key={l} className={`p-3 rounded-xl border text-center ${color === "violet" ? "border-violet-500/30 bg-violet-500/5" : color === "blue" ? "border-blue-500/30 bg-blue-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
            <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
            <p className={`text-2xl font-bold ${color === "violet" ? "text-violet-300" : color === "blue" ? "text-blue-300" : "text-emerald-300"}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Architecture diagram */}
      <div className="p-4 rounded-xl border border-border bg-muted/5 mb-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-400" />
          Diagrama de Arquitetura — Sprint 7.0
        </h2>
        <div className="space-y-1.5">
          {ARCH_LAYERS.map((l) => <LayerBar key={l.label} {...l} />)}
        </div>
      </div>

      {/* Services */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          Servicos Google Workspace
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {Object.entries(SERVICE_META).map(([id, meta]) => (
            <div key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/40 bg-muted/5">
              <span className="text-xl">{meta.icon}</span>
              <div className="flex-1">
                <span className="text-sm font-medium">{meta.label}</span>
                <span className="text-[11px] text-muted-foreground ml-2">{meta.note}</span>
              </div>
              <Badge color={meta.status}>{meta.status === "active" ? "Ativo" : meta.status === "stub" ? "Stub" : "Planejado"}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Module docs */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          Modulos — Responsabilidades
        </h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Arquivo</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Responsabilidade (SRP)</th>
              </tr>
            </thead>
            <tbody>
              {MODULE_DOCS.map((m, i) => (
                <tr key={m.file} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                  <td className="px-3 py-2 font-mono text-violet-300 whitespace-nowrap">{m.file}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.resp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gmail integration */}
      <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 mb-6">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-blue-300">
          <CheckCircle className="w-4 h-4" />
          Integracao com o Gmail Connector (zero duplicacao)
        </h2>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• <span className="font-mono text-blue-200">GoogleWorkspaceAuth</span> → compativel com GoogleAuthSession (mesma estrutura de token)</p>
          <p>• <span className="font-mono text-blue-200">GoogleWorkspaceTokenManager</span> → reutiliza o backend fn <code>googleOAuthRefresh</code> existente</p>
          <p>• <span className="font-mono text-blue-200">GoogleWorkspaceErrorHandler</span> → GmailConnector pode delegar normalizacao de erros HTTP</p>
          <p>• <span className="font-mono text-blue-200">GoogleWorkspaceRateLimiter</span> → GmailConnector pode reportar quota ao limiter central</p>
          <p>• <span className="font-mono text-blue-200">GoogleWorkspaceAuditLogger</span> → audit centralizado para todas as chamadas Gmail</p>
          <p>• <span className="font-mono text-blue-200">GmailConnector</span> nao foi alterado — integracao e opcional e aditiva</p>
        </div>
      </div>

      {/* CCC integration */}
      <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 mb-6">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-yellow-300">
          <Shield className="w-4 h-4" />
          Compatibilidade com o Certification Framework (CCC)
        </h2>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Cada servico GWS sera registrado no <span className="font-mono text-yellow-200">certLifecycle</span> com seu prorio ConnectorId</p>
          <p>• Mudancas em qualquer modulo GWS disparam <span className="font-mono text-yellow-200">invalidate(trigger)</span> automaticamente</p>
          <p>• Quality Gate bloqueia promocao enquanto <code>certification_required</code> ou <code>certification_failed</code></p>
          <p>• AuditLogger alimenta as evidencias de certificacao (precision, recall, perf stats)</p>
        </div>
      </div>

      {/* Core invariance */}
      <div className="p-4 rounded-xl border border-border/30 bg-muted/5">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-red-400" />
          Confirmacao: Zero alteracoes no Core
        </h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          {["ConversationPipeline","ConversationManager","GoalEngine","PlanningEngine",
            "Runtime","ExecutionDispatcher","ExecutionPolicy","ExecutionContextFactory",
            "UniversalConnectorRouter","ConnectorRegistry","Certification Framework"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1">
              <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />{f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}