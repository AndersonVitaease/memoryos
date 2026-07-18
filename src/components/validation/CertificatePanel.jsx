export default function CertificatePanel({ cert }) {
  if (!cert) return null;

  const pct = v => `${(v * 100).toFixed(1)}%`;

  return (
    <div className={`border-2 rounded-xl p-6 ${cert.certified ? "border-emerald-500 bg-emerald-950/10" : "border-amber-600 bg-amber-950/10"}`}>
      <div className={`text-2xl font-bold mb-1 ${cert.certified ? "text-emerald-400" : "text-amber-400"}`}>
        {cert.certified ? "✓ PRODUCT VALIDATION CERTIFIED" : "⚠ PRODUCT VALIDATION INCOMPLETE"}
      </div>
      <div className="text-zinc-400 text-xs mb-4 font-mono">{cert.certId} · {new Date(cert.issuedAt).toLocaleString()}</div>
      <div className="text-zinc-300 text-sm mb-4">{cert.summary}</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Coverage",    value: pct(cert.scenarioCoverage.rate)  },
          { label: "Avg Conf",    value: pct(cert.avgConfidence)           },
          { label: "Avg Duration",value: `${cert.avgDurationMs.toFixed(0)}ms` },
          { label: "Permanent",   value: cert.permanentSuite.length        },
        ].map(({ label, value }) => (
          <div key={label} className="border border-zinc-700 rounded-lg p-3 bg-zinc-900 text-center">
            <div className="text-lg font-bold font-mono text-zinc-200">{value}</div>
            <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      <div className="text-zinc-400 text-xs tracking-widest mb-2">CATEGORY COVERAGE</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {cert.categoryCoverage.map(c => (
          <div key={c.category} className="border border-zinc-700 rounded px-3 py-1.5 bg-zinc-900 text-xs">
            <span className="text-zinc-400 capitalize">{c.category}</span>
            <span className={`ml-2 font-bold font-mono ${c.passed === c.total ? "text-emerald-400" : "text-amber-400"}`}>
              {c.passed}/{c.total}
            </span>
          </div>
        ))}
      </div>

      {/* Consistency audit */}
      <div className="text-zinc-400 text-xs tracking-widest mb-2">METRICS CONSISTENCY</div>
      <div className={`rounded px-3 py-2 text-xs font-mono mb-4 ${cert.consistencyAudit.consistent ? "bg-emerald-950/30 text-emerald-300 border border-emerald-800" : "bg-red-950/30 text-red-300 border border-red-800"}`}>
        {cert.consistencyAudit.consistent
          ? `✓ All ${cert.consistencyAudit.totalChecked} scenarios consistent — Report / Snapshot / Metrics aligned`
          : `✗ ${cert.consistencyAudit.violations.length} violation(s) found:`}
        {!cert.consistencyAudit.consistent && cert.consistencyAudit.violations.map((v, i) => (
          <div key={i} className="mt-1 pl-2">{v.message}</div>
        ))}
      </div>

      {/* Regressions */}
      {cert.regressions.length > 0 && (
        <div className="border border-red-700 bg-red-950/20 rounded p-3 text-xs space-y-1">
          <div className="text-red-400 font-bold mb-1">REGRESSIONS DETECTED</div>
          {cert.regressions.map((r, i) => <div key={i} className="text-red-300">{r}</div>)}
        </div>
      )}
    </div>
  );
}