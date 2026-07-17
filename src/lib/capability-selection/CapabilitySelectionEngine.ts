/**
 * CapabilitySelectionEngine.ts — Sprint C-03.6
 * Único ponto de entrada para seleção de Capabilities.
 *
 * Nenhum componente externo poderá selecionar Capabilities diretamente.
 * Toda seleção obrigatoriamente passa por este Engine.
 *
 * Proibido:
 *   - Executar Capabilities
 *   - Chamar Connector Runtime
 *   - Usar IA / LLM / Embeddings
 *   - Modificar o Goal recebido
 */

import { CapabilitySelectionService }  from "./CapabilitySelectionService";
import { CSETelemetry }                from "./CapabilitySelectionTelemetry";
import type {
  CapabilitySelectionRequest,
  SelectionResult,
  CapabilitySelectionResult,
  CapabilityNotFoundResult,
  RankedCandidate,
  EngineHealth,
  EngineHealthStatus,
} from "./CapabilitySelectionTypes";

export class CapabilitySelectionEngine {
  private readonly _service = new CapabilitySelectionService();
  private _totalSelections  = 0;
  private _successCount     = 0;
  private _durations:        number[] = [];

  /**
   * Seleciona a Capability mais adequada para o Goal fornecido.
   * Nunca lança exceções.
   * Sempre retorna SelectionResult.
   */
  select(req: CapabilitySelectionRequest): SelectionResult {
    const t0 = Date.now();

    // ── Validation ──────────────────────────────────────────────────────────

    if (!req.goal || !req.goal.type || !req.goal.action) {
      const durationMs = Date.now() - t0;
      const result: CapabilityNotFoundResult = Object.freeze({
        success:      false,
        capabilityId: null,
        confidence:   0,
        explanation:  `Goal is invalid or missing required fields (type, action).`,
        durationMs,
        reason:       "GOAL_INVALID",
      });
      this._recordFailure(req, durationMs, "GOAL_INVALID");
      return result;
    }

    if (!req.availableCapabilities || req.availableCapabilities.length === 0) {
      const durationMs = Date.now() - t0;
      const result: CapabilityNotFoundResult = Object.freeze({
        success:      false,
        capabilityId: null,
        confidence:   0,
        explanation:  `No capabilities provided for goal "${req.goal.type}".`,
        durationMs,
        reason:       "NO_CAPABILITIES_PROVIDED",
      });
      this._recordFailure(req, durationMs, "NO_CAPABILITIES_PROVIDED");
      return result;
    }

    // ── Event: Started ───────────────────────────────────────────────────────

    CSETelemetry.emit({
      type:     "CapabilitySelectionStarted",
      goalId:   req.goal.id,
      goalType: req.goal.type,
      detail:   `action=${req.goal.action} category=${req.goal.category}`,
      count:    req.availableCapabilities.length,
      timestamp: Date.now(),
    });

    // ── Event: Loaded ────────────────────────────────────────────────────────

    CSETelemetry.emit({
      type:     "CapabilitiesLoaded",
      goalId:   req.goal.id,
      goalType: req.goal.type,
      count:    req.availableCapabilities.length,
      detail:   req.availableCapabilities.map(c => c.id).join(", "),
      timestamp: Date.now(),
    });

    // ── Rank all candidates ──────────────────────────────────────────────────

    const allRanked = this._service.rank(req);

    // ── Filter compatible ────────────────────────────────────────────────────

    const compatible = this._service.filter(allRanked);

    // ── Event: Filtered ──────────────────────────────────────────────────────

    CSETelemetry.emit({
      type:     "CapabilitiesFiltered",
      goalId:   req.goal.id,
      goalType: req.goal.type,
      count:    compatible.length,
      detail:   `${req.availableCapabilities.length} total → ${compatible.length} compatible`,
      timestamp: Date.now(),
    });

    // ── No compatible capability ─────────────────────────────────────────────

    if (compatible.length === 0) {
      const durationMs = Date.now() - t0;
      const discardDetails = allRanked
        .filter(c => c.discardReason)
        .map(c => `${c.capabilityName}: ${c.discardReason}`)
        .join(" | ");

      const result: CapabilityNotFoundResult = Object.freeze({
        success:      false,
        capabilityId: null,
        confidence:   0,
        explanation:  this._buildNoMatchExplanation(req, allRanked, discardDetails),
        durationMs,
        reason:       "NO_COMPATIBLE_CAPABILITY",
      });
      this._recordFailure(req, durationMs, "NO_COMPATIBLE_CAPABILITY");
      return result;
    }

    // ── Emit ranked events ───────────────────────────────────────────────────

    compatible.forEach(c => {
      CSETelemetry.emit({
        type:          "CapabilityRanked",
        goalId:        req.goal.id,
        goalType:      req.goal.type,
        capabilityId:  c.capabilityId,
        score:         c.score,
        detail:        `${c.capabilityName} score=${c.score}`,
        timestamp:     Date.now(),
      });
    });

    // ── Select winner (first in sorted compatible list) ──────────────────────

    const winner = compatible[0];
    const cap    = req.availableCapabilities.find(c => c.id === winner.capabilityId)!;

    // Mark winner as selected in ranking
    const finalRanking: RankedCandidate[] = allRanked.map(c =>
      Object.freeze({ ...c, selected: c.capabilityId === winner.capabilityId }),
    );

    const durationMs = Date.now() - t0;
    const confidence = parseFloat(Math.min(1, winner.score / 100).toFixed(4));

    const explanation = this._buildExplanation(req, allRanked, compatible, winner, cap);

    // ── Event: Selected ──────────────────────────────────────────────────────

    CSETelemetry.emit({
      type:          "CapabilitySelected",
      goalId:        req.goal.id,
      goalType:      req.goal.type,
      capabilityId:  winner.capabilityId,
      score:         winner.score,
      detail:        `Selected "${cap.name}" with score=${winner.score} confidence=${confidence}`,
      timestamp:     Date.now(),
    });

    CSETelemetry.emit({
      type:          "CapabilitySelectionCompleted",
      goalId:        req.goal.id,
      goalType:      req.goal.type,
      capabilityId:  winner.capabilityId,
      durationMs,
      timestamp:     Date.now(),
    });
    CSETelemetry.recordDuration(durationMs);

    this._totalSelections++;
    this._successCount++;
    this._durations.push(durationMs);

    const result: CapabilitySelectionResult = Object.freeze({
      success:        true,
      capabilityId:   winner.capabilityId,
      capabilityName: cap.name,
      confidence,
      explanation,
      ranking:        Object.freeze(finalRanking),
      durationMs,
    });

    return result;
  }

  // ── Health ────────────────────────────────────────────────────────────────

  health(): Readonly<EngineHealth> {
    const avgDurationMs = this._durations.length > 0
      ? parseFloat((this._durations.reduce((a, b) => a + b, 0) / this._durations.length).toFixed(2))
      : 0;
    const successRate = this._totalSelections > 0
      ? `${Math.round(this._successCount / this._totalSelections * 100)}%`
      : "0%";
    const status: EngineHealthStatus =
      this._totalSelections === 0 ? "READY"
      : this._successCount / this._totalSelections >= 0.8 ? "READY"
      : this._successCount / this._totalSelections >= 0.5 ? "DEGRADED"
      : "FAILED";

    return Object.freeze({ status, totalSelections: this._totalSelections, successRate, avgDurationMs });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _buildExplanation(
    req:        CapabilitySelectionRequest,
    all:        readonly RankedCandidate[],
    compatible: readonly RankedCandidate[],
    winner:     RankedCandidate,
    cap:        import("./CapabilitySelectionTypes").CapabilityDescriptor,
  ): string {
    const discarded = all.filter(c => c.discardReason !== null);
    const lines: string[] = [
      `Goal received: type="${req.goal.type}" action="${req.goal.action}" category="${req.goal.category}"`,
      ``,
      `Capabilities loaded: ${all.length}`,
      `Compatible: ${compatible.length}`,
      `Discarded: ${discarded.length}`,
    ];
    if (discarded.length > 0) {
      lines.push(``, `Discarded capabilities:`);
      discarded.forEach(d => lines.push(`  • ${d.capabilityName}: ${d.discardReason}`));
    }
    lines.push(``, `Ranking (compatible):`);
    compatible.forEach((c, i) =>
      lines.push(`  ${i + 1}. ${c.capabilityName} — score=${c.score}${c.capabilityId === winner.capabilityId ? " ← SELECTED" : ""}`),
    );
    lines.push(
      ``,
      `Selected: "${cap.name}" (id: ${cap.id})`,
      `Reason: Highest score (${winner.score}) among ${compatible.length} compatible capability(ies).`,
      `Goal type "${req.goal.type}" is in supported goalTypes [${cap.goalTypes.join(", ")}].`,
      `Action "${req.goal.action}" is in supportedActions [${cap.supportedActions.join(", ")}].`,
    );
    return lines.join("\n");
  }

  private _buildNoMatchExplanation(
    req:     CapabilitySelectionRequest,
    all:     readonly RankedCandidate[],
    details: string,
  ): string {
    return [
      `Goal received: type="${req.goal.type}" action="${req.goal.action}" category="${req.goal.category}"`,
      ``,
      `Capabilities evaluated: ${all.length}`,
      `Compatible: 0`,
      ``,
      `No capability matched the goal requirements.`,
      details ? `Discard reasons: ${details}` : "",
      ``,
      `Action required: Register a capability that supports goalType="${req.goal.type}" and action="${req.goal.action}".`,
    ].filter(l => l !== undefined).join("\n");
  }

  private _recordFailure(req: CapabilitySelectionRequest, durationMs: number, reason: string): void {
    CSETelemetry.emit({
      type:      "CapabilitySelectionFailed",
      goalId:    req.goal?.id ?? "unknown",
      goalType:  req.goal?.type ?? "unknown",
      detail:    reason,
      durationMs,
      timestamp: Date.now(),
    });
    CSETelemetry.recordDuration(durationMs);
    this._totalSelections++;
    this._durations.push(durationMs);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const _KEY = "__CSE_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilitySelectionEngine();
}
export const capabilitySelectionEngine: CapabilitySelectionEngine = (
  globalThis as unknown as Record<string, CapabilitySelectionEngine>
)[_KEY];