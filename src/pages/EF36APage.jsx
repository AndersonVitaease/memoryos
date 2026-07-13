/**
 * EF36APage — Knowledge Reconstruction Engine Diagnostics
 * EF-36A · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runKRETests } from '@/lib/knowledge-reconstruction/kreTests';

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
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? 'bg-red-950/10' : ''}`}>
      <button onClick={() => (r.error || r.details) && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-1.5 px-3 text-left">
        <Badge label={r.passed ? 'PASS' : 'FAIL'}
          style={r.passed ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${r.passed ? 'text-zinc-300' : 'text-red-300'}`}>{r.name}</p>
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

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sources', label: 'Sources' },
  { id: 'graph', label: 'Graph' },
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'report', label: 'Report' },
  { id: 'tests', label: 'Tests' },
];

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
            <Badge label={ok ? 'PASS' : 'FAIL'}
              style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
            <span className="text-zinc-300 text-xs font-mono flex-1">{g}</span>
            <span className={`text-xs font-bold font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{v.passed}/{v.total}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function EF36APage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      const report = await runKRETests();
      setData(report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.passed === data.total;
  const passRate = data ? ((data.passed / data.total) * 100).toFixed(0) : null;
  const filtered = showFailed ? (data?.results.filter(r => !r.passed) ?? []) : (data?.results ?? []);
  const report = data?.lastReport;
  const snap = data?.lastSnapshot;
  const health = data?.engineHealth;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/40 to-purple-950/50 border border-violet-800/40 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-violet-400">KRE — Knowledge Reconstruction Engine</span>
                <span className="text-zinc-600">·</span>
                <span className="text-purple-400">EF-36A · Project Independence</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">Knowledge Reconstruction Engine</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Sources · Graph · Timeline · Provenance · Conflicts · Snapshots · Reports
              </p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Running...' : 'Run EF-36A Tests'}
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              <Metric label="Passed" value={data.passed} color="text-emerald-400" />
              <Metric label="Failed" value={data.total - data.passed} color={(data.total - data.passed) > 0 ? 'text-red-400' : 'text-zinc-600'} />
              <Metric label="Total" value={data.total} />
              <Metric label="Rate" value={`${passRate}%`} color={allPass ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Time" value={`${data.durationMs}ms`} color="text-violet-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running KRE test suite...</p>
            <p className="text-zinc-600 text-xs mt-1">Sources · Graph · Timeline · Provenance · Conflicts · Reconstruction · Snapshots</p>
          </div>
        )}

        {err && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Engine Error</p>
            <p className="text-red-400 text-xs font-mono">{err}</p>
          </div>
        )}

        {data && !running && (
          <>
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-violet-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Overview ──────────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-3">
                {/* Engine Health */}
                {health && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Engine Health</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Metric label="Registered Sources" value={health.registeredSources} color="text-violet-400" />
                      <Metric label="Available Sources" value={health.availableSources} color="text-emerald-400" />
                      <Metric label="Total Items" value={health.totalItems} color="text-zinc-200" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Metric label="Graph Nodes" value={health.totalNodes} color="text-blue-400" />
                      <Metric label="Graph Edges" value={health.totalEdges} color="text-cyan-400" />
                      <Metric label="Conflicts" value={health.totalConflicts} color={health.totalConflicts > 0 ? 'text-amber-400' : 'text-zinc-500'} />
                    </div>
                    <p className="text-zinc-600 text-xs font-mono mt-2">{health.details}</p>
                  </div>
                )}

                {/* Architecture */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">EF-36A Architecture</p>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    {[
                      ['IKnowledgeSource', 'Interface — source contract'],
                      ['KnowledgeReconstructionEngine', 'Core — orchestrates reconstruction'],
                      ['KnowledgeGraph', 'Graph — nodes + edges + BFS'],
                      ['TimelineBuilder', 'Timeline — chronological events'],
                      ['ConflictDetector', 'Conflicts — duplicates, versions, decisions'],
                      ['ProvenanceTracker', 'Provenance — origin, confidence, status'],
                      ['OfficialLibrarySource', 'First provider — EF-36A'],
                      ['KnowledgeSnapshot', 'Cognitive snapshot — immutable'],
                      ['ReconstructionReport', 'Full report — coverage + confidence'],
                    ].map(([name, desc]) => (
                      <div key={name} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700">
                        <span className="text-violet-400 shrink-0">·</span>
                        <div>
                          <p className="text-zinc-200 text-xs font-semibold">{name}</p>
                          <p className="text-zinc-600 text-xs">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Verdict */}
                <div className={`rounded-xl border-2 p-4 ${allPass ? 'bg-violet-950/30 border-violet-600' : 'bg-amber-950/20 border-amber-700'}`}>
                  <p className={`font-bold text-base ${allPass ? 'text-violet-300' : 'text-amber-300'}`}>
                    {allPass ? '✅ EF-36A — ALL TESTS PASSED' : `⚠ ${data.total - data.passed} TEST(S) FAILED`}
                  </p>
                  <p className="text-zinc-400 text-xs mt-1">
                    {data.passed}/{data.total} tests · {data.durationMs}ms · {new Date(data.runAt).toISOString().slice(0, 19).replace('T', ' ')}
                  </p>
                </div>

                <GroupSummary results={data.results} />
              </div>
            )}

            {/* ── Sources ───────────────────────────────────────────────────── */}
            {activeTab === 'sources' && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Knowledge Sources — Registered in this run</p>
                {report?.sourcesSummary?.map(s => (
                  <div key={s.sourceId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`w-2 h-2 rounded-full ${s.errors === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="text-zinc-200 font-semibold text-sm">{s.name}</span>
                      <span className="text-zinc-600 font-mono text-xs">{s.sourceId}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="Items Loaded" value={s.itemsLoaded} color="text-emerald-400" />
                      <Metric label="Errors" value={s.errors} color={s.errors > 0 ? 'text-red-400' : 'text-zinc-500'} />
                    </div>
                  </div>
                ))}
                {(!report?.sourcesSummary || report.sourcesSummary.length === 0) && (
                  <p className="text-zinc-600 text-sm text-center py-8">Run the tests to see source details</p>
                )}

                {/* Future sources */}
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Future Providers (next sprints)</p>
                  {[
                    { name: 'GitHub Source', sprint: 'EF-36B', type: 'github', status: 'planned' },
                    { name: 'Base44 Source', sprint: 'EF-36C', type: 'base44', status: 'planned' },
                    { name: 'ChatGPT Export Source', sprint: 'EF-36D', type: 'chatgpt', status: 'planned' },
                    { name: 'Google Drive Source', sprint: 'EF-36E', type: 'google_drive', status: 'planned' },
                    { name: 'Local File Source', sprint: 'EF-36F', type: 'local_file', status: 'planned' },
                  ].map(p => (
                    <div key={p.name} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0">
                      <span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
                      <span className="text-zinc-500 text-xs font-mono flex-1">{p.name}</span>
                      <Badge label={p.sprint} style="bg-zinc-800 text-zinc-500 border-zinc-700" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Graph ─────────────────────────────────────────────────────── */}
            {activeTab === 'graph' && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Knowledge Graph — Internal Structure</p>
                {report && (
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Nodes" value={report.graphNodes} color="text-blue-400" />
                    <Metric label="Edges" value={report.graphEdges} color="text-cyan-400" />
                    <Metric label="Relationships" value={report.relationshipsCreated} color="text-violet-400" />
                    <Metric label="Timeline Events" value={report.timelineEvents} color="text-purple-400" />
                  </div>
                )}

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Supported Node Types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["project", "sprint", "rfc", "adr", "connector", "document", "conversation",
                      "commit", "decision", "implementation", "requirement", "specialist", "goal", "artifact"
                    ].map(t => (
                      <span key={t} className="text-xs bg-zinc-800 text-zinc-400 rounded px-2 py-0.5 font-mono border border-zinc-700">{t}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Graph Capabilities</p>
                  {["addNode() / addEdge() — add immutable nodes and edges",
                    "listNodes(type?) — filter by GraphNodeType",
                    "neighbors(nodeId) — adjacency traversal",
                    "edgesFrom(nodeId) — outgoing edge list",
                    "shortestPath(from, to) — BFS pathfinding",
                    "findByLabel(query) — partial text search",
                    "findByProperty(key, value) — property filter",
                    "stats() — type breakdown counts",
                  ].map(cap => (
                    <div key={cap} className="flex items-start gap-2 text-xs py-1 border-b border-zinc-800/60 last:border-0">
                      <span className="text-violet-400 shrink-0">·</span>
                      <span className="text-zinc-400 font-mono">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Snapshot ──────────────────────────────────────────────────── */}
            {activeTab === 'snapshot' && snap && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge label="SNAPSHOT" style="bg-violet-900/50 text-violet-300 border-violet-700" />
                    <span className="text-zinc-500 font-mono text-xs">{snap.id}</span>
                    <span className="text-zinc-600 text-xs ml-auto">{new Date(snap.capturedAt).toISOString().slice(11, 23)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Metric label="Items" value={snap.itemCount} color="text-zinc-200" />
                    <Metric label="Nodes" value={snap.nodeCount} color="text-blue-400" />
                    <Metric label="Edges" value={snap.edgeCount} color="text-cyan-400" />
                  </div>
                  <div className="mb-3">
                    <p className="text-zinc-600 text-xs mb-1">Confidence</p>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-600 rounded-full" style={{ width: `${((snap.confidence ?? 0) * 100).toFixed(0)}%` }} />
                    </div>
                    <p className="text-zinc-500 text-xs font-mono mt-0.5">{((snap.confidence ?? 0) * 100).toFixed(1)}%</p>
                  </div>
                  {snap.activeSprint && (
                    <div className="mb-2"><span className="text-zinc-600 text-xs">Active Sprint: </span><span className="text-zinc-300 text-xs font-mono">{snap.activeSprint}</span></div>
                  )}
                </div>

                {snap.architecture?.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Architecture ({snap.architecture.length})</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {snap.architecture.map((a, i) => <p key={i} className="text-zinc-400 text-xs font-mono truncate">· {a}</p>)}
                    </div>
                  </div>
                )}

                {snap.relatedDecisions?.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Related Decisions ({snap.relatedDecisions.length})</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {snap.relatedDecisions.map((d, i) => <p key={i} className="text-zinc-400 text-xs font-mono truncate">· {d}</p>)}
                    </div>
                  </div>
                )}

                {snap.openRisks?.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4">
                    <p className="text-amber-400 text-xs uppercase tracking-wider mb-2">Open Risks ({snap.openRisks.length})</p>
                    {snap.openRisks.map((r, i) => <p key={i} className="text-amber-300 text-xs font-mono truncate">⚠ {r}</p>)}
                  </div>
                )}
              </div>
            )}

            {/* ── Report ────────────────────────────────────────────────────── */}
            {activeTab === 'report' && report && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Reconstruction Report</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Metric label="Sources Scanned" value={report.sourcesScanned} color="text-violet-400" />
                    <Metric label="Knowledge Items" value={report.knowledgeExtracted} color="text-emerald-400" />
                    <Metric label="Conflicts" value={report.conflictsDetected} color={report.conflictsDetected > 0 ? 'text-amber-400' : 'text-zinc-500'} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Metric label="Relationships" value={report.relationshipsCreated} color="text-blue-400" />
                    <Metric label="Timeline Events" value={report.timelineEvents} color="text-purple-400" />
                    <Metric label="Snapshots" value={report.snapshotsGenerated} color="text-cyan-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <p className="text-zinc-600 text-xs mb-1">Confidence Score</p>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${((report.confidenceScore ?? 0) * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="text-zinc-500 text-xs font-mono mt-0.5">{((report.confidenceScore ?? 0) * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-zinc-600 text-xs mb-1">Coverage</p>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-600 rounded-full" style={{ width: `${((report.coverage ?? 0) * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="text-zinc-500 text-xs font-mono mt-0.5">{((report.coverage ?? 0) * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                  <p className="text-zinc-600 text-xs font-mono">Duration: {report.durationMs}ms · Status: {report.status}</p>
                </div>

                {report.missingInformation?.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4">
                    <p className="text-amber-400 text-xs uppercase tracking-wider mb-2">Missing Information</p>
                    {report.missingInformation.map((m, i) => <p key={i} className="text-amber-300 text-xs font-mono">⚠ {m}</p>)}
                  </div>
                )}

                {report.errors?.length > 0 && (
                  <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4">
                    <p className="text-red-400 text-xs uppercase tracking-wider mb-2">Errors ({report.errors.length})</p>
                    {report.errors.map((e, i) => <p key={i} className="text-red-300 text-xs font-mono">{e}</p>)}
                  </div>
                )}
              </div>
            )}

            {/* ── Tests ─────────────────────────────────────────────────────── */}
            {activeTab === 'tests' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">{data.total} tests</span>
                  <span className={`text-xs font-mono font-bold ml-auto ${allPass ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {data.passed}/{data.total}
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
            <p className="text-zinc-400 text-sm font-medium mb-1">EF-36A — Knowledge Reconstruction Engine</p>
            <p className="text-zinc-600 text-xs">
              IKnowledgeSource · KnowledgeGraph · TimelineBuilder · ConflictDetector · ProvenanceTracker · Snapshots
            </p>
            <p className="text-zinc-700 text-xs mt-2">
              9 groups · ~40 tests · Project Independence Foundation
            </p>
          </div>
        )}
      </div>
    </div>
  );
}