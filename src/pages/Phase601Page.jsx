import React, { useState } from "react";
import {
  Loader2, CheckCircle, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Database, ShieldCheck,
  Activity, Network, BarChart2, RefreshCw
} from "lucide-react";
import { RepositoryKnowledgeBuilder } from "@/lib/project-knowledge/RepositoryKnowledgeBuilder";
import { KnowledgeGraphStore } from "@/lib/project-knowledge/KnowledgeGraphStore";
import { EF601ValidationSuite } from "@/lib/project-knowledge/ef601Tests";
import { ConnectorInvocationService } from "@/lib/cognitive-connector/ConnectorInvocationService";

const cis     = new ConnectorInvocationService();
const builder = new RepositoryKnowledgeBuilder();
const suite   = new EF601ValidationSuite();

const TABS = [
  { id: "activate",    label: "Activate",            icon: Database },
  { id: "diagnostics", label: "Runtime Diagnostics", icon: Activity },
  { id: "queries",     label: "Knowledge Queries",   icon: Network },
  { id: "validation",  label: "EF-60.1 Validation",  icon: ShieldCheck },
];

const STATUS_STYLES = {
  PASS:           "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:           "bg-red-900/40 text-red-300 border-red-700",
  NOT_CONFIGURED: "bg-amber-900/40 text-amber-300 border-amber-700",
};

const LAYER_COLORS = {
  presentation:    "bg-blue-900/40 text-blue-300",
  orchestration:   "bg-violet-900/40 text-violet-300",
  connector:       "bg-emerald-900/40 text-emerald-300",
  engine:          "bg-orange-900/40 text-orange-300",
  utility:         "bg-zinc-700 text-zinc-300",
  type_definition: "bg-pink-900/40 text-pink-300",
  test:            "bg-amber-900/40 text-amber-300",
  config:          "bg-zinc-800 text-zinc-400",
  unknown:         "bg-zinc-800 text-zinc-500",
};

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-xl font-bold font-mono ${color || "text-zinc-200"}`}>{value}</p>
    </div>
  );
}

function TestRow({ result }) {
  const [open, setOpen] = useState(false);
  const Icon = result.status === "PASS" ? CheckCircle : result.status === "FAIL" ? XCircle : AlertTriangle;
  const col  = result.status === "PASS" ? "text-emerald-400" : result.status === "FAIL" ? "text-red-400" : "text-amber-400";
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800/60 transition text-left">
        <Icon className={`w-4 h-4 ${col} shrink-0`} />
        <span className="flex-1 text-sm text-zinc-200">{result.name}</span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${STATUS_STYLES[result.status]}`}>{result.status}</span>
        <span className="text-xs text-zinc-600 ml-2 shrink-0">{result.durationMs}ms</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-zinc-950 text-xs space-y-1">
          <p className="text-zinc-500">Category: <span className="text-zinc-400">{result.category}</span></p>
          {result.evidence.map((e, i) => <p key={i} className="text-zinc-400">• {e}</p>)}
          {result.error && <p className="text-red-400 font-mono mt-1 break-all">{result.error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Activate Tab ──────────────────────────────────────────────────────────────

function ActivateTab({ graph, setGraph }) {
  const [loading, setLoading] = useState(false);
  const [maxFiles, setMaxFiles] = useState(80);
  const [status, setStatus] = useState(null);

  const activate = async () => {
    setLoading(true); setStatus("Discovering repositories...");
    const reposInv = await cis.invoke("github", "repos.list", { per_page: 5 },
      { originComponent: "Phase601Page", reason: "Activate knowledge graph" });
    if (reposInv.record.status !== "SUCCESS") {
      setStatus("GitHub not configured. Please add your token in Phase 5.7.0."); setLoading(false); return;
    }
    const items = reposInv.result?.data?.items ?? [];
    if (!items.length) { setStatus("No repositories found."); setLoading(false); return; }
    const { owner, name: repo } = items[0];
    setStatus(`Building knowledge graph for ${repo} (up to ${maxFiles} files)...`);
    const g = await builder.build(owner, repo, "main", { maxFiles, forceRebuild: true });
    KnowledgeGraphStore.set(g);
    setGraph(g);
    setStatus(null); setLoading(false);
  };

  const snap = KnowledgeGraphStore.snapshotFields();

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-zinc-300">EF-60.1.1 — Runtime Activation</p>
        <p className="text-xs text-zinc-500">Builds the ProjectKnowledgeGraph from the live GitHub repository and stores it in the KnowledgeGraphStore so the entire pipeline (LCP, CTP, Planner) can query it without rebuilding.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-zinc-400">Max files:</label>
          <input type="number" value={maxFiles} onChange={e => setMaxFiles(Number(e.target.value))} min={10} max={200}
            className="w-20 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-violet-500" />
          <button onClick={activate} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {loading ? "Activating..." : "Activate Knowledge Graph"}
          </button>
          {graph && (
            <button onClick={activate} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          )}
        </div>
        {status && <p className="text-sm text-zinc-400 font-mono">{status}</p>}
      </div>

      {graph ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Entities"      value={graph.entityCount}                              color={graph.entityCount > 0 ? "text-emerald-300" : "text-red-300"} />
            <MetricCard label="Relationships" value={graph.relationshipCount}                         color={graph.relationshipCount > 0 ? "text-emerald-300" : "text-red-300"} />
            <MetricCard label="Modules"       value={graph.modules.length}                            color="text-zinc-200" />
            <MetricCard label="Coverage"      value={`${Math.round(graph.coverage * 100)}%`}          color="text-zinc-200" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Circular Deps" value={graph.circularDeps.length}   color={graph.circularDeps.length > 0 ? "text-red-300" : "text-emerald-300"} />
            <MetricCard label="Dead Code"     value={graph.deadCode.length}        color="text-amber-300" />
            <MetricCard label="Build Time"    value={`${graph.durationMs}ms`}      color="text-zinc-300" />
            <MetricCard label="KG Health"     value={String(snap.kgHealth)}        color={snap.kgHealth === "HEALTHY" ? "text-emerald-300" : snap.kgHealth === "PARTIAL" ? "text-amber-300" : "text-zinc-400"} />
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-3">Architectural Layers</p>
            {Object.entries(graph.layers).filter(([, ids]) => ids.length > 0).map(([layer, ids]) => (
              <div key={layer} className="flex items-center gap-2 py-1.5 border-b border-zinc-800 last:border-0">
                <span className={`text-xs px-2 py-0.5 rounded font-mono w-32 shrink-0 ${LAYER_COLORS[layer] ?? "bg-zinc-800 text-zinc-400"}`}>{layer}</span>
                <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                  <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${Math.min((ids.length / graph.entityCount) * 100, 100)}%` }} />
                </div>
                <span className="text-xs text-zinc-500 w-8 text-right shrink-0">{ids.length}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-600">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Press "Activate Knowledge Graph" to build and register the live graph.</p>
        </div>
      )}
    </div>
  );
}

// ── Diagnostics Tab ───────────────────────────────────────────────────────────

function DiagnosticsTab({ graph }) {
  const diag = KnowledgeGraphStore.diagnostics();
  const snap = KnowledgeGraphStore.snapshotFields();

  if (!graph) return (
    <div className="text-center py-12 text-zinc-600">
      <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">Activate the knowledge graph first.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">EF-60.1.9 — Live runtime diagnostics from the KnowledgeGraphStore.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Ready",           value: String(diag.ready),                color: diag.ready ? "text-emerald-300" : "text-red-300" },
          { label: "Entities",        value: String(diag.entityCount),           color: "text-zinc-200" },
          { label: "Relationships",   value: String(diag.relationshipCount),     color: "text-zinc-200" },
          { label: "Modules",         value: String(diag.moduleCount),           color: "text-zinc-200" },
          { label: "Planner Queries", value: String(diag.plannerQueries),        color: "text-violet-300" },
          { label: "Incr. Updates",   value: String(diag.incrementalUpdates),    color: "text-zinc-300" },
          { label: "Coverage",        value: `${Math.round(Number(diag.coverage) * 100)}%`, color: "text-zinc-200" },
          { label: "Circular Deps",   value: String(diag.circularDeps),          color: Number(diag.circularDeps) > 0 ? "text-red-300" : "text-emerald-300" },
          { label: "Dead Code",       value: String(diag.deadCode),              color: "text-amber-300" },
          { label: "Build Time",      value: `${diag.buildDurationMs}ms`,        color: "text-zinc-300" },
          { label: "Graph Age",       value: `${Math.round(Number(diag.ageMs) / 1000)}s`, color: "text-zinc-400" },
          { label: "Health",          value: String(diag.health),                color: diag.health === "HEALTHY" ? "text-emerald-300" : diag.health === "PARTIAL" ? "text-amber-300" : "text-zinc-500" },
        ].map(m => (
          <MetricCard key={m.label} label={m.label} value={m.value} color={m.color} />
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5">
        <p className="text-xs font-semibold text-zinc-400 mb-2">ProjectSnapshot Fields (EF-60.1.4)</p>
        {Object.entries(snap).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono">{k}</span>
            <span className={`font-mono ${k === "kgHealth" && v === "HEALTHY" ? "text-emerald-300" : k === "kgReady" && v === true ? "text-emerald-300" : "text-zinc-300"}`}>
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Queries Tab ───────────────────────────────────────────────────────────────

function QueriesTab({ graph }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);

  const runQuery = (q) => {
    const target = q ?? query.trim();
    if (!target) return;
    const direct  = KnowledgeGraphStore.query(target);
    const keyword = KnowledgeGraphStore.queryByKeyword(target);
    setResult({ direct, keyword, query: target });
  };

  const ACCEPTANCE = [
    "ConnectionManager", "PlanningEngine", "ConnectorRuntime",
    "MemoryEngine", "CognitivePipeline", "GitHubConnector",
  ];

  if (!graph) return (
    <div className="text-center py-12 text-zinc-600">
      <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">Activate the knowledge graph first.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">EF-60.1.8 — Query the Project Knowledge Graph directly. GitHub becomes fallback only.</p>
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && runQuery(null)}
          placeholder="e.g. ConnectionManager, PlanningEngine, ConnectorRuntime..."
          className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500" />
        <button onClick={() => runQuery(null)} disabled={!query.trim()}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          Query
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ACCEPTANCE.map(q => (
          <button key={q} onClick={() => { setQuery(q); runQuery(q); }}
            className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition font-mono">
            {q}
          </button>
        ))}
      </div>
      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-200">"{result.query}"</span>
            {result.direct.found
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700">Direct Hit</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">Keyword Search</span>}
            <span className="text-xs text-zinc-600 ml-auto">Source: knowledge_graph</span>
          </div>
          {result.direct.found && result.direct.entity && (
            <div className="space-y-1.5 text-xs">
              <p className="text-zinc-400"><span className="text-zinc-500">Layer: </span>{result.direct.entity.layer}</p>
              <p className="text-zinc-400"><span className="text-zinc-500">File: </span><span className="font-mono">{result.direct.entity.filePath}</span></p>
              <p className="text-zinc-400"><span className="text-zinc-500">Type: </span>{result.direct.entity.type}</p>
              <p className="text-zinc-400"><span className="text-zinc-500">Dependencies: </span>{result.direct.dependencies.length}</p>
              <p className="text-zinc-400"><span className="text-zinc-500">Dependents: </span>{result.direct.dependents.length}</p>
              {result.direct.entity.responsibilities.length > 0 && (
                <div>
                  <p className="text-zinc-500 mb-0.5">Responsibilities:</p>
                  {result.direct.entity.responsibilities.map((r, i) => <p key={i} className="text-zinc-400">• {r}</p>)}
                </div>
              )}
            </div>
          )}
          {!result.direct.found && result.keyword.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">{result.keyword.length} keyword matches:</p>
              {result.keyword.slice(0, 8).map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-mono ${LAYER_COLORS[e.layer] ?? "bg-zinc-800"}`}>{e.layer.slice(0, 4)}</span>
                  <span className="text-zinc-200">{e.name}</span>
                  <span className="text-zinc-600 truncate font-mono ml-auto">{e.filePath.split("/").pop()}</span>
                </div>
              ))}
            </div>
          )}
          {!result.direct.found && result.keyword.length === 0 && (
            <p className="text-xs text-zinc-500">No matches in the knowledge graph. This query would fall back to GitHub search.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Validation Tab ────────────────────────────────────────────────────────────

function ValidationTab() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = async () => { setLoading(true); setReport(null); setReport(await suite.run()); setLoading(false); };
  const categories = report ? [...new Set(report.results.map(r => r.category))] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">EF-60.1.10 / 60.1.11 — Production validation against live repository. No mocks.</p>
        <button onClick={run} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? "Running..." : "Run EF-60.1 Suite"}
        </button>
      </div>
      {report && (
        <>
          <div className={`rounded-xl border p-4 ${report.certified ? "bg-emerald-900/20 border-emerald-700" : "bg-red-900/20 border-red-800"}`}>
            <div className="flex items-center gap-2 mb-1">
              {report.certified ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
              <span className={`font-bold ${report.certified ? "text-emerald-300" : "text-red-300"}`}>
                {report.certified ? "EF-60.1 CERTIFIED" : "NOT CERTIFIED"}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mb-3">{report.summary}</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total",  value: report.totalTests,    color: "text-zinc-200" },
                { label: "Passed", value: report.passed,        color: "text-emerald-300" },
                { label: "Failed", value: report.failed,        color: "text-red-300" },
                { label: "N/C",    value: report.notConfigured, color: "text-amber-300" },
              ].map(m => (
                <div key={m.label} className="bg-zinc-900/60 rounded-lg p-2 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-500">{m.label}</p>
                  <p className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>
          {categories.map(cat => (
            <div key={cat} className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{cat}</h3>
              {report.results.filter(r => r.category === cat).map(r => <TestRow key={r.id} result={r} />)}
            </div>
          ))}
        </>
      )}
      {!report && !loading && (
        <div className="text-center py-12 text-zinc-600">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Press "Run EF-60.1 Suite" to validate Phase 6.0.1.</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Phase601Page() {
  const [tab, setTab]     = useState("activate");
  const [graph, setGraph] = useState(() => KnowledgeGraphStore.get());

  const content = {
    activate:    <ActivateTab graph={graph} setGraph={setGraph} />,
    diagnostics: <DiagnosticsTab graph={graph} />,
    queries:     <QueriesTab graph={graph} />,
    validation:  <ValidationTab />,
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 font-heading">Phase 6.0.1 — Knowledge Graph Activation</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">Runtime Integration · Graph Population · Planner Priority · Snapshot Upgrade · Acceptance Queries</p>
      </div>

      {graph && (
        <div className="bg-zinc-900 border border-emerald-800/40 rounded-xl px-4 py-3 flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
          <span className="text-emerald-400 font-medium">● Knowledge Graph Active</span>
          <span>Repo: <span className="text-zinc-200">{graph.owner}/{graph.repo}</span></span>
          <span>Entities: <span className="text-emerald-300 font-mono">{graph.entityCount}</span></span>
          <span>Relationships: <span className="text-emerald-300 font-mono">{graph.relationshipCount}</span></span>
          <span>Modules: <span className="text-zinc-200">{graph.modules.length}</span></span>
          <span className="ml-auto font-mono">{new Date(graph.builtAt).toLocaleTimeString()}</span>
        </div>
      )}

      <div className="flex gap-1 flex-wrap border-b border-zinc-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${tab === t.id ? "text-violet-300 border-violet-500 bg-violet-900/10" : "text-zinc-500 border-transparent hover:text-zinc-300"}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div>{content[tab]}</div>
    </div>
  );
}