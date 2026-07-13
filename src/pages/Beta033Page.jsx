/**
 * Beta033Page — Production Connector Activation
 * Beta-03.3 · MemoryOS · 2026-07-13
 *
 * Dashboard: Activate real connectors, run validation suite, generate certs.
 * Read-only only — never writes.
 */
import React, { useState, useCallback } from 'react';
import { ProductionActivator } from '@/lib/production-activation/ProductionActivator';
import { runPCATests }         from '@/lib/production-activation/pcaTests';

const TABS = ['Overview', 'GitHub', 'Base44', 'Pipeline', 'Diagnostics', 'Tests', 'Certification'];

const STATUS_COLOR = {
  ACTIVATED:       'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  PARTIAL:         'bg-amber-900/50 text-amber-300 border-amber-700',
  NOT_CONFIGURED:  'bg-zinc-800/60 text-zinc-400 border-zinc-700',
  FAILED:          'bg-red-900/50 text-red-300 border-red-700',
  CERTIFIED:       'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  PASS:            'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:            'bg-red-900/50 text-red-300 border-red-700',
  WARNING:         'bg-amber-900/50 text-amber-300 border-amber-700',
  SKIP:            'bg-zinc-800/50 text-zinc-500 border-zinc-700',
  healthy:         'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  degraded:        'bg-amber-900/40 text-amber-400 border-amber-800',
  unhealthy:       'bg-red-900/40 text-red-400 border-red-800',
};

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}
function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono truncate ${color}`}>{String(value ?? '—')}</div>
      <div className="text-zinc-500 text-xs mt-0.5 truncate">{label}</div>
    </div>
  );
}
function ProgressBar({ pct, color = 'bg-violet-500' }) {
  return (
    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} />
    </div>
  );
}

function ConnectorReport({ report, title }) {
  if (!report) return <div className="text-zinc-600 text-sm text-center py-4">Not yet run.</div>;
  const pct = Math.round((report.passCount / Math.max(1, report.totalChecks)) * 100);
  const color = report.status === 'ACTIVATED' ? 'bg-emerald-500' : report.status === 'PARTIAL' ? 'bg-amber-500' : 'bg-zinc-600';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge label={report.status} style={STATUS_COLOR[report.status] ?? ''} />
        <span className="text-zinc-300 text-sm font-medium">{report.summary}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Metric label="Pass"    value={report.passCount}        color="text-emerald-400" />
        <Metric label="Warn"    value={report.warnCount}        color="text-amber-400" />
        <Metric label="Fail"    value={report.failCount}        color="text-red-400" />
        <Metric label="Latency" value={`${report.latencyMs}ms`} color="text-sky-400" />
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar pct={pct} color={color} />
        <span className="text-zinc-400 text-xs shrink-0">{pct}%</span>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {report.checks.map((c, i) => (
          <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-2.5">
            <div className="flex items-start gap-2 flex-wrap">
              <Badge label={c.status} style={STATUS_COLOR[c.status] ?? STATUS_COLOR['SKIP']} />
              <span className="text-zinc-200 text-xs font-medium flex-1">{c.name}</span>
              <span className="text-zinc-700 text-xs shrink-0">{c.durationMs}ms</span>
            </div>
            <p className="text-zinc-500 text-xs mt-0.5 ml-0.5">{c.detail}</p>
          </div>
        ))}
      </div>
      {report.evidence.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Evidence</p>
          {report.evidence.map((e, i) => (
            <p key={i} className="text-zinc-400 text-xs font-mono">✓ {e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

const TEST_CATS = ['Factory', 'GitHub', 'Base44', 'Pipeline', 'ReadOnly', 'Diagnostics', 'Coverage'];

export default function Beta033Page() {
  const [tab, setTab] = useState('Overview');
  const [activating, setActivating] = useState(false);
  const [report, setReport] = useState(null);
  const [testReport, setTestReport] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');

  const handleActivate = useCallback(async () => {
    setActivating(true);
    try {
      const act = new ProductionActivator();
      const r = await act.activate({ githubOwner: owner || undefined, githubRepo: repo || undefined });
      setReport(r);
    } finally { setActivating(false); }
  }, [owner, repo]);

  const handleTests = useCallback(async () => {
    setTestRunning(true); setTestReport(null);
    try { setTestReport(await runPCATests()); }
    finally { setTestRunning(false); }
  }, []);

  const ghStatus  = report?.githubReport?.status ?? null;
  const b44Status = report?.base44Report?.status ?? null;
  const certLevel = report?.certificationLevel ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-emerald-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-emerald-400">Beta-03.3</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Production Connector Activation</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Read-Only · 2026-07-13</span>
          </div>
          <h1 className="text-lg font-bold">Production Connector Activation</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Activate GitHub + Base44 connectors against real production environments — read-only cognitive pipeline</p>
          {report && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Level"       value={report.certificationLevel} color={report.certified ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="GitHub"      value={ghStatus}  color={ghStatus === 'ACTIVATED' ? 'text-emerald-400' : ghStatus === 'NOT_CONFIGURED' ? 'text-zinc-500' : 'text-amber-400'} />
              <Metric label="Base44"      value={b44Status} color={b44Status === 'ACTIVATED' ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Duration"    value={`${report.durationMs}ms`} color="text-sky-400" />
            </div>
          )}
        </div>

        {/* Activation control */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <p className="text-zinc-400 text-xs uppercase tracking-wider">Production Activation (Read-Only)</p>
          <div className="flex gap-2 flex-wrap items-center">
            <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="GitHub owner (optional)"
              className="flex-1 min-w-32 bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 rounded px-3 py-1.5 focus:outline-none focus:border-emerald-600" />
            <input value={repo} onChange={e => setRepo(e.target.value)} placeholder="GitHub repo (optional)"
              className="flex-1 min-w-32 bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 rounded px-3 py-1.5 focus:outline-none focus:border-emerald-600" />
            <button onClick={handleActivate} disabled={activating}
              className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-xs font-semibold">
              {activating ? 'Activating…' : 'Activate Connectors'}
            </button>
          </div>
          {activating && (
            <div className="flex items-center gap-2 py-1">
              <div className="w-3.5 h-3.5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
              <span className="text-zinc-500 text-xs">Running read-only activation pipeline…</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${tab===t?'bg-zinc-700 text-white':'text-zinc-400 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'Overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { l: 'GitHub Activation',     d: '13 checks · auth · repos · commits · files · rate limit' },
                { l: 'Base44 Activation',     d: '11 checks · auth · workspace · projects · entities · latency' },
                { l: 'Repository Analyzer',   d: 'Live RepositoryAnalysis from GitHub connector' },
                { l: 'Application Analyzer',  d: 'Live ApplicationAnalysis from Base44 connector' },
                { l: 'Project Snapshot',      d: 'First real snapshot from full cognitive pipeline' },
                { l: 'Read-Only Cert',        d: 'No writes · no pushes · no merges · no modifications' },
              ].map(m => (
                <div key={m.l} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="text-emerald-400 text-xs font-bold">{m.l}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{m.d}</div>
                </div>
              ))}
            </div>
            {!report && (
              <div className="text-center text-zinc-600 py-6 text-sm">Click "Activate Connectors" to run the full production activation.</div>
            )}
            {report && (
              <div className={`rounded-xl border-2 p-3 ${report.certified ? 'bg-emerald-950/20 border-emerald-700' : report.certificationLevel === 'PARTIAL' ? 'bg-amber-950/10 border-amber-800' : 'bg-zinc-900 border-zinc-700'}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge label={report.certificationLevel} style={STATUS_COLOR[report.certificationLevel] ?? ''} />
                  <span className="text-zinc-200 text-sm">{report.summary}</span>
                </div>
                {report.recommendations.length > 0 && report.recommendations.map((rec, i) => (
                  <p key={i} className="text-amber-400 text-xs mt-0.5">⚠ {rec}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── GitHub ── */}
        {tab === 'GitHub' && (
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs">Requires <code className="bg-zinc-800 px-1 rounded">__GITHUB_TOKEN__</code> in environment. Read-only — no writes.</p>
            <ConnectorReport report={report?.githubReport} title="GitHub" />
          </div>
        )}

        {/* ── Base44 ── */}
        {tab === 'Base44' && (
          <ConnectorReport report={report?.base44Report} title="Base44" />
        )}

        {/* ── Pipeline ── */}
        {tab === 'Pipeline' && (
          <div className="space-y-3">
            {!report && <div className="text-center text-zinc-600 py-6 text-sm">Run activation first.</div>}
            {report && (
              <>
                {/* Repo validation */}
                {report.repoValidation ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Repository Analysis</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge label={report.repoValidation.consistent ? 'CONSISTENT' : 'INCONSISTENT'}
                        style={report.repoValidation.consistent ? STATUS_COLOR.PASS : STATUS_COLOR.FAIL} />
                      <span className="text-zinc-400 text-xs">{report.repoValidation.owner}/{report.repoValidation.repo}</span>
                    </div>
                    {report.repoValidation.fields.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 border-b border-zinc-800/30 last:border-0 text-xs">
                        <span className={f.pass ? 'text-emerald-400' : 'text-red-400'}>●</span>
                        <span className="text-zinc-400 w-28 shrink-0">{f.field}</span>
                        <span className="text-zinc-300 font-mono">{String(f.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-600 text-sm">
                    Repository Analysis: {report.githubReport.status === 'NOT_CONFIGURED' ? 'GitHub token not configured' : 'No target repo — provide owner/repo'}
                  </div>
                )}

                {/* App validation */}
                {report.appValidation ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Application Analysis</p>
                    <Badge label={report.appValidation.consistent ? 'CONSISTENT' : 'INCONSISTENT'}
                      style={report.appValidation.consistent ? STATUS_COLOR.PASS : STATUS_COLOR.FAIL} />
                    <div className="mt-2">
                      {report.appValidation.fields.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 border-b border-zinc-800/30 last:border-0 text-xs">
                          <span className={f.pass ? 'text-emerald-400' : 'text-red-400'}>●</span>
                          <span className="text-zinc-400 w-28 shrink-0">{f.field}</span>
                          <span className="text-zinc-300 font-mono">{String(f.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-600 text-sm">Application Analysis not available</div>
                )}

                {/* Project snapshot */}
                {report.projectSnapshot && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-zinc-400 text-xs uppercase tracking-wider">Project Snapshot v{report.projectSnapshot.snapshotVersion}</p>
                      <Badge label={report.projectSnapshot.pipelineStatus}
                        style={report.projectSnapshot.pipelineStatus === 'COMPLETE' ? STATUS_COLOR.PASS : STATUS_COLOR.WARNING} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      <Metric label="GH Branches"  value={report.projectSnapshot.githubBranches}  color="text-sky-400" />
                      <Metric label="GH Commits"   value={report.projectSnapshot.githubCommits}   color="text-sky-400" />
                      <Metric label="GH Files"     value={report.projectSnapshot.githubFiles}     color="text-sky-400" />
                      <Metric label="B44 Projects" value={report.projectSnapshot.base44Projects}  color="text-violet-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="B44 Sessions"   value={report.projectSnapshot.base44Sessions} color="text-violet-400" />
                      <Metric label="B44 Email"      value={report.projectSnapshot.base44UserEmail.slice(0,20)} color="text-violet-400" />
                    </div>
                    {Object.keys(report.projectSnapshot.base44EntityCounts).length > 0 && (
                      <div className="mt-3">
                        <p className="text-zinc-500 text-xs mb-2">Entity Counts</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                          {Object.entries(report.projectSnapshot.base44EntityCounts).map(([k, v]) => (
                            <Metric key={k} label={k} value={v} color="text-zinc-300" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Diagnostics ── */}
        {tab === 'Diagnostics' && (
          <div className="space-y-3">
            {!report && <div className="text-center text-zinc-600 py-6 text-sm">Run activation first.</div>}
            {report?.diagnostics && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Metric label="Overall Health"  value={report.diagnostics.overallHealth} color={report.diagnostics.overallHealth === 'healthy' ? 'text-emerald-400' : 'text-amber-400'} />
                  <Metric label="GitHub Status"   value={report.diagnostics.githubStatus}  color={report.diagnostics.githubStatus === 'ACTIVATED' ? 'text-emerald-400' : 'text-zinc-500'} />
                  <Metric label="Base44 Status"   value={report.diagnostics.base44Status}  color={report.diagnostics.base44Status === 'ACTIVATED' ? 'text-emerald-400' : 'text-amber-400'} />
                  <Metric label="GitHub Latency"  value={`${report.diagnostics.githubLatencyMs}ms`}  color="text-sky-400" />
                  <Metric label="Base44 Latency"  value={`${report.diagnostics.base44LatencyMs}ms`}  color="text-sky-400" />
                  <Metric label="GH Rate Limit"   value={report.diagnostics.githubRateLimitRemaining !== null ? `${report.diagnostics.githubRateLimitRemaining}/${report.diagnostics.githubRateLimitLimit}` : 'N/A'} color="text-zinc-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Identity</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs"><span className="text-zinc-500 w-24">GitHub login</span><span className="text-zinc-200 font-mono">{report.diagnostics.githubLogin ?? 'N/A'}</span></div>
                    <div className="flex items-center gap-2 text-xs"><span className="text-zinc-500 w-24">Base44 email</span><span className="text-zinc-200 font-mono">{report.diagnostics.base44Email ?? 'N/A'}</span></div>
                  </div>
                </div>
                {report.diagnostics.warnings.length > 0 && (
                  <div className="bg-amber-950/10 border border-amber-800 rounded-xl p-3 space-y-1">
                    {report.diagnostics.warnings.map((w, i) => <p key={i} className="text-amber-400 text-xs">⚠ {w}</p>)}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tests ── */}
        {tab === 'Tests' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Validation Suite — 20 Tests, 7 Categories</p>
                <button onClick={handleTests} disabled={testRunning}
                  className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-xs font-semibold">
                  {testRunning ? '…' : 'Run Tests'}
                </button>
              </div>
              {testRunning && (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
                  <span className="text-zinc-500 text-xs">Running real connector tests…</span>
                </div>
              )}
            </div>
            {testReport && !testRunning && (
              <>
                <div className={`rounded-xl border-2 p-3 ${testReport.overallStatus==='CERTIFIED'?'bg-emerald-950/20 border-emerald-700':testReport.overallStatus==='PARTIAL'?'bg-amber-950/10 border-amber-800':'bg-red-950/20 border-red-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={testReport.overallStatus} style={STATUS_COLOR[testReport.overallStatus] ?? ''} />
                    <span className="text-sm font-bold text-zinc-200">{testReport.summary}</span>
                  </div>
                </div>
                {TEST_CATS.map(cat => {
                  const tests = testReport.results.filter(r => r.category === cat);
                  if (!tests.length) return null;
                  return (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800 flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-200">{cat}</span>
                        <span className="text-zinc-600 text-xs">({tests.length})</span>
                        <span className={`ml-auto text-xs font-mono ${tests.every(t=>t.status==='PASS')?'text-emerald-400':'text-amber-400'}`}>
                          {tests.filter(t=>t.status==='PASS').length}/{tests.length}
                        </span>
                      </div>
                      {tests.map((t, i) => (
                        <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-2.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge label={t.status} style={STATUS_COLOR[t.status] ?? STATUS_COLOR['SKIP']} />
                            <span className="text-zinc-200 text-xs font-medium flex-1">{t.name}</span>
                            <span className="text-zinc-700 text-xs shrink-0">{t.durationMs}ms</span>
                          </div>
                          <p className="text-zinc-500 text-xs mt-1">{t.detail}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── Certification ── */}
        {tab === 'Certification' && (
          <div className="space-y-3">
            {!report && <div className="text-center text-zinc-600 py-6 text-sm">Run activation to generate certificate.</div>}
            {report && (
              <>
                {/* Read-only cert */}
                <div className={`rounded-xl border-2 p-5 ${report.readOnlyCert.certified ? 'bg-emerald-950/20 border-emerald-700' : 'bg-amber-950/10 border-amber-800'}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge label={`READ-ONLY: ${report.readOnlyCert.level}`} style={STATUS_COLOR[report.readOnlyCert.certified ? 'CERTIFIED' : 'PARTIAL']} />
                    <span className="text-zinc-400 text-xs font-mono">Beta-03.3 · {new Date(report.readOnlyCert.certifiedAt).toISOString().split('T')[0]}</span>
                  </div>
                  <p className="text-zinc-300 text-sm font-semibold">{report.readOnlyCert.summary}</p>
                  <div className="mt-3 space-y-1">
                    {report.readOnlyCert.evidence.map((e, i) => (
                      <p key={i} className="text-zinc-400 text-xs font-mono">✓ {e}</p>
                    ))}
                  </div>
                </div>

                {/* Full cert */}
                <div className={`rounded-xl border-2 p-5 ${report.certified ? 'bg-emerald-950/30 border-emerald-600' : report.certificationLevel === 'PARTIAL' ? 'bg-amber-950/10 border-amber-700' : 'bg-zinc-900 border-zinc-700'}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge label={`BETA-03.3: ${report.certificationLevel}`} style={STATUS_COLOR[report.certificationLevel] ?? ''} />
                    <span className="text-zinc-400 text-xs font-mono">{new Date(report.generatedAt).toISOString().split('T')[0]}</span>
                  </div>
                  <p className="text-zinc-200 font-bold text-sm">{report.summary}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Metric label="GitHub"       value={report.githubReport.status}  color={report.githubReport.status === 'ACTIVATED' ? 'text-emerald-400' : 'text-zinc-500'} />
                    <Metric label="Base44"       value={report.base44Report.status}  color={report.base44Report.status === 'ACTIVATED' ? 'text-emerald-400' : 'text-amber-400'} />
                    <Metric label="Read-Only"    value={report.readOnlyCert.level}   color="text-emerald-400" />
                    <Metric label="Pipeline"     value={report.projectSnapshot?.pipelineStatus ?? 'N/A'} color="text-sky-400" />
                  </div>
                </div>

                {/* Architecture rules */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Architecture Rules (Beta-03.3)</p>
                  {[
                    'No connector performs write operations',
                    'No connector publishes or creates commits',
                    'No connector modifies repositories',
                    'No connector modifies Base44 projects',
                    'Entire sprint operates in read-only mode',
                    'NOT_CONFIGURED returned honestly when credentials absent',
                    'Existing connectors not modified — reused as-is',
                  ].map((r, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/30 last:border-0">
                      <span className="text-emerald-500 text-xs shrink-0 mt-0.5">✓</span>
                      <span className="text-zinc-300 text-xs">{r}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}