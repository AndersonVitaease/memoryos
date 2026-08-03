/**
 * MemoryActivityIndicator.jsx — Fase 1 (Observabilidade Shadow)
 *
 * Indicador passivo de atividade cognitiva. Apenas ESCUTA o CognitiveEventBus
 * (onAny) — nunca emite eventos nem interrompe o ConversationPipeline.
 *
 * Exibe um pill flutuante (fixed top-right) quando há atividade cognitiva recente
 * (planning, llm_response, knowledge_observation). Some automaticamente após 5s
 * sem novos eventos.
 *
 * Risco: zero. Se o bus falhar, o componente apenas não aparece.
 */

import React, { useEffect, useState, useRef } from "react";
import { Brain, Sparkles, Zap, Eye } from "lucide-react";
import { cognitiveEventBus } from "@/lib/cognitive-event-bus/CognitiveEventBus";

const ACTIVITY_WINDOW_MS = 5000; // some após 5s sem eventos

const LABELS = {
  planning_started: { label: "Planejando...", icon: Brain, color: "violet" },
  planning_completed: { label: "Plano pronto", icon: Sparkles, color: "violet" },
  planning_failed: { label: "Replanejando...", icon: Brain, color: "amber" },
  llm_response_generated: { label: "Gerando resposta...", icon: Zap, color: "indigo" },
  knowledge_observation_generated: { label: "Registrando memória...", icon: Eye, color: "emerald" },
  state_view_built: { label: "Organizando contexto...", icon: Sparkles, color: "violet" },
};

export default function MemoryActivityIndicator() {
  const [active, setActive] = useState(false);
  const [currentType, setCurrentType] = useState(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = cognitiveEventBus.onAny((event) => {
      setCurrentType(event.type);
      setActive(true);
      // (re)agenda ocultação
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setActive(false);
        setCurrentType(null);
      }, ACTIVITY_WINDOW_MS);
    });

    return () => {
      unsubscribe();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!active || !currentType) return null;

  const config = LABELS[currentType] ?? { label: "Processando...", icon: Brain, color: "violet" };
  const Icon = config.icon;

  const colorMap = {
    violet: "bg-violet-50 text-violet-600 border-violet-200",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
  };

  return (
    <div
      className={`fixed top-3 right-9 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium shadow-sm pointer-events-none transition-opacity duration-300 ${colorMap[config.color]}`}
      role="status"
      aria-live="polite"
    >
      <Icon className="w-3.5 h-3.5 animate-pulse" />
      <span>{config.label}</span>
    </div>
  );
}