// CertificationMetrics.jsx — Sprint EF-39.6 — SRP: renders top-level metric cards only
import React from "react";

function MetCard({ label, value, color, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color ?? "text-zinc-200"}`}>{value ?? "—"}</div>
      {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

export default function CertificationMetrics({ report }) {
  const { testResult, auditReport, sourceReport, astReport } = report;
  const { immutability, integrity } = auditReport;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      <MetCard
        label="Tests"
        value={`${testResult.passed}/${testResult.total}`}
        color={testResult.certified ? "text-emerald-400" : "text-red-400"}
      />
      <MetCard
        label="Integrity"
        value={`${integrity.passed}/${integrity.passed + integrity.failed}`}
        color={integrity.ok ? "text-emerald-400" : "text-red-400"}
      />
      <MetCard
        label="Immutable"
        value={`${immutability.passed}/${immutability.passed + immutability.failed}`}
        color={immutability.ok ? "text-emerald-400" : "text-red-400"}
      />
      <MetCard
        label="Source"
        value={`${sourceReport.critical}c ${sourceReport.errors}e ${sourceReport.warnings}w`}
        color={sourceReport.ok ? "text-emerald-400" : "text-red-400"}
        sub={`${sourceReport.totalLines} lines`}
      />
      <MetCard
        label="Smells"
        value={astReport.codeSmells.length}
        color={astReport.codeSmells.length === 0 ? "text-emerald-400" : "text-amber-400"}
      />
      <MetCard
        label="Circular"
        value={astReport.dependencies.hasCircular ? "YES" : "NONE"}
        color={astReport.dependencies.hasCircular ? "text-red-400" : "text-emerald-400"}
      />
    </div>
  );
}