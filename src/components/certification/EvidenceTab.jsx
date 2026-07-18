// EvidenceTab.jsx — Sprint EF-39.6 — SRP: renders evidence chain only
import React from "react";

function buildEvidenceChain(report) {
  const { testResult, auditReport, structuralReport, sourceReport, astReport, archScore } = report;
  const ic = (k) => auditReport.immutability.checks.find(c => c.check.includes(k));
  const ig = (k) => auditReport.integrity.checks.find(c => c.check.includes(k));
  const sc = (k) => structuralReport.checks.find(c => c.check.includes(k));
  const so = (k) => auditReport.solid.checks.find(c => c.principle.includes(k));

  return [
    { label: "All tests passed",                              ok: testResult.certified,               evidence: `${testResult.passed}/${testResult.total}` },
    { label: "StoreResult is frozen",                         ok: ic("StoreResult frozen")?.ok ?? false,   evidence: ic("StoreResult frozen")?.detail ?? "n/a" },
    { label: "QueryResult + records[] frozen",                ok: ic("QueryResult frozen")?.ok ?? false,   evidence: ic("QueryResult frozen")?.detail ?? "n/a" },
    { label: "SearchResult + scores[] frozen",                ok: ic("SearchResult frozen")?.ok ?? false,  evidence: ic("SearchResult frozen")?.detail ?? "n/a" },
    { label: "Snapshot fully frozen",                         ok: ic("Snapshot frozen")?.ok ?? false,      evidence: ic("Snapshot frozen")?.detail ?? "n/a" },
    { label: "No empty Sets in index after delete",           ok: ig("no empty sets")?.ok ?? false,        evidence: ig("no empty sets")?.detail ?? "n/a" },
    { label: "Statistics consistent across lifecycle",        ok: ig("Statistics consistent")?.ok ?? false,evidence: ig("Statistics consistent")?.detail ?? "n/a" },
    { label: "No orphan references after delete",             ok: ig("No orphan")?.ok ?? false,            evidence: ig("No orphan")?.detail ?? "n/a" },
    { label: "Query deterministic",                           ok: ig("deterministic")?.ok ?? false,        evidence: ig("deterministic")?.detail ?? "n/a" },
    { label: "Query pagination no overlap",                   ok: sc("overlap")?.ok ?? false,              evidence: sc("overlap")?.detail ?? "n/a" },
    { label: "Source: 0 critical findings",                   ok: sourceReport.critical === 0,             evidence: `${sourceReport.critical} critical in ${sourceReport.totalLines} lines` },
    { label: "Source: 0 error findings",                      ok: sourceReport.errors === 0,               evidence: `${sourceReport.errors} errors` },
    { label: "No circular dependencies (AST-derived)",        ok: !astReport.dependencies.hasCircular,     evidence: `${astReport.dependencies.circularPairs.length} circular pairs` },
    { label: "SOLID — SRP",                                   ok: so("SRP")?.verdict === "PASS",           evidence: so("SRP")?.evidence ?? "n/a" },
    { label: "SOLID — LSP (all 11 methods present)",          ok: so("LSP")?.verdict === "PASS",           evidence: so("LSP")?.evidence ?? "n/a" },
    { label: "SOLID — DIP (depends on abstractions)",         ok: so("DIP")?.verdict === "PASS",           evidence: so("DIP")?.evidence ?? "n/a" },
    { label: "Architecture Score >= 95",                      ok: archScore?.score >= 95,                  evidence: `${archScore?.score}/100` },
    { label: "Final verdict",                                 ok: report.certified,                        evidence: archScore?.verdict ?? "n/a" },
  ];
}

export default function EvidenceTab({ report }) {
  const chain = buildEvidenceChain(report);
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1.5">
      <div className="text-zinc-500 tracking-widest mb-2">EVIDENCE CHAIN — ALL FROM REAL EXECUTION</div>
      {chain.map((e, i) => (
        <div key={i} className={`flex gap-2 py-0.5 ${e.ok ? "text-zinc-300" : "text-red-400"}`}>
          <span className="shrink-0">{e.ok ? "✓" : "✗"}</span>
          <span className="flex-1">{e.label}</span>
          <span className="text-zinc-600 ml-auto shrink-0 max-w-xs truncate font-mono text-xs">{e.evidence}</span>
        </div>
      ))}
    </div>
  );
}