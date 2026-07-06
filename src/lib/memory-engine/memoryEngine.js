/**
 * Memory Engine (Sprint 22 — Memory Engine)
 *
 * Responsabilidade única: Receber uma Memory Update Proposal e decidir,
 * de forma determinística, como essa proposta será persistida.
 *
 * O QUE FAZ:
 *   - Receber Memory Update Proposal
 *   - Validar a proposta recebida
 *   - Validar o contrato
 *   - Aplicar políticas de memória
 *   - Identificar duplicidades
 *   - Identificar conflitos
 *   - Resolver conflitos
 *   - Decidir CREATE / UPDATE / MERGE / IGNORE
 *   - Persistir o resultado
 *   - Registrar auditoria
 *   - Gerar estatísticas
 *   - Produzir Memory Update Result
 *
 * O QUE NÃO FAZ:
 *   - Modificar qualquer camada anterior (Learning, Execution, Planning,
 *     Decision, Reasoning, Attention, Perception, Input, Memory Integration)
 *   - Chamar LLM
 *   - Executar HTTP
 *   - Acessar APIs externas
 *   - Executar Retry / Reflexão automática
 *   - Alterar a Memory Update Proposal recebida
 *
 * Arquitetura:
 *   ... → Memory Integration → Memory Engine → (persistência)
 */

import {
  buildMemoryUpdateResult,
  buildStorageHints,
  buildQualityMetrics,
  validateMemoryUpdateResult,
} from "./memoryResult";
import {
  validateMemoryUpdateProposal as validateProposalContract,
} from "@/lib/memory-integration/memoryUpdateProposal";
import { evaluatePolicies, shouldDefer } from "./memoryPolicyEngine";
import { findDuplicates, findInternalDuplicates } from "./memoryDeduplicator";
import { resolveConflicts } from "./memoryConflictResolver";
import * as storage from "./memoryStorage";
import * as audit from "./memoryAudit";

// === Observability ===
const _stats = {
  proposalsReceived: 0,
  proposalsRejected: 0,
  proposalsPersisted: 0,
  proposalsDeferred: 0,
  proposalsSkipped: 0,
  memoriesCreated: 0,
  memoriesUpdated: 0,
  duplicatesFound: 0,
  conflictsResolved: 0,
  conflictsUnresolved: 0,
  actionDistribution: { CREATE: 0, UPDATE: 0, MERGE: 0, IGNORE: 0 },
  statusDistribution: { PERSISTED: 0, SKIPPED: 0, REJECTED: 0, DEFERRED: 0 },
  totalProcessingTimeMs: 0,
  eventLog: [],
};

function _log(event, data) {
  _stats.eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Validate Proposal ===
function _validateProposal(proposal) {
  if (!proposal || typeof proposal !== "object") {
    return { valid: false, error: "proposal is not an object" };
  }

  const contractValidation = validateProposalContract(proposal);
  if (!contractValidation.valid) {
    return { valid: false, error: contractValidation.error };
  }

  if (!proposal.proposalId) {
    return { valid: false, error: "missing proposalId" };
  }

  return { valid: true, error: null };
}

// === Decide Action ===
function _decideAction(proposal, totalDuplicates, conflictResolution) {
  // IGNORE: proposal type is "ignore"
  if (proposal.proposalType === "ignore") {
    return "IGNORE";
  }

  // If there are unresolved conflicts → defer, but action reflects intent
  if (conflictResolution.unresolved.length > 0) {
    const typeMap = { create: "CREATE", update: "UPDATE", merge: "MERGE", ignore: "IGNORE" };
    return typeMap[proposal.proposalType] || "CREATE";
  }

  // MERGE: duplicates found
  if (totalDuplicates > 0) {
    return "MERGE";
  }

  // Use the proposal's suggested type
  const typeMap = { create: "CREATE", update: "UPDATE", merge: "MERGE", ignore: "IGNORE" };
  return typeMap[proposal.proposalType] || "CREATE";
}

// === Sprint 22.1 — Deterministic enrichment helpers ===

const _confidenceToScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const _priorityBoost = { low: 5, normal: 10, high: 20, critical: 25 };

function _clampScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function _computeImportanceScore(confidence, priority) {
  const baseScore = (_confidenceToScore[confidence] || 1) * 25;
  const boost = _priorityBoost[priority] || 10;
  return _clampScore(baseScore + boost);
}

// Sprint 22.1 — Deterministic memoryRecordId derived from memoryId.
// Reproducible: same memoryId always maps to the same recordId. No randomness.
function _generateMemoryRecordId(memoryId) {
  // Simple deterministic hash from the memoryId string
  let hash = 0;
  const str = String(memoryId);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `mrec-${Math.abs(hash)}`;
}

function _decideStoragePolicy(suggested, proposal) {
  // High confidence + high priority → LONG_TERM_MEMORY
  // Medium confidence → SHORT_TERM_MEMORY
  // Low confidence → WORKING_MEMORY
  // Episodic-type memories (incident, procedure) → EPISODIC_MEMORY
  // Fact-type with high confidence → SEMANTIC_MEMORY
  if (suggested.memoryType === "incident" || suggested.memoryType === "procedure") {
    return "EPISODIC_MEMORY";
  }
  if (suggested.memoryType === "fact" && suggested.confidence === "HIGH") {
    return "SEMANTIC_MEMORY";
  }
  if (suggested.confidence === "HIGH" && (proposal.priority === "high" || proposal.priority === "critical")) {
    return "LONG_TERM_MEMORY";
  }
  if (suggested.confidence === "LOW") {
    return "WORKING_MEMORY";
  }
  return "SHORT_TERM_MEMORY";
}

function _decideRetentionPolicy(suggested, proposal) {
  // Critical priority → PERMANENT
  // High confidence facts → PERMANENT
  // Low confidence → DELETE_AFTER_X_DAYS
  // Medium → TEMPORARY
  // Archived (old duplicates being merged) → ARCHIVE
  if (proposal.priority === "critical") {
    return "PERMANENT";
  }
  if (suggested.confidence === "LOW") {
    return "DELETE_AFTER_X_DAYS";
  }
  if (suggested.confidence === "HIGH" && suggested.memoryType === "fact") {
    return "PERMANENT";
  }
  return "TEMPORARY";
}

// === Apply Proposal (main entry point) ===

/**
 * Recebe uma Memory Update Proposal e produz um Memory Update Result.
 *
 * @param {Object} proposal — Memory Update Proposal (from Sprint 21)
 * @returns {Object} Memory Update Result
 */
export function applyProposal(proposal) {
  _stats.proposalsReceived++;
  const startTime = Date.now();
  audit.record("RECEIVE", "proposal_received", `Proposal ${proposal?.proposalId || "unknown"} received`);

  // 1. Validate proposal
  const validation = _validateProposal(proposal);
  if (!validation.valid) {
    _stats.proposalsRejected++;
    _stats.statusDistribution.REJECTED++;
    audit.record("VALIDATE", "proposal_rejected", validation.error);
    _log("proposalRejected", { error: validation.error });

    const result = buildMemoryUpdateResult({
      proposalId: proposal?.proposalId || null,
      action: "IGNORE",
      status: "REJECTED",
      persistedMemories: [],
      duplicatesFound: 0,
      conflictsResolved: 0,
      conflictsUnresolved: 0,
      policyDecisions: [],
      auditTrail: audit.getTrail(),
      confidence: "LOW",
      requiresReview: true,
    });

    _stats.totalProcessingTimeMs += Date.now() - startTime;
    audit.clear();
    return result;
  }

  audit.record("VALIDATE", "proposal_validated", "Proposal contract is valid");

  // 2. Apply policies
  const policyDecisions = evaluatePolicies(proposal);
  audit.record("POLICY", "policies_evaluated", `${policyDecisions.length} policies evaluated`);

  // 3. Check if proposal should be ignored
  if (proposal.proposalType === "ignore") {
    _stats.proposalsSkipped++;
    _stats.statusDistribution.SKIPPED++;
    _stats.actionDistribution.IGNORE++;
    audit.record("DECIDE", "action_ignore", "Proposal type is ignore");
    _log("proposalSkipped", { proposalId: proposal.proposalId });

    const result = buildMemoryUpdateResult({
      proposalId: proposal.proposalId,
      action: "IGNORE",
      status: "SKIPPED",
      persistedMemories: [],
      duplicatesFound: 0,
      conflictsResolved: 0,
      conflictsUnresolved: 0,
      policyDecisions,
      auditTrail: audit.getTrail(),
      confidence: proposal.confidence,
      requiresReview: false,
    });

    _stats.totalProcessingTimeMs += Date.now() - startTime;
    audit.clear();
    return result;
  }

  // 4. Resolve conflicts
  const conflictResolution = resolveConflicts(proposal.conflicts, proposal.knowledgeItems);
  _stats.conflictsResolved += conflictResolution.resolved.length;
  _stats.conflictsUnresolved += conflictResolution.unresolved.length;
  audit.record(
    "CONFLICT",
    "conflicts_resolved",
    `${conflictResolution.resolved.length} resolved, ${conflictResolution.unresolved.length} unresolved`
  );

  // 5. Find duplicates (external + internal)
  const existingMemories = storage.list();
  const externalDuplicates = findDuplicates(proposal.suggestedMemories, existingMemories);
  const internalDuplicates = findInternalDuplicates(proposal.suggestedMemories);
  const totalDuplicates = externalDuplicates.length + internalDuplicates.length;
  _stats.duplicatesFound += totalDuplicates;
  audit.record(
    "DEDUP",
    "duplicates_found",
    `${externalDuplicates.length} external, ${internalDuplicates.length} internal`
  );

  // 6. Decide action
  const action = _decideAction(proposal, totalDuplicates, conflictResolution);

  // 7. Check if should defer
  const needsDeferral = shouldDefer(proposal, policyDecisions, conflictResolution.unresolved.length);

  if (needsDeferral) {
    _stats.proposalsDeferred++;
    _stats.statusDistribution.DEFERRED++;
    _stats.actionDistribution[action]++;
    audit.record("DECIDE", "action_deferred", "Proposal deferred for review");
    _log("proposalDeferred", { proposalId: proposal.proposalId, action });

    const result = buildMemoryUpdateResult({
      proposalId: proposal.proposalId,
      action,
      status: "DEFERRED",
      persistedMemories: [],
      duplicatesFound: totalDuplicates,
      conflictsResolved: conflictResolution.resolved.length,
      conflictsUnresolved: conflictResolution.unresolved.length,
      policyDecisions,
      auditTrail: audit.getTrail(),
      confidence: proposal.confidence,
      requiresReview: true,
    });

    _stats.totalProcessingTimeMs += Date.now() - startTime;
    audit.clear();
    return result;
  }

  // 8. Persist memories
  const persistedMemories = [];
  const isMerge = totalDuplicates > 0;
  const finalAction = isMerge ? "MERGE" : action;

  // Collect IDs of discarded knowledge items from conflict resolution
  const discardedContents = new Set();
  for (const res of conflictResolution.resolved) {
    for (const disc of res.discarded) {
      discardedContents.add(disc.content);
    }
  }

  for (const suggested of proposal.suggestedMemories) {
    // Skip items that were discarded by conflict resolution
    if (discardedContents.has(suggested.content)) {
      continue;
    }

    const wasNew = storage.findByContent(suggested.content).length === 0;
    const stored = storage.store({
      memoryType: suggested.memoryType,
      content: suggested.content,
      tags: suggested.tags,
      confidence: suggested.confidence,
      source: "proposal",
    });

    // Sprint 22.1 — Enrich with memoryRecordId, storagePolicy, retentionPolicy,
    // importanceScore, storageHints, qualityMetrics (deterministic, no randomness).
    // Memory Engine only DEFINES these; it never executes persistence.
    const importanceScore = _computeImportanceScore(suggested.confidence, proposal.priority);
    const storageHints = buildStorageHints({
      category: suggested.memoryType,
      priority: proposal.priority,
      recommendedIndexes: [suggested.memoryType, ...(suggested.tags || [])],
      compression: importanceScore < 50,
      versioning: true,
      notes: `Derived from proposal ${proposal.proposalId}`,
    });
    const qualityMetrics = buildQualityMetrics({
      confidence: importanceScore,
      consistency: importanceScore,
      completeness: suggested.confidence === "HIGH" ? 90 : suggested.confidence === "MEDIUM" ? 70 : 50,
      relevance: importanceScore,
      reliability: importanceScore,
    });

    const enriched = Object.freeze({
      ...stored,
      memoryRecordId: _generateMemoryRecordId(stored.memoryId),
      storagePolicy: _decideStoragePolicy(suggested, proposal),
      retentionPolicy: _decideRetentionPolicy(suggested, proposal),
      importanceScore,
      storageHints,
      qualityMetrics,
    });

    persistedMemories.push(enriched);

    if (wasNew) {
      _stats.memoriesCreated++;
    } else {
      _stats.memoriesUpdated++;
    }
  }

  audit.record(
    "PERSIST",
    "memories_persisted",
    `${persistedMemories.length} memories persisted (action: ${finalAction})`
  );

  _stats.proposalsPersisted++;
  _stats.statusDistribution.PERSISTED++;
  _stats.actionDistribution[finalAction]++;
  _log("proposalPersisted", {
    proposalId: proposal.proposalId,
    action: finalAction,
    memories: persistedMemories.length,
  });

  // 9. Produce Memory Update Result
  const result = buildMemoryUpdateResult({
    proposalId: proposal.proposalId,
    action: finalAction,
    status: "PERSISTED",
    persistedMemories,
    duplicatesFound: totalDuplicates,
    conflictsResolved: conflictResolution.resolved.length,
    conflictsUnresolved: conflictResolution.unresolved.length,
    policyDecisions,
    auditTrail: audit.getTrail(),
    confidence: proposal.confidence,
    requiresReview: false,
  });

  _stats.totalProcessingTimeMs += Date.now() - startTime;
  audit.clear();
  return result;
}

// === Describe Result ===

/**
 * Produz descrição legível do resultado.
 */
export function describeResult(result) {
  if (!result) return null;

  const lines = [
    `Resultado ${result.resultId}`,
    `  Proposta: ${result.proposalId || "—"}`,
    `  Ação: ${result.action}`,
    `  Status: ${result.status}`,
    `  Confiança: ${result.confidence}`,
    `  Memórias persistidas: ${result.persistedMemories.length}`,
    `  Duplicidades: ${result.duplicatesFound}`,
    `  Conflitos resolvidos: ${result.conflictsResolved}`,
    `  Conflitos não resolvidos: ${result.conflictsUnresolved}`,
    `  Requer revisão: ${result.requiresReview ? "Sim" : "Não"}`,
  ];

  if (result.persistedMemories.length > 0) {
    lines.push("  Memórias:");
    for (const m of result.persistedMemories) {
      lines.push(
        `    • [${m.memoryId}|${m.memoryType}|${m.confidence}] ${m.content}`
      );
      lines.push(
        `      recordId=${m.memoryRecordId} storage=${m.storagePolicy} retention=${m.retentionPolicy} importance=${m.importanceScore}`
      );
      if (m.qualityMetrics) {
        const qm = m.qualityMetrics;
        lines.push(
          `      quality: conf=${qm.confidence} consist=${qm.consistency} compl=${qm.completeness} rel=${qm.relevance} relb=${qm.reliability}`
        );
      }
    }
  }

  if (result.policyDecisions.length > 0) {
    lines.push("  Políticas:");
    for (const p of result.policyDecisions) {
      lines.push(`    ${p.applied ? "✓" : "✗"} ${p.policy}: ${p.reason}`);
    }
  }

  if (result.auditTrail.length > 0) {
    lines.push("  Auditoria:");
    for (const a of result.auditTrail) {
      lines.push(`    [${a.step}] ${a.action}: ${a.detail}`);
    }
  }

  return lines.join("\n");
}

// === Validate Result ===

export function validateResult(result) {
  return validateMemoryUpdateResult(result);
}

// === Storage access (for tests and inspection) ===

export function getStorageState() {
  return storage.list();
}

export function clearStorage() {
  storage.clear();
}

// === Observability ===

export function getStats() {
  return {
    proposalsReceived: _stats.proposalsReceived,
    proposalsRejected: _stats.proposalsRejected,
    proposalsPersisted: _stats.proposalsPersisted,
    proposalsDeferred: _stats.proposalsDeferred,
    proposalsSkipped: _stats.proposalsSkipped,
    memoriesCreated: _stats.memoriesCreated,
    memoriesUpdated: _stats.memoriesUpdated,
    duplicatesFound: _stats.duplicatesFound,
    conflictsResolved: _stats.conflictsResolved,
    conflictsUnresolved: _stats.conflictsUnresolved,
    actionDistribution: { ..._stats.actionDistribution },
    statusDistribution: { ..._stats.statusDistribution },
    averageProcessingTime:
      _stats.proposalsReceived > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.proposalsReceived)
        : 0,
    storedMemories: storage.size(),
    eventLog: [..._stats.eventLog],
  };
}

export function getDecisionLog() {
  return [..._stats.eventLog];
}

export function _resetForTests() {
  _stats.proposalsReceived = 0;
  _stats.proposalsRejected = 0;
  _stats.proposalsPersisted = 0;
  _stats.proposalsDeferred = 0;
  _stats.proposalsSkipped = 0;
  _stats.memoriesCreated = 0;
  _stats.memoriesUpdated = 0;
  _stats.duplicatesFound = 0;
  _stats.conflictsResolved = 0;
  _stats.conflictsUnresolved = 0;
  _stats.actionDistribution = { CREATE: 0, UPDATE: 0, MERGE: 0, IGNORE: 0 };
  _stats.statusDistribution = { PERSISTED: 0, SKIPPED: 0, REJECTED: 0, DEFERRED: 0 };
  _stats.totalProcessingTimeMs = 0;
  _stats.eventLog.length = 0;
  storage.clear();
  audit.clear();
}

export default {
  applyProposal,
  describeResult,
  validateResult,
  getStats,
  getDecisionLog,
  getStorageState,
  clearStorage,
  _resetForTests,
};