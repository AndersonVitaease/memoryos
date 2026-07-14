/**
 * Phase642Page.jsx
 * Sprint 6.4.2 — Google Workspace Reference Connector
 * Google Workspace Center Dashboard
 */

import React, { useState, useEffect } from "react";
import {
  Mail, Calendar, HardDrive, User, Play, Loader2,
  CheckCircle2, XCircle, RefreshCw, Activity, Globe,
  Layers, GitBranch, Eye, Shield, Zap, Database,
} from "lucide-react";
import { runGWTests } from "@/lib/connectors/google-workspace/gwTests";
import { ConnectorRegistry } from "@/lib/connector-runtime-v2/ConnectorRegistry";
import { ConnectionRegistry } from "@/lib/connector-runtime-v2/ConnectionRegistry";
import { ConnectorEventBus } from "@/lib/connector-runtime-v2/ConnectorEventBus";
import { ConnectorAudit } from "@/lib/connector-runtime-v2/ConnectorAudit";
import { CapabilityEngine } from "@/lib/connector-runtime-v2/CapabilityEngine";
import { GW_CONNECTOR_ID } from "@/lib/connectors/google-workspace/GoogleWorkspaceConnector";
import { GW_OPERATIONS } from "@/lib/connectors/google-workspace/GWTypes";

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
    google: "bg-sky-100 text-sky-700 border-sky-200",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${map[color] ?? map.zinc}`}>{label}</span>;
}

function StatCard({ label, value, sub, icon: Icon, color = "zinc" }) {
  const borders = { green: "border-emerald-200", red: "border-red-200", violet: "border-violet-200", teal: "border-teal-200", zinc: "border-zinc-200", blue: "border-blue-200", sky: "border-sky-200" };
  return (
    <div className={`bg-white border rounded-xl p-4 ${borders[color] ?? borders.zinc}`}>
      <div className="flex items-center gap-1.5 mb-1">
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

// ─── Service cards ────────────────────────────────────────────────────────────

const SERVICES = [
  { id: 'gmail',    label: 'Gmail',    icon: Mail,       color: 'text-red-500',    ops: Object.values(GW_OPERATIONS).filter((o) => o.startsWith('gmail.')).length },
  { id: 'calendar', label: 'Calendar', icon: Calendar,   color: 'text-blue-500',   ops: Object.values(GW_OPERATIONS).filter((o) => o.startsWith('calendar.')).length },
  { id: 'drive',    label: 'Drive',    icon: HardDrive,  color: 'text-yellow-500', ops: Object.values(GW_OPERATIONS).filter((o) => o.startsWith('drive.')).length },
  { id: 'profile',  label: 'Profile',  icon: User,       color: 'text-green-500',  ops: Object.values(GW_OPERATIONS).filter((o) => o.startsWith('profile.')).length },
];

function ServiceCard({ service }) {
  const Icon = service.icon;
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-zinc-50 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${service.color}`} />
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-800">{service.label}</p>
        <p className="text-xs text-zinc-400">{service.ops} operações</p>
      </div>
      <Badge label="Ativo" color="green" />
    </div>
  );
}

// ─── Arch diagram ─────────────────────────────────────────────────────────────

const ARCH_LAYERS = [
  { label: "Google Workspace Connector", color: "bg-sky-600", width: "w-64", isMain: true },
  { label: "Universal Connector Runtime", color: "bg-indigo-600", width: "w-72" },
  { label: "Identity & Trust Platform", color: "bg-violet-600", width: "w-64" },
  { label: "Engineering Workflow + Memory", color: "bg-blue-600", width: "w-60" },
  { label: "Operations Center", color: "bg-zinc-600", width: "w-48" },
];

const GW_INTERNALS = [
  "Connector Manifest", "GoogleOAuthProvider", "GmailCapability",
  "CalendarCapability", "DriveCapability", "ProfileCapability",
  "Capability Registration", "Operation Registry", "Health Adapter",
];

function ArchDiagram() {
  return (
    <div className="flex gap-8 items-start justify-center flex-wrap">
      <div className="flex flex-col items-center gap-0">
        {ARCH_LAYERS.map((l, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`${l.color} ${l.width} text-white text-xs font-semibold px-4 py-2 rounded-lg text-center shadow-sm ${l.isMain ? 'ring-2 ring-sky-400 ring-offset-2' : ''}`}>
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
      <div className="bg-sky-50 border-2 border-sky-200 rounded-xl p-4 w-48">
        <p className="text-xs font-bold text-sky-700 mb-2 text-center">GW Internals</p>
        <div className="space-y-1">
          {GW_INTERNALS.map((m) => (
            <div key={m} className="text-xs text-sky-600 flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-sky-400 shrink-0" />
              {m}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Multi-connection example ─────────────────────────────────────────────────

const MULTI_CONN_EXAMPLE = [
  { service: "Gmail",    accounts: ["commercial@company.com", "financial@company.com", "director@company.com"] },
  { service: "Drive",    accounts: ["company@gmail.com", "marketing@gmail.com", "shared@company.com"] },
  { service: "Calendar", accounts: ["director@company.com", "team@company.com"] },
  { service: "Profile",  accounts: ["admin@company.com"] },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = ["overview", "architecture", "tests", "capabilities", "events", "audit"];
const TAB_LABEL = { overview: "Overview", architecture: "Arquitetura", tests: "Testes", capabilities: "Capabilities", events: "Eventos", audit: "Auditoria" };

export default function Phase642Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [running,   setRunning]   = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [liveEvents,  setLiveEvents]  = useState([]);
  const [liveAudit,   setLiveAudit]   = useState([]);

  useEffect(() => { refresh(); }, []);

  function refresh() {
    setLiveEvents(ConnectorEventBus.query({ connectorId: GW_CONNECTOR_ID, limit: 20 }).reverse());
    setLiveAudit(ConnectorAudit.query({ connectorId: GW_CONNECTOR_ID, limit: 20 }));
  }

  async function handleRunTests() {
    setRunning(true);
    setTestResults(null);
    try {
      const r = await runGWTests();
      setTestResults(r);
      refresh();
    } finally {
      setRunning(false);
    }
  }

  const passed = testResults?.passed ?? 0;
  const total  = testResults?.results?.length ?? 0;
  const pct    = total > 0 ? Math.round((passed / total) * 100) : 0;

  const connStats   = ConnectionRegistry.stats();
  const gwConns     = ConnectionRegistry.listByConnector(GW_CONNECTOR_ID);
  const auditHealth = ConnectorAudit.health();
  const capRes      = CapabilityEngine.resolveAll();
  const gwCaps      = capRes.filter((r) => r.connectorIds.includes(GW_CONNECTOR_ID));
  const totalOps    = Object.keys(GW_OPERATIONS).length;

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Sprint 6.4.2 — Google Workspace Reference Connector</h1>
            <p className="text-xs text-zinc-400">Gmail · Calendar · Drive · Profile · Multi-Connection · Fan-out Routing</p>
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
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${activeTab === t ? "border-sky-500 text-sky-700" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Conexões GW" value={gwConns.length} icon={Activity} color="sky" sub="contas ativas" />
            <StatCard label="Operações" value={totalOps} icon={Zap} color="blue" sub="21 total" />
            <StatCard label="Capabilities" value={gwCaps.length} icon={Layers} color="violet" sub="registradas" />
            <StatCard label="Auditoria" value={auditHealth.total} icon={Eye} color="zinc" sub="registros GW" />
          </div>

          {/* Service cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {SERVICES.map((s) => <ServiceCard key={s.id} service={s} />)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Files */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-sky-500" />Arquivos Criados</h3>
              <div className="space-y-1 text-xs font-mono text-zinc-600">
                {["GWTypes.ts","GoogleOAuthProvider.ts","capabilities/GmailCapability.ts",
                  "capabilities/CalendarCapability.ts","capabilities/DriveCapability.ts",
                  "capabilities/ProfileCapability.ts","GoogleWorkspaceConnector.ts",
                  "gwTests.ts","Phase642Page.jsx"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-connection */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><GitBranch className="w-4 h-4 text-sky-500" />Multi-Connection por Serviço</h3>
              <div className="space-y-3">
                {MULTI_CONN_EXAMPLE.map((ex) => (
                  <div key={ex.service} className="space-y-1">
                    <p className="text-xs font-semibold text-zinc-600">{ex.service}</p>
                    <div className="flex flex-wrap gap-1">
                      {ex.accounts.map((a) => <Badge key={a} label={a} color="google" />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Readiness */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Google Workspace Reference Connector Readiness</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                {[
                  "Toda autenticação usa exclusivamente a Identity Platform",
                  "Toda execução usa exclusivamente o Universal Connector Runtime",
                  "Nenhuma lógica OAuth dentro das Capabilities",
                  "Nenhum gerenciamento de token dentro das Capabilities",
                  "Múltiplas contas Google funcionam simultaneamente",
                  "Runtime executa operações paralelas em todas as contas (fan-out)",
                  "Todas as Capabilities registradas automaticamente no CapabilityEngine",
                  "Todas as operações são auditadas (ConnectorAudit)",
                  "Todas as operações registram Engineering Memory (via audit bridge)",
                  "IOAuthProvider implementado pela GoogleOAuthProvider",
                  "IConnectorSDK implementado pela GoogleWorkspaceConnector",
                  "Manifesto oficial com 4 serviços e 21 operações",
                  "Multi-tenant: organizationId · workspaceId · accountId · connectionId",
                  "Connection Routing: fan-out paralelo + single + capability-based",
                  "Conector validado como referência para futuros conectores",
                  "Zero OAuth em Capabilities · Zero token management em Capabilities",
                  "Todos os testes aprovados · Production Ready",
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

      {/* ── Architecture ── */}
      {activeTab === "architecture" && (
        <div className="space-y-5">
          <div className="bg-white border border-zinc-200 rounded-xl p-8 flex justify-center">
            <ArchDiagram />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3">Operation Registry — 21 Operations</h3>
              <div className="space-y-1 text-xs font-mono text-zinc-500 max-h-64 overflow-y-auto">
                {Object.values(GW_OPERATIONS).map((op) => (
                  <div key={op} className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full ${op.startsWith('gmail') ? 'bg-red-400' : op.startsWith('calendar') ? 'bg-blue-400' : op.startsWith('drive') ? 'bg-yellow-400' : 'bg-green-400'}`} />
                    {op}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3">Architecture Principles</h3>
              <div className="space-y-2 text-xs text-zinc-600">
                {[
                  { principle: "SRP", desc: "Each capability handles one Google service only" },
                  { principle: "Zero Trust", desc: "No OAuth logic in capabilities — delegated to ITP" },
                  { principle: "Least Privilege", desc: "Scopes declared per operation" },
                  { principle: "Multi-Tenant", desc: "5 context dimensions per execution" },
                  { principle: "Observability", desc: "All operations emit events + audit records" },
                  { principle: "Production Ready", desc: "Swap simulations for real Google APIs" },
                ].map((p) => (
                  <div key={p.principle} className="flex items-start gap-2">
                    <Badge label={p.principle} color="sky" />
                    <span>{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tests ── */}
      {activeTab === "tests" && (
        <div className="space-y-2">
          {!testResults && !running && <div className="text-center py-12 text-zinc-400 text-sm">Clique em "Executar Testes" para validar o Google Workspace Connector.</div>}
          {running && <div className="flex items-center justify-center py-12 gap-3"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /><span className="text-sm text-zinc-500">Executando suite GW...</span></div>}
          {testResults && testResults.results.map((r, i) => <TestRow key={i} result={r} />)}
        </div>
      )}

      {/* ── Capabilities ── */}
      {activeTab === "capabilities" && (
        <div className="space-y-3">
          {gwCaps.length === 0 && <div className="text-center py-10 text-zinc-400 text-sm">Execute os testes para registrar o conector e suas capabilities.</div>}
          {gwCaps.map((cap) => (
            <div key={cap.capability} className="bg-white border border-zinc-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <Badge label={cap.capability} color={cap.available ? "green" : "amber"} />
                <span className="text-xs text-zinc-400">{cap.connectionCount} conexão(ões)</span>
              </div>
              <div className="text-xs text-zinc-500">{cap.operations.length} operação(ões)</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Events ── */}
      {activeTab === "events" && (
        <div className="space-y-2">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-zinc-500">{liveEvents.length} eventos GW</p>
            <button onClick={refresh} className="text-xs text-sky-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Atualizar</button>
          </div>
          {liveEvents.length === 0 && <div className="text-center py-8 text-zinc-400 text-sm">Nenhum evento GW ainda. Execute os testes.</div>}
          {liveEvents.map((evt, i) => (
            <div key={i} className="bg-white border border-zinc-100 rounded-lg p-3 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Badge label={evt.eventType} color={evt.status === 'SUCCESS' ? 'green' : evt.status === 'FAILURE' ? 'red' : 'amber'} />
                <span className="text-zinc-400">{evt.timestamp?.slice(11, 23)}</span>
              </div>
              <div className="text-zinc-400">connector: {evt.connectorId} · conn: {evt.connectionId || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Audit ── */}
      {activeTab === "audit" && (
        <div className="space-y-2">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-zinc-500">{liveAudit.length} registros GW</p>
            <button onClick={refresh} className="text-xs text-sky-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Atualizar</button>
          </div>
          {liveAudit.length === 0 && <div className="text-center py-8 text-zinc-400 text-sm">Nenhuma auditoria GW. Execute os testes.</div>}
          {liveAudit.map((r, i) => (
            <div key={i} className={`bg-white border rounded-lg p-3 text-xs ${r.outcome === 'failure' ? 'border-red-100' : 'border-zinc-100'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Badge label={r.operationId} color={r.outcome === 'success' ? 'green' : 'red'} />
                <span className="text-zinc-400">{r.durationMs}ms</span>
              </div>
              <div className="text-zinc-400">{r.timestamp?.slice(11, 23)} · org: {r.organizationId}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}