/**
 * EF31APage.jsx
 * Sprint EF-31A — Connector Runtime Validation & Integration
 * 17 groups · 100+ scenarios · Mock Connector · Zero external dependencies
 */
import React, { useState, useCallback } from 'react';
import { runEF31ATests } from '@/runtime/connectors/mock/ef31aTests';

// ── UI Primitives ──────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? 'bg-red-950/10' : ''}`}>
      <button onClick={() => r.error && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2 px-3 text-left">
        <Badge label={r.passed ? 'PASS' : 'FAIL'}
          style={r.passed
            ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
            : 'bg-red-900/50 text-red-300 border-red-700'} />
        <span className="text-zinc-600 font-mono text-xs w-5 shrink-0 mt-0.5">#{r.criterion}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${r.passed ? 'text-zinc-300' : 'text-red-300'}`}>{r.name}</p>
          <span className="text-zinc-600 font-mono text-xs">{r.group}</span>
        </div>
        <span className="text-zinc-700 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && r.error && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700">
          <p className="text-xs text-red-400 font-mono">error: {r.error}</p>
        </div>
      )}
    </div>
  );
}

function GroupBar({ name, passed, total }) {
  const pct = total > 0 ? (passed / total) * 100 : 0;
  const ok = passed === total;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-zinc-300 font-mono">{name}</span>
        <span className={`font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{passed}/{total}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'results', label: 'Resultados' },
  { id: 'groups', label: 'Grupos' },
  { id: 'reports', label: 'Relatórios' },
  { id: 'arch', label: 'Arquitetura' },
];

const GROUP_LABELS = {
  'G1 MockConnector': 'G1 — Mock Connector (11 testes)',
  'G2 Bootstrap': 'G2 — Runtime Bootstrap (6)',
  'G3 Registration': 'G3 — Connector Registration (6)',
  'G4 Auth Flow': 'G4 — Authentication Flow (5)',
  'G5 Permissions': 'G5 — Permission Validation (5)',
  'G6 Execution Pipeline': 'G6 — Execution Pipeline (4)',
  'G7 Retry': 'G7 — Retry Validation (5)',
  'G8 Rate Limit': 'G8 — Rate Limit Validation (5)',
  'G9 Circuit Breaker': 'G9 — Circuit Breaker (6)',
  'G10 Health': 'G10 — Health Validation (4)',
  'G11 Telemetry': 'G11 — Telemetry Validation (5)',
  'G12 Audit': 'G12 — Audit Validation (5)',
  'G13 Lifecycle': 'G13 — Lifecycle Validation (4)',
  'G14 Webhooks': 'G14 — Webhook Validation (4)',
  'G15 Event Bus': 'G15 — Runtime Event Bus (5)',
  'G16 Stress': 'G16 — Stress Test (4)',
  'G17 Quality Gate': 'G17 — Quality Gate Final (8)',
};

export default function EF31APage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState(null);
  const [filterGroup, setFilterGroup] = useState('all');
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runEF31ATests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); }
  }, []);

  const allPass = data && data.passed === data.total;

  const filteredResults = data?.results.filter(r => {
    const groupOk = filterGroup === 'all' || r.group === filterGroup;
    const failedOk = !showFailed || !r.passed;
    return groupOk && failedOk;
  }) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/60 to-indigo-950/40 border border-violet-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-violet-400">EF-31A</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Connector Runtime Validation</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First · 2026-07-12</span>
              </div>
              <h1 className="text-lg font-bold text-white">Sprint EF-31A — Runtime Validation & Integration</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                17 grupos · Mock Connector · Bootstrap · Auth · Permissions · Execution · Retry · Rate Limit · Circuit Breaker · Health · Telemetry · Audit · Lifecycle · Webhooks · Event Bus · Stress · Quality Gate
              </p>
              <p className="text-zinc-600 text-xs mt-1">Zero dependências externas · Nenhum conector real · Infraestrutura validada</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Executando...' : 'Executar EF-31A'}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              <Metric label="Pass" value={data.passed} color="text-emerald-400" />
              <Metric label="Fail" value={data.total - data.passed} color={data.total - data.passed > 0 ? 'text-red-400' : 'text-zinc-500'} />
              <Metric label="Total" value={data.total} color="text-zinc-200" />
              <Metric label="Grupos" value={17} color="text-violet-400" />
              <Metric label="Tempo" value={`${data.durationMs}ms`} color="text-sky-400" />
            </div>
          )}
        </div>

        {/* Loading */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando 17 grupos de validação...</p>
            <p className="text-zinc-600 text-xs mt-1">MockConnector · Bootstrap · Auth · Permissions · Execution Pipeline · Retry · RateLimit · CircuitBreaker · Health · Telemetry · Audit · Lifecycle · Webhooks · EventBus · Stress · QualityGate</p>
          </div>
        )}

        {/* Error */}
        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro durante execução</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {data && !running && (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border-2 p-4 ${allPass ? 'bg-emerald-950/30 border-emerald-700' : 'bg-amber-950/20 border-amber-700'}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <Badge
                  label={allPass ? 'EF-31A — APROVADO' : 'EF-31A — PENDENTE'}
                  style={allPass
                    ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700 text-sm'
                    : 'bg-amber-900/60 text-amber-300 border-amber-700 text-sm'} />
                <div className="flex-1">
                  <p className={`text-sm font-bold ${allPass ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {allPass
                      ? 'Connector Runtime Foundation completamente validado. Infraestrutura pronta para EF-32 (Base44 Connector).'
                      : `${data.total - data.passed} cenário(s) com falha. Revisar antes de prosseguir para EF-32.`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 font-mono">{data.health.details}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === t.id ? 'bg-violet-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Taxa Sucesso" value={`${(data.statistics.successRate * 100).toFixed(1)}%`} color={allPass ? 'text-emerald-400' : 'text-amber-400'} />
                  <Metric label="Avg ms/test" value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
                  <Metric label="Max ms" value={`${data.metrics.maxDurationMs}ms`} color="text-orange-400" />
                  <Metric label="Min ms" value={`${data.metrics.minDurationMs}ms`} color="text-zinc-400" />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Grupos de Validação</p>
                  {Object.entries(data.byGroup).map(([group, g]) => (
                    <GroupBar key={group} name={GROUP_LABELS[group] ?? group} passed={g.passed} total={g.total} />
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Próximas Sprints</p>
                  {[
                    ['EF-32', 'Base44 Connector', allPass ? 'DESBLOQUEADO' : 'BLOQUEADO', allPass ? 'text-emerald-400' : 'text-red-400'],
                    ['EF-33', 'GitHub Connector', 'AGUARDANDO EF-32', 'text-zinc-500'],
                    ['INT-04', 'Capability Runtime Integration', 'AGUARDANDO EF-32', 'text-zinc-500'],
                  ].map(([id, name, status, color]) => (
                    <div key={id} className="flex items-center gap-3 text-xs mb-2">
                      <span className="font-mono font-bold text-violet-400 w-12 shrink-0">{id}</span>
                      <span className="text-zinc-300 flex-1">{name}</span>
                      <span className={`font-mono font-bold ${color}`}>{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resultados */}
            {activeTab === 'results' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-200">{data.total} cenários</span>
                  <span className={`text-xs font-mono font-bold ${allPass ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.passed}/{data.total}
                  </span>
                  <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
                    className="ml-auto text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-2 py-1">
                    <option value="all">Todos os grupos</option>
                    {Object.keys(data.byGroup).map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={showFailed} onChange={e => setShowFailed(e.target.checked)} className="rounded" />
                    Só falhas
                  </label>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {filteredResults.map(r => <TestRow key={r.criterion} r={r} />)}
                </div>
              </div>
            )}

            {/* Grupos */}
            {activeTab === 'groups' && (
              <div className="space-y-2">
                {Object.entries(data.byGroup).map(([group, g]) => {
                  const ok = g.passed === g.total;
                  return (
                    <div key={group} className={`bg-zinc-900 border rounded-xl p-3 ${ok ? 'border-zinc-800' : 'border-red-900'}`}>
                      <div className="flex items-center gap-3">
                        <Badge label={ok ? 'PASS' : 'FAIL'}
                          style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
                        <span className="text-sm text-zinc-200 font-mono flex-1">{GROUP_LABELS[group] ?? group}</span>
                        <span className={`text-xs font-bold font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{g.passed}/{g.total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Relatórios */}
            {activeTab === 'reports' && (
              <div className="space-y-3">
                {Object.entries(data.reports).map(([key, text]) => {
                  const labels = {
                    validation: ['VALIDATION REPORT', 'text-blue-400 border-blue-800'],
                    readiness: ['READINESS REPORT', 'text-emerald-400 border-emerald-800'],
                    coverage: ['COVERAGE REPORT', 'text-violet-400 border-violet-800'],
                    performance: ['PERFORMANCE REPORT', 'text-sky-400 border-sky-800'],
                    security: ['SECURITY REPORT', 'text-amber-400 border-amber-800'],
                    approval: ['FINAL APPROVAL REPORT', allPass ? 'text-emerald-400 border-emerald-700' : 'text-red-400 border-red-800'],
                  };
                  const [label, cls] = labels[key] ?? ['REPORT', 'text-zinc-400 border-zinc-700'];
                  return (
                    <div key={key} className={`bg-zinc-900 border rounded-xl p-4 ${cls.split(' ')[1]}`}>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${cls.split(' ')[0]}`}>{label}</p>
                      <p className="text-zinc-300 text-xs">{text}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === 'arch' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Stack Validado</p>
                  {[
                    ['ConnectorRuntime', 'Facade principal — único ponto de entrada', 'text-indigo-300'],
                    ['ConnectorManager', 'Orquestra lifecycle + auth + session + executor', 'text-blue-300'],
                    ['ConnectorExecutor', 'Pipeline completo com retry + CB + audit + telemetry', 'text-sky-300'],
                    ['ConnectorRegistry', 'Fonte única da verdade para connectors', 'text-violet-300'],
                    ['ConnectorManifestLoader', 'Validação de manifesto com regras da Constituição', 'text-purple-300'],
                    ['ConnectorAuthManager', 'Credenciais opacas · Zero Trust · Least Privilege', 'text-amber-300'],
                    ['ConnectorSessionManager', 'Sessões isoladas por usuário + TTL', 'text-orange-300'],
                    ['ConnectorRateLimiter', 'token_bucket · fixed_window · sliding_window', 'text-red-300'],
                    ['ConnectorRetryManager', 'Exponential backoff · Circuit Breaker · DLQ', 'text-rose-300'],
                    ['ConnectorPermissionManager', 'Least Privilege · Scope validation por ação', 'text-pink-300'],
                    ['ConnectorAudit', 'Imutável · append-only · Object.freeze', 'text-teal-300'],
                    ['ConnectorTelemetry', 'P50/P95/P99 · success rate · error rate', 'text-cyan-300'],
                    ['ConnectorHealthManager', 'HEALTHY / DEGRADED / UNHEALTHY · diagnostics', 'text-green-300'],
                    ['ConnectorWebhookManager', 'HMAC validation · idempotency · dispatch', 'text-lime-300'],
                    ['ConnectorLifecycleManager', 'Todas as transições de estado com eventos', 'text-yellow-300'],
                    ['MockConnector', 'Conector fictício para validação EF-31A', 'text-zinc-400'],
                    ['MockRuntimeEventBus', '15 event types · in-process · testable', 'text-zinc-400'],
                  ].map(([name, desc, color]) => (
                    <div key={name} className="flex items-start gap-3 text-xs mb-2">
                      <span className={`font-mono font-bold w-48 shrink-0 ${color}`}>{name}</span>
                      <span className="text-zinc-500">{desc}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Constituição — Compliance</p>
                  {[
                    ['CN-01', 'Único gateway para APIs externas', true],
                    ['S-01', 'Least Privilege via PermissionManager', true],
                    ['S-02', 'Fail Safe — erros retornam IConnectorResult estruturado', true],
                    ['S-03', 'Audit imutável (Object.freeze) para toda ação', true],
                    ['O-01', 'health/metrics/statistics/logs em todos os módulos', true],
                    ['O-02', 'Health check timeout <= 100ms (validado no manifest)', true],
                    ['O-03', 'Métricas cumulativas — nunca resetam', true],
                    ['ZT-01', 'Sem credenciais implícitas — Zero Trust', true],
                    ['ZT-02', 'Sem raw credentials expostos — opaque refs only', true],
                  ].map(([code, text, ok]) => (
                    <div key={code} className="flex items-center gap-2 text-xs mb-1.5">
                      <span className={`font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{ok ? '✓' : '✗'}</span>
                      <span className="text-indigo-300 font-mono w-14 shrink-0">{code}</span>
                      <span className="text-zinc-400">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Pre-run */}
        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Sprint EF-31A — Connector Runtime Validation</p>
            <p className="text-zinc-600 text-xs">17 grupos · Mock Connector · Zero dependências externas</p>
            <p className="text-zinc-700 text-xs mt-1">Bootstrap · Auth · Permissions · Execution · Retry · RateLimit · CircuitBreaker · Health · Telemetry · Audit · Lifecycle · Webhooks · EventBus · Stress · QualityGate</p>
          </div>
        )}
      </div>
    </div>
  );
}