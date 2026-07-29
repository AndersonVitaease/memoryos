/**
 * PrimaryConversationRouter.ts — Phase 5.6
 * 2026-07-13
 *
 * THE primary routing layer for every conversation message.
 *
 * Every user message enters here FIRST. The router decides:
 *   - Cognitive message  → ConversationCognitiveGateway → LiveCognitivePipeline
 *   - General message    → returns null (caller uses runReasoningPlan as normal)
 *
 * Architecture rule: no direct connector access. No LLM calls here.
 * This module is a thin orchestration shell only.
 */

import { ConversationCognitiveGateway } from "../conversation-cognitive-gateway/ConversationCognitiveGateway";
import type { CognitiveAnswer, IntentClassification } from "../conversation-cognitive-gateway/CCGTypes";
import { GoalRegistry } from "@/lib/goals/GoalRegistry";

export type RoutingDecision = "cognitive_pipeline" | "conversation_memory";

export interface RouterResult {
  decision:         RoutingDecision;
  intent:           IntentClassification;
  cognitiveAnswer:  CognitiveAnswer | null;  // non-null only when decision === "cognitive_pipeline"
  durationMs:       number;
  timestamp:        number;
}

export interface RouterStats {
  totalRouted:      number;
  cognitivePaths:   number;
  memoryPaths:      number;
  avgDurationMs:    number;
}

// Singleton gateway shared across the router lifetime
const _gateway = new ConversationCognitiveGateway();

export class PrimaryConversationRouter {
  private _stats: RouterStats = {
    totalRouted:    0,
    cognitivePaths: 0,
    memoryPaths:    0,
    avgDurationMs:  0,
  };
  private _totalDuration = 0;
  private _lastResults: RouterResult[] = [];

  // ── Main entry point ────────────────────────────────────────────────────────

  async route(
    userMessage:  string,
    sessionId:    string,
    projectId:    string | null,
    historyLength: number,
  ): Promise<RouterResult> {
    const t0 = Date.now();

    // Step 1: classify intent without side effects
    const intent = _gateway.classifyIntent(userMessage);

    const goalMatch = GoalRegistry.matchBySignals(userMessage);
    if (goalMatch) {
      intent.requiresCognitive = false;
    }

    let decision: RoutingDecision;
    let cognitiveAnswer: CognitiveAnswer | null = null;

    if (intent.requiresCognitive) {
      // Step 2a: cognitive path → delegate fully to gateway (which calls LCP)
      decision        = "cognitive_pipeline";
      cognitiveAnswer = await _gateway.process(userMessage, sessionId, projectId, historyLength);
    } else {
      // Step 2b: general conversation path
      decision = "conversation_memory";
    }

    const durationMs = Date.now() - t0;
    this._totalDuration += durationMs;
    this._stats.totalRouted++;
    if (decision === "cognitive_pipeline") this._stats.cognitivePaths++;
    else this._stats.memoryPaths++;
    this._stats.avgDurationMs = Math.round(this._totalDuration / this._stats.totalRouted);

    const result: RouterResult = {
      decision,
      intent,
      cognitiveAnswer,
      durationMs,
      timestamp: Date.now(),
    };

    this._lastResults.push(result);
    if (this._lastResults.length > 50) this._lastResults.splice(0, this._lastResults.length - 50);

    return result;
  }

  getStats():       RouterStats    { return { ...this._stats }; }
  getLastResults(): RouterResult[] { return [...this._lastResults].reverse(); }
  getGateway():     ConversationCognitiveGateway { return _gateway; }
}

// App-wide singleton — ChatPage imports this instance
export const primaryRouter = new PrimaryConversationRouter();