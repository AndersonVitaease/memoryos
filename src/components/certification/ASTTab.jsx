// ASTTab.jsx — Sprint EF-39.6 — SRP: renders AST analysis only
import React from "react";

export default function ASTTab({ report }) {
  const { astReport } = report;

  return (
    <div className="space-y-3">
      <div className="border border-zinc-700 rounded-xl bg-zinc-900">
        <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
          AST ANALYSIS — {astReport.files.length} files · {astReport.durationMs}ms
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {["File","Lines","Classes","Methods","Imports","Fan-Out"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-zinc-500 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {astReport.files.map((f, i) => (
                <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                  <td className="px-3 py-2 text-violet-400">{f.file}</td>
                  <td className="px-3 py-2 text-zinc-300">{f.lineCount}</td>
                  <td className="px-3 py-2 text-sky-400">{f.classes.length}</td>
                  <td className="px-3 py-2 text-emerald-400">{f.functions.length}</td>
                  <td className="px-3 py-2 text-zinc-400">{f.imports.length}</td>
                  <td className="px-3 py-2 text-amber-400">{f.fanOut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
        <div className="text-zinc-500 tracking-widest mb-3">TOP COMPLEX METHODS (Cyclomatic Complexity)</div>
        {astReport.topComplex.map((fn, i) => (
          <div key={i} className="flex gap-2 py-1 border-b border-zinc-800/30 last:border-0">
            <span className={`w-6 text-right font-mono font-bold ${fn.cyclomaticScore > 10 ? "text-red-400" : fn.cyclomaticScore > 5 ? "text-amber-400" : "text-emerald-400"}`}>
              {fn.cyclomaticScore}
            </span>
            <span className="text-violet-400 w-40 shrink-0">{fn.name}</span>
            <span className="text-zinc-500 flex-1">{fn.file}</span>
            <span className="text-zinc-600">L{fn.line} · {fn.linesOfCode}loc · {fn.paramCount}p</span>
          </div>
        ))}
      </div>
    </div>
  );
}