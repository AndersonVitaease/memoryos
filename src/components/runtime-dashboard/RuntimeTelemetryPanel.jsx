export default function RuntimeTelemetryPanel({ runtimeInfo }) {
  if (!runtimeInfo?.telSnap) return null;
  const t = runtimeInfo.telSnap;
  return (
    <div className="border border-teal-700 rounded-lg p-4 bg-teal-950/10 text-xs space-y-2">
      <div className="text-teal-400 tracking-widest">RUNTIME TELEMETRY — SRP ISOLATED</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Cache Hits",     t.cacheHits,       "text-emerald-300"],
          ["Cache Misses",   t.cacheMisses,     "text-orange-300"],
          ["Resolutions",    t.resolutionCount, "text-zinc-300"],
          ["Refreshes",      t.refreshCount,    "text-zinc-300"],
          ["Avg Select ms",  `${t.avgSelectionMs}ms`, "text-blue-300"],
          ["Total ms",       `${t.totalSelectionMs}ms`, "text-zinc-400"],
          ["Last Resolution", t.lastResolutionAt ? new Date(t.lastResolutionAt).toLocaleTimeString() : "—", "text-violet-300"],
          ["Snapshot At",    new Date(t.snapshotAt).toLocaleTimeString(), "text-zinc-400"],
        ].map(([k,v,c]) => (
          <div key={k} className="border border-zinc-700 rounded p-2 bg-zinc-900 text-center">
            <div className="text-zinc-500">{k}</div>
            <div className={`font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}