/**
 * TimelineEventRenderer.jsx — Fase 4
 *
 * Render polimorfico para itens de SystemEvent na timeline.
 * Dispatcher por event.type → card rico especializado.
 * Fallback generico (EventShell + snippet do payload) para tipos nao mapeados.
 */

import React from "react";
import { Activity } from "lucide-react";
import EventShell from "./EventShell";
import WatchEventCard from "./cards/WatchEventCard";
import KnowledgeEventCard from "./cards/KnowledgeEventCard";
import ConnectorEventCard from "./cards/ConnectorEventCard";
import CognitiveEventCard from "./cards/CognitiveEventCard";

function formatTime(iso) {
  if (!iso) return "";
  // O SDK retorna created_date sem indicador de fuso (ex: "2026-08-03T19:15:59.526000").
  // new Date() sem fuso interpreta como horario LOCAL do navegador, o que desloca
  // o horario em quem esta em BRT (mostra 19:15 ao inves de 16:15). O banco guarda
  // UTC, entao acrescentamos "Z" quando nao houver offset para interpretar como UTC.
  const normalized =
    typeof iso === "string" && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
      ? iso + "Z"
      : iso;
  return new Date(normalized).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COGNITIVE_TYPES = [
  "PlanningStarted",
  "PlanningCompleted",
  "PlanningFailed",
  "LLMResponseGenerated",
  "KnowledgeObservationGenerated",
  "StateViewBuilt",
];

export default function TimelineEventRenderer({ event }) {
  const time = formatTime(event.created_date);
  const type = event.type;

  if (type === "watch_triggered") return <WatchEventCard event={event} time={time} />;
  if (type === "knowledge_ingested") return <KnowledgeEventCard event={event} time={time} />;
  if (typeof type === "string" && type.startsWith("Connector")) return <ConnectorEventCard event={event} time={time} />;
  if (COGNITIVE_TYPES.includes(type)) return <CognitiveEventCard event={event} time={time} />;

  // Fallback generico
  return (
    <EventShell icon={Activity} type={type} status={event.status} source={event.source} time={time}>
      {event.payload && Object.keys(event.payload).length > 0 && (
        <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap break-words bg-white/60 rounded px-2 py-1 border border-zinc-100">
          {JSON.stringify(event.payload, null, 0).slice(0, 280)}
        </pre>
      )}
    </EventShell>
  );
}