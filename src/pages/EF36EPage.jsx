/**
 * EF36EPage — Identity Resolution Engine Diagnostics
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runEF36ETests } from '@/lib/identity-resolution/ef36eTests';

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
  UNKNOWN: 'text-zinc-600',
};

const TABS = ['Overview', 'Canonicals', 'Aliases', 'Versions', 'Graph', 'Conflicts', 'Tests'];

export default function EF36EPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      setData(await runEF36ETests());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.failed === 0;
  const ir = data?.identityReport;
  const filtered = showFailed ? (data?.results.filter(r => !r.passed) ?? []) : (data?.results ?? []);
  const aliasedEntities = data?.canonicals?.filter(e => e.aliases?.length > 0) ?? [];
  const versionedEntities = data?.canonicals?.filter(e => e.versionHistory?.length > 0) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">Identity Resolution Engine</span>
                <span className="text-zinc-600">·</span>
                <span className="text-cyan-400">EF-36E · Project Independence</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">Identity Resolution Engine</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Alias Detection · Version Resolution · Canonical Entities · Identity Graph · Cross-Provider Identity
              </p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Running...' : 'Run EF-36E Tests'}
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
            <p className="text-zinc-400 text-sm">Resolving semantic identities across providers...</p>
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
                {allPass ? '✅ EF-36E — ALL TESTS PASSED' : `⚠ ${data.failed} TEST(S) FAILED`}
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
            {activeTab === 'Overview' && ir && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Resolution Results</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <Metric label="Input Entities" value={ir.totalInputEntities} />
                    <Metric label="Canonical Created" value={ir.canonicalEntitiesCreated} color="text-emerald-400" />
                    <Metric label="Aliases Detected" value={ir.aliasesDetected} color="text-blue-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Versions Detected" value={ir.versionsDetected} color="text-violet-400" />
                    <Metric label="Conflicts" value={ir.conflictsDetected} color={ir.conflictsDetected > 0 ? 'text-red-400' : 'text-zinc-600'} />
                    <Metric label="Ambiguous" value={ir.ambiguousEntities} color="text-amber-400" />
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Confidence & Coverage</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-zinc-500 text-xs mb-1">Overall Confidence</p>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600" style={{ width: `${(ir.overallConfidence * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="text-zinc-400 text-xs font-mono mt-0.5">{(ir.overallConfidence * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 text-xs mb-1">Coverage</p>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${(ir.coverage * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="text-zinc-400 text-xs font-mono mt-0.5">{(ir.coverage * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Verification Breakdown</p>
                  <div className="space-y-1.5">
                    {ir.verificationBreakdown && Object.entries(ir.verificationBreakdown).map(([status, count]) => (
                      <div key={status} className="flex items-center gap-3">
                        <span className={`font-mono text-xs w-24 ${STATUS_COLORS[status] ?? 'text-zinc-400'}`}>{status}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-current"
                            style={{ width: `${ir.canonicalEntitiesCreated > 0 ? (count / ir.canonicalEntitiesCreated * 100).toFixed(0) : 0}%` }} />
                        </div>
                        <span className="text-zinc-500 text-xs font-mono w-6 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Type Breakdown</p>
                  <div className="flex flex-wrap gap-2">
                    {ir.typeBreakdown && Object.entries(ir.typeBreakdown).map(([type, count]) => (
                      <span key={type} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300">
                        {type}: {count}
                      </span>
                    ))}
                  </div>
                </div>

                <GroupSummary results={data.results} />
              </div>
            )}

            {/* ── Canonicals ────────────────────────────────────────────── */}
            {activeTab === 'Canonicals' && (
              <div className="space-y-2">
                {data.canonicals?.map((e, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <div className="flex items-start gap-2 flex-wrap">
                      <Badge label={e.verificationStatus} style={`${STATUS_COLORS[e.verificationStatus] ?? 'text-zinc-400'} bg-zinc-800 border-zinc-700`} />
                      <Badge label={e.entityType} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                      <span className={`text-xs font-bold ${e.confidence >= 0.9 ? 'text-emerald-400' : e.confidence >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                        {(e.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-zinc-200 text-sm font-medium mt-1.5">{e.canonicalName}</p>
                    {e.aliases?.length > 0 && (
                      <p className="text-zinc-500 text-xs mt-1">Aliases: {e.aliases.map(a => a.alias).join(' · ')}</p>
                    )}
                    <p className="text-zinc-600 text-xs font-mono mt-0.5">Sources: {e.sources?.join(', ')}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Aliases ───────────────────────────────────────────────── */}
            {activeTab === 'Aliases' && (
              <div className="space-y-3">
                {aliasedEntities.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-zinc-500 text-sm">No aliases detected in test data.</p>
                  </div>
                ) : aliasedEntities.map((e, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-200 text-sm font-bold">{e.canonicalName}</p>
                    <p className="text-zinc-500 text-xs mb-2">Canonical · {e.entityType}</p>
                    <div className="space-y-1">
                      {e.aliases?.map((a, j) => (
                        <div key={j} className="flex items-center gap-3 text-xs">
                          <Badge label={a.detectedBy} style="bg-zinc-800 text-zinc-500 border-zinc-700" />
                          <span className="text-zinc-300 flex-1">{a.alias}</span>
                          <span className="text-zinc-600 font-mono">{a.sourceProvider}</span>
                          <span className={`font-bold font-mono ${a.confidence >= 0.9 ? 'text-emerald-400' : 'text-amber-400'}`}>{(a.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Versions ──────────────────────────────────────────────── */}
            {activeTab === 'Versions' && (
              <div className="space-y-3">
                {versionedEntities.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-zinc-500 text-sm">No version chains detected in test data.</p>
                  </div>
                ) : versionedEntities.map((e, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-200 text-sm font-bold">{e.canonicalName}</p>
                    <p className="text-zinc-500 text-xs mb-3">Version chain — {e.versionHistory?.length} entries</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {e.versionHistory?.map((v, j) => (
                        <React.Fragment key={j}>
                          <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-300 text-center">
                            <p className="font-bold text-violet-400">{v.versionLabel}</p>
                            <p className="text-zinc-600 truncate max-w-24">{v.entityId.slice(0, 14)}</p>
                          </div>
                          {j < e.versionHistory.length - 1 && <span className="text-zinc-600">→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Graph ─────────────────────────────────────────────────── */}
            {activeTab === 'Graph' && data.graphStats && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Identity Graph Stats</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Metric label="Total Nodes" value={data.graphStats.nodes ?? 0} color="text-emerald-400" />
                    <Metric label="Total Edges" value={data.graphStats.edges ?? 0} color="text-blue-400" />
                    <Metric label="Canonical" value={data.graphStats.canonical ?? 0} color="text-violet-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Alias" value={data.graphStats.alias ?? 0} color="text-amber-400" />
                    <Metric label="Version" value={data.graphStats.version ?? 0} color="text-cyan-400" />
                    <Metric label="Provider Ref" value={data.graphStats.provider_ref ?? 0} color="text-zinc-400" />
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Edge Types</p>
                  <div className="flex flex-wrap gap-2">
                    {['sameAs', 'versionOf', 'implementedBy', 'discussedIn', 'documentedBy', 'decidedBy', 'referencedBy', 'aliasOf'].map(type => (
                      <div key={type} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-400">
                        {type}: {data.graphStats[type] ?? 0}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Conflicts ─────────────────────────────────────────────── */}
            {activeTab === 'Conflicts' && (
              <div className="space-y-3">
                {data.conflicts.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-zinc-500 text-sm">No conflicts detected ✓</p>
                  </div>
                ) : data.conflicts.map((c, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-xl p-4 ${c.severity === 'high' || c.severity === 'critical' ? 'border-red-800/60' : c.severity === 'medium' ? 'border-amber-800/60' : 'border-zinc-700'}`}>
                    <div className="flex items-start gap-2 mb-1 flex-wrap">
                      <Badge label={c.type} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                      <Badge label={c.severity.toUpperCase()} style={c.severity === 'high' || c.severity === 'critical' ? 'bg-red-900/50 text-red-300 border-red-700' : c.severity === 'medium' ? 'bg-amber-900/50 text-amber-300 border-amber-700' : 'bg-zinc-800 text-zinc-400 border-zinc-700'} />
                    </div>
                    <p className="text-zinc-300 text-xs mt-1">{c.description}</p>
                  </div>
                ))}
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
            <p className="text-zinc-400 text-sm font-medium mb-1">EF-36E — Identity Resolution Engine</p>
            <p className="text-zinc-600 text-xs">Alias Detection · Version Resolution · Canonical Entities · Identity Graph · Cross-Provider Identity</p>
            <p className="text-zinc-700 text-xs mt-2">10 groups · ~32 tests · Synthetic multi-provider data · No external API</p>
          </div>
        )}
      </div>
    </div>
  );
}