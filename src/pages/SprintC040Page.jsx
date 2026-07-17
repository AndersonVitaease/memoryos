import React, { useState } from "react";
import { ExecutionChain } from "@/lib/execution-chain/ExecutionChain";

const STAGES = [
  { id: "USER_INPUT",           label: "Usuário",              color: "border-zinc-600 bg-zinc-800",       dot: "bg-zinc-400" },
  { id: "INTENT_RUNTIME",       label: "Intent Runtime",       color: "border-violet-700 bg-violet-950",   dot: "bg-violet-400" },
  { id: "GOAL_RUNTIME",         label: "Goal Runtime",         color: "border-indigo-700 bg-indigo-950",   dot: "bg-indigo-400" },
  { id: "PLANNING_RUNTIME",     label: "Planning Runtime",     color: "border-blue-700 bg-blue-950",       dot: "bg-blue-400" },
  { id: "KERNEL",               label: "Kernel",               color: "border-cyan-700 bg-cyan-950",       dot: "bg-cyan-400" },
  { id: "RUNTIME_ORCHESTRATOR", label: "Runtime Orchestrator", color: "border-teal-700 bg-teal-950",       dot: "bg-teal-400" },
  { id: "CAPABILITY_RUNTIME",   label: "Capability Runtime",   color: "border-emerald-700 bg-emerald-950", dot: "bg-emerald-400" },
  { id: "CONNECTOR_RUNTIME",    label: "Connector Runtime",    color: "border-green-700 bg-green-950",     dot: "bg-green-400" },
  { id: "CONNECTOR",            label: "Connector",            color: "border-lime-700 bg-lime-950",       dot: "bg-lime-400" },
  { id: "RESULT",               label: "Resultado",            color: "border-yellow-700 bg-yellow-950",   dot: "bg-yellow-400" },
  { id: "MEMORY",               label: "Memory",               color: "border-orange-700 bg-orange-950",   dot: "bg-orange-400" },
  { id: "EXPLAINABILITY",       label: "Explainability",       color: "border-red-700 bg-red-950",         dot: "bg-red-400" },
  { id: "AUDIT",                label: "Audit",                color: "border-pink-700 bg-pink-950",       dot: "bg-pink-400" },
];

const DEMO_INPUTS = [
  { label: "Memory Recall",   text: "What was decided in last Friday's meeting?" },
  { label: "Connector Query", text: "Send an email to team@company.com about the project update" },
  { label: "Plan Execute",    text: "Create a calendar event for the design review tomorrow" },
  { label: "Drive + Plan",    text: "Organize my drive files and create a summary document" },
];

function scColor(s) {
  if (s === "COMPLETED") return "text-emerald-400";
  if (s === "FAILED")    return "text-red-400";
  if (s === "RUNNING")   return "text-yellow-300";
  return "text-zinc-600";
}
function scIcon(s) {
  if (s === "COMPLETED") return "✓";
  if (s === "FAILED")    return "✗";
  if (s === "RUNNING")   return "●";
  return "○";
}
function summarize(output) {
  if (!output || typeof output !== "object") return "";
  return Object.entries(output).slice(0, 3).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:[${v.length}]`;
    if (typeof v === "object" && v) return `${k}:{...}`;
    return `${k}:${String(v).slice(0, 20)}`;
  }).join(" · ");
}

function StageRow({ meta, record, running }) {
  const status = record?.status ?? (running ? "PENDING" : "PENDING");
  return (
    <div className={`border rounded-lg p-3 transition-all ${meta.color}`}>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
        <span className={`text-xs font-bold w-3 shrink-0 ${scColor(status)}`}>{scIcon(status)}</span>
        <span className="text-white text-xs font-semibold flex-1">{meta.label}</span>
        {record && <span className="text-zinc-500 text-[10px]">{record.durationMs}ms</span>}
      </div>
      {record?.output && record.status === "COMPLETED" && (
        <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate">{summarize(record.output)}</p>
      )}
      {record?.error && (
        <p className="text-[10px] text-red-400 mt-1 font-mono truncate">{record.error}</p>
      )}
    </div>
  );
}

function Arrow({ active }) {
  return (
    <div className={`flex justify-center py-0.5 transition-opacity ${active ? "opacity-100" : "opacity-20"}`}>
      <div className="flex flex-col items-center">
        <div className={`w-px h-3 ${active ? "bg-zinc-400" : "bg-zinc-700"}`} />
        <span className="text-zinc-500 text-[8px]">▼</span>
      </div>
    </div>
  );
}

export default function SprintC040Page() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [inputText, setInputText] = useState(DEMO_INPUTS[0].text);
  const [tab, setTab] = useState("pipeline");

  async function run() {
    setRunning(true);
    setReport(null);
    try {
      const chain = new ExecutionChain();
      const r = await chain.execute({
        text: inputText,
        sessionId: `sess-${Date.now().toString(36)}`,
        userId: "user-memoryos",
        timestamp: Date.now(),
      });
      setReport(r);
    } finally {
      setRunning(false);
    }
  }

  const stageMap = {};
  if (report) report.stages.forEach(s => { stageMap[s.stage] = s; });

  const expl = report?.explainabilityResult;
  const audit = report?.auditResult;
  const mem = report?.memoryResult;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT C-04.0</span>
            <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded">EXECUTION CHAIN</span>
            {report && (
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${report.status === "COMPLETED" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                {report.status} · {report.stagesPassed}/{report.stagesTotal} stages · {report.totalDurationMs}ms
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Execution Chain — Pipeline Completo</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Usuário → Intent → Goal → Planning → Kernel → Orchestrator → Capability → Connector Runtime → Connector → Resultado → Memory → Explainability → Audit
          </p>
        </div>

        {/* Input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {DEMO_INPUTS.map(d => (
              <button key={d.label} onClick={() => setInputText(d.text)}
                className={`text-xs px-3 py-1 rounded border transition-colors ${inputText === d.text ? "border-violet-500 bg-violet-950 text-violet-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                {d.label}
              </button>
            ))}
          </div>
          <input value={inputText} onChange={e => setInputText(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            placeholder="Digite sua query..." />
          <button onClick={run} disabled={running || !inputText.trim()}
            className="px-6 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-semibold transition">
            {running ? "Executando..." : "▶  Executar Execution Chain (13 stages)"}
          </button>
        </div>

        {/* Tabs */}
        {(report || running) && (
          <div className="flex gap-1 border-b border-zinc-800">
            {["pipeline", "explainability", "audit", "memory", "raw"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-semibold capitalize transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Pipeline Tab */}
        {tab === "pipeline" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: vertical chain */}
            <div>
              {STAGES.map((stage, i) => (
                <React.Fragment key={stage.id}>
                  <StageRow meta={stage} record={stageMap[stage.id]} running={running} />
                  {i < STAGES.length - 1 && (
                    <Arrow active={stageMap[stage.id]?.status === "COMPLETED"} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Right: output details */}
            <div className="space-y-2">
              {STAGES.map(stage => {
                const rec = stageMap[stage.id];
                if (!rec || rec.status !== "COMPLETED") return null;
                return (
                  <div key={stage.id} className={`border rounded p-3 ${stage.color}`}>
                    <p className="text-white text-xs font-bold mb-1">{stage.label}</p>
                    {rec.output && typeof rec.output === "object" && (
                      <div className="space-y-0.5">
                        {Object.entries(rec.output).slice(0, 5).map(([k, v]) => (
                          <div key={k} className="text-[10px] font-mono flex gap-1">
                            <span className="text-zinc-500 shrink-0">{k}:</span>
                            <span className="text-zinc-300 truncate">
                              {Array.isArray(v) ? `[${v.length}]` : typeof v === "object" && v ? "{...}" : String(v).slice(0, 50)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-zinc-600 text-[10px] mt-1">{rec.durationMs}ms</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Explainability Tab */}
        {tab === "explainability" && expl && (
          <div className="bg-zinc-900 border border-red-800 rounded-lg p-5 space-y-4">
            <p className="text-xs text-red-400 font-bold uppercase">Explainability Report</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500">Trace ID</p>
                <p className="text-zinc-200 font-mono text-sm">{expl.traceId}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Summary</p>
                <p className="text-zinc-200 text-sm">{expl.humanReadableSummary}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Decision Log</p>
                {expl.decisionLog.map((d, i) => <p key={i} className="text-zinc-400 text-xs font-mono">→ {d}</p>)}
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Stages Executed</p>
                <div className="flex flex-wrap gap-1">
                  {expl.stagesExecuted.map(s => <span key={s} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{s}</span>)}
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Confidence</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-zinc-800 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: `${expl.confidenceScore * 100}%` }} />
                  </div>
                  <span className="text-zinc-300 text-xs">{Math.round(expl.confidenceScore * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {tab === "audit" && audit && (
          <div className={`border rounded-lg p-5 space-y-4 ${audit.complianceStatus === "COMPLIANT" ? "border-emerald-700 bg-emerald-950" : audit.complianceStatus === "WARNING" ? "border-yellow-700 bg-yellow-950" : "border-red-700 bg-red-950"}`}>
            <p className="text-xs text-zinc-400 font-bold uppercase">Audit Report</p>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-zinc-500">Audit ID</p><p className="text-zinc-200 font-mono text-sm">{audit.auditId}</p></div>
              <div>
                <p className="text-xs text-zinc-500">Compliance</p>
                <p className={`text-sm font-bold ${audit.complianceStatus === "COMPLIANT" ? "text-emerald-400" : audit.complianceStatus === "WARNING" ? "text-yellow-400" : "text-red-400"}`}>
                  {audit.complianceStatus}
                </p>
              </div>
              <div><p className="text-xs text-zinc-500">Audited At</p><p className="text-zinc-300 text-xs font-mono">{new Date(audit.auditedAt).toISOString()}</p></div>
              <div>
                <p className="text-xs text-zinc-500">Violations</p>
                {audit.violations.length === 0
                  ? <p className="text-emerald-400 text-xs">None</p>
                  : audit.violations.map(v => <p key={v} className="text-red-400 text-xs">• {v}</p>)}
              </div>
              <div className="col-span-2"><p className="text-xs text-zinc-500">Signature</p><p className="text-zinc-500 text-[10px] font-mono break-all">{audit.signature}</p></div>
            </div>
          </div>
        )}

        {/* Memory Tab */}
        {tab === "memory" && mem && (
          <div className="bg-zinc-900 border border-orange-800 rounded-lg p-5 space-y-4">
            <p className="text-xs text-orange-400 font-bold uppercase">Memory Store</p>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-zinc-500">Memory ID</p><p className="text-zinc-200 font-mono text-sm">{mem.memoryId}</p></div>
              <div><p className="text-xs text-zinc-500">Tier</p><p className="text-orange-300 font-bold">{mem.tier}</p></div>
              <div><p className="text-xs text-zinc-500">Memorized</p><p className={`font-bold ${mem.memorized ? "text-emerald-400" : "text-red-400"}`}>{String(mem.memorized)}</p></div>
              <div><p className="text-xs text-zinc-500">Entities Stored</p><p className="text-zinc-200">{mem.entitiesStored}</p></div>
              <div className="col-span-2">
                <p className="text-xs text-zinc-500 mb-1">Knowledge Extracted</p>
                {mem.knowledgeExtracted.map((k, i) => <p key={i} className="text-zinc-400 text-xs font-mono">• {k}</p>)}
              </div>
            </div>
          </div>
        )}

        {/* Raw Tab */}
        {tab === "raw" && report && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-xs text-zinc-500 uppercase mb-2">Raw Report (summary)</p>
            <pre className="text-[10px] text-zinc-400 overflow-auto max-h-96 font-mono whitespace-pre-wrap">
              {JSON.stringify({ chainId: report.chainId, status: report.status, totalDurationMs: report.totalDurationMs, stagesPassed: report.stagesPassed, stagesTotal: report.stagesTotal, finalOutput: report.finalOutput, auditResult: report.auditResult }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}