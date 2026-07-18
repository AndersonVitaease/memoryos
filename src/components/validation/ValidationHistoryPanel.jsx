import { useState } from "react";

export default function ValidationHistoryPanel({ history }) {
  const [selected, setSelected] = useState(null);

  if (!history || history.length === 0) {
    return <div className="text-zinc-600 text-sm text-center py-4">No previous runs recorded in this session.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-zinc-400 text-xs tracking-widest mb-2">RUN HISTORY ({history.length} runs)</div>
      {[...history].reverse().map((suite, i) => {
        const isSelected = selected === suite.suiteId;
        return (
          <div key={suite.suiteId} className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setSelected(isSelected ? null : suite.suiteId)}
              className="w-full flex items-center justify-between px-4 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
            >
              <span className="text-xs font-mono text-zinc-400">
                Run #{history.length - i} — {new Date(suite.runAt).toLocaleTimeString()}
              </span>
              <span className="flex gap-3 text-xs font-mono">
                <span className="text-emerald-400">{suite.passed}✓</span>
                <span className="text-red-400">{suite.failed}✗</span>
                <span className={suite.certified ? "text-emerald-300 font-bold" : "text-amber-300"}>
                  {(suite.successRate * 100).toFixed(0)}%
                </span>
                <span className="text-zinc-500">{suite.durationMs}ms</span>
              </span>
            </button>
            {isSelected && (
              <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950 space-y-1">
                {suite.results.map(r => (
                  <div key={r.scenarioId} className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-400">{r.scenarioId} — {r.scenarioName}</span>
                    <span className={r.passed ? "text-emerald-400" : "text-red-400"}>{r.passed ? "PASS" : "FAIL"}</span>
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