/**
 * KeywordMatcher.ts — Sprint EF-42
 *
 * Deterministic, AI-free keyword matching engine.
 *
 * Responsibilities:
 *   - Normalize queries and keywords (lowercase, strip punctuation, tokenize)
 *   - Calculate relevance score based on token overlap
 *   - Support exact match, prefix match, and substring match tiers
 *
 * What this does NOT do:
 *   - Embeddings, vectors, semantic similarity
 *   - LLM calls
 *   - Fuzzy / edit-distance matching
 *
 * Algorithm (deterministic, reproducible):
 *   1. Normalize: lowercase, strip non-alphanumeric (keep spaces/hyphens), split tokens
 *   2. For each query token, score against each keyword/tag:
 *      - Exact match:    weight 1.0
 *      - Prefix match:   weight 0.6
 *      - Substring:      weight 0.3
 *   3. Score = sum(matched weights) / max(queryTokens.length, 1)
 *   4. Score clamped to [0, 1]
 *
 * SRP: normalize and score only. Never selects, never filters, never stores.
 */

// ── Normalization ─────────────────────────────────────────────────────────────

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter(t => t.length > 1); // drop single-char tokens
}

// ── Token score ───────────────────────────────────────────────────────────────

const EXACT_WEIGHT     = 1.0;
const PREFIX_WEIGHT    = 0.6;
const SUBSTRING_WEIGHT = 0.3;

function scoreToken(queryToken: string, keyword: string): number {
  const norm = normalizeText(keyword);
  if (norm === queryToken)                     return EXACT_WEIGHT;
  if (norm.startsWith(queryToken))             return PREFIX_WEIGHT;
  if (norm.includes(queryToken))               return SUBSTRING_WEIGHT;
  // Also check reverse: queryToken contains the keyword
  if (queryToken.startsWith(norm) && norm.length > 2) return PREFIX_WEIGHT * 0.8;
  if (queryToken.includes(norm) && norm.length > 2)   return SUBSTRING_WEIGHT * 0.8;
  return 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MatchResult {
  readonly score:        number;
  readonly matchedTokens: readonly string[];
  readonly matchedAgainst: readonly string[];
}

/**
 * Score a query against a list of keywords/tags.
 * Returns a MatchResult with score ∈ [0, 1] and matched evidence.
 */
export function scoreAgainstKeywords(
  query: string,
  keywords: readonly string[],
): MatchResult {
  const queryTokens   = tokenize(query);
  if (queryTokens.length === 0 || keywords.length === 0) {
    return Object.freeze({ score: 0, matchedTokens: [], matchedAgainst: [] });
  }

  let totalScore = 0;
  const matchedTokens:   string[] = [];
  const matchedAgainst:  string[] = [];

  for (const qt of queryTokens) {
    let bestScore = 0;
    let bestKw    = "";
    for (const kw of keywords) {
      const s = scoreToken(qt, kw);
      if (s > bestScore) { bestScore = s; bestKw = kw; }
    }
    if (bestScore > 0) {
      totalScore += bestScore;
      matchedTokens.push(qt);
      matchedAgainst.push(bestKw);
    }
  }

  const score = Math.min(1, totalScore / queryTokens.length);
  return Object.freeze({
    score,
    matchedTokens:  Object.freeze(matchedTokens),
    matchedAgainst: Object.freeze(matchedAgainst),
  });
}

/**
 * Score a query against a full-text string (e.g. chunk content or document title).
 * Tokenizes the text and treats each token as a keyword.
 */
export function scoreAgainstText(query: string, text: string): MatchResult {
  const textTokens = tokenize(text);
  return scoreAgainstKeywords(query, textTokens);
}

/**
 * Combine multiple MatchResults (e.g. from title + tags + keywords).
 * Weighted average: weights must sum to 1.
 */
export function combineScores(
  results: Array<{ result: MatchResult; weight: number }>,
): number {
  let total = 0;
  for (const { result, weight } of results) {
    total += result.score * weight;
  }
  return Math.min(1, Math.max(0, total));
}