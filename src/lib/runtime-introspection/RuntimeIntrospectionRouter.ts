/**
 * RuntimeIntrospectionRouter.ts — EF-42 Runtime Introspection Framework
 *
 * SRP: Detectar perguntas sobre o estado interno do Runtime e
 *      produzir uma ResponseCandidate sem consultar nenhum Connector,
 *      LLM, Planner ou GoalBridge.
 *
 * POSICAO ARQUITETURAL:
 *   ConversationPipeline._runPipeline()
 *     ↓
 *   primaryRouter.route()          (classifica intent)
 *     ↓
 *   [EF-42] RuntimeIntrospectionRouter.intercept()   ← AQUI
 *     ↓ (se runtime query)
 *   RuntimeCapabilityExecutor.execute()
 *     ↓
 *   ExecutionOutcomeAdapterFactory.fromInput()
 *     ↓
 *   ResponseCandidate (domain: "runtime", confidence: 1.0)
 *     ↓
 *   ResponseArbiter (sem modificacao)
 *
 * GARANTIAS:
 *   - intercept() nunca lanca excecao
 *   - intercept() nunca chama API externa
 *   - Se nao detectar query de runtime, retorna null sem efeito colateral
 *   - O ResponseArbiter recebe um candidato normal — zero acoplamento
 *
 * REVERSIBILIDADE:
 *   Para desativar: remover o bloco [EF-42] em ConversationPipeline.ts.
 *   Nenhum outro arquivo precisa ser alterado.
 */

import { runtimeCapabilityRegistry } from "./RuntimeCapabilityRegistry";
import { runtimeCapabilityExecutor }  from "./RuntimeCapabilityExecutor";
import { executionOutcomeAdapterFactory } from "@/lib/response-arbiter/ExecutionOutcomeAdapterFactory";
import type { ResponseCandidate } from "@/lib/response-arbiter/ResponseCandidate";

export interface IntrospectionResult {
  /** true = this message was handled by runtime introspection */
  intercepted: boolean;
  /** ResponseCandidate ready for ResponseArbiter. null when intercepted=false. */
  candidate: ResponseCandidate | null;
  /** Human-readable reason */
  reason: string;
}

// ── RuntimeIntrospectionRouter ────────────────────────────────────────────────

export class RuntimeIntrospectionRouter {

  /**
   * Attempts to intercept a user message as a Runtime introspection query.
   *
   * Returns { intercepted: true, candidate } when handled.
   * Returns { intercepted: false, candidate: null } when the message
   * should continue through the normal GoalBridge → Planner → Runtime → Connector path.
   *
   * Never throws. Never calls external APIs.
   */
  intercept(userMessage: string): IntrospectionResult {
    try {
      const capDef = runtimeCapabilityRegistry.detect(userMessage);

      if (!capDef) {
        return { intercepted: false, candidate: null, reason: "No runtime introspection signals detected" };
      }

      console.log("[EF-42 RIF] Intercepted runtime introspection query", {
        capabilityId: capDef.id,
        description:  capDef.description,
        message:      userMessage.slice(0, 80),
      });

      // Execute the capability — pure in-memory read
      const execResult = runtimeCapabilityExecutor.execute(capDef.id);

      // Wrap as a standard ExecutionOutcome via the existing factory
      // producer: "runtime_introspection" (open-ended string — no type change needed)
      // domain:   "general" (closest valid ExecutionDomain — runtime is internal)
      // confidence: 1.0 — deterministic read, no estimation needed
      // cost: zero — no API calls, no network
      const now = Date.now();
      const factoryResult = executionOutcomeAdapterFactory.fromInput({
        producer:     "static_analysis",  // closest producer type — no external call
        startedAt:    now - execResult.durationMs,
        finishedAt:   now,
        success:      true,
        errorType:    "none",
        errorMessage: null,
        domain:       "general",
        capability:   capDef.id,
        payload:      execResult.data,
        metadata:     { source: "runtime_introspection", capabilityId: capDef.id },
        cost:         { apiCalls: 0, cacheHit: true, estimatedLatencyMs: execResult.durationMs },
        confidence:   { score: 1.0, reason: "deterministic runtime state read", producerConfidence: 1.0 },
        hint: {
          synthesizedAnswer: execResult.answer,
          sourceOverride:    "runtime_introspection",
        },
      });

      if (!factoryResult.ok || !factoryResult.candidate) {
        console.log("[EF-42 RIF] Factory failed — falling through to normal pipeline", {
          errors: factoryResult.outcomeErrors,
        });
        return { intercepted: false, candidate: null, reason: "ExecutionOutcome factory failed" };
      }

      return {
        intercepted: true,
        candidate:   factoryResult.candidate,
        reason:      `Runtime introspection: ${capDef.id}`,
      };

    } catch (e) {
      // Non-blocking — on any error, fall through to normal pipeline
      console.log("[EF-42 RIF] intercept() error — falling through:", String(e));
      return { intercepted: false, candidate: null, reason: `Error: ${String(e)}` };
    }
  }

  /**
   * Returns all registered runtime capability IDs.
   * Useful for diagnostic pages.
   */
  listCapabilities() {
    return runtimeCapabilityRegistry.listAll();
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__RUNTIME_INTROSPECTION_ROUTER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RuntimeIntrospectionRouter();
}

export const runtimeIntrospectionRouter: RuntimeIntrospectionRouter = (
  globalThis as unknown as Record<string, RuntimeIntrospectionRouter>
)[_KEY];