export default function RuntimeArchitecturePanel({ runtimeInfo }) {
  if (!runtimeInfo?.archRules) return null;
  const principles = ["DIP","SRP","ISP","OCP","Immutability","Encapsulation"];
  return (
    <div className="border border-emerald-700 rounded-lg p-4 bg-emerald-950/10 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-emerald-400 tracking-widest">ARCHITECTURE CERTIFICATION — SOLID VALIDATION</div>
        <span className={`font-bold text-lg ${runtimeInfo.archCertified ? "text-emerald-400" : "text-red-400"}`}>
          {runtimeInfo.archScore}/100 {runtimeInfo.archCertified ? "✓ CERTIFIED" : "✗ FAILED"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {principles.map(principle => {
          const pRules  = runtimeInfo.archRules.filter(r => r.principle === principle);
          const pPassed = pRules.filter(r => r.passed).length;
          return (
            <div key={principle} className={`border rounded p-2 text-center ${pPassed === pRules.length ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
              <div className={`font-bold ${pPassed === pRules.length ? "text-emerald-300" : "text-red-300"}`}>{principle}</div>
              <div className="text-zinc-400">{pPassed}/{pRules.length}</div>
            </div>
          );
        })}
      </div>
      <div className="border border-zinc-800 rounded overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-zinc-800/60">
            {runtimeInfo.archRules.map((r, i) => (
              <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                <td className="p-1.5 pl-3 text-zinc-500 font-mono w-20">{r.id}</td>
                <td className="p-1.5 text-zinc-300">{r.description}</td>
                <td className="p-1.5 pr-3 text-center">{r.passed ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}