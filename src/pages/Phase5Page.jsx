/**
 * Phase5Page — Goal Intelligence Engine
 * Phase 5 · MemoryOS · 2026-07-13
 */
import React, { useState, useCallback, useMemo } from 'react';
import { GoalIntelligenceEngine } from '@/lib/goal-intelligence/GoalIntelligenceEngine';
import { runGIETests } from '@/lib/goal-intelligence/gieTests';

const TABS = ['Overview', 'Goals', 'Dashboard', 'Tests', 'Architecture'];

const STATUS_STYLE = {
  created:   'bg-zinc-800/60 text-zinc-400 border-zinc-700',
  validated: 'bg-sky-900/40 text-sky-400 border-sky-800',
  planned:   'bg-violet-900/40 text-violet-400 border-violet-800',
  executing: 'bg-amber-900/40 text-amber-400 border-amber-800',
  waiting:   'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  blocked:   'bg-red-900/40 text-red-400 border-red-800',
  completed: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  cancelled: 'bg-zinc-900/40 text-zinc-500 border-zinc-700',
  archived:  'bg-zinc-900/40 text-zinc-600 border-zinc-800',
  PASS:      'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:      'bg-red-900/50 text-red-300 border-red-700',
  CERTIFIED: 'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  PARTIAL:   'bg-amber-900/50 text-amber-300 border-amber-700',
  FAILED:    'bg-red-900/60 text-red-200 border-red-700',
};
const RISK_COLOR   = { low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400', critical: 'text-red-600' };
const PRI_COLOR    = { low: 'text-zinc-500', medium: 'text-sky-400', high: 'text-orange-400', critical: 'text-red-400' };
const PRI_DOT      = { low: 'bg-zinc-600', medium: 'bg-sky-500', high: 'bg-orange-500', critical: 'bg-red-500' };

const CATS = ['Lifecycle', 'Decomposition', 'Monitoring', 'Replanning', 'Recommendations', 'Integration', 'Full Engine', 'Architecture'];

const SAMPLE_GOALS = [
  { title: 'Modernize connector architecture', description: 'Migrate all connectors to PCS v1.0 standard', category: 'architecture', priority: 'high' },
  { title: 'Rebuild knowledge graph from GitHub', description: 'Sync and reconstruct knowledge from all branches', category: 'knowledge', priority: 'critical' },
  { title: 'Add test coverage for CLE', description: 'Reach 90% coverage for Cognitive Learning Engine', category: 'testing', priority: 'medium' },
  { title: 'Document CDL loop architecture', description: 'Write full ADR and architecture diagram', category: 'documentation', priority: 'low' },
];

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
function ProgressBar({ pct, color = 'bg-violet-500' }) {
  return (
    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export default function Phase5Page() {
  const [tab, setTab] = useState('Overview');
  const engine = useMemo(() => new GoalIntelligenceEngine(), []);
  const [goals, setGoals] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [testReport, setTestReport] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customCat, setCustomCat] = useState('architecture');
  const [customPri, setCustomPri] = useState('medium');

  const refresh = useCallback(() => {
    setGoals([...engine.getAllGoals()]);
    setReport(engine.buildReport());
  }, [engine]);

  const addSample = useCallback(() => {
    for (const g of SAMPLE_GOALS) {
      engine.fullLifecycle(g, { kreItemCount: Math.floor(Math.random()*10+1), cdlPhaseCount: 8 });
    }
    refresh();
  }, [engine, refresh]);

  const addCustom = useCallback(() => {
    if (!customTitle.trim()) return;
    engine.fullLifecycle({ title: customTitle, description: `Goal: ${customTitle}`, category: customCat, priority: customPri });
    setCustomTitle('');
    refresh();
  }, [engine, customTitle, customCat, customPri, refresh]);

  const doTransition = useCallback((goalId, to) => {
    try { engine.transition(goalId, to, 'user_input', `Manual transition to ${to}`); refresh(); }
    catch (e) { /* invalid transition — skip */ }
  }, [engine, refresh]);

  const doReplan = useCallback((goalId) => {
    engine.replanGoal(goalId, { trigger: 'knowledge_update', description: 'Manual replan', knowledgeUpdated: true, newOpportunities: ['New connector available'] });
    refresh();
  }, [engine, refresh]);

  const handleRunTests = useCallback(async () => {
    setTestRunning(true); setTestReport(null);
    try { setTestReport(await runGIETests()); }
    finally { setTestRunning(false); }
  }, []);

  const byCat = testReport ? CATS.reduce((acc, c) => { acc[c] = testReport.results.filter(x => x.category === c); return acc; }, {}) : {};
  const sel = selectedGoal ? goals.find(g => g.id === selectedGoal) : null;

  const STATUS_FLOW = ['validated', 'planned', 'executing', 'waiting', 'blocked', 'completed'];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-violet-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-violet-400">Phase 5</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Goal Intelligence Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Intelligence Layer · MemoryOS</span>
          </div>
          <h1 className="text-lg font-bold">Goal Intelligence Engine</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Goals as living cognitive entities — decomposed, monitored, replanned, and integrated with the full cognitive architecture</p>
          {report && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Metric label="Level"      value={report.certificationLevel} color={report.certified?'text-emerald-400':'text-amber-400'} />
              <Metric label="Goals"      value={report.totalGoals}          color="text-violet-400" />
              <Metric label="Avg Progress" value={`${report.avgProgressPct}%`} color="text-sky-400" />
              <Metric label="Recs"       value={report.totalRecommendations} color="text-amber-400" />
              <Metric label="Replans"    value={report.totalReplanEvents}    color="text-orange-400" />
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
                { l: 'Goal Lifecycle',      d: '9 states · append-only transitions' },
                { l: 'Goal Decomposition',  d: 'Objectives · Milestones · Tasks · Subgoals' },
                { l: 'Goal Monitoring',     d: 'Progress · Risk · Confidence · Prediction' },
                { l: 'Dynamic Replanning',  d: 'Knowledge + Learning updates trigger reeval' },
                { l: 'Recommendations',     d: 'Explainable · Actionable steps · Reasoned' },
                { l: 'Cognitive Integration', d: 'KRE·KFE·IRE·PRE·CDL·CLE → Knowledge Graph' },
              ].map(m => (
                <div key={m.l} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="text-violet-400 text-xs font-bold">{m.l}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{m.d}</div>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Goal Lifecycle States</p>
              <div className="flex flex-wrap gap-2">
                {['created','validated','planned','executing','waiting','blocked','completed','cancelled','archived'].map(s => (
                  <Badge key={s} label={s} style={STATUS_STYLE[s]??''} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Goals ── */}
        {tab === 'Goals' && (
          <div className="space-y-3">
            {/* Add goals */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Add Goals</p>
              <button onClick={addSample}
                className="w-full py-2 bg-violet-800 hover:bg-violet-700 rounded-lg text-xs font-semibold">
                Load 4 Sample Goals
              </button>
              <div className="flex gap-2 flex-wrap">
                <input value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                  placeholder="Goal title…"
                  className="flex-1 min-w-32 bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 rounded px-3 py-1.5 focus:outline-none focus:border-violet-600" />
                <select value={customCat} onChange={e => setCustomCat(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 rounded px-2 py-1.5">
                  {['architecture','knowledge','performance','product','security','documentation','testing','other'].map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={customPri} onChange={e => setCustomPri(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 rounded px-2 py-1.5">
                  {['low','medium','high','critical'].map(p => <option key={p}>{p}</option>)}
                </select>
                <button onClick={addCustom} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-semibold">Add</button>
              </div>
            </div>

            {goals.length === 0 && <div className="text-center text-zinc-600 py-8 text-sm">No goals yet — load samples or add a goal.</div>}

            {goals.map(g => (
              <div key={g.id} className={`bg-zinc-900 border rounded-xl p-4 cursor-pointer transition-colors ${selectedGoal===g.id?'border-violet-600':'border-zinc-800 hover:border-zinc-700'}`}
                onClick={() => setSelectedGoal(selectedGoal===g.id ? null : g.id)}>
                <div className="flex items-start gap-2 flex-wrap mb-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRI_DOT[g.priority]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-200 text-sm font-semibold">{g.title}</span>
                      <Badge label={g.status} style={STATUS_STYLE[g.status]??''} />
                      <span className={`text-xs font-bold ml-auto ${PRI_COLOR[g.priority]}`}>{g.priority}</span>
                    </div>
                    <p className="text-zinc-600 text-xs mt-0.5">{g.category}</p>
                  </div>
                </div>

                {g.latestMonitor && (
                  <div className="flex items-center gap-2 mt-1">
                    <ProgressBar pct={g.latestMonitor.progressPct} />
                    <span className="text-zinc-400 text-xs shrink-0">{g.latestMonitor.progressPct}%</span>
                    <span className={`text-xs shrink-0 ${RISK_COLOR[g.latestMonitor.riskLevel]}`}>{g.latestMonitor.riskLevel}</span>
                  </div>
                )}

                {sel?.id === g.id && (
                  <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
                    {/* Transitions */}
                    <div>
                      <p className="text-zinc-500 text-xs mb-1.5">Transition to:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_FLOW.filter(s => s !== g.status).map(s => (
                          <button key={s} onClick={e => { e.stopPropagation(); doTransition(g.id, s); }}
                            className={`px-2 py-0.5 rounded text-xs border ${STATUS_STYLE[s]??''} hover:opacity-80`}>
                            {s}
                          </button>
                        ))}
                        <button onClick={e => { e.stopPropagation(); doReplan(g.id); }}
                          className="px-2 py-0.5 rounded text-xs bg-orange-900/30 border border-orange-800 text-orange-400 hover:opacity-80">
                          Replan
                        </button>
                      </div>
                    </div>
                    {/* Decomposition summary */}
                    {g.decomposition && (
                      <div className="grid grid-cols-4 gap-1.5">
                        <Metric label="Objectives" value={g.decomposition.objectives.length} color="text-violet-400" />
                        <Metric label="Tasks"      value={g.decomposition.tasks.length}      color="text-sky-400" />
                        <Metric label="Milestones" value={g.decomposition.milestones.length} color="text-amber-400" />
                        <Metric label="Complexity" value={`${g.decomposition.complexityScore}/100`} color="text-orange-400" />
                      </div>
                    )}
                    {/* Recommendations */}
                    {engine.getRecommendations(g.id).slice(0,2).map(rec => (
                      <div key={rec.id} className="bg-zinc-800/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-xs font-bold ${PRI_COLOR[rec.priority]}`}>{rec.priority.toUpperCase()}</span>
                          <span className="text-zinc-300 text-xs font-medium">{rec.title}</span>
                        </div>
                        <p className="text-zinc-500 text-xs italic">{rec.reasoning}</p>
                      </div>
                    ))}
                    {/* Replan events */}
                    {g.replanEvents.length > 0 && (
                      <div>
                        <p className="text-zinc-600 text-xs mb-1">{g.replanEvents.length} replan event(s)</p>
                        <p className="text-zinc-500 text-xs">{g.replanEvents[g.replanEvents.length-1].reasoning}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Dashboard ── */}
        {tab === 'Dashboard' && (
          <div className="space-y-3">
            {!report || report.totalGoals === 0 ? (
              <div className="text-center text-zinc-600 py-8 text-sm">Add goals in the Goals tab first.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Total Goals"  value={report.totalGoals}          color="text-violet-400" />
                  <Metric label="Avg Progress" value={`${report.avgProgressPct}%`} color="text-sky-400" />
                  <Metric label="Avg Confidence" value={`${Math.round(report.avgConfidence*100)}%`} color="text-emerald-400" />
                  <Metric label="Total Recs"   value={report.totalRecommendations} color="text-amber-400" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">By Status</p>
                    {Object.entries(report.byStatus).filter(([,v]) => v > 0).map(([s, v]) => (
                      <div key={s} className="flex items-center gap-2 py-0.5">
                        <Badge label={s} style={STATUS_STYLE[s]??''} />
                        <span className="text-zinc-300 text-xs font-mono ml-auto">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">By Priority</p>
                    {Object.entries(report.byPriority).filter(([,v]) => v > 0).map(([p, v]) => (
                      <div key={p} className="flex items-center gap-2 py-0.5">
                        <span className={`text-xs font-bold ${PRI_COLOR[p]}`}>{p}</span>
                        <ProgressBar pct={(v / report.totalGoals) * 100} color="bg-violet-600" />
                        <span className="text-zinc-300 text-xs font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Goal progress */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Goal Progress</p>
                  {goals.filter(g => g.latestMonitor).map(g => (
                    <div key={g.id} className="mb-3 last:mb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-zinc-300 text-xs font-medium truncate flex-1">{g.title}</span>
                        <Badge label={g.status} style={STATUS_STYLE[g.status]??''} />
                        <span className="text-zinc-400 text-xs shrink-0">{g.latestMonitor.progressPct}%</span>
                      </div>
                      <ProgressBar pct={g.latestMonitor.progressPct} color={g.latestMonitor.riskLevel==='high'?'bg-red-500':g.latestMonitor.riskLevel==='medium'?'bg-amber-500':'bg-emerald-500'} />
                      {g.latestMonitor.completionPrediction && (
                        <p className="text-zinc-600 text-xs mt-0.5">Predicted: {g.latestMonitor.completionPrediction}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Top recs */}
                {report.topRecommendations.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Top Recommendations</p>
                    {report.topRecommendations.map(rec => (
                      <div key={rec.id} className="py-2 border-b border-zinc-800/40 last:border-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`text-xs font-bold ${PRI_COLOR[rec.priority]}`}>{rec.priority.toUpperCase()}</span>
                          <span className="text-zinc-200 text-xs font-medium">{rec.title}</span>
                        </div>
                        <p className="text-zinc-500 text-xs italic">{rec.reasoning}</p>
                      </div>
                    ))}
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
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Validation Suite — 22 Tests, 8 Categories</p>
                <button onClick={handleRunTests} disabled={testRunning}
                  className="px-4 py-1.5 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded text-xs font-semibold">
                  {testRunning ? '…' : 'Run'}
                </button>
              </div>
              {testRunning && (
                <div className="flex items-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-zinc-700 border-t-violet-400 rounded-full animate-spin" />
                  <span className="text-zinc-500 text-xs">Running GIE validation suite…</span>
                </div>
              )}
            </div>
            {testReport && !testRunning && (
              <>
                <div className={`rounded-xl border-2 p-3 ${testReport.overallStatus==='CERTIFIED'?'bg-emerald-950/20 border-emerald-700':testReport.overallStatus==='PARTIAL'?'bg-amber-950/10 border-amber-800':'bg-red-950/20 border-red-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={testReport.overallStatus} style={STATUS_STYLE[testReport.overallStatus]??''} />
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
                            <Badge label={t.status} style={STATUS_STYLE[t.status]??''} />
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

        {/* ── Architecture ── */}
        {tab === 'Architecture' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-violet-400 text-xs font-bold uppercase tracking-wider mb-3">Architecture Invariants</p>
              {[
                ['Goals are immutable',       'StatusTransition + ReplanEvent objects are Object.freeze()\'d'],
                ['No direct execution',       'GoalIntelligenceEngine has no connector or execute method'],
                ['Explainable planning',      'Every recommendation includes reasoning + actionableSteps'],
                ['Append-only transitions',   'Goal transitions only append — never replace history'],
                ['Provenance preserved',      'Every CognitiveIntegrationRecord has provenanceRecords[]'],
                ['Provider-agnostic',         'No GitHub/Base44 specifics — pure cognitive domain model'],
                ['SOLID compliant',           'Each sub-engine has single responsibility, injected into main engine'],
                ['Learning append-only',      'Links to CLE records — never modifies learning engine state'],
              ].map(([label, desc]) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                  <span className="w-2 h-2 rounded-full bg-violet-500 mt-0.5 shrink-0" />
                  <span className="text-zinc-200 text-xs font-semibold w-44 shrink-0">{label}</span>
                  <span className="text-zinc-500 text-xs">{desc}</span>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Files Created</p>
              {[
                ['GIETypes.ts',               'All domain models — Goal, GoalDecomposition, GoalMonitorSnapshot, ReplanEvent, GIERecommendation, CognitiveIntegrationRecord, GIEReport'],
                ['GoalDecomposer.ts',          'Goal → Objectives + Milestones + Tasks + Subgoals + Dependencies (8 category templates)'],
                ['GoalMonitor.ts',             'Continuous evaluation: progress %, confidence, risk level, blocked items, completion prediction'],
                ['GoalReplanner.ts',           'Detects priority changes, new risks/opps, dependency changes → ReplanEvent with reasoning'],
                ['GIERecommendationEngine.ts', 'Goal state → GIERecommendation[] with reasoning + actionableSteps (6 recommendation types)'],
                ['CognitiveIntegrator.ts',     'Integrates goal with KRE/KFE/IRE/PRE/CDL/CLE → CognitiveIntegrationRecord + provenance'],
                ['GoalIntelligenceEngine.ts',  'Orchestrator: createGoal, transition, decompose, monitorGoal, replanGoal, recommend, integrate, buildReport'],
                ['gieTests.ts',               '22 tests, 8 categories'],
              ].map(([f, d]) => (
                <div key={f} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                  <span className="text-violet-400 font-mono text-xs shrink-0 w-52">{f}</span>
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