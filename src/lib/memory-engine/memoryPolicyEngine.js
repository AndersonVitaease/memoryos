/**
 * Memory Policy Engine (Sprint 22 — Memory Engine)
 *
 * Aplica políticas de persistência de forma determinística.
 * Decide se uma proposta deve ser persistida, adiada ou rejeitada.
 *
 * NÃO chama LLM, NÃO acessa APIs externas.
 */

export const POLICY_NAMES = [
  "IGNORE_PROPOSAL",
  "LOW_CONFIDENCE_DEFER",
  "HIGH_CONFIDENCE_PERSIST",
  "UNRESOLVED_CONFLICT_DEFER",
  "REQUIRES_REVIEW_FLAG",
];

/**
 * Avalia todas as políticas aplicáveis a uma proposta.
 * Retorna uma lista de PolicyDecisions.
 */
export function evaluatePolicies(proposal) {
  const decisions = [];

  // Policy: IGNORE_PROPOSAL
  if (proposal.proposalType === "ignore") {
    decisions.push({
      policy: "IGNORE_PROPOSAL",
      applied: true,
      reason: "Proposal type is 'ignore' — no memory will be persisted",
    });
    return decisions;
  } else {
    decisions.push({
      policy: "IGNORE_PROPOSAL",
      applied: false,
      reason: `Proposal type is '${proposal.proposalType}'`,
    });
  }

  // Policy: LOW_CONFIDENCE_DEFER
  if (proposal.confidence === "LOW") {
    decisions.push({
      policy: "LOW_CONFIDENCE_DEFER",
      applied: true,
      reason: "Confidence is LOW — proposal deferred for manual review",
    });
  } else {
    decisions.push({
      policy: "LOW_CONFIDENCE_DEFER",
      applied: false,
      reason: `Confidence is ${proposal.confidence} — no deferral needed`,
    });
  }

  // Policy: HIGH_CONFIDENCE_PERSIST
  if (proposal.confidence === "HIGH" && (proposal.conflicts || []).length === 0) {
    decisions.push({
      policy: "HIGH_CONFIDENCE_PERSIST",
      applied: true,
      reason: "High confidence with no conflicts — eligible for persistence",
    });
  } else {
    decisions.push({
      policy: "HIGH_CONFIDENCE_PERSIST",
      applied: false,
      reason: "Conditions for high-confidence persistence not met",
    });
  }

  // Policy: UNRESOLVED_CONFLICT_DEFER
  if ((proposal.conflicts || []).length > 0) {
    decisions.push({
      policy: "UNRESOLVED_CONFLICT_DEFER",
      applied: true,
      reason: `${proposal.conflicts.length} conflict(s) detected — will attempt resolution`,
    });
  } else {
    decisions.push({
      policy: "UNRESOLVED_CONFLICT_DEFER",
      applied: false,
      reason: "No conflicts detected",
    });
  }

  // Policy: REQUIRES_REVIEW_FLAG
  if (proposal.requiresReview) {
    decisions.push({
      policy: "REQUIRES_REVIEW_FLAG",
      applied: true,
      reason: "Proposal flagged for review by upstream layer",
    });
  } else {
    decisions.push({
      policy: "REQUIRES_REVIEW_FLAG",
      applied: false,
      reason: "No review flag set",
    });
  }

  return decisions;
}

/**
 * Determina se a proposta deve ser persistida com base nas políticas.
 */
export function shouldPersist(proposal, policyDecisions) {
  const ignore = policyDecisions.find((d) => d.policy === "IGNORE_PROPOSAL");
  if (ignore?.applied) return false;

  const defer = policyDecisions.find((d) => d.policy === "LOW_CONFIDENCE_DEFER");
  if (defer?.applied) return false;

  return true;
}

/**
 * Determina se a proposta deve ser adiada para revisão manual.
 */
export function shouldDefer(proposal, policyDecisions, unresolvedConflicts) {
  const lowConf = policyDecisions.find((d) => d.policy === "LOW_CONFIDENCE_DEFER");
  if (lowConf?.applied) return true;

  if (unresolvedConflicts > 0) return true;

  if (proposal.requiresReview) return true;

  return false;
}