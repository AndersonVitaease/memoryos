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

    // NC-04 remediation: capture reflectionId directly from the meta_cognition step output
    // stored in the pipeline snapshot — no longer relying on MetaCognitiveEngine.getLastReport()
    // which could return a stale report from a previous execution in the same session.
    const reflectionIdFromSnapshot = mc?.outputHash.match(/reflection_id=([^\s,]+)/)?.[1] ?? "missing";

    // NC-01 remediation: EF-43/45/46/47/48/49/50 are not yet integrated as callable singletons
    // in the certification pipeline. IDs below are explicitly marked as PROXY (not real engine IDs)
    // so the certification engine can correctly classify them as synthetic in the evidence audit.
    const PROXY_PREFIX = "PROXY";

    return Object.freeze({
      executionId:     makeSCId("exec"),
      goalId:          snap.goal.goalId,
      goal:            input.goal,
      plannerId:       `${PROXY_PREFIX}_plan_${snap.goal.goalId}`,   // NC-01: EF-43 not integrated
      strategyId:      `${PROXY_PREFIX}_strat_${snap.goal.goalId}`,  // NC-01: EF-46 not integrated
      strategy:        input.strategy,
      capabilityId:    `${PROXY_PREFIX}_cap_${snap.goal.goalId}`,    // NC-01: EF-48 not integrated
      capabilities:    Object.freeze(input.capabilities),
      connectorId:     snap.connector?.connectorId ?? "none",
      connectors:      Object.freeze(input.connectors),
      episodeId:       `${PROXY_PREFIX}_ep_${snap.goal.goalId}`,     // NC-01: EF-50 not integrated
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
      reflectionId:    reflectionIdFromSnapshot, // NC-04: from snapshot, not getLastReport()
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