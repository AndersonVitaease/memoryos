/**
 * EF36BPage — GitHub Knowledge Provider Diagnostics
 * EF-36B · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runEF36BTests } from '@/lib/knowledge-reconstruction/sources/ef36bTests';
import { GitHubKnowledgeSource } from '@/lib/knowledge-reconstruction/sources/GitHubKnowledgeSource';

function Badge({ label, style }) {
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
  const hasExtra = r.error || r.details;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed && !r.skipped ? 'bg-red-950/10' : r.skipped ? 'opacity-50' : ''}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)} className="w-full flex items-start gap-2 py-1.5 px-3 text-left">
        <Badge
          label={r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL'}
          style={r.skipped ? 'bg-zinc-800 text-zinc-500 border-zinc-700' : r.passed ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${!r.passed && !r.skipped ? 'text-red-300' : 'text-zinc-300'}`}>{r.name}</p>
          <p className="text-zinc-600 text-xs font-mono">{r.group}{r.skipped ? ` — ${r.skipReason}` : ''}</p>
        </div>
        <span className="text-zinc-700 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700">
          {r.error && <p className="text-xs text-red-400 font-mono mb-1">{r.error}</p>}
          {r.details && <pre className="text-xs text-zinc-500 font-mono overflow-x-auto whitespace-pre-wrap">{JSON.stringify(r.details, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'repos', label: 'Repos' },
  { id: 'sync', label: 'Sync' },
  { id: 'report', label: 'Report' },
  { id: 'tests', label: 'Tests' },
];

function GroupSummary({ results }) {
  const byGroup = {};
  for (const r of results) {
    if (!byGroup[r.group]) byGroup[r.group] = { passed: 0, total: 0, skipped: 0 };
    byGroup[r.group].total++;
    if (r.passed) byGroup[r.group].passed++;
    if (r.skipped) byGroup[r.group].skipped++;
  }
  return (
    <div className="space-y-1.5">
      {Object.entries(byGroup).map(([g, v]) => {
        const realFailed = v.total - v.passed - v.skipped;
        const ok = realFailed === 0;
        return (
          <div key={g} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${ok ? 'border-zinc-800 bg-zinc-900' : 'border-red-900/50 bg-red-950/10'}`}>
            <Badge label={ok ? 'PASS' : 'FAIL'} style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
            <span className="text-zinc-300 text-xs font-mono flex-1">{g}</span>
            {v.skipped > 0 && <span className="text-zinc-600 text-xs font-mono">{v.skipped} skipped</span>}
            <span className={`text-xs font-bold font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{v.passed}/{v.total}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function EF36BPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      const report = await runEF36BTests();
      setData(report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.failed === 0;
  const report = data?.reconstructionReport;
  const sync = data?.syncSummary;
  const health = data?.healthReport;
  const filtered = showFailed
    ? (data?.results.filter(r => !r.passed && !r.skipped) ?? [])
    : (data?.results ?? []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">GitHub Knowledge Provider</span>
                <span className="text-zinc-600">·</span>
                <span className="text-blue-400">EF-36B · Project Independence</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">GitHub Knowledge Provider</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Repository Discovery · Commit Reconstruction · File Knowledge · Relationships · Provenance · Sync
              </p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Running...' : 'Run EF-36B Tests'}
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              <Metric label="Passed" value={data.passed} color="text-emerald-400" />
              <Metric label="Failed" value={data.failed} color={data.failed > 0 ? 'text-red-400' : 'text-zinc-600'} />
              <Metric label="Skipped" value={data.skipped} color="text-zinc-500" />
              <Metric label="Total" value={data.total} />
              <Metric label="Time" value={`${data.durationMs}ms`} color="text-blue-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-zinc-300 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running EF-36B test suite...</p>
            <p className="text-zinc-600 text-xs mt-1">Connecting to GitHub API · Scanning repositories · Reconstructing knowledge...</p>
          </div>
        )}

        {err && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Test Suite Error</p>
            <p className="text-red-400 text-xs font-mono">{err}</p>
          </div>
        )}

        {data && !running && (
          <>
            {/* Token status */}
            <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${data.tokenAvailable ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-amber-950/20 border-amber-800/50'}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${data.tokenAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {data.tokenAvailable ? (
                <span className="text-emerald-300 text-xs font-mono">GitHub token configured — live API tests active · {health?.details}</span>
              ) : (
                <span className="text-amber-300 text-xs font-mono">No GitHub token — structural tests only · Set VITE_GITHUB_TOKEN or __GITHUB_TOKEN__ to enable live tests</span>
              )}
            </div>

            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Overview ──────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-3">
                <div className={`rounded-xl border-2 p-4 ${allPass ? 'bg-zinc-900 border-zinc-600' : 'bg-amber-950/20 border-amber-700'}`}>
                  <p className={`font-bold text-sm ${allPass ? 'text-zinc-200' : 'text-amber-300'}`}>
                    {allPass ? '✅ EF-36B — ALL TESTS PASSED' : `⚠ ${data.failed} TEST(S) FAILED`}
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    {data.passed} passed · {data.failed} failed · {data.skipped} skipped · {data.durationMs}ms
                  </p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Architecture</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['GitHubKnowledgeSource', 'Implements IKnowledgeSource — main provider'],
                      ['GitHubKnowledgeTypes', 'Internal types — RepoMeta, CommitMeta, FileMeta, SyncState'],
                      ['Repository Discovery', 'ghFetch /user/repos + /repos/{owner}/{repo}'],
                      ['Commit Reconstruction', '/repos/{owner}/{repo}/commits → KnowledgeArtifact + TimelineEvent'],
                      ['File Knowledge', '/git/trees recursive → KnowledgeDocument / KnowledgeArtifact'],
                      ['Relationship Builder', 'contains_commit · contains_file · has_branch · modifies'],
                      ['Provenance Tracking', 'repo + branch + sha + confidence + VERIFIED per item'],
                      ['Incremental Sync', 'knownCommitShas / knownFilePaths / knownBranches Sets'],
                    ].map(([name, desc]) => (
                      <div key={name} className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2">
                        <p className="text-zinc-200 font-semibold text-xs">{name}</p>
                        <p className="text-zinc-600 text-xs mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <GroupSummary results={data.results} />
              </div>
            )}

            {/* ── Repos ─────────────────────────────────────────────────── */}
            {activeTab === 'repos' && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Repository Discovery</p>
                {report?.sourcesSummary?.find(s => s.sourceId.includes('github')) ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    {report.sourcesSummary.filter(s => s.sourceId.includes('github')).map(s => (
                      <div key={s.sourceId}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`w-2 h-2 rounded-full ${s.errors === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className="text-zinc-200 font-semibold text-sm">{s.name}</span>
                          <span className="text-zinc-600 font-mono text-xs">{s.sourceId}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Metric label="Items Loaded" value={s.itemsLoaded} color="text-emerald-400" />
                          <Metric label="Errors" value={s.errors} color={s.errors > 0 ? 'text-red-400' : 'text-zinc-600'} />
                          <Metric label="Graph Nodes" value={report.graphNodes} color="text-blue-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-zinc-500 text-sm">{data.tokenAvailable ? 'No repositories accessible' : 'No token — cannot scan repositories'}</p>
                  </div>
                )}

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Supported File Types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['.md', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.txt', '.py', '.go', '.rs', '.sh', '.env.example'].map(ext => (
                      <span key={ext} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 rounded px-2 py-0.5 font-mono">{ext}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Ignored Paths</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['node_modules/', 'build/', 'dist/', 'vendor/', '.cache/', '.next/', 'coverage/', 'tmp/', 'temp/'].map(p => (
                      <span key={p} className="text-xs bg-red-950/30 text-red-400 border border-red-900/40 rounded px-2 py-0.5 font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Sync ──────────────────────────────────────────────────── */}
            {activeTab === 'sync' && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Incremental Synchronization</p>
                {sync ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Last Sync Summary</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Metric label="New Commits" value={sync.newCommits} color="text-emerald-400" />
                      <Metric label="Modified Files" value={sync.modifiedFiles} color="text-blue-400" />
                      <Metric label="Deleted Files" value={sync.deletedFiles} color="text-red-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Metric label="New Branches" value={sync.newBranches} color="text-violet-400" />
                      <Metric label="Merged Branches" value={sync.mergedBranches} color="text-zinc-400" />
                    </div>
                    <p className="text-zinc-600 text-xs font-mono mt-3">Synced at: {new Date(sync.syncedAt).toISOString().replace('T', ' ').slice(0, 19)}</p>
                  </div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-zinc-500 text-sm">No sync data — {data.tokenAvailable ? 'no repos to sync' : 'no GitHub token'}</p>
                  </div>
                )}

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Sync Mechanism</p>
                  {[
                    ['knownCommitShas', 'Set<string>', 'Tracks all imported commit SHAs — prevents re-import'],
                    ['knownFilePaths', 'Set<string>', 'Tracks repo:path keys — detects modified/new files'],
                    ['knownBranches', 'Set<string>', 'Tracks repo:branch keys — detects new/merged branches'],
                    ['lastSyncAt', 'number | null', 'Timestamp of last successful synchronization'],
                    ['targetRepo', 'string | null', 'Single-repo mode (owner/repo) or all repos (null)'],
                  ].map(([key, type, desc]) => (
                    <div key={key} className="flex items-start gap-3 py-1.5 border-b border-zinc-800 last:border-0">
                      <span className="text-blue-400 font-mono text-xs w-36 shrink-0">{key}</span>
                      <span className="text-zinc-500 font-mono text-xs w-28 shrink-0">{type}</span>
                      <span className="text-zinc-400 text-xs">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Report ────────────────────────────────────────────────── */}
            {activeTab === 'report' && (
              <div className="space-y-3">
                {report ? (
                  <>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Reconstruction Report</p>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <Metric label="Sources Scanned" value={report.sourcesScanned} color="text-zinc-300" />
                        <Metric label="Knowledge Items" value={report.knowledgeExtracted} color="text-emerald-400" />
                        <Metric label="Conflicts" value={report.conflictsDetected} color={report.conflictsDetected > 0 ? 'text-amber-400' : 'text-zinc-600'} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <Metric label="Relationships" value={report.relationshipsCreated} color="text-blue-400" />
                        <Metric label="Timeline Events" value={report.timelineEvents} color="text-violet-400" />
                        <Metric label="Graph Nodes" value={report.graphNodes} color="text-cyan-400" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-zinc-600 text-xs mb-1">Confidence</p>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${((report.confidenceScore ?? 0) * 100).toFixed(0)}%` }} />
                          </div>
                          <p className="text-zinc-500 text-xs font-mono mt-0.5">{((report.confidenceScore ?? 0) * 100).toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-zinc-600 text-xs mb-1">Coverage</p>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${((report.coverage ?? 0) * 100).toFixed(0)}%` }} />
                          </div>
                          <p className="text-zinc-500 text-xs font-mono mt-0.5">{((report.coverage ?? 0) * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>

                    {report.missingInformation?.length > 0 && (
                      <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4">
                        <p className="text-amber-400 text-xs uppercase tracking-wider mb-2">Missing Information</p>
                        {report.missingInformation.map((m, i) => <p key={i} className="text-amber-300 text-xs font-mono">⚠ {m}</p>)}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-zinc-600 text-sm text-center py-8">Run tests to see report</p>
                )}
              </div>
            )}

            {/* ── Tests ─────────────────────────────────────────────────── */}
            {activeTab === 'tests' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">{data.total} tests</span>
                  <span className={`text-xs font-mono font-bold ml-auto ${allPass ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {data.passed}/{data.total} · {data.skipped} skipped
                  </span>
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={showFailed} onChange={e => setShowFailed(e.target.checked)} />
                    Failures only
                  </label>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {showFailed && filtered.length === 0 && (
                    <p className="text-zinc-600 text-center py-8 text-sm">No failures ✓</p>
                  )}
                  {filtered.map((r, i) => <TestRow key={i} r={r} />)}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !err && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">EF-36B — GitHub Knowledge Provider</p>
            <p className="text-zinc-600 text-xs">
              Repository Discovery · Commit Reconstruction · File Knowledge · Relationships · Provenance · Incremental Sync
            </p>
            <p className="text-zinc-700 text-xs mt-2">
              11 groups · ~40 tests · Live API + structural validation · Set VITE_GITHUB_TOKEN for full coverage
            </p>
          </div>
        )}
      </div>
    </div>
  );
}