export default function RuntimeMetrics({ runtimeInfo }) {
  if (!runtimeInfo) return null;
  const metrics = [
    ["Runtime",       runtimeInfo.runtimeId,     "text-violet-300"],
    ["Environment",   runtimeInfo.currentEnv,    "text-cyan-300"],
    ["Priority",      runtimeInfo.priority,      "text-blue-300"],
    ["Score",         `${(runtimeInfo.score?.confidence * 100 ?? 0).toFixed(0)}%`, "text-emerald-400"],
    ["Available",     runtimeInfo.isAvailable ? "✓ YES" : "✗ NO", runtimeInfo.isAvailable ? "text-emerald-400" : "text-red-400"],
    ["Cache Hits",    runtimeInfo.cacheHits,     "text-emerald-300"],
    ["Cache Misses",  runtimeInfo.cacheMisses,   "text-orange-300"],
    ["Avg Select ms", `${runtimeInfo.avgSelectionMs}ms`, "text-zinc-300"],
    ["Resolutions",   runtimeInfo.resolutionCount, "text-zinc-300"],
    ["Refreshes",     runtimeInfo.refreshCount,  "text-zinc-300"],
    ["Loader",        runtimeInfo.loaderName,    "text-blue-300"],
    ["Confidence",    `${(runtimeInfo.confidence * 100).toFixed(0)}%`, "text-teal-300"],
  ];
  return (
    <div className="border border-violet-700 rounded-lg p-4 bg-violet-950/10 text-xs space-y-3">
      <div className="text-violet-400 tracking-widest">ACTIVE RUNTIME PROVIDER</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {metrics.map(([label, value, cls]) => (
          <div key={label} className="border border-zinc-700 rounded p-2 bg-zinc-900 text-center">
            <div className="text-zinc-500 text-xs">{label}</div>
            <div className={`font-bold ${cls}`}>{value}</div>
          </div>
        ))}
      </div>
      {runtimeInfo.score && (
        <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
          <div className="text-zinc-500 mb-1">Score Breakdown</div>
          <div className="flex gap-4 text-xs">
            <span>Priority: <span className="text-violet-300">{runtimeInfo.score.priorityScore?.toFixed(3)}</span></span>
            <span>Available: <span className="text-emerald-300">{runtimeInfo.score.availabilityScore?.toFixed(3)}</span></span>
            <span>Env: <span className="text-blue-300">{runtimeInfo.score.environmentScore?.toFixed(3)}</span></span>
            <span className="font-bold">Total: <span className="text-white">{runtimeInfo.score.totalScore?.toFixed(3)}</span></span>
          </div>
        </div>
      )}
      {runtimeInfo.reason && (
        <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
          <div className="text-zinc-500 mb-1">Selection Reason</div>
          <div className="text-zinc-300 text-xs">{runtimeInfo.reason.summary}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {runtimeInfo.reason.reasons?.map((r, i) => (
              <span key={i} className="border border-zinc-700 text-zinc-400 rounded px-1.5 py-0.5 text-xs">{r}</span>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {[["Discovery", runtimeInfo.discoveryId, "text-cyan-300"], ["Loader", runtimeInfo.loaderId, "text-blue-300"], ["Registered", `${runtimeInfo.registrySize} providers`, "text-zinc-300"]].map(([k,v,c]) => (
          <div key={k} className="border border-zinc-700 rounded p-2 bg-zinc-900">
            <div className="text-zinc-500 text-xs">{k}</div>
            <div className={`font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      {runtimeInfo.allScores && (
        <div className="border border-zinc-800 rounded overflow-hidden">
          <div className="bg-zinc-900 px-3 py-1 text-zinc-500 text-xs">ALL PROVIDERS (by score)</div>
          {runtimeInfo.allScores.map((s, i) => (
            <div key={s.runtimeId} className={`flex items-center justify-between px-3 py-1.5 text-xs ${i === 0 ? "bg-violet-950/20" : ""} border-t border-zinc-800`}>
              <span className={i === 0 ? "text-violet-300 font-bold" : "text-zinc-400"}>{s.runtimeId} {i === 0 ? "← selected" : ""}</span>
              <span className="text-zinc-500">p={s.priority} · avail={s.isAvailable ? "✓" : "✗"} · score={s.totalScore?.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}