/**
 * RuntimeEvidenceCollector.ts — Sprint EF-55.1
 *
 * SRP: coleta ExecutionEvidence completa de uma execução real do pipeline.
 * Alimenta ScenarioValidator e ConnectorValidator.
 */

import { makeSCId } from "../SCTypes";
import type { ExecutionEvidence } from "./ExecutionEvidence";
import { RuntimeTraceCollector, type TraceInput } from "./RuntimeTraceCollector";

export class RuntimeEvidenceCollector {
  private readonly _tracer = new RuntimeTraceCollector();

  async collect(input: TraceInput): Promise<ExecutionEvidence> {
    const t0       = Date.now();
    const snap     = await this._tracer.collect(input);

    const getStep  = (stage: string) => snap.steps.find(s => s.stage === stage);
    const lr       = getStep("learning");
    const rr       = getStep("reasoning");
    const opt      = getStep("optimization");
    const mc       = getStep("meta_cognition");

    const { MetaCognitiveEngine } = await import("@/lib/meta-cognition/MetaCognitiveEngine");
    const lastMeta = MetaCognitiveEngine.getLastReport();

    return Object.freeze({
      executionId:     makeSCId("exec"),
      goalId:          snap.goal.goalId,
      goal:            input.goal,
      plannerId:       makeSCId("plan"),   // planner not yet a singleton — proxy ID
      strategyId:      makeSCId("strat"),  // strategy runtime ID
      strategy:        input.strategy,
      capabilityId:    makeSCId("cap"),
      capabilities:    Object.freeze(input.capabilities),
      connectorId:     snap.connector?.connectorId ?? "none",
      connectors:      Object.freeze(input.connectors),
      episodeId:       `ep_${snap.goal.goalId}`,
      episodeCount:    input.episodeCount,
      learningId:      lr?.artifactId ?? "missing",
      knowledgeCreated: Number(lr?.metrics.knowledgeCreated ?? 0),
      rulesRetrieved:  Number(rr?.metrics.knowledgeRetrieved ?? 0),
      reasoningId:     rr?.artifactId ?? "missing",
      inferenceDepth:  Number(rr?.metrics.inferenceDepth ?? 0),
      decisionConf:    Number(rr?.metrics.decisionConf ?? 0),
      optimizationId:  opt?.artifactId ?? "missing",
      optRecsCount:    Number(opt?.metrics.recommendations ?? 0),
      metaId:          mc?.artifactId ?? "missing",
      reflectionId:    lastMeta?.reflection.id ?? "missing",
      metaConf:        Number(mc?.metrics.metaConf ?? 0),
      biasCount:       Number(mc?.metrics.biasCount ?? 0),
      startedAt:       t0,
      durationMs:      Date.now() - t0,
      success:         input.success,
      confidence:      input.confidence,
      authority:       input.authority,
    });
  }
}