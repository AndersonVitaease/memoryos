/**
 * EF36FPage — Project Reconstruction Engine Diagnostics
 * EF-36F · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runEF36FTests } from '@/lib/project-reconstruction/ef36fTests';

// ── Primitives ────────────────────────────────────────────────────────────────

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{String(value)}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function Bar({ value, color = 'bg-blue-600' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, (value * 100)).toFixed(0)}%` }} />
      </div>
      <span className="text-zinc-400 font-mono text-xs w-10 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? 'bg-red-950/10' : ''}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start gap-2 py-1.5 px-3 text-left">
        <Badge label={r.passed ? 'PASS' : 'FAIL'}
          style={r.passed ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${!r.passed ? 'text-red-300' : 'text-zinc-300'}`}>{r.name}</p>
          <p className="text-zinc-600 text-xs font-mono">{r.group}</p>
        </div>
        <span className="text-zinc-700 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && (r.error || r.details) && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700">
          {r.error && <p className="text-xs text-red-400 font-mono mb-1">{r.error}</p>}
          {r.details && <pre className="text-xs text-zinc-500 font-mono overflow-x-auto whitespace-pre-wrap">{JSON.stringify(r.details, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

function GroupSummary({ results }) {
  const byGroup = {};
  for (const r of results) {
    if (!byGroup[r.group]) byGroup[r.group] = { passed: 0, total: 0 };
    byGroup[r.group].total++;
    if (r.passed) byGroup[r.group].passed++;
  }
  return (
    <div className="space-y-1.5">
      {Object.entries(byGroup).map(([g, v]) => {
        const ok = v.passed === v.total;
        return (
          <div key={g} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${ok ? 'border-zinc-800 bg-zinc-900' : 'border-red-900/50 bg-red-950/10'}`}>
            <Badge label={ok ? 'PASS' : 'FAIL'} style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
            <span className="text-zinc-300 text-xs font-mono flex-1">{g}</span>
            <span className={`text-xs font-bold font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{v.passed}/{v.total}</span>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_COLORS = {
  VERIFIED: 'text-emerald-400', MULTI_SOURCE: 'text-blue-400',
  SINGLE_SOURCE: 'text-zinc-400', INFERRED: 'text-amber-400',
  CONFLICT: 'text-red-400', UNKNOWN: 'text-zinc-600',
};

const STAGE_LABELS = {
  collecting_providers: 'Collect Providers',
  reconstructing_knowledge: 'Reconstruct Knowledge',
  fusing_knowledge: 'Fuse Knowledge (EF-36D)',
  resolving_identities: 'Resolve Identities (EF-36E)',
  building_graph: 'Build Graph',
  building_timeline: 'Build Timeline',
  calculating_coverage: 'Calculate Coverage',
  detecting_missing: 'Detect Missing',
  validating_architecture: 'Validate Architecture',
  generating_snapshot: 'Generate Snapshot',
  complete: 'Complete',
};

const TABS = ['Overview', 'Pipeline', 'Project', 'Coverage', 'Missing', 'Architecture', 'Tests'];

export default function EF36FPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      setData(await runEF36FTests());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.failed === 0;
  const project = data?.project;
  const filtered = showFailed ? (data?.results.filter(r => !r.passed) ?? []) : (data?.results ?? []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">Project Reconstruction Engine</span>
                <span className="text-zinc-600">·</span>
                <span className="text-cyan-400">EF-36F · Project Independence</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">Project Reconstruction Engine</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                End-to-End Pipeline · KFE + IRE · Coverage · Missing Knowledge · Architecture Consistency
              </p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Running...' : 'Run EF-36F Tests'}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passed" value={data.passed} color="text-emerald-400" />
              <Metric label="Failed" value={data.failed} color={data.failed > 0 ? 'text-red-400' : 'text-zinc-600'} />
              <Metric label="Total" value={data.total} />
              <Metric label="Time" value={`${data.durationMs}ms`} color="text-blue-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Reconstructing project from multi-provider knowledge...</p>
          </div>
        )}
        {err && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Error</p>
            <p className="text-red-400 text-xs font-mono">{err}</p>
          </div>
        )}

        {data && !running && (
          <>
            <div className={`rounded-xl border-2 p-4 ${allPass ? 'bg-zinc-900 border-zinc-600' : 'bg-amber-950/20 border-amber-700'}`}>
              <p className={`font-bold text-sm ${allPass ? 'text-zinc-200' : 'text-amber-300'}`}>
                {allPass ? '✅ EF-36F — ALL TESTS PASSED' : `⚠ ${data.failed} TEST(S) FAILED`}
              </p>
              <p className="text-zinc-500 text-xs mt-1">{data.passed} passed · {data.failed} failed · {data.durationMs}ms · No external API required</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Overview ──────────────────────────────────────────────── */}
            {activeTab === 'Overview' && project && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shrink-0">P</div>
                    <div>
                      <p className="text-zinc-100 font-bold">{project.name}</p>
                      <p className="text-zinc-500 text-xs font-mono">{new Date(project.reconstructedAt).toISOString().replace('T', ' ').slice(0, 19)} · Providers: {project.providersUsed.join(', ')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <Metric label="Entities" value={project.totalEntities} color="text-emerald-400" />
                    <Metric label="Relationships" value={project.totalRelationships} color="text-blue-400" />
                    <Metric label="Timeline" value={project.timelineEventCount} color="text-violet-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Confidence" value={`${(project.confidence * 100).toFixed(0)}%`} color={project.confidence >= 0.8 ? 'text-emerald-400' : 'text-amber-400'} />
                    <Metric label="Coverage" value={`${(project.coverage.overall * 100).toFixed(0)}%`} color="text-cyan-400" />
                    <Metric label="Arch Checks" value={`${project.architectureConsistency.passed}/${project.architectureConsistency.total}`} color={project.architectureConsistency.consistent ? 'text-emerald-400' : 'text-amber-400'} />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Verification Breakdown</p>
                  <div className="space-y-1.5">
                    {project.verificationBreakdown && Object.entries(project.verificationBreakdown).map(([s, c]) => (
                      <div key={s} className="flex items-center gap-3">
                        <span className={`font-mono text-xs w-24 ${STATUS_COLORS[s] ?? 'text-zinc-400'}`}>{s}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-current rounded-full"
                            style={{ width: `${project.totalEntities > 0 ? (c / project.totalEntities * 100).toFixed(0) : 0}%` }} />
                        </div>
                        <span className="text-zinc-500 text-xs font-mono w-6 text-right">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <GroupSummary results={data.results} />
              </div>
            )}

            {/* ── Pipeline ──────────────────────────────────────────────── */}
            {activeTab === 'Pipeline' && (
              <div className="space-y-2">
                {data.pipelineStages.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.status === 'complete' ? 'bg-zinc-900 border-zinc-800' : s.status === 'error' ? 'bg-red-950/20 border-red-800/50' : 'bg-zinc-900 border-zinc-800'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s.status === 'complete' ? 'bg-emerald-900 text-emerald-300' : s.status === 'error' ? 'bg-red-900 text-red-300' : 'bg-zinc-800 text-zinc-500'}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 text-xs font-medium">{STAGE_LABELS[s.stage] ?? s.stage}</p>
                      {s.errors.length > 0 && <p className="text-red-400 text-xs font-mono">{s.errors[0]}</p>}
                    </div>
                    <span className="text-zinc-600 text-xs font-mono">{s.itemsProcessed} items</span>
                    <span className="text-zinc-700 text-xs font-mono">{s.durationMs}ms</span>
                    <Badge label={s.status.toUpperCase()}
                      style={s.status === 'complete' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : s.status === 'error' ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-zinc-800 text-zinc-500 border-zinc-700'} />
                  </div>
                ))}
              </div>
            )}

            {/* ── Project ───────────────────────────────────────────────── */}
            {activeTab === 'Project' && project && (
              <div className="space-y-3">
                {[
                  { label: 'Documents', items: project.documents, color: 'text-blue-400' },
                  { label: 'ADRs', items: project.adrs, color: 'text-emerald-400' },
                  { label: 'RFCs', items: project.rfcs, color: 'text-violet-400' },
                  { label: 'Decisions', items: project.decisions, color: 'text-amber-400' },
                  { label: 'Sprints', items: project.sprints, color: 'text-cyan-400' },
                  { label: 'Goals', items: project.goals, color: 'text-pink-400' },
                  { label: 'Components', items: project.components, color: 'text-zinc-300' },
                  { label: 'Implementations', items: project.implementations, color: 'text-zinc-400' },
                ].filter(s => s.items.length > 0).map(section => (
                  <div key={section.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${section.color}`}>{section.label} ({section.items.length})</p>
                    <div className="space-y-0.5">
                      {section.items.slice(0, 8).map((item, i) => (
                        <p key={i} className="text-zinc-300 text-xs py-0.5 border-b border-zinc-800/50 last:border-0 truncate">{item}</p>
                      ))}
                      {section.items.length > 8 && <p className="text-zinc-600 text-xs">+{section.items.length - 8} more</p>}
                    </div>
                  </div>
                ))}
                {project.risks.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-800/50 rounded-xl p-4">
                    <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">Risks ({project.risks.length})</p>
                    {project.risks.map((r, i) => <p key={i} className="text-amber-300 text-xs py-0.5">⚠ {r}</p>)}
                  </div>
                )}
              </div>
            )}

            {/* ── Coverage ──────────────────────────────────────────────── */}
            {activeTab === 'Coverage' && project && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Coverage by Dimension</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Overall', value: project.coverage.overall, color: 'bg-cyan-600' },
                      { label: 'Architecture', value: project.coverage.byArchitecture, color: 'bg-violet-600' },
                      { label: 'Timeline', value: project.coverage.byTimeline, color: 'bg-blue-600' },
                      { label: 'Decisions', value: project.coverage.byDecisions, color: 'bg-amber-600' },
                      { label: 'Implementations', value: project.coverage.byImplementation, color: 'bg-emerald-600' },
                      { label: 'Relationships', value: project.coverage.byRelationships, color: 'bg-pink-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <p className="text-zinc-500 text-xs mb-0.5">{label}</p>
                        <Bar value={value} color={color} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Coverage by Provider</p>
                  {Object.entries(project.coverage.byProvider).map(([pid, ratio]) => (
                    <div key={pid} className="mb-2">
                      <p className="text-cyan-400 text-xs font-mono mb-0.5">{pid}</p>
                      <Bar value={ratio} color="bg-cyan-700" />
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Entity Types</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(project.coverage.byDocumentType).map(([type, count]) => (
                      <span key={type} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300">{type}: {count}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Missing ───────────────────────────────────────────────── */}
            {activeTab === 'Missing' && project && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Summary</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Total Missing" value={project.missingKnowledge.totalMissing} color={project.missingKnowledge.totalMissing > 0 ? 'text-amber-400' : 'text-emerald-400'} />
                    <Metric label="High Severity" value={project.missingKnowledge.bySeverity.high} color={project.missingKnowledge.bySeverity.high > 0 ? 'text-red-400' : 'text-zinc-600'} />
                    <Metric label="Medium" value={project.missingKnowledge.bySeverity.medium} color={project.missingKnowledge.bySeverity.medium > 0 ? 'text-amber-400' : 'text-zinc-600'} />
                  </div>
                </div>
                {project.missingKnowledge.items.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-emerald-400 text-sm">No missing knowledge detected ✓</p>
                  </div>
                ) : project.missingKnowledge.items.map((item, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-xl p-3 ${item.severity === 'high' ? 'border-red-800/50' : item.severity === 'medium' ? 'border-amber-800/50' : 'border-zinc-800'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge label={item.kind} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                      <Badge label={item.severity.toUpperCase()} style={item.severity === 'high' ? 'bg-red-900/50 text-red-300 border-red-700' : item.severity === 'medium' ? 'bg-amber-900/50 text-amber-300 border-amber-700' : 'bg-zinc-800 text-zinc-500 border-zinc-700'} />
                    </div>
                    <p className="text-zinc-300 text-xs">{item.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Architecture ──────────────────────────────────────────── */}
            {activeTab === 'Architecture' && project && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge
                      label={project.architectureConsistency.consistent ? 'CONSISTENT' : 'INCONSISTENT'}
                      style={project.architectureConsistency.consistent ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-amber-900/50 text-amber-300 border-amber-700'} />
                    <span className="text-zinc-400 text-xs">{project.architectureConsistency.passed}/{project.architectureConsistency.total} checks passed</span>
                  </div>
                  <div className="space-y-2">
                    {project.architectureConsistency.checks.map((c, i) => (
                      <div key={i} className={`flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0`}>
                        <span className={`text-sm shrink-0 ${c.passed ? 'text-emerald-400' : 'text-red-400'}`}>{c.passed ? '✓' : '✗'}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${c.passed ? 'text-zinc-300' : 'text-red-300'}`}>{c.name}</p>
                          <p className="text-zinc-600 text-xs mt-0.5">{c.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Tests ─────────────────────────────────────────────────── */}
            {activeTab === 'Tests' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">{data.total} tests</span>
                  <span className={`text-xs font-mono font-bold ml-auto ${allPass ? 'text-emerald-400' : 'text-amber-400'}`}>{data.passed}/{data.total}</span>
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={showFailed} onChange={e => setShowFailed(e.target.checked)} />
                    Failures only
                  </label>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {showFailed && filtered.length === 0 && <p className="text-zinc-600 text-center py-8 text-sm">No failures ✓</p>}
                  {filtered.map((r, i) => <TestRow key={i} r={r} />)}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !err && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">EF-36F — Project Reconstruction Engine</p>
            <p className="text-zinc-600 text-xs">End-to-end pipeline: KFE (EF-36D) + IRE (EF-36E) → ReconstructedProject</p>
            <p className="text-zinc-700 text-xs mt-2">7 groups · ~37 tests · GitHub + Conversation providers · No external API</p>
          </div>
        )}
      </div>
    </div>
  );
}