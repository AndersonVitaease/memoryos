import React, { useState } from "react";
import { runReferenceResolutionV2Tests } from "@/lib/reference-resolution/tests/referenceResolutionV2Tests";
import { runReferenceResolutionTests }   from "@/lib/reference-resolution/tests/referenceResolutionTests";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

function CaseRow({ c }) {
  return (
    <tr className="border-b border-zinc-800 text-sm">
      <td className="py-1.5 px-3 font-mono text-zinc-500">{c.id}</td>
      <td className="py-1.5 px-3 text-zinc-300">{c.label}</td>
      <td className={`py-1.5 px-3 font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</td>
      <td className="py-1.5 px-3 text-zinc-500 text-right font-mono text-xs">{c.durationMs}ms</td>
      {c.error && <td className="py-1.5 px-3 text-red-400 font-mono text-xs max-w-xs truncate">{c.error}</td>}
    </tr>
  );
}

function SuiteBlock({ report, label }) {
  if (!report) return null;
  return (
    <div className="space-y-3">
      <div className={`border rounded-lg p-4 flex items-center gap-4 flex-wrap ${report.certified ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
        <span className={`text-lg font-bold font-mono ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
          {label} — {report.certified ? "CERTIFIED" : "NOT CERTIFIED"}
        </span>
        <span className="text-zinc-400 text-sm">{report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms</span>
      </div>
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
    </div>
  );
}

export default function SprintC023Page() {
  const [v2Report,   setV2Report]   = useState(null);
  const [v1Report,   setV1Report]   = useState(null);
  const [running,    setRunning]    = useState(false);

  async function run() {
    setRunning(true);
    setV2Report(null);
    setV1Report(null);
    try {
      const [v2, v1] = await Promise.all([
        runReferenceResolutionV2Tests(),
        runReferenceResolutionTests(),
      ]);
      setV2Report(v2);
      setV1Report(v1);
    } finally {
      setRunning(false);
    }
  }

  const totalPassed = (v2Report?.passed ?? 0) + (v1Report?.passed ?? 0);
  const totalTests  = (v2Report?.total  ?? 0) + (v1Report?.total  ?? 0);
  const allCertified = v2Report?.certified && v1Report?.certified;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT C-02.3</div>
          <h1 className="text-2xl font-bold text-white">Reference Resolution v2 — Architecture Hardening</h1>
          <p className="text-zinc-400 text-sm mt-1">Canonical Models · Policy-driven · Explainability · Evaluation · Telemetry</p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 text-sm">
          <div className="text-violet-300 font-bold text-xs">NOVA ARQUITETURA</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "ReferenceResource",       desc: "Modelo canonico para recursos — sem fileId, mimeType, modifiedTime" },
              { label: "ReferenceMessage",         desc: "Modelo canonico para mensagens — sem subject, from, snippet" },
              { label: "ReferenceResolutionPolicy",desc: "Todos os scores centralizados — zero numeros magicos nos algoritmos" },
              { label: "ReferenceResolutionReason",desc: "Enum de razoes: EXACT / PREFIX / CONTAINS / RECENT / CONFIRMATION / NO_MATCH" },
              { label: "ReferenceEvaluation",      desc: "Relatorio de candidatos com score, reason, selected — base Trust Panel" },
              { label: "ReferenceTelemetry",       desc: "Evento ReferenceResolved com connector, duration, confidence, reason" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded p-3">
                <div className="text-violet-300 text-xs font-bold">{m.label}</div>
                <div className="text-zinc-400 text-xs mt-1">{m.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 text-xs text-zinc-500 space-y-1">
            <div>DriveFile → <span className="text-violet-300">ReferenceResource</span> → Canonical Scorer → ResolutionResult</div>
            <div>GmailMessage → <span className="text-violet-300">ReferenceMessage</span> → Canonical Scorer → ResolutionResult</div>
          </div>
        </div>

        {/* Run */}
        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors"
        >
          {running ? "Running..." : "Run C-02.3 + C-02.2 Suites"}
        </button>

        {/* Combined summary */}
        {v2Report && v1Report && (
          <div className={`border rounded-lg p-4 ${allCertified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
            <div className="flex items-center gap-4 flex-wrap">
              <span className={`text-xl font-bold ${allCertified ? "text-emerald-400" : "text-red-400"}`}>
                {allCertified ? "C-02.3 CERTIFIED — All suites pass" : "C-02.3 NOT CERTIFIED"}
              </span>
              <span className="text-zinc-400 text-sm">{totalPassed}/{totalTests} total</span>
            </div>
          </div>
        )}

        {/* V2 suite */}
        <SuiteBlock report={v2Report} label="C-02.3 (Architecture Hardening — 30 tests)" />

        {/* V1 regression */}
        {v1Report && (
          <div className="space-y-2">
            <div className="text-zinc-500 text-xs font-bold">REGRESSION — C-02.2 (24 tests)</div>
            <SuiteBlock report={v1Report} label="C-02.2" />
          </div>
        )}
      </div>
    </div>
  );
}