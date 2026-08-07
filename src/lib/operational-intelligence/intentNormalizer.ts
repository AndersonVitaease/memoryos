/**
 * intentNormalizer.ts — OIE Fase 1.5 (Sprint 2)
 *
 * Normalizacao deterministica de texto de intencao do usuario.
 *
 * PRINCIPIO: nenhuma IA. A normalizacao e feita por:
 *   1. lowercase
 *   2. strip acentos (NFD + remove combining marks)
 *   3. strip pontuacao excao hifen/underscore (preserva tokens compostos)
 *   4. colapsar espacos
 *
 * Saida alimenta:
 *   - intentHash (FNV-1a 32-bit) — para deduplicacao e deteccao de
 *     inconsistencia de roteamento (Decision Analyzer Fase 2.5)
 *   - quantifiers — para Coverage Analyzer (Fase 3) saber que o usuario
 *     pediu "todo" o repositorio (quantifier "all") mesmo que o executor
 *     nao tenha recebido essa informacao
 *
 * O hash e deterministico e nao-criptografico (FNV-1a). Nao precisa de
 * crypto — e para agrupar mesmas intencoes, nao para seguranca.
 */

// ── Normalizacao ─────────────────────────────────────────────────────────────

export function normalizeIntent(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip acentos
    .replace(/[?!.,;:()"'/\\]/g, " ") // strip pontuacao (preserva - _)
    .replace(/\s+/g, " ")
    .trim();
}

// ── FNV-1a 32-bit ─────────────────────────────────────────────────────────────

export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // FNV prime multiplication (imul para manter 32-bit)
    hash = Math.imul(hash, 0x01000193);
  }
  // unsigned 32-bit to hex (8 chars)
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ── Quantificadores deterministricos ──────────────────────────────────────────
//
// Extrai quantificadores do texto ORIGINAL (nao normalizado — preserva
// acentos para casar "tódó" errado tambem, embora raro). A normalizacao
// para hash e outra coisa; aqui preservamos o texto para casar padroes PT.

const QUANTIFIER_PATTERNS: ReadonlyArray<{ pattern: RegExp; quantifier: string }> = [
  // "todo o / toda a / todos os / todas as" — intenção de totalidade
  { pattern: /\btod[oa]s?\s+(?:o[s]?\s+|a[s]?\s+|os?\s+|as?\s+)/i, quantifier: "all_the" },
  // "todo / toda / todos / todas" solto
  { pattern: /\btod[oa]s?\b/i, quantifier: "all" },
  // "completo / completa / completos / completas"
  { pattern: /\bcomplet[oa]s?\b/i, quantifier: "complete" },
  // "inteiro / inteira / inteiros / inteiras"
  { pattern: /\binteir[oa]s?\b/i, quantifier: "whole" },
  // "cada" — intenção de iteração exaustiva
  { pattern: /\bcada\b/i, quantifier: "each" },
  // "todo o repositorio / toda a biblioteca" — ja coberto por all_the, mas
  // marcamos explicitamente para o Coverage Analyzer saber o dominio
  { pattern: /\btod[oa]s?\s+(?:o[s]?\s+|a[s]?\s+)?repositorio/i, quantifier: "all_repository" },
  { pattern: /\btod[oa]s?\s+(?:o[s]?\s+|a[s]?\s+)?biblioteca/i, quantifier: "all_library" },
];

const NUMBER_PATTERN = /\b(\d+)\b/g;

export function extractQuantifiers(rawText: string): {
  quantifiers: string[];
  numbers: number[];
} {
  if (!rawText || typeof rawText !== "string") return { quantifiers: [], numbers: [] };
  const quantifiers: string[] = [];
  for (const { pattern, quantifier } of QUANTIFIER_PATTERNS) {
    if (pattern.test(rawText)) quantifiers.push(quantifier);
  }
  const numbers = (rawText.match(NUMBER_PATTERN) ?? []).map(Number).filter((n) => n > 0);
  return { quantifiers, numbers };
}

// ── Hash composto ─────────────────────────────────────────────────────────────

/**
 * Produz o intent_hash a partir do texto bruto do usuario.
 * Retorna null se o texto normalizado for vazio (nao ha intencao
 * deterministica para hash — ex: mensagem so com pontuacao).
 */
export function computeIntentHash(rawText: string): string | null {
  const normalized = normalizeIntent(rawText);
  if (!normalized) return null;
  return fnv1a32(normalized);
}