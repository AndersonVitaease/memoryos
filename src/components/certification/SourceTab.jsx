// SourceTab.jsx — Sprint EF-39.6 — SRP: renders source audit results only
import React from "react";

function SevBadge({ sev }) {
  const cls =
    sev === "critical" ? "border-red-700 bg-red-950/40 text-red-400" :
    sev === "error"    ? "border-orange-700 bg-orange-950/30 text-orange-400" :
    sev === "warning"  ? "border-amber-700 bg-amber-950/20 text-amber-400" :
                         "border-zinc-700 bg-zinc-800 text-zinc-400";
  return <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${cls}`}>{sev}</span>;
}

function Badge({ label }) {
  return <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400">{label}</span>;
}

export default function SourceTab({ report }) {
  const { sourceReport } = report;

  return (
    <div className="space-y-3">
      <div className="border border-zinc-700 rounded-xl bg-zinc-900">
        <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
          RULE-BASED SOURCE ANALYSIS — {sourceReport.files} files · {sourceReport.totalLines} lines · {sourceReport.durationMs}ms
        </div>
        {sourceReport.findings.length === 0
          ? <div className="p-6 text-center text-emerald-400 font-bold">✓ Zero findings — Source is clean</div>
          : sourceReport.findings.map((f, i) => (
            <div key={i} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
              <div className="flex items-center gap-2 mb-1">
                <SevBadge sev={f.severity} />
                <Badge label={f.rule} />
                <span className="text-zinc-400 text-xs">{f.file}:{f.line}:{f.column}</span>
              </div>
              <div className="text-zinc-400 text-xs mb-1">{f.description}</div>
              <pre className="text-zinc-500 text-xs bg-zinc-800 rounded px-2 py-1 overflow-x-auto">{f.snippet}</pre>
            </div>
          ))
        }
      </div>

      <div className="border border-zinc-700 rounded-xl bg-zinc-900">
        <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">FILE METRICS</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {["File","Total","Code","Comments","Blank","Functions","Classes"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-zinc-500 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sourceReport.fileMetrics.map((m, i) => (
                <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                  <td className="px-3 py-2 text-violet-400">{m.file}</td>
                  <td className="px-3 py-2 text-zinc-300">{m.lines}</td>
                  <td className="px-3 py-2 text-sky-400">{m.codeLines}</td>
                  <td className="px-3 py-2 text-zinc-500">{m.commentLines}</td>
                  <td className="px-3 py-2 text-zinc-600">{m.blankLines}</td>
                  <td className="px-3 py-2 text-emerald-400">{m.functions}</td>
                  <td className="px-3 py-2 text-amber-400">{m.classes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}