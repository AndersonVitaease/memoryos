import React, { useState } from "react";
import { runRuntimeInfrastructureTests } from "@/lib/runtime-infra/RuntimeTests";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

const COMPONENTS = [
  { name: "RuntimeClock", desc: "SystemClock · VirtualClock · MockClock · DeterministicClock — elimina Date.now()" },
  { name: "RuntimeExecutionIdProvider", desc: "UUIDProvider · SequentialProvider · DeterministicProvider · TestProvider" },
  { name: "RuntimeQueue", desc: "FIFO · LIFO · Priority · Weighted · Future" },
  { name: "RuntimeRetryStrategy", desc: "NoRetry · Fixed · Linear · Exponential · Fibonacci · Adaptive" },
  { name: "RuntimeTimeoutStrategy", desc: "Fixed · Adaptive · Infinite · ConnectorTimeout" },
  { name: "RuntimeEventBus", desc: "Publish · Subscribe · Wildcard · History · Filter" },
  { name: "RuntimeMetrics", desc: "avg/min/max duration · throughput · retry · timeout · successRate" },
  { name: "RuntimeHealth", desc: "READY · DEGRADED · FAILED · RECOVERING · STOPPED" },
  { name: "RuntimeLifecycle", desc: "Estado genérico reutilizável por todos os Runtimes" },
  { name: "RuntimeScheduler", desc: "QUEUED → READY → RUNNING → SUSPENDED → RESUMED → COMPLETED" },
  { name: "RuntimeContext", desc: "Factory imutável — sem Date.now() direto, sem geração manual de ID" },
  { name: "RuntimeBase", desc: "Classe abstrata base — todos os Runtimes herdam desta" },
];

const CONSUMERS = [
  { name: "Goal Runtime",       status: "READY" },
  { name: "Capability Runtime", status: "READY" },
  { name: "Connector Runtime",  status: "READY" },
  { name: "Workflow Runtime",   status: "FUTURE" },
  { name: "Agent Runtime",      status: "FUTURE" },
];

function CaseRow({ c }) {
  return (
    <tr className="border-b border-zinc-800 text-xs">
      <td className="py-1 px-3 font-mono text-zinc-500 whitespace-nowrap">{c.id}</td>
      <td className="py-1 px-3 text-zinc-300">{c.label}</td>
      <td className={`py-1 px-3 font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</td>
      <td className="py-1 px-3 text-zinc-600 text-right font-mono">{c.durationMs}ms</td>
      {c.error && (
        <td className="py-1 px-3 text-red-400 font-mono max-w-xs truncate" title={c.error}>{c.error}</td>
      )}
    </tr>
  );
}

export default function SprintC0364Page() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setReport(null);
    try {
      const r = await runRuntimeInfrastructureTests();
      setReport(r);
    } finally {
      setRunning(false);
    }
  }

  const groups = report ? groupCases(report.cases) : {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT C-03.6.4</span>
            <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded">RUNTIME INFRASTRUCTURE LAYER</span>
            {report && (
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${report.certified ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                {report.certified ? "CERTIFIED" : "NOT CERTIFIED"}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Runtime Infrastructure Layer</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Fundação compartilhada por Goal · Capability · Connector · Workflow · Agent Runtimes
          </p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-violet-300 font-bold uppercase">Componentes da Infraestrutura</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {COMPONENTS.map(c => (
              <div key={c.name} className="bg-zinc-800 rounded p-3">
                <p className="text-violet-300 text-xs font-bold">{c.name}</p>
                <p className="text-zinc-400 text-xs mt-0.5">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Consumers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <p className="text-xs text-violet-300 font-bold uppercase mb-3">Runtimes que herdam RuntimeBase</p>
          <div className="flex flex-wrap gap-2">
            {CONSUMERS.map(c => (
              <div key={c.name} className={`px-3 py-2 rounded text-xs font-semibold border ${
                c.status === "READY"
                  ? "border-emerald-700 bg-emerald-950 text-emerald-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-500"
              }`}>
                {c.name}
                <span className={`ml-2 text-[10px] ${c.status === "READY" ? "text-emerald-500" : "text-zinc-600"}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="px-6 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-semibold transition"
        >
          {running ? "Running 100 tests..." : "Run Runtime Infrastructure Tests (100 tests)"}
        </button>

        {/* Results summary */}
        {report && (
          <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
            <p className={`font-bold text-sm ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified
                ? "✓ SPRINT C-03.6.4 CERTIFIED — Runtime Infrastructure Layer aprovada"
                : "✗ NOT CERTIFIED — verifique os casos com FAIL"}
            </p>
            <div className="grid grid-cols-5 gap-4 mt-3 text-center">
              {[
                { v: report.total,    l: "Total",   cls: "text-zinc-300"   },
                { v: report.passed,   l: "Passed",  cls: "text-emerald-400"},
                { v: report.failed,   l: "Failed",  cls: "text-red-400"    },
                { v: report.passRate, l: "Pass Rate",cls: "text-violet-400"},
                { v: `${report.durationMs}ms`, l: "Duration", cls: "text-zinc-400" },
              ].map(({ v, l, cls }) => (
                <div key={l}>
                  <p className={`text-xl font-bold ${cls}`}>{v}</p>
                  <p className="text-xs text-zinc-500">{l}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test groups */}
        {report && Object.entries(groups).map(([group, cases]) => (
          <GroupBlock key={group} label={group} cases={cases} />
        ))}
      </div>
    </div>
  );
}

function groupCases(cases) {
  const map = {
    "Clock (T01–T15)":             cases.filter(c => parseInt(c.id.replace("T","")) <= 15),
    "ExecutionId (T16–T25)":       cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 16 && n <= 25; }),
    "Queue (T26–T38)":             cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 26 && n <= 38; }),
    "Retry (T39–T48)":             cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 39 && n <= 48; }),
    "Timeout (T49–T55)":           cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 49 && n <= 55; }),
    "EventBus (T56–T63)":          cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 56 && n <= 63; }),
    "Metrics (T64–T70)":           cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 64 && n <= 70; }),
    "Health (T71–T77)":            cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 71 && n <= 77; }),
    "Lifecycle (T78–T88)":         cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 78 && n <= 88; }),
    "Scheduler (T89–T93)":         cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 89 && n <= 93; }),
    "RuntimeBase (T94–T100)":      cases.filter(c => { const n = parseInt(c.id.replace("T","")); return n >= 94 && n <= 100; }),
  };
  return map;
}

function GroupBlock({ label, cases }) {
  const [open, setOpen] = useState(false);
  const failed = cases.filter(c => c.status === "FAIL").length;
  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors"
      >
        <span className={`font-bold font-mono text-xs ${failed === 0 ? "text-emerald-400" : "text-red-400"}`}>
          {failed === 0 ? "✓" : "✗"} {label}
        </span>
        <span className="text-zinc-500 text-xs">{cases.length - failed}/{cases.length} passed</span>
        <span className="ml-auto text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="py-2 px-3">ID</th>
                <th className="py-2 px-3">Test</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody>{cases.map(c => <CaseRow key={c.id} c={c} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}