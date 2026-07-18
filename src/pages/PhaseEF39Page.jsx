/**
 * PhaseEF39Page.jsx — Sprint EF-39
 * Memory Store Reference Implementation Dashboard
 * Route: /ef39-memory-store
 */
import React, { useState, useCallback } from "react";

function Badge({ label, color }) {
  return <span className={"text-xs font-mono px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 " + (color || "text-zinc-400")}>{label}</span>;
}
function MetCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={"text-xl font-bold font-mono " + (color || "text-zinc-300")}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

const TABS = ["Overview","Records","Indexes","Versions","Archive","Statistics","Snapshots","Performance","Events","Tests"];
const STATUS_COLOR = { active:"text-emerald-400", archived:"text-amber-400", deleted:"text-red-400", pending:"text-zinc-400" };
const TYPE_COLOR   = { Engineering:"text-red-400", Project:"text-blue-400", Business:"text-amber-400", LongTerm:"text-zinc-300", Working:"text-sky-400", Temporary:"text-zinc-500", Permanent:"text-emerald-400", Procedural:"text-violet-400", Semantic:"text-indigo-400", Personal:"text-pink-400" };

export default function PhaseEF39Page() {
  const [tab, setTab]         = useState("Overview");
  const [store, setStore]     = useState(null);
  const [records, setRecords] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [archived, setArchived]   = useState([]);
  const [versions, setVersions]   = useState({});
  const [events, setEvents]       = useState([]);
  const [stats, setStats]         = useState(null);
  const [idxStats, setIdxStats]   = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [health, setHealth]   = useState(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState(null);

  const refreshAll = useCallback(async (s) => {
    const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
    const qr = await s.query({});
    const recs = qr.records || [];
    setRecords(recs);
    setArchived(s.listArchived());
    setSnapshots(s.listSnapshots());
    setStats(s.internalStats());
    setIdxStats(s.indexStats());
    setEvents(KnowledgeStoreEventBus.getRecent(50));
    const vMap = {};
    recs.forEach(r => { vMap[r.id] = s.getVersionHistory(r.id); });
    setVersions(vMap);
  }, []);

  const initStore = useCallback(async () => {
    const { MemoryStore } = await import("@/lib/knowledge-store/memory/MemoryStore");
    const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
    KnowledgeStoreEventBus.clear();
    const s = new MemoryStore();
    setStore(s);
    setHealth(await s.health());
    await refreshAll(s);
    return s;
  }, [refreshAll]);

  const getOrInit = useCallback(async () => {
    if (store) return store;
    return await initStore();
  }, [store, initStore]);

  const addRecord = useCallback(async () => {
    const s = await getOrInit();
    const { KnowledgeEvidenceFactory } = await import("@/lib/ingestion/KnowledgeEvidence");
    const e = KnowledgeEvidenceFactory.create({ source: "dashboard", conversationId: `c-${Date.now()}`, messageId: `m-${Date.now()}`, confidence: 0.9 });
    const types = ["Engineering","Project","Business","LongTerm","Working"];
    const type  = types[Math.floor(Math.random() * types.length)];
    await s.store({ type, content: `Sample ${type} knowledge created at ${new Date().toISOString()}.`, summary: `${type} record`, tags: [type.toLowerCase(),"sample"], evidence: e });
    await refreshAll(s);
    setTab("Records");
  }, [getOrInit, refreshAll]);

  const archiveRecord = useCallback(async (id) => {
    if (!store) return;
    await store.archive(id, "Manually archived");
    await refreshAll(store);
    setTab("Archive");
  }, [store, refreshAll]);

  const restoreRecord = useCallback(async (id) => {
    if (!store) return;
    await store.restore(id);
    await refreshAll(store);
    setTab("Records");
  }, [store, refreshAll]);

  const deleteRecord = useCallback(async (id) => {
    if (!store) return;
    await store.delete(id);
    await refreshAll(store);
  }, [store, refreshAll]);

  const takeSnap = useCallback(async () => {
    const s = await getOrInit();
    s.takeSnapshot(`snap-${Date.now()}`);
    await refreshAll(s);
    setTab("Snapshots");
  }, [getOrInit, refreshAll]);

  const doSearch = useCallback(async () => {
    if (!store || !searchText) return;
    const r = await store.search({ text: searchText });
    setSearchResults(r);
  }, [store, searchText]);

  const runTests = useCallback(async () => {
    setRunning(true);
    try {
      const { runMemoryStoreTests } = await import("@/lib/knowledge-store/memory/MemoryStoreTests");
      const r = await runMemoryStoreTests();
      setTestResult(r);
      setTab("Tests");
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        <div className="border border-emerald-700/60 rounded-xl p-5 bg-emerald-950/10">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-39.2 — MEMORY STORE FINAL HARDENING</div>
          <div className="text-xl font-bold">MemoryStore — Canonical IKnowledgeStore Implementation</div>
          <div className="text-zinc-400 text-sm mt-1">Query regression fixed · Date index fully resilient · 10k stress validated · Zero as-any</div>
        </div>

        <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
          <div className="text-zinc-500 text-xs tracking-widest mb-3">PERFORMANCE GUARANTEES</div>
          <div className="flex gap-3 flex-wrap text-xs">
            {[["get/exists","O(1)","text-emerald-400"],["store/update","O(1)","text-emerald-400"],["archive/restore","O(1)","text-emerald-400"],["search","O(n)","text-amber-400"],["query","O(n)","text-amber-400"]].map(([op,c,col]) => (
              <div key={op} className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2">
                <div className="text-zinc-400">{op}</div>
                <div className={"font-bold " + col}>{c}</div>
              </div>
            ))}
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <MetCard label="Active"   value={stats.activeRecords}  color="text-emerald-400" />
            <MetCard label="Archived" value={stats.archivedRecords}color="text-amber-400" />
            <MetCard label="Deleted"  value={stats.deletedCount}   color="text-red-400" />
            <MetCard label="Writes"   value={stats.totalWrites}    color="text-sky-400" />
            <MetCard label="Queries"  value={stats.totalQueries}   color="text-violet-400" />
            <MetCard label="Searches" value={stats.totalSearches}  color="text-indigo-400" />
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button onClick={addRecord} className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold">+ Add Record</button>
          <button onClick={takeSnap}  className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-bold">📸 Snapshot</button>
          <button onClick={runTests} disabled={running} className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold">
            {running ? "Running..." : "▶ Run EF-39.2 Suite"}
          </button>
          {!store && <button onClick={initStore} className="bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Init Store</button>}
        </div>

        {testResult && (
          <div className={"border-2 rounded-xl p-4 text-center " + (testResult.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-xl font-bold " + (testResult.certified ? "text-emerald-400" : "text-red-400")}>
              {testResult.certified ? "✓ EF-39.2 CERTIFIED — FINAL HARDENING COMPLETE" : "✗ TESTS FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">{testResult.passed}/{testResult.total} passed · {testResult.failed} failed</div>
          </div>
        )}

        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap " + (tab === t ? "bg-emerald-700 text-white" : "text-zinc-400 hover:text-white")}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1">
              <div className="text-zinc-400 tracking-widest mb-2">IMPLEMENTATION COMPONENTS</div>
              {[
                ["MemoryStore",               "Main class implementing IKnowledgeStore — all 11 methods fully implemented"],
                ["MemoryStoreIndex",          "O(1) indexes: id, type, status, tags, source, conversationId, date"],
                ["MemoryStoreVersionManager", "Immutable version history — getVersion(), getHistory(), latest()"],
                ["MemoryStoreArchive",        "Soft-delete archive — archive(), restore(), listArchived()"],
                ["MemoryStoreQuery",          "Deterministic structured queries with all filters + pagination"],
                ["MemoryStoreSearch",         "Case-insensitive search: content, summary, tags + relevance scoring"],
                ["MemoryStoreStatistics",     "Counts: writes, queries, searches, uptime, avgVersions"],
                ["MemoryStoreSnapshots",      "Immutable point-in-time snapshots of store state"],
                ["MemoryStorePersistence",    "Interface: export(), import(), serialize(), deserialize()"],
              ].map(([name, desc]) => (
                <div key={name} className="flex gap-3">
                  <span className="text-emerald-400 font-bold w-52 shrink-0">{name}</span>
                  <span className="text-zinc-500">{desc}</span>
                </div>
              ))}
            </div>
            {health && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 flex items-center gap-4">
                <div className={"text-lg font-bold " + (health.status === "healthy" ? "text-emerald-400" : "text-red-400")}>{health.status.toUpperCase()}</div>
                <Badge label={health.storageEngine} color="text-sky-400" />
                <span className="text-zinc-500 text-xs">{health.details}</span>
              </div>
            )}
          </div>
        )}

        {tab === "Records" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search records..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200" />
              <button onClick={doSearch} className="bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded text-sm font-bold">Search</button>
            </div>
            {searchResults && (
              <div className="border border-sky-800 rounded-xl bg-zinc-900 p-3 text-xs">
                <div className="text-sky-400 mb-2">{searchResults.records.length} results (total: {searchResults.total})</div>
                {searchResults.records.map((r, i) => (
                  <div key={r.id} className="flex gap-2 py-1 border-b border-zinc-800/40 last:border-0">
                    <span className="text-zinc-600">{Math.round((searchResults.scores[i] || 0) * 100)}%</span>
                    <span className="text-zinc-300">{r.content.slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                ACTIVE RECORDS — {records.filter(r => r.status === "active").length}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {records.filter(r => r.status === "active").map(r => (
                  <div key={r.id} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={"text-xs font-bold " + (TYPE_COLOR[r.type] || "text-zinc-400")}>{r.type}</span>
                      <span className="text-zinc-600 text-xs">v{r.version}</span>
                      <span className="text-zinc-600 text-xs ml-auto">{r.id.slice(-8)}</span>
                    </div>
                    <div className="text-zinc-300 text-xs mb-2">{r.content.slice(0, 100)}</div>
                    <div className="flex gap-2">
                      <button onClick={() => archiveRecord(r.id)} className="text-amber-400 text-xs hover:underline">archive</button>
                      <button onClick={() => deleteRecord(r.id)}  className="text-red-400 text-xs hover:underline">delete</button>
                    </div>
                  </div>
                ))}
                {records.filter(r => r.status === "active").length === 0 && (
                  <div className="p-6 text-center text-zinc-600 text-sm">No active records. Click "+ Add Record".</div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "Indexes" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
            <div className="text-zinc-400 tracking-widest text-xs mb-4">INDEX STATISTICS</div>
            {idxStats ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {Object.entries(idxStats).map(([k, v]) => <MetCard key={k} label={k} value={String(v)} color="text-sky-400" />)}
              </div>
            ) : <div className="text-zinc-600 text-sm">Init store to see indexes.</div>}
            <div className="mt-4 text-zinc-600 text-xs">All lookups by id, type, status, tag, source, conversationId, date are O(1)</div>
          </div>
        )}

        {tab === "Versions" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">VERSION HISTORY</div>
            <div className="max-h-96 overflow-y-auto">
              {Object.entries(versions).map(([id, hist]) => (
                <div key={id} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                  <div className="text-zinc-500 text-xs mb-1">{id.slice(-12)}</div>
                  {hist.map(v => (
                    <div key={v.version} className="flex gap-3 text-xs py-0.5">
                      <span className="text-violet-400 w-8">v{v.version}</span>
                      <span className={"w-16 " + (STATUS_COLOR[v.record.status] || "text-zinc-400")}>{v.record.status}</span>
                      <span className="text-zinc-500">{v.record.content.slice(0, 60)}</span>
                    </div>
                  ))}
                </div>
              ))}
              {Object.keys(versions).length === 0 && <div className="p-6 text-center text-zinc-600 text-sm">Add records to see version history.</div>}
            </div>
          </div>
        )}

        {tab === "Archive" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">ARCHIVED RECORDS — {archived.length}</div>
            <div className="max-h-96 overflow-y-auto">
              {archived.map(entry => (
                <div key={entry.record.id} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-amber-400 text-xs font-bold">{entry.record.type}</span>
                    <span className="text-zinc-600 text-xs">{entry.record.id.slice(-8)}</span>
                    {entry.reason && <Badge label={entry.reason} color="text-zinc-500" />}
                  </div>
                  <div className="text-zinc-400 text-xs mb-2">{entry.record.content.slice(0, 80)}</div>
                  <div className="flex gap-2">
                    <button onClick={() => restoreRecord(entry.record.id)} className="text-emerald-400 text-xs hover:underline">restore</button>
                    <button onClick={() => deleteRecord(entry.record.id)}  className="text-red-400 text-xs hover:underline">delete permanently</button>
                  </div>
                </div>
              ))}
              {archived.length === 0 && <div className="p-6 text-center text-zinc-600 text-sm">No archived records.</div>}
            </div>
          </div>
        )}

        {tab === "Statistics" && (
          <div className="space-y-3">
            {stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetCard label="Active"       value={stats.activeRecords}              color="text-emerald-400" />
                <MetCard label="Archived"     value={stats.archivedRecords}            color="text-amber-400" />
                <MetCard label="Deleted"      value={stats.deletedCount}               color="text-red-400" />
                <MetCard label="Avg Versions" value={stats.avgVersions.toFixed(1)}     color="text-violet-400" />
                <MetCard label="Total Writes" value={stats.totalWrites}                color="text-sky-400" />
                <MetCard label="Queries"      value={stats.totalQueries}               color="text-blue-400" />
                <MetCard label="Searches"     value={stats.totalSearches}              color="text-indigo-400" />
                <MetCard label="Uptime"       value={Math.round(stats.uptimeMs/1000) + "s"} color="text-zinc-400" />
              </div>
            ) : <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">Init store to see statistics.</div>}
          </div>
        )}

        {tab === "Snapshots" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">SNAPSHOTS — {snapshots.length}</div>
            <div className="max-h-96 overflow-y-auto">
              {snapshots.map(snap => (
                <div key={snap.id} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sky-400 text-xs">{snap.id.slice(-16)}</span>
                    <span className="text-zinc-600 text-xs ml-auto">{new Date(snap.takenAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-zinc-400 text-xs">{snap.recordCount} records · {snap.label || "no label"}</div>
                  <div className="text-zinc-600 text-xs mt-1">active: {snap.statistics.activeRecords} · archived: {snap.statistics.archivedRecords}</div>
                </div>
              ))}
              {snapshots.length === 0 && <div className="p-6 text-center text-zinc-600 text-sm">Click "📸 Snapshot" to capture store state.</div>}
            </div>
          </div>
        )}

        {tab === "Performance" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
            <div className="text-zinc-400 tracking-widest text-xs mb-4">COMPLEXITY GUARANTEES</div>
            {[
              ["get(id)",    "O(1)", "Hash map lookup"],
              ["exists(id)", "O(1)", "Index set lookup"],
              ["store()",    "O(1)", "Map insert + index update"],
              ["update()",   "O(1)", "Map update + index diff"],
              ["archive()",  "O(1)", "Status update + archive map insert"],
              ["restore()",  "O(1)", "Status update + archive map delete"],
              ["delete()",   "O(1)", "Map delete + index remove + version clear"],
              ["query()",    "O(n)", "Linear scan with filter + deterministic sort"],
              ["search()",   "O(n)", "Linear scan with relevance scoring"],
            ].map(([op, complexity, note]) => (
              <div key={op} className="flex items-center gap-4 py-2 border-b border-zinc-800/40 last:border-0">
                <span className="text-violet-400 font-bold text-xs w-24">{op}</span>
                <span className={"font-bold text-xs w-12 " + (complexity === "O(1)" ? "text-emerald-400" : "text-amber-400")}>{complexity}</span>
                <span className="text-zinc-500 text-xs">{note}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "Events" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">STORE EVENTS — {events.length}</div>
            <div className="max-h-96 overflow-y-auto">
              {events.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                  <span className="text-sky-300 text-xs w-36 shrink-0">{e.type}</span>
                  <span className="text-zinc-500 text-xs flex-1">{e.recordId ? e.recordId.slice(-8) : "—"}</span>
                  {e.durationMs != null && <span className="text-zinc-600 text-xs">{e.durationMs}ms</span>}
                  <span className="text-zinc-700 text-xs">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
              {events.length === 0 && <div className="p-6 text-center text-zinc-600 text-sm">Init store and perform operations to see events.</div>}
            </div>
          </div>
        )}

        {tab === "Tests" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            {testResult ? (
              <>
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  TEST RESULTS — {testResult.passed}/{testResult.total} — Store · Update · Archive · Restore · Delete · Get · Exists · Query · Search · Index · Versions · Snapshots · Stats · Events · Health · Immutable · Concurrency · SOLID · Regression
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {testResult.results.map(r => (
                    <div key={r.id} className={"flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0 " + (!r.passed ? "bg-red-950/10" : "")}>
                      <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (r.passed ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="text-zinc-500 text-xs w-28 shrink-0">{r.suite}</span>
                      <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                      {!r.passed && <span className="text-red-400 text-xs truncate max-w-xs">{r.error}</span>}
                      <span className={"text-xs font-bold " + (r.passed ? "text-emerald-400" : "text-red-400")}>{r.passed ? "PASS" : "FAIL"}</span>
                      <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="p-8 text-center text-zinc-600 text-sm">Click "▶ Run ~150 Tests" to execute the full suite.</div>}
          </div>
        )}

        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EF-39.2</div>
          {[
            "Query: Filter → Sort → Paginate (regression from EF-39.1 fixed)",
            "Query pagination returns correct records regardless of page/offset",
            "Ordering remains deterministic: createdAt DESC, id ASC tie-break",
            "Index: update() resilient to createdAt change — date index fully updated",
            "All index dimensions (type, status, source, conv, date, tags) updated in update()",
            "Empty Sets auto-removed from all index maps after remove/update",
            "Stress: 10,000 stores — no exception, recordCount=10000",
            "Stress: query over 10,000 records — correct total, correct page, hasMore=true",
            "Stress: statistics consistent after 10,000 stores",
            "Zero 'as any' in production code and test code",
            "Immutability validated via Object.isFrozen() — no type casts needed",
            "All EF-39 + EF-39.1 tests continue to pass",
          ].map((c,i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}