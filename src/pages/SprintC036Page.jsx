import React, { useState } from "react";
import { runCapabilitySelectionTests } from "@/lib/capability-selection/CapabilitySelectionTests";
import { CapabilitySelectionEngine }   from "@/lib/capability-selection/CapabilitySelectionEngine";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

const GOAL_PRESETS = [
  { label: "retrieve_resource / get", goal: { id: "demo-1", type: "retrieve_resource", category: "knowledge",      action: "get",    priority: "high",   description: "Retrieve a file from Drive" } },
  { label: "search_email / search",   goal: { id: "demo-2", type: "search_email",      category: "communication", action: "search", priority: "medium", description: "Search emails in Gmail" } },
  { label: "create_event / create",   goal: { id: "demo-3", type: "create_event",      category: "productivity",  action: "create", priority: "low",    description: "Create a calendar event" } },
  { label: "quantum_teleport / teleport (no-match)", goal: { id: "demo-4", type: "quantum_teleport", category: "sci-fi", action: "teleport", priority: "low", description: "Unknown goal" } },
];

const DEMO_CAPS = [
  { id: "cap-drive",    name: "Drive Resource Retriever", description: "Retrieves files from Google Drive", goalTypes: ["retrieve_resource","list_files","delete_file"], supportedCategories: ["knowledge"], supportedActions: ["get","list","delete"], priority: 1, confidenceWeight: 1.0, requiredRuntimes: ["google-drive"], status: "ready" },
  { id: "cap-gmail",    name: "Gmail Search Capability",  description: "Searches Gmail messages",           goalTypes: ["search_email","retrieve_resource"],            supportedCategories: ["communication","knowledge"], supportedActions: ["search","get"], priority: 2, confidenceWeight: 0.95, requiredRuntimes: ["gmail"], status: "ready" },
  { id: "cap-calendar", name: "Calendar Event Creator",   description: "Creates and manages calendar events", goalTypes: ["create_event","list_events"],                supportedCategories: ["productivity"], supportedActions: ["create","list","update"], priority: 3, confidenceWeight: 0.9, requiredRuntimes: ["google-calendar"], status: "ready" },
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

const GROUPS = [
  { label: "Registro e descoberta",        ids: ["T01","T02","T03","T04","T05","T06","T07","T08"] },
  { label: "Compatibilidade",              ids: ["T09","T10","T11","T12","T13","T14","T15","T16"] },
  { label: "Ranking e prioridade",         ids: ["T17","T18","T19","T20","T21","T22","T23","T24","T25"] },
  { label: "Explainability",               ids: ["T26","T27","T28","T29","T30","T31","T32","T33"] },
  { label: "Telemetria",                   ids: ["T34","T35","T36","T37","T38"] },
  { label: "Determinismo",                 ids: ["T39","T40","T41","T42","T43"] },
  { label: "Nenhuma Capability encontrada",ids: ["T44","T45","T46","T47","T48"] },
  { label: "Falhas controladas & health",  ids: ["T49","T50","T51","T52","T53","T54","T55"] },
];

export default function SprintC036Page() {
  const [report,   setReport]   = useState(null);
  const [running,  setRunning]  = useState(false);
  const [demoGoal, setDemoGoal] = useState(0);
  const [demoResult, setDemoResult] = useState(null);

  async function runTests() {
    setRunning(true); setReport(null);
    try { setReport(await runCapabilitySelectionTests()); }
    finally { setRunning(false); }
  }

  function runDemo() {
    const engine = new CapabilitySelectionEngine();
    const r = engine.select({ goal: GOAL_PRESETS[demoGoal].goal, availableCapabilities: DEMO_CAPS });
    setDemoResult(r);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT C-03.6</div>
          <h1 className="text-2xl font-bold">Capability Selection Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">Seleção determinística · Ranking · Explainability · Telemetria</p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm space-y-3">
          <div className="text-violet-300 font-bold text-xs">ARQUITETURA</div>
          <div className="text-zinc-400 text-xs space-y-1">
            <div>Intent Runtime → Goal Runtime → Planning Runtime → <span className="text-violet-300 font-bold">Capability Selection Engine</span> → Capability Framework → Capability → Runtime(s) → Connector Runtime</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: "CapabilitySelectionEngine", desc: "Único ponto de entrada — select()" },
              { label: "CapabilitySelectionService", desc: "Algoritmo puro de scoring — sem efeitos" },
              { label: "CapabilitySelectionTelemetry", desc: "6 eventos obrigatórios + métricas" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded p-2">
                <div className="text-violet-300 text-xs font-bold">{m.label}</div>
                <div className="text-zinc-400 text-xs mt-1">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live demo */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="text-violet-300 font-bold text-xs">DEMO AO VIVO</div>
          <div className="flex gap-2 flex-wrap">
            {GOAL_PRESETS.map((p, i) => (
              <button key={i} onClick={() => { setDemoGoal(i); setDemoResult(null); }}
                className={`px-3 py-1 rounded text-xs border transition-colors ${demoGoal === i ? "border-violet-500 bg-violet-900/40 text-violet-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={runDemo} className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-1.5 rounded text-xs font-bold">
            Run select()
          </button>
          {demoResult && (
            <div className="space-y-3">
              <div className={`text-sm font-bold ${demoResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {demoResult.success ? `✓ Selected: ${demoResult.capabilityName} (confidence: ${demoResult.confidence})` : `✗ ${demoResult.reason}`}
              </div>
              {demoResult.success && (
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">RANKING</div>
                  {demoResult.ranking.map(c => (
                    <div key={c.capabilityId} className={`flex items-center gap-3 text-xs px-2 py-1 rounded ${c.selected ? "bg-violet-900/30 border border-violet-700" : c.discardReason ? "opacity-50" : "bg-zinc-800"}`}>
                      <span className={c.selected ? "text-violet-300 font-bold" : c.discardReason ? "text-zinc-600" : "text-zinc-400"}>{c.capabilityName}</span>
                      <span className="text-zinc-600">score={c.score}</span>
                      {c.discardReason && <span className="text-red-500 text-xs">↳ {c.discardReason}</span>}
                      {c.selected && <span className="text-violet-400 font-bold">← SELECTED</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-zinc-800 rounded p-3 text-xs text-zinc-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
                {demoResult.explanation}
              </div>
              <div className="text-xs text-zinc-600">duration: {demoResult.durationMs}ms</div>
            </div>
          )}
        </div>

        <button onClick={runTests} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors">
          {running ? "Running..." : "Run C-03.6 Certification (55 tests)"}
        </button>

        {report && (
          <>
            <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
              <span className={`text-xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "C-03.6 CERTIFIED — Capability Selection Engine ready" : "C-03.6 NOT CERTIFIED"}
              </span>
              <span className="text-zinc-400 text-sm ml-4">{report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
              {GROUPS.map(g => {
                const groupCases = report.cases.filter(c => g.ids.includes(c.id));
                const cert = groupCases.every(c => c.status === "PASS");
                const failures = groupCases.filter(c => c.status === "FAIL");
                return (
                  <div key={g.label} className="p-3 space-y-1">
                    <div className={`text-xs font-bold ${cert ? "text-emerald-400" : "text-red-400"}`}>
                      {cert ? "✓" : "✗"} {g.label} ({groupCases.filter(c => c.status === "PASS").length}/{groupCases.length})
                    </div>
                    <table className="w-full"><tbody>{groupCases.map(c => <CaseRow key={c.id} c={c} />)}</tbody></table>
                    {failures.map(c => (
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