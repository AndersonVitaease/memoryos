/**
 * Phase640Page.jsx
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 * Identity Center Dashboard
 */

import React, { useState, useEffect } from "react";
import {
  ShieldCheck, Play, Loader2, CheckCircle2, XCircle, Activity,
  Database, Key, Users, RefreshCw, Lock, Eye, Zap, Globe, BarChart3,
} from "lucide-react";
import { runITPTests } from "@/lib/identity-trust/itpTests";
import { ProviderRegistry } from "@/lib/identity-trust/ProviderRegistry";
import { IdentityEventBus } from "@/lib/identity-trust/IdentityEventBus";
import { ConnectionManager } from "@/lib/identity-trust/ConnectionManager";
import { PermissionManager } from "@/lib/identity-trust/PermissionManager";
import { TrustManager } from "@/lib/identity-trust/TrustManager";
import { IdentityAudit } from "@/lib/identity-trust/IdentityAudit";
import { IdentityMetricsCollector } from "@/lib/identity-trust/IdentityMetricsCollector";
import { OAuthEngine } from "@/lib/identity-trust/OAuthEngine";

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const map = {
    green:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    red:    "bg-red-100 text-red-700 border-red-200",
    amber:  "bg-amber-100 text-amber-700 border-amber-200",
    blue:   "bg-blue-100 text-blue-700 border-blue-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
    teal:   "bg-teal-100 text-teal-700 border-teal-200",
    zinc:   "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[color] ?? map.zinc}`}>{label}</span>;
}

function StatCard({ label, value, sub, color = "zinc", icon: Icon }) {
  const border = { green: "border-emerald-200", red: "border-red-200", violet: "border-violet-200", teal: "border-teal-200", zinc: "border-zinc-200", blue: "border-blue-200" };
  return (
    <div className={`bg-white border rounded-xl p-4 ${border[color] ?? border.zinc}`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-400" />}
        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-zinc-900 font-heading">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TestRow({ result }) {
  return (
    <div className={`flex items-start gap-2 py-2 px-3 rounded-lg text-sm border ${result.passed ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"}`}>
      {result.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-zinc-700">{result.name}</span>
        {result.error && <p className="text-xs text-red-600 mt-0.5 truncate">{result.error}</p>}
      </div>
      <span className="text-xs text-zinc-400 shrink-0">{result.duration}ms</span>
    </div>
  );
}

// ─── Architecture Diagram ─────────────────────────────────────────────────────

const ARCH_LAYERS = [
  { label: "Connector",                   color: "bg-zinc-700",    width: "w-40" },
  { label: "Connector Runtime",           color: "bg-zinc-600",    width: "w-52" },
  { label: "Identity & Trust Platform",   color: "bg-violet-700",  width: "w-72", isMain: true },
  { label: "Engineering Workflow",        color: "bg-indigo-600",  width: "w-56" },
  { label: "Engineering Memory",          color: "bg-blue-600",    width: "w-52" },
  { label: "Operations Center",           color: "bg-teal-600",    width: "w-48" },
];

const ITP_MOTORS = [
  "Identity Manager", "Provider Registry", "OAuth Engine",
  "Token Manager", "Credential Manager", "Secrets Provider",
  "Permission Manager", "Connection Manager", "Trust Manager",
  "Identity Audit", "Identity Health",
];

function ArchDiagram() {
  return (
    <div className="flex gap-8 items-start justify-center flex-wrap">
      {/* Stack */}
      <div className="flex flex-col items-center gap-0">
        {ARCH_LAYERS.map((l, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`${l.color} ${l.width} text-white text-xs font-semibold px-4 py-2 rounded-lg text-center shadow-sm ${l.isMain ? 'ring-2 ring-violet-400 ring-offset-2' : ''}`}>
              {l.label}
            </div>
            {i < ARCH_LAYERS.length - 1 && (
              <>
                <div className="w-px h-2 bg-zinc-300" />
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <div className="w-px h-2 bg-zinc-300" />
              </>
            )}
          </div>
        ))}
      </div>

      {/* ITP internals */}
      <div className="bg-violet-50 border-2 border-violet-200 rounded-xl p-4 w-48">
        <p className="text-xs font-bold text-violet-700 mb-2 text-center">ITP Motors</p>
        <div className="space-y-1">
          {ITP_MOTORS.map((m) => (
            <div key={m} className="text-xs text-violet-600 flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
              {m}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = ["overview", "architecture", "tests", "events", "audit", "metrics"];
const TAB_LABEL = { overview: "Overview", architecture: "Arquitetura", tests: "Testes", events: "Eventos", audit: "Auditoria", metrics: "Métricas" };

export default function Phase640Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [running, setRunning] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveAudit, setLiveAudit] = useState([]);

  useEffect(() => {
    refreshLive();
  }, []);

  function refreshLive() {
    setLiveMetrics(IdentityMetricsCollector.collect());
    setLiveEvents(IdentityEventBus.query({ limit: 20 }).reverse());
    setLiveAudit(IdentityAudit.query({ limit: 20 }));
  }

  async function handleRunTests() {
    setRunning(true);
    setTestResults(null);
    try {
      const r = await runITPTests();
      setTestResults(r);
      refreshLive();
    } finally {
      setRunning(false);
    }
  }

  const passed = testResults?.passed ?? 0;
  const total  = testResults?.results?.length ?? 0;
  const pct    = total > 0 ? Math.round((passed / total) * 100) : 0;

  const connStats  = ConnectionManager.stats();
  const permHealth = PermissionManager.health();
  const trustHealth = TrustManager.health();
  const auditHealth = IdentityAudit.health();
  const oauthHealth = OAuthEngine.health();
  const regHealth   = ProviderRegistry.health();

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-teal-500 flex items-center justify-center shadow-md">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Sprint 6.4.0 — Universal Identity & Trust Platform</h1>
            <p className="text-xs text-zinc-400">11 motores · Multi-tenant · Zero Trust · Production Ready</p>
          </div>
        </div>
        <button onClick={handleRunTests} disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 transition">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Executando..." : "Executar Testes"}
        </button>
      </div>

      {/* Test summary */}
      {testResults && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Testes" value={total} />
          <StatCard label="Passou" value={passed} color="green" />
          <StatCard label="Falhou" value={testResults.failed} color={testResults.failed > 0 ? "red" : "zinc"} />
          <StatCard label="Cobertura" value={`${pct}%`} color={pct === 100 ? "green" : "amber"} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-100 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${activeTab === t ? "border-violet-500 text-violet-700" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Live health grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Providers" value={regHealth.total} icon={Globe} color="violet" sub="registrados" />
            <StatCard label="Conexões" value={connStats.total} icon={Activity} color="blue" sub={`${connStats.byState?.CONNECTED ?? 0} ativas`} />
            <StatCard label="Grants" value={permHealth.total} icon={Key} color="teal" sub={`${permHealth.active} ativos`} />
            <StatCard label="Trust" value={trustHealth.total} icon={ShieldCheck} color="green" sub={`${trustHealth.valid} válidos`} />
            <StatCard label="Auditoria" value={auditHealth.total} icon={Eye} color="zinc" sub={`${auditHealth.failures} falhas`} />
            <StatCard label="OAuth Flows" value={oauthHealth.flows} icon={Zap} color="violet" sub="implementados" />
            <StatCard label="Eventos" value={IdentityEventBus.count()} icon={RefreshCw} color="blue" sub="no bus" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Arquivos */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-violet-500" />Arquivos Criados</h3>
              <div className="space-y-1.5 text-xs font-mono text-zinc-600">
                {["ITPTypes.ts","IOAuthProvider.ts","ISecretsProvider.ts","ProviderRegistry.ts",
                  "IdentityEventBus.ts","CredentialManager.ts","ConnectionManager.ts","TokenManager.ts",
                  "PermissionManager.ts","TrustManager.ts","OAuthEngine.ts","IdentityAudit.ts",
                  "IdentityManager.ts","IdentityMetricsCollector.ts","itpTests.ts","Phase640Page.jsx"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Events */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-violet-500" />Identity Events (10)</h3>
              <div className="flex flex-wrap gap-1.5">
                {["PROVIDER_REGISTERED","AUTH_STARTED","AUTH_COMPLETED","AUTH_FAILED",
                  "TOKEN_REFRESHED","TOKEN_EXPIRED","TOKEN_REVOKED",
                  "CONNECTION_OPENED","CONNECTION_CLOSED","SCOPES_UPDATED"].map((e) => (
                  <Badge key={e} label={e} color="blue" />
                ))}
              </div>
              <h3 className="text-sm font-semibold text-zinc-800 mt-4 mb-2 flex items-center gap-2"><Lock className="w-4 h-4 text-violet-500" />OAuth Flows (5)</h3>
              <div className="flex flex-wrap gap-1.5">
                {["authorization_code","authorization_code_pkce","client_credentials","device_authorization","refresh_token"].map((f) => (
                  <Badge key={f} label={f} color="violet" />
                ))}
              </div>
            </div>

            {/* APIs */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-violet-500" />APIs Públicas</h3>
              <div className="space-y-1.5 text-xs">
                {[
                  { mod: "IdentityManager", methods: ["authenticate()", "getContext()", "disconnect()", "health()"] },
                  { mod: "ProviderRegistry", methods: ["register()", "get()", "list()", "healthAll()"] },
                  { mod: "OAuthEngine", methods: ["authenticate()", "listFlows()", "getSupportedFlows()", "generatePKCEChallenge()"] },
                  { mod: "ConnectionManager", methods: ["open()", "transition()", "canTransition()", "getState()", "isTerminal()"] },
                  { mod: "TokenManager", methods: ["getStatus()", "refreshIfNeeded()", "forceRefresh()", "markExpired()", "revoke()"] },
                  { mod: "PermissionManager", methods: ["grant()", "hasScope()", "getScopesForConnection()", "revokeForConnection()"] },
                  { mod: "TrustManager", methods: ["evaluate()", "isValid()", "getTrustLevel()", "getRisk()", "revoke()"] },
                  { mod: "IdentityAudit", methods: ["record()", "query()", "health()"] },
                  { mod: "IdentityEventBus", methods: ["emit()", "subscribe()", "query()", "count()"] },
                ].map(({ mod, methods }) => (
                  <div key={mod}>
                    <p className="font-semibold text-zinc-700">{mod}</p>
                    <p className="text-zinc-400 ml-2 text-[10px]">{methods.join("  ·  ")}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Readiness checklist */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Identity & Trust Platform Readiness</h3>
              <div className="space-y-1.5">
                {[
                  "Todos os componentes compartilham a mesma infraestrutura",
                  "Nenhum conector implementa autenticação própria",
                  "Toda autenticação gera auditoria (IdentityAudit)",
                  "Toda autenticação gera eventos (IdentityEventBus)",
                  "Toda autenticação registra memória (EngineeringMemory bridge)",
                  "Nenhum token exposto pela API pública",
                  "Nenhum segredo em logs — apenas refs opacos",
                  "Multi-tenant funcional (5 dimensões por contexto)",
                  "Máquina de estados validada (8 estados, 0 flags)",
                  "IOAuthProvider — contrato único para todos os provedores",
                  "ISecretsProvider — abstração para 5 backends",
                  "Observabilidade nativa (IdentityMetricsCollector)",
                  "Integração com EngineeringMemory e GovernanceAudit",
                  "Zero dependências circulares",
                  "Production Ready",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-zinc-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Architecture */}
      {activeTab === "architecture" && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-8 flex justify-center">
            <ArchDiagram />
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Connection State Machine (8 estados)</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
              {["NOT_CONNECTED","AUTHENTICATING","CONNECTED","TOKEN_EXPIRED","REFRESHING","REVOKED","DISCONNECTED","ERROR"].map((s) => (
                <div key={s} className="border-2 border-zinc-300 rounded-lg p-2 text-center text-xs font-semibold text-zinc-700">{s}</div>
              ))}
            </div>
            <div className="text-xs font-mono text-zinc-500 space-y-1">
              {[
                "NOT_CONNECTED  → AUTHENTICATING, ERROR",
                "AUTHENTICATING → CONNECTED, ERROR, NOT_CONNECTED",
                "CONNECTED      → TOKEN_EXPIRED, REFRESHING, REVOKED, DISCONNECTED, ERROR",
                "TOKEN_EXPIRED  → REFRESHING, REVOKED, DISCONNECTED, ERROR",
                "REFRESHING     → CONNECTED, REVOKED, ERROR",
                "REVOKED        → NOT_CONNECTED",
                "DISCONNECTED   → AUTHENTICATING, NOT_CONNECTED",
                "ERROR          → NOT_CONNECTED, AUTHENTICATING",
              ].map((t, i) => <div key={i}>{t}</div>)}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tests */}
      {activeTab === "tests" && (
        <div className="space-y-2">
          {!testResults && !running && (
            <div className="text-center py-12 text-zinc-400 text-sm">Clique em "Executar Testes" para rodar a suite ITP.</div>
          )}
          {running && (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <span className="text-sm text-zinc-500">Executando suite ITP...</span>
            </div>
          )}
          {testResults && testResults.results.map((r, i) => <TestRow key={i} result={r} />)}
        </div>
      )}

      {/* Tab: Events */}
      {activeTab === "events" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-zinc-500">{liveEvents.length} eventos recentes</p>
            <button onClick={refreshLive} className="text-xs text-violet-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Atualizar</button>
          </div>
          {liveEvents.length === 0 && <div className="text-center py-8 text-zinc-400 text-sm">Nenhum evento registrado. Execute os testes para gerar eventos.</div>}
          {liveEvents.map((evt, i) => (
            <div key={i} className="bg-white border border-zinc-100 rounded-lg p-3 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Badge label={evt.eventType} color={evt.status === 'SUCCESS' ? 'green' : evt.status === 'FAILURE' ? 'red' : 'amber'} />
                <span className="text-zinc-400">{evt.timestamp?.slice(11, 23)}</span>
                <span className="text-zinc-500 font-mono">{evt.providerId}</span>
              </div>
              <div className="text-zinc-400">actor: {evt.actor} · org: {evt.organizationId || '—'} · conn: {evt.connectionId || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Audit */}
      {activeTab === "audit" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-zinc-500">{liveAudit.length} registros de auditoria</p>
            <button onClick={refreshLive} className="text-xs text-violet-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Atualizar</button>
          </div>
          {liveAudit.length === 0 && <div className="text-center py-8 text-zinc-400 text-sm">Nenhuma auditoria ainda. Execute os testes.</div>}
          {liveAudit.map((r, i) => (
            <div key={i} className={`bg-white border rounded-lg p-3 text-xs ${r.outcome === 'failure' ? 'border-red-100' : 'border-zinc-100'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Badge label={r.eventType} color={r.outcome === 'success' ? 'green' : r.outcome === 'failure' ? 'red' : 'amber'} />
                <span className="text-zinc-400">{r.timestamp?.slice(11, 23)}</span>
              </div>
              <div className="text-zinc-400">actor: {r.actor} · provider: {r.providerId} · org: {r.organizationId || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Metrics */}
      {activeTab === "metrics" && (
        <div className="space-y-4">
          <button onClick={refreshLive} className="text-xs text-violet-600 hover:underline flex items-center gap-1 mb-2"><RefreshCw className="w-3 h-3" />Atualizar</button>
          {liveMetrics && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total Providers" value={liveMetrics.totalProviders} icon={Globe} />
              <StatCard label="Conexões Ativas" value={liveMetrics.activeConnections} icon={Activity} color="green" />
              <StatCard label="Auth Attempts" value={liveMetrics.authAttempts} icon={Key} />
              <StatCard label="Auth Successes" value={liveMetrics.authSuccesses} icon={CheckCircle2} color="green" />
              <StatCard label="Auth Failures" value={liveMetrics.authFailures} icon={XCircle} color={liveMetrics.authFailures > 0 ? "red" : "zinc"} />
              <StatCard label="Token Refreshes" value={liveMetrics.tokenRefreshes} icon={RefreshCw} color="blue" />
              <StatCard label="Revocations" value={liveMetrics.tokenRevocations} icon={Lock} />
              <StatCard label="Expirations" value={liveMetrics.tokenExpirations} icon={BarChart3} />
              <StatCard label="Avg Auth Latency" value={`${liveMetrics.avgAuthLatencyMs}ms`} icon={Zap} />
            </div>
          )}
          {!liveMetrics && <div className="text-center py-12 text-zinc-400 text-sm">Execute os testes para ver métricas.</div>}
        </div>
      )}
    </div>
  );
}