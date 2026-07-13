/**
 * Phase562Page — Cognitive Module Resolution Dashboard
 * Phase 5.6.2 · MemoryOS Core · 2026-07-13
 */
import React, { useState, useCallback } from "react";
import { runResolutionTests } from "@/lib/live-cognitive-pipeline/lcpResolutionTests";

const S = {
  RESOLVED:         "bg-blue-900/50 text-blue-300 border-blue-700",
  EXECUTED:         "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  NOT_FOUND:        "bg-red-900/60 text-red-300 border-red-700",
  NOT_INITIALIZED:  "bg-red-900/60 text-red-300 border-red-700",
  NOT_REGISTERED:   "bg-amber-900/50 text-amber-300 border-amber-700",
  PASS:             "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  FAIL:             "bg-red-900/50 text-red-300 border-red-700",
  PARTIAL:          "bg-amber-900/40 text-amber-300 border-amber-700",
};

function Badge({ label, style = "" }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

const ENGINE_PIPELINE = [
  ["KRE", "KnowledgeReconstructionEngine",  "raw sources → knowledge graph"],
  ["KFE", "KnowledgeFusionEngine",          "multi-source → fused entities"],
  ["IRE", "IdentityResolutionEngine",        "fused → canonical identities"],
  ["PRE", "ProjectReconstructionEngine",     "canonicals → project model"],
  ["GIE", "GoalIntelligenceEngine",          "project → goals + recs"],
  ["CLE", "CognitiveLearningEngine",         "execution → learning records"],
];

const PIPELINE_NODES = [
  ["ConnectorInvocationService", "bg-zinc-700 text-zinc-300 border-zinc-600"],
  ["RepositoryAnalyzer",          "bg-zinc-700 text-zinc-300 border-zinc-600"],
  ["ApplicationAnalyzer",         "bg-zinc-700 text-zinc-300 border-zinc-600"],
  ["KnowledgeReconstructionEngine","bg-blue-900/60 text-blue-200 border-blue-700"],
  ["KnowledgeFusionEngine",        "bg-indigo-900/60 text-indigo-200 border-indigo-700"],
  ["IdentityResolutionEngine",     "bg-violet-900/60 text-violet-200 border-violet-700"],
  ["ProjectReconstructionEngine",  "bg-purple-900/60 text-purple-200 border-purple-700"],
  ["GoalIntelligenceEngine",       "bg-emerald-900/60 text-emerald-200 border-emerald-700"],
  ["CognitiveLearningEngine",      "bg-teal-900/60 text-teal-200 border-teal-700"],
  ["KnowledgeGraphUpdate",         "bg-zinc-700 text-zinc-300 border-zinc-600"],
  ["ProjectSnapshot",              "bg-amber-900/60 text-amber-200 border-amber-700 ring-2 ring-amber-500"],
];

function ModuleRow({ entry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800/30 last:border-0 ${!entry.executedOk ? "bg-red-950/10" : ""}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/20 transition text-left">
        <Badge label={entry.status} style={S[entry.status] ?? ""} />
        <span className="text-zinc-300 text-xs flex-1 truncate">{entry.engine}</span>
        <span className="text-zinc-500 text-xs">{entry.durationMs}ms</span>
        <span className="text-zinc-700 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 ml-4 border-l-2 border-zinc-800 space-y-1 pt-1">
          <p className="text-zinc-500 text-xs font-mono">path: {entry.importPath}</p>
          <p className="text-zinc-400 text-xs">{entry.detail}</p>
          {entry.error && <p className="text-red-400 text-xs font-mono">error: {entry.error}</p>}
          <div className="flex gap-2 mt-1">
            <Badge label={entry.instanceOk ? "instantiated" : "failed"} style={entry.instanceOk ? S.RESOLVED : S.NOT_FOUND} />
            <Badge label={entry.executedOk ? "executed" : "not executed"} style={entry.executedOk ? S.EXECUTED : S.NOT_INITIALIZED} />
          </div>
        </div>
      )}
    </div>
  );
}

function TestRow({ r }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 border-b border-zinc-800/30 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <Badge label={r.passed ? "PASS" : "FAIL"} style={r.passed ? S.PASS : S.FAIL} />
      <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">C{r.id}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${r.passed ? "text-zinc-300" : "text-red-300"}`}>{r.name}</p>
        {r.detail && <p className="text-zinc-500 text-xs mt-0.5">{r.detail}</p>}
        {r.error  && <p className="text-red-400 text-xs font-mono">{r.error}</p>}
      </div>
      <span className="text-zinc-700 text-xs shrink-0">{r.durationMs}ms</span>
    </div>
  );
}

const TABS = ["Module Map", "Dependency Graph", "Validation", "Certification"];

export default function Phase562Page() {
  const [running, setRunning] = useState(false);
  const [suite, setSuite]     = useState(null);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("Module Map");

  const runSuite = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSuite(null);
    try {
      setSuite(await runResolutionTests());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allResolved  = suite?.moduleMap?.filter(m => m.status === "EXECUTED").length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 text-xs font-mono mb-2">
            <span className="text-violet-400">MemoryOS Core</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Phase 5.6.2</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Cognitive Module Resolution</span>
          </div>
          <h1 className="text-lg font-bold">Module Resolution Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Audits every certified engine: import path · instantiation · API signature · execution
          </p>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <button onClick={runSuite} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {running ? "Running…" : "Run Resolution Audit (22 criteria)"}
            </button>
            {suite && (
              <Badge
                label={`${suite.status}: ${suite.passed}/${suite.total} · Pipeline: ${suite.pipelineStatus ?? "N/A"}`}
                style={suite.status === "PASS" ? S.PASS : S.PARTIAL}
              />
            )}
          </div>
        </div>

        {/* Metrics */}
        {suite && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Modules Executed" value={`${allResolved}/6`}         color={allResolved === 6 ? "text-emerald-400" : "text-amber-400"} />
            <Metric label="Suite Passed"      value={`${suite.passed}/${suite.total}`} color={suite.status === "PASS" ? "text-emerald-400" : "text-amber-400"} />
            <Metric label="Pipeline Status"   value={suite.pipelineStatus ?? "N/A"}    color="text-violet-400" />
            <Metric label="Snapshot"          value={suite.snapshotGenerated ? "YES" : "NO"} color={suite.snapshotGenerated ? "text-emerald-400" : "text-red-400"} />
          </div>
        )}

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-zinc-400 text-sm">Resolving KRE → KFE → IRE → PRE → GIE → CLE → LCP…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/20 border border-red-700 rounded-xl p-3">
            <p className="text-red-300 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Module Map */}
        {tab === "Module Map" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-200 text-sm font-semibold">Module Resolution Map — 6 Engines</span>
              {suite && <Badge label={`${allResolved} EXECUTED`} style={allResolved === 6 ? S.EXECUTED : S.PARTIAL} />}
            </div>
            {suite?.moduleMap?.length > 0 ? (
              suite.moduleMap.map((entry, i) => <ModuleRow key={i} entry={entry} />)
            ) : (
              <p className="px-4 py-6 text-zinc-600 text-xs text-center">Run the resolution audit to populate the module map.</p>
            )}
          </div>
        )}

        {/* Dependency Graph */}
        {tab === "Dependency Graph" && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Pipeline Stage Resolution Status</p>
              <div className="flex flex-col items-center gap-0.5 text-xs font-mono">
                {PIPELINE_NODES.map(([label, cls], i, arr) => {
                  const mEntry = suite?.moduleMap?.find(m => m.engine === label);
                  return (
                    <React.Fragment key={label}>
                      <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 w-80 ${cls}`}>
                        <span className="flex-1 text-center text-xs">{label}</span>
                        {mEntry && <Badge label={mEntry.status} style={S[mEntry.status] ?? ""} />}
                      </div>
                      {i < arr.length - 1 && <div className="text-zinc-700 text-sm leading-none">↓</div>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">API Signatures</p>
              {ENGINE_PIPELINE.map(([abbr, name, transform]) => (
                <div key={abbr} className="flex items-start gap-2 text-xs">
                  <span className="text-violet-400 font-mono w-8 shrink-0">{abbr}</span>
                  <span className="text-zinc-400 w-56 shrink-0">{name}</span>
                  <span className="text-zinc-600">{transform}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation */}
        {tab === "Validation" && (
          suite ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-200 text-sm font-semibold">Resolution Suite — 22 Criteria</span>
                <Badge label={suite.status} style={suite.status === "PASS" ? S.PASS : S.PARTIAL} />
              </div>
              {suite.results.map(r => <TestRow key={r.id} r={r} />)}
            </div>
          ) : (
            <p className="text-zinc-600 text-xs text-center py-6">Run the resolution audit first.</p>
          )
        )}

        {/* Certification */}
        {tab === "Certification" && suite && (
          <div className={`border rounded-xl p-5 space-y-4 ${suite.status === "PASS" ? "bg-emerald-950/20 border-emerald-600" : "bg-amber-950/10 border-amber-700"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-100 text-base font-bold">Cognitive Runtime Resolution Certificate</span>
              <Badge label={suite.status === "PASS" ? "CERTIFIED" : suite.status}
                style={suite.status === "PASS" ? "bg-emerald-900/60 text-emerald-200 border-emerald-600" : S.PARTIAL} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { l: "Suite Status",       v: suite.status },
                { l: "Criteria",           v: `${suite.passed}/${suite.total}` },
                { l: "Engines Executed",   v: `${allResolved}/6` },
                { l: "Pipeline Status",    v: suite.pipelineStatus ?? "N/A" },
                { l: "Snapshot Generated", v: suite.snapshotGenerated ? "YES" : "NO" },
                { l: "Duration",           v: `${suite.durationMs}ms` },
              ].map(m => (
                <div key={m.l} className="bg-zinc-800/40 rounded p-2">
                  <div className="text-zinc-200 font-mono text-xs">{String(m.v)}</div>
                  <div className="text-zinc-500 text-xs">{m.l}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Phase 5.6.2 Completion Criteria</p>
              {[
                ["KRE operational",                             suite?.moduleMap?.find(m => m.engine === "KnowledgeReconstructionEngine")?.executedOk],
                ["KFE operational",                             suite?.moduleMap?.find(m => m.engine === "KnowledgeFusionEngine")?.executedOk],
                ["IRE operational",                             suite?.moduleMap?.find(m => m.engine === "IdentityResolutionEngine")?.executedOk],
                ["PRE operational",                             suite?.moduleMap?.find(m => m.engine === "ProjectReconstructionEngine")?.executedOk],
                ["GIE operational",                             suite?.moduleMap?.find(m => m.engine === "GoalIntelligenceEngine")?.executedOk],
                ["CLE operational",                             suite?.moduleMap?.find(m => m.engine === "CognitiveLearningEngine")?.executedOk],
                ["Live Cognitive Pipeline reaches final stage", suite?.snapshotGenerated],
                ["Live Project Snapshot generated",             suite?.snapshotGenerated],
              ].map(([label, ok], i) => (
                <p key={i} className={`text-xs ${ok ? "text-emerald-400" : "text-amber-300"}`}>
                  {ok ? "✓" : "○"} {label}
                </p>
              ))}
            </div>
            <p className="text-zinc-600 text-xs font-mono">Generated: {new Date().toISOString()}</p>
          </div>
        )}

        {tab === "Certification" && !suite && (
          <p className="text-zinc-600 text-xs text-center py-6">Run the resolution audit to generate the certificate.</p>
        )}
      </div>
    </div>
  );
}