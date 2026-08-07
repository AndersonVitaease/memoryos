/**
 * IntentRecorder.ts — OIE Fase 1.5 (Sprint 2)
 *
 * Responsabilidade unica: registrar uma InteractionEvent (actor=user,
 * event_type=message_sent) no inicio do pipeline, ANTES de qualquer
 * interpretacao pelo Planner/GoalBridge.
 *
 * POR QUE ANTES DO PLANNER:
 *   O Planner ja e uma interpretacao — e interpretacao perde informacao.
 *   Quando o usuario diz "leia todo o repositorio", o Planner emite um
 *   Goal github.listFiles com extractParams que pode descartar o
 *   quantificador "todo". Depois o executor le 3 arquivos e o sistema
 *   acha que cumpriu. A pergunta "o Planner escolheu certo?" so e
 *   respondivel se temos o que o usuario PEDIU, nao o que o Planner
 *   ENTENDEU. Sem o Intent Recorder, medimos a qualidade da
 *   interpretacao contra a propria interpretacao — tautologia.
 *
 * SHADOW MODE (Fase 1.5): o Recorder ESCREVE intents, mas NADA no sistema
 * as LE para tomar decisoes. Promover de shadow para ativo so apos
 * validacao das fases seguintes.
 *
 * PRINCIPIOS:
 *  - Fire-and-forget: nunca rejeita, nunca bloqueia o pipeline.
 *  - Deterministico: hash + quantifiers sem LLM, sem IA.
 *  - Trunca raw_text em 4000 chars antes de persistir.
 *  - Correlaciona com ExecutionObservation via correlation_id = executionId.
 */

import { base44 } from "@/api/base44Client";
import { computeIntentHash, extractQuantifiers, normalizeIntent } from "./intentNormalizer";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface IntentRecordInput {
  readonly sessionId: string;
  readonly correlationId: string;
  readonly rawText: string;
  readonly sprintTag?: string;
}

// ── Estado interno ───────────────────────────────────────────────────────────

let _enabled = true;
const DEFAULT_SPRINT_TAG = "S2-OIE";

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "... (truncado)" : s;
}

// ── IntentRecorder ───────────────────────────────────────────────────────────

export const IntentRecorder = {
  disable(): void { _enabled = false; },
  enable(): void { _enabled = true; },
  isEnabled(): boolean { return _enabled; },

  /**
   * Registra uma InteractionEvent (actor=user, message_sent).
   * Fire-and-forget: nunca rejeita.
   *
   * IMPORTANTE: o caller deve invocar SEM await (ou com .catch(() => {}))
   * — o Recorder tem catch interno, mas o pipeline nao deve aguardar.
   */
  async record(input: IntentRecordInput): Promise<void> {
    if (!_enabled) return;
    try {
      const normalized = normalizeIntent(input.rawText);
      const intentHash = computeIntentHash(input.rawText);
      const { quantifiers, numbers } = extractQuantifiers(input.rawText);

      const payload = JSON.stringify({
        quantifiers,
        numbers,
        normalized_preview: normalized.slice(0, 200),
        char_count: input.rawText.length,
        sprint_tag: input.sprintTag ?? DEFAULT_SPRINT_TAG,
      });

      await base44.entities.InteractionEvent.create({
        session_id: input.sessionId,
        correlation_id: input.correlationId,
        actor: "user",
        event_type: "message_sent",
        intent_hash: intentHash,
        raw_text: truncate(input.rawText, 4000),
        payload,
      });
    } catch {
      // Shadow mode: nunca propagar erro de instrumentacao para o pipeline.
    }
  },
};