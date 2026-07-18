// FailuresTab.jsx — Sprint EF-39.6 — SRP: renders test failures only
import React from "react";

export default function FailuresTab({ report }) {
  const { failures } = report;
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
        FAILURES — {failures.length}
      </div>
      {failures.length === 0
        ? <div className="p-8 text-center text-emerald-400 font-bold">✓ Zero test failures</div>
        : failures.map(r => (
          <div key={r.id} className="px-4 py-4 border-b border-zinc-800 bg-red-950/10 last:border-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border border-red-700 bg-red-950/30 text-red-400">FAIL</span>
              <span className="text-zinc-400 text-xs">{r.suite}</span>
              <span className="text-zinc-300 text-xs font-bold">{r.name}</span>
              <span className="text-zinc-600 text-xs ml-auto">{r.durationMs}ms</span>
            </div>
            <pre className="text-red-300 text-xs bg-red-950/20 rounded p-3 whitespace-pre-wrap overflow-x-auto">{r.error}</pre>
          </div>
        ))
      }
    </div>
  );
}