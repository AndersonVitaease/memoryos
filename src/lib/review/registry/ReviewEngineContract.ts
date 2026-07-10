// ─── Review Engine Contract ───────────────────────────────────────────────────
// Foundation v1.0 · Interface oficial para todo Analyzer plugável

import type { TestResult, ReviewStatus } from "../ReviewReport";

export type EngineCategory =
  | "Quality" | "Security" | "Performance" | "Compliance"
  | "Architecture" | "Testing" | "Documentation"
  | "Accessibility" | "Privacy" | "AI Review" | "Custom";

export type EnginePriority = "Critical" | "High" | "Normal" | "Low";

export interface EngineContext {
  tests: TestResult[];
  sprint: string;
  foundation: string;
  /** Arbitrary extra data an engine may need */
  meta?: Record<string, unknown>;
}

export interface EngineResult {
  engineId: string;
  engineName: string;
  category: EngineCategory;
  status: ReviewStatus;
  /** Gate name shown in ReviewReport.gates */
  gateName: string;
  /** Structured output — engine-specific */
  data: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

/** Every review engine MUST implement this contract */
export interface ReviewEngine {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly category: EngineCategory;
  readonly priority: EnginePriority;
  execute(context: EngineContext): Promise<EngineResult>;
}