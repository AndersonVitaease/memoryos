// SolidTab.jsx — Sprint EF-39.6 — SRP: renders SOLID audit results only
import React from "react";

export default function SolidTab({ report }) {
  const { solid } = report.auditReport;
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
        SOLID AUDIT — 5 independent principle sub-auditors · {solid.durationMs}ms
      </div>
      {solid.checks.map((c, i) => (
        <div key={i} className={`px-4 py-3 border-b border-zinc-800/40 last:border-0 ${c.verdict === "FAIL" ? "bg-red-950/10" : c.verdict === "WARNING" ? "bg-amber-950/10" : ""}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold ${c.verdict === "PASS" ? "text-emerald-400" : c.verdict === "WARNING" ? "text-amber-400" : "text-red-400"}`}>
              {c.verdict}
            </span>
            <span className="text-zinc-300 text-xs font-bold">{c.principle}</span>
          </div>
          <div className="text-zinc-400 text-xs mb-1">{c.rationale}</div>
          <div className="text-zinc-600 text-xs font-mono">{c.evidence}</div>
        </div>
      ))}
    </div>
  );
}