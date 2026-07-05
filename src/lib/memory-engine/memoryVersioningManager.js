/**
 * Memory Versioning Manager (Sprint 7)
 *
 * Responsabilidade única: manter o histórico oficial de alterações das memórias.
 *
 * Arquitetura:
 *   Memory Consolidation Manager
 *     ↓ Consolidation Proposal
 *   Memory Versioning Manager
 *     ↓ Nova revisão | Nenhuma alteração
 *   Memory Store
 *
 * Nunca:
 *   - cria memórias (isso é do Store)
 *   - busca memórias (isso é do Retrieval)
 *   - responde ao usuário
 *   - classifica memórias (isso é do Classifier)
 *   - consolida memórias (isso é do Consolidation Manager)
 *
 * Recebe uma Consolidation Proposal e um Memory Record.
 * Retorna uma nova revisão ou nenhuma alteração.
 * Nunca modifica diretamente o Memory Record original.
 *
 * Ações:
 *   CREATE  → primeira revisão (revision 1)
 *   UPDATE  → nova revisão (revision N+1)
 *   MERGE   → apenas registra proposta (não cria revisão)
 *   IGNORE  → nenhuma revisão
 *   REVIEW  → nenhuma alteração (aguardar decisão)
 *
 * Version Chain:
 *   Cada revisão conhece previousRevision e nextRevision.
 *   Apenas uma revisão ativa existe por memória.
 *   Histórico é imutável — versões antigas nunca são apagadas.
 */

const STORAGE_KEY = "memoryos:versioning:histories";

const VALID_ACTIONS = ["CREATE", "UPDATE", "MERGE", "IGNORE", "REVIEW"];

// === Observabilidade ===
const _stats = {
  versionCreated: 0,
  revisionApplied: 0,
  historyAccessed: 0,
  mergesRegistered: 0,
  ignores: 0,
  reviews: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

const _decisionLog = [];

function _recordTime(startTime) {
  _stats.totalProcessingTimeMs += Date.now() - startTime;
}

function _generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// === Storage (localStorage-backed, mesmo padrão dos demais módulos) ===
function _readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function _writeStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage indisponível
  }
}

function _deepCopy(obj) {
  if (!obj || typeof obj !== "object") return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Aplica uma Consolidation Proposal ao histórico de versionamento.
 *
 * @param {Object} proposal — Consolidation Proposal oficial
 * @param {Object} record — Memory Record (novo para CREATE, atualizado para UPDATE)
 * @returns {{ created: boolean, revision: number|null, memoryKey: string|null, reason: string, revisionRecord?: Object }}
 */
export function applyProposal(proposal, record) {
  const startTime = Date.now();
  _stats.operations++;

  if (!proposal || typeof proposal !== "object") {
    _recordTime(startTime);
    _decisionLog.push({
      action: "INVALID",
      reason: "Proposal ausente ou inválida",
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      revision: null,
      memoryKey: null,
      reason: "Consolidation Proposal ausente ou inválida.",
    };
  }

  const action = VALID_ACTIONS.includes(proposal.action) ? proposal.action : "REVIEW";
  const memoryKey = proposal.targetMemoryId || (record && record.id) || null;

  // Proposta não aprovada → tratar como REVIEW
  if (proposal.approved !== true) {
    _stats.reviews++;
    _recordTime(startTime);
    _decisionLog.push({
      action: "REVIEW",
      memoryKey,
      reasonCode: proposal.reasonCode,
      reason: "Proposal não aprovada",
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      revision: null,
      memoryKey,
      reason: "Proposal não aprovada — aguardando decisão futura.",
    };
  }

  // === IGNORE — não criar revisão ===
  if (action === "IGNORE") {
    _stats.ignores++;
    _recordTime(startTime);
    _decisionLog.push({
      action: "IGNORE",
      memoryKey,
      reasonCode: proposal.reasonCode,
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      revision: null,
      memoryKey,
      reason: "IGNORE — nenhuma revisão criada.",
    };
  }

  // === REVIEW — não criar revisão ===
  if (action === "REVIEW") {
    _stats.reviews++;
    _recordTime(startTime);
    _decisionLog.push({
      action: "REVIEW",
      memoryKey,
      reasonCode: proposal.reasonCode,
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      revision: null,
      memoryKey,
      reason: "REVIEW — aguardando decisão futura.",
    };
  }

  // === MERGE — apenas registrar proposta, não criar revisão ===
  if (action === "MERGE") {
    _stats.mergesRegistered++;
    _registerMergeProposal(proposal, memoryKey);
    _recordTime(startTime);
    _decisionLog.push({
      action: "MERGE",
      memoryKey,
      reasonCode: proposal.reasonCode,
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      revision: null,
      memoryKey,
      reason: "MERGE — proposta registrada, revisão não criada.",
    };
  }

  // === CREATE / UPDATE — criar nova revisão ===
  if (action === "CREATE" || action === "UPDATE") {
    if (!record || typeof record !== "object") {
      _recordTime(startTime);
      _decisionLog.push({
        action,
        memoryKey,
        reason: "Memory Record ausente",
        elapsed: Date.now() - startTime,
      });
      return {
        created: false,
        revision: null,
        memoryKey,
        reason: "Memory Record ausente para CREATE/UPDATE.",
      };
    }

    const key = memoryKey || record.id;
    if (!key) {
      _recordTime(startTime);
      return {
        created: false,
        revision: null,
        memoryKey: null,
        reason: "Sem chave para identificar a memória.",
      };
    }

    const histories = _readStorage();
    const history = histories[key] || {
      activeRevision: 0,
      revisions: [],
      mergeProposals: [],
    };

    const previousRevision =
      history.revisions.length > 0
        ? history.revisions[history.revisions.length - 1].revision
        : null;
    const newRevisionNumber = (previousRevision || 0) + 1;

    // Snapshot imutável — deep copy do record original
    const revisionRecord = {
      revision: newRevisionNumber,
      createdAt: new Date().toISOString(),
      proposalId: proposal.proposalId || _generateUUID(),
      reasonCode: proposal.reasonCode || "UNKNOWN",
      author: "system",
      previousRevision,
      nextRevision: null,
      recordSnapshot: _deepCopy(record),
    };

    // Atualiza nextRevision da revisão anterior
    if (history.revisions.length > 0) {
      history.revisions[history.revisions.length - 1].nextRevision =
        newRevisionNumber;
    }

    history.revisions.push(revisionRecord);
    history.activeRevision = newRevisionNumber;
    histories[key] = history;
    _writeStorage(histories);

    _stats.versionCreated++;
    _stats.revisionApplied++;

    _decisionLog.push({
      action,
      memoryKey: key,
      revision: newRevisionNumber,
      reasonCode: proposal.reasonCode,
      elapsed: Date.now() - startTime,
    });

    _recordTime(startTime);

    return {
      created: true,
      revision: newRevisionNumber,
      memoryKey: key,
      reason: `${action} — revisão ${newRevisionNumber} criada.`,
      revisionRecord: _deepCopy(revisionRecord),
    };
  }

  _recordTime(startTime);
  return {
    created: false,
    revision: null,
    memoryKey,
    reason: "Ação desconhecida.",
  };
}

function _registerMergeProposal(proposal, memoryKey) {
  if (!memoryKey) return;
  const histories = _readStorage();
  const history = histories[memoryKey] || {
    activeRevision: 0,
    revisions: [],
    mergeProposals: [],
  };
  history.mergeProposals.push({
    proposalId: proposal.proposalId,
    createdAt: proposal.createdAt || new Date().toISOString(),
    reasonCode: proposal.reasonCode || "POSSIBLE_MERGE",
    reason: proposal.reason || "",
    candidateMemories: _deepCopy(proposal.candidateMemories || []),
  });
  histories[memoryKey] = history;
  _writeStorage(histories);
}

// === Consultas ===

/**
 * Retorna a revisão ativa (mais recente) de uma memória.
 * @param {string} memoryKey
 * @returns {Object|null}
 */
export function getLatest(memoryKey) {
  _stats.historyAccessed++;
  if (!memoryKey) return null;
  const histories = _readStorage();
  const history = histories[memoryKey];
  if (!history || !history.revisions || history.revisions.length === 0) return null;
  return _deepCopy(history.revisions[history.revisions.length - 1]);
}

/**
 * Retorna uma revisão específica de uma memória.
 * @param {string} memoryKey
 * @param {number} revision
 * @returns {Object|null}
 */
export function getRevision(memoryKey, revision) {
  _stats.historyAccessed++;
  if (!memoryKey || typeof revision !== "number") return null;
  const histories = _readStorage();
  const history = histories[memoryKey];
  if (!history || !history.revisions) return null;
  const found = history.revisions.find((r) => r.revision === revision);
  return found ? _deepCopy(found) : null;
}

/**
 * Retorna o histórico completo de uma memória.
 * @param {string} memoryKey
 * @returns {{ memoryKey: string, revisions: array, activeRevision: number|null, mergeProposals: array }}
 */
export function getHistory(memoryKey) {
  _stats.historyAccessed++;
  if (!memoryKey) {
    return { memoryKey: null, revisions: [], activeRevision: null, mergeProposals: [] };
  }
  const histories = _readStorage();
  const history = histories[memoryKey];
  if (!history || !history.revisions) {
    return { memoryKey, revisions: [], activeRevision: null, mergeProposals: [] };
  }
  return {
    memoryKey,
    revisions: _deepCopy(history.revisions),
    activeRevision: history.activeRevision,
    mergeProposals: _deepCopy(history.mergeProposals || []),
  };
}

/**
 * Conta o número de revisões de uma memória.
 * @param {string} memoryKey
 * @returns {number}
 */
export function countRevisions(memoryKey) {
  if (!memoryKey) return 0;
  const histories = _readStorage();
  const history = histories[memoryKey];
  if (!history || !history.revisions) return 0;
  return history.revisions.length;
}

// === Observabilidade ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.operations > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
        : 0,
  };
}

export function getDecisionLog() {
  return [..._decisionLog];
}

export function _resetForTests() {
  _stats.versionCreated = 0;
  _stats.revisionApplied = 0;
  _stats.historyAccessed = 0;
  _stats.mergesRegistered = 0;
  _stats.ignores = 0;
  _stats.reviews = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _decisionLog.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

export default {
  applyProposal,
  getLatest,
  getRevision,
  getHistory,
  countRevisions,
  getStats,
  getDecisionLog,
  _resetForTests,
};