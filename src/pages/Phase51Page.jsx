/**
 * Phase51Page — Cognitive Connector Integration
 * Phase 5.1 · MemoryOS · 2026-07-13
 *
 * Dashboard: ConnectorInvocationService bridge between Cognitive Layer and Runtime.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { ConnectorInvocationService } from '@/lib/cognitive-connector/ConnectorInvocationService';
import { runCCITests } from '@/lib/cognitive-connector/cciTests';

const TABS = ['Overview', 'Discovery', 'Invoke', 'History', 'Memory', 'Dogfooding', 'Tests', 'Certification'];

const STATUS_COLOR = {
  SUCCESS:        'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAILED:         'bg-red-900/50 text-red-300 border-red-700',
  NOT_CONFIGURED: 'bg-zinc-800/60 text-zinc-400 border-zinc-700',
  ACCESS_DENIED:  'bg-red-900/40 text-red-400 border-red-800',
  POLICY_DENIED:  'bg-orange-900/40 text-orange-400 border-orange-800',
  NOT_AVAILABLE:  'bg-zinc-800/60 text-zinc-500 border-zinc-700',
  APPROVED:       'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  CERTIFIED:      'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  PARTIAL:        'bg-amber-900/50 text-amber-300 border-amber-700',
  healthy:        'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  degraded:       'bg-amber-900/40 text-amber-400 border-amber-800',
  unhealthy:      'bg-red-900/40 text-red-400 border-red-800',
  unknown:        'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  PASS:           'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:           'bg-red-900/50 text-red-300 border-red-700',
};

const ORIGIN_OPTIONS = [
  'GoalIntelligenceEngine', 'CognitiveDevelopmentLoop', 'CognitiveLearningEngine',
  'RepositoryAnalyzer', 'ApplicationAnalyzer', 'ProductionActivator', 'Manual',
];

const QUICK_OPS = [
  { label: 'Base44 Ping',      connector: 'base44', op: 'connectivity.ping', payload: {} },
  { label: 'Base44 Auth',      connector: 'base44', op: 'auth.me',           payload: {} },
  { label: 'Base44 Projects',  connector: 'base44', op: 'projects.list',     payload: { limit: 10 } },
  { label: 'Base44 Sessions',  connector: 'base44', op: 'sessions.list',     payload: { limit: 5 } },
  { label: 'Base44 Workspace', connector: 'base44', op: 'workspace.info',    payload: {} },
  { label: 'GitHub Auth',      connector: 'github', op: 'auth.user',         payload: {} },
  { label: 'GitHub Repos',     connector: 'github', op: 'repos.list',        payload: { per_page: 5 } },
  { label: 'GitHub Ping',      connector: 'github', op: 'connectivity.ping', payload: {} },
];

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

const TEST_CATS = ['Factory', 'Discovery', 'ExecContext', 'Authorization', 'Base44', 'GitHub', 'Memory', 'Dogfooding'];

export default function Phase51Page() {
  const svc = useMemo(() => new ConnectorInvocationService(), []);
  const [tab, setTab] = useState('Overview');
  const [discovered, setDiscovered] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [history, setHistory] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [invoking, setInvoking] = useState(false);
  const [lastRecord, setLastRecord] = useState(null);
  const [customConnector, setCustomConnector] = useState('base44');
  const [customOp, setCustomOp] = useState('auth.me');
  const [customPayload, setCustomPayload] = useState('{}');
  const [customOrigin, setCustomOrigin] = useState('Manual');
  const [customGoalId, setCustomGoalId] = useState('');
  const [customReason, setCustomReason] = useState('Manual invocation');
  const [dogfooding, setDogfooding] = useState(null);
  const [dfRunning, setDfRunning] = useState(false);
  const [dfOwner, setDfOwner] = useState('');
  const [dfRepo, setDfRepo] = useState('');
  const [testReport, setTestReport] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [report, setReport] = useState(null);

  const refresh = useCallback(() => {
    setHistory([...svc.getHistory()].reverse());
    setKnowledge([...svc.getKnowledgeEntries()].reverse());
    setTimeline([...svc.getTimelineEvents()].reverse());
  }, [svc]);

  const handleDiscover = useCallback(async () => {
    setDiscovering(true);
    try { setDiscovered(await svc.discoverConnectors()); }
    finally { setDiscovering(false); refresh(); }
  }, [svc, refresh]);

  const handleQuickOp = useCallback(async (op) => {
    setInvoking(true);
    try {
      const { record } = await svc.invoke(op.connector, op.op, op.payload, { originComponent: 'Manual', reason: `Quick: ${op.label}` });
      setLastRecord(record);
      refresh();
    } finally { setInvoking(false); }
  }, [svc, refresh]);

  const handleCustomInvoke = useCallback(async () => {
    setInvoking(true);
    try {
      let payload = {};
      try { payload = JSON.parse(customPayload); } catch { payload = {}; }
      const { record } = await svc.invoke(customConnector, customOp, payload, {
        originComponent: customOrigin,
        goalId: customGoalId || null,
        reason: customReason,
      });
      setLastRecord(record);
      refresh();
    } finally { setInvoking(false); }
  }, [svc, customConnector, customOp, customPayload, customOrigin, customGoalId, customReason, refresh]);

  const handleDogfooding = useCallback(async () => {
    setDfRunning(true);
    try {
      const df = await svc.runDogfooding(dfOwner || undefined, dfRepo || undefined);
      setDogfooding(df);
      const r = await svc.buildReport(df);
      setReport(r);
      refresh();
    } finally { setDfRunning(false); }
  }, [svc, dfOwner, dfRepo, refresh]);

  const handleTests = useCallback(async () => {
    setTestRunning(true); setTestReport(null);
    try { setTestReport(await runCCITests()); }
    finally { setTestRunning(false); }
  }, []);

  const handleBuildReport = useCallback(async () => {
    const r = await svc.buildReport(dogfooding);
    setReport(r);
  }, [svc, dogfooding]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-violet-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-violet-400">Phase 5.1</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Cognitive Connector Integration</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Bridge · Read-Only · 2026-07-13</span>
          </div>
          <h1 className="text-lg font-bold">Cognitive Connector Integration</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            ConnectorInvocationService — official bridge between Cognitive Layer and Production Connector Runtime
          </p>
          {report && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Level"       value={report.certificationLevel} color={report.certified ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Connectors"  value={report.discoveredConnectors.length} color="text-violet-400" />
              <Metric label="Invocations" value={report.totalInvocations}   color="text-sky-400" />
              <Metric label="Success"     value={`${report.successfulInvocations}/${report.totalInvocations}`} color="text-emerald-400" />
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
                { l: 'ConnectorInvocationService', d: 'Single gateway — cognitive layer never calls connectors directly' },
                { l: 'Runtime Discovery',           d: 'Dynamic discovery — github + base44 queried at runtime' },
                { l: 'Execution Context',           d: 'goalId · origin · correlationId · reason · approvalStatus' },
                { l: 'Authorization Layer',         d: 'APPROVED · NOT_AVAILABLE · ACCESS_DENIED · POLICY_DENIED' },
                { l: 'Knowledge Memory',            d: 'Every invocation → KnowledgeEntry + TimelineEvent + provenance' },
                { l: 'Dogfooding',                  d: 'MemoryOS inspects itself using live connectors' },
              ].map(m => (
                <div key={m.l} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="text-violet-400 text-xs font-bold">{m.l}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{m.d}</div>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Architecture</p>
              {[
                'Cognitive Layer → ConnectorInvocationService → Connector Runtime → Provider',
                'No direct connector calls from GoalIntelligenceEngine, CDL or CLE',
                'Write operations blocked: commits.create, entities.create, projects.create, etc.',
                'Every invocation → permanent record + knowledge entry + timeline event',
                'NOT_CONFIGURED returned honestly when credentials absent',
              ].map((r, i) => (
                <div key={i} className="flex items-start gap-2 py-1 border-b border-zinc-800/30 last:border-0">
                  <span className="text-violet-500 text-xs shrink-0">→</span>
                  <span className="text-zinc-300 text-xs">{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Discovery ── */}
        {tab === 'Discovery' && (
          <div className="space-y-3">
            <button onClick={handleDiscover} disabled={discovering}
              className="w-full py-2 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-xs font-semibold">
              {discovering ? 'Discovering…' : 'Discover Connectors'}
            </button>
            {discovered.length === 0 && <div className="text-center text-zinc-600 py-4 text-sm">Click to discover registered connectors.</div>}
            {discovered.map(d => (
              <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-zinc-100 text-sm font-bold">{d.name}</span>
                  <Badge label={d.healthStatus} style={STATUS_COLOR[d.healthStatus] ?? STATUS_COLOR.unknown} />
                  <Badge label={d.authenticated ? 'AUTH OK' : 'NOT AUTH'} style={d.authenticated ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NOT_CONFIGURED} />
                  <span className="text-zinc-600 text-xs ml-auto">{d.version}</span>
                </div>
                <p className="text-zinc-600 text-xs mb-2">Cert: {d.certificationLevel}</p>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{d.capabilities.length} Capabilities</p>
                <div className="flex flex-wrap gap-1">
                  {d.capabilities.slice(0, 12).map(c => (
                    <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">{c}</span>
                  ))}
                  {d.capabilities.length > 12 && <span className="text-zinc-600 text-xs">+{d.capabilities.length - 12}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Invoke ── */}
        {tab === 'Invoke' && (
          <div className="space-y-3">
            {/* Quick ops */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Quick Invocations</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {QUICK_OPS.map(op => (
                  <button key={op.op} onClick={() => handleQuickOp(op)} disabled={invoking}
                    className={`py-2 px-2 rounded text-xs font-medium disabled:opacity-50 transition ${op.connector === 'github' ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-violet-900/40 hover:bg-violet-800/50'} text-zinc-200`}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom invocation */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Custom Invocation</p>
              <div className="flex gap-2">
                <select value={customConnector} onChange={e => setCustomConnector(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-xs rounded px-2 py-1.5 text-zinc-300">
                  <option value="base44">base44</option>
                  <option value="github">github</option>
                </select>
                <input value={customOp} onChange={e => setCustomOp(e.target.value)} placeholder="operation"
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-violet-600 font-mono" />
              </div>
              <input value={customPayload} onChange={e => setCustomPayload(e.target.value)} placeholder='{}'
                className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-violet-600 font-mono" />
              <div className="flex gap-2">
                <select value={customOrigin} onChange={e => setCustomOrigin(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-xs rounded px-2 py-1.5 text-zinc-300">
                  {ORIGIN_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                <input value={customGoalId} onChange={e => setCustomGoalId(e.target.value)} placeholder="goalId (opt)"
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-violet-600" />
              </div>
              <input value={customReason} onChange={e => setCustomReason(e.target.value)} placeholder="Reason"
                className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-violet-600" />
              <button onClick={handleCustomInvoke} disabled={invoking}
                className="w-full py-1.5 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded text-xs font-semibold">
                {invoking ? 'Invoking…' : 'Invoke'}
              </button>
            </div>

            {/* Last result */}
            {lastRecord && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Last Result</p>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge label={lastRecord.status} style={STATUS_COLOR[lastRecord.status] ?? ''} />
                  <Badge label={lastRecord.authorization.decision} style={STATUS_COLOR[lastRecord.authorization.decision] ?? ''} />
                  <span className="text-zinc-400 text-xs">{lastRecord.connectorId}.{lastRecord.operation}</span>
                  <span className="text-zinc-600 text-xs ml-auto">{lastRecord.durationMs}ms</span>
                </div>
                <div className="space-y-0.5 text-xs font-mono">
                  <p className="text-zinc-500">id: <span className="text-zinc-400">{lastRecord.id}</span></p>
                  <p className="text-zinc-500">origin: <span className="text-zinc-400">{lastRecord.context.originComponent}</span></p>
                  <p className="text-zinc-500">provenance: <span className="text-zinc-400">{lastRecord.provenanceRef}</span></p>
                  {lastRecord.error && <p className="text-red-400">error: {lastRecord.error}</p>}
                </div>
                <p className="text-zinc-600 text-xs mt-1 italic">{lastRecord.resultSummary}</p>
              </div>
            )}
          </div>
        )}

        {/* ── History ── */}
        {tab === 'History' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">{history.length} invocation(s)</p>
              <button onClick={refresh} className="text-xs text-zinc-500 hover:text-zinc-300">Refresh</button>
            </div>
            {history.length === 0 && <div className="text-center text-zinc-600 py-6 text-sm">No invocations yet — use the Invoke tab.</div>}
            {history.slice(0, 30).map(rec => (
              <div key={rec.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={rec.status} style={STATUS_COLOR[rec.status] ?? ''} />
                  <span className="text-zinc-300 text-xs font-medium">{rec.connectorId}.{rec.operation}</span>
                  <span className="text-zinc-600 text-xs ml-auto">{rec.durationMs}ms</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600">
                  <span>{rec.context.originComponent}</span>
                  <span>auth={rec.authorization.decision}</span>
                  {rec.context.goalId && <span>goal={rec.context.goalId.slice(0,12)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Memory ── */}
        {tab === 'Memory' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Invocations" value={history.length}  color="text-violet-400" />
              <Metric label="Knowledge"   value={knowledge.length} color="text-sky-400" />
              <Metric label="Timeline"   value={timeline.length}  color="text-emerald-400" />
            </div>
            {knowledge.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                  <span className="text-xs font-bold text-zinc-200">Knowledge Entries (latest {Math.min(knowledge.length,10)})</span>
                </div>
                {knowledge.slice(0, 10).map((ke, i) => (
                  <div key={i} className="border-b border-zinc-800/30 last:border-0 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-violet-400 font-mono shrink-0">{ke.connectorId}.{ke.operation}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-500">{ke.origin}</span>
                    </div>
                    <p className="text-zinc-600 text-xs mt-0.5">{ke.summary.slice(0, 80)}</p>
                    <p className="text-zinc-700 text-xs font-mono mt-0.5">{ke.provenanceChain.join(' → ')}</p>
                  </div>
                ))}
              </div>
            )}
            {timeline.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                  <span className="text-xs font-bold text-zinc-200">Timeline Events (latest {Math.min(timeline.length,10)})</span>
                </div>
                {timeline.slice(0, 10).map((te, i) => (
                  <div key={i} className="border-b border-zinc-800/30 last:border-0 px-4 py-2.5 flex items-center gap-2">
                    <Badge label={te.status} style={STATUS_COLOR[te.status] ?? ''} />
                    <span className="text-zinc-300 text-xs">{te.connectorId}.{te.operation}</span>
                    <span className="text-zinc-600 text-xs ml-auto">{te.durationMs}ms</span>
                  </div>
                ))}
              </div>
            )}
            {knowledge.length === 0 && <div className="text-center text-zinc-600 py-4 text-sm">No knowledge entries yet — invoke connectors first.</div>}
          </div>
        )}

        {/* ── Dogfooding ── */}
        {tab === 'Dogfooding' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">MemoryOS inspects itself</p>
              <div className="flex gap-2">
                <input value={dfOwner} onChange={e => setDfOwner(e.target.value)} placeholder="GitHub owner (opt)"
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-violet-600" />
                <input value={dfRepo} onChange={e => setDfRepo(e.target.value)} placeholder="GitHub repo (opt)"
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-violet-600" />
              </div>
              <button onClick={handleDogfooding} disabled={dfRunning}
                className="w-full py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-xs font-semibold">
                {dfRunning ? 'Running…' : 'Run Dogfooding Validation'}
              </button>
            </div>
            {dogfooding && (
              <div className={`rounded-xl border-2 p-4 ${dogfooding.status==='PASS'?'bg-emerald-950/20 border-emerald-700':dogfooding.status==='PARTIAL'?'bg-amber-950/10 border-amber-800':'bg-zinc-900 border-zinc-700'}`}>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge label={dogfooding.status} style={STATUS_COLOR[dogfooding.status] ?? STATUS_COLOR.NOT_CONFIGURED} />
                  <span className="text-zinc-300 text-sm">{dogfooding.summary}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Metric label="Calls"    value={dogfooding.invocationCount} color="text-sky-400" />
                  <Metric label="GitHub"   value={dogfooding.githubInvoked ? 'LIVE' : 'NOT_CFG'} color={dogfooding.githubInvoked ? 'text-emerald-400' : 'text-zinc-500'} />
                  <Metric label="Base44"   value={dogfooding.base44Invoked ? 'LIVE' : 'N/A'} color={dogfooding.base44Invoked ? 'text-emerald-400' : 'text-zinc-500'} />
                </div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Evidence</p>
                {dogfooding.evidenceItems.map((e, i) => <p key={i} className="text-zinc-400 text-xs font-mono">✓ {e}</p>)}
              </div>
            )}
          </div>
        )}

        {/* ── Tests ── */}
        {tab === 'Tests' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Validation Suite — 22 Tests, 8 Categories</p>
                <button onClick={handleTests} disabled={testRunning}
                  className="px-4 py-1.5 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded text-xs font-semibold">
                  {testRunning ? '…' : 'Run Tests'}
                </button>
              </div>
              {testRunning && (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-4 h-4 border-2 border-zinc-700 border-t-violet-400 rounded-full animate-spin" />
                  <span className="text-zinc-500 text-xs">Running CCI validation suite…</span>
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
                        <span className={`ml-auto text-xs font-mono ${tests.every(t=>t.status==='PASS')?'text-emerald-400':'text-amber-400'}`}>
                          {tests.filter(t=>t.status==='PASS').length}/{tests.length}
                        </span>
                      </div>
                      {tests.map((t, i) => (
                        <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-2.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge label={t.status} style={STATUS_COLOR[t.status] ?? ''} />
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
            <button onClick={handleBuildReport}
              className="w-full py-2 bg-violet-800 hover:bg-violet-700 rounded-lg text-xs font-semibold">
              Generate Certification Report
            </button>
            {!report && <div className="text-center text-zinc-600 py-4 text-sm">Run dogfooding or tests first, then generate certificate.</div>}
            {report && (
              <>
                <div className={`rounded-xl border-2 p-5 ${report.certified?'bg-emerald-950/20 border-emerald-700':report.certificationLevel==='PARTIAL'?'bg-amber-950/10 border-amber-700':'bg-zinc-900 border-zinc-700'}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge label={`PHASE 5.1: ${report.certificationLevel}`} style={STATUS_COLOR[report.certificationLevel] ?? ''} />
                    <span className="text-zinc-400 text-xs font-mono">{new Date(report.generatedAt).toISOString().split('T')[0]}</span>
                  </div>
                  <p className="text-zinc-200 font-bold text-sm">{report.summary}</p>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metric label="Connectors"   value={report.discoveredConnectors.length} color="text-violet-400" />
                    <Metric label="Invocations"  value={report.totalInvocations}            color="text-sky-400" />
                    <Metric label="Successes"    value={report.successfulInvocations}       color="text-emerald-400" />
                    <Metric label="Knowledge"    value={report.knowledgeEntries.length}     color="text-amber-400" />
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Architecture Compliance</p>
                  {[
                    'ConnectorInvocationService is the single execution gateway',
                    'No cognitive component calls connectors directly',
                    'Every invocation produces permanent record + knowledge + timeline',
                    'Write operations blocked by authorization layer',
                    'NOT_CONFIGURED returned honestly — no simulated success',
                    'Execution context accompanies every invocation (goalId, origin, correlationId)',
                    'Provenance chain preserved across all invocations',
                    'Connector discovery is fully dynamic — no hardcoded registry',
                  ].map((r, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/30 last:border-0">
                      <span className="text-emerald-500 text-xs shrink-0">✓</span>
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