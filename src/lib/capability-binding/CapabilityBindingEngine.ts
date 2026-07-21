/**
 * CapabilityBindingEngine.ts — Sprint EF-49 · Capability Binding Engine
 *
 * SRP: transformar um CapabilityGraph abstrato num BoundCapabilityGraph concreto,
 *      ligando cada capability a um provider real com fallbacks.
 *
 * Posição no fluxo EF-49:
 *   Goal → CRE → CapabilityBindingEngine → BoundCapabilityGraph
 *        → StrategyGenerationEngine → StrategySelectionEngine → …
 *
 * NÃO chama APIs nem executa conectores.
 * NÃO cria estratégias nem CognitivePlans.
 * NÃO seleciona estratégias.
 *
 * Sua única responsabilidade é:
 *   Capability → Provider
 *
 * HMR-safe singleton via globalThis.
 */

import type { CapabilityGraph }        from "@/lib/capability-reasoning/CapabilityGraph";
import { resolveAllBindings }          from "./BindingResolver";
import { buildBoundCapabilityGraph }   from "./BoundCapabilityGraph";
import type { BoundCapabilityGraph }   from "./BoundCapabilityGraph";

// ── Binding result ────────────────────────────────────────────────────────────

export interface BindingResult {
  readonly sourceGraphId:  string;
  readonly goalId:         string;
  readonly boundGraph:     BoundCapabilityGraph;
  readonly durationMs:     number;
  readonly createdAt:      string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

class CapabilityBindingEngineImpl {

  /**
   * Bind all capability nodes in `graph` to concrete providers.
   * Returns a BoundCapabilityGraph ready for StrategyGenerationEngine.
   */
  bind(graph: CapabilityGraph): BindingResult {
    const t0       = Date.now();
    const bindings = resolveAllBindings(graph.nodes);
    const bound    = buildBoundCapabilityGraph(graph, bindings, Date.now() - t0);

    return Object.freeze({
      sourceGraphId: graph.graphId,
      goalId:        graph.goalId,
      boundGraph:    bound,
      durationMs:    Date.now() - t0,
      createdAt:     new Date().toISOString(),
    });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF49_CBE__?: CapabilityBindingEngineImpl };
if (!G.__EF49_CBE__) G.__EF49_CBE__ = new CapabilityBindingEngineImpl();
export const CapabilityBindingEngine: CapabilityBindingEngineImpl = G.__EF49_CBE__;