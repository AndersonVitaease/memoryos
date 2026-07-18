// PerformanceTab.jsx — Sprint EF-39.6 — SRP: renders performance benchmarks only
import React from "react";

export default function PerformanceTab({ report }) {
  const { performance } = report.auditReport;

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
        PERFORMANCE — {performance.benchmarks[0]?.iterations} iterations · warm-up enabled · performance.now() · {performance.durationMs}ms
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              {["Operation","Avg","Min","Max","Median","p95","p99","StdDev","Ops/s"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-zinc-500 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {performance.benchmarks.map((b, i) => (
              <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                <td className="px-3 py-2 text-violet-400 font-bold">{b.operation}</td>
                <td className="px-3 py-2 text-sky-400">{b.avgMs}</td>
                <td className="px-3 py-2 text-emerald-400">{b.minMs}</td>
                <td className="px-3 py-2 text-amber-400">{b.maxMs}</td>
                <td className="px-3 py-2 text-zinc-300">{b.medianMs}</td>
                <td className="px-3 py-2 text-orange-400">{b.p95Ms}</td>
                <td className="px-3 py-2 text-red-400">{b.p99Ms}</td>
                <td className="px-3 py-2 text-zinc-500">{b.stdDev}</td>
                <td className="px-3 py-2 text-zinc-300">{b.opsPerSec.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}