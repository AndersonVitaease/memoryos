/**
 * EventShell.jsx — Fase 4
 * Shell compartilhado dos cards de SystemEvent na timeline.
 * Cabeçalho uniforme: icone + label + badge de status + source + hora.
 */

import React from "react";

const STATUS_COLORS = {
  success: "bg-emerald-50 text-emerald-600 border-emerald-100",
  failure: "bg-red-50 text-red-600 border-red-100",
  running: "bg-amber-50 text-amber-600 border-amber-100",
  pending: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

export default function EventShell({ icon: Icon, type, status, source, time, accent = "text-zinc-400", children }) {
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-zinc-50 border border-zinc-200 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-4 h-4 ${accent} shrink-0`} />
          <span className="text-xs font-semibold text-zinc-700">{type}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor}`}>
            {status || "info"}
          </span>
          <span className="text-[10px] text-zinc-400 ml-auto">{source}</span>
        </div>
        {children}
        {time && <div className="text-[10px] text-zinc-400 mt-1.5">{time}</div>}
      </div>
    </div>
  );
}