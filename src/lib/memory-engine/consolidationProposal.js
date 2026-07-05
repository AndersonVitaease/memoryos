/**
 * Consolidation Proposal — Contrato Oficial (Sprint 7)
 *
 * Esta é a única entrada aceita pelo Memory Versioning Manager.
 * Produzida pelo Memory Consolidation Manager (Sprint 6) e formalizada
 * neste contrato antes de chegar ao Versioning.
 *
 * Estrutura oficial:
 *   {
 *     proposalId: string (UUID),
 *     action: "CREATE" | "UPDATE" | "MERGE" | "IGNORE" | "REVIEW",
 *     targetMemoryId: string | null,
 *     candidateMemories: array,
 *     confidence: "low" | "medium" | "high",
 *     reasonCode: string,
 *     reason: string,
 *     createdAt: datetime (ISO),
 *     approved: boolean
 *   }
 *
 * Nunca é uma mensagem do usuário. É sempre produto do Consolidation Manager.
 */

export const PROPOSAL_ACTIONS = ["CREATE", "UPDATE", "MERGE", "IGNORE", "REVIEW"];

export const PROPOSAL_FIELDS = [
  "proposalId",
  "action",
  "targetMemoryId",
  "candidateMemories",
  "confidence",
  "reasonCode",
  "reason",
  "createdAt",
  "approved",
];

const VALID_CONFIDENCE = ["low", "medium", "high"];

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

/**
 * Constrói uma Consolidation Proposal oficial a partir da saída
 * do Consolidation Manager ou de parâmetros diretos.
 *
 * @param {Object} params
 * @param {string} params.action — CREATE | UPDATE | MERGE | IGNORE | REVIEW
 * @param {string} [params.targetMemoryId] — ID da memória alvo (null para CREATE)
 * @param {Array} [params.candidateMemories] — IDs/memórias candidatas (para MERGE)
 * @param {string} [params.confidence] — low | medium | high
 * @param {string} [params.reasonCode] — código de razão
 * @param {string} [params.reason] — descrição
 * @param {boolean} [params.approved] — se a proposta está aprovada (default: true)
 * @returns {Object} Consolidation Proposal
 */
export function buildProposal({
  action,
  targetMemoryId = null,
  candidateMemories = [],
  confidence = "low",
  reasonCode = "UNKNOWN",
  reason = "",
  approved = true,
}) {
  return {
    proposalId: _generateUUID(),
    action: PROPOSAL_ACTIONS.includes(action) ? action : "REVIEW",
    targetMemoryId: targetMemoryId || null,
    candidateMemories: Array.isArray(candidateMemories) ? candidateMemories : [],
    confidence: VALID_CONFIDENCE.includes(confidence) ? confidence : "low",
    reasonCode: reasonCode || "UNKNOWN",
    reason: reason || "",
    createdAt: new Date().toISOString(),
    approved: approved === true,
  };
}

/**
 * Valida uma Consolidation Proposal antes de enviar ao Versioning Manager.
 *
 * @param {Object} proposal
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProposal(proposal) {
  const errors = [];

  if (!proposal || typeof proposal !== "object") {
    return { valid: false, errors: ["Consolidation Proposal ausente ou inválida."] };
  }

  if (!proposal.proposalId || typeof proposal.proposalId !== "string") {
    errors.push("proposalId é obrigatório (string).");
  }
  if (!PROPOSAL_ACTIONS.includes(proposal.action)) {
    errors.push(`action inválido: "${proposal.action}".`);
  }
  if (!VALID_CONFIDENCE.includes(proposal.confidence)) {
    errors.push(`confidence inválido: "${proposal.confidence}".`);
  }
  if (!proposal.createdAt || typeof proposal.createdAt !== "string") {
    errors.push("createdAt é obrigatório (ISO datetime).");
  }
  if (typeof proposal.approved !== "boolean") {
    errors.push("approved deve ser boolean.");
  }

  return { valid: errors.length === 0, errors };
}

export default {
  buildProposal,
  validateProposal,
  PROPOSAL_ACTIONS,
  PROPOSAL_FIELDS,
};