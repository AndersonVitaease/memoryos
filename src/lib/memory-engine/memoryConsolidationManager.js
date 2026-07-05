/**
 * Memory Consolidation Manager (Sprint 6)
 *
 * Responsabilidade única: ANALISAR um novo Memory Record e decidir
 * se ele deve criar, atualizar, fundir ou ser ignorado.
 *
 * O QUE FAZ:
 *   - Recebe um Memory Record recém-criado + lista de existentes
 *   - Aplica heurísticas determinísticas de similaridade
 *   - Retorna apenas uma decisão (CREATE, UPDATE, MERGE, IGNORE)
 *
 * O QUE NÃO FAZ:
 *   - Modificar diretamente qualquer memória
 *   - Persistir dados
 *   - Responder ao usuário
 *   - Alterar conteúdo, classificação, status, revision, lifecycle
 *   - Realizar merge real
 *   - Atualizar Memory Records
 *   - Versioning, Relationships, Embeddings, Busca Semântica
 *
 * Arquitetura:
 *   Usuário → Core → Classifier → Record → Consolidation Manager → Decision → Store
 *
 * O Consolidation Manager NUNCA toca no Store.
 * Ele apenas retorna a decisão. O Store (ou orquestrador) aplica.
 */

// === Decisões oficiais ===
export const CONSOLIDATION_ACTIONS = ["CREATE", "UPDATE", "MERGE", "IGNORE"];

// === Reason Codes oficiais ===
export const CONSOLIDATION_REASON_CODES = [
  "NEW_MEMORY",
  "DUPLICATE",
  "UPDATED_INFORMATION",
  "SIMILAR_MEMORY",
  "POSSIBLE_MERGE",
  "LOW_CONFIDENCE",
  "OUTDATED_INFORMATION",
];

// === Observabilidade interna ===
const _stats = {
  consolidationStarted: 0,
  consolidationCompleted: 0,
  decisions: { CREATE: 0, UPDATE: 0, MERGE: 0, IGNORE: 0 },
  totalProcessingTimeMs: 0,
  totalCandidateMemories: 0,
  lowConfidenceCount: 0,
  operations: 0,
};

const _decisionLog = [];

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[ConsolidationManager:${event}]`, data);
}

// === Utilidades de texto ===

function _normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s]/g, " ") // remove pontuação
    .replace(/\s+/g, " ");
}

function _tokenize(text) {
  const normalized = _normalizeText(text);
  if (!normalized) return [];
  // Stopwords básicas em português
  const STOPWORDS = new Set([
    "a", "o", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
    "e", "ou", "para", "por", "com", "sem", "em", "no", "na", "nos", "nas", "que",
    "se", "mas", "como", "meu", "minha", "meus", "minhas", "seu", "sua", "seus", "suas",
    "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas", "isto", "isso",
    "muito", "muita", "muitos", "muitas", "pouco", "pouca", "e", "ou", "nem", "tambem",
    "ja", "ainda", "agora", "hoje", "ontem", "amanha", "ser", "estar", "ter", "ir",
    "foi", "foram", "era", "eh", "e", "sou", "estou", "estamos", "sao",
  ]);
  return normalized
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function _jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function _contentEquals(a, b) {
  return _normalizeText(a) === _normalizeText(b) && _normalizeText(a).length > 0;
}

function _extractSubject(text) {
  // Tenta identificar o sujeito/entidade principal da mensagem
  // Heurística simples: procura por padrões "meu/minha", "o/a [entidade]"
  const normalized = _normalizeText(text);
  const tokens = _tokenize(text);

  // Padrões de propriedade: "meu projeto", "minha empresa"
  const possessiveMatch = normalized.match(
    /(meu|minha|meus|minhas)\s+([\w]+)/
  );
  if (possessiveMatch) return possessiveMatch[2];

  // Padrão de preferência: "prefiro"
  if (normalized.includes("prefir") || normalized.includes("gosto")) {
    // Extrai o objeto da preferência
    const prefMatch = normalized.match(/(?:prefir\w*|gosto\s+de)\s+(.+)/);
    if (prefMatch) return prefMatch[1].split(" ")[0];
  }

  // Fallback: primeiros tokens significativos
  return tokens.slice(0, 2).join(" ");
}

// === Análise de similaridade ===

/**
 * Compara dois Memory Records e retorna um score de similaridade (0-1)
 * junto com o motivo da similaridade.
 */
function _compareRecords(newRecord, existingRecord) {
  let score = 0;
  const reasons = [];

  // 1. memoryType idêntico
  if (newRecord.memoryType === existingRecord.memoryType) {
    score += 0.15;
    reasons.push("same_type");
  }

  // 2. memoryIntent idêntico
  if (newRecord.memoryIntent === existingRecord.memoryIntent) {
    score += 0.15;
    reasons.push("same_intent");
  }

  // 3. Tags sobrepostas
  const newTags = new Set(newRecord.tags || []);
  const existingTags = new Set(existingRecord.tags || []);
  let tagOverlap = 0;
  for (const t of newTags) {
    if (existingTags.has(t)) tagOverlap++;
  }
  if (newTags.size > 0 && existingTags.size > 0) {
    const tagScore = tagOverlap / Math.max(newTags.size, existingTags.size);
    score += tagScore * 0.1;
    if (tagScore > 0) reasons.push("tag_overlap");
  }

  // 4. Título sugerido similar
  const titleTokensA = _tokenize(newRecord.suggestedTitle || "");
  const titleTokensB = _tokenize(existingRecord.suggestedTitle || "");
  const titleSim = _jaccardSimilarity(titleTokensA, titleTokensB);
  score += titleSim * 0.25;
  if (titleSim > 0.5) reasons.push("similar_title");

  // 5. Conteúdo normalizado
  const contentA = newRecord.normalizedContent || newRecord.originalMessage || "";
  const contentB = existingRecord.normalizedContent || existingRecord.originalMessage || "";

  // 5a. Duplicata exata
  if (_contentEquals(contentA, contentB)) {
    return { score: 1.0, reasons: ["exact_duplicate"], isExactDuplicate: true };
  }

  const contentTokensA = _tokenize(contentA);
  const contentTokensB = _tokenize(contentB);
  const contentSim = _jaccardSimilarity(contentTokensA, contentTokensB);
  score += contentSim * 0.35;
  if (contentSim > 0.5) reasons.push("similar_content");

  // Clamp
  score = Math.min(score, 1.0);

  return { score, reasons, isExactDuplicate: false };
}

// === Detecção de UPDATE vs CREATE ===

/**
 * Determina se o novo registro é uma atualização de um existente.
 *
 * Heurística: se o sujeito/entidade é o mesmo mas o conteúdo mudou,
 * é provavelmente uma atualização.
 */
function _isUpdateOf(newRecord, existingRecord, contentSimScore) {
  const contentA = newRecord.normalizedContent || newRecord.originalMessage || "";
  const contentB = existingRecord.normalizedContent || existingRecord.originalMessage || "";
  const tokensA = _tokenize(contentA);
  const tokensB = _tokenize(contentB);

  // 1. Mesmo sujeito extraído via possessivo (heurística principal)
  const subjectA = _extractSubject(contentA);
  const subjectB = _extractSubject(contentB);
  let subjectSim = 0;
  if (subjectA && subjectB) {
    subjectSim = _jaccardSimilarity(_tokenize(subjectA), _tokenize(subjectB));
  }

  // 2. Tokens significativos compartilhados (entidades/proper nouns)
  // Se há pelo menos um token significativo compartilhado, é sinal de mesma entidade
  const setB = new Set(tokensB);
  const sharedSignificant = tokensA.filter((t) => setB.has(t) && t.length > 3);

  // Mesmo tipo + mesma intent + (sujeito similar OU token significativo compartilhado)
  const sameType = newRecord.memoryType === existingRecord.memoryType;
  const sameIntent = newRecord.memoryIntent === existingRecord.memoryIntent;
  const hasSubjectMatch = subjectSim >= 0.5;
  const hasSharedEntity = sharedSignificant.length >= 1;

  // Conteúdo não é idêntico (já filtrado antes, mas salvaguarda)
  const contentDifferent = contentSimScore < 1.0;

  // Para UPDATE: mesmo tipo/intent + algum indicador de mesma entidade
  // + conteúdo diferente + similaridade moderada
  return (
    sameType &&
    sameIntent &&
    (hasSubjectMatch || hasSharedEntity) &&
    contentDifferent &&
    contentSimScore >= 0.1
  );
}

// === Decisão principal ===

/**
 * Analisa um novo Memory Record contra uma lista de existentes
 * e retorna a decisão de consolidação.
 *
 * @param {Object} newRecord - Memory Record recém-criado
 * @param {Object[]} existingRecords - Lista de Memory Records existentes
 * @returns {Object} Decisão oficial:
 *   { action, targetMemoryId, confidence, reasonCode, reason }
 */
export function consolidate(newRecord, existingRecords = []) {
  const startTime = Date.now();
  _stats.consolidationStarted++;
  _stats.operations++;

  // Validar entrada
  if (!newRecord || typeof newRecord !== "object") {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _stats.consolidationCompleted++;
    _stats.decisions.IGNORE++;
    _log("consolidationCompleted", { error: "newRecord inválido" });
    return {
      action: "IGNORE",
      targetMemoryId: null,
      confidence: "high",
      reasonCode: "LOW_CONFIDENCE",
      reason: "Memory Record inválido — não é possível consolidar.",
    };
  }

  const candidates = Array.isArray(existingRecords)
    ? existingRecords.filter(
        (r) => r && r.id !== newRecord.id && (r.status || "active") !== "deleted"
      )
    : [];

  _stats.totalCandidateMemories += candidates.length;

  // === Caso 1: Nenhuma memória existente → CREATE ===
  if (candidates.length === 0) {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _stats.consolidationCompleted++;
    _stats.decisions.CREATE++;
    _log("decision", { action: "CREATE", reasonCode: "NEW_MEMORY", elapsed });
    _decisionLog.push({
      action: "CREATE",
      reasonCode: "NEW_MEMORY",
      candidateCount: 0,
      processingTimeMs: elapsed,
    });
    return {
      action: "CREATE",
      targetMemoryId: null,
      confidence: "high",
      reasonCode: "NEW_MEMORY",
      reason: "Nenhuma memória existente — criar nova memória.",
    };
  }

  // === Caso 2: Procurar duplicatas e similares ===
  let bestMatch = null;
  let bestScore = 0;
  let bestReasons = [];
  let exactDuplicate = null;
  const similarMatches = [];

  for (const existing of candidates) {
    const comparison = _compareRecords(newRecord, existing);
    if (comparison.isExactDuplicate) {
      exactDuplicate = existing;
      break;
    }
    if (comparison.score >= 0.3) {
      similarMatches.push({
        record: existing,
        score: comparison.score,
        reasons: comparison.reasons,
      });
    }
    if (comparison.score > bestScore) {
      bestScore = comparison.score;
      bestMatch = existing;
      bestReasons = comparison.reasons;
    }
  }

  // === Caso 3: Duplicata exata → IGNORE ===
  if (exactDuplicate) {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _stats.consolidationCompleted++;
    _stats.decisions.IGNORE++;
    _log("decision", {
      action: "IGNORE",
      reasonCode: "DUPLICATE",
      targetId: exactDuplicate.id,
      elapsed,
    });
    _decisionLog.push({
      action: "IGNORE",
      reasonCode: "DUPLICATE",
      targetId: exactDuplicate.id,
      candidateCount: candidates.length,
      processingTimeMs: elapsed,
    });
    return {
      action: "IGNORE",
      targetMemoryId: exactDuplicate.id,
      confidence: "high",
      reasonCode: "DUPLICATE",
      reason: "Mensagem completamente duplicada — ignorar.",
    };
  }

  // === Caso 4: MERGE — múltiplas memórias similares (antes de UPDATE) ===
  if (similarMatches.length >= 2) {
    // Ordenar por score
    similarMatches.sort((a, b) => b.score - a.score);
    const topMatch = similarMatches[0];
    const confidence =
      topMatch.score >= 0.7 ? "high" : topMatch.score >= 0.5 ? "medium" : "low";
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _stats.consolidationCompleted++;
    _stats.decisions.MERGE++;
    if (confidence === "low") _stats.lowConfidenceCount++;
    _log("decision", {
      action: "MERGE",
      reasonCode: "POSSIBLE_MERGE",
      matchCount: similarMatches.length,
      elapsed,
    });
    _decisionLog.push({
      action: "MERGE",
      reasonCode: "POSSIBLE_MERGE",
      matchCount: similarMatches.length,
      candidateCount: candidates.length,
      processingTimeMs: elapsed,
    });
    return {
      action: "MERGE",
      targetMemoryId: topMatch.record.id,
      confidence,
      reasonCode: "POSSIBLE_MERGE",
      reason: `${similarMatches.length} memórias similares detectadas — possível fusão.`,
    };
  }

  // === Caso 5: UPDATE — conteúdo similar + mesmo sujeito ===
  if (bestMatch && bestScore >= 0.4) {
    const contentA = newRecord.normalizedContent || newRecord.originalMessage || "";
    const contentB =
      bestMatch.normalizedContent || bestMatch.originalMessage || "";
    const contentTokensA = _tokenize(contentA);
    const contentTokensB = _tokenize(contentB);
    const contentSim = _jaccardSimilarity(contentTokensA, contentTokensB);

    const isUpdate = _isUpdateOf(newRecord, bestMatch, contentSim);

    if (isUpdate) {
      const confidence = bestScore >= 0.7 ? "high" : bestScore >= 0.5 ? "medium" : "low";
      const elapsed = Date.now() - startTime;
      _stats.totalProcessingTimeMs += elapsed;
      _stats.consolidationCompleted++;
      _stats.decisions.UPDATE++;
      if (confidence === "low") _stats.lowConfidenceCount++;
      _log("decision", {
        action: "UPDATE",
        reasonCode: "UPDATED_INFORMATION",
        targetId: bestMatch.id,
        score: bestScore,
        elapsed,
      });
      _decisionLog.push({
        action: "UPDATE",
        reasonCode: "UPDATED_INFORMATION",
        targetId: bestMatch.id,
        score: bestScore,
        candidateCount: candidates.length,
        processingTimeMs: elapsed,
      });
      return {
        action: "UPDATE",
        targetMemoryId: bestMatch.id,
        confidence,
        reasonCode: "UPDATED_INFORMATION",
        reason: `Informação atualizada para "${bestMatch.suggestedTitle || bestMatch.memoryType}". Mesmo sujeito, conteúdo modificado.`,
      };
    }
  }

  // === Caso 6: Similaridade moderada com um único registro → UPDATE ou SIMILAR ===
  if (bestMatch && bestScore >= 0.5) {
    const confidence = bestScore >= 0.7 ? "high" : "medium";
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _stats.consolidationCompleted++;
    _stats.decisions.UPDATE++;
    _log("decision", {
      action: "UPDATE",
      reasonCode: "SIMILAR_MEMORY",
      targetId: bestMatch.id,
      score: bestScore,
      elapsed,
    });
    _decisionLog.push({
      action: "UPDATE",
      reasonCode: "SIMILAR_MEMORY",
      targetId: bestMatch.id,
      score: bestScore,
      candidateCount: candidates.length,
      processingTimeMs: elapsed,
    });
    return {
      action: "UPDATE",
      targetMemoryId: bestMatch.id,
      confidence,
      reasonCode: "SIMILAR_MEMORY",
      reason: `Memória similar encontrada (${Math.round(bestScore * 100)}%) — atualizar existente.`,
    };
  }

  // === Caso 7: Similaridade baixa → CREATE com baixa confiança se houver alguma similaridade ===
  if (bestScore >= 0.2 && bestScore < 0.5) {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _stats.consolidationCompleted++;
    _stats.decisions.CREATE++;
    _stats.lowConfidenceCount++;
    _log("decision", {
      action: "CREATE",
      reasonCode: "LOW_CONFIDENCE",
      bestScore,
      elapsed,
    });
    _decisionLog.push({
      action: "CREATE",
      reasonCode: "LOW_CONFIDENCE",
      bestScore,
      candidateCount: candidates.length,
      processingTimeMs: elapsed,
    });
    return {
      action: "CREATE",
      targetMemoryId: null,
      confidence: "low",
      reasonCode: "LOW_CONFIDENCE",
      reason: `Nenhuma memória suficientemente similar (score ${Math.round(bestScore * 100)}%). Criar nova com baixa confiança.`,
    };
  }

  // === Caso 8: Nenhuma similaridade → CREATE ===
  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.consolidationCompleted++;
  _stats.decisions.CREATE++;
  _log("decision", {
    action: "CREATE",
    reasonCode: "NEW_MEMORY",
    elapsed,
  });
  _decisionLog.push({
    action: "CREATE",
    reasonCode: "NEW_MEMORY",
    candidateCount: candidates.length,
    bestScore,
    processingTimeMs: elapsed,
  });
  return {
    action: "CREATE",
    targetMemoryId: null,
    confidence: "high",
    reasonCode: "NEW_MEMORY",
    reason: "Nenhuma memória parecida — criar nova memória.",
  };
}

// === Observabilidade ===

/**
 * Retorna estatísticas de observabilidade do Consolidation Manager.
 */
export function getStats() {
  return {
    ..._stats,
    decisions: { ..._stats.decisions },
    averageProcessingTimeMs:
      _stats.operations > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
        : 0,
    decisionLog: [..._decisionLog],
  };
}

/**
 * Retorna o log de decisões.
 */
export function getDecisionLog() {
  return [..._decisionLog];
}

/**
 * Limpa estatísticas e logs.
 * Usado apenas pelos testes.
 */
export function _resetForTests() {
  _stats.consolidationStarted = 0;
  _stats.consolidationCompleted = 0;
  _stats.decisions = { CREATE: 0, UPDATE: 0, MERGE: 0, IGNORE: 0 };
  _stats.totalProcessingTimeMs = 0;
  _stats.totalCandidateMemories = 0;
  _stats.lowConfidenceCount = 0;
  _stats.operations = 0;
  _decisionLog.length = 0;
}

export default {
  consolidate,
  getStats,
  getDecisionLog,
  _resetForTests,
  CONSOLIDATION_ACTIONS,
  CONSOLIDATION_REASON_CODES,
};