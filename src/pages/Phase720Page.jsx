/**
 * Phase720Page — Sprint EF-7.2.0
 * Official Library Integration Dashboard
 */

import React, { useState, useEffect } from "react";

async function runTests() {
  const { runOfficialLibraryTests } = await import("@/lib/official-library/OfficialLibraryTests");
  return runOfficialLibraryTests();
}

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const AUTHORITY_COLORS = {
  OFFICIAL:  "text-violet-300 border-violet-700 bg-violet-950/30",
  VERIFIED:  "text-blue-300 border-blue-700 bg-blue-950/30",
  LEARNED:   "text-teal-300 border-teal-700 bg-teal-950/30",
  USER:      "text-zinc-300 border-zinc-700 bg-zinc-900",
  EXTERNAL:  "text-zinc-500 border-zinc-800 bg-zinc-950",
};

const SUITE_COLORS = {
  "1 — OfficialLibraryParser":       "border-violet-700 text-violet-300",
  "2 — OfficialLibraryChunker":      "border-blue-700 text-blue-300",
  "3 — OfficialLibraryIndexer":      "border-cyan-700 text-cyan-300",
  "4 — OfficialAuthority":           "border-yellow-700 text-yellow-300",
  "5 — OfficialLibraryProvider (UCME)": "border-emerald-700 text-emerald-300",
  "6 — Authority Ranking in UCME":   "border-teal-700 text-teal-300",
  "7 — Versioning":                  "border-orange-700 text-orange-300",
  "8 — Citations":                   "border-pink-700 text-pink-300",
  "9 — OfficialLibraryWatcher":      "border-indigo-700 text-indigo-300",
  "10 — OfficialKnowledgeGraph":     "border-red-700 text-red-300",
  "11 — MRE Integration":            "border-zinc-600 text-zinc-400",
};

function StatCard({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900 text-center">
      <div className="text-zinc-500 text-xs">{label}</div>
      <div className={`font-bold text-xl font-mono ${color}`}>{value}</div>
    </div>
  );
}

export default function Phase720Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState(null);
  const [stats, setStats]     = useState(null);
  const [docs, setDocs]       = useState([]);
  const [graph, setGraph]     = useState(null);
  const [watcherStatus, setWatcherStatus] = useState(null);
  const [providerHealth, setProviderHealth] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  async function loadInfo() {
    setLoadingInfo(true);
    try {
      const { OfficialLibraryIndexer } = await import("@/lib/official-library/OfficialLibraryIndexer");
      const { officialKnowledgeGraph }  = await import("@/lib/official-library/OfficialKnowledgeGraph");
      const { OfficialLibraryWatcher }  = await import("@/lib/official-library/OfficialLibraryWatcher");
      const { OfficialLibraryProvider } = await import("@/lib/official-library/OfficialLibraryProvider");

      await OfficialLibraryIndexer.initialize();
      const s = OfficialLibraryIndexer.stats();
      const m = OfficialLibraryIndexer.getAllMeta();
      setStats(s);
      setDocs(m);

      // Build graph
      const chunks = OfficialLibraryIndexer.getChunks();
      officialKnowledgeGraph.build(chunks);
      setGraph({ nodes: officialKnowledgeGraph.nodeCount, edges: officialKnowledgeGraph.edgeCount });

      // Watcher
      setWatcherStatus({ active: OfficialLibraryWatcher.isActive, events: OfficialLibraryWatcher.eventCount });

      // Provider health
      const h = await OfficialLibraryProvider.health();
      setProviderHealth(h);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoadingInfo(false);
    }
  }

  async function triggerReindex() {
    try {
      const { OfficialLibraryWatcher } = await import("@/lib/official-library/OfficialLibraryWatcher");
      await OfficialLibraryWatcher.triggerFullReindex("manual-dashboard");
      await loadInfo();
    } catch (e) { setErr(e?.message ?? String(e)); }
  }

  useEffect(() => { loadInfo(); }, []);

  const suites = report
    ? [...new Set(report.results.map(r => r.suite))].map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">SPRINT EF-7.2.0 — OFFICIAL LIBRARY INTEGRATION</div>
          <h1 className="text-3xl font-bold">Official Library — Cognitive Memory</h1>
          <p className="text-zinc-400 text-sm mt-1">Official Library → MemoryProvider → UCME → MRE → ReasoningResult</p>
        </div>

        {/* Authority Hierarchy */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-3">AUTHORITY HIERARCHY</div>
          <div className="flex gap-2 flex-wrap">
            {[
              ["OFFICIAL",  "+0.20 conf boost", "Official Library docs"],
              ["VERIFIED",  "+0.10 conf boost", "Foundation docs, ADRs"],
              ["LEARNED",   "+0.00",             "Usage patterns"],
              ["USER",      "+0.00",             "User provided"],
              ["EXTERNAL",  "+0.00",             "External connectors"],
            ].map(([auth, boost, desc]) => (
              <div key={auth} className={`border rounded px-3 py-2 ${AUTHORITY_COLORS[auth]}`}>
                <div className="font-bold">{auth}</div>
                <div className="text-zinc-500 text-xs">{boost}</div>
                <div className="text-zinc-600 text-xs">{desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-zinc-500 text-xs">Ranking: Authority → Confidence → Relevance → Recency</div>
        </div>

        {/* Indexer Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Documents"     value={stats.documentCount}    color="text-violet-300" />
            <StatCard label="Chunks"        value={stats.chunkCount}       color="text-blue-300" />
            <StatCard label="Est. Tokens"   value={stats.totalTokens?.toLocaleString() ?? "—"} color="text-cyan-300" />
            <StatCard label="KG Edges"      value={graph?.edges ?? "—"}    color="text-teal-300" />
          </div>
        )}

        {loadingInfo && !stats && (
          <div className="text-zinc-500 text-xs animate-pulse">Loading library index…</div>
        )}

        {/* Provider Health + Watcher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {providerHealth && (
            <div className={`border rounded-lg p-4 text-xs ${providerHealth.healthy ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
              <div className="text-zinc-400 tracking-widest mb-1">PROVIDER STATUS</div>
              <div className={`font-bold ${providerHealth.healthy ? "text-emerald-400" : "text-red-400"}`}>
                {providerHealth.healthy ? "✓ HEALTHY" : "✗ UNHEALTHY"}
              </div>
              <div className="text-zinc-500 mt-1">{providerHealth.detail}</div>
            </div>
          )}
          {watcherStatus !== null && (
            <div className="border border-zinc-700 rounded-lg p-4 text-xs bg-zinc-900">
              <div className="text-zinc-400 tracking-widest mb-1">WATCHER STATUS</div>
              <div className={`font-bold ${watcherStatus.active ? "text-emerald-400" : "text-zinc-400"}`}>
                {watcherStatus.active ? "● ACTIVE" : "○ INACTIVE"}
              </div>
              <div className="text-zinc-500 mt-1">Events recorded: {watcherStatus.events}</div>
            </div>
          )}
        </div>

        {/* Document List */}
        {docs.length > 0 && (
          <div className="border border-zinc-700 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 px-4 py-2 text-xs text-zinc-400 tracking-widest flex justify-between">
              <span>DOCUMENTS ({docs.length})</span>
              <span>VERSION / AUTHORITY</span>
            </div>
            <div className="divide-y divide-zinc-800/60 max-h-64 overflow-y-auto">
              {docs.map(d => (
                <div key={d.documentId} className="flex items-center justify-between px-4 py-2 text-xs hover:bg-zinc-900/50">
                  <div>
                    <div className="text-zinc-200">{d.documentName}</div>
                    <div className="text-zinc-600">{d.documentId} · {d.path?.split("/").slice(-1)[0]}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-zinc-500">v{d.version}</span>
                    <span className={`border rounded px-1.5 py-0.5 text-xs font-bold ${AUTHORITY_COLORS[d.authority] ?? "text-zinc-500"}`}>
                      {d.authority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Knowledge Graph */}
        {graph && (
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
            <div className="text-zinc-400 tracking-widest mb-2">KNOWLEDGE GRAPH</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-zinc-800 rounded p-2 text-center">
                <div className="text-zinc-500">Nodes</div>
                <div className="text-violet-300 font-bold text-xl">{graph.nodes}</div>
                <div className="text-zinc-600">documents + components</div>
              </div>
              <div className="border border-zinc-800 rounded p-2 text-center">
                <div className="text-zinc-500">Edges</div>
                <div className="text-blue-300 font-bold text-xl">{graph.edges}</div>
                <div className="text-zinc-600">semantic links</div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={run} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            {running ? "Running Tests…" : "▶  Run Full Test Suite (11 Suites)"}
          </button>
          <button onClick={loadInfo} disabled={loadingInfo}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            🔄 Refresh
          </button>
          <button onClick={triggerReindex}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            ⚡ Reindex All
          </button>
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-4 text-red-300 text-sm">Error: {err}</div>}

        {/* Summary banner */}
        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ EF-7.2.0 CERTIFIED" : "✗ TEST SUITE FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
          </div>
        )}

        {/* Suite tables */}
        {suites.map(({ suite, rows }) => {
          const sp  = rows.filter(r => r.passed).length;
          const cls = SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300";
          return (
            <div key={suite} className="space-y-1">
              <div className={`border rounded-lg px-4 py-2 flex justify-between bg-zinc-900 ${cls}`}>
                <span className="font-bold text-sm">{suite}</span>
                <span className="text-xs font-mono">{sp}/{rows.length}</span>
              </div>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-500">
                    <tr>
                      <th className="text-left p-2 pl-3 w-96">Test</th>
                      <th className="text-left p-2">Detail</th>
                      <th className="text-center p-2 pr-3 w-14">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                        <td className="p-2 pl-3 text-zinc-300">{r.name}</td>
                        <td className="p-2 text-zinc-500 truncate max-w-xs" title={r.detail}>{r.detail}</td>
                        <td className="p-2 pr-3 text-center"><Badge ok={r.passed} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.filter(r => !r.passed).map((r, i) => (
                  <div key={i} className="border-t border-red-800 bg-red-950/10 px-3 py-1.5 text-red-300 text-xs">
                    ✗ [{r.name}] {r.error}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Acceptance Criteria */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-1.5">
          <div className="text-zinc-400 tracking-widest mb-2">CRITÉRIOS DE ACEITE — EF-7.2.0</div>
          {[
            "OfficialLibraryProvider implementa MemoryProvider — auto-registra no UCME",
            "Official Library é indexada (documentos → chunks com metadata completo)",
            "Cada chunk: documentId, documentName, version, chapter, section, title, authority, createdAt, updatedAt, tags",
            "MemoryEvidence possui citation: sourceType=OFFICIAL_LIBRARY, document, chapter, section, version, authority",
            "Authority: OFFICIAL > VERIFIED > LEARNED > USER > EXTERNAL",
            "UCME Fusion: Authority → Confidence → Relevance → Recency (authority boost = +0.20 para OFFICIAL)",
            "Official Knowledge Guard: documentos oficiais nunca são substituídos por LLM ou conectores",
            "OfficialLibraryWatcher: reindexar sem reiniciar a aplicação",
            "OfficialKnowledgeGraph: ligações semânticas entre documentos e componentes do sistema",
            "Versionamento: version, createdAt, updatedAt, deprecated, supersedes, supersededBy",
            "Citações: MRE pode explicar 'baseado no MAS v3.0 capítulo 2 seção 1.1'",
            "Planner não modificado — continua recebendo ReasoningResult",
            "MRE não modificado — continua recebendo MemoryEvidence[]",
            "UCME não modificado — apenas novo provider registrado",
            "Zero regressões em suites anteriores (UCME 7.0.0 + MRE 7.1.1)",
          ].map((item, i) => (
            <div key={i} className="text-zinc-300 py-0.5">✓ {item}</div>
          ))}
        </div>

      </div>
    </div>
  );
}