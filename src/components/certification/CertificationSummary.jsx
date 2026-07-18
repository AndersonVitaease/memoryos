// CertificationSummary.jsx — Sprint EF-39.6 — SRP: certification banner + score breakdown
import React from "react";

function GradeTag({ grade }) {
  const cls =
    grade === "A+" ? "text-emerald-300 border-emerald-500" :
    grade === "A"  ? "text-emerald-400 border-emerald-600" :
    grade === "B"  ? "text-sky-400 border-sky-600" :
    grade === "C"  ? "text-amber-400 border-amber-600" :
    grade === "D"  ? "text-orange-400 border-orange-600" :
                     "text-red-400 border-red-600";
  return <span className={`text-4xl font-bold font-mono border-2 px-4 py-1 rounded-xl ${cls}`}>{grade}</span>;
}

function MetCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color ?? "text-zinc-200"}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

export default function CertificationSummary({ report }) {
  const { certified, archScore, executedAt, totalMs, failedGates, suiteMap } = report;

  return (
    <div className="space-y-3">
      {/* Banner */}
      <div className={`border-2 rounded-xl p-6 ${certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className={`text-2xl font-bold mb-1 ${certified ? "text-emerald-400" : "text-red-400"}`}>
              {certified
                ? "✓ CERTIFIED — EF-39 / EF-39.1 / EF-39.2 / EF-39.4 / EF-39.5 / EF-39.6"
                : "✗ CERTIFICATION FAILED"}
            </div>
            <div className="text-zinc-400 text-sm">{executedAt} · {totalMs}ms</div>
            {!certified && failedGates.map((g, i) => (
              <div key={i} className="text-red-400 text-xs mt-0.5">✗ {g}</div>
            ))}
          </div>
          <div className="text-center">
            <GradeTag grade={archScore.grade} />
            <div className="text-zinc-500 text-xs mt-1">Architecture Score: {archScore.score}/100</div>
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      {archScore.breakdown && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {Object.entries(archScore.breakdown).map(([k, v]) => (
            <MetCard
              key={k} label={k} value={v + "%"}
              color={v === 100 ? "text-emerald-400" : v >= 80 ? "text-sky-400" : v >= 60 ? "text-amber-400" : "text-red-400"}
            />
          ))}
        </div>
      )}

      {/* Suite overview */}
      <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
        <div className="text-zinc-500 tracking-widest mb-3">SUITES OVERVIEW</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(suiteMap).map(([suite, rows]) => {
            const p = rows.filter(r => r.passed).length;
            return (
              <div key={suite} className="border border-zinc-800 rounded p-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${p === rows.length ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="text-zinc-300 text-xs flex-1">{suite}</span>
                <span className={`text-xs font-mono font-bold ${p === rows.length ? "text-emerald-400" : "text-red-400"}`}>{p}/{rows.length}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}