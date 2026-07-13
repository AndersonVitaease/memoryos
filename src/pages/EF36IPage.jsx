/**
 * EF36IPage — Cognitive Architecture Audit & Certification
 * EF-36I · Foundation v1.0 · 2026-07-13
 */
import React, { useState, useCallback, useMemo } from 'react';
import { ArchitectureAuditor } from '@/lib/architecture-audit/ArchitectureAuditor';

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
function ScoreBar({ label, value, color = 'bg-blue-600', sub }) {
  const pct = Math.min(100, Math.max(0, value * 100)).toFixed(0);
  const tc  = value >= 0.7 ? 'text-emerald-400' : value >= 0.5 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400 text-xs w-44 shrink-0 truncate">{label}{sub && <span className="text-zinc-600 text-[10px] ml-1">{sub}</span>}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold font-mono w-10 text-right shrink-0 ${tc}`}>{pct}%</span>
    </div>
  );
}

const V_STYLE = {
  PASS:    'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  WARNING: 'bg-amber-900/50 text-amber-300 border-amber-700',
  FAIL:    'bg-red-900/50 text-red-300 border-red-700',
  CERTIFIED:                  'bg-emerald-900/60 text-emerald-200 border-emerald-600',
  CERTIFIED_WITH_WARNINGS:    'bg-amber-900/60 text-amber-200 border-amber-600',
  REQUIRES_REMEDIATION:       'bg-red-900/60 text-red-200 border-red-600',
  READY:                      'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  READY_WITH_RECOMMENDATIONS: 'bg-amber-900/50 text-amber-300 border-amber-700',
  NOT_READY:                  'bg-red-900/50 text-red-300 border-red-700',
};

const SCORE_C = (v) => v >= 0.7 ? 'bg-emerald-600' : v >= 0.5 ? 'bg-amber-600' : 'bg-red-700';
const TEXT_C  = (v) => v >= 0.7 ? 'text-emerald-400' : v >= 0.5 ? 'text-amber-400' : 'text-red-400';

const LAYER_COLORS = {
  connector_runtime:      'text-blue-400',
  knowledge_reconstruction:'text-violet-400',
  knowledge_fusion:       'text-cyan-400',
  identity_resolution:    'text-pink-400',
  project_reconstruction: 'text-emerald-400',
  validation:             'text-amber-400',
  support:                'text-zinc-400',
};
const RISK_COLORS = {
  critical: 'border-red-700/60 bg-red-950/20',
  high:     'border-orange-700/60 bg-orange-950/15',
  medium:   'border-amber-700/60 bg-amber-950/10',
  low:      'border-zinc-700',
  technical_debt:          'border-zinc-600 bg-zinc-900/50',
  architectural_opportunity:'border-blue-800/60 bg-blue-950/10',
};
const RISK_LABEL = {
  critical: 'text-red-400', high: 'text-orange-400', medium: 'text-amber-400',
  low: 'text-zinc-500', technical_debt: 'text-zinc-400', architectural_opportunity: 'text-blue-400',
};

function Expandable({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-zinc-900/80 hover:bg-zinc-800/60 transition-colors">
        <span className="text-zinc-300 text-xs font-semibold flex-1">{title}</span>
        <span className="text-zinc-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="bg-zinc-950/50 px-4 py-3">{children}</div>}
    </div>
  );
}

const TABS = ['Certificate', 'Inventory', 'SOLID', 'Principles', 'Pipeline', 'Risks', 'Gaps & Perf', 'Beta Readiness'];

export default function EF36IPage() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('Certificate');

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        const auditor = new ArchitectureAuditor();
        setReport(auditor.audit());
      } finally {
        setRunning(false);
      }
    }, 60); // microtask yield for spinner
  }, []);

  const r = report;

  const byLayer = useMemo(() => {
    if (!r) return {};
    const m = {};
    for (const c of r.components) { if (!m[c.layer]) m[c.layer] = []; m[c.layer].push(c); }
    return m;
  }, [r]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">Cognitive Architecture Audit</span>
                <span className="text-zinc-600">·</span>
                <span className="text-fuchsia-400">EF-36I · Pre-Beta Certification</span>
              </div>
              <h1 className="text-lg font-bold text-white">EF-36I — Architecture Certification</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Read-only audit of the complete MemoryOS cognitive layer</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-fuchsia-800 hover:bg-fuchsia-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Auditing...' : 'Run Audit'}
            </button>
          </div>
          {r && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Overall Score"   value={`${(r.overallArchitectureScore*100).toFixed(0)}%`} color={TEXT_C(r.overallArchitectureScore)} />
              <Metric label="Components"      value={`${r.implementedComponents}/${r.totalComponents}`} color="text-blue-400" />
              <Metric label="SOLID Avg"       value={`${(r.avgSolidScore*100).toFixed(0)}%`}            color={TEXT_C(r.avgSolidScore)} />
              <Metric label="Beta Readiness"  value={r.betaReadiness.verdict.replace(/_/g,' ')}         color={r.betaReadiness.verdict==='READY'?'text-emerald-400':r.betaReadiness.verdict==='NOT_READY'?'text-red-400':'text-amber-400'} />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-fuchsia-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Auditing {COMPONENTS_COUNT} components across 7 layers…</p>
          </div>
        )}

        {r && !running && (
          <>
            {/* Verdict banner */}
            <div className={`rounded-xl border-2 p-4 ${V_STYLE[r.overallVerdict] ?? ''}`}>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <Badge label={r.overallVerdict.replace(/_/g,' ')} style={V_STYLE[r.overallVerdict]} />
                <span className="font-bold text-sm">MemoryOS Architecture Certification</span>
                <span className="text-zinc-500 text-xs ml-auto">{new Date(r.generatedAt).toISOString().slice(0,10)}</span>
              </div>
              <p className={`text-xs ${TEXT_C(r.overallArchitectureScore)}`}>Score: {(r.overallArchitectureScore*100).toFixed(0)}% · {r.implementedComponents}/{r.totalComponents} components · {r.risks.filter(x=>x.category==='critical').length} critical risks · Beta: {r.betaReadiness.verdict.replace(/_/g,' ')}</p>
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

            {/* ── Certificate ─────────────────────────────────────── */}
            {activeTab === 'Certificate' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Architecture Scores</p>
                  <div className="space-y-2.5">
                    <ScoreBar label="Overall Architecture"     value={r.overallArchitectureScore} color={SCORE_C(r.overallArchitectureScore)} />
                    <ScoreBar label="SOLID Average"            value={r.avgSolidScore}             color={SCORE_C(r.avgSolidScore)} />
                    <ScoreBar label="Architecture Principles"  value={r.avgPrincipleScore}         color={SCORE_C(r.avgPrincipleScore)} />
                    <ScoreBar label="Pipeline Health"          value={r.pipelineHealth}            color={SCORE_C(r.pipelineHealth)} />
                    <ScoreBar label="Implementation Coverage"  value={r.implementedComponents/r.totalComponents} color={SCORE_C(r.implementedComponents/r.totalComponents)} />
                    <ScoreBar label="Test Coverage"            value={r.testedComponents/r.totalComponents} color={SCORE_C(r.testedComponents/r.totalComponents)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Dep Issues"     value={r.dependencyIssues.length}      color={r.dependencyIssues.length>3?'text-amber-400':'text-zinc-400'} />
                  <Metric label="Risks Total"    value={r.risks.length}                  color="text-zinc-400" />
                  <Metric label="Duplication"    value={r.duplicationFindings.length}    color="text-zinc-500" />
                  <Metric label="Pipeline Stages" value={r.pipelineStages.length}       color="text-blue-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Executive Summary</p>
                  <pre className="text-zinc-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">{r.executiveSummary}</pre>
                </div>
              </div>
            )}

            {/* ── Inventory ───────────────────────────────────────── */}
            {activeTab === 'Inventory' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Total"       value={r.totalComponents}       color="text-zinc-200" />
                  <Metric label="Implemented" value={r.implementedComponents} color="text-emerald-400" />
                  <Metric label="Partial"     value={r.components.filter(c=>c.status==='partial').length} color="text-amber-400" />
                  <Metric label="Missing"     value={r.components.filter(c=>c.status==='missing').length} color="text-red-400" />
                </div>
                {Object.entries(byLayer).map(([layer, comps]) => (
                  <Expandable key={layer} title={`${layer.replace(/_/g,' ').toUpperCase()} (${comps.length})`} defaultOpen={false}>
                    <div className="space-y-2">
                      {comps.map(c => (
                        <div key={c.id} className="border border-zinc-800 rounded-lg p-2.5">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge label={c.status.toUpperCase()} style={c.status==='implemented'?V_STYLE.PASS:c.status==='partial'?V_STYLE.WARNING:V_STYLE.FAIL} />
                            <span className={`text-xs font-semibold ${LAYER_COLORS[c.layer]}`}>{c.name}</span>
                            <span className="text-zinc-700 text-[10px] ml-auto">{c.sprint}</span>
                          </div>
                          <p className="text-zinc-500 text-xs mb-1">{c.description}</p>
                          <p className="text-zinc-700 text-[10px] font-mono truncate">{c.filePath}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.exposedInterfaces.map(i => <span key={i} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500">{i}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Expandable>
                ))}
              </div>
            )}

            {/* ── SOLID ───────────────────────────────────────────── */}
            {activeTab === 'SOLID' && (
              <div className="space-y-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-zinc-500 px-3 mb-1">
                    <span className="w-40">Component</span>
                    {['S','O','L','I','D','Avg'].map(h => <span key={h} className="w-12 text-center font-bold text-zinc-400">{h}</span>)}
                  </div>
                  {r.solidScores.map((s, i) => {
                    const comp = r.components.find(c => c.id === s.componentId);
                    return (
                      <div key={i} className="flex items-center gap-1 py-1 border-t border-zinc-800/50">
                        <span className={`text-xs w-40 truncate shrink-0 ${LAYER_COLORS[comp?.layer ?? 'support']}`}>{comp?.name ?? s.componentId}</span>
                        {[s.S, s.O, s.L, s.I, s.D, s.overall].map((v, j) => (
                          <span key={j} className={`text-xs font-mono w-12 text-center ${TEXT_C(v)}`}>{(v*100).toFixed(0)}</span>
                        ))}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-1 py-1.5 border-t-2 border-zinc-700 mt-1">
                    <span className="text-xs w-40 font-bold text-zinc-300">AVERAGE</span>
                    {['','','','','',r.avgSolidScore].map((v, j) => (
                      <span key={j} className={`text-xs font-bold font-mono w-12 text-center ${v !== '' ? TEXT_C(Number(v)) : 'text-zinc-700'}`}>{v !== '' ? `${(Number(v)*100).toFixed(0)}` : '—'}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Principles ──────────────────────────────────────── */}
            {activeTab === 'Principles' && (
              <div className="space-y-2">
                {r.principleChecks.map((p, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-xl p-3 ${p.compliant ? 'border-zinc-800' : 'border-amber-800/50'}`}>
                    <div className="flex items-center gap-3 mb-1">
                      <Badge label={p.compliant ? 'COMPLIANT' : 'WARNING'} style={p.compliant ? V_STYLE.PASS : V_STYLE.WARNING} />
                      <span className="text-zinc-200 text-xs font-semibold flex-1">{p.principle}</span>
                      <span className={`text-xs font-bold font-mono ${TEXT_C(p.score)}`}>{(p.score*100).toFixed(0)}%</span>
                    </div>
                    {p.evidence.map((e, j) => <p key={j} className="text-zinc-500 text-xs ml-1">• {e}</p>)}
                    {p.violations.map((v, j) => <p key={j} className="text-amber-400 text-xs ml-1">⚠ {v}</p>)}
                  </div>
                ))}
              </div>
            )}

            {/* ── Pipeline ────────────────────────────────────────── */}
            {activeTab === 'Pipeline' && (
              <div className="space-y-2">
                {r.pipelineStages.map((s, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-xl p-3 ${s.issues.length > 0 ? 'border-amber-800/40' : 'border-zinc-800'}`}>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">{i+1}</span>
                      <span className="text-zinc-100 text-xs font-bold">{s.stage}</span>
                      <div className="flex gap-1 ml-auto">
                        {s.immutable   && <Badge label="IMMUTABLE"   style="bg-zinc-800/50 text-zinc-500 border-zinc-700" />}
                        {s.traceable   && <Badge label="TRACEABLE"   style="bg-zinc-800/50 text-zinc-500 border-zinc-700" />}
                        {s.provenanced && <Badge label="PROVENANCED" style="bg-zinc-800/50 text-zinc-500 border-zinc-700" />}
                        {!s.provenanced && <Badge label="NO PROV" style="bg-amber-900/40 text-amber-400 border-amber-700" />}
                      </div>
                    </div>
                    <p className="text-zinc-600 text-xs font-mono mb-1">{s.component}</p>
                    <p className="text-zinc-500 text-xs"><span className="text-zinc-600">In:</span> {s.inputContract}</p>
                    <p className="text-zinc-500 text-xs"><span className="text-zinc-600">Out:</span> {s.outputContract}</p>
                    {s.issues.map((iss, j) => <p key={j} className="text-amber-400 text-xs mt-1">⚠ {iss}</p>)}
                  </div>
                ))}
              </div>
            )}

            {/* ── Risks ───────────────────────────────────────────── */}
            {activeTab === 'Risks' && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {['critical','high','medium','low','technical_debt','architectural_opportunity'].map(cat => (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-center">
                      <p className={`text-sm font-bold font-mono ${RISK_LABEL[cat]}`}>{r.risks.filter(x=>x.category===cat).length}</p>
                      <p className="text-zinc-600 text-[10px] mt-0.5">{cat.replace(/_/g,' ')}</p>
                    </div>
                  ))}
                </div>
                {r.risks.map((risk, i) => (
                  <div key={i} className={`rounded-xl border p-3 ${RISK_COLORS[risk.category]}`}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold uppercase ${RISK_LABEL[risk.category]}`}>{risk.category.replace(/_/g,' ')}</span>
                      <span className="text-zinc-200 text-xs font-semibold">{risk.title}</span>
                    </div>
                    <p className="text-zinc-400 text-xs mb-1">{risk.description}</p>
                    <p className="text-zinc-500 text-xs"><span className="text-zinc-400">Impact:</span> {risk.impact}</p>
                    <p className="text-zinc-500 text-xs mt-0.5"><span className="text-zinc-400">Fix:</span> {risk.recommendation}</p>
                    {risk.evidence.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {risk.evidence.slice(0,3).map((e,j) => <span key={j} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 truncate max-w-[240px]">{e}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Gaps & Perf ──────────────────────────────────────── */}
            {activeTab === 'Gaps & Perf' && (
              <div className="space-y-4">
                <Expandable title="Code Duplication Findings" defaultOpen>
                  <div className="space-y-2">
                    {r.duplicationFindings.map((d, i) => (
                      <div key={i} className="border border-zinc-800 rounded-lg p-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge label={d.severity.toUpperCase()} style={d.severity==='high'?V_STYLE.FAIL:d.severity==='medium'?V_STYLE.WARNING:'bg-zinc-800 text-zinc-500 border-zinc-700'} />
                          <span className="text-zinc-300 text-xs font-mono">{d.area}</span>
                        </div>
                        <p className="text-zinc-400 text-xs mb-1">{d.description}</p>
                        <p className="text-zinc-600 text-xs italic">{d.recommendation}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {d.locations.map((l,j) => <span key={j} className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500">{l.split('/').pop()}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Expandable>
                <Expandable title="Performance Findings" defaultOpen>
                  <div className="space-y-2">
                    {r.performanceFindings.map((p, i) => (
                      <div key={i} className="border border-zinc-800 rounded-lg p-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge label={p.risk} style={p.risk==='HIGH'?V_STYLE.FAIL:p.risk==='MEDIUM'?V_STYLE.WARNING:'bg-zinc-800 text-zinc-500 border-zinc-700'} />
                          <span className="text-zinc-300 text-xs font-semibold">{p.area}</span>
                          <span className="text-zinc-600 text-xs ml-auto font-mono">{p.estimate}</span>
                        </div>
                        <p className="text-zinc-400 text-xs mb-0.5">{p.description}</p>
                        <p className="text-zinc-600 text-xs italic">{p.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </Expandable>
                <Expandable title="Test Coverage Gaps">
                  <div className="space-y-1.5">
                    {r.testCoverageFindings.filter(t => !t.hasTests || t.issues.length > 0 || t.missingScenarios.length > 0).map((t, i) => (
                      <div key={i} className={`border rounded-lg p-2.5 ${!t.hasTests ? 'border-red-800/40' : 'border-zinc-800'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge label={t.hasTests?'TESTED':'NO TESTS'} style={t.hasTests?V_STYLE.PASS:V_STYLE.FAIL} />
                          <span className="text-zinc-300 text-xs">{t.component}</span>
                        </div>
                        {t.issues.map((iss,j) => <p key={j} className="text-red-400 text-xs">✗ {iss}</p>)}
                        {t.missingScenarios.map((ms,j) => <p key={j} className="text-amber-500 text-xs">⚠ Missing: {ms}</p>)}
                      </div>
                    ))}
                  </div>
                </Expandable>
              </div>
            )}

            {/* ── Beta Readiness ───────────────────────────────────── */}
            {activeTab === 'Beta Readiness' && (
              <div className="space-y-3">
                <div className={`rounded-xl border-2 p-4 ${V_STYLE[r.betaReadiness.verdict]}`}>
                  <div className="flex items-center gap-3 mb-1">
                    <Badge label={r.betaReadiness.verdict.replace(/_/g,' ')} style={V_STYLE[r.betaReadiness.verdict]} />
                    <span className="font-bold text-sm">MemoryOS Beta Readiness</span>
                    <span className={`ml-auto font-bold font-mono text-lg ${TEXT_C(r.betaReadiness.overallScore)}`}>{(r.betaReadiness.overallScore*100).toFixed(0)}%</span>
                  </div>
                  {r.betaReadiness.blockers.length > 0 && r.betaReadiness.blockers.map((b,i) => <p key={i} className="text-red-300 text-xs">✗ Blocker: {b}</p>)}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Readiness Dimensions</p>
                  <div className="space-y-2.5">
                    {r.betaReadiness.dimensions.map((d, i) => (
                      <div key={i}>
                        <ScoreBar label={d.name} value={d.score} color={SCORE_C(d.score)} />
                        {d.notes.length > 0 && <p className="text-zinc-600 text-[10px] ml-44 mt-0.5">{d.notes[0]}</p>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Recommendations</p>
                  <div className="space-y-1.5">
                    {r.betaReadiness.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-amber-500 shrink-0 text-xs mt-0.5">{i+1}.</span>
                        <p className="text-zinc-300 text-xs">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-700 to-purple-900 flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">I</div>
            <p className="text-zinc-200 text-sm font-semibold mb-2">EF-36I — Cognitive Architecture Audit</p>
            <p className="text-zinc-500 text-xs mb-1">Read-only static analysis — no engine modifications</p>
            <p className="text-zinc-600 text-xs">Inventory · SOLID · Principles · Duplication · Performance · Tests · Pipeline · Risks · Beta Readiness</p>
          </div>
        )}
      </div>
    </div>
  );
}

const COMPONENTS_COUNT = 38;