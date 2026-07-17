import React, { useState } from "react";
import { runReferenceResolutionTests } from "@/lib/reference-resolution/tests/referenceResolutionTests";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

function CaseRow({ c }) {
  return (
    <tr className="border-b border-zinc-800 text-sm">
      <td className="py-1.5 px-3 font-mono text-zinc-400">{c.id}</td>
      <td className="py-1.5 px-3 text-zinc-300">{c.label}</td>
      <td className={`py-1.5 px-3 font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</td>
      <td className="py-1.5 px-3 text-zinc-500 text-right">{c.durationMs}ms</td>
      {c.error && <td className="py-1.5 px-3 text-red-400 font-mono text-xs">{c.error}</td>}
    </tr>
  );
}

export default function SprintC022Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setReport(null);
    try {
      const r = await runReferenceResolutionTests();
      setReport(r);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT C-02.2</div>
          <h1 className="text-2xl font-bold text-white">Reference Resolution MVP</h1>
          <p className="text-zinc-400 text-sm mt-1">Google Drive + Gmail · Deterministic · No AI · No Embeddings</p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2 text-sm">
          <div className="text-violet-300 font-bold text-xs mb-2">FLUXO COGNITIVO</div>
          <div className="text-zinc-400">
            Intent → Goal → <span className="text-violet-400 font-bold">Reference → Reference Resolution</span> → Connector Runtime → Execution
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {[
              { label: "GoogleDriveReferenceResolver", desc: "text → fileId · exact/startsWith/contains/recent" },
              { label: "GmailReferenceResolver",       desc: "text → messageId · subject/from/snippet/recent" },
              { label: "ResolverRegistry",             desc: "connectorId → resolver · strategy map · no if/else" },
              { label: "ReferenceResolutionService",   desc: "orquestrador · never throws · always ResolutionResult" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded p-3">
                <div className="text-violet-300 text-xs font-bold">{m.label}</div>
                <div className="text-zinc-400 text-xs mt-1">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors"
        >
          {running ? "Running..." : "Run Certification Suite"}
        </button>

        {/* Report */}
        {report && (
          <div className="space-y-4">
            {/* Summary */}
            <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-700 bg-emerald-950/30" : "border-red-700 bg-red-950/30"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                  {report.certified ? "C-02.2 CERTIFIED" : "C-02.2 NOT CERTIFIED"}
                </span>
                <span className="text-zinc-400 text-sm">{report.passed}/{report.total} passed · {report.passRate} · {report.durationMs}ms</span>
              </div>
              {report.failed > 0 && (
                <div className="mt-2 text-red-400 text-sm">{report.failed} test(s) failed</div>
              )}
            </div>

            {/* Cases */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                    <th className="py-2 px-3">ID</th>
                    <th className="py-2 px-3">Test</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cases.map(c => <CaseRow key={c.id} c={c} />)}
                </tbody>
              </table>
            </div>

            {/* Failures detail */}
            {report.cases.filter(c => c.status === "FAIL").length > 0 && (
              <div className="space-y-2">
                <div className="text-red-400 text-xs font-bold">FAILURES</div>
                {report.cases.filter(c => c.status === "FAIL").map(c => (
                  <div key={c.id} className="bg-red-950/30 border border-red-800 rounded p-3 text-xs">
                    <div className="text-red-300 font-bold">[{c.id}] {c.label}</div>
                    <div className="text-red-400 mt-1 font-mono">{c.error}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}