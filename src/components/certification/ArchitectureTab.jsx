// ArchitectureTab.jsx — Sprint EF-39.6 — SRP: renders certification gates only
import React from "react";

export default function ArchitectureTab({ report }) {
  const { testResult, auditReport, structuralReport, sourceReport, astReport, archScore } = report;
  const { integrity, immutability, solid } = auditReport;

  const gates = [
    ["Test suite",            testResult.certified,           `${testResult.passed}/${testResult.total} tests`],
    ["Integrity audit",       integrity.ok,                   `${integrity.passed} checks`],
    ["Immutability audit",    immutability.ok,                `${immutability.passed} checks`],
    ["SOLID audit",           solid.ok,                       `${solid.checks.length} principles`],
    ["Structural audit",      structuralReport.ok,            `${structuralReport.passed} checks`],
    ["Source clean",          sourceReport.ok,                `${sourceReport.critical} critical, ${sourceReport.errors} errors`],
    ["No circular deps",      !astReport.dependencies.hasCircular, `${astReport.dependencies.circularPairs.length} pairs`],
    ["Architecture Score ≥95",archScore.score >= 95,          `${archScore.score}/100`],
  ];

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
      <div className="text-zinc-500 tracking-widest mb-3">CERTIFICATION GATES</div>
      {gates.map(([label, ok, ev]) => (
        <div key={label}
          className={`flex items-center gap-3 py-1.5 border-b border-zinc-800/40 last:border-0 ${!ok ? "bg-red-950/10" : ""} px-2 rounded`}>
          <span className={`font-bold text-sm ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
          <span className="text-zinc-300 flex-1">{label}</span>
          <span className="text-zinc-500 text-xs">{ev}</span>
        </div>
      ))}
    </div>
  );
}