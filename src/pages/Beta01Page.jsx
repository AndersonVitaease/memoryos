/**
 * Beta01Page — GitHub Production Connector Certification
 * Beta-01 · MemoryOS Reference Connector · 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runGitHubProductionTests } from '@/lib/connector-runtime/connectors/gitHubProductionTests';

// ── Primitives ────────────────────────────────────────────────────────────────

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}
function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono truncate ${color}`}>{String(value)}</div>
      <div className="text-zinc-500 text-xs mt-0.5 truncate">{label}</div>
    </div>
  );
}

const STATUS_STYLE = {
  PASS:           'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:           'bg-red-900/50 text-red-300 border-red-700',
  NOT_CONFIGURED: 'bg-zinc-800/60 text-zinc-400 border-zinc-700',
  SKIP:           'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  CERTIFIED:      'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  FAILED:         'bg-red-900/60 text-red-200 border-red-700',
};

const CATS = [
  'Authentication', 'Repository Operations', 'Branch Operations',
  'Commit Operations', 'File Operations', 'Connector Health',
  'Runtime Integration', 'Production Metrics', 'Diagnostics',
];

function TokenGuide() {
  return (
    <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 text-xs space-y-1.5">
      <p className="text-amber-300 font-bold">Configure a GitHub Token to run real validation</p>
      <p className="text-zinc-400">Add this to your browser console before running the audit:</p>
      <div className="bg-zinc-900 rounded-lg px-3 py-2 font-mono text-emerald-400 mt-1">
        window.__GITHUB_TOKEN__ = "ghp_yourTokenHere"
      </div>
      <p className="text-zinc-500 mt-1">Required scopes: <code className="text-zinc-400">repo</code>, <code className="text-zinc-400">read:user</code></p>
      <p className="text-zinc-600">Token is only stored in memory for this session and never persisted.</p>
    </div>
  );
}

const TABS = ['Overview', 'Results', 'Metrics', 'Diagnostics', 'Reference'];

export default function Beta01Page() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  const handleRun = useCallback(async () => {
    setRunning(true);
    setReport(null);
    try {
      const r = await runGitHubProductionTests();
      setReport(r);
    } finally {
      setRunning(false);
    }
  }, []);

  const r = report;
  const byCat = r ? CATS.reduce((acc, cat) => {
    acc[cat] = r.results.filter(x => x.category === cat);
    return acc;
  }, {}) : {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-green-950/30 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-emerald-400">Beta-01</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">GitHub Production Connector</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">v2.0.0 · Reference Implementation</span>
              </div>
              <h1 className="text-lg font-bold text-white">GitHub Production Connector Certification</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Official MemoryOS Reference Connector — template for all future connectors</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Validating...' : 'Run Production Validation'}
            </button>
          </div>
          {r && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Metric label="Status"        value={r.overallStatus}          color={r.overallStatus==='CERTIFIED'?'text-emerald-400':r.overallStatus==='NOT_CONFIGURED'?'text-zinc-400':'text-red-400'} />
              <Metric label="Pass"          value={r.passed}                 color="text-emerald-400" />
              <Metric label="Fail"          value={r.failed}                 color={r.failed>0?'text-red-400':'text-zinc-600'} />
              <Metric label="Unconfigured"  value={r.notConfigured}          color="text-zinc-500" />
              <Metric label="Duration"      value={`${r.durationMs}ms`}      color="text-blue-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-emerald-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running production validation against GitHub API…</p>
            <p className="text-zinc-600 text-xs mt-1">Auth · Repos · Branches · Commits · Files · Health · Metrics · Diagnostics</p>
          </div>
        )}

        {!r && !running && <TokenGuide />}

        {r && !running && (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border-2 p-4 ${STATUS_STYLE[r.overallStatus] ?? ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge label={r.overallStatus} style={STATUS_STYLE[r.overallStatus]} />
                <span className="font-bold text-sm">{r.summary}</span>
                <span className="text-zinc-600 text-xs ml-auto">{new Date(r.generatedAt).toISOString().slice(0,19).replace('T',' ')}</span>
              </div>
              {!r.credentialsConfigured && (
                <div className="mt-3">
                  <TokenGuide />
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab===t?'bg-zinc-700 text-white':'text-zinc-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Overview ── */}
            {activeTab === 'Overview' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Total Tests"  value={r.total}         color="text-zinc-200" />
                  <Metric label="Pass"         value={r.passed}        color="text-emerald-400" />
                  <Metric label="Fail"         value={r.failed}        color={r.failed>0?'text-red-400':'text-zinc-600'} />
                  <Metric label="Version"      value={r.connectorVersion} color="text-blue-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Results by Category</p>
                  {CATS.map(cat => {
                    const tests = byCat[cat] ?? [];
                    if (tests.length === 0) return null;
                    const pass = tests.filter(t => t.status === 'PASS').length;
                    const fail = tests.filter(t => t.status === 'FAIL').length;
                    const nc   = tests.filter(t => t.status === 'NOT_CONFIGURED').length;
                    return (
                      <div key={cat} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0">
                        <span className="text-zinc-300 text-xs w-44 shrink-0">{cat}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-600" style={{ width: `${(pass/tests.length)*100}%` }} />
                          <div className="h-full bg-red-700"     style={{ width: `${(fail/tests.length)*100}%` }} />
                          <div className="h-full bg-zinc-700"    style={{ width: `${(nc/tests.length)*100}%` }} />
                        </div>
                        <span className="text-zinc-500 text-xs w-16 text-right shrink-0">{pass}/{tests.length} pass</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Results ── */}
            {activeTab === 'Results' && (
              <div className="space-y-3">
                {CATS.map(cat => {
                  const tests = byCat[cat] ?? [];
                  if (tests.length === 0) return null;
                  return (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-zinc-800/50 border-b border-zinc-800">
                        <span className="text-xs font-bold text-zinc-300">{cat}</span>
                        <span className="text-zinc-600 text-xs ml-2">({tests.length} tests)</span>
                      </div>
                      {tests.map((t, i) => (
                        <div key={i} className="border-b border-zinc-800/50 last:border-0 px-4 py-2.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge label={t.status} style={STATUS_STYLE[t.status] ?? ''} />
                            <span className="text-zinc-200 text-xs font-medium">{t.name}</span>
                            <span className="text-zinc-600 text-xs ml-auto">{t.durationMs}ms</span>
                          </div>
                          <p className="text-zinc-500 text-xs mt-1 ml-1">{t.detail}</p>
                          {t.evidence && <p className="text-zinc-700 text-[10px] font-mono mt-0.5 ml-1">{t.evidence}</p>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Metrics ── */}
            {activeTab === 'Metrics' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Metric label="Total Requests"  value={r.metrics.totalRequests}   color="text-zinc-200" />
                  <Metric label="Success"         value={r.metrics.successRequests} color="text-emerald-400" />
                  <Metric label="Failed"          value={r.metrics.failedRequests}  color={r.metrics.failedRequests>0?'text-red-400':'text-zinc-600'} />
                  <Metric label="Denied"          value={r.metrics.deniedRequests}  color="text-amber-400" />
                  <Metric label="Avg Latency"     value={`${r.metrics.avgLatencyMs}ms`} color="text-blue-400" />
                  <Metric label="P95 Latency"     value={`${r.metrics.p95LatencyMs}ms`} color="text-blue-300" />
                </div>
                {r.metrics.rateLimitRemaining !== null && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Rate Limit</p>
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-400 text-xs">Usage</span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${r.metrics.rateLimitUsagePct ?? 0}%` }} />
                      </div>
                      <span className="text-zinc-300 text-xs font-mono">{r.metrics.rateLimitRemaining} remaining</span>
                    </div>
                  </div>
                )}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Connector Uptime</p>
                  <p className="text-zinc-300 text-sm font-mono">{r.metrics.uptimeDurationMs}ms</p>
                  <p className="text-zinc-600 text-xs">Duration of test session</p>
                </div>
              </div>
            )}

            {/* ── Diagnostics ── */}
            {activeTab === 'Diagnostics' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Authentication Status</p>
                  <div className="space-y-1.5">
                    {r.results.filter(t => t.category === 'Authentication').map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge label={t.status} style={STATUS_STYLE[t.status] ?? ''} />
                        <span className="text-zinc-300 text-xs">{t.name}</span>
                        <span className="text-zinc-600 text-xs ml-auto truncate max-w-[200px]">{t.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Health Checks</p>
                  <div className="space-y-1.5">
                    {r.results.filter(t => t.category === 'Connector Health').map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge label={t.status} style={STATUS_STYLE[t.status] ?? ''} />
                        <span className="text-zinc-300 text-xs flex-1">{t.name}</span>
                        <span className="text-zinc-500 text-xs truncate max-w-[240px]">{t.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Runtime Integration</p>
                  <div className="space-y-1.5">
                    {r.results.filter(t => t.category === 'Runtime Integration').map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge label={t.status} style={STATUS_STYLE[t.status] ?? ''} />
                        <span className="text-zinc-300 text-xs flex-1">{t.name}</span>
                        <span className="text-zinc-500 text-xs truncate max-w-[240px]">{t.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {r.results.filter(t => t.status === 'FAIL').length > 0 && (
                  <div className="bg-red-950/20 border border-red-800/40 rounded-xl p-4">
                    <p className="text-red-300 text-xs font-bold uppercase tracking-wider mb-2">Failures</p>
                    {r.results.filter(t => t.status === 'FAIL').map((t, i) => (
                      <div key={i} className="py-1.5 border-b border-red-900/30 last:border-0">
                        <p className="text-red-300 text-xs font-semibold">{t.name}</p>
                        <p className="text-red-400 text-xs">{t.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Reference ── */}
            {activeTab === 'Reference' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">MemoryOS Reference Connector Architecture</p>
                  <p className="text-zinc-400 text-xs mb-4">All future MemoryOS connectors must follow this pattern:</p>
                  {[
                    ['Authentication', 'Token/credential support, validation, expiry detection, permissions diagnostic'],
                    ['Health',         'Structured 6-check health report with latency, rate limit, auth status'],
                    ['Metrics',        'totalRequests, success, failed, denied, latencyAll[], avg, p95, uptime'],
                    ['Diagnostics',    'Per-category diagnostics: auth, repos, health, rate limit, errors, permissions'],
                    ['Policy',         'All operations check policy before execution (PolicyEngine integration)'],
                    ['Logging',        'Structured ConnectorLog[] per execution with timestamps and operation labels'],
                    ['Runtime',        'IConnector interface, ConnectorRegistry, ConnectorRuntime, ConnectorExecutor'],
                    ['Validation',     'validateAsync() with structured ConnectorValidationResult and N checks'],
                    ['NOT_CONFIGURED', 'Return NOT_CONFIGURED (not FAILED) when credentials absent — never simulate'],
                    ['Operations',     'Standard ops: connectivity.ping, auth.user, auth.validate, domain-specific ops'],
                  ].map(([title, desc]) => (
                    <div key={title} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <span className="text-emerald-400 text-xs font-mono w-36 shrink-0">{title}</span>
                      <span className="text-zinc-400 text-xs">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Operations (v2.0.0)</p>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      'connectivity.ping','auth.user','auth.validate','auth.permissions',
                      'repos.list','repos.get','repos.stats','repos.languages','repos.health',
                      'branches.list','branches.default','branches.protected',
                      'commits.list','commits.get',
                      'files.list','files.get',
                      'health.full',
                    ].map(op => (
                      <span key={op} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-400">{op}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}