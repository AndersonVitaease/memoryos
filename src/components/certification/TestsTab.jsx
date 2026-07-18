// TestsTab.jsx — Sprint EF-39.6 — SRP: renders test suites only
import React, { useState } from "react";

function SuiteBlock({ suite, rows }) {
  const passed = rows.filter(r => r.passed).length;
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-left">
        <span className={`w-2 h-2 rounded-full shrink-0 ${passed === rows.length ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="text-zinc-300 text-xs font-bold flex-1">{suite}</span>
        <span className={`text-xs font-mono font-bold ${passed === rows.length ? "text-emerald-400" : "text-red-400"}`}>{passed}/{rows.length}</span>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="divide-y divide-zinc-800/60">
          {rows.map(r => (
            <div key={r.id ?? r.name} className={`flex items-start gap-3 px-4 py-2 text-xs ${!r.passed ? "bg-red-950/10" : ""}`}>
              <span className={`mt-0.5 shrink-0 ${r.passed ? "text-emerald-400" : "text-red-400"}`}>{r.passed ? "✓" : "✗"}</span>
              <span className="text-zinc-300 flex-1">{r.name}</span>
              <span className="text-zinc-600 font-mono shrink-0">{r.durationMs}ms</span>
              {!r.passed && <span className="text-red-300 text-xs max-w-xs truncate">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TestsTab({ report }) {
  return (
    <div className="space-y-2">
      {Object.entries(report.suiteMap).map(([suite, rows]) => (
        <SuiteBlock key={suite} suite={suite} rows={rows} />
      ))}
    </div>
  );
}