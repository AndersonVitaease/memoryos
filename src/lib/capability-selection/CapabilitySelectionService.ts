/**
 * CapabilitySelectionService.ts — Sprint C-03.6
 * Algoritmo puro de avaliação e ranking de Capabilities.
 *
 * SRP: lógica de scoring sem efeitos colaterais.
 * Determinístico: mesmo input → mesmo output, sempre.
 * Sem IA, LLM, embeddings ou similaridade probabilística.
 */

import type {
  Goal,
  CapabilityDescriptor,
  RankedCandidate,
  CapabilitySelectionRequest,
} from "./CapabilitySelectionTypes";

// ── Scoring weights ───────────────────────────────────────────────────────────

const W_GOAL_TYPE  = 40;   // goal.type ∈ descriptor.goalTypes
const W_ACTION     = 25;   // goal.action ∈ descriptor.supportedActions
const W_CATEGORY   = 20;   // goal.category ∈ descriptor.supportedCategories
const W_RUNTIME    = 10;   // required runtimes satisfied
const W_PRIORITY   =  5;   // descriptor.priority (lower = better)
const MAX_PRIORITY =  10;  // assumed max priority value

export class CapabilitySelectionService {
  /**
   * Avalia e classifica todas as capabilities.
   * Retorna lista ordenada — maior score primeiro.
   * Determinístico: desempate por id lexicográfico.
   */
  rank(
    req: CapabilitySelectionRequest,
  ): readonly RankedCandidate[] {
    const { goal, availableCapabilities, availableRuntimes = [] } = req;

    const ranked: RankedCandidate[] = availableCapabilities.map(cap =>
      this._score(goal, cap, availableRuntimes),
    );

    // Sort: score desc, then priority asc, then id asc (deterministic tiebreak)
    return Object.freeze(
      ranked.sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : a.priorityScore !== b.priorityScore
            ? b.priorityScore - a.priorityScore
            : a.capabilityId.localeCompare(b.capabilityId),
      ),
    );
  }

  /**
   * Filtra candidates incompatíveis (score === 0 ou status unavailable).
   */
  filter(ranked: readonly RankedCandidate[]): readonly RankedCandidate[] {
    return Object.freeze(ranked.filter(c => c.score > 0 && c.discardReason === null));
  }

  // ── Private scoring ───────────────────────────────────────────────────────

  private _score(
    goal: Goal,
    cap:  CapabilityDescriptor,
    availableRuntimes: readonly string[],
  ): RankedCandidate {
    if (cap.status === "unavailable") {
      return this._discard(cap, "Capability status is unavailable");
    }

    // Goal type compatibility — hard gate
    const goalTypeMatch = cap.goalTypes.length === 0 || cap.goalTypes.includes(goal.type);
    if (!goalTypeMatch) {
      return this._discard(cap, `Goal type "${goal.type}" not in [${cap.goalTypes.join(", ")}]`);
    }

    // Action compatibility — hard gate
    const actionMatch = cap.supportedActions.length === 0 || cap.supportedActions.includes(goal.action);
    if (!actionMatch) {
      return this._discard(cap, `Action "${goal.action}" not in [${cap.supportedActions.join(", ")}]`);
    }

    // Category — soft
    const categoryMatch = cap.supportedCategories.length === 0 || cap.supportedCategories.includes(goal.category);
    const categoryScore  = categoryMatch ? W_CATEGORY : 0;

    // Runtime satisfaction — soft
    const runtimeScore = this._runtimeScore(cap.requiredRuntimes, availableRuntimes);

    // Priority score: lower priority number = higher score
    const priorityScore = Math.max(0, ((MAX_PRIORITY - cap.priority) / MAX_PRIORITY) * W_PRIORITY);

    const actionScore   = W_ACTION;    // already passed hard gate
    const goalTypeScore = W_GOAL_TYPE; // already passed hard gate

    const rawScore =
      goalTypeScore +
      actionScore   +
      categoryScore +
      runtimeScore  +
      priorityScore;

    // Apply confidence weight
    const score = parseFloat((rawScore * cap.confidenceWeight).toFixed(4));

    return Object.freeze({
      capabilityId:   cap.id,
      capabilityName: cap.name,
      score,
      priorityScore:  parseFloat(priorityScore.toFixed(4)),
      actionScore,
      categoryScore,
      runtimeScore,
      selected:       false,
      discardReason:  null,
    });
  }

  private _runtimeScore(required: readonly string[], available: readonly string[]): number {
    if (required.length === 0) return W_RUNTIME; // no runtimes required = full score
    if (available.length === 0) return W_RUNTIME * 0.5; // unknown availability = partial
    const satisfied = required.filter(r => available.includes(r)).length;
    return parseFloat(((satisfied / required.length) * W_RUNTIME).toFixed(4));
  }

  private _discard(cap: CapabilityDescriptor, reason: string): RankedCandidate {
    return Object.freeze({
      capabilityId:   cap.id,
      capabilityName: cap.name,
      score:          0,
      priorityScore:  0,
      actionScore:    0,
      categoryScore:  0,
      runtimeScore:   0,
      selected:       false,
      discardReason:  reason,
    });
  }
}