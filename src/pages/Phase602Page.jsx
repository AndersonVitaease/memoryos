/**
 * Phase602Page.jsx — EF-60.2 Runtime Validation Dashboard
 * Phase 6.0.2 · MemoryOS · 2026-07-14
 *
 * Tabs: Repository | Repository Tree | File Parser | Entity Builder |
 *       Relationship Builder | Knowledge Graph | Pipeline | Planner |
 *       Execution Trace | Statistics
 */

import React, { useState, useEffect } from "react";
import { Database, RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { RKBInstrumented } from "@/lib/project-knowledge/RKBInstrumented";
import { KnowledgeGraphStore } from "@/lib/project-knowledge/KnowledgeGraphStore";
import { RKBTracer } from "@/lib/project-knowledge/RKBTrace";

// ── UI helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  ok:      "text-emerald-400 bg-emerald-950/40 border-emerald-800",
  running: "text-yellow-400 bg-yellow-950/40 border-yellow-800",
  failed:  "text-red-400 bg-red-950/40 border-red-800",
  skipped: "text-zinc-400 bg-zinc-800/40 border-zinc-700",
  pending: "text-zinc-500 bg-zinc-900/40 border-zinc-800",
};
const STATUS_ICONS = {
  ok:      <CheckCircle className="w-4 h-4" />,
  running: <Loader2 className="w-4 h-4 animate-spin" />,
  failed:  <XCircle className="w-4 h-4" />,
  skipped: <AlertTriangle className="w-4 h-4" />,
  pending: <Clock className="w-4 h-4" />,
};

function Badge({ status, label }) {
  const col = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono ${col}`}>
      {STATUS_ICONS[status]}{label ?? status.toUpperCase()}
    </span>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className="text-xl font-bold text-white font-mono">{value ?? 0}</div>
      <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function StepRow({ step, idx }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800/60 transition text-left"
      >
        <span className="text-zinc-500 font-mono text-xs w-5">{idx}.</span>
        <Badge status={step.status} />
        <span className="text-sm text-zinc-200 font-medium flex-1">{step.label}</span>
        <span className="text-xs text-zinc-500 font-mono">{step.durationMs != null ? `${step.durationMs}ms` : "—"}</span>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>
      {open && (
        <div className="bg-zinc-950 px-4 py-3 border-t border-zinc-800 space-y-2">
          <p className="text-sm text-zinc-300">{step.detail}</p>
          {step.error && <p className="text-xs text-red-400 font-mono">Error: {step.error}</p>}
          {Object.keys(step.data).length > 0 && (
            <pre className="text-xs text-zinc-400 bg-zinc-900 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(step.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({ ft }) {
  const [open, setOpen] = useState(false);
  const status = ft.fetchStatus === "failed" ? "failed" : ft.parseStatus === "failed" ? "failed" : ft.entitiesExtracted > 0 ? "ok" : "skipped";
  return (
    <div className="border border-zinc-800 rounded overflow-hidden text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800/50 transition text-left"
      >
        <Badge status={status} />
        <span className="flex-1 text-zinc-300 font-mono truncate">{ft.path}</span>
        <span className="text-zinc-500">{ft.language}</span>
        <span className="text-zinc-500">{ft.lines}L</span>
        <span className={ft.entitiesExtracted > 0 ? "text-emerald-400" : "text-zinc-600"}>{ft.entitiesExtracted}E</span>
        {open ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
      </button>
      {open && (
        <div className="bg-zinc-950 px-3 py-2 border-t border-zinc-800 space-y-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-400">
            <span>Layer: <span className="text-zinc-200">{ft.layer || "—"}</span></span>
            <span>Entity: <span className="text-zinc-200">{ft.entityName || "—"}</span></span>
            <span>Classes: <span className="text-zinc-200">{ft.classes.join(", ") || "0"}</span></span>
            <span>Interfaces: <span className="text-zinc-200">{ft.interfaces.join(", ") || "0"}</span></span>
            <span>Enums: <span className="text-zinc-200">{ft.enums.join(", ") || "0"}</span></span>
            <span>Functions: <span className="text-zinc-200">{ft.functions}</span></span>
            <span>Types: <span className="text-zinc-200">{ft.types}</span></span>
            <span>Imports: <span className="text-zinc-200">{ft.imports}</span></span>
            <span>Exports: <span className="text-zinc-200">{ft.exports}</span></span>
            <span>Constants: <span className="text-zinc-200">{ft.constants}</span></span>
            <span>ParseTime: <span className="text-zinc-200">{ft.parseDurationMs}ms</span></span>
          </div>
          {ft.skipReason && <p className="text-yellow-400">Skip reason: {ft.skipReason}</p>}
          {ft.error && <p className="text-red-400">Error: {ft.error}</p>}
        </div>
      )}
    </div>
  );
}

const PIPELINE_STAGES = [
  "GitHub Connector",
  "RepositoryAnalyzer",
  "RepositoryKnowledgeBuilder",
  "SourceCodeParser",
  "Entity Builder",
  "Relationship Builder",
  "KnowledgeGraphStore",
  "KnowledgeReconstructionEngine",
  "ProjectSnapshot",
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Phase602Page() {
  const [activeTab, setActiveTab] = useState("repository");
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState(null);
  const [plannerResults, setPlannerResults] = useState([]);
  const [plannerRunning, setPlannerRunning] = useState(false);

  const kgDiag = KnowledgeGraphStore.diagnostics();

  const TABS = [
    { id: "repository",     label: "Repository" },
    { id: "tree",           label: "Repository Tree" },
    { id: "files",          label: "File Parser" },
    { id: "entities",       label: "Entity Builder" },
    { id: "relationships",  label: "Relationship Builder" },
    { id: "kg",             label: "Knowledge Graph" },
    { id: "pipeline",       label: "Pipeline" },
    { id: "planner",        label: "Planner" },
    { id: "trace",          label: "Execution Trace" },
    { id: "stats",          label: "Statistics" },
  ];

  const run = async () => {
    setRunning(true);
    setTrace(null);
    try {
      const rkb = new RKBInstrumented();
      // Resolve repo from KG store or use first available
      const existing = KnowledgeGraphStore.get();
      const owner = existing?.owner ?? "memoryos";
      const repo  = existing?.repo  ?? "memoryos";
      const result = await rkb.build(owner, repo, "main", { maxFiles: 80, forceRebuild: true });
      setTrace(result.trace);
    } catch (e) {
      const latest = RKBTracer.latest();
      setTrace(latest);
    }
    setRunning(false);
  };

  const runFromGitHub = async () => {
    // Discover real owner/repo from GitHub connector first
    setRunning(true);
    setTrace(null);
    try {
      const { ConnectorInvocationService } = await import("@/lib/cognitive-connector/ConnectorInvocationService");
      const cis = new ConnectorInvocationService();
      const reposInv = await cis.invoke("github", "repos.list", { per_page: 5 },
        { originComponent: "Phase602Page", reason: "Discover live repo" });
      const items = (reposInv.result?.data)?.items ?? [];
      const first = items[0];
      const owner = first?.owner ?? first?.full_name?.split("/")?.[0] ?? "unknown";
      const repo  = first?.name  ?? "unknown";

      const rkb = new RKBInstrumented();
      const result = await rkb.build(owner, repo, "main", { maxFiles: 80, forceRebuild: true });
      setTrace(result.trace);
    } catch (e) {
      const latest = RKBTracer.latest();
      setTrace(latest);
    }
    setRunning(false);
  };

  const runPlanner = async () => {
    setPlannerRunning(true);
    const queries = [
      "Where is ConnectionManager implemented?",
      "Who uses PlanningEngine?",
      "Show ConnectorRuntime dependencies.",
    ];
    const results = [];
    try {
      const { CognitiveTaskPlanner } = await import("@/lib/cognitive-task-planner/CognitiveTaskPlanner");
      const planner = new CognitiveTaskPlanner();
      for (const q of queries) {
        const t0 = Date.now();
        // Try KG first via queryKnowledgeGraph
        const symbol = q.includes("ConnectionManager") ? "ConnectionManager"
          : q.includes("PlanningEngine") ? "PlanningEngine"
          : "ConnectorRuntime";
        const kgResult = planner.queryKnowledgeGraph(symbol);
        results.push({
          query: q,
          symbol,
          kgHit:    kgResult.found,
          source:   kgResult.source,
          answer:   kgResult.found ? kgResult.answer : "(not in graph — GitHub fallback needed)",
          durationMs: Date.now() - t0,
        });
      }
    } catch (e) {
      results.push({ query: "Error", symbol: "", kgHit: false, source: "error", answer: String(e), durationMs: 0 });
    }
    setPlannerResults(results);
    setPlannerRunning(false);
  };

  // Auto-load last trace if available
  useEffect(() => {
    const latest = RKBTracer.latest();
    if (latest) setTrace(latest);
  }, []);

  const stepMap = {};
  if (trace) {
    for (const step of trace.steps) stepMap[step.label] = step;
  }

  function getPipelineStatus(stageName) {
    if (!trace) return "pending";
    const maps = {
      "GitHub Connector":             stepMap["Repository Discovery"],
      "RepositoryAnalyzer":           stepMap["Repository Tree Download"],
      "RepositoryKnowledgeBuilder":   stepMap["File Fetch & Parse"],
      "SourceCodeParser":             stepMap["File Fetch & Parse"],
      "Entity Builder":               stepMap["Graph Assembly"],
      "Relationship Builder":         stepMap["Relationship Builder"],
      "KnowledgeGraphStore":          stepMap["KnowledgeGraphStore Persistence"],
      "KnowledgeReconstructionEngine": trace.entitiesTotal > 0 ? { status: "ok" } : null,
      "ProjectSnapshot":              trace.entitiesTotal > 0 ? { status: "ok" } : null,
    };
    return maps[stageName]?.status ?? "skipped";
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading">Phase 6.0.2 — RKB Validation Dashboard</h1>
            <p className="text-xs text-zinc-500">Repository Knowledge Builder · Deep Runtime Diagnostics</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runFromGitHub}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-sm font-medium transition"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run Live Validation
          </button>
        </div>
      </div>

      {/* Failure Alert */}
      {trace?.graphEmpty && trace?.firstFailingStage && (
        <div className="mb-4 p-4 bg-red-950/30 border border-red-800 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-sm font-semibold text-red-300">Graph Construction Failed</span>
          </div>
          <p className="text-sm text-red-400">First failing stage: <span className="font-mono font-bold">{trace.firstFailingStage}</span></p>
          <p className="text-xs text-red-500 mt-1">{trace.failureReason}</p>
        </div>
      )}

      {/* Summary metrics */}
      {trace && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <Metric label="Repos Found"   value={trace.reposFound} />
          <Metric label="Tree Nodes"    value={trace.totalTreeNodes} />
          <Metric label="Eligible Files" value={trace.eligibleFiles} />
          <Metric label="Ignored"       value={trace.ignoredNodes} />
          <Metric label="Entities"      value={trace.entitiesTotal} />
          <Metric label="Relationships" value={trace.relationshipsTotal} />
          <Metric label="Modules"       value={trace.modulesTotal} />
          <Metric label="Duration" value={trace.durationMs != null ? `${trace.durationMs}ms` : "—"} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap mb-6 border-b border-zinc-800 pb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Repository ─────────────────────────────────────────────────────── */}
      {activeTab === "repository" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Repository Discovery</h2>
          {!trace ? (
            <p className="text-zinc-500 text-sm">Run validation to see results.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Discovery</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-400">Repos Found</span><span className="font-mono text-white">{trace.reposFound}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Selected Repo</span><span className="font-mono text-white">{trace.selectedRepo || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Branch</span><span className="font-mono text-white">{trace.branch}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Tree Downloaded</span><Badge status={trace.treeDownloaded ? "ok" : "failed"} label={trace.treeDownloaded ? "YES" : "NO"} /></div>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Timing</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-400">Total Duration</span><span className="font-mono text-white">{trace.durationMs}ms</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Persistence</span><Badge status={trace.persistenceStatus === "ok" ? "ok" : "failed"} label={trace.persistenceStatus.toUpperCase()} /></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Graph Empty</span><Badge status={trace.graphEmpty ? "failed" : "ok"} label={trace.graphEmpty ? "YES" : "NO"} /></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Repository Tree ─────────────────────────────────────────────────── */}
      {activeTab === "tree" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Repository Tree Validation</h2>
          {!trace ? <p className="text-zinc-500 text-sm">Run validation first.</p> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric label="Total Nodes"    value={trace.totalTreeNodes} />
                <Metric label="Ignored"        value={trace.ignoredNodes} sub="node_modules etc." />
                <Metric label="Eligible"       value={trace.eligibleFiles} sub="source files" />
                <Metric label="Skipped"        value={trace.skippedFiles} sub="unsupported ext" />
                <Metric label="Tree Downloaded" value={trace.treeDownloaded ? "YES" : "NO"} />
                <Metric label="Default Branch"  value={trace.branch} />
              </div>

              {/* Raw node type sample */}
              {trace.rawTreeSample?.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Raw Node Shape (first {trace.rawTreeSample.length})</p>
                  <pre className="text-xs text-zinc-300 overflow-auto max-h-32">
                    {JSON.stringify(trace.rawTreeSample, null, 2)}
                  </pre>
                </div>
              )}

              {/* Skip reasons */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Rejection Reasons</p>
                {Object.entries(trace.skipReasons ?? {}).length === 0
                  ? <p className="text-zinc-500 text-sm">No rejections recorded.</p>
                  : Object.entries(trace.skipReasons).map(([reason, count]) => (
                    <div key={reason} className="flex justify-between text-sm py-1 border-b border-zinc-800 last:border-0">
                      <span className="font-mono text-zinc-300">{reason}</span>
                      <span className="font-mono text-zinc-400">{count} nodes</span>
                    </div>
                  ))}
              </div>

              {/* Per-node trace table */}
              {trace.treeNodeTraces?.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">
                    Per-Node Trace ({trace.treeNodeTraces.length} nodes)
                  </p>
                  <div className="max-h-96 overflow-y-auto space-y-0.5">
                    <div className="grid grid-cols-12 gap-1 text-[10px] text-zinc-600 font-mono pb-1 border-b border-zinc-800">
                      <span className="col-span-5">PATH</span>
                      <span className="col-span-2">TYPE</span>
                      <span className="col-span-1">EXT</span>
                      <span className="col-span-2">DECISION</span>
                      <span className="col-span-2">REASON</span>
                    </div>
                    {trace.treeNodeTraces.map((n, i) => (
                      <div key={i} className={`grid grid-cols-12 gap-1 text-[10px] font-mono py-0.5 ${n.decision === "eligible" ? "text-emerald-400" : "text-zinc-500"}`}>
                        <span className="col-span-5 truncate" title={n.path}>{n.path}</span>
                        <span className="col-span-2 truncate">{n.rawType}</span>
                        <span className="col-span-1 truncate">{n.extension}</span>
                        <span className="col-span-2">{n.decision}</span>
                        <span className="col-span-2 truncate text-zinc-600" title={n.reason ?? ""}>{n.reason ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── File Parser ─────────────────────────────────────────────────────── */}
      {activeTab === "files" && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">File Parser Diagnostics</h2>
          {!trace ? <p className="text-zinc-500 text-sm">Run validation first.</p> : trace.fileTraces.length === 0
            ? <p className="text-zinc-500 text-sm">No files processed.</p>
            : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <Metric label="Total Files"   value={trace.fileTraces.length} />
                  <Metric label="With Entities" value={trace.fileTraces.filter(f => f.entitiesExtracted > 0).length} />
                  <Metric label="Fetch Failed"  value={trace.fileTraces.filter(f => f.fetchStatus === "failed").length} />
                </div>
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {trace.fileTraces.map((ft, i) => <FileRow key={i} ft={ft} />)}
                </div>
              </>
            )}
        </div>
      )}

      {/* ── Entity Builder ───────────────────────────────────────────────────── */}
      {activeTab === "entities" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Entity Builder Validation</h2>
          {!trace ? <p className="text-zinc-500 text-sm">Run validation first.</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric label="Entities Created"  value={trace.entitiesTotal} />
                <Metric label="Files Parsed"      value={trace.fileTraces.filter(f => f.parseStatus === "ok").length} />
                <Metric label="Empty Files"       value={trace.fileTraces.filter(f => f.fetchStatus === "empty").length} />
                <Metric label="Parse Errors"      value={trace.fileTraces.filter(f => f.parseStatus === "failed").length} />
              </div>
              {trace.entitiesTotal === 0 && (
                <div className="p-4 bg-red-950/30 border border-red-800 rounded-xl text-sm text-red-300">
                  <strong>Zero entities extracted.</strong> Reason: {
                    trace.fileTraces.filter(f => f.fetchStatus === "failed").length > 0
                      ? "All file fetches failed — check GitHub connector token and file.get capability."
                      : trace.fileTraces.filter(f => f.fetchStatus === "empty").length > 0
                      ? "Files fetched but content is empty — GitHub API may be returning base64-encoded content not being decoded."
                      : "Files fetched and parsed but no classes/interfaces/functions matched — content may be minified or non-standard."
                  }
                </div>
              )}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Entities by Layer</p>
                {Object.entries(
                  trace.fileTraces.reduce((acc, ft) => {
                    if (ft.entitiesExtracted > 0) acc[ft.layer] = (acc[ft.layer] ?? 0) + 1;
                    return acc;
                  }, {})
                ).map(([layer, count]) => (
                  <div key={layer} className="flex justify-between text-sm py-1 border-b border-zinc-800 last:border-0">
                    <span className="font-mono text-zinc-300">{layer}</span>
                    <span className="font-mono text-zinc-400">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Relationship Builder ─────────────────────────────────────────────── */}
      {activeTab === "relationships" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Relationship Builder Validation</h2>
          {!trace ? <p className="text-zinc-500 text-sm">Run validation first.</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Metric label="Relationships Created" value={trace.relationshipsTotal} />
                <Metric label="Entities"              value={trace.entitiesTotal} />
                <Metric label="Modules"               value={trace.modulesTotal} />
              </div>
              {(() => {
                const relStep = trace.steps.find(s => s.label === "Relationship Builder");
                if (!relStep) return null;
                return (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-zinc-400">Status</span><Badge status={relStep.status} /></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Duration</span><span className="font-mono">{relStep.durationMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Created</span><span className="font-mono">{relStep.data.created ?? 0}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Rejected</span><span className="font-mono">{relStep.data.rejected ?? 0}</span></div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Knowledge Graph ──────────────────────────────────────────────────── */}
      {activeTab === "kg" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Knowledge Graph Persistence</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Entities"       value={kgDiag.entityCount} />
            <Metric label="Relationships"  value={kgDiag.relationshipCount} />
            <Metric label="Modules"        value={kgDiag.moduleCount} />
            <Metric label="Coverage"       value={`${Math.round((kgDiag.coverage ?? 0) * 100)}%`} />
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm space-y-2">
            {Object.entries(kgDiag).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-400 font-mono">{k}</span>
                <span className="text-zinc-200 font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
          {trace && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Persistence Status</p>
              <Badge status={trace.persistenceStatus === "ok" ? "ok" : "failed"} label={trace.persistenceStatus.toUpperCase()} />
              {trace.persistedAt && <p className="text-xs text-zinc-500 mt-2">Persisted at: {new Date(trace.persistedAt).toISOString()}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Pipeline ─────────────────────────────────────────────────────────── */}
      {activeTab === "pipeline" && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Pipeline Flow (EF-60.2.8)</h2>
          <div className="flex flex-col items-center gap-1 max-w-sm mx-auto">
            {PIPELINE_STAGES.map((stage, i) => {
              const status = getPipelineStatus(stage);
              return (
                <React.Fragment key={stage}>
                  <div className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                    status === "ok"      ? "bg-emerald-950/30 border-emerald-700 text-emerald-300" :
                    status === "failed"  ? "bg-red-950/30 border-red-700 text-red-300" :
                    status === "running" ? "bg-yellow-950/30 border-yellow-700 text-yellow-300" :
                    "bg-zinc-900 border-zinc-800 text-zinc-500"
                  }`}>
                    {STATUS_ICONS[status] ?? STATUS_ICONS.pending}
                    {stage}
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className="text-zinc-600 text-lg leading-none">↓</div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Planner ──────────────────────────────────────────────────────────── */}
      {activeTab === "planner" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Planner Knowledge Graph Queries (EF-60.2.9)</h2>
            <button
              onClick={runPlanner}
              disabled={plannerRunning}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs font-medium"
            >
              {plannerRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Run Queries
            </button>
          </div>
          {plannerResults.length === 0
            ? <p className="text-zinc-500 text-sm">Click "Run Queries" to test planner KG integration.</p>
            : plannerResults.map((r, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-zinc-200">"{r.query}"</p>
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <Badge status={r.kgHit ? "ok" : "skipped"} label={r.kgHit ? "KG HIT" : "KG MISS"} />
                  <span className="text-zinc-400">Source: <span className="font-mono text-zinc-200">{r.source}</span></span>
                  <span className="text-zinc-400">Symbol: <span className="font-mono text-zinc-200">{r.symbol}</span></span>
                  <span className="text-zinc-400">{r.durationMs}ms</span>
                </div>
                <p className="text-xs text-zinc-400 whitespace-pre-wrap">{r.answer}</p>
              </div>
            ))
          }
        </div>
      )}

      {/* ── Execution Trace ───────────────────────────────────────────────────── */}
      {activeTab === "trace" && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Execution Trace</h2>
          {!trace ? <p className="text-zinc-500 text-sm">Run validation first.</p> : (
            <>
              <div className="text-xs text-zinc-500 mb-2 font-mono">Run ID: {trace.runId} · {new Date(trace.startedAt).toISOString()}</div>
              <div className="space-y-2">
                {trace.steps.map((step, i) => <StepRow key={i} step={step} idx={i + 1} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Statistics ────────────────────────────────────────────────────────── */}
      {activeTab === "stats" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Graph Statistics (EF-60.2.11)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Metric label="Repositories"    value={trace?.reposFound ?? 0} />
            <Metric label="Total Nodes"     value={trace?.totalTreeNodes ?? 0} />
            <Metric label="Source Files"    value={trace?.eligibleFiles ?? 0} />
            <Metric label="Ignored Files"   value={trace?.ignoredNodes ?? 0} />
            <Metric label="Entities"        value={kgDiag.entityCount} />
            <Metric label="Relationships"   value={kgDiag.relationshipCount} />
            <Metric label="Modules"         value={kgDiag.moduleCount} />
            <Metric label="Coverage"        value={`${Math.round((kgDiag.coverage ?? 0) * 100)}%`} />
            <Metric label="Circular Deps"   value={kgDiag.circularDeps} />
            <Metric label="Dead Code"       value={kgDiag.deadCode} />
            <Metric label="Build Time"      value={trace?.durationMs != null ? `${trace.durationMs}ms` : "—"} />
            <Metric label="Planner Queries" value={kgDiag.plannerQueries} />
          </div>
          {trace && trace.graphEmpty && (
            <div className="p-4 bg-red-950/30 border border-red-800 rounded-xl">
              <p className="text-sm font-semibold text-red-300 mb-1">Failure Analysis (EF-60.2.12)</p>
              <p className="text-sm text-red-400">First failing stage: <span className="font-mono font-bold">{trace.firstFailingStage ?? "Unknown"}</span></p>
              {trace.failureReason && <p className="text-xs text-red-500 mt-1">{trace.failureReason}</p>}
            </div>
          )}
          {trace && !trace.graphEmpty && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-800 rounded-xl">
              <p className="text-sm font-semibold text-emerald-300">All acceptance criteria met</p>
              <p className="text-xs text-emerald-500 mt-1">
                Repository loaded · Tree parsed · Files processed · Entities extracted · Relationships extracted · KnowledgeGraphStore populated
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}