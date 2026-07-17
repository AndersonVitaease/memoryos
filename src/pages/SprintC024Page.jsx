import React, { useState } from "react";
import { runReferenceScoringTests }      from "@/lib/reference-resolution/tests/referenceScoringTests";
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
      {c.error && <td className="py-1.5 px-3 text-red-400 font-mono text-xs max-w-xs truncate" title={c.error}>{c.error}</td>}
    </tr>
  );
}

function SuiteBlock({ report, label, collapsed = false }) {
  const [open, setOpen] = useState(!collapsed);
  if (!report) return null;
  return (
    <div className="space-y-2">
      <button onClick={() => setOpen(v => !v)}
        className="w-full text-left flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors">
        <span className={`font-bold font-mono text-sm ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
          {report.certified ? "✓" : "✗"} {label}
        </span>
        <span className="text-zinc-500 text-xs">{report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms</span>
        <span className="ml-auto text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="py-2 px-3">ID</th><th className="py-2 px-3">Test</th>
                <th className="py-2 px-3">Status</th><th className="py-2 px-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody>{report.cases.map(c => <CaseRow key={c.id} c={c} />)}</tbody>
          </table>
        </div>
      )}
      {report.cases.filter(c => c.status === "FAIL").map(c => (
        <div key={c.id} className="bg-red-950/30 border border-red-800 rounded p-3 text-xs">
          <div className="text-red-300 font-bold">[{c.id}] {c.label}</div>
          <div className="text-red-400 mt-1 font-mono">{c.error}</div>
        </div>
      ))}
    </div>
  );
}

export default function SprintC024Page() {
  const [c024, setC024] = useState(null);
  const [c023, setC023] = useState(null);
  const [c022, setC022] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setC024(null); setC023(null); setC022(null);
    try {
      const [r4, r3, r2] = await Promise.all([
        runReferenceScoringTests(),
        runReferenceResolutionV2Tests(),
        runReferenceResolutionTests(),
      ]);
      setC024(r4); setC023(r3); setC022(r2);
    } finally {
      setRunning(false);
    }
  }

  const allCertified = c024?.certified && c023?.certified && c022?.certified;
  const totalPassed  = (c024?.passed ?? 0) + (c023?.passed ?? 0) + (c022?.passed ?? 0);
  const totalTests   = (c024?.total  ?? 0) + (c023?.total  ?? 0) + (c022?.total  ?? 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT C-02.4</div>
          <h1 className="text-2xl font-bold">Reference Scoring Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">Matcher · Sorter · Selector · ScoringEngine — adapters são apenas conversores</p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm space-y-3">
          <div className="text-violet-300 font-bold text-xs">COMPONENTES CRIADOS</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "ReferenceMatcher",       desc: "Compara texto: EXACT / PREFIX / CONTAINS / NONE — puro, sem efeitos colaterais" },
              { label: "ReferenceSorter",         desc: "Ordena candidatos por score desc, estável por ordem de inserção" },
              { label: "ReferenceSelector",       desc: "Aplica minimumConfidence, determina confirmationRequired e reason" },
              { label: "ReferenceScoringEngine",  desc: "Orquestra Matcher → Policy → Sorter → Selector → ScoringResult" },
              { label: "ReferenceScoringResult",  desc: "Contrato de saída do Engine — sem dependência de Connector" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded p-3">
                <div className="text-violet-300 text-xs font-bold">{m.label}</div>
                <div className="text-zinc-400 text-xs mt-1">{m.desc}</div>
              </div>
            ))}
          </div>
          <div className="text-zinc-500 text-xs space-y-1 pt-1">
            <div>DriveFile → <span className="text-violet-300">RawScoringInput</span> → <span className="text-violet-300">ReferenceScoringEngine</span> → ResolutionResult</div>
            <div>GmailMessage → <span className="text-violet-300">RawScoringInput</span> → <span className="text-violet-300">ReferenceScoringEngine</span> → ResolutionResult</div>
          </div>
        </div>

        <button onClick={run} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors">
          {running ? "Running..." : "Run All Suites (C-02.4 + C-02.3 + C-02.2)"}
        </button>

        {c024 && c023 && c022 && (
          <div className={`border rounded-lg p-4 ${allCertified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
            <span className={`text-xl font-bold ${allCertified ? "text-emerald-400" : "text-red-400"}`}>
              {allCertified ? "C-02.4 CERTIFIED — All suites pass" : "C-02.4 NOT CERTIFIED"}
            </span>
            <span className="text-zinc-400 text-sm ml-4">{totalPassed}/{totalTests} total</span>
          </div>
        )}

        <SuiteBlock report={c024} label="C-02.4 — Scoring Engine (42 tests)" />
        <SuiteBlock report={c023} label="C-02.3 — Architecture Hardening (30 tests)" collapsed />
        <SuiteBlock report={c022} label="C-02.2 — MVP (24 tests)" collapsed />
      </div>
    </div>
  );
}