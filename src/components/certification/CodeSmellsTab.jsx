// CodeSmellsTab.jsx — Sprint EF-39.6 — SRP: renders code smells only
import React from "react";

export default function CodeSmellsTab({ report }) {
  const { codeSmells } = report.astReport;
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
        CODE SMELLS — {codeSmells.length} detected
      </div>
      {codeSmells.length === 0
        ? <div className="p-6 text-center text-emerald-400 font-bold">✓ Zero code smells detected</div>
        : codeSmells.map((s, i) => (
          <div key={i} className="px-4 py-2 border-b border-zinc-800/40 last:border-0 flex gap-2 text-xs">
            <span className="text-amber-400 shrink-0">⚠</span>
            <span className="text-zinc-300">{s}</span>
          </div>
        ))
      }
    </div>
  );
}