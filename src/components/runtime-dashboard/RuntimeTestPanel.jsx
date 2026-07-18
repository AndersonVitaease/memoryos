function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

export default function RuntimeTestPanel({ report, label, color }) {
  if (!report) return null;
  const borderCls = color ?? "border-violet-700 text-violet-300";
  return (
    <div className="space-y-1">
      <div className={`text-xs tracking-widest px-1 ${color ? color.split(" ")[1] : "text-violet-400"}`}>{label}</div>
      {[...new Set(report.results.map(r => r.suite))].map(suite => {
        const rows = report.results.filter(r => r.suite === suite);
        const sp   = rows.filter(r => r.passed).length;
        return (
          <div key={suite} className="space-y-0.5">
            <div className={`border rounded-lg px-4 py-2 flex justify-between bg-zinc-900 ${borderCls}`}>
              <span className="font-bold text-sm">{suite}</span>
              <span className="text-xs font-mono">{sp}/{rows.length}</span>
            </div>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-zinc-800/60">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                      <td className="p-2 pl-3 text-zinc-300 w-96">{r.name}</td>
                      <td className="p-2 text-zinc-500 truncate max-w-xs" title={r.detail}>{r.detail}</td>
                      <td className="p-2 pr-3 text-center"><Badge ok={r.passed} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.filter(r => !r.passed).map((r, i) => (
                <div key={i} className="border-t border-red-800 bg-red-950/10 px-3 py-1.5 text-red-300 text-xs">
                  ✗ [{r.name}] {r.error}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}