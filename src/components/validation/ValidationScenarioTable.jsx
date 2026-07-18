const STATUS_COLORS = {
  PASSED:  "text-emerald-400 bg-emerald-950/40 border-emerald-800",
  FAILED:  "text-red-400 bg-red-950/40 border-red-800",
  PARTIAL: "text-amber-400 bg-amber-950/40 border-amber-800",
  RUNNING: "text-sky-400 bg-sky-950/40 border-sky-800",
  PENDING: "text-zinc-400 bg-zinc-900 border-zinc-700",
};

const CAT_COLORS = {
  simple:         "bg-zinc-800 text-zinc-300",
  memory:         "bg-violet-950 text-violet-300",
  planning:       "bg-sky-950 text-sky-300",
  execution:      "bg-emerald-950 text-emerald-300",
  explainability: "bg-amber-950 text-amber-300",
  context:        "bg-indigo-950 text-indigo-300",
  failure:        "bg-red-950 text-red-300",
  partial:        "bg-orange-950 text-orange-300",
};

export default function ValidationScenarioTable({ results, runningId }) {
  if (!results || results.length === 0) {
    return <div className="text-zinc-600 text-sm text-center py-8">No results yet — run validation to see results.</div>;
  }
  return (
    <div className="space-y-2">
      {results.map(r => {
        const status = runningId === r.scenarioId ? "RUNNING" : r.status;
        const colors = STATUS_COLORS[status] ?? STATUS_COLORS.PENDING;
        return (
          <div key={r.scenarioId} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-mono text-xs">{r.scenarioId}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${CAT_COLORS[r.category] ?? "bg-zinc-800 text-zinc-400"}`}>{r.category}</span>
                <span className="text-sm font-semibold text-zinc-200">{r.scenarioName}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${colors}`}>{status}</span>
            </div>

            {r.failures && r.failures.length > 0 && (
              <div className="text-xs text-red-400 bg-red-950/20 rounded px-2 py-1 space-y-0.5">
                {r.failures.map((f, i) => <div key={i}>✗ {f}</div>)}
              </div>
            )}

            {r.metrics && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                {[
                  { k: "Duration",   v: `${r.metrics.totalDurationMs}ms` },
                  { k: "Stages",     v: `${r.metrics.stagesPassed}/${r.metrics.stagesTotal}` },
                  { k: "Confidence", v: `${(r.metrics.confidence * 100).toFixed(0)}%` },
                  { k: "Memory",     v: r.metrics.memoryUsed ? "Yes" : "No" },
                  { k: "Compliance", v: r.metrics.complianceStatus ?? "—" },
                  { k: "Errors",     v: r.metrics.errorCount },
                ].map(({ k, v }) => (
                  <div key={k} className="border border-zinc-800 rounded px-2 py-1 bg-zinc-950">
                    <div className="text-zinc-500">{k}</div>
                    <div className="text-zinc-300 font-mono font-semibold">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}