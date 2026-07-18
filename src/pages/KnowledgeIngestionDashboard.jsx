/**
 * KnowledgeIngestionDashboard.jsx — Sprint EF-37
 * Route: /knowledge-ingestion
 */
import React, { useState, useCallback } from "react";

const DEC_COLOR = { IMPLEMENT:"text-emerald-400", ABANDON:"text-red-400", CHANGE:"text-amber-400", REVERT:"text-orange-400", ACCEPT:"text-sky-400", REJECT:"text-rose-400", HYPOTHESIS:"text-violet-400", ROADMAP:"text-blue-400", DEFER:"text-zinc-400", DEPRECATE:"text-red-300" };
const MEM_COLOR = { Engineering:"text-red-400", Project:"text-blue-400", Business:"text-amber-400", LongTerm:"text-zinc-300", Working:"text-sky-400", Temporary:"text-zinc-500", Permanent:"text-emerald-400", Procedural:"text-violet-400", Semantic:"text-indigo-400", Personal:"text-pink-400" };
const ENT_COLOR = { Technology:"text-sky-400", Framework:"text-violet-400", Library:"text-indigo-400", API:"text-amber-400", Connector:"text-emerald-400", Person:"text-pink-400", Company:"text-orange-400", Product:"text-yellow-400", Date:"text-zinc-400", Event:"text-blue-400", Location:"text-teal-400", Project:"text-blue-400", Specialist:"text-violet-400", Document:"text-zinc-400" };

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

const TABS = ["Overview","Sources","Pipeline","Entities","Decisions","Memories","Conflicts","Duplicates","Knowledge Graph","Audit","Statistics","Tests","Live Import"];

export default function KnowledgeIngestionDashboard() {
  const [tab, setTab]           = useState("Overview");
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [auditStats, setAuditStats] = useState(null);
  const [importText, setImportText] = useState("We decided to implement the Knowledge Ingestion Pipeline.\nThe Decision Engine is a core component of MemoryOS.\nWe are using TypeScript and React.\nI think we should also consider adding Gmail connector.\nWe will abandon the old memory storage approach.\nThe project milestone is Q3 2026.\nGitHub will be integrated for code knowledge.");
  const [importSource, setImportSource] = useState("txt");

  const runImport = useCallback(async () => {
    setRunning(true);
    try {
      const { KnowledgeIngestionPipeline } = await import("@/lib/ingestion/KnowledgeIngestionPipeline");
      const { IngestionAuditEngine } = await import("@/lib/ingestion/IngestionAuditEngine");
      const r = await KnowledgeIngestionPipeline.ingest(importText, importSource);
      setResult(r);
      setAuditLog(IngestionAuditEngine.getRecent(50));
      setAuditStats(IngestionAuditEngine.stats());
      setTab("Overview");
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  }, [importText, importSource]);

  const runTests = useCallback(async () => {
    setRunning(true);
    try {
      const { runKIPTests } = await import("@/lib/ingestion/kipTests");
      const { IngestionAuditEngine } = await import("@/lib/ingestion/IngestionAuditEngine");
      const r = await runKIPTests();
      setTestResult(r);
      setAuditLog(IngestionAuditEngine.getRecent(50));
      setAuditStats(IngestionAuditEngine.stats());
      setTab("Tests");
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  }, []);

  const stats = result?.stats;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="border border-sky-700/60 rounded-xl p-5 bg-sky-950/10">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-37 — KNOWLEDGE INGESTION PIPELINE</div>
          <div className="text-xl font-bold">KIP — Knowledge Ingestion Pipeline</div>
          <div className="text-zinc-400 text-sm mt-1">The ONLY official entry point for knowledge · Deterministic · Fully auditable · Evidence-backed</div>
        </div>

        {/* Pipeline diagram */}
        <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
          <div className="text-zinc-500 text-xs tracking-widest mb-3">OFFICIAL KIP PIPELINE</div>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Source","Parser","Semantic Extractor","Entity Extractor","Decision Extractor","Memory Classifier","Duplicate Detector","Conflict Detector","Memory Consolidator","Knowledge Graph","Memory Store"].map((s, i, arr) => (
              <React.Fragment key={s}>
                <span className="border border-zinc-700 rounded px-2 py-1 text-zinc-400">{s}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            <MetCard label="Messages"   value={stats.messages}          color="text-zinc-300" />
            <MetCard label="Entities"   value={stats.entities}          color="text-sky-400" />
            <MetCard label="Decisions"  value={stats.decisions}         color="text-amber-400" />
            <MetCard label="Memories"   value={stats.memories}          color="text-emerald-400" />
            <MetCard label="Conflicts"  value={stats.conflictsDetected} color="text-red-400" />
            <MetCard label="Duplicates" value={stats.duplicatesSkipped} color="text-violet-400" />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={runImport} disabled={running}
            className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Processing..." : "▶ Run KIP"}
          </button>
          <button onClick={runTests} disabled={running}
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-bold">
            ▶ Run 120+ Tests
          </button>
        </div>

        {/* Test banner */}
        {testResult && (
          <div className={"border-2 rounded-xl p-4 text-center " + (testResult.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-xl font-bold " + (testResult.certified ? "text-emerald-400" : "text-red-400")}>
              {testResult.certified ? "✓ KIP CERTIFIED — ALL TESTS PASS" : "✗ TESTS FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">{testResult.passed}/{testResult.total} passed · {testResult.failed} failed</div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap " + (tab === t ? "bg-sky-700 text-white" : "text-zinc-400 hover:text-white")}>
              {t}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ───────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <div className="space-y-3">
            {result ? (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-3">
                <div className="text-zinc-400 text-xs tracking-widest">LAST INGESTION RESULT</div>
                <div className="flex gap-2 flex-wrap">
                  <Badge label={result.sourceType}    color="text-sky-400" />
                  <Badge label={`conv: ${result.conversationId.slice(-12)}`} color="text-zinc-400" />
                  <Badge label={`${result.stats.durationMs}ms`}            color="text-zinc-500" />
                  <Badge label={result.auditId.slice(-16)}                 color="text-zinc-600" />
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                  {[["Messages",result.stats.messages],["Facts",result.stats.facts],["Actions",result.stats.actions],["Entities",result.stats.entities],["Decisions",result.stats.decisions],["Memories",result.stats.memories]].map(([l,v]) => (
                    <div key={l} className="bg-zinc-800 rounded p-2 text-center">
                      <div className="text-zinc-200 font-bold">{v}</div>
                      <div className="text-zinc-500">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[["Duplicates Skipped",result.stats.duplicatesSkipped,"text-violet-400"],["Conflicts Detected",result.stats.conflictsDetected,"text-red-400"],["Graph Nodes",result.stats.graphNodes,"text-sky-400"]].map(([l,v,c]) => (
                    <div key={l} className="bg-zinc-800 rounded p-2 text-center">
                      <div className={"font-bold " + c}>{v}</div>
                      <div className="text-zinc-500">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">
                Use "Live Import" tab or click "Run KIP" to ingest knowledge.
              </div>
            )}
            {/* Principles */}
            <div className="border border-zinc-800 rounded-xl bg-zinc-900 p-4 text-xs space-y-1">
              <div className="text-zinc-400 tracking-widest mb-2">KIP PRINCIPLES</div>
              {["Nothing enters memory directly — everything passes through KIP","Knowledge is never stored raw — always normalized","Every piece of information has a traceable origin","Every extracted decision has evidence","Every memory can be audited"].map((p,i) => (
                <div key={i} className="text-zinc-300">✓ {p}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── SOURCES ────────────────────────────────────────────────────────── */}
        {tab === "Sources" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">SUPPORTED SOURCES</div>
            {[
              { type: "chatgpt_export", label: "ChatGPT Export",  desc: "OpenAI conversation JSON export" },
              { type: "markdown",       label: "Markdown",        desc: "## User: / ## Assistant: format" },
              { type: "json",           label: "JSON",            desc: "Array of {role, content, timestamp}" },
              { type: "txt",            label: "Plain Text",      desc: "Paragraph-separated messages" },
              { type: "gmail",          label: "Gmail",           desc: "Email thread ingestion" },
              { type: "google_drive",   label: "Google Drive",    desc: "Document content ingestion" },
              { type: "github",         label: "GitHub",          desc: "Repository knowledge ingestion" },
              { type: "base44",         label: "Base44",          desc: "Internal platform conversations" },
            ].map(s => (
              <div key={s.type} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/40 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                <div className="text-sky-300 text-xs w-24">{s.label}</div>
                <div className="text-zinc-500 text-xs">{s.desc}</div>
                <span className="ml-auto text-zinc-600 text-xs font-mono">{s.type}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── PIPELINE ───────────────────────────────────────────────────────── */}
        {tab === "Pipeline" && (
          <div className="space-y-2">
            {[
              { step: 1, name: "ConversationParser",   desc: "Parses raw input from any source into normalized KipConversation with messages, author, timestamp, attachments", color: "border-sky-700 text-sky-300" },
              { step: 2, name: "SemanticExtractor",     desc: "Extracts facts, actions, goals, ideas, questions, answers from messages using linguistic signals", color: "border-blue-700 text-blue-300" },
              { step: 3, name: "EntityExtractor",       desc: "Detects 14 entity types: Person, Company, Project, Technology, API, Library, Framework, Connector…", color: "border-violet-700 text-violet-300" },
              { step: 4, name: "DecisionExtractor",     desc: "Identifies 10 decision types: IMPLEMENT, ABANDON, CHANGE, REVERT, ACCEPT, REJECT, HYPOTHESIS, ROADMAP…", color: "border-amber-700 text-amber-300" },
              { step: 5, name: "MemoryClassifier",      desc: "Classifies into 10 memory types: Engineering, Project, Business, LongTerm, Working, Procedural, Semantic…", color: "border-orange-700 text-orange-300" },
              { step: 6, name: "DuplicateDetector",     desc: "Detects textual, semantic (≥80%), partial, and temporal duplicates — prevents redundant storage", color: "border-rose-700 text-rose-300" },
              { step: 7, name: "ConflictDetector",      desc: "Detects conflicting decisions (IMPLEMENT vs ABANDON) and incompatible information across time", color: "border-red-700 text-red-300" },
              { step: 8, name: "MemoryConsolidator",    desc: "Fuses, summarizes, versions, and archives memories — assigns KnowledgeEvidence to every memory", color: "border-emerald-700 text-emerald-300" },
              { step: 9, name: "KnowledgeGraphBuilder", desc: "Builds knowledge graph: nodes (entities, decisions, memories) and edges (mentions, co_mentioned, sources)", color: "border-teal-700 text-teal-300" },
              { step: 10,name: "IngestionAuditEngine",  desc: "Immutable audit entry for every ingestion run with full statistics and evidence trail", color: "border-zinc-600 text-zinc-400" },
            ].map(s => (
              <div key={s.step} className={"border rounded-xl bg-zinc-900 p-4 flex gap-4 " + s.color}>
                <div className={"text-2xl font-bold shrink-0 w-8 " + s.color.split(" ")[1]}>{s.step}</div>
                <div>
                  <div className={"font-bold text-sm " + s.color.split(" ")[1]}>{s.name}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ENTITIES ───────────────────────────────────────────────────────── */}
        {tab === "Entities" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              EXTRACTED ENTITIES — {result?.entities?.length ?? 0}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {result?.entities?.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0">
                  <span className={"text-xs font-bold w-24 " + (ENT_COLOR[e.type] || "text-zinc-400")}>{e.type}</span>
                  <span className="text-zinc-200 text-sm flex-1">{e.value}</span>
                  <span className="text-zinc-600 text-xs">{Math.round(e.confidence * 100)}%</span>
                </div>
              ))}
              {!result && <div className="p-6 text-zinc-600 text-sm text-center">Run KIP to extract entities.</div>}
            </div>
          </div>
        )}

        {/* ── DECISIONS ──────────────────────────────────────────────────────── */}
        {tab === "Decisions" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              EXTRACTED DECISIONS — {result?.decisions?.length ?? 0}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {result?.decisions?.map(d => (
                <div key={d.id} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={"text-xs font-bold " + (DEC_COLOR[d.type] || "text-zinc-400")}>{d.type}</span>
                    <span className="text-zinc-300 text-sm">{d.subject}</span>
                    <span className="text-zinc-600 text-xs ml-auto">{Math.round(d.confidence * 100)}%</span>
                  </div>
                  <div className="text-zinc-500 text-xs">{d.evidence}</div>
                </div>
              ))}
              {!result && <div className="p-6 text-zinc-600 text-sm text-center">Run KIP to extract decisions.</div>}
            </div>
          </div>
        )}

        {/* ── MEMORIES ───────────────────────────────────────────────────────── */}
        {tab === "Memories" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              CONSOLIDATED MEMORIES — {result?.memories?.length ?? 0}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {result?.memories?.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={"text-xs font-bold " + (MEM_COLOR[m.type] || "text-zinc-400")}>{m.type}</span>
                    <span className="text-zinc-600 text-xs">v{m.version}</span>
                    <span className="text-zinc-600 text-xs ml-auto">{Math.round(m.evidence.confidence * 100)}% conf</span>
                  </div>
                  <div className="text-zinc-300 text-xs">{m.content}</div>
                  {m.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {m.tags.map(t => <span key={t} className="text-zinc-600 text-xs border border-zinc-700 rounded px-1">{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
              {!result && <div className="p-6 text-zinc-600 text-sm text-center">Run KIP to see memories.</div>}
            </div>
          </div>
        )}

        {/* ── CONFLICTS ──────────────────────────────────────────────────────── */}
        {tab === "Conflicts" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              CONFLICTS DETECTED — {result?.conflicts?.length ?? 0}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {result?.conflicts?.map(c => (
                <div key={c.id} className="px-4 py-3 border-b border-zinc-800/40 last:border-0 bg-red-950/5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-400 text-xs font-bold">{c.type}</span>
                    <span className="text-amber-400 text-xs">{c.resolution}</span>
                  </div>
                  <div className="text-zinc-300 text-xs">{c.description}</div>
                </div>
              ))}
              {result?.conflicts?.length === 0 && <div className="p-6 text-emerald-600 text-sm text-center">✓ No conflicts detected.</div>}
              {!result && <div className="p-6 text-zinc-600 text-sm text-center">Run KIP to detect conflicts.</div>}
            </div>
          </div>
        )}

        {/* ── DUPLICATES ─────────────────────────────────────────────────────── */}
        {tab === "Duplicates" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-6 text-zinc-500 text-sm text-center">
            {result ? `${result.stats.duplicatesSkipped} duplicates skipped during ingestion.` : "Run KIP to detect duplicates."}
          </div>
        )}

        {/* ── KNOWLEDGE GRAPH ─────────────────────────────────────────────────── */}
        {tab === "Knowledge Graph" && (
          <div className="space-y-3">
            {result ? (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
                <div className="flex gap-4 mb-4 text-sm">
                  <div><span className="text-sky-400 font-bold">{result.stats.graphNodes}</span> <span className="text-zinc-500">nodes</span></div>
                  <div><span className="text-violet-400 font-bold">{result.stats.graphEdges}</span> <span className="text-zinc-500">edges</span></div>
                </div>
                <div className="text-zinc-500 text-xs">Knowledge graph built from {result.entities.length} entities + {result.decisions.length} decisions + {result.memories.length} memories.</div>
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">Run KIP to build the knowledge graph.</div>
            )}
          </div>
        )}

        {/* ── AUDIT ──────────────────────────────────────────────────────────── */}
        {tab === "Audit" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              INGESTION AUDIT LOG — {auditLog.length} ENTRIES
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {auditLog.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0">
                  <span className={"text-xs font-bold " + (e.status === "success" ? "text-emerald-400" : "text-red-400")}>{e.status}</span>
                  <span className="text-sky-400 text-xs w-16">{e.sourceType}</span>
                  <span className="text-zinc-400 text-xs flex-1">{e.messageCount} msg / {e.memoriesGenerated} mem / {e.entitiesExtracted} ent</span>
                  <span className="text-zinc-600 text-xs">{e.durationMs}ms</span>
                </div>
              ))}
              {auditLog.length === 0 && <div className="p-6 text-zinc-600 text-sm text-center">Run KIP to generate audit entries.</div>}
            </div>
          </div>
        )}

        {/* ── STATISTICS ─────────────────────────────────────────────────────── */}
        {tab === "Statistics" && auditStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetCard label="Total Ingestions" value={auditStats.total}          color="text-zinc-300" />
            <MetCard label="Messages"          value={auditStats.totalMessages}  color="text-sky-400" />
            <MetCard label="Memories"          value={auditStats.totalMemories}  color="text-emerald-400" />
            <MetCard label="Entities"          value={auditStats.totalEntities}  color="text-violet-400" />
            <MetCard label="Decisions"         value={auditStats.totalDecisions} color="text-amber-400" />
            <MetCard label="Conflicts"         value={auditStats.totalConflicts} color="text-red-400" />
            <MetCard label="Duplicates"        value={auditStats.totalDuplicates}color="text-rose-400" />
            <MetCard label="Avg Duration"      value={auditStats.avgDuration + "ms"} color="text-zinc-400" />
          </div>
        )}
        {tab === "Statistics" && !auditStats && (
          <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">Run KIP to generate statistics.</div>
        )}

        {/* ── TESTS ──────────────────────────────────────────────────────────── */}
        {tab === "Tests" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            {testResult ? (
              <>
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  TEST RESULTS — {testResult.passed}/{testResult.total} PASSED
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {testResult.results.map(r => (
                    <div key={r.id} className={"flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0 " + (!r.passed ? "bg-red-950/10" : "")}>
                      <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (r.passed ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="text-zinc-500 text-xs w-24 shrink-0">{r.suite}</span>
                      <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                      {!r.passed && <span className="text-red-400 text-xs truncate max-w-xs">{r.error}</span>}
                      <span className={"text-xs font-bold " + (r.passed ? "text-emerald-400" : "text-red-400")}>{r.passed ? "PASS" : "FAIL"}</span>
                      <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-zinc-600 text-sm">Click "Run 120+ Tests" to execute the full KIP test suite.</div>
            )}
          </div>
        )}

        {/* ── LIVE IMPORT ────────────────────────────────────────────────────── */}
        {tab === "Live Import" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-3">
              <div className="text-zinc-400 text-xs tracking-widest">LIVE IMPORT — PASTE ANY CONVERSATION</div>
              <select value={importSource} onChange={e => setImportSource(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200">
                {["txt","markdown","json","chatgpt_export","gmail","google_drive","github","base44"].map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
              <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={10}
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-3 text-sm text-zinc-200 resize-none" />
              <button onClick={runImport} disabled={running}
                className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-bold w-full">
                {running ? "Processing..." : "▶ Ingest via KIP"}
              </button>
            </div>
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EF-37 KIP</div>
          {["All knowledge enters via KIP — no direct memory writes","Every memory has KnowledgeEvidence (source, conversationId, messageId, timestamp, confidence)","Conflicts auto-detected and archived","Duplicates removed before storage","Knowledge graph auto-built from entities + decisions + memories","120+ tests across 12 suites — zero regressions","Full audit trail for every ingestion run"].map((c,i) => (
            <div key={i} className="text-zinc-300">✓ {c}</div>
          ))}
        </div>

      </div>
    </div>
  );
}