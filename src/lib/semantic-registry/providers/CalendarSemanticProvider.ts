/**
 * CalendarSemanticProvider.ts — Engineering Sprint 9.2.2
 *
 * SRP: unico responsavel por todo o conhecimento semantico do connector Calendar.
 */

import type { SemanticProvider, SemanticScore } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";

const TEMPORAL_DIRECT = Object.freeze([
  "hoje", "today", "amanha", "amanha", "tomorrow", "ontem", "yesterday",
  "semana", "week", "mes", "mes", "month", "ano", "year",
  "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

const EVENT_TYPES = Object.freeze([
  "reuniao", "reuniao", "reunioes", "reunioes", "meeting", "compromisso",
  "compromissos", "evento", "eventos", "event", "events", "agendamento",
  "lembrete", "reminder", "call", "chamada",
]);

const TIME_REFS = Object.freeze([
  "hora", "horario", "horario", "schedule", "agenda", "calendario",
  "calendario", "calendar",
]);

const RELATIVE_PHRASES = Object.freeze([
  "esta semana", "proximo", "proxima", "proximo", "proxima", "next",
  "fin de semana", "fds", "fim de semana",
]);

/**
 * Verifica se `s` aparece em `lower` como palavra/frase INTEIRA.
 * FIX (auditoria cognição): firstMatch() usava .includes() puro. A lista
 * TEMPORAL_DIRECT tem "mes" (typo pra "mês", sem acento, pensado pra
 * digitação sem acento) com peso 0.45 — sozinho já acima do
 * MIN_SCORE_THRESHOLD (0.20) do ImplicitConnectorIntentDetector. "mes"
 * é substring de "mesmo" e "mesa" — duas das palavras mais comuns do
 * português ("isso mesmo", "eu mesmo fiz", "mesa de reunião"). Qualquer
 * mensagem contendo "mesmo" disparava uma busca real no Calendário.
 * Fronteira Unicode resolve sem precisar remover a palavra "mes".
 */
function firstMatch(lower: string, list: readonly string[]): string | null {
  for (const s of list) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

export const CalendarSemanticProvider: SemanticProvider = Object.freeze({
  connectorId:      "calendar",
  implicitGoalType: "calendar.listToday",

  score(lower: string, _normalized: NormalizationResult): SemanticScore {
    const evidences: string[] = [];
    let score = 0;

    const temporal = firstMatch(lower, TEMPORAL_DIRECT);
    if (temporal) { score += 0.45; evidences.push(`temporal: "${temporal}"`); }

    const ev = firstMatch(lower, EVENT_TYPES);
    if (ev) { score += 0.35; evidences.push(`event-type: "${ev}"`); }

    const tr = firstMatch(lower, TIME_REFS);
    if (tr) { score += 0.20; evidences.push(`time-ref: "${tr}"`); }

    const rp = firstMatch(lower, RELATIVE_PHRASES);
    if (rp) { score += 0.15; evidences.push(`relative-phrase: "${rp}"`); }

    return Object.freeze({ score: Math.min(score, 1.0), evidences: Object.freeze(evidences) });
  },
});
