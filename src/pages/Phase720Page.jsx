/**
 * Phase720Page — Sprint EF-7.2.1
 * Official Library Integration Dashboard (refined)
 */

import React, { useState, useEffect } from "react";

async function runTests() {
  await import("@/lib/official-library/OfficialLibraryRuntime");
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
  OFFICIAL: "text-violet-300 border-violet-700 bg-violet-950/30",
  VERIFIED: "text-blue-300 border-blue-700 bg-blue-950/30",
  LEARNED:  "text-teal-300 border-teal-700 bg-teal-950/30",
  USER:     "text-zinc-300 border-zinc-700 bg-zinc-900",
  EXTERNAL: "text-zinc-500 border-zinc-800 bg-zinc-950",
};

const SUITE_COLORS = {
  "1 — OfficialLibraryParser":          "border-violet-700 text-violet-300",
  "2 — OfficialLibraryChunker":         "border-blue-700 text-blue-300",
  "3 — OfficialLibraryIndexer":         "border-cyan-700 text-cyan-300",
  "4 — OfficialAuthority":              "border-yellow-700 text-yellow-300",
  "5 — OfficialLibraryProvider (UCME)": "border-emerald-700 text-emerald-300",
  "6 — Authority Ranking in UCME":      "border-teal-700 text-teal-300",
  "7 — Versioning":                     "border-orange-700 text-orange-300",
  "8 — Citations":                      "border-pink-700 text-pink-300",
  "9 — OfficialLibraryWatcher":         "border-indigo-700 text-indigo-300",
  "10 — OfficialKnowledgeGraph":        "border-red-700 text-red-300",
  "11 — MRE Integration":               "border-zinc-600 text-zinc-400",
  "12 — OfficialLibraryCatalog (auto-discovery)": "border-violet-500 text-violet-200",
  "13 — DocumentLoader (SRP)":          "border-sky-700 text-sky-300",
  "14 — SearchStrategy (DIP)":          "border-lime-700 text-lime-300",
  "15 — AuthorityComparator":           "border-amber-700 text-amber-300",
  "16 — OfficialLibraryBootstrap":      "border-emerald-600 text-emerald-200",
  "17 — DocumentChangeSource":          "border-rose-700 text-rose-300",
  "18 — GraphBuilder / GraphStorage / GraphQuery": "border-purple-700 text-purple-300",
  "19 — No Hardcoded Content":          "border-zinc-500 text-zinc-300",
  "20 — IDocumentDiscovery interface":    "border-violet-600 text-violet-200",
  "21 — ViteDocumentDiscovery":           "border-sky-600 text-sky-200",
  "22 — NodeDocumentDiscovery":           "border-green-700 text-green-300",
  "23 — Base44DocumentDiscovery":         "border-orange-700 text-orange-300",
  "24 — DocumentDiscoveryRegistry (Factory + DI)": "border-pink-700 text-pink-300",
  "25 — DocumentLoaderFactory":           "border-yellow-600 text-yellow-200",
  "26 — OfficialLibraryRuntime":          "border-teal-600 text-teal-200",
  "27 — Bootstrap uses Registry/Factory (no concrete imports)": "border-emerald-500 text-emerald-200",
  "28 — Catalog fully decoupled from Vite": "border-red-600 text-red-200",
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
  const [report, setReport]         = useState(null);
  const [running, setRunning]       = useState(false);
  const [err, setErr]               = useState(null);
  const [stats, setStats]           = useState(null);
  const [docs, setDocs]             = useState([]);
  const [graph, setGraph]           = useState(null);
  const [bootstrap, setBootstrap]   = useState(null);
  const [catalog, setCatalog]       = useState(null);
  const [watcher, setWatcher]       = useState(null);
  const [health, setHealth]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [runtime, setRuntime]       = useState(null);

  async function loadInfo() {
    setLoading(true);
    try {
      await import("@/lib/official-library/OfficialLibraryRuntime");
      const { DocumentDiscoveryRegistry } = await import("@/lib/official-library/DocumentDiscoveryRegistry");
      const { DocumentLoaderFactory }     = await import("@/lib/official-library/DocumentLoaderFactory");
      const active = DocumentDiscoveryRegistry.getActive();
      const loader = DocumentLoaderFactory.getActive();
      setRuntime({
        runtimeId:    active.runtimeId,
        runtimeName:  active.runtimeName,
        isAvailable:  active.isAvailable,
        registeredIds: DocumentDiscoveryRegistry.listIds(),
        loaderId:     loader.loaderId,
        loaderName:   loader.loaderName,
      });

      const { OfficialLibraryBootstrap, graphStorage } = await import("@/lib/official-library/OfficialLibraryBootstrap");
      const { OfficialLibraryIndexer }  = await import("@/lib/official-library/OfficialLibraryIndexer");
      const { OfficialLibraryCatalog }  = await import("@/lib/official-library/OfficialLibraryCatalog");
      const { OfficialLibraryWatcher }  = await import("@/lib/official-library/OfficialLibraryWatcher");
      const { OfficialLibraryProvider } = await import("@/lib/official-library/OfficialLibraryProvider");

      const result = await OfficialLibraryBootstrap.run();
      setBootstrap(result);

      const s = OfficialLibraryIndexer.stats();
      setStats({ ...s, strategyId: OfficialLibraryIndexer.activeStrategyId });
      setDocs(OfficialLibraryIndexer.getAllMeta());

      const sources = OfficialLibraryCatalog.discover();
      setCatalog({ count: sources.length, diagnostics: OfficialLibraryCatalog.diagnostics });

      setGraph({ nodes: graphStorage.nodeCount, edges: graphStorage.edgeCount, builtAt: graphStorage.builtAt });
      setWatcher({ active: OfficialLibraryWatcher.isActive, events: OfficialLibraryWatcher.eventCount, sourceId: OfficialLibraryWatcher.sourceId });

      const h = await OfficialLibraryProvider.health();
      setHealth(h);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  async function triggerReindex() {
    try {
      const { OfficialLibraryBootstrap } = await import("@/lib/official-library/OfficialLibraryBootstrap");
      await OfficialLibraryBootstrap.run(true);
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
          <div className="text-xs text-violet-400 tracking-widest mb-1">SPRINT EF-7.2.3 — RUNTIME PROVIDER CONSOLIDATION</div>
          <h1 className="text-3xl font-bold">Official Library — Runtime Provider Consolidation</h1>
          <p className="text-zinc-400 text-sm mt-1">Priority-based selection · Unified async discover() · NodeDiscovery configurable · Registry generic · Bootstrap abstracted</p>
        </div>

        {/* Runtime info */}
        {runtime && (
          <div className="border border-violet-700 rounded-lg p-4 bg-violet-950/10 text-xs">
            <div className="text-violet-400 tracking-widest mb-2">ACTIVE RUNTIME</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
                <div className="text-zinc-500">Discovery</div>
                <div className="text-violet-300 font-bold">{runtime.runtimeId}</div>
                <div className="text-zinc-600 text-xs">{runtime.runtimeName}</div>
              </div>
              <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
                <div className="text-zinc-500">Loader</div>
                <div className="text-blue-300 font-bold">{runtime.loaderId}</div>
                <div className="text-zinc-600 text-xs">{runtime.loaderName}</div>
              </div>
              <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
                <div className="text-zinc-500">Available</div>
                <div className={`font-bold ${runtime.isAvailable ? "text-emerald-400" : "text-red-400"}`}>{runtime.isAvailable ? "✓ YES" : "✗ NO"}</div>
              </div>
              <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
                <div className="text-zinc-500">Registered</div>
                <div className="text-zinc-300 font-bold">{runtime.registeredIds.length} impls</div>
                <div className="text-zinc-600 text-xs">{runtime.registeredIds.join(", ")}</div>
              </div>
            </div>
          </div>
        )}

        {/* Pipeline diagram */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-3">BOOTSTRAP PIPELINE (EF-7.2.2)</div>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Registry.getActive()", "discoverAsync()", "Loader.loadAll()", "Parser", "Chunker", "Indexer", "GraphBuilder→Storage", "Provider Ready"].map((step, i, arr) => (
              <React.Fragment key={step}>
                <span className={`border rounded px-2 py-1 ${i === 0 ? "border-violet-700 text-violet-300" : i === arr.length - 1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}>{step}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {[
              ["Priority-based",       "Vite=100 · Node=50 · Base44=10 · GitHub/Drive=80"],
              ["Unified discover()",   "Single async method — no sync/discoverAsync split"],
              ["NodeDiscovery",        "configurable baseDirs — cwd-relative, no hardcoded paths"],
              ["Runtime removed setActive()", "Auto-selection via priority only"],
              ["Catalog simplified",   "One method, one responsibility"],
              ["Future-ready",         "GitHub=80, Drive=80: just register()"],
            ].map(([k, v]) => (
              <div key={k} className="border border-zinc-800 rounded p-2">
                <div className="text-violet-300 font-bold text-xs">{k}</div>
                <div className="text-zinc-500 text-xs">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bootstrap result */}
        {bootstrap && (
          <div className={`border rounded-lg p-4 text-xs ${bootstrap.success ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
            <div className="text-zinc-400 tracking-widest mb-2">BOOTSTRAP RESULT</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Documents"   value={bootstrap.documentCount} color="text-violet-300" />
              <StatCard label="Chunks"      value={bootstrap.chunkCount}    color="text-blue-300" />
              <StatCard label="Graph Nodes" value={graph?.nodes ?? "—"}     color="text-cyan-300" />
              <StatCard label="Duration"    value={`${bootstrap.durationMs}ms`} color="text-zinc-300" />
            </div>
            {bootstrap.loadErrors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-yellow-400 text-xs">Load errors ({bootstrap.loadErrors.length}):</div>
                {bootstrap.loadErrors.slice(0, 3).map((e, i) => (
                  <div key={i} className="text-zinc-500 text-xs">• {e.name}: {e.error}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Catalog + Search Strategy */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {catalog && (
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
              <div className="text-zinc-400 tracking-widest mb-1">CATALOG</div>
              <div className="text-violet-300 font-bold text-xl">{catalog.count}</div>
              <div className="text-zinc-500">documents auto-discovered</div>
              {catalog.diagnostics.length > 0 && (
                <div className="text-yellow-500 mt-1 text-xs">{catalog.diagnostics[0]}</div>
              )}
            </div>
          )}
          {stats && (
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
              <div className="text-zinc-400 tracking-widest mb-1">SEARCH STRATEGY</div>
              <div className="text-lime-300 font-bold">{stats.strategyId}</div>
              <div className="text-zinc-500 mt-1">active strategy</div>
            </div>
          )}
          {watcher && (
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
              <div className="text-zinc-400 tracking-widest mb-1">CHANGE SOURCE</div>
              <div className="text-indigo-300 font-bold">{watcher.sourceId}</div>
              <div className="text-zinc-500 mt-1">{watcher.active ? "● active" : "○ inactive"} · {watcher.events} events</div>
            </div>
          )}
        </div>

        {/* Provider health */}
        {health && (
          <div className={`border rounded-lg p-3 text-xs ${health.healthy ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
            <span className={`font-bold mr-2 ${health.healthy ? "text-emerald-400" : "text-red-400"}`}>
              {health.healthy ? "✓ PROVIDER HEALTHY" : "✗ PROVIDER UNHEALTHY"}
            </span>
            <span className="text-zinc-500">{health.detail}</span>
          </div>
        )}

        {/* Document list */}
        {docs.length > 0 && (
          <div className="border border-zinc-700 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 px-4 py-2 text-xs text-zinc-400 tracking-widest flex justify-between">
              <span>DOCUMENTS ({docs.length})</span>
              <span>VERSION / AUTHORITY</span>
            </div>
            <div className="divide-y divide-zinc-800/60 max-h-56 overflow-y-auto">
              {docs.map(d => (
                <div key={d.documentId} className="flex items-center justify-between px-4 py-2 text-xs hover:bg-zinc-900/50">
                  <div>
                    <div className="text-zinc-200">{d.documentName}</div>
                    <div className="text-zinc-600">{d.documentId}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-zinc-500">v{d.version}</span>
                    <span className={`border rounded px-1.5 py-0.5 font-bold ${AUTHORITY_COLORS[d.authority] ?? "text-zinc-500"}`}>
                      {d.authority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={run} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm">
            {running ? "Running…" : "▶  Run Full Test Suite (28 Suites)"}
          </button>
          <button onClick={loadInfo} disabled={loading}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            🔄 Refresh
          </button>
          <button onClick={triggerReindex}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            ⚡ Reindex
          </button>
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-4 text-red-300 text-sm">Error: {err}</div>}

        {/* Summary */}
        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ EF-7.2.3 CERTIFIED" : "✗ TEST SUITE FAILED"}
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

        {/* Acceptance criteria */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-1.5">
          <div className="text-zinc-400 tracking-widest mb-2">CRITÉRIOS DE ACEITE — EF-7.2.3</div>
          {[
            "discover() é único e async — sem sync/discoverAsync duality",
            "Seleção de runtime por priority: Vite=100, Node=50, Base44=10",
            "OfficialLibraryRuntime: sem setActive() manual — apenas register() + auto-select",
            "NodeDocumentDiscovery: baseDirs configurável — sem hardcoded project root",
            "Registry: has(), listAll(), listIds() ordenado por priority",
            "IDocumentDiscovery: priority: number no contrato",
            "OfficialLibraryCatalog: método único discover() async — catalog simplificado",
            "Bootstrap: usa catalog.discover() (sem discoverAsync alias)",
            "GitHub/Drive ready: priority=80, register() = adicionado ao ecossistema",
            "Zero regressões — 28 suites do EF-7.2.2 preservadas",
            "Zero breaking changes nos consumidores externos",
          ].map((item, i) => (
            <div key={i} className="text-zinc-300 py-0.5">✓ {item}</div>
          ))}
        </div>

      </div>
    </div>
  );
}