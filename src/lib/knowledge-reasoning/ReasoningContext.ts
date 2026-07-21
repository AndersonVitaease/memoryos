/**
 * ReasoningContext.ts — Sprint EF-52
 *
 * SRP: construir e validar o ReasoningContext a partir de inputs do Goal.
 * Stateless. Sem efeitos colaterais.
 */

import type { ReasoningContext } from "./KRTypes";
import { makeKRId } from "./KRTypes";

export interface ReasoningContextInput {
  goal: string;
  intent?: string;
  capabilities?: string[];
  strategy?: string;
  projectSize?: ReasoningContext["projectSize"];
  domain?: string;
  metadata?: Record<string, unknown>;
}

export class ReasoningContextBuilder {
  build(input: ReasoningContextInput): ReasoningContext {
    return Object.freeze({
      id:           makeKRId("ctx"),
      createdAt:    Date.now(),
      goal:         input.goal,
      intent:       input.intent ?? "unknown",
      capabilities: Object.freeze(input.capabilities ?? []),
      strategy:     input.strategy ?? "unknown",
      projectSize:  input.projectSize ?? "medium",
      domain:       input.domain ?? "general",
      metadata:     Object.freeze(input.metadata ?? {}),
    });
  }
}