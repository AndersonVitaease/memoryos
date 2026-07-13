/**
 * EF36DPage — Knowledge Fusion Engine Diagnostics
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runEF36DTests } from '@/lib/knowledge-fusion/ef36dTests';

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
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
  VERIFIED: 'text-emerald-400',
  MULTI_SOURCE: 'text-blue-400',
  SINGLE_SOURCE: 'text-zinc-400',
  INFERRED: 'text-amber-400',
  CONFLICT: 'text-red-400',
};

const TABS = ['Overview', 'Entities', 'Timeline', 'Conflicts', 'Snapshot', 'Tests'];

export default function EF36DPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      setData(await runEF36DTests());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.failed === 0;
  const fr = data?.fusionReport;
  const snap = data?.snapshot;
  const filtered = showFailed ? (data?.results.filter(r => !r.passed) ?? []) : (data?.results ?? []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">Knowledge Fusion Engine</span>
                <span className="text-zinc-600">·</span>
                <span className="text-cyan-400">EF-36D · Project Independence</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">Knowledge Fusion Engine</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Entity Resolution · Relationship Fusion · Timeline Fusion · Confidence · Conflict Detection · Cognitive Snapshots
              </p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Running...' : 'Run EF-36D Tests'}
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
            <p className="text-zinc-400 text-sm">Fusing knowledge from multiple providers...</p>
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
                {allPass ? '✅ EF-36D — ALL TESTS PASSED' : `⚠ ${data.failed} TEST(S) FAILED`}
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
            {activeTab === 'Overview' && fr && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Fusion Results</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <Metric label="Items Received" value={fr.totalItemsReceived} />
                    <Metric label="Unique Entities" value={fr.entitiesUnique} color="text-emerald-400" />
                    <Metric label="Merged" value={fr.entitiesMerged} color="text-blue-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Relationships" value={fr.relationshipsCreated} color="text-violet-400" />
                    <Metric label="Timeline Events" value={fr.timelineEventsFused} color="text-amber-400" />
                    <Metric label="Conflicts" value={fr.conflictsDetected} color={fr.conflictsDetected > 0 ? 'text-red-400' : 'text-zinc-600'} />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Confidence & Coverage</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-zinc-500 text-xs mb-1">Overall Confidence</p>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600" style={{ width: `${(fr.overallConfidence * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="text-zinc-400 text-xs font-mono mt-0.5">{(fr.overallConfidence * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 text-xs mb-1">Coverage</p>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${(fr.coverage * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="text-zinc-400 text-xs font-mono mt-0.5">{(fr.coverage * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Verification Breakdown</p>
                  <div className="space-y-1.5">
                    {fr.verificationBreakdown && Object.entries(fr.verificationBreakdown).map(([status, count]) => (
                      <div key={status} className="flex items-center gap-3">
                        <span className={`font-mono text-xs w-24 ${STATUS_COLORS[status] ?? 'text-zinc-400'}`}>{status}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-current rounded-full"
                            style={{ width: `${fr.entitiesUnique > 0 ? (count / fr.entitiesUnique * 100).toFixed(0) : 0}%`, color: 'currentColor' }} />
                        </div>
                        <span className="text-zinc-500 text-xs font-mono w-8 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Provider Breakdown</p>
                  {fr.providerBreakdown && Object.entries(fr.providerBreakdown).map(([pid, count]) => (
                    <div key={pid} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0 text-xs">
                      <span className="text-cyan-400 font-mono flex-1">{pid}</span>
                      <span className="text-zinc-300 font-bold">{count} items</span>
                    </div>
                  ))}
                </div>

                <GroupSummary results={data.results} />
              </div>
            )}

            {/* ── Entities ──────────────────────────────────────────────── */}
            {activeTab === 'Entities' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Architecture</p>
                  <div className="flex flex-col items-center gap-0.5 my-3">
                    {[
                      ['KnowledgeItems (multi-provider)', 'bg-zinc-800 text-zinc-300 border-zinc-600'],
                      ['EntityResolver', 'bg-blue-950/60 text-blue-300 border-blue-700'],
                      ['FusedEntity (canonical)', 'bg-emerald-950/60 text-emerald-300 border-emerald-700'],
                    ].map(([label, cls], i, arr) => (
                      <React.Fragment key={label}>
                        <div className={`w-72 text-center px-3 py-2 rounded-lg border text-xs font-mono font-bold ${cls}`}>{label}</div>
                        {i < arr.length - 1 && <div className="text-zinc-600 text-sm">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                  <p className="text-zinc-500 text-xs mt-2">
                    Items with same type + title similarity ≥ 85% from different providers are merged.
                    Provenance is never discarded — all original IDs are preserved in <code className="text-zinc-300">mergedIds</code>.
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Confidence Boosting Rules</p>
                  {[
                    ['MULTI_SOURCE', '2+ providers', 'Confidence boosted +5% per additional provider', STATUS_COLORS.MULTI_SOURCE],
                    ['VERIFIED', 'Base=VERIFIED', 'Single source but already verified by origin', STATUS_COLORS.VERIFIED],
                    ['SINGLE_SOURCE', '1 provider', 'No boost — base confidence preserved', STATUS_COLORS.SINGLE_SOURCE],
                    ['INFERRED', 'Pattern-detected', 'Base=INFERRED from origin (e.g. conversation signals)', STATUS_COLORS.INFERRED],
                    ['CONFLICT', 'Contradicted', 'Downgraded — provenance conflict detected', STATUS_COLORS.CONFLICT],
                  ].map(([status, trigger, desc, color]) => (
                    <div key={status} className="flex items-start gap-3 py-1.5 border-b border-zinc-800 last:border-0 text-xs">
                      <span className={`font-mono w-24 shrink-0 ${color}`}>{status}</span>
                      <span className="text-zinc-500 w-24 shrink-0">{trigger}</span>
                      <span className="text-zinc-400">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Timeline ──────────────────────────────────────────────── */}
            {activeTab === 'Timeline' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Fusion Rules</p>
                  {[
                    ['Chronological sort', 'Events ordered by occurredAt across all providers'],
                    ['Duplicate window', '±5 minutes + title similarity ≥ 75% → marked as duplicate'],
                    ['Conflict window', '±1 minute + same type + title similarity < 30% → conflict'],
                    ['Provider tracking', 'Each event tracks all sourceProviders that contributed'],
                    ['ID preservation', 'Original event IDs preserved; duplicateOf links to canonical'],
                  ].map(([rule, desc]) => (
                    <div key={rule} className="flex items-start gap-3 py-1.5 border-b border-zinc-800 last:border-0 text-xs">
                      <span className="text-cyan-400 font-mono w-36 shrink-0">{rule}</span>
                      <span className="text-zinc-400">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Conflicts ─────────────────────────────────────────────── */}
            {activeTab === 'Conflicts' && (
              <div className="space-y-3">
                {data.conflicts.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-zinc-500 text-sm">No conflicts detected with synthetic test data ✓</p>
                  </div>
                ) : (
                  data.conflicts.map((c, i) => (
                    <div key={i} className={`bg-zinc-900 border rounded-xl p-4 ${c.severity === 'high' || c.severity === 'critical' ? 'border-red-800/60' : c.severity === 'medium' ? 'border-amber-800/60' : 'border-zinc-700'}`}>
                      <div className="flex items-start gap-2 mb-1">
                        <Badge label={c.type} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                        <Badge label={c.severity.toUpperCase()} style={c.severity === 'high' || c.severity === 'critical' ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-amber-900/50 text-amber-300 border-amber-700'} />
                      </div>
                      <p className="text-zinc-300 text-xs mt-1">{c.description}</p>
                      <p className="text-zinc-600 text-xs font-mono mt-1">{c.providerA} ↔ {c.providerB}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Snapshot ──────────────────────────────────────────────── */}
            {activeTab === 'Snapshot' && snap && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Cognitive Snapshot</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Metric label="Entities" value={snap.totalEntities} color="text-emerald-400" />
                    <Metric label="Relationships" value={snap.totalRelationships} color="text-blue-400" />
                    <Metric label="Timeline Events" value={snap.totalTimelineEvents} color="text-violet-400" />
                  </div>
                  <p className="text-zinc-500 text-xs font-mono">Captured: {new Date(snap.capturedAt).toISOString().replace('T', ' ').slice(0, 19)}</p>
                  <p className="text-zinc-500 text-xs font-mono mt-0.5">Confidence: {(snap.overallConfidence * 100).toFixed(1)}%</p>
                </div>
                {snap.decisions.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Decisions</p>
                    {snap.decisions.map((d, i) => <p key={i} className="text-zinc-300 text-xs py-0.5 border-b border-zinc-800 last:border-0">{d}</p>)}
                  </div>
                )}
                {snap.openConflicts.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-800/50 rounded-xl p-4">
                    <p className="text-amber-400 text-xs uppercase tracking-wider mb-2">Open Conflicts</p>
                    {snap.openConflicts.map((c, i) => <p key={i} className="text-amber-300 text-xs">⚠ {c}</p>)}
                  </div>
                )}
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
            <p className="text-zinc-400 text-sm font-medium mb-1">EF-36D — Knowledge Fusion Engine</p>
            <p className="text-zinc-600 text-xs">Entity Resolution · Relationship Fusion · Timeline · Confidence · Conflicts · Snapshots</p>
            <p className="text-zinc-700 text-xs mt-2">9 groups · ~35 tests · GitHub + Conversation providers · No external API</p>
          </div>
        )}
      </div>
    </div>
  );
}