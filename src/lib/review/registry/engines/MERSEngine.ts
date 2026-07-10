// ─── MERS Review Engine ───────────────────────────────────────────────────────
// Foundation v1.0 · Wraps analyzeMERS as a pluggable ReviewEngine

import type { ReviewEngine, EngineContext, EngineResult } from "../ReviewEngineContract";
import { analyzeMERS } from "../../analyzers";

export class MERSEngine implements ReviewEngine {
  readonly id       = "mers";
  readonly name     = "MERS — Engineering Review";
  readonly version  = "1.0.0";
  readonly category = "Architecture" as const;
  readonly priority = "High" as const;

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const t0 = performance.now();
    const result = analyzeMERS(ctx.tests);
    return {
      engineId:   this.id,
      engineName: this.name,
      category:   this.category,
      gateName:   "MERS",
      status:     result.status,
      data:       result as unknown as Record<string, unknown>,
      durationMs: performance.now() - t0,
    };
  }
}