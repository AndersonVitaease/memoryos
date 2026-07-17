import React, { useState } from "react";
import { runEngineeringQualityCertification } from "@/lib/execution-chain/tests/EngineeringQuality.cert";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

function CaseRow({ c }) {
  return (
    <tr className="border-b border-zinc-800 text-sm">
      <td className="py-1.5 px-3 font-mono text-zinc-500 w-20">{c.id}</td>
      <td className="py-1.5 px-3 text-zinc-300">{c.label}</td>
      <td className={`py-1.5 px-3 font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</td>
      <td className="py-1.5 px-3 text-zinc-500 text-right font-mono text-xs">{c.durationMs}ms</td>
    </tr>
  );
}

const EF_ITEMS = [
  { id: "EF-21", title: "Typed State Helpers",           desc: "withUserInput/withIntent/… — zero unsafe casts" },
  { id: "EF-22", title: "Instrumentation Separation",   desc: "PipelineInstrumentation owns metrics/events/evidence" },
  { id: "EF-23", title: "Evidence V3",                  desc: "reasoning + metadata fields added to ExplainabilityEvidence" },
  { id: "EF-24", title: "Descriptor Versioning",        desc: "apiVersion + schemaVersion on RuntimeDescriptor" },
  { id: "EF-25", title: "Registry Self-Validation",     desc: "validate() / compatibility() / dependencyGraph()" },
  { id: "EF-26", title: "DI Completion",                desc: "ExecutionReportAssembler injected by CompositionRoot" },
  { id: "EF-27", title: "Quality Certification Suite",  desc: "EQ-01..10 — 10 deterministic quality gates" },
];

export default function SprintP011CPage() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setReport(null);
    try {
      const r = await runEngineeringQualityCertification();
      setReport(r);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT P-01.11C</div>
          <h1 className="text-2xl font-bold">Engineering Excellence Refinement</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Architecture Freeze preserved · Zero behavior changes · Production-grade quality
          </p>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap gap-2">
          {["Architecture: FROZEN", "Execution Core: CERTIFIED", "Pipeline: CERTIFIED"].map(s => (
            <span key={s} className="bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-xs px-3 py-1 rounded-full">{s}</span>
          ))}
        </div>

        {/* EF Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EF_ITEMS.map(ef => (
            <div key={ef.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-violet-400 text-xs font-bold">{ef.id}</span>
                <span className="text-white text-sm font-semibold">{ef.title}</span>
              </div>
              <p className="text-zinc-500 text-xs">{ef.desc}</p>
            </div>
          ))}
        </div>

        {/* Run */}
        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors"
        >
          {running ? "Running EQ-01..10..." : "Run Engineering Quality Certification"}
        </button>

        {/* Result */}
        {report && (
          <>
            <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
              <span className={`text-xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "P-01.11C CERTIFIED — Engineering Quality Achieved" : "P-01.11C NOT CERTIFIED"}
              </span>
              <span className="text-zinc-400 text-sm ml-4">
                {report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms
              </span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                    <th className="py-2 px-3">ID</th>
                    <th className="py-2 px-3">Criterion</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cases.map(c => <CaseRow key={c.id} c={c} />)}
                </tbody>
              </table>
            </div>

            {report.cases.filter(c => c.status === "FAIL").map(c => (
              <div key={c.id} className="bg-red-950/30 border border-red-800 rounded p-3 text-xs">
                <div className="text-red-300 font-bold">[{c.id}] {c.label}</div>
                <div className="text-red-400 mt-1 font-mono">{c.error}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}