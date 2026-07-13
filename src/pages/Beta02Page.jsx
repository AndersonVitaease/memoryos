/**
 * Beta02Page — Base44 Production Connector Certification
 * Beta-02 · MemoryOS Production Connector Standard v1.0 · 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runBase44ProductionTests } from '@/lib/connector-runtime/connectors/base44ProductionTests';
import { Base44Connector } from '@/lib/connector-runtime/connectors/Base44Connector';
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
  PASS:       'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:       'bg-red-900/50 text-red-300 border-red-700',
  SKIP:       'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  CERTIFIED:  'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  FAILED:     'bg-red-900/60 text-red-200 border-red-700',
  WARNING:    'bg-amber-900/50 text-amber-300 border-amber-700',
};
const LEVEL_COLOR = { LEVEL_0: 'text-red-400', LEVEL_1: 'text-orange-400', LEVEL_2: 'text-amber-400', LEVEL_3: 'text-blue-400', LEVEL_4: 'text-emerald-400' };
const SCORE_COLOR = v => v >= 0.7 ? 'bg-emerald-600' : v >= 0.5 ? 'bg-amber-600' : 'bg-red-700';

const TEST_CATS = ['IProductionConnector', 'Authentication', 'Project Operations', 'Health', 'Metrics', 'PCS Compliance', 'Architecture'];
const TABS = ['Overview', 'Tests', 'PCS Report', 'Diagnostics', 'Architecture'];

export default function Beta02Page() {
  const [report, setReport] = useState(null);
  const [pcs, setPCS] = useState(null);
  const [running, setRunning] = useState(false);
  const [loadingPCS, setLoadingPCS] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  const handleRun = useCallback(async () => {
    setRunning(true); setReport(null);
    try { setReport(await runBase44ProductionTests()); }
    finally { setRunning(false); }
  }, []);

  const handleGeneratePCS = useCallback(async () => {
    setLoadingPCS(true);
    try {
      const c = new Base44Connector();
      await c.initialize({ executionId: 'pcs_ui', userId: 'ui', policyContext: {} });
      setPCS(await new PCSGenerator().generate(c));
    } finally { setLoadingPCS(false); }
  }, []);

  const r = report;
  const byCat = r ? TEST_CATS.reduce((acc, cat) => { acc[cat] = r.results.filter(x => x.category === cat); return acc; }, {}) : {};
  const levelKey = r ? r.certificationLevel.split(' ')[0] : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-violet-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-violet-400">Beta-02</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Base44 Production Connector</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">v2.0.0 · PCS v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">Base44 Production Connector Certification</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Second certified PCS implementation — validates PCS reusability</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleGeneratePCS} disabled={loadingPCS}
                className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors">
                {loadingPCS ? 'Generating...' : 'Generate PCS'}
              </button>
              <button onClick={handleRun} disabled={running}
                className="px-4 py-2 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors">
                {running ? 'Certifying...' : 'Run Certification'}
              </button>
            </div>
          </div>
          {r && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Status"       value={r.overallStatus}               color={r.overallStatus==='CERTIFIED'?'text-emerald-400':'text-red-400'} />
              <Metric label="Pass"         value={r.passed}                       color="text-emerald-400" />
              <Metric label="Fail"         value={r.failed}                       color={r.failed>0?'text-red-400':'text-zinc-600'} />
              <Metric label="Level"        value={levelKey}                       color={LEVEL_COLOR[levelKey] ?? 'text-zinc-400'} />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Certifying Base44 against PCS v1.0…</p>
            <p className="text-zinc-600 text-xs mt-1">IProductionConnector · Auth · Projects · Health · Metrics · Compliance</p>
          </div>
        )}

        {(r || pcs) && !running && (
          <>
            {r && (
              <div className={`rounded-xl border-2 p-3 ${r.overallStatus==='CERTIFIED'?'bg-emerald-950/20 border-emerald-700':'bg-red-950/20 border-red-700'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={r.overallStatus} style={STATUS_STYLE[r.overallStatus] ?? ''} />
                  <span className="text-sm font-bold text-zinc-200">{r.summary}</span>
                  {!r.pcsModificationRequired && <Badge label="PCS REUSED UNCHANGED" style="bg-zinc-800/60 text-zinc-400 border-zinc-700 ml-auto" />}
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

            {/* ── Overview ── */}
            {activeTab === 'Overview' && r && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Total Tests"   value={r.total}                              color="text-zinc-200" />
                  <Metric label="Compliance"    value={`${(r.complianceScore*100).toFixed(0)}%`} color="text-violet-400" />
                  <Metric label="Duration"      value={`${r.durationMs}ms`}                  color="text-zinc-400" />
                  <Metric label="PCS Modified"  value={r.pcsModificationRequired?'YES':'NO'} color={r.pcsModificationRequired?'text-red-400':'text-emerald-400'} />
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

            {/* ── Tests ── */}
            {activeTab === 'Tests' && r && (
              <div className="space-y-2">
                {TEST_CATS.map(cat => {
                  const tests = byCat[cat] ?? [];
                  if (tests.length === 0) return null;
                  return (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                        <span className="text-xs font-bold text-zinc-300">{cat}</span>
                        <span className="text-zinc-600 text-xs ml-2">({tests.length})</span>
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

            {/* ── PCS Report ── */}
            {activeTab === 'PCS Report' && !pcs && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <button onClick={handleGeneratePCS} disabled={loadingPCS} className="px-4 py-2 bg-violet-800 hover:bg-violet-700 rounded-lg text-sm font-semibold">{loadingPCS ? '...' : 'Generate PCS Report'}</button>
              </div>
            )}
            {activeTab === 'PCS Report' && pcs && (
              <div className="space-y-3">
                <div className={`rounded-xl border-2 p-4 bg-violet-950/20 border-violet-700/50`}>
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <Badge label={`${pcs.certificationLevel} — ${pcs.certification.label}`} style={LEVEL_COLOR[pcs.certificationLevel]?.replace('text-','bg-').replace('400','900/60') + ' border-violet-700 text-violet-200'} />
                    <span className="font-bold text-sm">{pcs.connectorName} v{pcs.connectorVersion}</span>
                  </div>
                  <p className="text-zinc-400 text-xs">{pcs.description}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Compliance Score</p>
                  <ScoreBar label="Overall" value={pcs.complianceScore} color={SCORE_COLOR(pcs.complianceScore)} />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Compliance Checks</p>
                  {pcs.validation.checks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                      <Badge label={c.verdict} style={STATUS_STYLE[c.verdict] ?? ''} />
                      <span className="text-zinc-300 text-xs flex-1">{c.name}</span>
                      <span className="text-zinc-600 text-xs max-w-[200px] truncate text-right">{c.detail}</span>
                    </div>
                  ))}
                </div>
                {pcs.technicalDebt.length > 0 && (
                  <div className="bg-amber-950/10 border border-amber-800/30 rounded-xl p-3">
                    <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">Technical Debt</p>
                    {pcs.technicalDebt.map((d, i) => <p key={i} className="text-amber-300/70 text-xs">• {d}</p>)}
                  </div>
                )}
              </div>
            )}

            {/* ── Diagnostics ── */}
            {activeTab === 'Diagnostics' && r && (
              <div className="space-y-3">
                {[
                  ['IProductionConnector', byCat['IProductionConnector'] ?? []],
                  ['Authentication',       byCat['Authentication'] ?? []],
                  ['Health',               byCat['Health'] ?? []],
                  ['Metrics',              byCat['Metrics'] ?? []],
                ].map(([cat, tests]) => tests.length === 0 ? null : (
                  <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">{cat}</p>
                    <div className="space-y-1.5">
                      {tests.map((t, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Badge label={t.status} style={STATUS_STYLE[t.status] ?? ''} />
                          <span className="text-zinc-300 text-xs flex-1">{t.name}</span>
                          <span className="text-zinc-600 text-xs max-w-[200px] truncate">{t.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Architecture ── */}
            {activeTab === 'Architecture' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">PCS Reusability Validation</p>
                  {[
                    ['PCS Modified?',           r ? (r.pcsModificationRequired ? 'YES — see details' : 'NO — PCS reused unchanged') : '—', !r?.pcsModificationRequired],
                    ['Standard validated by',   'ProductionComplianceValidator v1.0',                           true],
                    ['GitHub (Beta-01)',         'Reference Connector — LEVEL_3/4',                             true],
                    ['Base44 (Beta-02)',         'Second certified connector — different platform, same PCS',    true],
                    ['IProductionConnector',     'Fully implemented on both connectors without PCS changes',     true],
                    ['Certification Levels',     'LEVEL_0 through LEVEL_4 — same scale for both',               true],
                    ['PCS conclusion',           'Standard is reusable across different connector platforms',    true],
                  ].map(([label, value, ok]) => (
                    <div key={label} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <span className={`text-xs w-2 h-2 rounded-full mt-0.5 shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-zinc-400 text-xs w-44 shrink-0">{label}</span>
                      <span className={`text-xs ${ok ? 'text-zinc-300' : 'text-red-300'}`}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Operations (v2.0.0)</p>
                  <div className="grid grid-cols-2 gap-1">
                    {['connectivity.ping','auth.me','auth.validate','auth.permissions','workspace.info','app.info','projects.list','projects.get','sessions.list','sessions.get','entities.list','entities.count','health.full','test.ping','test.echo'].map(op => (
                      <span key={op} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-400">{op}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!r && !pcs && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-900 flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">B</div>
            <p className="text-zinc-200 text-sm font-semibold mb-2">Base44 Production Connector — Beta-02</p>
            <p className="text-zinc-500 text-xs mb-1">Full IProductionConnector implementation · PCS v1.0 compliance</p>
            <p className="text-zinc-600 text-xs">Validates PCS reusability: GitHub + Base44 certified, same standard</p>
          </div>
        )}
      </div>
    </div>
  );
}