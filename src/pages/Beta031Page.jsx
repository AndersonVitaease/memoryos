/**
 * Beta031Page — Cognitive Development Loop Certification
 * Beta-03.1 · MemoryOS · 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { DevelopmentLoopOrchestrator } from '@/lib/cognitive-dev-loop/DevelopmentLoopOrchestrator';
import { runCDLTests } from '@/lib/cognitive-dev-loop/cdlTests';

const TABS = ['Overview', 'Loop', 'Tests', 'Diagnostics', 'Architecture'];

const STATUS_STYLE = {
  PASS:       'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:       'bg-red-900/50 text-red-300 border-red-700',
  SKIP:       'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  CERTIFIED:  'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  PARTIAL:    'bg-amber-900/50 text-amber-300 border-amber-700',
  FAILED:     'bg-red-900/60 text-red-200 border-red-700',
  complete:   'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  skipped:    'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  failed:     'bg-red-900/40 text-red-400 border-red-800',
  pending:    'bg-amber-900/40 text-amber-400 border-amber-800',
};

const RISK_COLOR = { low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400', critical: 'text-red-600' };

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

const PHASE_LABELS = {
  repository_analysis:  'Repository Analysis',
  application_analysis: 'Application Analysis',
  cognitive_planning:   'Cognitive Planning',
  user_approval:        'User Approval',
  assisted_execution:   'Assisted Execution',
  repository_update:    'Repository Update',
  knowledge_update:     'Knowledge Update',
  loop_validation:      'Loop Validation',
};

const TEST_CATS = ['Orchestrator', 'Repository Analysis', 'Application Analysis', 'Cognitive Planning', 'Approval', 'Full Loop', 'Loop Report', 'Architecture'];

export default function Beta031Page() {
  const [activeTab, setActiveTab] = useState('Overview');
  // Loop state
  const [orch]           = useState(() => new DevelopmentLoopOrchestrator());
  const [loopPhase, setLoopPhase] = useState('idle'); // idle | analyzing | planning | awaiting_approval | executing | done
  const [repoInput, setRepoInput] = useState('owner/repo');
  const [loopState, setLoopState] = useState(null);
  const [approvalComment, setApprovalComment] = useState('');
  // Tests state
  const [testReport, setTestReport] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testOwner, setTestOwner] = useState('test-owner');
  const [testRepo, setTestRepo] = useState('test-repo');

  const refresh = () => setLoopState({
    repoAnalysis:  orch.repoAnalysis,
    appAnalysis:   orch.appAnalysis,
    plan:          orch.plan,
    approval:      orch.approval,
    execRecord:    orch.execRecord,
    knowledgeUpd:  orch.knowledgeUpd,
  });

  const handleAnalyze = useCallback(async () => {
    setLoopPhase('analyzing');
    const [owner, repo] = repoInput.split('/').map(s => s.trim());
    await orch.analyze(owner || 'unknown', repo || 'unknown');
    orch.generatePlan();
    refresh();
    setLoopPhase('awaiting_approval');
  }, [repoInput, orch]);

  const handleApprove = useCallback(() => {
    orch.requestApproval();
    orch.approve(approvalComment);
    refresh();
    setLoopPhase('executing');
    orch.executeApprovedPlan().then(() => {
      orch.buildKnowledgeUpdateRecord();
      refresh();
      setLoopPhase('done');
    });
  }, [orch, approvalComment]);

  const handleReject = useCallback(() => {
    if (!orch.plan) return;
    orch.requestApproval();
    orch.reject('Rejected by user');
    refresh();
    setLoopPhase('idle');
  }, [orch]);

  const handleRunTests = useCallback(async () => {
    setTestRunning(true); setTestReport(null);
    try { setTestReport(await runCDLTests(testOwner, testRepo)); }
    finally { setTestRunning(false); }
  }, [testOwner, testRepo]);

  const ls = loopState;
  const report = ls && loopPhase === 'done' ? orch.buildReport() : null;
  const byCat = testReport ? TEST_CATS.reduce((acc, c) => { acc[c] = testReport.results.filter(x => x.category === c); return acc; }, {}) : {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-violet-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-violet-400">Beta-03.1</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Cognitive Development Loop</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">GitHub + Base44 · PCS v1.0</span>
              </div>
              <h1 className="text-lg font-bold">Cognitive Development Loop Certification</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Complete assisted software development cycle — user-controlled, fully traceable</p>
            </div>
          </div>
          {report && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Status"   value={report.certificationLevel} color={report.certified?'text-emerald-400':'text-amber-400'} />
              <Metric label="Phases"   value={`${report.phases.filter(p=>p.status==='complete').length}/${report.phases.length}`} color="text-violet-400" />
              <Metric label="Steps"    value={report.executionPlan?.steps.length ?? 0}  color="text-zinc-200" />
              <Metric label="Duration" value={`${report.durationMs}ms`} color="text-zinc-400" />
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
              {[
                { label: 'Loop Phases', value: '8' },
                { label: 'Connectors', value: '2', sub: 'GitHub + Base44' },
                { label: 'Approval',   value: 'Required', sub: 'before every execution' },
                { label: 'Provenance', value: '100%', sub: 'every change traced' },
              ].map(m => (
                <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="text-xl font-bold text-violet-400 font-mono">{m.value}</div>
                  <div className="text-zinc-200 text-sm font-semibold mt-0.5">{m.label}</div>
                  {m.sub && <div className="text-zinc-600 text-xs mt-0.5">{m.sub}</div>}
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Loop Phases</p>
              {Object.entries(PHASE_LABELS).map(([key, label], i) => (
                <div key={key} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/40 last:border-0">
                  <span className="text-zinc-600 text-xs w-5 text-right">{i+1}</span>
                  <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                  <span className="text-zinc-300 text-xs font-medium">{label}</span>
                  {report && (
                    <span className="ml-auto">
                      <Badge label={report.phases[i]?.status ?? 'skipped'} style={STATUS_STYLE[report.phases[i]?.status] ?? ''} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Loop ── */}
        {activeTab === 'Loop' && (
          <div className="space-y-3">
            {/* Repo input */}
            {loopPhase === 'idle' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Repository to Analyze</p>
                <div className="flex gap-2">
                  <input
                    value={repoInput}
                    onChange={e => setRepoInput(e.target.value)}
                    placeholder="owner/repo"
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-600 font-mono"
                  />
                  <button onClick={handleAnalyze} className="px-4 py-2 bg-violet-800 hover:bg-violet-700 rounded-lg text-sm font-semibold">
                    Analyze
                  </button>
                </div>
              </div>
            )}

            {loopPhase === 'analyzing' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">Analyzing repository and application…</p>
              </div>
            )}

            {/* Repo + App analysis summary */}
            {ls?.repoAnalysis && ls?.appAnalysis && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs mb-2 font-bold uppercase tracking-wider">Repository</p>
                  {[
                    ['Owner/Repo', `${ls.repoAnalysis.owner}/${ls.repoAnalysis.repo}`],
                    ['Branch', ls.repoAnalysis.defaultBranch],
                    ['Commits', ls.repoAnalysis.commitCount],
                    ['Files', ls.repoAnalysis.totalFiles],
                    ['Language', ls.repoAnalysis.primaryLanguage ?? 'unknown'],
                    ['Errors', ls.repoAnalysis.errors.length],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 border-b border-zinc-800/30 last:border-0">
                      <span className="text-zinc-500 text-xs">{k}</span>
                      <span className="text-zinc-200 text-xs font-mono">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs mb-2 font-bold uppercase tracking-wider">Application</p>
                  {[
                    ['Auth', ls.appAnalysis.authStatus ? 'yes' : 'no'],
                    ['User', ls.appAnalysis.userEmail],
                    ['Projects', ls.appAnalysis.projectCount],
                    ['Sessions', ls.appAnalysis.sessionCount],
                    ['Records', ls.appAnalysis.entityCounts.reduce((s,e)=>s+e.count,0)],
                    ['Errors', ls.appAnalysis.errors.length],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 border-b border-zinc-800/30 last:border-0">
                      <span className="text-zinc-500 text-xs">{k}</span>
                      <span className="text-zinc-200 text-xs font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plan */}
            {ls?.plan && loopPhase === 'awaiting_approval' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Execution Plan — Awaiting Approval</p>
                <p className="text-zinc-500 text-xs mb-3">{ls.plan.summary}</p>
                {ls.plan.steps.map((s, i) => (
                  <div key={s.id} className="flex items-start gap-2 py-2 border-b border-zinc-800/40 last:border-0">
                    <span className="text-zinc-600 text-xs w-4">{i+1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-zinc-200 text-xs font-medium">{s.title}</span>
                        <Badge label={s.connector} style="bg-zinc-800/60 text-zinc-500 border-zinc-700" />
                        <span className={`text-xs ml-auto ${RISK_COLOR[s.riskLevel]}`}>{s.riskLevel}</span>
                      </div>
                      <p className="text-zinc-600 text-xs mt-0.5">{s.expectedImpact}</p>
                    </div>
                  </div>
                ))}
                {ls.plan.opportunities.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">Improvement Opportunities</p>
                    {ls.plan.opportunities.map(o => (
                      <div key={o.id} className="py-1.5 border-b border-zinc-800/30 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 text-xs font-medium">{o.title}</span>
                          <Badge label={o.category} style="bg-zinc-800/40 text-zinc-600 border-zinc-800" />
                          <span className={`text-xs ml-auto ${RISK_COLOR[o.riskLevel]}`}>{o.riskLevel}</span>
                        </div>
                        <p className="text-zinc-600 text-xs mt-0.5 italic">{o.reasoning}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* Approval controls */}
                <div className="mt-4 flex flex-col gap-2">
                  <input
                    value={approvalComment}
                    onChange={e => setApprovalComment(e.target.value)}
                    placeholder="Optional comment…"
                    className="bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-600"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleApprove} className="flex-1 py-2 bg-emerald-800 hover:bg-emerald-700 rounded-lg text-sm font-semibold">
                      Approve & Execute
                    </button>
                    <button onClick={handleReject} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-semibold text-zinc-400">
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            )}

            {loopPhase === 'executing' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <div className="w-7 h-7 border-4 border-zinc-700 border-t-emerald-400 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">Executing approved plan…</p>
              </div>
            )}

            {loopPhase === 'done' && ls?.execRecord && report && (
              <div className="space-y-2">
                <div className={`rounded-xl border-2 p-3 ${report.certified?'bg-emerald-950/20 border-emerald-700':'bg-amber-950/10 border-amber-800'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={report.certificationLevel} style={STATUS_STYLE[report.certificationLevel] ?? STATUS_STYLE.PARTIAL} />
                    <span className="text-sm font-bold text-zinc-200">{report.summary}</span>
                  </div>
                </div>
                {report.phases.map((p, i) => (
                  <div key={p.phase} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-zinc-600 text-xs w-4 mt-0.5">{i+1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={p.status} style={STATUS_STYLE[p.status] ?? ''} />
                        <span className="text-zinc-200 text-xs font-medium">{PHASE_LABELS[p.phase]}</span>
                        <span className="text-zinc-600 text-xs ml-auto">{p.durationMs}ms</span>
                      </div>
                      <p className="text-zinc-500 text-xs mt-0.5">{p.summary}</p>
                      {p.errors.length > 0 && <p className="text-red-400 text-xs mt-0.5">{p.errors[0]}</p>}
                    </div>
                  </div>
                ))}
                <button onClick={() => { setLoopPhase('idle'); setLoopState(null); }}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 transition-colors">
                  Reset Loop
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tests ── */}
        {activeTab === 'Tests' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Validation Suite — 20 Tests</p>
              <div className="flex gap-2 mb-3">
                <input value={testOwner} onChange={e => setTestOwner(e.target.value)} placeholder="owner" className="flex-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-3 py-1.5 focus:outline-none font-mono" />
                <span className="text-zinc-600 self-center">/</span>
                <input value={testRepo} onChange={e => setTestRepo(e.target.value)} placeholder="repo" className="flex-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-3 py-1.5 focus:outline-none font-mono" />
                <button onClick={handleRunTests} disabled={testRunning} className="px-4 py-1.5 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded text-xs font-semibold">
                  {testRunning ? '...' : 'Run'}
                </button>
              </div>
              {testRunning && <div className="flex items-center gap-2 py-2"><div className="w-4 h-4 border-2 border-zinc-700 border-t-violet-400 rounded-full animate-spin" /><span className="text-zinc-500 text-xs">Running CDL validation suite…</span></div>}
            </div>

            {testReport && !testRunning && (
              <>
                <div className={`rounded-xl border-2 p-3 ${testReport.overallStatus==='CERTIFIED'?'bg-emerald-950/20 border-emerald-700':testReport.overallStatus==='PARTIAL'?'bg-amber-950/10 border-amber-800':'bg-red-950/20 border-red-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={testReport.overallStatus} style={STATUS_STYLE[testReport.overallStatus] ?? ''} />
                    <span className="text-sm font-bold text-zinc-200">{testReport.summary}</span>
                  </div>
                </div>
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

        {/* ── Diagnostics ── */}
        {activeTab === 'Diagnostics' && (
          <div className="space-y-3">
            {ls ? (
              <>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Connector Health</p>
                  {[
                    ['GitHub Connector', ls.repoAnalysis ? `${ls.repoAnalysis.errors.length === 0 ? 'OK' : 'degraded'} — ${ls.repoAnalysis.commitCount} commits fetched` : 'Not run'],
                    ['Base44 Connector', ls.appAnalysis ? `${ls.appAnalysis.authStatus ? 'authenticated' : 'unauthenticated'} — ${ls.appAnalysis.projectCount} projects, ${ls.appAnalysis.sessionCount} sessions` : 'Not run'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <span className="text-zinc-400 text-xs w-36 shrink-0">{k}</span>
                      <span className="text-zinc-200 text-xs">{v}</span>
                    </div>
                  ))}
                </div>
                {ls.appAnalysis && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Entity Counts</p>
                    {ls.appAnalysis.entityCounts.map(e => (
                      <div key={e.entity} className="flex justify-between py-1 border-b border-zinc-800/40 last:border-0">
                        <span className="text-zinc-400 text-xs">{e.entity}</span>
                        <span className="text-zinc-200 text-xs font-mono">{e.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ls.execRecord && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Execution History</p>
                    {ls.execRecord.stepResults.map((sr, i) => (
                      <div key={sr.stepId} className="flex items-center gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                        <Badge label={sr.status} style={STATUS_STYLE[sr.status] ?? ''} />
                        <span className="text-zinc-400 text-xs w-4">{i+1}</span>
                        <span className="text-zinc-300 text-xs flex-1 truncate">{sr.stepId}</span>
                        <span className="text-zinc-600 text-xs">{sr.durationMs}ms</span>
                      </div>
                    ))}
                  </div>
                )}
                {ls.knowledgeUpd && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Knowledge Update</p>
                    {[
                      ['Items added', ls.knowledgeUpd.itemsAdded],
                      ['Timeline events', ls.knowledgeUpd.timelineEventsAdded],
                      ['Graph nodes', ls.knowledgeUpd.graphNodesAdded],
                      ['Graph edges', ls.knowledgeUpd.graphEdgesAdded],
                      ['Snapshots', ls.knowledgeUpd.snapshotsGenerated],
                      ['Provenance records', ls.knowledgeUpd.provenanceRecords.length],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1 border-b border-zinc-800/40 last:border-0">
                        <span className="text-zinc-400 text-xs">{k}</span>
                        <span className="text-zinc-200 text-xs font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-zinc-600 text-sm py-8">Run the loop first (Loop tab).</div>
            )}
          </div>
        )}

        {/* ── Architecture ── */}
        {activeTab === 'Architecture' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">Architecture Rules</p>
              {[
                ['User approval mandatory', 'executeApprovedPlan() throws if not approved', true],
                ['No auto-push',            'buildRepositoryUpdateRecord() marks commit as deferred', true],
                ['Provenance tracking',     'Every knowledge update records source + itemId + fetchedAt', true],
                ['PCS unchanged',           'CDL reuses connectors without modifying PCS or IProductionConnector', true],
                ['Connectors independent',  'GitHub + Base44 connectors unchanged — orchestrated by CDL layer only', true],
                ['KRE/KFE/IRE/PRE intact',  'Knowledge engines not modified — CDL calls them as-is', true],
                ['Explainable plans',       'Every ImprovementOpportunity has a reasoning field', true],
                ['All ops traceable',       'ExecutionRecord.stepResults has one entry per plan step', true],
              ].map(([label, desc, ok]) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                  <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-zinc-300 text-xs w-44 shrink-0 font-semibold">{label}</span>
                  <span className="text-zinc-500 text-xs">{desc}</span>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Component Stack</p>
              {[
                ['DevelopmentLoopOrchestrator', 'Coordinates all phases, never bypasses approval'],
                ['RepositoryAnalyzer',          'GitHub connector → RepositoryAnalysis'],
                ['ApplicationAnalyzer',          'Base44 connector → ApplicationAnalysis'],
                ['CognitivePlanner',             'Both analyses → ExecutionPlan + Opportunities'],
                ['GitHubConnector v2.0.0',       'Beta-01 production connector — unchanged'],
                ['Base44Connector v2.0.0',        'Beta-02 production connector — unchanged'],
                ['CDLTypes',                     'All domain models — immutable, no provider logic'],
                ['cdlTests',                     '20 tests across 8 categories'],
              ].map(([label, desc]) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                  <span className="text-violet-400 font-mono text-xs w-52 shrink-0">{label}</span>
                  <span className="text-zinc-500 text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}