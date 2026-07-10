// ─── MRI Review Engine ────────────────────────────────────────────────────────
// Foundation v1.0 · Wraps analyzeMRI as a pluggable ReviewEngine

import type { ReviewEngine, EngineContext, EngineResult } from "../ReviewEngineContract";
import { analyzeMRI } from "../../analyzers";

export class MRIEngine implements ReviewEngine {
  readonly id       = "mri";
  readonly name     = "MRI — Reference Implementation";
  readonly version  = "1.0.0";
  readonly category = "Testing" as const;
  readonly priority = "Critical" as const;

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const t0 = performance.now();
    const result = analyzeMRI(ctx.tests);
    return {
      engineId:   this.id,
      engineName: this.name,
      category:   this.category,
      gateName:   "MRI",
      status:     result.status,
      data:       result as unknown as Record<string, unknown>,
      durationMs: performance.now() - t0,
    };
  }
}