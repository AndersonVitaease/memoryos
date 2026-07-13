/**
 * Phase52Page — End-to-End Cognitive Certification
 * Phase 5.2 · MemoryOS · 2026-07-13
 */
import React, { useState, useCallback, useMemo } from 'react';
import { CognitiveCertificationEngine } from '@/lib/cognitive-certification/CognitiveCertificationEngine';
import { runCCETests } from '@/lib/cognitive-certification/cceTests';

const TABS = ['Overview', 'Scenarios', 'Readiness', 'Metrics', 'Recovery', 'Tests', 'Certificate'];

const SC = {
  CERTIFIED:      'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  PARTIAL:        'bg-amber-900/50 text-amber-300 border-amber-700',
  NOT_CONFIGURED: 'bg-zinc-800/60 text-zinc-400 border-zinc-700',
  FAILED:         'bg-red-900/50 text-red-300 border-red-700',
  PASS:           'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL:           'bg-red-900/50 text-red-300 border-red-700',
  READY:          'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  DEGRADED:       'bg-amber-900/40 text-amber-400 border-amber-800',
  SKIPPED:        'bg-zinc-800/40 text-zinc-500 border-zinc-700',
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
function ScoreBar({ score }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-400 w-8 shrink-0 text-right">{pct}</span>
    </div>
  );
}

export default function Phase52Page() {
  const cce = useMemo(() => new CognitiveCertificationEngine(), []);
  const [tab, setTab] = useState('Overview');
  const [running, setRunning] = useState(false);
  const [cert, setCert] = useState(null);
  const [ghOwner, setGhOwner] = useState('');
  const [ghRepo, setGhRepo]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [tests, setTests] = useState(null);
  const [testRunning, setTestRunning] = useState(false);

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const handleCertify = useCallback(async () => {
    setRunning(true); setCert(null);
    try { setCert(await cce.certify(ghOwner || undefined, ghRepo || undefined)); }
    finally { setRunning(false); }
  }, [cce, ghOwner, ghRepo]);

  const handleTests = useCallback(async () => {
    setTestRunning(true); setTests(null);
    try { setTests(await runCCETests()); }
    finally { setTestRunning(false); }
  }, []);

  const LAYERS = cert ? [
    cert.architecturalReadiness, cert.operationalReadiness, cert.connectorReadiness,
    cert.knowledgeReadiness, cert.learningReadiness, cert.goalIntelligenceReadiness,
  ] : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-emerald-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-emerald-400">Phase 5.2</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">End-to-End Cognitive Certification</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">MemoryOS Core v1.0</span>
          </div>
          <h1 className="text-lg font-bold">MemoryOS Core Operational Certification</h1>
          <p className="text-zinc-400 text-sm mt-0.5">7 end-to-end scenarios · Real connectors · Full cognitive stack</p>
          <div className="mt-4 flex flex-wrap gap-2 items-end">
            <input value={ghOwner} onChange={e => setGhOwner(e.target.value)} placeholder="GitHub owner (opt)"
              className="bg-zinc-800 border border-zinc-700 text-xs rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-600 w-36" />
            <input value={ghRepo} onChange={e => setGhRepo(e.target.value)} placeholder="GitHub repo (opt)"
              className="bg-zinc-800 border border-zinc-700 text-xs rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-600 w-36" />
            <button onClick={handleCertify} disabled={running}
              className="px-5 py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {running ? 'Certifying…' : 'Run Certification'}
            </button>
          </div>
          {cert && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Level"    value={cert.certificationLevel} color={cert.certified ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Score"    value={`${cert.overallScore}/100`} color={cert.overallScore >= 80 ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Scenarios" value={`${cert.scenariosPassed}/${cert.scenariosTotal}`} color="text-sky-400" />
              <Metric label="Time"     value={`${cert.durationMs}ms`} color="text-zinc-400" />
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

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running 7 end-to-end certification scenarios…</p>
            <p className="text-zinc-600 text-xs mt-1">GIE · CDL · CLE · CIS · Base44 · GitHub · Knowledge</p>
          </div>
        )}

        {!cert && !running && tab !== 'Tests' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm">Click "Run Certification" to execute the full end-to-end suite.</p>
            <p className="text-zinc-600 text-xs mt-1">7 scenarios · Layer readiness · Metrics · Recovery validation</p>
          </div>
        )}

        {cert && !running && (
          <>
            {/* ── Overview ── */}
            {tab === 'Overview' && (
              <div className="space-y-3">
                <div className={`rounded-xl border-2 p-4 ${cert.certified ? 'bg-emerald-950/20 border-emerald-700' : cert.certificationLevel === 'PARTIAL' ? 'bg-amber-950/10 border-amber-700' : 'bg-zinc-900 border-zinc-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Badge label={`MEMORYOS CORE v1.0: ${cert.certificationLevel}`} style={SC[cert.certificationLevel] ?? ''} />
                    <span className="text-zinc-400 text-xs font-mono">{new Date(cert.generatedAt).toISOString().replace('T',' ').slice(0,19)}</span>
                  </div>
                  <p className="text-zinc-200 text-sm whitespace-pre-line">{cert.executiveSummary}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LAYERS.map(l => (
                    <div key={l.layer} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-zinc-300 text-xs font-bold">{l.layer}</span>
                        <Badge label={l.level} style={SC[l.level] ?? SC.PARTIAL} />
                      </div>
                      <ScoreBar score={l.score} />
                      <p className="text-zinc-600 text-xs mt-1 truncate">{l.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Scenarios ── */}
            {tab === 'Scenarios' && (
              <div className="space-y-2">
                {cert.scenarios.map((s, i) => (
                  <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <button onClick={() => toggle(s.id)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-800/40 transition">
                      <Badge label={s.status} style={SC[s.status] ?? SC.PARTIAL} />
                      <span className="text-zinc-200 text-sm font-medium flex-1">S{i+1}: {s.scenarioName}</span>
                      <span className="text-zinc-600 text-xs shrink-0">{s.durationMs}ms</span>
                      <span className="text-zinc-600 text-xs shrink-0">{expanded[s.id] ? '▲' : '▼'}</span>
                    </button>
                    {expanded[s.id] && (
                      <div className="px-4 pb-4 space-y-3 border-t border-zinc-800">
                        <div className="bg-zinc-800/40 rounded-lg p-3 mt-3">
                          <p className="text-zinc-400 text-xs font-bold mb-1">Answer</p>
                          <p className="text-zinc-300 text-xs whitespace-pre-line">{s.answer}</p>
                        </div>
                        {s.warnings.length > 0 && (
                          <div>
                            {s.warnings.map((w, wi) => <p key={wi} className="text-amber-400 text-xs">⚠ {w}</p>)}
                          </div>
                        )}
                        <div>
                          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Evidence ({s.evidence.length})</p>
                          {s.evidence.map((ev, ei) => (
                            <div key={ei} className="border-b border-zinc-800/30 last:border-0 py-1.5">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-violet-400 font-mono">{ev.source}</span>
                                {ev.connectorUsed && <span className="text-zinc-600">via {ev.connectorUsed}</span>}
                                <span className="text-zinc-700 ml-auto">conf={Math.round(ev.confidence*100)}%</span>
                              </div>
                              <p className="text-zinc-500 text-xs">{ev.detail}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {s.enginesUsed.map(e => <span key={e} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{e}</span>)}
                        </div>
                        {s.recoveryPlan && (
                          <div className="bg-amber-950/20 border border-amber-800/50 rounded-lg p-3">
                            <p className="text-amber-300 text-xs font-bold mb-1">Recovery Plan · {s.recoveryPlan.estimatedImpact} impact</p>
                            <p className="text-amber-400 text-xs mb-1">{s.recoveryPlan.strategy}</p>
                            {s.recoveryPlan.steps.map((st, si) => <p key={si} className="text-zinc-400 text-xs">• {st}</p>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Readiness ── */}
            {tab === 'Readiness' && (
              <div className="space-y-3">
                {LAYERS.map(l => (
                  <div key={l.layer} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-zinc-100 text-sm font-bold">{l.layer}</span>
                      <Badge label={l.level} style={SC[l.level] ?? SC.PARTIAL} />
                      <span className="text-zinc-400 text-xs ml-auto">{l.score}/100</span>
                    </div>
                    <ScoreBar score={l.score} />
                    <p className="text-zinc-500 text-xs mt-1 mb-2">{l.summary}</p>
                    <div className="space-y-1">
                      {l.checks.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${c.passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-zinc-300 w-40 shrink-0">{c.name}</span>
                          <span className="text-zinc-500 flex-1">{c.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Metrics ── */}
            {tab === 'Metrics' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Exec Time"    value={`${cert.metrics.executionTimeMs}ms`} color="text-sky-400" />
                  <Metric label="Knowledge Cov" value={`${Math.round(cert.metrics.knowledgeCoverage*100)}%`} color="text-violet-400" />
                  <Metric label="Confidence"   value={`${Math.round(cert.metrics.confidence*100)}%`} color="text-emerald-400" />
                  <Metric label="Recovery"     value={`${Math.round(cert.metrics.recoveryCapability*100)}%`} color="text-amber-400" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Metric label="Project Cov" value={`${Math.round(cert.metrics.projectCoverage*100)}%`} color="text-sky-400" />
                  <Metric label="Learning Upd" value={cert.metrics.learningUpdates} color="text-emerald-400" />
                  <Metric label="Arch Consistency" value={`${Math.round(cert.metrics.architectureConsistency*100)}%`} color="text-violet-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Connector Latency</p>
                  {Object.entries(cert.metrics.connectorLatencyMs).length === 0 && <p className="text-zinc-600 text-xs">No connector calls recorded</p>}
                  {Object.entries(cert.metrics.connectorLatencyMs).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs mb-1.5">
                      <span className="text-zinc-300 font-mono w-16">{k}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-600 rounded-full" style={{ width: `${Math.min(v/2000*100, 100)}%` }} />
                      </div>
                      <span className="text-zinc-500 w-16 text-right">{v}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Recovery ── */}
            {tab === 'Recovery' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Recovery Capability: {Math.round(cert.metrics.recoveryCapability*100)}%</p>
                  {cert.scenarios.filter(s => s.recoveryPlan).map(s => (
                    <div key={s.id} className="mb-4 border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge label={s.status} style={SC[s.status] ?? ''} />
                        <span className="text-zinc-200 text-xs font-bold">{s.scenarioName}</span>
                        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-mono border ${s.recoveryPlan.estimatedImpact === 'high' ? 'text-red-400 border-red-800' : 'text-amber-400 border-amber-800'}`}>
                          {s.recoveryPlan.estimatedImpact} impact
                        </span>
                      </div>
                      <p className="text-amber-300 text-xs font-medium mb-1">{s.recoveryPlan.strategy}</p>
                      {s.recoveryPlan.steps.map((st, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-400 mb-0.5">
                          <span className="text-amber-600 shrink-0">{i+1}.</span>{st}
                        </div>
                      ))}
                    </div>
                  ))}
                  {cert.scenarios.filter(s => s.recoveryPlan).length === 0 && <p className="text-zinc-600 text-xs">No recovery plans triggered — all scenarios passed.</p>}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Remaining Risks</p>
                  {cert.remainingRisks.map((r, i) => <p key={i} className="text-zinc-400 text-xs py-1 border-b border-zinc-800/30 last:border-0">⚠ {r}</p>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tests ── */}
        {tab === 'Tests' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Validation Suite — 20 Tests</p>
              <button onClick={handleTests} disabled={testRunning}
                className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-xs font-semibold">
                {testRunning ? '…' : 'Run Tests'}
              </button>
            </div>
            {testRunning && (
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
                <span className="text-zinc-500 text-xs">Running full certification + test suite…</span>
              </div>
            )}
            {tests && !testRunning && (
              <>
                <div className={`rounded-xl border-2 p-3 ${tests.level==='CERTIFIED'?'bg-emerald-950/20 border-emerald-700':tests.level==='PARTIAL'?'bg-amber-950/10 border-amber-700':'bg-red-950/20 border-red-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={tests.level} style={SC[tests.level] ?? ''} />
                    <span className="text-zinc-200 text-sm font-bold">{tests.summary}</span>
                  </div>
                </div>
                {['Factory','Scenarios','Evidence','Readiness','Metrics','Report'].map(cat => {
                  const rows = tests.results.filter(r => r.cat === cat);
                  if (!rows.length) return null;
                  return (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-200">{cat}</span>
                        <span className={`text-xs font-mono ${rows.every(r=>r.status==='PASS')?'text-emerald-400':'text-amber-400'}`}>
                          {rows.filter(r=>r.status==='PASS').length}/{rows.length}
                        </span>
                      </div>
                      {rows.map((r, i) => (
                        <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-2.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge label={r.status} style={SC[r.status] ?? ''} />
                            <span className="text-zinc-200 text-xs font-medium flex-1">{r.name}</span>
                            <span className="text-zinc-700 text-xs shrink-0">{r.durationMs}ms</span>
                          </div>
                          <p className="text-zinc-500 text-xs mt-1">{r.detail}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── Certificate ── */}
        {tab === 'Certificate' && cert && (
          <div className="space-y-3">
            <div className={`rounded-xl border-2 p-6 ${cert.certified ? 'bg-emerald-950/20 border-emerald-700' : cert.certificationLevel === 'PARTIAL' ? 'bg-amber-950/10 border-amber-700' : 'bg-zinc-900 border-zinc-700'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Badge label={`MEMORYOS CORE v1.0: ${cert.certificationLevel}`} style={SC[cert.certificationLevel] ?? ''} />
                <span className="text-xs font-mono text-zinc-500">{new Date(cert.generatedAt).toISOString().split('T')[0]}</span>
              </div>
              <p className="text-zinc-200 font-bold text-sm mb-1">MemoryOS Cognitive Operating System</p>
              <p className="text-zinc-400 text-xs mb-4">Phase 5.2 — End-to-End Cognitive Certification</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <Metric label="Overall Score"  value={`${cert.overallScore}/100`} color={cert.overallScore >= 80 ? 'text-emerald-400' : 'text-amber-400'} />
                <Metric label="Scenarios"      value={`${cert.scenariosPassed}/${cert.scenariosTotal}`} color="text-sky-400" />
                <Metric label="Duration"       value={`${cert.durationMs}ms`} color="text-zinc-400" />
              </div>
              <div className="space-y-1.5 mb-4">
                {LAYERS.map(l => (
                  <div key={l.layer} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400 w-24 shrink-0">{l.layer}</span>
                    <ScoreBar score={l.score} />
                    <Badge label={l.level} style={SC[l.level] ?? SC.PARTIAL} />
                  </div>
                ))}
              </div>
              <p className="text-zinc-300 text-xs font-bold">Certification: This sprint certifies that the complete MemoryOS cognitive architecture operates as a unified Cognitive Operating System.</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Recommendations</p>
              {cert.recommendations.map((r, i) => <p key={i} className="text-zinc-300 text-xs py-1 border-b border-zinc-800/30 last:border-0">→ {r}</p>)}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Technical Debt</p>
              {cert.technicalDebt.map((d, i) => <p key={i} className="text-amber-400/70 text-xs py-0.5">• {d}</p>)}
            </div>
          </div>
        )}

        {tab === 'Certificate' && !cert && (
          <div className="text-center py-8 text-zinc-600 text-sm">Run the certification first to generate the official certificate.</div>
        )}
      </div>
    </div>
  );
}