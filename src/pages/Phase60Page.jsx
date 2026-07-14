import React, { useState, useMemo } from "react";
import {
  Loader2, CheckCircle, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Database, GitBranch,
  Layers, Search, ShieldCheck, Network, RefreshCw
} from "lucide-react";
import { RepositoryKnowledgeBuilder } from "@/lib/project-knowledge/RepositoryKnowledgeBuilder";
import { EF60ValidationSuite } from "@/lib/project-knowledge/ef60Tests";
import { ConnectorInvocationService } from "@/lib/cognitive-connector/ConnectorInvocationService";

const cis   = new ConnectorInvocationService();
const suite = new EF60ValidationSuite();

const TABS = [
  { id: "build",      label: "Build Graph",      icon: Database },
  { id: "explorer",   label: "Entity Explorer",  icon: Search },
  { id: "modules",    label: "Module Graph",      icon: Network },
  { id: "validation", label: "Validation Suite",  icon: ShieldCheck },
];

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

const STATUS_STYLES = {
  PASS:           "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:           "bg-red-900/40 text-red-300 border-red-700",
  NOT_CONFIGURED: "bg-amber-900/40 text-amber-300 border-amber-700",
};

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
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
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

// ── Build Tab ─────────────────────────────────────────────────────────────────

function BuildTab({ graph, setGraph }) {
  const [loading, setLoading]   = useState(false);
  const [maxFiles, setMaxFiles] = useState(60);
  const [status, setStatus]     = useState(null);

  const build = async () => {
    setLoading(true); setStatus("Discovering repositories...");
    const reposInv = await cis.invoke("github", "repos.list", { per_page: 5 },
      { originComponent: "Phase60Page", reason: "Build graph" });
    if (reposInv.record.status !== "SUCCESS") {
      setStatus("GitHub not configured. Please add your token in Phase 5.7.0."); setLoading(false); return;
    }
    const items = reposInv.result?.data?.items ?? [];
    if (items.length === 0) { setStatus("No repositories found."); setLoading(false); return; }
    const { owner, name: repo } = items[0];
    setStatus(`Parsing ${repo} (up to ${maxFiles} files)...`);
    const builder = new RepositoryKnowledgeBuilder();
    const g = await builder.build(owner, repo, "main", { maxFiles, forceRebuild: true });
    setGraph(g);
    setStatus(null); setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Parse a live GitHub repository into a Project Knowledge Graph.</p>
      <div className="flex items-center gap-3">
        <label className="text-sm text-zinc-400">Max files:</label>
        <input type="number" value={maxFiles} onChange={e => setMaxFiles(Number(e.target.value))} min={10} max={200} className="w-20 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-violet-500" />
        <button onClick={build} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {loading ? "Building..." : "Build Knowledge Graph"}
        </button>
      </div>
      {status && <p className="text-sm text-zinc-400 font-mono">{status}</p>}
      {graph && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Entities",       value: graph.entityCount },
              { label: "Relationships",  value: graph.relationshipCount },
              { label: "Modules",        value: graph.modules.length },
              { label: "Coverage",       value: `${Math.round(graph.coverage * 100)}%` },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-500">{m.label}</p>
                <p className="text-xl font-bold font-mono text-zinc-200">{m.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Circular Deps",     value: graph.circularDeps.length,  color: graph.circularDeps.length > 0 ? "text-red-300" : "text-emerald-300" },
              { label: "Dead Code Cands.",  value: graph.deadCode.length,      color: "text-amber-300" },
              { label: "Build Time",        value: `${graph.durationMs}ms`,    color: "text-zinc-300" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-500">{m.label}</p>
                <p className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-2">Architectural Layers</p>
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
          {graph.deadCode.length > 0 && (
            <div className="bg-zinc-900 border border-amber-800/40 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2">Dead Code Candidates ({graph.deadCode.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {graph.deadCode.slice(0, 20).map(name => (
                  <span key={name} className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!graph && !loading && (
        <div className="text-center py-12 text-zinc-600">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Press "Build Knowledge Graph" to parse your live repository.</p>
        </div>
      )}
    </div>
  );
}

// ── Explorer Tab ──────────────────────────────────────────────────────────────

function ExplorerTab({ graph }) {
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [layerFilter, setLayerFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!graph) return [];
    return graph.entities.filter(e =>
      (layerFilter === "all" || e.layer === layerFilter) &&
      (search === "" || e.name.toLowerCase().includes(search.toLowerCase()) || e.filePath.toLowerCase().includes(search.toLowerCase()))
    ).slice(0, 100);
  }, [graph, search, layerFilter]);

  const layers = graph ? [...new Set(graph.entities.map(e => e.layer))] : [];

  if (!graph) return (
    <div className="text-center py-12 text-zinc-600">
      <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">Build the knowledge graph first.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entities..." className="flex-1 min-w-40 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500" />
        <select value={layerFilter} onChange={e => setLayerFilter(e.target.value)} className="bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none">
          <option value="all">All layers</option>
          {layers.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filtered.map(e => (
            <button key={e.id} onClick={() => setSelected(e)} className={`w-full text-left px-3 py-2 rounded-lg transition ${selected?.id === e.id ? "bg-violet-900/30 border border-violet-700" : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800/60"}`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${LAYER_COLORS[e.layer] ?? "bg-zinc-800"}`}>{e.layer.slice(0, 4)}</span>
                <span className="text-sm text-zinc-200 truncate">{e.name}</span>
                <span className="text-xs text-zinc-600 shrink-0 ml-auto">{e.type}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-zinc-600 text-center py-4">No entities match.</p>}
        </div>
        {selected && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2 text-sm overflow-y-auto max-h-96">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${LAYER_COLORS[selected.layer] ?? "bg-zinc-800"}`}>{selected.layer}</span>
              <span className="font-bold text-zinc-100">{selected.name}</span>
              <span className="text-xs text-zinc-500 ml-auto">{selected.type}</span>
            </div>
            <p className="text-xs text-zinc-500 font-mono truncate">{selected.filePath}</p>
            <p className="text-xs text-zinc-400">{selected.description}</p>
            {selected.responsibilities.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 mb-1">Responsibilities</p>
                {selected.responsibilities.map((r, i) => <p key={i} className="text-xs text-zinc-400">• {r}</p>)}
              </div>
            )}
            {selected.exports.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 mb-1">Exports ({selected.exports.length})</p>
                <div className="flex flex-wrap gap-1">{selected.exports.slice(0, 8).map(ex => <span key={ex} className="text-xs font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{ex}</span>)}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <p className="text-xs text-zinc-500">Dependencies</p>
                <p className="text-lg font-bold font-mono text-zinc-200">{selected.dependencies.length}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <p className="text-xs text-zinc-500">Dependents</p>
                <p className="text-lg font-bold font-mono text-zinc-200">{selected.dependents.length}</p>
              </div>
            </div>
            <p className="text-xs text-zinc-600">{selected.lineCount} lines · conf {Math.round(selected.confidence * 100)}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Module Graph Tab ──────────────────────────────────────────────────────────

function ModulesTab({ graph }) {
  if (!graph) return (
    <div className="text-center py-12 text-zinc-600">
      <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">Build the knowledge graph first.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{graph.modules.length} modules discovered · {graph.relationshipCount} relationships</p>
      <div className="space-y-2">
        {graph.modules.sort((a, b) => b.entityCount - a.entityCount).slice(0, 30).map(mod => (
          <div key={mod.moduleId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${LAYER_COLORS[mod.layer] ?? "bg-zinc-800"}`}>{mod.layer}</span>
              <span className="text-sm font-bold text-zinc-200">{mod.name}</span>
              <span className="text-xs text-zinc-500">{mod.entityCount} entities</span>
            </div>
            {mod.dependsOn.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-xs text-zinc-600">deps:</span>
                {mod.dependsOn.slice(0, 5).map(d => <span key={d} className="text-xs font-mono bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{d}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
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
        <p className="text-sm text-zinc-500">Runs all EF-60 tests against the live repository.</p>
        <button onClick={run} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? "Running..." : "Run Suite"}
        </button>
      </div>
      {report && (
        <>
          <div className={`rounded-xl border p-4 ${report.certified ? "bg-emerald-900/20 border-emerald-700" : "bg-red-900/20 border-red-800"}`}>
            <div className="flex items-center gap-2 mb-1">
              {report.certified ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
              <span className={`font-bold ${report.certified ? "text-emerald-300" : "text-red-300"}`}>{report.certified ? "EF-60 CERTIFIED" : "NOT CERTIFIED"}</span>
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
          <p className="text-sm">Press "Run Suite" to validate Phase 6.0.0.</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Phase60Page() {
  const [tab, setTab]   = useState("build");
  const [graph, setGraph] = useState(null);

  const content = {
    build:      <BuildTab graph={graph} setGraph={setGraph} />,
    explorer:   <ExplorerTab graph={graph} />,
    modules:    <ModulesTab graph={graph} />,
    validation: <ValidationTab />,
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Database className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 font-heading">Phase 6.0.0 — Project Knowledge Builder</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">Repository → Entities · Relationships · Module Graph · Dependency Graph · Living Architecture Model</p>
      </div>

      {graph && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
          <span className="text-emerald-400 font-medium">● Graph Ready</span>
          <span>Repo: <span className="text-zinc-200">{graph.owner}/{graph.repo}</span></span>
          <span>Entities: <span className="text-zinc-200">{graph.entityCount}</span></span>
          <span>Relationships: <span className="text-zinc-200">{graph.relationshipCount}</span></span>
          <span>Coverage: <span className="text-zinc-200">{Math.round(graph.coverage * 100)}%</span></span>
          <span className="ml-auto font-mono">{new Date(graph.builtAt).toLocaleTimeString()}</span>
        </div>
      )}

      <div className="flex gap-1 flex-wrap border-b border-zinc-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${tab === t.id ? "text-violet-300 border-violet-500 bg-violet-900/10" : "text-zinc-500 border-transparent hover:text-zinc-300"}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div>{content[tab]}</div>
    </div>
  );
}