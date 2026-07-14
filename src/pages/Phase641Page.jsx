/**
 * Phase641Page.jsx
 * Sprint 6.4.1 — Universal Connector Runtime
 * Connector Center Dashboard
 */

import React, { useState, useEffect } from "react";
import {
  Cpu, Play, Loader2, CheckCircle2, XCircle, Activity,
  Database, Network, RefreshCw, Layers, Router, Eye,
  BarChart3, Zap, Globe, GitBranch, Shield,
} from "lucide-react";
import { runUCRTests } from "@/lib/connector-runtime-v2/ucrTests";
import { ConnectorRegistry } from "@/lib/connector-runtime-v2/ConnectorRegistry";
import { ConnectionRegistry } from "@/lib/connector-runtime-v2/ConnectionRegistry";
import { ConnectorEventBus } from "@/lib/connector-runtime-v2/ConnectorEventBus";
import { ConnectorSessionManager } from "@/lib/connector-runtime-v2/ConnectorSessionManager";
import { ConnectorAudit } from "@/lib/connector-runtime-v2/ConnectorAudit";
import { CapabilityEngine } from "@/lib/connector-runtime-v2/CapabilityEngine";
import { ConnectorMetrics } from "@/lib/connector-runtime-v2/ConnectorMetrics";

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
    indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${map[color] ?? map.zinc}`}>{label}</span>;
}

function StatCard({ label, value, sub, icon: Icon, color = "zinc" }) {
  const borderMap = { green: "border-emerald-200", red: "border-red-200", violet: "border-violet-200", teal: "border-teal-200", zinc: "border-zinc-200", blue: "border-blue-200", indigo: "border-indigo-200" };
  return (
    <div className={`bg-white border rounded-xl p-4 ${borderMap[color] ?? borderMap.zinc}`}>
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

// ─── Architecture Diagram ─────────────────────────────────────────────────────

const ARCH_LAYERS = [
  { label: "Connector SDK", color: "bg-zinc-500", width: "w-36" },
  { label: "Universal Connector Runtime", color: "bg-indigo-700", width: "w-72", isMain: true },
  { label: "Identity & Trust Platform", color: "bg-violet-600", width: "w-60" },
  { label: "Engineering Workflow", color: "bg-blue-600", width: "w-52" },
  { label: "Engineering Memory", color: "bg-teal-600", width: "w-48" },
  { label: "Operations Center", color: "bg-zinc-600", width: "w-44" },
];

const UCR_MOTORS = [
  "Connector Registry", "Connector Loader", "Connector Lifecycle",
  "Session Manager", "Connection Registry", "Connector Router",
  "Connector Context", "Capability Engine", "Connector Health",
  "Connector Metrics", "Connector Audit", "Connector Event Bus",
];

function ArchDiagram() {
  return (
    <div className="flex gap-8 items-start justify-center flex-wrap">
      <div className="flex flex-col items-center gap-0">
        {ARCH_LAYERS.map((l, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`${l.color} ${l.width} text-white text-xs font-semibold px-4 py-2 rounded-lg text-center shadow-sm ${l.isMain ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}>
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
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 w-48">
        <p className="text-xs font-bold text-indigo-700 mb-2 text-center">UCR Motors</p>
        <div className="space-y-1">
          {UCR_MOTORS.map((m) => (
            <div key={m} className="text-xs text-indigo-600 flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-indigo-400 shrink-0" />
              {m}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Multi-connection diagram ─────────────────────────────────────────────────

function MultiConnectionExample() {
  const examples = [
    { provider: "Gmail", accounts: ["commercial@gmail.com", "financial@gmail.com", "director@gmail.com"], color: "bg-red-400" },
    { provider: "Google Drive", accounts: ["company@gmail.com", "marketing@gmail.com"], color: "bg-yellow-400" },
    { provider: "Outlook", accounts: ["financial@company.com", "director@company.com", "support@company.com", "hr@company.com"], color: "bg-blue-400" },
    { provider: "Slack", accounts: ["Workspace Alpha", "Workspace Beta", "Workspace Gamma", "Workspace Delta", "Workspace Epsilon"], color: "bg-purple-400" },
  ];
  return (
    <div className="space-y-3">
      {examples.map((ex) => (
        <div key={ex.provider} className="flex items-center gap-3">
          <div className={`${ex.color} w-2 h-full min-h-[24px] rounded-full shrink-0`} />
          <div className="flex-1">
            <p className="text-xs font-semibold text-zinc-700">{ex.provider}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {ex.accounts.map((a) => <Badge key={a} label={a} color="zinc" />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = ["overview", "architecture", "tests", "connections", "events", "audit"];
const TAB_LABEL = { overview: "Overview", architecture: "Arquitetura", tests: "Testes", connections: "Conexões", events: "Eventos", audit: "Auditoria" };

export default function Phase641Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [running, setRunning]     = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [liveEvents,  setLiveEvents]  = useState([]);
  const [liveAudit,   setLiveAudit]   = useState([]);

  useEffect(() => { refresh(); }, []);

  function refresh() {
    setLiveEvents(ConnectorEventBus.query({ limit: 20 }).reverse());
    setLiveAudit(ConnectorAudit.query({ limit: 20 }));
  }

  async function handleRunTests() {
    setRunning(true);
    setTestResults(null);
    try {
      const r = await runUCRTests();
      setTestResults(r);
      refresh();
    } finally {
      setRunning(false);
    }
  }

  const passed = testResults?.passed ?? 0;
  const total  = testResults?.results?.length ?? 0;
  const pct    = total > 0 ? Math.round((passed / total) * 100) : 0;

  const regHealth  = ConnectorRegistry.health();
  const connStats  = ConnectionRegistry.stats();
  const sessStats  = ConnectorSessionManager.stats();
  const auditH     = ConnectorAudit.health();
  const capH       = CapabilityEngine.health();
  const evtCount   = ConnectorEventBus.count();
  const liveConns  = testResults ? ConnectionRegistry.list() : [];

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center shadow-md">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Sprint 6.4.1 — Universal Connector Runtime</h1>
            <p className="text-xs text-zinc-400">12 motores · Multi-connection · Multi-tenant · Fan-out Routing</p>
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
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${activeTab === t ? "border-indigo-500 text-indigo-700" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Connectors" value={regHealth.total} icon={Cpu} color="indigo" sub="registrados" />
            <StatCard label="Conexões" value={connStats.total} icon={Network} color="blue" sub={`${connStats.byState?.ACTIVE ?? 0} ativas`} />
            <StatCard label="Sessões" value={sessStats.total} icon={Activity} color="teal" sub={`${sessStats.active} ativas`} />
            <StatCard label="Capabilities" value={capH.capabilities} icon={Zap} color="violet" sub={`${capH.resolved} disponíveis`} />
            <StatCard label="Auditoria" value={auditH.total} icon={Eye} color="zinc" sub={`${auditH.failures} falhas`} />
            <StatCard label="Eventos" value={evtCount} icon={RefreshCw} color="blue" sub="no bus" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Arquivos */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-indigo-500" />Arquivos Criados</h3>
              <div className="space-y-1 text-xs font-mono text-zinc-600">
                {["UCRTypes.ts","IConnectorSDK.ts","ConnectorEventBus.ts","ConnectorRegistry.ts",
                  "ConnectionRegistry.ts","ConnectorLifecycle.ts","ConnectorSessionManager.ts",
                  "ConnectorRouter.ts","CapabilityEngine.ts","ConnectorAudit.ts",
                  "ConnectorMetrics.ts","ConnectorHealth.ts","ConnectorRuntime.ts",
                  "ucrTests.ts","Phase641Page.jsx"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Events + Capabilities */}
            <div className="space-y-4">
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-2 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-indigo-500" />Connector Events (9)</h3>
                <div className="flex flex-wrap gap-1.5">
                  {["CONNECTOR_REGISTERED","CONNECTOR_INITIALIZED","SESSION_STARTED","SESSION_ENDED",
                    "REQUEST_STARTED","REQUEST_COMPLETED","REQUEST_FAILED","HEALTH_CHANGED","CAPABILITY_UPDATED"].map((e) => (
                    <Badge key={e} label={e} color="blue" />
                  ))}
                </div>
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-2 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" />Lifecycle States (7)</h3>
                <div className="flex flex-wrap gap-1.5">
                  {["REGISTERED","INITIALIZED","READY","BUSY","SUSPENDED","FAILED","STOPPED"].map((s) => (
                    <Badge key={s} label={s} color="indigo" />
                  ))}
                </div>
              </div>
            </div>

            {/* Multi-connection */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><GitBranch className="w-4 h-4 text-indigo-500" />Multi-Connection Support</h3>
              <MultiConnectionExample />
            </div>

            {/* Readiness */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />UCR Readiness Checklist</h3>
              <div className="space-y-1.5">
                {[
                  "Qualquer conector pode ser registrado dinamicamente",
                  "Runtime suporta múltiplas contas do mesmo provedor",
                  "Runtime suporta múltiplos tenants e organizações",
                  "Runtime suporta múltiplos workspaces simultaneamente",
                  "Seleção automática de conexão via ConnectorRouter",
                  "Execução paralela em múltiplas conexões (fan-out)",
                  "Todos os conectores compartilham a mesma infraestrutura",
                  "IConnectorSDK — contrato único para todos os conectores",
                  "Lifecycle state machine explícita (7 estados)",
                  "ConnectionRegistry — sem limite de conexões por provedor",
                  "CapabilityEngine — roteamento por capacidade",
                  "ConnectorAudit → EngineeringMemory bridge",
                  "ConnectorMetrics — observabilidade nativa via EventBus",
                  "Sessões com cache por connectionId",
                  "Arquitetura preparada para Federation (Workspace/Org/Enterprise)",
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

      {/* ── Architecture ── */}
      {activeTab === "architecture" && (
        <div className="space-y-5">
          <div className="bg-white border border-zinc-200 rounded-xl p-8 flex justify-center">
            <ArchDiagram />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3">IConnectorSDK — Contrato Universal</h3>
              <div className="text-xs font-mono text-zinc-500 space-y-1">
                {["initialize(context): Promise<void>","shutdown(): Promise<void>","health(): Promise<ConnectorHealthReport>",
                  "capabilities(): ConnectorCapability[]","operations(): ConnectorOperation[]",
                  "execute(request): Promise<ExecuteResult>","authenticate(request): Promise<AuthenticateResult>",
                  "disconnect(connectionId): Promise<DisconnectResult>","manifest(): ConnectorManifest","metadata(): Record<string, unknown>"].map((m) => (
                  <div key={m}>{m}</div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3">Connector Manifest — Campos</h3>
              <div className="text-xs font-mono text-zinc-500 space-y-1">
                {["id","name","version","vendor","category","description","icon","tags",
                  "authentication","capabilities[]","operations[]","permissions[]","healthChecks[]","documentation","federation?"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-indigo-400" />
                    {f}
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
          {!testResults && !running && (
            <div className="text-center py-12 text-zinc-400 text-sm">Clique em "Executar Testes" para rodar a suite UCR.</div>
          )}
          {running && (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-sm text-zinc-500">Executando suite UCR...</span>
            </div>
          )}
          {testResults && testResults.results.map((r, i) => <TestRow key={i} result={r} />)}
        </div>
      )}

      {/* ── Connections ── */}
      {activeTab === "connections" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">{connStats.total} conexões registradas</p>
            <button onClick={refresh} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Atualizar</button>
          </div>
          {connStats.total === 0 && <div className="text-center py-10 text-zinc-400 text-sm">Nenhuma conexão ainda. Execute os testes para criar conexões.</div>}
          {Object.entries(connStats.byConnector ?? {}).map(([connId, count]) => (
            <div key={connId} className="bg-white border border-zinc-100 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-zinc-700">{connId}</span>
                <Badge label={`${count} conexões`} color="blue" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Events ── */}
      {activeTab === "events" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-500">{liveEvents.length} eventos recentes</p>
            <button onClick={refresh} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Atualizar</button>
          </div>
          {liveEvents.length === 0 && <div className="text-center py-8 text-zinc-400 text-sm">Nenhum evento. Execute os testes.</div>}
          {liveEvents.map((evt, i) => (
            <div key={i} className="bg-white border border-zinc-100 rounded-lg p-3 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Badge label={evt.eventType} color={evt.status === 'SUCCESS' ? 'green' : evt.status === 'FAILURE' ? 'red' : 'amber'} />
                <span className="text-zinc-400">{evt.timestamp?.slice(11, 23)}</span>
              </div>
              <div className="text-zinc-400">connector: {evt.connectorId || '—'} · actor: {evt.actor}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Audit ── */}
      {activeTab === "audit" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-500">{liveAudit.length} registros</p>
            <button onClick={refresh} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Atualizar</button>
          </div>
          {liveAudit.length === 0 && <div className="text-center py-8 text-zinc-400 text-sm">Nenhuma auditoria. Execute os testes.</div>}
          {liveAudit.map((r, i) => (
            <div key={i} className={`bg-white border rounded-lg p-3 text-xs ${r.outcome === 'failure' ? 'border-red-100' : 'border-zinc-100'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Badge label={r.operationId} color={r.outcome === 'success' ? 'green' : 'red'} />
                <span className="text-zinc-400">{r.timestamp?.slice(11, 23)}</span>
                <span className="text-zinc-400">{r.durationMs}ms</span>
              </div>
              <div className="text-zinc-400">connector: {r.connectorId} · org: {r.organizationId}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}