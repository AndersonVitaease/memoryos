/**
 * RuntimeObserver.ts — OIE Fase 1 (Sprint 1)
 *
 * Responsabilidade unica: registrar uma ExecutionObservation apos cada
 * dispatch de capability, em shadow mode.
 *
 * SHADOW MODE (Fase 1): o Observer ESCREVE observacoes, mas NADA no sistema
 * as LE para tomar decisoes. Promover de shadow para ativo so apos
 * validacao das fases seguintes (2.5 Decision Analyzer, 3 Coverage Analyzer).
 * Isso garante que a instrumentacao nao quebre producao: um erro ao gravar
 * a observacao nunca propaga para o fluxo de execucao real.
 *
 * PRINCIPIOS:
 *  - Fire-and-forget: a chamada e assincrona e nunca rejeita (catch interno).
 *  - Nunca bloqueia: o caller nao aguarda (usa .catch(() => {}) no ponto de hook).
 *  - Nunca altera o StepResult: so observa, nao muta.
 *  - Trunca campos longos antes de persistir (limite de tamanho da entity).
 *
 * Hook point: ExecutionDispatcher.dispatch() — choke point unico por onde
 * todas as execucoes de capability passam. Um unico hook cobre todo o
 * sistema (Gmail, Drive, GitHub, Calendar, MCP, etc.).
 */

import { base44 } from "@/api/base44Client";
import { classifyErrorSignature } from "./errorSignatureClassifier";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ObservationInput {
  readonly executionId: string;
  readonly stepId: string;
  readonly connector: string;
  readonly capability: string;
  readonly status: string;
  readonly error?: string | null;
  readonly durationMs: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly sessionId?: string;
  readonly goalType?: string;
  readonly sprintTag?: string;
}

// ── Estado interno ───────────────────────────────────────────────────────────

let _enabled = true;
const DEFAULT_SPRINT_TAG = "S1-OIE";

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "... (truncado)" : s;
}

function isFailureStatus(status: string): boolean {
  return status === "failed" || status === "timeout" || status === "blocked";
}

// ── RuntimeObserver ──────────────────────────────────────────────────────────

export const RuntimeObserver = {
  /** Desativa o Observer (usar apenas em testes ou emergencia). */
  disable(): void { _enabled = false; },
  /** Reativa o Observer (estado default). */
  enable(): void { _enabled = true; },
  isEnabled(): boolean { return _enabled; },

  /**
   * Registra uma ExecutionObservation. Fire-and-forget: nunca rejeita.
   *
   * IMPORTANTE: o caller deve invocar com .catch(() => {}) OU chamar sem await
   * — o Observer ja tem catch interno, mas o caller nao deve depender do
   * retorno (shadow mode = nao afeta o fluxo de execucao real).
   */
  async observe(input: ObservationInput): Promise<void> {
    if (!_enabled) return;
    try {
      const isFailure = isFailureStatus(input.status);
      const errorSignature = isFailure
        ? classifyErrorSignature(input.error ?? "")
        : null;
      const errorMessage = input.error ? truncate(String(input.error), 4000) : null;

      await base44.entities.ExecutionObservation.create({
        execution_id: input.executionId,
        step_id: input.stepId,
        connector: input.connector,
        capability: input.capability,
        goal_type: input.goalType ?? null,
        status: input.status,
        error_signature: errorSignature,
        // Fase 1: behavior_signature sempre null. Populado pelas Fases 2.5/3.
        behavior_signature: null,
        duration_ms: input.durationMs,
        error_message: errorMessage,
        started_at: new Date(input.startedAt).toISOString(),
        finished_at: new Date(input.finishedAt).toISOString(),
        sprint_tag: input.sprintTag ?? DEFAULT_SPRINT_TAG,
        session_id: input.sessionId ?? null,
        payload: null,
      });
    } catch {
      // Shadow mode: nunca propagar erro de instrumentacao para o fluxo real.
      // Logar e silenciar — um bug no observador nao pode quebrar a execucao.
    }
  },
};