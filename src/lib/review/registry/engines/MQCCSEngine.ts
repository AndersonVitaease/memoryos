// ─── MQCCS Review Engine ──────────────────────────────────────────────────────
// Foundation v1.0 · Wraps analyzeMQCCS as a pluggable ReviewEngine

import type { ReviewEngine, EngineContext, EngineResult } from "../ReviewEngineContract";
import { analyzeMQCCS } from "../../analyzers";

export class MQCCSEngine implements ReviewEngine {
  readonly id       = "mqccs";
  readonly name     = "MQCCS — Quality & Certification";
  readonly version  = "1.0.0";
  readonly category = "Quality" as const;
  readonly priority = "Critical" as const;

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const t0 = performance.now();
    const result = analyzeMQCCS(ctx.tests);
    return {
      engineId:   this.id,
      engineName: this.name,
      category:   this.category,
      gateName:   "MQCCS",
      status:     result.status,
      data:       result as unknown as Record<string, unknown>,
      durationMs: performance.now() - t0,
    };
  }
}