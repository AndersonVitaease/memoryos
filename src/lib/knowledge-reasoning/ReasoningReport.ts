/**
 * ReasoningReport.ts — Sprint EF-52
 *
 * SRP: montar o ReasoningReport final.
 */

import type {
  ReasoningReport as IReasoningReport, ReasoningContext,
  RetrievedRule, InferenceChain, Conflict, ConflictResolution,
  ReasoningDecision, ReasoningMetrics, ReasoningGraph,
} from "./KRTypes";
import { makeKRId } from "./KRTypes";

export class ReasoningReportBuilder {
  build(opts: {
    startedAt:     number;
    ctx:           ReasoningContext;
    rules:         readonly RetrievedRule[];
    chain:         InferenceChain;
    conflicts:     readonly Conflict[];
    resolutions:   readonly ConflictResolution[];
    decision:      ReasoningDecision;
    metrics:       ReasoningMetrics;
    graph:         ReasoningGraph;
  }): IReasoningReport {
    const { startedAt, ctx, rules, chain, conflicts, resolutions, decision, metrics, graph } = opts;

    const summary = [
      `EF-52 Knowledge Reasoning — goal="${ctx.goal}"`,
      `${rules.length} rules retrieved, ${decision.rulesUsed.length} used`,
      `${chain.steps.length} inference steps (depth=${chain.depth})`,
      `${conflicts.length} conflicts resolved`,
      `Decision confidence=${(decision.confidence * 100).toFixed(1)}%`,
    ].join(" · ");

    return Object.freeze({
      id:                  makeKRId("report"),
      generatedAt:         Date.now(),
      durationMs:          Date.now() - startedAt,
      contextId:           ctx.id,
      goal:                ctx.goal,
      knowledgeRetrieved:  rules,
      rulesUsed:           decision.rulesUsed,
      inferenceChain:      chain,
      conflicts,
      conflictResolutions: resolutions,
      decision,
      metrics,
      reasoningGraph:      graph,
      summary,
    });
  }
}