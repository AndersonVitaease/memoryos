/**
 * CapabilityReasoningEngine.ts — Sprint EF-48 · Capability Reasoning Engine
 *
 * SRP: raciocinar sobre quais capacidades são necessárias para um objetivo e
 *      produzir um CapabilityGraph estruturado.
 *
 * Posição no fluxo EF-48:
 *   Goal → GoalReasoningEngine → CapabilityReasoningEngine → CapabilityGraph
 *        → StrategyGenerationEngine → StrategySelectionEngine → CognitiveOrchestrator
 *
 * NÃO executa tarefas.
 * NÃO chama conectores.
 * NÃO cria estratégias nem CognitivePlans.
 * NÃO seleciona conectores.
 *
 * Sua única responsabilidade é descobrir quais capacidades são necessárias.
 *
 * HMR-safe singleton via globalThis.
 */

import type { Goal }              from "@/lib/goal-engine/GoalTypes";
import { analyzeOperationalIntent } from "@/lib/cognitive-orchestrator/IntentAnalyzer";
import { resolveCapabilities }    from "./CapabilityResolver";
import { buildCapabilityGraph }   from "./CapabilityGraph";
import type { CapabilityGraph }   from "./CapabilityGraph";
import type { OperationalIntent } from "@/lib/cognitive-orchestrator/COTypes";

// ── Result ────────────────────────────────────────────────────────────────────

export interface CapabilityReasoningResult {
  readonly goalId:     string;
  readonly intent:     OperationalIntent;
  readonly graph:      CapabilityGraph;
  readonly durationMs: number;
  readonly createdAt:  string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

class CapabilityReasoningEngineImpl {

  /**
   * Reason about which capabilities are required to achieve `goal`.
   * Returns a CapabilityGraph ready to be passed to StrategyGenerationEngine.
   */
  reason(goal: Goal): CapabilityReasoningResult {
    const t0     = Date.now();
    const intent = analyzeOperationalIntent(goal);
    const nodes  = resolveCapabilities(intent, goal);
    const graph  = buildCapabilityGraph(goal.id, nodes, Date.now() - t0);

    return Object.freeze({
      goalId:     goal.id,
      intent,
      graph,
      durationMs: Date.now() - t0,
      createdAt:  new Date().toISOString(),
    });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF48_CRE__?: CapabilityReasoningEngineImpl };
if (!G.__EF48_CRE__) G.__EF48_CRE__ = new CapabilityReasoningEngineImpl();
export const CapabilityReasoningEngine: CapabilityReasoningEngineImpl = G.__EF48_CRE__;