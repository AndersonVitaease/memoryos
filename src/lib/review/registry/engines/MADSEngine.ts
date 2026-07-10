// ─── MADS Review Engine ───────────────────────────────────────────────────────
// Foundation v1.0 · Wraps analyzeMADS as a pluggable ReviewEngine

import type { ReviewEngine, EngineContext, EngineResult } from "../ReviewEngineContract";
import { analyzeMADS } from "../../analyzers";

export class MADSEngine implements ReviewEngine {
  readonly id       = "mads";
  readonly name     = "MADS — Drift & Sustainability";
  readonly version  = "1.0.0";
  readonly category = "Architecture" as const;
  readonly priority = "High" as const;

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const t0 = performance.now();
    const result = analyzeMADS(ctx.tests);
    return {
      engineId:   this.id,
      engineName: this.name,
      category:   this.category,
      gateName:   "MADS",
      status:     result.status,
      data:       result as unknown as Record<string, unknown>,
      durationMs: performance.now() - t0,
    };
  }
}