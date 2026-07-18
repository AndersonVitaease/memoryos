// DependenciesTab.jsx — Sprint EF-39.6 — SRP: renders dependency graph only
import React from "react";

function MetCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color ?? "text-zinc-200"}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

export default function DependenciesTab({ report }) {
  const { dependencies } = report.astReport;

  return (
    <div className="space-y-3">
      <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
        <div className="text-zinc-500 tracking-widest mb-3">DEPENDENCY ANALYSIS</div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <MetCard label="Total edges"    value={dependencies.edges.length}           color="text-zinc-300" />
          <MetCard label="Circular pairs" value={dependencies.circularPairs.length}   color={dependencies.hasCircular ? "text-red-400" : "text-emerald-400"} />
          <MetCard label="High coupling"  value={dependencies.highCouplingFiles.length} color={dependencies.highCouplingFiles.length > 0 ? "text-amber-400" : "text-emerald-400"} />
        </div>

        {dependencies.circularPairs.length > 0 && (
          <div className="border border-red-700 rounded bg-red-950/20 p-3 mb-3">
            <div className="text-red-400 font-bold mb-1">CIRCULAR DEPENDENCIES DETECTED</div>
            {dependencies.circularPairs.map((p, i) => (
              <div key={i} className="text-red-300 text-xs">{p}</div>
            ))}
          </div>
        )}

        <div className="text-zinc-500 mb-2">Fan-In (times imported)</div>
        {Object.entries(dependencies.fanInMap)
          .sort(([, a], [, b]) => b - a)
          .map(([mod, count]) => (
            <div key={mod} className="flex gap-2 py-0.5">
              <span className="text-sky-400 w-8 text-right font-mono">{count}</span>
              <span className="text-zinc-400">{mod}</span>
            </div>
          ))}
      </div>

      <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
        <div className="text-zinc-500 tracking-widest mb-2">DEPENDENCY EDGES</div>
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {dependencies.edges.map((e, i) => (
            <div key={i} className="flex gap-2 text-xs text-zinc-500">
              <span className="text-violet-400">{e.from}</span>
              <span>→</span>
              <span className="text-sky-400">{e.to}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}