// TimingTab.jsx — Sprint EF-39.6 — SRP: renders test timing (sorted) only
import React from "react";

export default function TimingTab({ report }) {
  const sorted = [...report.testResult.results].sort((a, b) => b.durationMs - a.durationMs);
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
        ALL TESTS — sorted by duration desc
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {sorted.map(r => (
          <div key={r.id ?? r.name} className={`flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
            <span className={`text-xs font-mono w-14 shrink-0 text-right ${r.durationMs > 1000 ? "text-amber-400" : r.durationMs > 100 ? "text-sky-400" : "text-zinc-500"}`}>
              {r.durationMs}ms
            </span>
            <span className="text-zinc-500 text-xs w-24 shrink-0">{r.suite}</span>
            <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
            <span className={`text-xs font-bold ${r.passed ? "text-emerald-400" : "text-red-400"}`}>
              {r.passed ? "PASS" : "FAIL"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}