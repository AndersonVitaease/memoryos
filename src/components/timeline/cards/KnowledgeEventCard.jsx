/**
 * KnowledgeEventCard.jsx — card rico para SystemEvent type=knowledge_ingested
 */

import React from "react";
import { BookCheck, Mail } from "lucide-react";
import EventShell from "../EventShell";

export default function KnowledgeEventCard({ event, time }) {
  const p = event.payload || {};
  const stats = p.stats || {};
  const chips = [];
  if (stats.entities) chips.push(`${stats.entities} entidades`);
  if (stats.keywords) chips.push(`${stats.keywords} palavras-chave`);
  if (stats.decisions) chips.push(`${stats.decisions} decisões`);
  if (stats.tasks) chips.push(`${stats.tasks} tarefas`);
  if (stats.topics) chips.push(`${stats.topics} assuntos`);

  return (
    <EventShell icon={BookCheck} type="Conhecimento ingerido" status={event.status} source={event.source} time={time} accent="text-emerald-500">
      <div className="text-sm text-zinc-700">
        <div className="font-medium text-zinc-800">{p.displayName || "Item"}</div>
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">{c}</span>
            ))}
          </div>
        )}
      </div>
      {p.emailSent?.to && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600">
          <Mail className="w-3 h-3" />
          Email enviado para {p.emailSent.to}
        </div>
      )}
    </EventShell>
  );
}