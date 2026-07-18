export default function ValidationSummaryBar({ suite }) {
  if (!suite) return null;
  const pct = (suite.successRate * 100).toFixed(1);
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label: "Total",       value: suite.total,                       color: "text-zinc-300" },
        { label: "Passed",      value: suite.passed,                      color: "text-emerald-400" },
        { label: "Failed",      value: suite.failed,                      color: "text-red-400" },
        { label: "Partial",     value: suite.partial,                     color: "text-amber-400" },
        { label: "Success Rate",value: `${pct}%`,                         color: suite.certified ? "text-emerald-400" : "text-amber-400" },
      ].map(({ label, value, color }) => (
        <div key={label} className="border border-zinc-700 rounded-lg p-3 bg-zinc-900 text-center">
          <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
          <div className="text-zinc-500 text-xs mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}