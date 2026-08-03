/**
 * TimelineEventRenderer.jsx — Fase 2 (preparação para Fase 4)
 *
 * Render polimórfico para itens de SystemEvent na timeline.
 * Versão atual: card cinza genérico (placeholder discreto).
 * Versão Fase 4: switch por event.type → cards ricos (EmailCard, WatchCard).
 *
 * NÃO integra ao ChatPage ainda — fica disponível para o switcher
 * "Conversação"/"Linha do Tempo" da Fase 4.
 */

import React from "react";
import { Activity } from "lucide-react";

const STATUS_COLORS = {
  success: "bg-emerald-50 text-emerald-600 border-emerald-100",
  failure: "bg-red-50 text-red-600 border-red-100",
  running: "bg-amber-50 text-amber-600 border-amber-100",
  pending: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

export default function TimelineEventRenderer({ event }) {
  const statusColor = STATUS_COLORS[event.status] || STATUS_COLORS.pending;
  const time = event.created_date
    ? new Date(event.created_date).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-zinc-50 border border-zinc-200 text-zinc-500 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <Activity className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-600">{event.type}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor}`}>
            {event.status || "info"}
          </span>
          <span className="text-[10px] text-zinc-400 ml-auto">{event.source}</span>
        </div>
        {event.payload && Object.keys(event.payload).length > 0 && (
          <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap break-words bg-white/50 rounded px-2 py-1 border border-zinc-100">
            {JSON.stringify(event.payload, null, 0).slice(0, 280)}
          </pre>
        )}
        {time && <div className="text-[10px] text-zinc-400 mt-1">{time}</div>}
      </div>
    </div>
  );
}