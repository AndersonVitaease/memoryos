/**
 * MemoryContextBuilder.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * Receives a question, searches unified memory, builds
 * a structured context block ready for the Planner/LLM.
 *
 * Planners call this. They never call individual providers.
 */

import type { MemoryQuery, MemoryContext } from "./UCMETypes";
import { UnifiedMemoryEngine } from "./UnifiedMemoryEngine";

export const MemoryContextBuilder = {

  /**
   * Build a full memory context for a user question.
   * This is what the Planner calls — not specific providers.
   */
  async build(
    question: string,
opts: {
       intent?:     string;
       providers?:  string[];
       maxResults?: number;
       timeoutMs?:  number;
       traceId?:    string;
       projectId?:  string;
     } = {},
  ): Promise<MemoryContext> {
    const query: MemoryQuery = {
      text:             question,
      intent:           opts.intent,
      providers:        opts.providers,
      maxPerProvider:   opts.maxResults ?? 10,
      timeoutMs:        opts.timeoutMs ?? 5000,
      traceId:          opts.traceId,
      projectId:        opts.projectId,
    };
    return UnifiedMemoryEngine.buildContext(query);
  },

  /**
   * Quick search — returns just the context string for inline LLM prompting.
   */
  async quickSearch(question: string): Promise<string> {
    const ctx = await MemoryContextBuilder.build(question);
    return ctx.prompt;
  },
};