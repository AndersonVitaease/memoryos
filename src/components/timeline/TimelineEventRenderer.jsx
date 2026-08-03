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
import { formatTime } from "./formatTime";

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