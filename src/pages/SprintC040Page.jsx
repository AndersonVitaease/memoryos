// Sprint P-01.11 — Execution Chain Dashboard
// Dashboard consumes RuntimeEventBus + RuntimeMetrics, NOT the ExecutionChain directly.
import React, { useState, useRef } from "react";
import { ExecutionChain }                    from "@/lib/execution-chain/ExecutionChain";
import { runExecutionChainCertification }    from "@/lib/execution-chain/ExecutionChainCertification";

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

const DEMOS = [
  { label: "Memory Recall",   text: "What was decided in last Friday's meeting?" },
  { label: "Gmail",           text: "Send email to alice@corp.com about the update" },
  { label: "Calendar",        text: "Schedule a meeting for the design review tomorrow" },
  { label: "Drive + Plan",    text: "Organize my drive files and create a summary document" },
];

function sc(s) {
  if (s === "COMPLETED") return "text-emerald-400";
  if (s === "FAILED")    return "text-red-400";
  return "text-zinc-600";
}
function si(s) {
  if (s === "COMPLETED") return "✓";
  if (s === "FAILED")    return "✗";
  return "○";
}
function summarize(o) {
  if (!o || typeof o !== "object") return "";
  return Object.entries(o).slice(0, 3).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:[${v.length}]`;
    if (typeof v === "object" && v) return `${k}:{...}`;
    return `${k}:${String(v).slice(0, 24)}`;
  }).join(" · ");
}

function StageRow({ meta, record }) {
  const status = record?.status ?? "PENDING";
  return (
    <div className={`border rounded-lg p-3 ${meta.color}`}>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
        <span className={`text-xs font-bold w-3 shrink-0 ${sc(status)}`}>{si(status)}</span>
        <span className="text-white text-xs font-semibold flex-1">{meta.label}</span>
        {record && <span className="text-zinc-500 text-[10px]">{record.durationMs}ms</span>}
      </div>
      {record?.output && record.status === "COMPLETED" && (
        <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate">{summarize(record.output)}</p>
      )}
    </div>
  );
}

function Arrow({ active }) {
  return (
    <div className={`flex justify-center py-0.5 ${active ? "opacity-100" : "opacity-20"}`}>
      <div className="flex flex-col items-center">
        <div className={`w-px h-3 ${active ? "bg-zinc-400" : "bg-zinc-700"}`} />
        <span className="text-zinc-500 text-[8px]">▼</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-center">
      <p className={`text-xl font-bold font-mono ${color ?? "text-violet-300"}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

function CaseRow({ c }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-2 text-xs border-b border-zinc-800 last:border-0 ${c.status === "FAIL" ? "bg-red-950/20" : ""}`}>
      <span className={`font-bold shrink-0 w-4 ${c.status === "PASS" ? "text-emerald-400" : "text-red-400"}`}>{c.status === "PASS" ? "✓" : "✗"}</span>
      <span className="text-zinc-400 font-mono shrink-0 w-12">{c.id.split(" ")[0]}</span>
      <span className="text-zinc-300 flex-1">{c.label.replace(/^[A-Z]-\d+ — /, "")}</span>
      <span className="text-zinc-600 shrink-0">{c.durationMs}ms</span>
      {c.error && <span className="text-red-400 shrink-0 max-w-xs truncate" title={c.error}>{c.error}</span>}
    </div>
  );
}

export default function SprintC040Page() {
  const [report,    setReport]    = useState(null);
  const [running,   setRunning]   = useState(false);
  const [inputText, setInputText] = useState(DEMOS[0].text);
  const [tab,       setTab]       = useState("pipeline");
  const [busEvents, setBusEvents] = useState([]);
  const [metricsSnap, setMetrics] = useState(null);
  const [certReport,  setCert]    = useState(null);
  const [certRunning, setCertRunning] = useState(false);
  const chainRef = useRef(null);

  async function run() {
    setRunning(true);
    setReport(null);
    setBusEvents([]);
    setMetrics(null);
    try {
      const chain = new ExecutionChain();
      chainRef.current = chain;
      const r = await chain.execute({
        text:      inputText,
        sessionId: `sess-${Date.now().toString(36)}`,
        userId:    "user-memoryos",
        timestamp: Date.now(),
      });
      setReport(r);
      // Dashboard consumes bus + metrics — not the chain directly
      setBusEvents(chain.bus().history().slice(-30));
      setMetrics(chain.metrics().snapshot());
    } finally {
      setRunning(false);
    }
  }

  async function runCert() {
    setCertRunning(true);
    setCert(null);
    try {
      const r = await runExecutionChainCertification();
      setCert(r);
    } finally {
      setCertRunning(false);
    }
  }

  const stageMap = {};
  if (report) report.stages.forEach(s => { stageMap[s.stage] = s; });
  const expl  = report?.explainabilityResult;
  const audit = report?.auditResult;
  const mem   = report?.memoryResult;

  const TABS = ["pipeline", "explainability", "audit", "memory", "events", "metrics", "certification"];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT P-01.11</span>
            <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded">RUNTIME CONVERGENCE</span>
            <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded">ARCHITECTURE FREEZE</span>
            {report && (
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${report.status === "COMPLETED" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                {report.status} · {report.stagesPassed}/{report.stagesTotal} · {report.totalDurationMs}ms
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Execution Chain — Thin Orchestrator</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Todos os estágios são delegados. ExecutionChain não implementa comportamento — apenas coordena.
            <br className="hidden sm:block" />
            Clock · IDs · Events · Metrics · Connector Registry · Explainability · Audit — todos independentes e injetáveis.
          </p>
        </div>

        {/* Architecture summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { label: "RuntimeClock",     desc: "Única fonte temporal",       ok: true },
            { label: "IdProvider",       desc: "Única fonte de IDs",         ok: true },
            { label: "EventBus",         desc: "Comunicação observável",     ok: true },
            { label: "RuntimeMetrics",   desc: "Métricas centralizadas",     ok: true },
            { label: "ConnectorRegistry",desc: "Resolve connectors",         ok: true },
            { label: "11 Stage Modules", desc: "Responsabilidade única",     ok: true },
            { label: "Explainability",   desc: "Evidências por estágio",     ok: true },
            { label: "Audit",            desc: "Consome eventos do bus",     ok: true },
          ].map(m => (
            <div key={m.label} className="border border-zinc-700 rounded p-2">
              <div className="flex items-center gap-1">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="text-zinc-200 font-semibold">{m.label}</span>
              </div>
              <p className="text-zinc-500 mt-0.5">{m.desc}</p>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {DEMOS.map(d => (
              <button key={d.label} onClick={() => setInputText(d.text)}
                className={`text-xs px-3 py-1 rounded border transition-colors ${inputText === d.text ? "border-violet-500 bg-violet-950 text-violet-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                {d.label}
              </button>
            ))}
          </div>
          <input value={inputText} onChange={e => setInputText(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            placeholder="Digite sua query..." />
          <div className="flex gap-3">
            <button onClick={run} disabled={running || !inputText.trim()}
              className="px-6 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-semibold transition">
              {running ? "Executando..." : "▶  Execute Pipeline"}
            </button>
            <button onClick={runCert} disabled={certRunning}
              className="px-6 py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-sm font-semibold transition">
              {certRunning ? "Certificando..." : "✓ Run Certification (35 tests)"}
            </button>
          </div>
        </div>

        {/* Cert summary banner */}
        {certReport && (
          <div className={`border rounded-lg p-4 ${certReport.certified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className={`font-bold ${certReport.certified ? "text-emerald-400" : "text-red-400"}`}>
                {certReport.certified ? "✓ P-01.11 CERTIFIED — MemoryOS Core v1.0 Architecture Complete" : "✗ CERTIFICATION FAILED"}
              </span>
              <span className="text-zinc-400 text-xs">{certReport.passed}/{certReport.total} · {certReport.passRate} · {certReport.durationMs}ms</span>
            </div>
            {certReport.certified && (
              <div className="mt-2 text-xs text-emerald-300 space-y-0.5">
                <p>✓ Architecture Complete · ✓ Runtime Complete · ✓ Integration Complete · ✓ Core Certified · ✓ Ready for Intelligence Upgrade</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        {(report || running || certReport) && (
          <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-semibold capitalize whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Pipeline Tab */}
        {tab === "pipeline" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              {STAGES.map((stage, i) => (
                <React.Fragment key={stage.id}>
                  <StageRow meta={stage} record={stageMap[stage.id]} />
                  {i < STAGES.length - 1 && <Arrow active={stageMap[stage.id]?.status === "COMPLETED"} />}
                </React.Fragment>
              ))}
            </div>
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
            <p className="text-xs text-red-400 font-bold uppercase">Explainability — built from per-stage evidence</p>
            <div className="space-y-3">
              <div><p className="text-xs text-zinc-500">Trace ID</p><p className="text-zinc-200 font-mono text-sm">{expl.traceId}</p></div>
              <div><p className="text-xs text-zinc-500">Summary</p><p className="text-zinc-200 text-sm">{expl.humanReadableSummary}</p></div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Decision Log (per-stage evidence)</p>
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
            <p className="text-xs text-zinc-400 font-bold uppercase">Audit — consumes EventBus events</p>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-zinc-500">Audit ID</p><p className="text-zinc-200 font-mono text-sm">{audit.auditId}</p></div>
              <div>
                <p className="text-xs text-zinc-500">Compliance</p>
                <p className={`text-sm font-bold ${audit.complianceStatus === "COMPLIANT" ? "text-emerald-400" : audit.complianceStatus === "WARNING" ? "text-yellow-400" : "text-red-400"}`}>{audit.complianceStatus}</p>
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

        {/* Events Tab */}
        {tab === "events" && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-xs text-zinc-400 uppercase font-bold">Runtime EventBus — Live Events</p>
              <span className="text-xs text-zinc-600">{busEvents.length} events</span>
            </div>
            {busEvents.length === 0
              ? <p className="text-zinc-600 text-xs p-4">Run the pipeline to see events.</p>
              : (
              <div className="divide-y divide-zinc-800 max-h-80 overflow-auto">
                {busEvents.map((e, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3 text-[10px] font-mono">
                    <span className="text-zinc-600 shrink-0 w-4">{i + 1}</span>
                    <span className={`font-bold shrink-0 w-40 truncate ${e.type.includes("FAILED") ? "text-red-400" : e.type.includes("COMPLETED") ? "text-emerald-400" : "text-violet-300"}`}>{e.type}</span>
                    <span className="text-zinc-500 flex-1 truncate">{e.executionId}</span>
                    {e.detail && <span className="text-zinc-600 shrink-0 max-w-xs truncate">{e.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {tab === "metrics" && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase font-bold">RuntimeMetrics Snapshot</p>
            {metricsSnap
              ? (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <MetricCard label="Executions"    value={metricsSnap.executions}                              color="text-violet-300" />
                  <MetricCard label="Successes"     value={metricsSnap.successes}                               color="text-emerald-400" />
                  <MetricCard label="Failures"      value={metricsSnap.failures}                                color="text-red-400" />
                  <MetricCard label="Retries"       value={metricsSnap.retries}                                 color="text-yellow-400" />
                  <MetricCard label="Success Rate"  value={`${(metricsSnap.successRate * 100).toFixed(1)}%`}    color="text-teal-300" />
                  <MetricCard label="Avg Duration"  value={`${metricsSnap.avgDurationMs}ms`}                    color="text-zinc-300" />
                </div>
              )
              : <p className="text-zinc-600 text-xs">Run the pipeline to see metrics.</p>
            }
          </div>
        )}

        {/* Certification Tab */}
        {tab === "certification" && certReport && (
          <div className="space-y-3">
            <div className={`border rounded-lg p-4 ${certReport.certified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
              <p className={`font-bold text-sm ${certReport.certified ? "text-emerald-400" : "text-red-400"}`}>
                {certReport.certified ? "✓ CERTIFIED" : "✗ FAILED"} — {certReport.passed}/{certReport.total} · {certReport.passRate} · {certReport.durationMs}ms
              </p>
              {certReport.certified && (
                <div className="mt-2 text-xs text-emerald-300">
                  <p>Regression (R-01..R-10) · Integration (I-01..I-15) · Architecture (A-01..A-10)</p>
                </div>
              )}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="divide-y divide-zinc-800 max-h-96 overflow-auto">
                {certReport.cases.map(c => <CaseRow key={c.id} c={c} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}