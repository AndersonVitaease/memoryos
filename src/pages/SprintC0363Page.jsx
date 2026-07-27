import React, { useState, useRef } from "react";
import { runCapabilityRuntimeTests }   from "@/lib/capability-runtime/capabilityRuntimeTests";
import { CapabilityRuntime }           from "@/lib/capability-runtime/CapabilityRuntime";
import { CapabilityRuntimeTelemetry }  from "@/lib/capability-runtime/CapabilityRuntimeTelemetry";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

const STATE_COLOR = {
  CREATED: "bg-zinc-700 text-zinc-300", QUEUED: "bg-blue-900/50 text-blue-300",
  STARTING: "bg-amber-900/50 text-amber-300", RUNNING: "bg-violet-900/50 text-violet-300",
  COMPLETED: "bg-emerald-900/50 text-emerald-400", FAILED: "bg-red-900/50 text-red-400",
  CANCELLED: "bg-zinc-600 text-zinc-300", TIMEOUT: "bg-orange-900/50 text-orange-400",
};

const DEMO_SCENARIOS = [
  { label: "Success (instant)",   opts: { retry: { maxRetries: 0 }, timeout: { timeoutMs: 0 }, executor: async () => ({ files: ["doc.pdf", "report.xlsx"] }) } },
  { label: "Success with retry",  opts: { retry: { maxRetries: 2, retryDelayMs: 50, exponentialBackoff: false }, timeout: { timeoutMs: 0 }, executor: (() => { let c=0; return async () => { c++; if(c<2) throw new Error("transient"); return {ok:true}; }; })() } },
  { label: "Failure (maxRetries=2)", opts: { retry: { maxRetries: 2, retryDelayMs: 30, exponentialBackoff: false }, timeout: { timeoutMs: 0 }, executor: async () => { throw new Error("connector unavailable"); } } },
  { label: "Timeout (100ms)",     opts: { retry: { maxRetries: 0 }, timeout: { timeoutMs: 100 }, executor: async () => { await new Promise(r => setTimeout(r, 500)); return null; } } },
  { label: "Framework handoff",   opts: {} },
];

const GROUPS = [
  { label: "ExecutionContext factory", ids: ["T01","T02","T03","T04","T05","T06","T07","T08"] },
  { label: "State machine",           ids: ["T09","T10","T11","T12","T13","T14","T15","T16"] },
  { label: "start()",                 ids: ["T17","T18","T19","T20","T21","T22","T23","T24"] },
  { label: "complete() / fail()",     ids: ["T25","T26","T27","T28","T29","T30","T31"] },
  { label: "cancel()",                ids: ["T32","T33","T34","T35","T36"] },
  { label: "timeout()",               ids: ["T37","T38","T39","T40","T41","T42"] },
  { label: "Retry Policy",            ids: ["T43","T44","T45","T46","T47","T48"] },
  { label: "Executor integration",    ids: ["T49","T50","T51","T52","T53","T54"] },
  { label: "history() / record()",    ids: ["T55","T56","T57","T58"] },
  { label: "Explainability",          ids: ["T59","T60","T61","T62"] },
  { label: "Telemetria",              ids: ["T63","T64","T65","T66"] },
  { label: "Health + Determinismo",   ids: ["T67","T68","T69","T70"] },
];

function CaseRow({ c }) {
  return (
    <tr className="border-b border-zinc-800 text-xs">
      <td className="py-1 px-2 font-mono text-zinc-500 w-12">{c.id}</td>
      <td className="py-1 px-2 text-zinc-300">{c.label}</td>
      <td className={`py-1 px-2 font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</td>
      <td className="py-1 px-2 text-zinc-500 text-right font-mono">{c.durationMs}ms</td>
    </tr>
  );
}

function StateBadge({ state }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${STATE_COLOR[state] ?? "bg-zinc-700 text-zinc-300"}`}>
      {state}
    </span>
  );
}

export default function SprintC0363Page() {
  const [report,      setReport]      = useState(null);
  const [running,     setRunning]     = useState(false);
  const [executions,  setExecutions]  = useState([]);
  const [activeExec,  setActiveExec]  = useState(null);
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [demoRunning, setDemoRunning] = useState(false);
  const telRef = useRef(new CapabilityRuntimeTelemetry());
  const rtRef  = useRef(new CapabilityRuntime(telRef.current));

  async function runDemo() {
    setDemoRunning(true);
    const scenario = DEMO_SCENARIOS[scenarioIdx];
    const rec = await rtRef.current.start(
      { capabilityId: "cap-drive", goalId: `goal-${Date.now()}`, sessionId: "demo-session", reason: `Demo: ${scenario.label}` },
      scenario.opts,
    ).catch(e => ({ error: e.message }));
    setExecutions(rtRef.current.allRecords());
    if (rec && !rec.error) setActiveExec(rec);
    setDemoRunning(false);
  }

  async function runTests() {
    setRunning(true); setReport(null);
    try { setReport(await runCapabilityRuntimeTests()); }
    finally { setRunning(false); }
  }

  const health    = rtRef.current.health();
  const telEvents = telRef.current.events();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT C-03.6.3</div>
          <h1 className="text-2xl font-bold">Capability Runtime</h1>
          <p className="text-zinc-400 text-sm mt-1">Ciclo completo de execução · retry · timeout · telemetria · explainability</p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-400 space-y-0.5">
          <div className="text-violet-300 font-bold mb-2">NOVA ARQUITETURA</div>
          {["Planning Runtime","Capability Management Layer","Capability Selection Engine","Capability Policy Engine","→ Capability Runtime ←","Capability Framework","Connector Runtime","Connector"].map((s,i) => (
            <div key={i} className={s.startsWith("→") ? "text-violet-300 font-bold pl-4" : `pl-${i*2}`}>{s}</div>
          ))}
        </div>

        {/* Health */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total",      value: health.totalExecutions },
            { label: "Completed",  value: health.completed,  color: "text-emerald-400" },
            { label: "Failed",     value: health.failed,     color: "text-red-400" },
            { label: "Retries",    value: health.totalRetries, color: "text-amber-400" },
          ].map(m => (
            <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${m.color ?? "text-violet-300"}`}>{m.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Cancelled",  value: health.cancelled,  color: "text-zinc-400" },
            { label: "Timeouts",   value: health.timedOut,   color: "text-orange-400" },
            { label: "Avg ms",     value: `${health.avgDurationMs}ms` },
            { label: "Status",     value: health.status, color: health.status === "READY" ? "text-emerald-400" : health.status === "DEGRADED" ? "text-amber-400" : "text-red-400" },
          ].map(m => (
            <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${m.color ?? "text-violet-300"}`}>{m.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Demo */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="text-violet-300 font-bold text-xs">DEMO — EXECUÇÃO CONTROLADA</div>
          <div className="flex gap-2 flex-wrap">
            {DEMO_SCENARIOS.map((s, i) => (
              <button key={i} onClick={() => setScenarioIdx(i)}
                className={`px-3 py-1 rounded text-xs border transition-colors ${scenarioIdx === i ? "border-violet-500 bg-violet-900/40 text-violet-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <button onClick={runDemo} disabled={demoRunning}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-xs font-bold">
            {demoRunning ? "Executing..." : "Execute Scenario"}
          </button>
        </div>

        {/* Execution list */}
        {executions.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            <div className="text-violet-300 font-bold text-xs">HISTÓRICO DE EXECUÇÕES</div>
            {executions.slice().reverse().map(rec => (
              <div key={rec.context.executionId}
                onClick={() => setActiveExec(rec)}
                className={`bg-zinc-800 rounded p-2 text-xs flex gap-3 items-center cursor-pointer hover:border-zinc-600 border ${activeExec?.context.executionId === rec.context.executionId ? "border-violet-600" : "border-transparent"}`}>
                <span className="font-mono text-zinc-500 text-xs w-32 truncate">{rec.context.executionId}</span>
                <span className="text-zinc-300">{rec.context.capabilityId}</span>
                <StateBadge state={rec.state} />
                <span className="text-zinc-500 ml-auto">{rec.durationMs ?? "?"}ms · retries={rec.retryCount}</span>
              </div>
            ))}
          </div>
        )}

        {/* Execution detail */}
        {activeExec && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="text-violet-300 font-bold text-xs">EXECUÇÃO DETALHADA — {activeExec.context.executionId}</div>
            <div className="flex gap-2 flex-wrap text-xs">
              {activeExec.history.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-zinc-600">→</span>}
                  <StateBadge state={s.state} />
                </React.Fragment>
              ))}
            </div>
            <div className="bg-zinc-800 rounded p-3 text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-5">
              {activeExec.explanation}
            </div>
            {activeExec.error && (
              <div className="bg-red-950/30 border border-red-800 rounded p-2 text-xs text-red-400">{activeExec.error}</div>
            )}
          </div>
        )}

        {/* Telemetry */}
        {telEvents.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            <div className="text-violet-300 font-bold text-xs">TELEMETRIA ({telEvents.length} eventos)</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {telEvents.slice().reverse().map((e, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <span className="text-zinc-600 font-mono">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span className={`font-bold ${e.type.includes("Completed") ? "text-emerald-400" : e.type.includes("Failed") ? "text-red-400" : e.type.includes("Timeout") ? "text-orange-400" : e.type.includes("Retry") ? "text-amber-400" : e.type.includes("Cancelled") ? "text-zinc-400" : "text-violet-300"}`}>
                    {e.type}
                  </span>
                  <span className="text-zinc-500 truncate">{e.detail ?? e.state ?? e.capabilityId}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={runTests} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors">
          {running ? "Running..." : "Run C-03.6.3 Certification (70 tests)"}
        </button>

        {report && (
          <>
            <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
              <span className={`text-xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "C-03.6.3 CERTIFIED — Capability Runtime ready" : "C-03.6.3 NOT CERTIFIED"}
              </span>
              <span className="text-zinc-400 text-sm ml-4">{report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
              {GROUPS.map(g => {
                const gc = report.cases.filter(c => g.ids.includes(c.id));
                const cert = gc.every(c => c.status === "PASS");
                return (
                  <div key={g.label} className="p-3 space-y-1">
                    <div className={`text-xs font-bold ${cert ? "text-emerald-400" : "text-red-400"}`}>
                      {cert ? "✓" : "✗"} {g.label} ({gc.filter(c => c.status === "PASS").length}/{gc.length})
                    </div>
                    <table className="w-full"><tbody>{gc.map(c => <CaseRow key={c.id} c={c} />)}</tbody></table>
                    {gc.filter(c => c.status === "FAIL").map(c => (
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