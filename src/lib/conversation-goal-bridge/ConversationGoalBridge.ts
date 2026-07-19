/**
 * ConversationGoalBridge — Engineering Sprint E-02.1A
 * Conversation → Goal Bridge (Refined)
 *
 * SRP: Unica responsabilidade — transformar Intent + userMessage em ConversationGoal.
 *
 * NAO classifica intencoes (responsabilidade do ConversationCognitiveGateway).
 * NAO contem regras de dominio.
 * NAO contem keyword matching.
 * NAO chama connectors.
 * NAO chama Planning Engine.
 * NAO chama Runtime.
 * NAO faz chamadas de rede.
 *
 * Delega inteiramente ao GoalRegistry para:
 *   - Matching de sinais → GoalDefinition
 *   - Extracao de parametros
 *   - Fallback Intent → GoalType
 */

import { GoalRegistry }                              from "@/lib/goals/GoalRegistry";
import {
  makeConversationGoalId,
  validateConversationGoal,
} from "@/lib/goals/GoalTypes";
import type {
  ConversationGoal,
  GoalBridgeResult,
  GoalType,
} from "@/lib/goals/GoalTypes";
import type { CognitiveIntent }                      from "@/lib/conversation-cognitive-gateway/CCGTypes";
import { implicitConnectorIntentDetector }           from "./ImplicitConnectorIntentDetector";
// Ensures SemanticProviders are registered before first resolve() call
import "@/lib/semantic-registry/index";

// Re-export types for consumers that import from the Bridge
export type { ConversationGoal, GoalBridgeResult, GoalType } from "@/lib/goals/GoalTypes";

// ── ConversationGoalBridge ─────────────────────────────────────────────────────

export class ConversationGoalBridge {
  private _totalProcessed = 0;
  private _lastGoals: ConversationGoal[] = [];

  /**
   * Transforma Intent classificada + mensagem do usuario em ConversationGoal.
   *
   * Garantias:
   * - Nunca lanca excecao
   * - Nunca faz chamadas de rede
   * - Nunca chama connectors, planning ou runtime
   * - Deterministico para a mesma entrada e registry state
   */
  derive(
    userMessage:         string,
    cognitiveIntent:     CognitiveIntent,
    cognitiveConfidence: number,
  ): GoalBridgeResult {
    const t0 = Date.now();

    // 1. Ask Registry: any signal match in the user message?
    const match = GoalRegistry.matchBySignals(userMessage);

    let goalType:   GoalType;
    let parameters: Record<string, unknown>;
    let confidence: number;

    if (match) {
      // Signal match found: use the matched definition
      goalType   = match.type;
      parameters = match.extractParams(userMessage);
      confidence = Math.round(Math.min(cognitiveConfidence + 0.3, 1) * 100) / 100;

    } else {
      // No explicit signal match — try implicit connector intent (E-02.6)
      const implicit = implicitConnectorIntentDetector.resolve(
        userMessage,
        GoalRegistry.listAll(),
      );

      if (implicit.detected && implicit.goalType) {
        goalType   = implicit.goalType;
        parameters = implicit.parameters;
        confidence = implicit.confidence;
      } else {
        // Final fallback: intent mapping
        goalType   = GoalRegistry.resolveFromIntent(cognitiveIntent);
        parameters = {};
        confidence = goalType === "unknown" || goalType === "general.conversation"
          ? Math.min(cognitiveConfidence, 0.3)
          : cognitiveConfidence;
      }
    }

    const partial = {
      id:             makeConversationGoalId(),
      type:           goalType,
      confidence:     Math.max(0, Math.min(1, confidence)),
      parameters:     Object.freeze(parameters),
      userIntent:     userMessage,
      cognitiveIntent,
      createdAt:      Date.now(),
    };

    const { valid, validationErrors } = validateConversationGoal(partial);

    const goal: ConversationGoal = Object.freeze({
      ...partial,
      valid,
      validationErrors: Object.freeze(validationErrors),
    });

    this._totalProcessed++;
    this._lastGoals.push(goal);
    if (this._lastGoals.length > 100) this._lastGoals.splice(0, this._lastGoals.length - 100);

    return Object.freeze({ goal, durationMs: Date.now() - t0 });
  }

  getMetrics() {
    return {
      totalProcessed:   this._totalProcessed,
      registrySize:     GoalRegistry.size,
      lastGoals:        [...this._lastGoals].reverse().slice(0, 20),
    };
  }
}

// ── App-wide singleton ────────────────────────────────────────────────────────

const _KEY = "__CGB_BRIDGE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ConversationGoalBridge();
}

export const conversationGoalBridge: ConversationGoalBridge = (
  globalThis as unknown as Record<string, ConversationGoalBridge>
)[_KEY];