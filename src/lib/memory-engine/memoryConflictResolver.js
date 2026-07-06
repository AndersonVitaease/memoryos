/**
 * Memory Conflict Resolver (Sprint 22 — Memory Engine)
 *
 * Resolve conflitos de forma determinística.
 *
 * Estratégias:
 *   - confidence_mismatch → KEEP_HIGHEST_CONFIDENCE (resolúvel)
 *   - content_contradiction → DEFER_MANUAL_REVIEW (não resolúvel)
 *   - unknown → DEFER_MANUAL_REVIEW (não resolúvel)
 */

export const RESOLUTION_STRATEGIES = [
  "KEEP_HIGHEST_CONFIDENCE",
  "DEFER_MANUAL_REVIEW",
];

const _confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };

/**
 * Resolve conflitos a partir dos conflitos e itens de conhecimento.
 * Retorna { resolved, unresolved, strategy }.
 */
export function resolveConflicts(conflicts, knowledgeItems) {
  const resolved = [];
  const unresolved = [];

  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return { resolved, unresolved, strategy: "NONE" };
  }

  const itemMap = {};
  if (Array.isArray(knowledgeItems)) {
    for (const item of knowledgeItems) {
      if (item && item.id) {
        itemMap[item.id] = item;
      }
    }
  }

  for (const conflict of conflicts) {
    const conflictItems = (conflict.items || [])
      .map((id) => itemMap[id])
      .filter((item) => item !== undefined);

    if (conflict.type === "confidence_mismatch" && conflictItems.length >= 2) {
      // Keep the highest confidence item, discard the rest
      const sorted = [...conflictItems].sort((a, b) => {
        return (_confidenceOrder[b.confidence] || 0) - (_confidenceOrder[a.confidence] || 0);
      });

      resolved.push({
        conflict,
        strategy: "KEEP_HIGHEST_CONFIDENCE",
        kept: sorted[0],
        discarded: sorted.slice(1),
      });
    } else if (conflict.type === "content_contradiction") {
      // Cannot resolve automatically — defer for manual review
      unresolved.push({
        conflict,
        strategy: "DEFER_MANUAL_REVIEW",
        reason: "Content contradiction cannot be resolved deterministically",
      });
    } else {
      // Unknown conflict type — defer
      unresolved.push({
        conflict,
        strategy: "DEFER_MANUAL_REVIEW",
        reason: `Unknown conflict type: ${conflict.type}`,
      });
    }
  }

  return {
    resolved,
    unresolved,
    strategy: unresolved.length > 0 ? "PARTIAL" : "FULL",
  };
}

/**
 * Conta quantos conflitos são resolvíveis (confidence_mismatch).
 */
export function getResolvableCount(conflicts) {
  if (!Array.isArray(conflicts)) return 0;
  return conflicts.filter((c) => c.type === "confidence_mismatch").length;
}

/**
 * Conta quantos conflitos NÃO são resolvíveis.
 */
export function getUnresolvableCount(conflicts) {
  if (!Array.isArray(conflicts)) return 0;
  return conflicts.filter((c) => c.type !== "confidence_mismatch").length;
}