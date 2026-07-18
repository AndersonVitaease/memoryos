/**
 * PhaseEF38Page.jsx — Sprint EF-38.0
 * Universal Knowledge Store Contract Dashboard
 * Route: /ef38-uks
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

const TABS = ["Overview","Contract","Capabilities","Errors","Events","Validation","Tests"];

const ENGINES = [
  { name: "memory",      color: "text-zinc-400",   persist: false, semantic: false, graph: false, tx: false },
  { name: "sqlite",      color: "text-yellow-400",  persist: true,  semantic: false, graph: false, tx: true  },
  { name: "postgres",    color: "text-blue-400",    persist: true,  semantic: false, graph: false, tx: true  },
  { name: "vector",      color: "text-violet-400",  persist: true,  semantic: true,  graph: false, tx: false },
  { name: "neo4j",       color: "text-emerald-400", persist: true,  semantic: false, graph: true,  tx: true  },
  { name: "cloud",       color: "text-sky-400",     persist: true,  semantic: true,  graph: false, tx: false },
  { name: "distributed", color: "text-red-400",     persist: true,  semantic: true,  graph: true,  tx: true  },
];

const INTERFACE_METHODS = [
  { name: "store()",   desc: "Persist a new knowledge record with assigned id and version" },
  { name: "update()",  desc: "Update record — increments version, archives previous" },
  { name: "archive()", desc: "Soft delete — preserves history, excluded from default queries" },
  { name: "restore()", desc: "Restore an archived record to active status" },
  { name: "delete()",  desc: "Permanent removal — irreversible, prefer archive()" },
  { name: "exists()",  desc: "Check if a record with given id exists (any status)" },
  { name: "get()",     desc: "Retrieve single record by id" },
  { name: "search()",  desc: "Full-text or semantic search over active records" },
  { name: "query()",   desc: "Structured query with filters and pagination" },
  { name: "stats()",   desc: "Aggregate statistics: counts, sources, engine info" },
  { name: "health()",  desc: "Latency and availability health check" },
];

export default function PhaseEF38Page() {
  const [tab, setTab]         = useState("Overview");
  const [running, setRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [events, setEvents]   = useState([]);

  const runTests = useCallback(async () => {
    setRunning(true);
    try {
      const { runKnowledgeStoreContractTests } = await import("@/lib/knowledge-store/knowledgeStoreContractTests");
      const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
      const r = await runKnowledgeStoreContractTests();
      setTestResult(r);
      setEvents(KnowledgeStoreEventBus.getRecent(50));
      setTab("Tests");
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="border border-amber-700/60 rounded-xl p-5 bg-amber-950/10">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-38.0 — UNIVERSAL KNOWLEDGE STORE CONTRACT</div>
          <div className="text-xl font-bold">UKS — Universal Knowledge Store</div>
          <div className="text-zinc-400 text-sm mt-1">Stable API contract · No implementation yet · Engineering First · SOLID compliant</div>
        </div>

        {/* DIP architecture */}
        <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
          <div className="text-zinc-500 text-xs tracking-widest mb-3">DEPENDENCY INVERSION — KIP → IKnowledgeStore ← concrete engines</div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="border border-sky-700 text-sky-300 rounded px-2 py-1">KIP</span>
            <span className="text-zinc-600">→ depends on →</span>
            <span className="border border-amber-600 text-amber-300 rounded px-2 py-1 font-bold">IKnowledgeStore ★</span>
            <span className="text-zinc-600">← implemented by ←</span>
            {["memory","postgres","vector","neo4j","cloud"].map(e => (
              <span key={e} className="border border-zinc-700 text-zinc-400 rounded px-2 py-1">{e}</span>
            ))}
          </div>
          <div className="text-zinc-600 text-xs mt-2">New engines never require pipeline changes. Zero concrete dependencies in domain logic.</div>
        </div>

        {/* Stats */}
        {testResult && (
          <div className="grid grid-cols-3 gap-3">
            <MetCard label="Tests Passed" value={testResult.passed} color="text-emerald-400" />
            <MetCard label="Tests Failed" value={testResult.failed} color={testResult.failed > 0 ? "text-red-400" : "text-zinc-500"} />
            <MetCard label="Total"        value={testResult.total}  color="text-zinc-300" />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          <button onClick={runTests} disabled={running}
            className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "▶ Run Contract Tests"}
          </button>
        </div>

        {/* Test banner */}
        {testResult && (
          <div className={"border-2 rounded-xl p-4 text-center " + (testResult.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-xl font-bold " + (testResult.certified ? "text-emerald-400" : "text-red-400")}>
              {testResult.certified ? "✓ UKS CONTRACT CERTIFIED" : "✗ CONTRACT TESTS FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">{testResult.passed}/{testResult.total} passed · {testResult.failed} failed</div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap " + (tab === t ? "bg-amber-700 text-white" : "text-zinc-400 hover:text-white")}>
              {t}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ───────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-2">
              <div className="text-zinc-400 tracking-widest mb-2">SPRINT OBJECTIVE</div>
              <div className="text-zinc-300">This sprint defines the stable API contract for the Universal Knowledge Store.</div>
              <div className="text-zinc-500">No storage implementation exists yet — only contracts, DTOs, errors, events, validation, and capabilities.</div>
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1">
              <div className="text-zinc-400 tracking-widest mb-2">ENGINEERING FIRST PRINCIPLES</div>
              {[
                "KIP depends only on IKnowledgeStore — never on concrete engines",
                "No module may write memories without depending on IKnowledgeStore",
                "Every operation is deterministic — same input, same result shape",
                "Every operation returns immutable frozen objects",
                "Every write emits a KnowledgeStoreEvent (auditable)",
                "Never throws — errors returned in result.error field",
                "SOLID: SRP, OCP, LSP, ISP, DIP all enforced",
              ].map((p, i) => <div key={i} className="text-zinc-300">✓ {p}</div>)}
            </div>
          </div>
        )}

        {/* ── CONTRACT ───────────────────────────────────────────────────────── */}
        {tab === "Contract" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">IKnowledgeStore — 11 METHODS</div>
            {INTERFACE_METHODS.map((m, i) => (
              <div key={m.name} className="flex items-start gap-4 px-4 py-3 border-b border-zinc-800/40 last:border-0">
                <span className="text-amber-400 font-bold text-xs w-20 shrink-0">{m.name}</span>
                <span className="text-zinc-400 text-xs">{m.desc}</span>
              </div>
            ))}
            <div className="px-4 py-3 bg-zinc-800/30 text-xs space-y-1">
              <div className="text-zinc-500">All results: frozen (immutable) · ok: boolean · error?: string</div>
              <div className="text-zinc-500">All writes: emit KnowledgeStoreEvent · never throw · always return result</div>
            </div>
          </div>
        )}

        {/* ── CAPABILITIES ───────────────────────────────────────────────────── */}
        {tab === "Capabilities" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-x-auto">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">STORAGE ENGINE CAPABILITIES</div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-3 py-2 text-left text-zinc-500">Engine</th>
                  <th className="px-2 py-2 text-zinc-500">Persist</th>
                  <th className="px-2 py-2 text-zinc-500">Semantic</th>
                  <th className="px-2 py-2 text-zinc-500">Graph</th>
                  <th className="px-2 py-2 text-zinc-500">Tx</th>
                </tr>
              </thead>
              <tbody>
                {ENGINES.map(e => (
                  <tr key={e.name} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                    <td className={"px-3 py-2 font-bold " + e.color}>{e.name}</td>
                    <td className={"px-2 py-2 text-center " + (e.persist ? "text-emerald-400" : "text-red-400")}>{e.persist ? "✓" : "✗"}</td>
                    <td className={"px-2 py-2 text-center " + (e.semantic ? "text-emerald-400" : "text-red-400")}>{e.semantic ? "✓" : "✗"}</td>
                    <td className={"px-2 py-2 text-center " + (e.graph ? "text-emerald-400" : "text-red-400")}>{e.graph ? "✓" : "✗"}</td>
                    <td className={"px-2 py-2 text-center " + (e.tx ? "text-emerald-400" : "text-red-400")}>{e.tx ? "✓" : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 text-zinc-600 text-xs">Tx = ACID transactions · Semantic = embedding/vector search · Graph = graph traversal queries</div>
          </div>
        )}

        {/* ── ERRORS ─────────────────────────────────────────────────────────── */}
        {tab === "Errors" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">ERROR CODES</div>
            {["NOT_FOUND","ALREADY_EXISTS","VALIDATION_FAILED","ARCHIVED","DELETED","VERSION_CONFLICT","READ_ONLY","CAPACITY_EXCEEDED","UNAVAILABLE","UNAUTHORIZED","INVALID_QUERY","EVIDENCE_MISSING","CONTENT_EMPTY","TYPE_INVALID","UNKNOWN"].map(code => (
              <div key={code} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                <span className="text-red-400 font-bold text-xs">{code}</span>
              </div>
            ))}
            <div className="px-4 py-3 text-zinc-600 text-xs">All errors are frozen objects · never thrown · always returned in result.error</div>
          </div>
        )}

        {/* ── EVENTS ─────────────────────────────────────────────────────────── */}
        {tab === "Events" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">EVENT TYPES</div>
              {["RECORD_STORED","RECORD_UPDATED","RECORD_ARCHIVED","RECORD_RESTORED","RECORD_DELETED","RECORD_QUERIED","RECORD_SEARCHED","HEALTH_CHECKED","STATS_QUERIED","STORE_ERROR"].map(t => (
                <div key={t} className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  <span className="text-sky-300 text-xs">{t}</span>
                </div>
              ))}
            </div>
            {events.length > 0 && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">LIVE EVENTS FROM TESTS — {events.length}</div>
                <div className="max-h-64 overflow-y-auto">
                  {events.map(e => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                      <span className="text-sky-400 text-xs">{e.type}</span>
                      <span className="text-zinc-500 text-xs">{e.engine}</span>
                      {e.recordId && <span className="text-zinc-600 text-xs">{e.recordId.slice(-8)}</span>}
                      <span className="text-zinc-700 text-xs ml-auto">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VALIDATION ─────────────────────────────────────────────────────── */}
        {tab === "Validation" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">VALIDATION RULES</div>
            {[
              { scope: "Draft",       rule: "content must not be empty" },
              { scope: "Draft",       rule: "evidence is required with source, conversationId, messageId" },
              { scope: "Draft",       rule: "evidence.confidence must be 0–1" },
              { scope: "Draft",       rule: "type must be a valid MemoryType (10 types)" },
              { scope: "Patch",       rule: "if content provided, must not be empty" },
              { scope: "Patch",       rule: "if status provided, must be active|archived|deleted|pending" },
              { scope: "Query",       rule: "minConfidence must be 0–1" },
              { scope: "Query",       rule: "limit must be >= 1" },
              { scope: "Query",       rule: "offset must be >= 0" },
              { scope: "Query",       rule: "createdAfter must be <= createdBefore" },
              { scope: "SearchQuery", rule: "text must not be empty" },
              { scope: "SearchQuery", rule: "limit must be >= 1 if provided" },
            ].map(r => (
              <div key={r.rule} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                <Badge label={r.scope} color="text-amber-400" />
                <span className="text-zinc-300 text-xs">{r.rule}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── TESTS ──────────────────────────────────────────────────────────── */}
        {tab === "Tests" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            {testResult ? (
              <>
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  CONTRACT TESTS — {testResult.passed}/{testResult.total} PASSED — SUITES: Validation · Errors · Capabilities · Events · Contract · SOLID · Immutability · Determinism · VersionCompat
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {testResult.results.map(r => (
                    <div key={r.id} className={"flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0 " + (!r.passed ? "bg-red-950/10" : "")}>
                      <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (r.passed ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="text-zinc-500 text-xs w-32 shrink-0">{r.suite}</span>
                      <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                      {!r.passed && <span className="text-red-400 text-xs truncate max-w-xs">{r.error}</span>}
                      <span className={"text-xs font-bold " + (r.passed ? "text-emerald-400" : "text-red-400")}>{r.passed ? "PASS" : "FAIL"}</span>
                      <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-zinc-600 text-sm">Click "Run Contract Tests" to execute all suites.</div>
            )}
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EF-38.0 UKS CONTRACT</div>
          {[
            "KIP depends only on IKnowledgeStore — never on concrete classes",
            "No storage implementation exists — only contracts",
            "7 storage engines declared in capabilities (no code required to add a new one)",
            "All results are frozen (immutable)",
            "All writes emit KnowledgeStoreEvent (auditable)",
            "All errors are returned in result.error — never thrown",
            "SOLID principles verified by contract tests: SRP, OCP, LSP, ISP, DIP",
            "Zero regressions",
          ].map((c, i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}