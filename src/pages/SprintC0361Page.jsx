import React, { useState } from "react";
import { runCapabilityRegistryTests }  from "@/lib/capability-registry/CapabilityRegistryTests";
import { CapabilityRegistry }          from "@/lib/capability-registry/CapabilityRegistry";
import { CapabilitySelectionEngine }   from "@/lib/capability-selection/CapabilitySelectionEngine";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

const DEMO_CAPS = [
  { id:"cap-drive",    name:"Drive Resource Retriever", description:"Retrieves files from Google Drive", goalTypes:["retrieve_resource","list_files","delete_file"], supportedCategories:["knowledge"], supportedActions:["get","list","delete"], priority:1, confidenceWeight:1.0, requiredRuntimes:["google-drive"], status:"ready" },
  { id:"cap-gmail",    name:"Gmail Search Capability",  description:"Searches Gmail messages",           goalTypes:["search_email","retrieve_resource"],            supportedCategories:["communication","knowledge"], supportedActions:["search","get"], priority:2, confidenceWeight:0.95, requiredRuntimes:["gmail"], status:"ready" },
  { id:"cap-calendar", name:"Calendar Event Creator",   description:"Creates and manages calendar events", goalTypes:["create_event","list_events"],                supportedCategories:["productivity"], supportedActions:["create","list","update"], priority:3, confidenceWeight:0.9, requiredRuntimes:["google-calendar"], status:"ready" },
];

const QUERY_PRESETS = [
  { label:"findAll()",                     fn: r => ({ result: r.findAll(), label:"All capabilities" }) },
  { label:"findByGoalType(retrieve)",      fn: r => r.findByGoalType("retrieve_resource") },
  { label:"findByGoalType(search_email)",  fn: r => r.findByGoalType("search_email") },
  { label:"findByCategory(knowledge)",     fn: r => r.findByCategory("knowledge") },
  { label:"findByAction(get)",             fn: r => r.findByAction("get") },
  { label:"findByStatus(ready)",           fn: r => r.findByStatus("ready") },
  { label:"findByRuntime(gmail)",          fn: r => r.findByRuntime("gmail") },
];

const GROUPS = [
  { label:"register()",                   ids:["T01","T02","T03","T04","T05","T06","T07","T08"] },
  { label:"unregister()",                 ids:["T09","T10","T11","T12","T13"] },
  { label:"findById()",                   ids:["T14","T15","T16","T17","T18"] },
  { label:"Discovery queries",            ids:["T19","T20","T21","T22","T23","T24","T25","T26"] },
  { label:"findAll()",                    ids:["T27","T28","T29","T30"] },
  { label:"exists() / count() / clear()",ids:["T31","T32","T33","T34"] },
  { label:"Explainability",               ids:["T35","T36","T37","T38"] },
  { label:"Telemetria",                   ids:["T39","T40","T41","T42"] },
  { label:"Health",                       ids:["T43","T44","T45","T46"] },
  { label:"Determinismo & Integração",    ids:["T47","T48","T49","T50"] },
];

function CaseRow({ c }) {
  return (
    <tr className="border-b border-zinc-800 text-xs">
      <td className="py-1 px-2 font-mono text-zinc-500 w-14">{c.id}</td>
      <td className="py-1 px-2 text-zinc-300">{c.label}</td>
      <td className={`py-1 px-2 font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</td>
      <td className="py-1 px-2 text-zinc-500 text-right font-mono">{c.durationMs}ms</td>
    </tr>
  );
}

export default function SprintC0361Page() {
  const [report,      setReport]      = useState(null);
  const [running,     setRunning]     = useState(false);
  const [queryIdx,    setQueryIdx]    = useState(0);
  const [queryResult, setQueryResult] = useState(null);
  const [registry]                    = useState(() => {
    const r = new CapabilityRegistry();
    DEMO_CAPS.forEach(c => r.register(c));
    return r;
  });

  async function runTests() {
    setRunning(true); setReport(null);
    try { setReport(await runCapabilityRegistryTests()); }
    finally { setRunning(false); }
  }

  function runQuery() {
    const preset = QUERY_PRESETS[queryIdx];
    const raw = preset.fn(registry);
    // Normalize: findAll returns array, discovery queries return CapabilityDiscoveryResult
    if (Array.isArray(raw)) {
      setQueryResult({ found: raw, count: raw.length, explanation: `All capabilities — ${raw.length} found`, criterion: "all", criterionValue: "*", durationMs: 0 });
    } else if (raw?.result) {
      // wrapped
      const arr = raw.result;
      setQueryResult({ found: arr, count: arr.length, explanation: raw.label, criterion: "all", criterionValue: "*", durationMs: 0 });
    } else {
      setQueryResult(raw);
    }
    // also select via engine
    const caps = (Array.isArray(raw) ? raw : raw?.found ?? []).map(c => c.descriptor ?? c);
    if (caps.length > 0) {
      const goal = { id:"demo", type: caps[0].goalTypes?.[0] ?? "retrieve_resource", category: caps[0].supportedCategories?.[0] ?? "knowledge", action: caps[0].supportedActions?.[0] ?? "get", priority:"high", description:"demo" };
      const engine = new CapabilitySelectionEngine();
      const sel = engine.select({ goal, availableCapabilities: caps });
      setQueryResult(prev => ({ ...prev, _selection: sel }));
    }
  }

  const metrics = registry.health();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT C-03.6.1</div>
          <h1 className="text-2xl font-bold">Capability Registry</h1>
          <p className="text-zinc-400 text-sm mt-1">Única fonte oficial de descoberta · register · discover · telemetry</p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm">
          <div className="text-violet-300 font-bold text-xs mb-2">NOVO FLUXO</div>
          <div className="text-zinc-400 text-xs space-y-0.5">
            <div>Intent Runtime → Goal Runtime → Planning Runtime → <span className="text-violet-300 font-bold">Capability Registry</span> → Capability Selection Engine → Capability</div>
          </div>
        </div>

        {/* Registry stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Registered", value: metrics.registeredCount },
            { label: "Lookups",    value: metrics.totalLookups },
            { label: "Discoveries",value: metrics.totalDiscoveries },
            { label: "Errors",     value: metrics.totalErrors },
          ].map(m => (
            <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-violet-300">{m.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Registry list */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
          <div className="text-violet-300 font-bold text-xs">CAPABILITIES REGISTRADAS</div>
          {registry.findAll().map(c => (
            <div key={c.descriptor.id} className="bg-zinc-800 rounded p-2 text-xs flex items-start gap-3">
              <span className="text-violet-300 font-mono">{c.descriptor.id}</span>
              <div className="flex-1">
                <span className="text-zinc-200">{c.descriptor.name}</span>
                <span className="text-zinc-500 ml-2">v{c.registeredAt}</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {c.descriptor.goalTypes.map(g => <span key={g} className="bg-zinc-700 px-1 rounded text-zinc-400">{g}</span>)}
              </div>
              <span className={`px-1 rounded text-xs ${c.descriptor.status === "ready" ? "bg-emerald-900/50 text-emerald-400" : "bg-amber-900/50 text-amber-400"}`}>{c.descriptor.status}</span>
            </div>
          ))}
        </div>

        {/* Live demo queries */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="text-violet-300 font-bold text-xs">DEMO — DISCOVERY QUERIES</div>
          <div className="flex gap-2 flex-wrap">
            {QUERY_PRESETS.map((p, i) => (
              <button key={i} onClick={() => { setQueryIdx(i); setQueryResult(null); }}
                className={`px-3 py-1 rounded text-xs border transition-colors ${queryIdx === i ? "border-violet-500 bg-violet-900/40 text-violet-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={runQuery} className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-1.5 rounded text-xs font-bold">
            Execute
          </button>
          {queryResult && (
            <div className="space-y-2">
              <div className="text-xs text-zinc-500">
                <span className="text-emerald-400 font-bold">{queryResult.count} found</span>
                {queryResult.criterion && ` — criterion: ${queryResult.criterion}="${queryResult.criterionValue}"`}
                {queryResult.durationMs !== undefined && ` — ${queryResult.durationMs}ms`}
              </div>
              <div className="space-y-1">
                {(queryResult.found ?? []).map(c => {
                  const d = c.descriptor ?? c;
                  return (
                    <div key={d.id} className="bg-zinc-800 rounded px-3 py-1.5 text-xs flex gap-3">
                      <span className="text-violet-300 font-mono">{d.id}</span>
                      <span className="text-zinc-300">{d.name}</span>
                      <span className="text-zinc-500">{d.supportedActions?.join(", ")}</span>
                    </div>
                  );
                })}
              </div>
              {queryResult.explanation && (
                <div className="bg-zinc-800 rounded p-2 text-xs text-zinc-400 whitespace-pre-wrap">
                  {queryResult.explanation}
                </div>
              )}
              {queryResult._selection && (
                <div className={`text-xs font-bold ${queryResult._selection.success ? "text-emerald-400" : "text-red-400"}`}>
                  Selection Engine: {queryResult._selection.success ? `✓ ${queryResult._selection.capabilityName}` : `✗ ${queryResult._selection.reason}`}
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={runTests} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors">
          {running ? "Running..." : "Run C-03.6.1 Certification (50 tests)"}
        </button>

        {report && (
          <>
            <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
              <span className={`text-xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "C-03.6.1 CERTIFIED — Capability Registry ready" : "C-03.6.1 NOT CERTIFIED"}
              </span>
              <span className="text-zinc-400 text-sm ml-4">{report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
              {GROUPS.map(g => {
                const groupCases = report.cases.filter(c => g.ids.includes(c.id));
                const cert = groupCases.every(c => c.status === "PASS");
                return (
                  <div key={g.label} className="p-3 space-y-1">
                    <div className={`text-xs font-bold ${cert ? "text-emerald-400" : "text-red-400"}`}>
                      {cert ? "✓" : "✗"} {g.label} ({groupCases.filter(c => c.status === "PASS").length}/{groupCases.length})
                    </div>
                    <table className="w-full"><tbody>{groupCases.map(c => <CaseRow key={c.id} c={c} />)}</tbody></table>
                    {groupCases.filter(c => c.status === "FAIL").map(c => (
                      <div key={c.id} className="bg-red-950/30 border border-red-800 rounded p-2 text-xs font-mono">
                        <span className="text-red-300 font-bold">[{c.id}]</span>
                        <span className="text-red-400 ml-2">{c.error}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}