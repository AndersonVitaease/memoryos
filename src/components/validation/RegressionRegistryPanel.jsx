export default function RegressionRegistryPanel({ entries, permanent }) {
  if (!entries || entries.length === 0) {
    return <div className="text-zinc-600 text-sm text-center py-6">Run validation to populate the regression registry.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-zinc-400 text-xs tracking-widest mb-2">
        PERMANENT SUITE — {permanent?.length ?? 0} scenarios locked
      </div>
      {entries.map(e => (
        <div key={e.scenarioId} className="border border-zinc-800 rounded-lg px-4 py-2.5 bg-zinc-900 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.currentStatus === "PASSING" ? "bg-emerald-400" : e.currentStatus === "FAILING" ? "bg-red-400" : "bg-zinc-600"}`} />
            <span className="text-zinc-400 font-mono text-xs">{e.scenarioId}</span>
            <span className="text-zinc-200 text-sm">{e.scenarioName}</span>
            {e.firstPassedAt > 0 && (
              <span className="text-zinc-500 text-xs">First passed: {new Date(e.firstPassedAt).toLocaleTimeString()}</span>
            )}
          </div>
          <div className="flex gap-4 text-xs font-mono">
            <span className="text-zinc-500">Runs: <span className="text-zinc-300">{e.totalRuns}</span></span>
            <span className="text-zinc-500">Passed: <span className="text-emerald-400">{e.totalPassed}</span></span>
            <span className="text-zinc-500">Rate: <span className={e.successRate >= 1 ? "text-emerald-400" : "text-amber-400"}>{(e.successRate * 100).toFixed(0)}%</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}