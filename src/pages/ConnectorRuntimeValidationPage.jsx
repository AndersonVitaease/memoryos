/**
 * ConnectorRuntimeValidationPage.jsx
 * Connector Runtime — End-to-End Validation Dashboard
 * Validates: Goal Runtime → Planner → Capability Runtime → Connector Runtime → Base44 + GitHub
 * 2026-07-13 · Engineering First
 */
import React, { useState, useCallback } from 'react';
import { ConnectorRuntimePipeline } from '@/lib/connector-runtime/ConnectorRuntimePipeline';

// ── UI Primitives ─────────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    healthy: 'bg-emerald-500', ready: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    unhealthy: 'bg-red-500', error: 'bg-red-500',
    unknown: 'bg-zinc-500', registered: 'bg-blue-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[status] ?? 'bg-zinc-600'}`} />;
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? 'bg-red-950/10' : ''}`}>
      <button onClick={() => (r.error || r.details) && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-1.5 px-3 text-left">
        <Badge label={r.passed ? 'PASS' : 'FAIL'}
          style={r.passed ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${r.passed ? 'text-zinc-300' : 'text-red-300'}`}>{r.name}</p>
          <p className="text-zinc-600 text-xs font-mono">{r.group}</p>
        </div>
        <span className="text-zinc-700 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && (r.error || r.details) && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700">
          {r.error && <p className="text-xs text-red-400 font-mono mb-1">{r.error}</p>}
          {r.details && <pre className="text-xs text-zinc-500 font-mono overflow-x-auto">{JSON.stringify(r.details, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'report', label: 'Validation Report' },
  { id: 'registry', label: 'Registry' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'logs', label: 'Logs' },
  { id: 'tests', label: 'Tests' },
];

const STATUS_STYLE = {
  healthy: 'text-emerald-400', ready: 'text-emerald-400',
  degraded: 'text-amber-400',
  unhealthy: 'text-red-400', error: 'text-red-400',
  unknown: 'text-zinc-500',
};

export default function ConnectorRuntimeValidationPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('report');
  const [err, setErr] = useState(null);
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      const pipeline = new ConnectorRuntimePipeline();
      const report = await pipeline.runValidation();
      setData(report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const passRate = data ? ((data.passed / data.total) * 100).toFixed(0) : null;
  const allPass = data && data.passed === data.total;
  const filtered = showFailed ? (data?.results.filter(r => !r.passed) ?? []) : (data?.results ?? []);

  const PIPELINE_FLOW = [
    { label: 'Goal Runtime', color: 'text-violet-400' },
    { label: '↓', color: 'text-zinc-600' },
    { label: 'Planner', color: 'text-indigo-400' },
    { label: '↓', color: 'text-zinc-600' },
    { label: 'Capability Runtime', color: 'text-blue-400' },
    { label: '↓', color: 'text-zinc-600' },
    { label: 'Connector Runtime', color: 'text-cyan-400' },
    { label: '↓', color: 'text-zinc-600' },
    { label: 'Base44', color: 'text-teal-400' },
    { label: '|', color: 'text-zinc-600' },
    { label: 'GitHub', color: 'text-green-400' },
  ];

  function GroupSummary({ results }) {
    const byGroup = {};
    for (const r of results) {
      if (!byGroup[r.group]) byGroup[r.group] = { passed: 0, total: 0 };
      byGroup[r.group].total++;
      if (r.passed) byGroup[r.group].passed++;
    }
    return (
      <div className="space-y-1.5">
        {Object.entries(byGroup).map(([g, v]) => {
          const ok = v.passed === v.total;
          return (
            <div key={g} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${ok ? 'border-zinc-800 bg-zinc-900' : 'border-red-900/50 bg-red-950/10'}`}>
              <Badge label={ok ? 'PASS' : 'FAIL'}
                style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
              <span className="text-zinc-300 text-xs font-mono flex-1">{g}</span>
              <span className={`text-xs font-bold font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{v.passed}/{v.total}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-950/40 to-blue-950/50 border border-cyan-800/40 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-cyan-400">Connector Runtime</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Validation Pipeline</span>
                <span className="text-zinc-600">·</span>
                <span className="text-blue-400">Engineering First · 2026-07-13</span>
              </div>
              <h1 className="text-lg font-bold text-white">Connector Runtime — End-to-End Validation</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Discovery · Registry · Health · Diagnostics · Base44 · GitHub · Routing · Logs
              </p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Validating...' : 'Run Validation'}
            </button>
          </div>

          {/* Pipeline flow */}
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {PIPELINE_FLOW.map((n, i) => (
              <span key={i} className={`text-xs font-mono ${n.color}`}>{n.label}</span>
            ))}
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              <Metric label="Passed" value={data.passed} color="text-emerald-400" />
              <Metric label="Failed" value={data.total - data.passed} color={(data.total - data.passed) > 0 ? 'text-red-400' : 'text-zinc-600'} />
              <Metric label="Total" value={data.total} />
              <Metric label="Success" value={`${passRate}%`} color={allPass ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Time" value={`${data.totalMs}ms`} color="text-cyan-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running validation pipeline...</p>
            <p className="text-zinc-600 text-xs mt-1">
              Discovering connectors → Registering → Health checks → Base44 → GitHub → Dynamic routing → Integration tests
            </p>
          </div>
        )}

        {err && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Pipeline Error</p>
            <p className="text-red-400 text-xs font-mono">{err}</p>
          </div>
        )}

        {data && !running && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === t.id ? 'bg-cyan-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Validation Report tab ──────────────────────────────────────── */}
            {activeTab === 'report' && (
              <div className="space-y-3">
                {/* Overall checks */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Validation Checks</p>
                  <div className="space-y-2">
                    {[
                      { key: 'runtimeOperational', label: 'Connector Runtime operational' },
                      { key: 'base44Operational', label: 'Base44 Connector operational' },
                      { key: 'githubOperational', label: 'GitHub Connector operational' },
                      { key: 'registryOperational', label: 'Connector Registry operational' },
                      { key: 'dynamicRoutingOperational', label: 'Dynamic routing operational' },
                    ].map(c => (
                      <div key={c.key} className="flex items-center gap-3">
                        <span className={`text-sm ${data.checks[c.key] ? 'text-emerald-400' : 'text-red-400'}`}>
                          {data.checks[c.key] ? '✓' : '✗'}
                        </span>
                        <span className="text-zinc-300 text-sm">{c.label}</span>
                        <Badge label={data.checks[c.key] ? 'OPERATIONAL' : 'DEGRADED'}
                          style={data.checks[c.key]
                            ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
                            : 'bg-red-900/50 text-red-300 border-red-700'} />
                      </div>
                    ))}
                  </div>
                </div>

                <GroupSummary results={data.results} />

                {/* Final verdict */}
                <div className={`rounded-xl border-2 p-4 ${allPass ? 'bg-cyan-950/30 border-cyan-600' : 'bg-amber-950/20 border-amber-700'}`}>
                  <p className={`font-bold text-base ${allPass ? 'text-cyan-300' : 'text-amber-300'}`}>
                    {allPass ? '✅ ALL VALIDATIONS PASSED' : `⚠ ${data.total - data.passed} TEST(S) FAILED`}
                  </p>
                  <p className="text-zinc-400 text-xs mt-1">
                    {data.passed}/{data.total} tests passed · {data.totalMs}ms total · {new Date(data.runAt).toISOString().slice(0, 19).replace('T', ' ')}
                  </p>
                </div>
              </div>
            )}

            {/* ── Registry tab ───────────────────────────────────────────────── */}
            {activeTab === 'registry' && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">
                  {data.registry.length} connectors registered
                </p>
                {data.registry.map(e => (
                  <div key={e.connectorId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <StatusDot status={e.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-zinc-100 font-semibold text-sm">{e.name}</p>
                          <Badge label={`v${e.version}`} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                          <Badge label={e.status.toUpperCase()}
                            style={e.status === 'ready' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
                              : e.status === 'degraded' ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                              : 'bg-red-900/50 text-red-300 border-red-700'} />
                        </div>
                        <p className="text-zinc-500 text-xs font-mono mt-0.5">id: {e.connectorId} · provider: {e.provider}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Metric label="Executions" value={e.totalExecutions} />
                      <Metric label="Failures" value={e.totalFailures} color={e.totalFailures > 0 ? 'text-red-400' : 'text-zinc-400'} />
                      <Metric label="Avg Latency" value={e.latencyMs !== null ? `${e.latencyMs}ms` : '—'} color="text-cyan-400" />
                    </div>

                    <div>
                      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Capabilities ({e.capabilities.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {e.capabilities.map(c => (
                          <span key={c} className="text-xs bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5 font-mono">{c}</span>
                        ))}
                      </div>
                    </div>

                    {e.healthDetails && (
                      <div className="mt-2 text-xs text-zinc-600 font-mono">
                        Health: <span className={STATUS_STYLE[e.healthStatus] ?? 'text-zinc-400'}>{e.healthStatus}</span>
                        {' · '}{e.healthDetails}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Diagnostics tab ─────────────────────────────────────────────── */}
            {activeTab === 'diagnostics' && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Runtime Diagnostics</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left py-2 px-3 font-medium">Connector</th>
                        <th className="text-left py-2 px-3 font-medium">Status</th>
                        <th className="text-left py-2 px-3 font-medium">Latency</th>
                        <th className="text-left py-2 px-3 font-medium">Last Health Check</th>
                        <th className="text-left py-2 px-3 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.diagnostics.map(d => (
                        <tr key={d.connectorId} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <StatusDot status={d.status} />
                              <span className="text-zinc-200 font-mono">{d.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`font-mono font-bold ${STATUS_STYLE[d.status] ?? 'text-zinc-500'}`}>{d.status}</span>
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-cyan-400 font-mono">{d.latencyMs !== null ? `${d.latencyMs}ms` : '—'}</span>
                          </td>
                          <td className="py-2 px-3 text-zinc-600 font-mono">
                            {d.lastHealthCheckAt ? new Date(d.lastHealthCheckAt).toISOString().slice(11, 23) : '—'}
                          </td>
                          <td className="py-2 px-3 text-zinc-500 max-w-xs truncate">{d.healthDetails || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 mt-2">
                  {data.diagnostics.map(d => (
                    <div key={d.connectorId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusDot status={d.status} />
                        <span className="text-zinc-200 font-semibold text-sm">{d.name}</span>
                        <span className="text-zinc-600 font-mono text-xs">— {d.connectorId}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {d.capabilities.map(c => (
                          <span key={c} className="text-xs bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5 font-mono">{c}</span>
                        ))}
                      </div>
                      {d.metrics && (
                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                          <Metric label="Executions" value={d.metrics.totalExecutions} />
                          <Metric label="Failures" value={d.metrics.totalFailures} />
                          <Metric label="Avg ms" value={d.metrics.avgDurationMs} color="text-cyan-400" />
                          <Metric label="Load ms" value={d.metrics.loadTimeMs ?? '—'} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Logs tab ────────────────────────────────────────────────────── */}
            {activeTab === 'logs' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-3">
                  <span className="text-sm font-semibold text-zinc-200">Connector Action Logs</span>
                  <span className="text-xs text-zinc-500 font-mono ml-auto">{data.logs.length} entries</span>
                </div>
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left py-2 px-3 font-medium">Time</th>
                        <th className="text-left py-2 px-3 font-medium">Connector</th>
                        <th className="text-left py-2 px-3 font-medium">Action</th>
                        <th className="text-left py-2 px-3 font-medium">Result</th>
                        <th className="text-right py-2 px-3 font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.logs.map(l => (
                        <tr key={l.id} className="border-b border-zinc-900 hover:bg-zinc-800/30">
                          <td className="py-1.5 px-3 text-zinc-600 font-mono">
                            {new Date(l.timestamp).toISOString().slice(11, 23)}
                          </td>
                          <td className="py-1.5 px-3 text-zinc-300 font-mono">{l.connectorName}</td>
                          <td className="py-1.5 px-3 text-cyan-400 font-mono">{l.action}</td>
                          <td className="py-1.5 px-3">
                            <Badge label={l.result}
                              style={l.result === 'SUCCESS' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
                                : l.result === 'DENIED' ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                                : 'bg-red-900/50 text-red-300 border-red-700'} />
                          </td>
                          <td className="py-1.5 px-3 text-right text-zinc-500 font-mono">{l.executionTimeMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.logs.length === 0 && (
                    <p className="text-zinc-600 text-center py-8 text-sm">No logs captured</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Tests tab ───────────────────────────────────────────────────── */}
            {activeTab === 'tests' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">{data.total} integration tests</span>
                  <span className={`text-xs font-mono font-bold ml-auto ${allPass ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {data.passed}/{data.total}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={showFailed} onChange={e => setShowFailed(e.target.checked)} />
                    Failures only
                  </label>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {showFailed && filtered.length === 0 && (
                    <p className="text-zinc-600 text-center py-8 text-sm">No failures — all tests passed ✓</p>
                  )}
                  {filtered.map((r, i) => <TestRow key={i} r={r} />)}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !err && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Connector Runtime Validation Pipeline</p>
            <p className="text-zinc-600 text-xs">
              Discovery → Registry → Health Checks → Base44 → GitHub → Dynamic Routing → Integration Tests → Validation Report
            </p>
            <p className="text-zinc-700 text-xs mt-2">
              10 groups · ~40 tests · Real Base44 SDK + GitHub API
            </p>
          </div>
        )}
      </div>
    </div>
  );
}