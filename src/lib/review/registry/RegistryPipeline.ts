// ─── Registry Pipeline ────────────────────────────────────────────────────────
// Foundation v1.0 · Executa engines via Registry → coleta resultados → entrega ao Aggregator

import type { EngineContext, EngineResult } from "./ReviewEngineContract";
import type { ReviewStatus } from "../ReviewReport";
import { globalRegistry } from "./ReviewEngineRegistry";
import { reviewEventBus } from "./ReviewEventBus";
import { bootstrapDefaultRegistry } from "./defaultRegistry";

export interface PipelineRunResult {
  engineResults: EngineResult[];
  extraGates: { name: string; status: ReviewStatus }[];
  totalDurationMs: number;
}

export async function runRegistryPipeline(context: EngineContext): Promise<PipelineRunResult> {
  bootstrapDefaultRegistry();

  const engines = globalRegistry.discover();
  const sprint  = context.sprint;

  reviewEventBus.publish("ReviewStarted", sprint, { meta: { engineCount: engines.length } });

  const engineResults: EngineResult[] = [];
  const t0 = performance.now();

  for (const engine of engines) {
    reviewEventBus.publish("AnalyzerStarted", sprint, {
      engineId: engine.id, engineName: engine.name,
    });

    try {
      const result = await engine.execute(context);
      engineResults.push(result);
      reviewEventBus.publish("AnalyzerCompleted", sprint, {
        engineId: engine.id, engineName: engine.name,
        meta: { status: result.status, durationMs: result.durationMs },
      });
    } catch (err) {
      const failedResult: EngineResult = {
        engineId:   engine.id,
        engineName: engine.name,
        category:   engine.category,
        gateName:   engine.id.toUpperCase(),
        status:     "FAILED",
        data:       {},
        durationMs: 0,
        error:      String(err),
      };
      engineResults.push(failedResult);
      reviewEventBus.publish("AnalyzerFailed", sprint, {
        engineId: engine.id, engineName: engine.name,
        meta: { error: String(err) },
      });
    }
  }

  const totalDurationMs = performance.now() - t0;

  // Build extraGates for the Aggregator — only engines NOT already in the 4 core gates
  const coreIds = new Set(["mri", "mqccs", "mers", "mads"]);
  const extraGates = engineResults
    .filter(r => !coreIds.has(r.engineId))
    .map(r => ({ name: r.gateName, status: r.status }));

  return { engineResults, extraGates, totalDurationMs };
}

/** Extract typed results for the Aggregator's core fields */
export function extractCoreResults(engineResults: EngineResult[]) {
  const get = (id: string) => engineResults.find(r => r.engineId === id)?.data ?? {};
  return {
    mriData:   get("mri"),
    mqccsData: get("mqccs"),
    mersData:  get("mers"),
    madsData:  get("mads"),
  };
}