// ImmutabilityTab.jsx — Sprint EF-39.6 — SRP: renders immutability checks only
import React from "react";

function CheckRow({ ok, label, detail }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0 ${!ok ? "bg-red-950/10" : ""}`}>
      <span className={`shrink-0 font-bold text-xs mt-0.5 ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
      <span className="text-zinc-300 text-xs flex-1">{label}</span>
      {detail && <span className="text-zinc-600 text-xs shrink-0 ml-2 max-w-xs truncate font-mono" title={detail}>{detail}</span>}
    </div>
  );
}

export default function ImmutabilityTab({ report }) {
  const { immutability } = report.auditReport;
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
        IMMUTABILITY — Object.isFrozen() on all public types · {immutability.passed}/{immutability.passed + immutability.failed} · {immutability.durationMs}ms
      </div>
      {immutability.checks.map((c, i) => <CheckRow key={i} ok={c.ok} label={c.check} detail={c.detail} />)}
    </div>
  );
}