/**
 * BaseSpecialist.ts — Specialist SDK
 * Abstract base class for all MemoryOS Specialists.
 * Provides lifecycle, metrics, and standard health reporting.
 * Subclasses implement only domain-specific knowledge logic.
 *
 * P3 · Version: 1.0.0
 */

import type {
  ISpecialist,
  SpecialistManifest,
  SpecialistDomain,
  SpecialistRequest,
  SpecialistResponse,
} from "./ISpecialist";

export abstract class BaseSpecialist implements ISpecialist {
  readonly manifest: SpecialistManifest;
  readonly id: string;
  readonly domain: SpecialistDomain;

  private _executeCount = 0;
  private _successCount = 0;
  private _failureCount = 0;
  private _totalLatencyMs = 0;

  constructor(manifest: SpecialistManifest) {
    this.manifest = manifest;
    this.id = manifest.specialistId;
    this.domain = manifest.domain;
  }

  // ── Abstract — subclasses implement ──────────────────────────────────────

  /** Core domain analysis — subclasses MUST implement. */
  protected abstract onExecute(request: SpecialistRequest): Promise<SpecialistResponse>;

  /** Subclasses declare which queries they can handle. */
  abstract canHandle(query: string): boolean;

  // ── ISpecialist interface ─────────────────────────────────────────────────

  async execute(request: SpecialistRequest): Promise<SpecialistResponse> {
    const t0 = Date.now();
    this._executeCount++;

    try {
      const result = await this.onExecute(request);
      this._successCount++;
      this._totalLatencyMs += Date.now() - t0;
      return { ...result, durationMs: Date.now() - t0 };
    } catch (err) {
      this._failureCount++;
      this._totalLatencyMs += Date.now() - t0;
      // Return graceful degradation — Specialist never throws to the Pipeline
      return {
        specialistId:    this.id,
        facts:           [],
        reasoning:       [`Specialist execution failed: ${err instanceof Error ? err.message : String(err)}`],
        recommendations: [],
        confidence:      0,
        sources:         [],
        limitations:     ["Execution failed — result is unavailable"],
        durationMs:      Date.now() - t0,
      };
    }
  }

  health(): { status: "healthy" | "degraded" | "unavailable"; details: string } {
    const successRate = this._executeCount > 0
      ? this._successCount / this._executeCount
      : 1;
    const avgLatency = this._executeCount > 0
      ? Math.round(this._totalLatencyMs / this._executeCount)
      : 0;

    const status = successRate >= 0.9 ? "healthy"
      : successRate >= 0.5 ? "degraded"
      : "unavailable";

    return {
      status,
      details: `${this.manifest.name} v${this.manifest.version} — executions=${this._executeCount} successRate=${Math.round(successRate * 100)}% avgLatency=${avgLatency}ms`,
    };
  }

  /** Metrics snapshot for observability. */
  metrics() {
    return Object.freeze({
      specialistId:    this.id,
      executeCount:    this._executeCount,
      successCount:    this._successCount,
      failureCount:    this._failureCount,
      avgLatencyMs:    this._executeCount > 0 ? Math.round(this._totalLatencyMs / this._executeCount) : 0,
      successRate:     this._executeCount > 0 ? this._successCount / this._executeCount : 1,
    });
  }
}