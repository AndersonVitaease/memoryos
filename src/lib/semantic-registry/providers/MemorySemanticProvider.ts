/**
 * MemorySemanticProvider.ts — Engineering Sprint 9.2.2
 *
 * SRP: unico responsavel por todo o conhecimento semantico do connector Memory.
 */

import type { SemanticProvider, SemanticScore } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";

const MEMORY_DIRECT = Object.freeze([
  "lembro", "lembrar", "recordo", "recordar", "memoria", "memoria",
  "remember", "memory", "recall",
]);

const HISTORY_PHRASES = Object.freeze([
  "o que eu disse", "o que falamos", "discutimos", "conversamos",
  "what i said", "what we discussed",
]);

const SUMMARY_PHRASES = Object.freeze([
  "resumo", "resumir", "summarize", "summary", "recap", "recapitular",
  "o que foi discutido", "o que falamos",
]);

const SESSION_CONTEXT = Object.freeze([
  "sessao", "sessao", "session", "conversa", "conversa anterior",
  "ultimas conversas", "historico", "historico",
]);

function firstMatch(lower: string, list: readonly string[]): string | null {
  for (const s of list) {
    if (lower.includes(s)) return s;
  }
  return null;
}

export const MemorySemanticProvider: SemanticProvider = Object.freeze({
  connectorId:      "memory",
  implicitGoalType: "memory.query",

  score(lower: string, _normalized: NormalizationResult): SemanticScore {
    const evidences: string[] = [];
    let score = 0;

    const md = firstMatch(lower, MEMORY_DIRECT);
    if (md) { score += 0.50; evidences.push(`memory-direct: "${md}"`); }

    const hp = firstMatch(lower, HISTORY_PHRASES);
    if (hp) { score += 0.40; evidences.push(`history-phrase: "${hp}"`); }

    const sp = firstMatch(lower, SUMMARY_PHRASES);
    if (sp) { score += 0.35; evidences.push(`summary-phrase: "${sp}"`); }

    const sc = firstMatch(lower, SESSION_CONTEXT);
    if (sc) { score += 0.20; evidences.push(`session-context: "${sc}"`); }

    return Object.freeze({ score: Math.min(score, 1.0), evidences: Object.freeze(evidences) });
  },
});