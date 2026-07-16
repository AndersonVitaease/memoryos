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

function firstMatch(lower: string, list: readonly string[]): string | null {
  for (const s of list) {
    if (lower.includes(s)) return s;
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