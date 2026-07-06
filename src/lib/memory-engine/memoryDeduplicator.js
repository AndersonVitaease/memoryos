/**
 * Memory Deduplicator (Sprint 22 — Memory Engine)
 *
 * Identifica duplicatas entre as memórias sugeridas e as memórias
 * já persistidas no storage.
 *
 * Determinístico — usa normalização de string, não hashing aleatório.
 */

/**
 * Normaliza conteúdo para comparação determinística.
 * Remove pontuação, converte para minúsculas e normaliza espaços.
 */
export function normalizeContent(content) {
  if (!content || typeof content !== "string") return "";
  return content
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Verifica se duas memórias são duplicatas baseado em conteúdo normalizado.
 */
export function isDuplicate(memA, memB) {
  if (!memA || !memB) return false;
  const normA = normalizeContent(memA.content);
  const normB = normalizeContent(memB.content);

  if (!normA || !normB) return false;

  // Exact match after normalization
  if (normA === normB) return true;

  // One is a substring of the other (subset match)
  if (normA.length > 10 && normB.length > 10) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }

  return false;
}

/**
 * Encontra duplicatas entre as memórias sugeridas e as já persistidas.
 */
export function findDuplicates(suggestedMemories, existingMemories) {
  const duplicates = [];

  if (!Array.isArray(suggestedMemories) || !Array.isArray(existingMemories)) {
    return duplicates;
  }

  for (const suggested of suggestedMemories) {
    for (const existing of existingMemories) {
      if (isDuplicate(suggested, existing)) {
        duplicates.push({
          suggested,
          existing,
          type: "content_match",
        });
      }
    }
  }

  return duplicates;
}

/**
 * Encontra duplicatas internas entre as próprias memórias sugeridas.
 */
export function findInternalDuplicates(suggestedMemories) {
  const duplicates = [];

  if (!Array.isArray(suggestedMemories) || suggestedMemories.length < 2) {
    return duplicates;
  }

  for (let i = 0; i < suggestedMemories.length; i++) {
    for (let j = i + 1; j < suggestedMemories.length; j++) {
      if (isDuplicate(suggestedMemories[i], suggestedMemories[j])) {
        duplicates.push({
          suggested: suggestedMemories[i],
          existing: suggestedMemories[j],
          type: "internal_duplicate",
        });
      }
    }
  }

  return duplicates;
}