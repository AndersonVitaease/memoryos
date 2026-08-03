/**
 * CognitiveEventCard.jsx — card rico para SystemEvent cognitivos
 * (PlanningStarted/Completed/Failed, LLMResponseGenerated,
 *  KnowledgeObservationGenerated, StateViewBuilt)
 */

import React from "react";
import { ListChecks, AlertTriangle, Sparkles, Microscope, Layers } from "lucide-react";
import EventShell from "../EventShell";

const ICON_BY_TYPE = {
  PlanningStarted: ListChecks,
  PlanningCompleted: ListChecks,
  PlanningFailed: AlertTriangle,
  LLMResponseGenerated: Sparkles,
  KnowledgeObservationGenerated: Microscope,
  StateViewBuilt: Layers,
};

const LABEL_BY_TYPE = {
  PlanningStarted: "Planejamento iniciado",
  PlanningCompleted: "Planejamento concluído",
  PlanningFailed: "Planejamento falhou",
  LLMResponseGenerated: "Resposta gerada",
  KnowledgeObservationGenerated: "Observação gerada",
  StateViewBuilt: "Visão de estado construída",
};

export default function CognitiveEventCard({ event, time }) {
  const p = event.payload || {};
  const Icon = ICON_BY_TYPE[event.type] || Sparkles;
  const label = LABEL_BY_TYPE[event.type] || event.type;
  const keys = Object.keys(p);
  return (
    <EventShell icon={Icon} type={label} status={event.status} source={event.source} time={time} accent="text-indigo-500">
      <div className="text-sm text-zinc-700">
        {keys.length === 0 ? (
          <span className="text-zinc-400 text-xs">Sem payload</span>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            {keys.slice(0, 6).map((k) => (
              <span key={k}><span className="text-zinc-400">{k}:</span> {String(p[k]).slice(0, 40)}</span>
            ))}
          </div>
        )}
      </div>
    </EventShell>
  );
}