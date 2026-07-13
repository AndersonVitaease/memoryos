/**
 * Beta011Page — Production Connector Standard Dashboard
 * Beta-01.1 · MemoryOS PCS v1.0 · 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runPCSTests } from '@/lib/production-connector-standard/pcsTests';
import { GitHubConnector } from '@/lib/connector-runtime/connectors/GitHubConnector';
import { PCSGenerator } from '@/lib/production-connector-standard/PCSGenerator';
import { CERTIFICATION_LABELS } from '@/lib/production-connector-standard/PCSTypes';

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
function ScoreBar({ label, value, color = 'bg-blue-600' }) {
  const pct = Math.min(100, Math.max(0, value * 100)).toFixed(0);
  const tc  = value >= 0.7 ? 'text-emerald-400' : value >= 0.5 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400 text-xs w-44 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold font-mono w-10 text-right ${tc}`}>{pct}%</span>
    </div>
  );
}

const STATUS_STYLE = {
  PASS:    'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:    'bg-red-900/50 text-red-300 border-red-700',
  SKIP:    'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  WARNING: 'bg-amber-900/50 text-amber-300 border-amber-700',
};
const VERDICT_STYLE = {
  PASS:    'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  FAIL:    'bg-red-900/60 text-red-200 border-red-700',
  WARNING: 'bg-amber-900/60 text-amber-200 border-amber-700',
};
const LEVEL_COLOR = { LEVEL_0: 'text-red-400', LEVEL_1: 'text-orange-400', LEVEL_2: 'text-amber-400', LEVEL_3: 'text-blue-400', LEVEL_4: 'text-emerald-400' };
const CAP_TYPE_COLOR = { READ: 'text-blue-400', LIST: 'text-violet-400', WRITE: 'text-orange-400', CREATE: 'text-amber-400', UPDATE: 'text-yellow-400', DELETE: 'text-red-400', SEARCH: 'text-cyan-400', SYNC: 'text-teal-400', STREAM: 'text-pink-400', EVENT: 'text-fuchsia-400' };

const TEST_CATS = ['Standard', 'Capabilities', 'Certification', 'Compliance', 'PCS Generation', 'Runtime Compatibility', 'Reference Connector', 'Architecture Rules'];
const TABS = ['Overview', 'Tests', 'PCS Report', 'Capabilities', 'Compliance', 'Standard Spec'];

export default function Beta011Page() {
  const [testReport, setTestReport] = useState(null);
  const [pcs, setPCS] = useState(null);
  const [running, setRunning] = useState(false);
  const [loadingPCS, setLoadingPCS] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  const handleRunTests = useCallback(async () => {
    setRunning(true);
    setTestReport(null);
    try { setTestReport(await runPCSTests()); }
    finally { setRunning(false); }
  }, []);

  const handleGeneratePCS = useCallback(async () => {
    setLoadingPCS(true);
    try {
      const connector = new GitHubConnector();
      await connector.initialize({ executionId: 'pcs_ui', userId: 'ui', policyContext: {} });
      const generator = new PCSGenerator();
      setPCS(await generator.generate(connector));
    } finally { setLoadingPCS(false); }
  }, []);

  const r = testReport;
  const byCat = r ? TEST_CATS.reduce((acc, cat) => {
    acc[cat] = r.results.filter(x => x.category === cat);
    return acc;
  }, {}) : {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-blue-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-blue-400">Beta-01.1</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Production Connector Standard</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">PCS v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">MemoryOS Production Connector Standard</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Official standard for every future connector — GitHub as Reference Implementation</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleGeneratePCS} disabled={loadingPCS}
                className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors">
                {loadingPCS ? 'Generating...' : 'Generate PCS'}
              </button>
              <button onClick={handleRunTests} disabled={running}
                className="px-4 py-2 bg-blue-800 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors">
                {running ? 'Validating...' : 'Run Validation Suite'}
              </button>
            </div>
          </div>
          {r && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Suite Status"   value={r.overallStatus}               color={r.overallStatus==='PASS'?'text-emerald-400':'text-red-400'} />
              <Metric label="Pass"           value={r.passed}                       color="text-emerald-400" />
              <Metric label="Fail"           value={r.failed}                       color={r.failed>0?'text-red-400':'text-zinc-600'} />
              <Metric label="GitHub Level"   value={r.githubCertificationLevel.split(' ')[0]} color={LEVEL_COLOR[r.githubCertificationLevel.split(' ')[0]] ?? 'text-zinc-400'} />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Validating Production Connector Standard…</p>
          </div>
        )}

        {(r || pcs) && !running && (
          <>
            {r && (
              <div className={`rounded-xl border-2 p-3 ${r.overallStatus==='PASS'?'bg-emerald-950/20 border-emerald-700':'bg-red-950/20 border-red-700'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={r.overallStatus} style={r.overallStatus==='PASS'?STATUS_STYLE.PASS:STATUS_STYLE.FAIL} />
                  <span className="text-sm font-bold text-zinc-200">{r.summary}</span>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab===t?'bg-zinc-700 text-white':'text-zinc-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Overview ──────────────────────────────────────────── */}
            {activeTab === 'Overview' && r && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Total Tests"   value={r.total}                        color="text-zinc-200" />
                  <Metric label="Score"         value={`${(r.githubComplianceScore*100).toFixed(0)}%`} color="text-blue-400" />
                  <Metric label="Duration"      value={`${r.durationMs}ms`}            color="text-zinc-400" />
                  <Metric label="Certification" value={r.githubCertificationLevel.split(' ')[0]} color={LEVEL_COLOR[r.githubCertificationLevel.split(' ')[0]] ?? 'text-zinc-400'} />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Results by Category</p>
                  {TEST_CATS.map(cat => {
                    const tests = byCat[cat] ?? [];
                    if (tests.length === 0) return null;
                    const pass = tests.filter(t => t.status === 'PASS').length;
                    const fail = tests.filter(t => t.status === 'FAIL').length;
                    return (
                      <div key={cat} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0">
                        <span className="text-zinc-300 text-xs w-44 shrink-0">{cat}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-600" style={{ width: `${(pass/tests.length)*100}%` }} />
                          {fail > 0 && <div className="h-full bg-red-700" style={{ width: `${(fail/tests.length)*100}%` }} />}
                        </div>
                        <span className="text-zinc-500 text-xs w-14 text-right">{pass}/{tests.length}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Tests ──────────────────────────────────────────────── */}
            {activeTab === 'Tests' && r && (
              <div className="space-y-2">
                {TEST_CATS.map(cat => {
                  const tests = byCat[cat] ?? [];
                  if (tests.length === 0) return null;
                  return (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                        <span className="text-xs font-bold text-zinc-300">{cat}</span>
                      </div>
                      {tests.map((t, i) => (
                        <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-2.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge label={t.status} style={STATUS_STYLE[t.status] ?? ''} />
                            <span className="text-zinc-200 text-xs font-medium">{t.name}</span>
                            <span className="text-zinc-700 text-xs ml-auto">{t.durationMs}ms</span>
                          </div>
                          <p className="text-zinc-500 text-xs mt-1 ml-1">{t.detail}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── PCS Report ─────────────────────────────────────────── */}
            {activeTab === 'PCS Report' && !pcs && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <p className="text-zinc-400 text-sm mb-3">Generate the PCS Report for the GitHub Connector</p>
                <button onClick={handleGeneratePCS} disabled={loadingPCS} className="px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded-lg text-sm font-semibold">
                  {loadingPCS ? 'Generating...' : 'Generate PCS'}
                </button>
              </div>
            )}
            {activeTab === 'PCS Report' && pcs && (
              <div className="space-y-3">
                <div className={`rounded-xl border-2 p-4 ${pcs.certification.level==='LEVEL_4'?'bg-emerald-950/20 border-emerald-700':'bg-blue-950/20 border-blue-800'}`}>
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <Badge label={`${pcs.certificationLevel} — ${pcs.certification.label}`} style={pcs.certificationLevel==='LEVEL_4'?'bg-emerald-900/60 text-emerald-200 border-emerald-600':'bg-blue-900/60 text-blue-200 border-blue-700'} />
                    <span className="font-bold text-sm">{pcs.connectorName} v{pcs.connectorVersion}</span>
                    {pcs.isReferenceConnector && <Badge label="REFERENCE CONNECTOR" style="bg-violet-900/60 text-violet-200 border-violet-600" />}
                    <span className="text-zinc-600 text-xs ml-auto">PCS v{pcs.specVersion}</span>
                  </div>
                  <p className="text-zinc-400 text-xs">{pcs.description}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Compliance"    value={`${(pcs.complianceScore*100).toFixed(0)}%`} color="text-blue-400" />
                  <Metric label="Capabilities"  value={pcs.capabilities.length}                    color="text-violet-400" />
                  <Metric label="Checks"        value={pcs.validation.checks.length}               color="text-zinc-400" />
                  <Metric label="Tech Debt"     value={pcs.technicalDebt.length}                   color={pcs.technicalDebt.length>0?'text-amber-400':'text-zinc-600'} />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Compliance Checks</p>
                  {pcs.validation.checks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                      <Badge label={c.verdict} style={VERDICT_STYLE[c.verdict] ?? STATUS_STYLE[c.verdict] ?? ''} />
                      <span className="text-zinc-300 text-xs flex-1">{c.name}</span>
                      <span className="text-zinc-600 text-xs text-right max-w-[200px] truncate">{c.detail}</span>
                    </div>
                  ))}
                </div>
                {pcs.technicalDebt.length > 0 && (
                  <div className="bg-amber-950/10 border border-amber-800/30 rounded-xl p-4">
                    <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">Technical Debt</p>
                    {pcs.technicalDebt.map((d, i) => <p key={i} className="text-amber-300/70 text-xs">• {d}</p>)}
                  </div>
                )}
                {pcs.recommendations.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Recommendations</p>
                    {pcs.recommendations.map((rec, i) => <p key={i} className="text-zinc-300 text-xs">• {rec}</p>)}
                  </div>
                )}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Diagnostics Summary</p>
                  <p className="text-zinc-300 text-xs font-mono">{pcs.diagnostics.summary}</p>
                  {pcs.diagnostics.errors.length > 0 && pcs.diagnostics.errors.map((e, i) => (
                    <p key={i} className="text-red-400 text-xs mt-1">✗ {e.key}: {e.value}</p>
                  ))}
                </div>
              </div>
            )}

            {/* ── Capabilities ───────────────────────────────────────── */}
            {activeTab === 'Capabilities' && pcs && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
                  {Object.entries(pcs.capabilities.reduce((acc, c) => { acc[c.type] = (acc[c.type] ?? 0) + 1; return acc; }, {})).map(([type, count]) => (
                    <div key={type} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-center">
                      <p className={`text-sm font-bold font-mono ${CAP_TYPE_COLOR[type] ?? 'text-zinc-400'}`}>{String(count)}</p>
                      <p className="text-zinc-600 text-[10px]">{type}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {pcs.capabilities.map((cap, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/40 last:border-0">
                      <span className={`text-xs font-mono font-bold w-10 ${CAP_TYPE_COLOR[cap.type] ?? 'text-zinc-400'}`}>{cap.type}</span>
                      <span className="text-zinc-200 text-xs font-mono flex-1">{cap.id}</span>
                      <div className="flex gap-1">
                        {cap.requiredAuth && <Badge label="AUTH"    style="bg-zinc-800/60 text-zinc-500 border-zinc-700" />}
                        {cap.readOnly     && <Badge label="READ"    style="bg-zinc-800/60 text-zinc-600 border-zinc-700" />}
                        {cap.paginated    && <Badge label="PAGED"   style="bg-zinc-800/60 text-zinc-600 border-zinc-700" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'Capabilities' && !pcs && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <p className="text-zinc-500 text-sm">Generate PCS first to see capability classification</p>
                <button onClick={handleGeneratePCS} disabled={loadingPCS} className="mt-3 px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded-lg text-sm font-semibold">{loadingPCS ? '...' : 'Generate PCS'}</button>
              </div>
            )}

            {/* ── Compliance ─────────────────────────────────────────── */}
            {activeTab === 'Compliance' && pcs && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Compliance Score</p>
                  <ScoreBar label="Overall Compliance" value={pcs.complianceScore} color={pcs.complianceScore>=0.7?'bg-emerald-600':pcs.complianceScore>=0.5?'bg-amber-600':'bg-red-700'} />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Certification Path</p>
                  {(['LEVEL_0','LEVEL_1','LEVEL_2','LEVEL_3','LEVEL_4']).map(level => {
                    const isCurrent = pcs.certificationLevel === level;
                    const order = { LEVEL_0: 0, LEVEL_1: 1, LEVEL_2: 2, LEVEL_3: 3, LEVEL_4: 4 };
                    const reached = order[pcs.certificationLevel] >= order[level];
                    return (
                      <div key={level} className={`flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0 ${isCurrent ? 'bg-blue-950/20 -mx-2 px-2 rounded' : ''}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${reached ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                        <span className={`text-xs font-mono font-bold w-16 ${LEVEL_COLOR[level]}`}>{level}</span>
                        <span className="text-zinc-400 text-xs">{CERTIFICATION_LABELS[level]}</span>
                        {isCurrent && <Badge label="CURRENT" style="bg-blue-900/60 text-blue-300 border-blue-700 ml-auto" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {activeTab === 'Compliance' && !pcs && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <button onClick={handleGeneratePCS} disabled={loadingPCS} className="px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded-lg text-sm font-semibold">{loadingPCS ? '...' : 'Generate PCS'}</button>
              </div>
            )}

            {/* ── Standard Spec ──────────────────────────────────────── */}
            {activeTab === 'Standard Spec' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-3">IProductionConnector — Required Methods</p>
                  {[
                    ['Authentication',    'connect(), disconnect(), isAuthenticated(), refreshAuthentication(), permissions(), authenticationDiagnostics()'],
                    ['Health',           'health(), fullHealth(), availability(), latency()'],
                    ['Metrics',          'metrics(), resetMetrics()'],
                    ['Logging',          'logExecution(), executionHistory()'],
                    ['Diagnostics',      'diagnostics()'],
                    ['Policy',           'supportedCapabilities(), authorization()'],
                    ['Validation',       'validate(), validateProduction()'],
                    ['Certification',    'certificationStatus()'],
                  ].map(([section, methods]) => (
                    <div key={section} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <span className="text-blue-400 text-xs font-mono w-28 shrink-0">{section}</span>
                      <span className="text-zinc-500 text-xs font-mono">{methods}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Certification Levels</p>
                  {Object.entries(CERTIFICATION_LABELS).map(([level, label]) => (
                    <div key={level} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0">
                      <span className={`text-xs font-mono font-bold w-16 ${LEVEL_COLOR[level]}`}>{level}</span>
                      <span className="text-zinc-400 text-xs">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Architecture Rules</p>
                  {[
                    'Provider-agnostic — no provider-specific logic in the standard',
                    'SOLID: each interface has a single responsibility',
                    'Immutable PCS — Object.freeze() applied to every generated spec',
                    'NOT_CONFIGURED (not FAILED) when credentials absent',
                    'All required checks must pass for LEVEL_3+',
                    'validateAsync() must return { valid, checks[], summary }',
                    'health() must return { status, connectorId, checkedAt, details }',
                    'Metrics: totalRequests, avgLatencyMs, p95LatencyMs, uptimeDurationMs mandatory',
                    'connectivity.ping and auth.validate capabilities are mandatory',
                    'Future connectors: Gmail, Slack, Notion, Jira must follow this spec',
                  ].map((rule, i) => (
                    <p key={i} className="text-zinc-400 text-xs py-1 border-b border-zinc-800/40 last:border-0">
                      <span className="text-blue-500 mr-2">{i+1}.</span>{rule}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!r && !pcs && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-900 flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">S</div>
            <p className="text-zinc-200 text-sm font-semibold mb-2">Production Connector Standard v1.0</p>
            <p className="text-zinc-500 text-xs mb-4">IProductionConnector · PCS Generator · Compliance Validator · Certification Levels</p>
            <div className="flex gap-2 justify-center">
              <button onClick={handleGeneratePCS} disabled={loadingPCS} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-semibold">{loadingPCS ? '...' : 'Generate PCS'}</button>
              <button onClick={handleRunTests}    disabled={running}    className="px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded-lg text-sm font-semibold">{running ? '...' : 'Run Validation Suite'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}