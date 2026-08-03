/**
 * GlobalSyncStatus.jsx — Fase 1 (Observabilidade Shadow)
 *
 * Indicador passivo de sincronização do sistema. Apenas ESCUTA o RuntimeEventBus
 * (onAny) — nunca emite eventos nem afeta o fluxo de execução.
 *
 * Mostra um pequeno ponto colorido (fixed top-right) que reflete o estado de
 * sincronização dos conectores: verde (saudável/ocioso), âmbar (atividade
 * recente), vermelho (falha recente). Dá ao usuário a paz de espírito de que
 * o sistema está vivo e sincronizando.
 *
 * Risco: zero. Se o bus falhar, o indicador fica verde (estado default seguro).
 */

import React, { useEffect, useState, useRef } from "react";
import { runtimeEventBus } from "@/runtime/connectors/RuntimeEventBus";

const ACTIVITY_WINDOW_MS = 4000; // volta a verde após 4s sem atividade
const FAILURE_WINDOW_MS = 8000; // vermelho dura 8s após uma falha

const SUCCESS_EVENTS = new Set([
  "ConnectorRegistered",
  "ConnectorLoaded",
  "ConnectorInitialized",
  "ConnectorConnected",
  "ConnectorExecutionCompleted",
  "ConnectorRecovered",
]);

const FAILURE_EVENTS = new Set([
  "ConnectorDisconnected",
  "ConnectorExecutionFailed",
  "ConnectorTimeout",
  "ConnectorRateLimited",
  "ConnectorHealthChanged",
]);

export default function GlobalSyncStatus() {
  const [status, setStatus] = useState("idle"); // idle | active | error
  const activityTimerRef = useRef(null);
  const failureTimerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = runtimeEventBus.onAny((event) => {
      // Falha tem prioridade
      if (FAILURE_EVENTS.has(event.type)) {
        setStatus("error");
        if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
        failureTimerRef.current = setTimeout(() => setStatus("idle"), FAILURE_WINDOW_MS);
        return;
      }

      if (SUCCESS_EVENTS.has(event.type)) {
        setStatus("active");
        if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
        activityTimerRef.current = setTimeout(() => setStatus("idle"), ACTIVITY_WINDOW_MS);
      }
    });

    return () => {
      unsubscribe();
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
    };
  }, []);

  const dotMap = {
    idle: "bg-emerald-400",
    active: "bg-sky-400 animate-pulse",
    error: "bg-red-500",
  };

  const tooltipMap = {
    idle: "Memória sincronizada",
    active: "Sincronizando...",
    error: "Falha de sincronização recente",
  };

  return (
    <div
      className="fixed top-3 right-3 z-40 flex items-center gap-1.5 pointer-events-none"
      title={tooltipMap[status]}
      aria-label={tooltipMap[status]}
    >
      <span className={`relative flex h-2.5 w-2.5`}>
        {status === "active" && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60 animate-ping" />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotMap[status]}`} />
      </span>
    </div>
  );
}