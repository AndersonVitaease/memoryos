// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Intent Runtime Stage
// Single responsibility: classify user intent from raw text.
// ══════════════════════════════════════════════════════════════════════════════

import type { UserInput, IntentResult } from "../ExecutionChainTypes";

export interface IIntentRuntime {
  classify(input: UserInput): Promise<IntentResult>;
}

export class IntentRuntimeStage implements IIntentRuntime {
  async classify(input: UserInput): Promise<IntentResult> {
    const text = input.text.toLowerCase();
    const requiresConnector = /email|drive|calendar|gmail|file|event|meeting/.test(text);
    const requiresPlanning  = /create|schedule|send|write|plan|make|organiz/.test(text);

    let intentType = "MEMORY_RECALL";
    if (requiresConnector && requiresPlanning) intentType = "CONNECTOR_QUERY";
    else if (requiresPlanning) intentType = "PLAN_EXECUTE";

    const entities: Record<string, string> = {};
    const emailMatch = text.match(/\b[\w.]+@[\w.]+\b/);
    if (emailMatch) entities.email = emailMatch[0];
    const dateMatch = text.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dateMatch) entities.date = dateMatch[0];

    const evidence = `Intent classified as ${intentType} — connector:${requiresConnector} planning:${requiresPlanning} confidence:${requiresConnector ? 0.92 : 0.78}`;

    return Object.freeze({
      intentType,
      confidence: requiresConnector ? 0.92 : 0.78,
      entities: Object.freeze(entities) as Record<string, string>,
      slots: Object.freeze({ rawText: input.text }) as Record<string, string>,
      requiresConnector,
      requiresPlanning,
      evidence,
    });
  }
}