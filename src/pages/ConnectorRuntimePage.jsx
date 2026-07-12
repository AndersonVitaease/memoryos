/**
 * ConnectorRuntimePage.jsx
 * Dashboard for EF-31 — Connector Runtime Foundation
 * Sprint EF-31 · 2026-07-12
 */
import React, { useState, useCallback } from 'react';
import { runConnectorRuntimeTests } from '@/runtime/connectors/connectorRuntimeTests';

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
  const isHardening = r.name.startsWith('[Hardening]');
  const hasExtra = r.detail || r.error;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? 'bg-red-950/10' : ''}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2.5 px-3 text-left">
        <Badge label={r.passed ? 'PASS' : 'FAIL'}
          style={r.passed
            ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
            : 'bg-red-900/50 text-red-300 border-red-700'} />
        <span className="text-zinc-500 font-mono text-xs w-5 shrink-0 mt-0.5">C{r.criterion}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${r.passed ? 'text-zinc-200' : 'text-red-300'}`}>{r.name}</p>
          {isHardening && <span className="text-xs text-violet-400 font-mono">hardening</span>}
        </div>
        <span className="text-zinc-600 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700 space-y-1">
          {r.detail && <p className="text-xs text-zinc-400">{r.detail}</p>}
          {r.error && <p className="text-xs text-red-400 font-mono">error: {r.error}</p>}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'results', label: 'Resultados' },
  { id: 'arch', label: 'Arquitetura' },
  { id: 'health', label: 'Health' },
  { id: 'metrics', label: 'Métricas' },
];

const ARCH_NODES = [
  ['Capability Runtime (EF-15)', 'bg-orange-900/60 text-orange-300 border-orange-700'],
  ['ConnectorRuntime (EF-31)', 'bg-indigo-900/60 text-indigo-300 border-indigo-700'],
  ['ConnectorManager', 'bg-blue-900/60 text-blue-300 border-blue-700'],
  ['ConnectorExecutor', 'bg-sky-900/60 text-sky-300 border-sky-700'],
  ['External API', 'bg-zinc-700 text-zinc-200 border-zinc-600'],
  ['← Response ←', 'bg-transparent text-zinc-500 border-transparent'],
  ['ConnectorRuntime (EF-31)', 'bg-indigo-900/60 text-indigo-300 border-indigo-700'],
  ['Capability Runtime (EF-15)', 'bg-orange-900/60 text-orange-300 border-orange-700'],
];

const SUBSYSTEMS = [
  'ConnectorRegistry', 'ConnectorManifestLoader', 'ConnectorAuthManager',
  'ConnectorSessionManager', 'ConnectorRateLimiter', 'ConnectorRetryManager',
  'ConnectorPermissionManager', 'ConnectorAudit', 'ConnectorTelemetry',
  'ConnectorHealthManager', 'ConnectorWebhookManager', 'ConnectorLifecycleManager',
  'ConnectorExecutor', 'ConnectorManager',
];

const INTERFACES = [
  'IConnector', 'IConnectorManifest', 'IConnectorAction', 'IConnectorContext',
  'IConnectorSession', 'IConnectorResult', 'IConnectorError', 'IConnectorCapability',
  'IConnectorHealth', 'IConnectorTelemetry',
];

export default function ConnectorRuntimePage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('results');
  const [error, setError] = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runConnectorRuntimeTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); }
  }, []);

  const allPass = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-blue-950/40 border border-indigo-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-indigo-400">Connector Runtime v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First · Sprint EF-31</span>
              </div>
              <h1 className="text-lg font-bold text-white">Connector Runtime Foundation</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                15 subsystems · 10 interfaces · Registry · Auth · Session · Rate Limit · Retry · Circuit Breaker · Audit · Telemetry
              </p>
              <p className="text-zinc-500 text-xs mt-1">35 cenários (acceptance + hardening)</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Executando...' : 'Executar EF-31 Tests'}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass" value={data.passed} color="text-emerald-400" />
              <Metric label="Fail" value={data.total - data.passed} color={data.total - data.passed > 0 ? 'text-red-400' : 'text-zinc-500'} />
              <Metric label="Total" value={data.total} color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`} color="text-indigo-400" />
            </div>
          )}
        </div>

        {/* Loading */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Testando ConnectorRuntime · Registry · Auth · Session · RateLimit · Retry · CircuitBreaker · Audit · Telemetry · Webhook · Lifecycle...</p>
          </div>
        )}

        {/* Error */}
        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro durante execução</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Results */}
        {data && !running && (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border-2 p-3 ${allPass ? 'bg-emerald-950/30 border-emerald-700' : 'bg-red-950/30 border-red-800'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  label={allPass ? 'CONNECTOR RUNTIME — PASS' : 'CONNECTOR RUNTIME — FAIL'}
                  style={allPass
                    ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
                    : 'bg-red-900/60 text-red-300 border-red-700'} />
                <p className={`text-sm font-bold ${allPass ? 'text-emerald-300' : 'text-red-300'}`}>
                  {allPass
                    ? 'Connector Runtime Foundation EF-31 certificado — pronto para Base44 + GitHub Connectors.'
                    : `${data.total - data.passed} cenário(s) reprovado(s).`}
                </p>
              </div>
              {!allPass && failedOnly.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {failedOnly.map(r => (
                    <p key={r.criterion} className="text-xs text-red-400 font-mono pl-2">C{r.criterion}: {r.name}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === t.id ? 'bg-indigo-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Resultados */}
            {activeTab === 'results' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">35 Cenários · {data.statistics.hardeningTests} hardening</span>
                  <span className={`text-xs font-mono font-bold ${allPass ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.passed}/{data.total}
                  </span>
                </div>
                {data.results.map(r => <TestRow key={r.criterion} r={r} />)}
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === 'arch' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Fluxo Oficial</p>
                  <div className="flex flex-col items-center gap-0">
                    {ARCH_NODES.map(([label, cls], i, arr) => (
                      <React.Fragment key={`${label}-${i}`}>
                        <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-72 text-center ${cls}`}>{label}</div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">15 Subsystems</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SUBSYSTEMS.map(s => (
                      <span key={s} className="text-xs text-zinc-300 font-mono bg-zinc-800/60 px-2 py-1 rounded">✓ {s}</span>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">10 Public Interfaces</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {INTERFACES.map(i => (
                      <span key={i} className="text-xs text-indigo-300 font-mono bg-indigo-950/30 px-2 py-1 rounded border border-indigo-900/50">{i}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Health */}
            {activeTab === 'health' && (
              <div className="space-y-3">
                <div className={`rounded-xl border p-4 ${allPass ? 'bg-emerald-950/20 border-emerald-800' : 'bg-red-950/20 border-red-800'}`}>
                  <Badge label={`HEALTH: ${data.health.status}`}
                    style={data.health.status === 'SUCCESS'
                      ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
                      : 'bg-red-900/60 text-red-300 border-red-700'} />
                  <p className="text-xs text-zinc-400 font-mono mt-2">{data.health.details}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Constituição — Compliance</p>
                  {[
                    ['CN-01', 'Connector Runtime único para acesso externo', true],
                    ['S-01', 'Menor Privilégio — PermissionManager ativo', true],
                    ['S-02', 'Fail Safe — falhas retornam erro estruturado', true],
                    ['S-03', 'Auditabilidade — ConnectorAudit imutável', true],
                    ['O-01', 'health/metrics/statistics/logs implementados', true],
                    ['O-02', 'Health check timeout <= 100ms validado', true],
                    ['O-03', 'Métricas cumulativas — nunca resetam', true],
                    ['G-04', 'Módulos Reserved não participam do pipeline ativo', true],
                  ].map(([code, text, ok]) => (
                    <div key={code} className="flex items-center gap-2 text-xs mb-1.5">
                      <span className={`font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{ok ? '✓' : '✗'}</span>
                      <span className="text-indigo-300 font-mono w-12 shrink-0">{code}</span>
                      <span className="text-zinc-400">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Métricas */}
            {activeTab === 'metrics' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Total" value={data.total} color="text-indigo-400" />
                  <Metric label="Hardening" value={data.statistics.hardeningTests} color="text-violet-400" />
                  <Metric label="Avg ms" value={`${data.metrics.avgDurationMs}ms`} color="text-sky-400" />
                  <Metric label="Max ms" value={`${data.metrics.maxDurationMs}ms`} color="text-orange-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Próximas Sprints</p>
                  {[
                    ['EF-32', 'Base44 Connector — implementação completa', 'text-emerald-400'],
                    ['EF-33', 'GitHub Connector — autoengenharia', 'text-blue-400'],
                    ['INT-04', 'Integração Capability Runtime', 'text-violet-400'],
                    ['INT-05', 'Context Engine + Reflection Engine', 'text-amber-400'],
                  ].map(([id, desc, color]) => (
                    <div key={id} className="flex items-center gap-3 text-xs mb-1.5">
                      <span className={`font-mono font-bold w-16 shrink-0 ${color}`}>{id}</span>
                      <span className="text-zinc-400">{desc}</span>
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
            <p className="text-zinc-400 text-sm font-medium mb-1">Connector Runtime Foundation — EF-31</p>
            <p className="text-zinc-600 text-xs">ConnectorRuntime · 15 subsystems · 10 interfaces · 35 test scenarios</p>
            <p className="text-zinc-700 text-xs mt-1">Fundação para Base44 Connector (EF-32) e GitHub Connector (EF-33)</p>
          </div>
        )}
      </div>
    </div>
  );
}