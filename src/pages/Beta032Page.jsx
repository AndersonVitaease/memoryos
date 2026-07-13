/**
 * Beta032Page — Cognitive Learning Engine
 * Beta-03.2 · MemoryOS · 2026-07-13
 */
import React, { useState, useCallback, useMemo } from 'react';
import { CognitiveLearningEngine } from '@/lib/cognitive-learning-engine/CognitiveLearningEngine';
import { runCLETests } from '@/lib/cognitive-learning-engine/cleTests';

const TABS = ['Overview', 'Learn', 'History', 'Tests', 'Architecture'];

const BADGE = {
  PASS:       'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:       'bg-red-900/50 text-red-300 border-red-700',
  SKIP:       'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  CERTIFIED:  'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  PARTIAL:    'bg-amber-900/50 text-amber-300 border-amber-700',
  FAILED:     'bg-red-900/60 text-red-200 border-red-700',
  SUCCESS:              'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  PARTIAL_SUCCESS:      'bg-amber-900/40 text-amber-400 border-amber-800',
  FAILURE:              'bg-red-900/40 text-red-400 border-red-800',
  UNEXPECTED_EFFECT:    'bg-orange-900/40 text-orange-400 border-orange-800',
  MISSING_EFFECT:       'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  success_pattern:      'text-emerald-400',
  failure_pattern:      'text-red-400',
  performance_insight:  'text-sky-400',
  connector_reliability:'text-amber-400',
  planning_accuracy:    'text-violet-400',
};

const IMP_COLOR = { critical: 'text-red-400', high: 'text-orange-400', medium: 'text-amber-400', low: 'text-zinc-400' };
const PRI_COLOR = { high: 'text-red-400', medium: 'text-amber-400', low: 'text-zinc-500' };

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

const CATS = ['Observation', 'Outcome Comparison', 'Learning Generation', 'Confidence', 'Recommendations', 'Knowledge', 'Full Engine', 'Architecture'];

const SCENARIOS = {
  success: {
    label: 'Full Success',
    plan: {
      id: 'demo_plan_1', generatedAt: Date.now(), title: 'Demo Plan', summary: '2 steps',
      steps: [
        { id: 'ds1', order: 1, title: 'Sync commits', connector: 'github', operation: 'commits.list', riskLevel: 'low', estimatedDurationMs: 800, requiresApproval: false, affectedFiles: [], expectedImpact: 'Commits indexed', description: '' },
        { id: 'ds2', order: 2, title: 'Snapshot app', connector: 'base44', operation: 'entities.list', riskLevel: 'low', estimatedDurationMs: 400, requiresApproval: false, affectedFiles: [], expectedImpact: 'Snapshot created', description: '' },
      ],
      opportunities: [], risk: { overall: 'low', items: [] },
      dependencies: { directDependencies: [], knowledgeDependencies: [], connectorDependencies: [] },
      requiresConnectors: ['github', 'base44'], estimatedTotalMs: 1200, approved: true, approvedAt: Date.now(),
    },
    record: {
      id: 'demo_exec_1', planId: 'demo_plan_1', startedAt: Date.now()-1200, completedAt: Date.now(), durationMs: 1150,
      stepResults: [
        { stepId: 'ds1', status: 'complete', startedAt: Date.now()-1200, completedAt: Date.now()-400, durationMs: 800, output: { commits: 5 }, error: null, warnings: [] },
        { stepId: 'ds2', status: 'complete', startedAt: Date.now()-400, completedAt: Date.now(), durationMs: 350, output: { records: 120 }, error: null, warnings: [] },
      ],
      operationsExecuted: 2, errors: [], warnings: [], overallSuccess: true,
    },
  },
  partial: {
    label: 'Partial Success',
    plan: {
      id: 'demo_plan_2', generatedAt: Date.now(), title: 'Demo Plan 2', summary: '2 steps',
      steps: [
        { id: 'ps1', order: 1, title: 'Sync commits', connector: 'github', operation: 'commits.list', riskLevel: 'low', estimatedDurationMs: 600, requiresApproval: false, affectedFiles: [], expectedImpact: 'Commits indexed', description: '' },
        { id: 'ps2', order: 2, title: 'Rebuild knowledge', connector: 'knowledge', operation: 'full_reconstruction', riskLevel: 'medium', estimatedDurationMs: 1500, requiresApproval: false, affectedFiles: [], expectedImpact: 'Graph rebuilt', description: '' },
      ],
      opportunities: [], risk: { overall: 'medium', items: [] },
      dependencies: { directDependencies: [], knowledgeDependencies: [], connectorDependencies: [] },
      requiresConnectors: ['github'], estimatedTotalMs: 2100, approved: true, approvedAt: Date.now(),
    },
    record: {
      id: 'demo_exec_2', planId: 'demo_plan_2', startedAt: Date.now()-2100, completedAt: Date.now(), durationMs: 2800,
      stepResults: [
        { stepId: 'ps1', status: 'complete', startedAt: Date.now()-2800, completedAt: Date.now()-1500, durationMs: 1300, output: null, error: null, warnings: ['Rate limit at 80%'] },
        { stepId: 'ps2', status: 'failed', startedAt: Date.now()-1500, completedAt: Date.now(), durationMs: 1500, output: null, error: 'Knowledge source unavailable', warnings: [] },
      ],
      operationsExecuted: 1, errors: ['Knowledge source unavailable'], warnings: ['Rate limit at 80%'], overallSuccess: false,
    },
  },
  failure: {
    label: 'Full Failure',
    plan: {
      id: 'demo_plan_3', generatedAt: Date.now(), title: 'Demo Plan 3', summary: '1 step',
      steps: [
        { id: 'fs1', order: 1, title: 'Deploy change', connector: 'base44', operation: 'entities.create', riskLevel: 'high', estimatedDurationMs: 300, requiresApproval: true, affectedFiles: ['src/App.jsx'], expectedImpact: 'Entity created', description: '' },
      ],
      opportunities: [], risk: { overall: 'high', items: [] },
      dependencies: { directDependencies: [], knowledgeDependencies: [], connectorDependencies: [] },
      requiresConnectors: ['base44'], estimatedTotalMs: 300, approved: true, approvedAt: Date.now(),
    },
    record: {
      id: 'demo_exec_3', planId: 'demo_plan_3', startedAt: Date.now()-300, completedAt: Date.now(), durationMs: 280,
      stepResults: [
        { stepId: 'fs1', status: 'failed', startedAt: Date.now()-300, completedAt: Date.now(), durationMs: 280, output: null, error: '403 Forbidden — insufficient permissions', warnings: [] },
      ],
      operationsExecuted: 0, errors: ['403 Forbidden — insufficient permissions'], warnings: [], overallSuccess: false,
    },
  },
};

function ConfidenceBar({ dim, val }) {
  const pct = Math.round(val * 100);
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-zinc-400 text-xs w-40 shrink-0">{dim}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-zinc-300 text-xs font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function Beta032Page() {
  const [tab, setTab] = useState('Overview');
  const engine = useMemo(() => new CognitiveLearningEngine(), []);
  const [sessions, setSessions] = useState([]);
  const [lastSession, setLastSession] = useState(null);
  const [report, setReport] = useState(null);
  const [testReport, setTestReport] = useState(null);
  const [testRunning, setTestRunning] = useState(false);

  const runScenario = useCallback((key) => {
    const sc = SCENARIOS[key];
    const session = engine.learn(sc.plan, sc.record, `demo_${key}`);
    const rpt = engine.buildReport();
    setSessions([...engine.getSessions()]);
    setLastSession(session);
    setReport(rpt);
  }, [engine]);

  const handleRunTests = useCallback(async () => {
    setTestRunning(true); setTestReport(null);
    try { setTestReport(await runCLETests()); }
    finally { setTestRunning(false); }
  }, []);

  const confState = report?.confidenceState;
  const byCat = testReport ? CATS.reduce((acc, c) => { acc[c] = testReport.results.filter(x => x.category === c); return acc; }, {}) : {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-emerald-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-emerald-400">Beta-03.2</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Cognitive Learning Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Observe · Compare · Learn · Adjust · Recommend</span>
          </div>
          <h1 className="text-lg font-bold">Cognitive Learning Engine</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Evaluates execution outcomes — generates immutable learning records, confidence adjustments, and recommendations</p>
          {report && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Metric label="Level"      value={report.certificationLevel} color={report.certified?'text-emerald-400':'text-amber-400'} />
              <Metric label="Sessions"   value={report.totalSessions}       color="text-violet-400" />
              <Metric label="Lessons"    value={report.totalLearningRecords} color="text-sky-400" />
              <Metric label="Recs"       value={report.totalRecommendations} color="text-amber-400" />
              <Metric label="Confidence" value={`${Math.round((confState?.dimensions?.overall ?? 0.75)*100)}%`} color="text-emerald-400" />
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

        {/* ── Overview ─────────────────────────────────────────────────── */}
        {tab === 'Overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { l: 'Observe executions',   d: 'Consume ExecutionRecords from CDL' },
                { l: 'Compare expectations', d: 'Plan vs observed — step by step' },
                { l: 'Immutable records',    d: 'Frozen LearningRecord objects' },
                { l: 'Confidence tracking',  d: '5 dimensions, evidence-backed' },
                { l: 'Explainable recs',     d: 'Every recommendation has reasoning' },
                { l: 'Knowledge integration',d: 'Append-only graph + timeline entries' },
              ].map(m => (
                <div key={m.l} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="text-emerald-400 text-xs font-bold">{m.l}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{m.d}</div>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Learning Cycle</p>
              {[
                ['ExecutionRecord (CDL input)', 'Input consumed from Development Loop'],
                ['OutcomeEvaluator',            'Plan vs reality comparison — StepComparison[]'],
                ['LearningRecordFactory',       'OutcomeComparison → immutable LearningRecord[]'],
                ['ConfidenceManager',           'Delta applied to 5 confidence dimensions'],
                ['RecommendationEngine',        'Actionable CLERecommendation[] with reasoning'],
                ['KnowledgeIntegrator',         'Append-only graph nodes + timeline + provenance'],
                ['CognitiveLearningEngine',     'Orchestrator → LearningSession + CLEReport'],
              ].map(([label, desc], i) => (
                <div key={label} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/40 last:border-0">
                  <span className="text-zinc-600 text-xs w-4">{i+1}</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-zinc-300 text-xs font-medium w-44 shrink-0">{label}</span>
                  <span className="text-zinc-600 text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Learn ──────────────────────────────────────────────────────── */}
        {tab === 'Learn' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Run Learning Scenario</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {Object.entries(SCENARIOS).map(([key, sc]) => (
                  <button key={key} onClick={() => runScenario(key)}
                    className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                      key==='success' ? 'bg-emerald-900/30 border-emerald-800 hover:bg-emerald-900/50 text-emerald-300'
                      : key==='partial' ? 'bg-amber-900/30 border-amber-800 hover:bg-amber-900/50 text-amber-300'
                      : 'bg-red-900/30 border-red-800 hover:bg-red-900/50 text-red-300'
                    }`}>
                    {sc.label}
                  </button>
                ))}
              </div>
              <p className="text-zinc-700 text-xs">Feed a synthetic ExecutionRecord into the CognitiveLearningEngine and observe the learning cycle.</p>
            </div>

            {lastSession && (
              <>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Badge label={lastSession.outcome.overallOutcome} style={BADGE[lastSession.outcome.overallOutcome]??''} />
                    <span className="text-zinc-300 text-sm font-semibold truncate">Session: {lastSession.id}</span>
                    <span className="text-zinc-500 text-xs ml-auto shrink-0">score={lastSession.overallLearningScore}/100</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metric label="Steps compared" value={lastSession.outcome.stepsCompared} />
                    <Metric label="Steps met"       value={lastSession.outcome.stepsMet}      color="text-emerald-400" />
                    <Metric label="Steps failed"    value={lastSession.outcome.stepsFailed}   color={lastSession.outcome.stepsFailed>0?'text-red-400':'text-zinc-400'} />
                    <Metric label="Success rate"    value={`${Math.round(lastSession.outcome.successRate*100)}%`} color="text-violet-400" />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200">Learning Records ({lastSession.learningRecords.length})</span>
                    <span className="text-zinc-600 text-xs">frozen / immutable</span>
                  </div>
                  {lastSession.learningRecords.map(lr => (
                    <div key={lr.id} className="border-b border-zinc-800/40 last:border-0 px-4 py-3">
                      <div className="flex items-start gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-mono font-bold ${BADGE[lr.learningType]??'text-zinc-400'}`}>{lr.learningType}</span>
                        <span className={`text-xs font-bold ${IMP_COLOR[lr.importance]}`}>{lr.importance}</span>
                        <span className="text-zinc-200 text-xs font-medium">{lr.title}</span>
                      </div>
                      <p className="text-zinc-500 text-xs mb-1">{lr.description}</p>
                      <div className="flex gap-4 text-xs flex-wrap">
                        <span className={lr.confidenceDelta>=0?'text-emerald-400':'text-red-400'}>confidence {lr.confidenceDelta>=0?'+':''}{lr.confidenceDelta.toFixed(2)}</span>
                        <span className={lr.riskDelta<=0?'text-emerald-400':'text-orange-400'}>risk {lr.riskDelta>=0?'+':''}{lr.riskDelta.toFixed(2)}</span>
                        <span className="text-zinc-600">evidence: {lr.evidence.length}</span>
                      </div>
                      <p className="text-violet-400 text-xs mt-1 italic">{lr.recommendation}</p>
                    </div>
                  ))}
                </div>

                {lastSession.recommendations.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-zinc-800">
                      <span className="text-xs font-bold text-zinc-200">Recommendations ({lastSession.recommendations.length})</span>
                    </div>
                    {lastSession.recommendations.map(rec => (
                      <div key={rec.id} className="border-b border-zinc-800/40 last:border-0 px-4 py-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-bold ${PRI_COLOR[rec.priority]}`}>{rec.priority.toUpperCase()}</span>
                          <Badge label={rec.category} style="bg-zinc-800/40 text-zinc-500 border-zinc-700" />
                          <span className="text-zinc-200 text-xs font-medium">{rec.title}</span>
                        </div>
                        <p className="text-zinc-500 text-xs mb-1 italic">{rec.reasoning}</p>
                        <ul className="space-y-0.5">
                          {rec.actionableSteps.map((s, i) => (
                            <li key={i} className="text-zinc-400 text-xs flex gap-1.5"><span className="text-zinc-700">→</span>{s}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {confState && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Confidence State</p>
                    {Object.entries(confState.dimensions).map(([dim, val]) => (
                      <ConfidenceBar key={dim} dim={dim} val={Number(val)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── History ────────────────────────────────────────────────────── */}
        {tab === 'History' && (
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <div className="text-center text-zinc-600 py-10 text-sm">No sessions yet — run scenarios in the Learn tab.</div>
            ) : (
              <>
                {sessions.map((s, i) => (
                  <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-zinc-500 text-xs">#{i+1}</span>
                      <Badge label={s.outcome.overallOutcome} style={BADGE[s.outcome.overallOutcome]??''} />
                      <span className="text-zinc-400 text-xs font-mono truncate">{s.id}</span>
                      <span className="text-zinc-600 text-xs ml-auto shrink-0">score={s.overallLearningScore}/100</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <Metric label="Records"  value={s.learningRecords.length} />
                      <Metric label="Recs"      value={s.recommendations.length} color="text-amber-400" />
                      <Metric label="Knowledge" value={s.knowledgeEntries.length} color="text-sky-400" />
                      <Metric label="Duration"  value={`${s.durationMs}ms`}       color="text-zinc-400" />
                    </div>
                  </div>
                ))}
                {report && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Aggregate Report</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge label={report.certificationLevel} style={BADGE[report.certificationLevel]??''} />
                      <span className="text-zinc-300 text-sm">{report.summary}</span>
                    </div>
                    {report.topLessons.length > 0 && (
                      <div className="mt-3">
                        <p className="text-zinc-600 text-xs mb-1 uppercase tracking-wider">Top Lessons</p>
                        {report.topLessons.slice(0,3).map(lr => (
                          <div key={lr.id} className="flex items-start gap-2 py-1 text-xs border-b border-zinc-800/30 last:border-0">
                            <span className={`shrink-0 font-bold ${IMP_COLOR[lr.importance]}`}>{lr.importance}</span>
                            <span className="text-zinc-300">{lr.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tests ──────────────────────────────────────────────────────── */}
        {tab === 'Tests' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Validation Suite — 20 Tests, 8 Categories</p>
                <button onClick={handleRunTests} disabled={testRunning}
                  className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-xs font-semibold">
                  {testRunning ? '…' : 'Run'}
                </button>
              </div>
              {testRunning && (
                <div className="flex items-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
                  <span className="text-zinc-500 text-xs">Running CLE validation suite…</span>
                </div>
              )}
            </div>
            {testReport && !testRunning && (
              <>
                <div className={`rounded-xl border-2 p-3 ${testReport.overallStatus==='CERTIFIED'?'bg-emerald-950/20 border-emerald-700':testReport.overallStatus==='PARTIAL'?'bg-amber-950/10 border-amber-800':'bg-red-950/20 border-red-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={testReport.overallStatus} style={BADGE[testReport.overallStatus]??''} />
                    <span className="text-sm font-bold text-zinc-200">{testReport.summary}</span>
                  </div>
                </div>
                {CATS.map(cat => {
                  const tests = byCat[cat] ?? [];
                  if (!tests.length) return null;
                  return (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800 flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-200">{cat}</span>
                        <span className="text-zinc-600 text-xs">({tests.length})</span>
                        <span className={`ml-auto text-xs font-mono ${tests.every(t=>t.status==='PASS')?'text-emerald-400':'text-red-400'}`}>
                          {tests.filter(t=>t.status==='PASS').length}/{tests.length}
                        </span>
                      </div>
                      {tests.map((t, i) => (
                        <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-2.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge label={t.status} style={BADGE[t.status]??''} />
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

        {/* ── Architecture ────────────────────────────────────────────────── */}
        {tab === 'Architecture' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">Architecture Invariants</p>
              {[
                ['No connector calls',       'CognitiveLearningEngine has no connector references'],
                ['No history mutation',      'Append-only — sessions accumulate, never replaced'],
                ['Immutable records',        'LearningRecord objects are Object.freeze()\'d'],
                ['Evidence mandatory',       'Every LearningRecord has non-empty evidence[]'],
                ['Provenance preserved',     'Every KnowledgeEntry has provenanceRecords[]'],
                ['Confidence evidenced',     'Every ConfidenceAdjustment includes evidence string'],
                ['Reasoning mandatory',      'Every CLERecommendation has reasoning field'],
                ['CDL decoupled',            'CLE consumes CDL types only — no CDL engine import'],
              ].map(([label, desc]) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-zinc-200 text-xs font-semibold w-44 shrink-0">{label}</span>
                  <span className="text-zinc-500 text-xs">{desc}</span>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Files Created</p>
              {[
                ['CLETypes.ts',               'All domain models — OutcomeComparison, LearningRecord, ConfidenceAdjustment, CLEReport…'],
                ['OutcomeEvaluator.ts',        'Plan vs ExecutionRecord → OutcomeComparison with StepComparison[]'],
                ['LearningRecordFactory.ts',   'OutcomeComparison → frozen LearningRecord[] (4 learning dimensions)'],
                ['ConfidenceManager.ts',       '5-dimension confidence + risk state, append-only adjustments'],
                ['RecommendationEngine.ts',    'LearningRecord[] → CLERecommendation[] with reasoning + actionableSteps'],
                ['KnowledgeIntegrator.ts',     'Append-only graph nodes + timeline events + provenance'],
                ['CognitiveLearningEngine.ts', 'Orchestrator: learn() → LearningSession, buildReport() → CLEReport'],
                ['cleTests.ts',               '20 tests, 8 categories — never simulates success'],
              ].map(([f, d]) => (
                <div key={f} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                  <span className="text-emerald-400 font-mono text-xs shrink-0 w-52">{f}</span>
                  <span className="text-zinc-500 text-xs">{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}