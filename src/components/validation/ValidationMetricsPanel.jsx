import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function ValidationMetricsPanel({ suite }) {
  if (!suite) return null;

  const durationData = suite.results.map(r => ({
    name:  r.scenarioId,
    ms:    r.metrics?.totalDurationMs ?? 0,
    passed: r.passed,
  }));

  const confData = suite.results.map(r => ({
    name:  r.scenarioId,
    conf:  +((r.metrics?.confidence ?? 0) * 100).toFixed(1),
    passed: r.passed,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
        <div className="text-zinc-400 text-xs tracking-widest mb-3">DURATION PER SCENARIO (ms)</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={durationData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} />
            <YAxis tick={{ fill: "#71717a", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", color: "#e4e4e7" }} />
            <Bar dataKey="ms" radius={[3, 3, 0, 0]}>
              {durationData.map((d, i) => (
                <Cell key={i} fill={d.passed ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
        <div className="text-zinc-400 text-xs tracking-widest mb-3">CONFIDENCE SCORE (%)</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={confData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", color: "#e4e4e7" }} />
            <Bar dataKey="conf" radius={[3, 3, 0, 0]}>
              {confData.map((d, i) => (
                <Cell key={i} fill={d.passed ? "#8b5cf6" : "#f59e0b"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}