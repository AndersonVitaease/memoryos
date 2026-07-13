/**
 * ConfidenceManager.ts — Cognitive Learning Engine
 * Beta-03.2 · 2026-07-13
 *
 * Manages confidence state across learning dimensions.
 * Every adjustment includes evidence — no hidden scoring.
 * Immutable adjustment records — append only.
 */

import type { ConfidenceAdjustment, ConfidenceState, RiskAdjustment, LearningRecord } from "./CLETypes";
import { makeCLEId } from "./CLETypes";

const DIMENSIONS = ["github_connector", "base44_connector", "planning", "knowledge_reconstruction", "overall"] as const;
type Dim = typeof DIMENSIONS[number];

function clamp(v: number): number { return Math.max(0, Math.min(1, v)); }

export class ConfidenceManager {
  private _dimensions: Record<string, number> = {
    github_connector:         0.7,
    base44_connector:         0.8,
    planning:                 0.7,
    knowledge_reconstruction: 0.75,
    overall:                  0.75,
  };
  private _adjustments: ConfidenceAdjustment[] = [];
  private _riskAdjustments: RiskAdjustment[]   = [];
  private _riskDimensions: Record<string, number> = {
    github_connector:  0.3,
    base44_connector:  0.2,
    planning:          0.3,
    overall:           0.25,
  };

  applyLearningRecords(records: LearningRecord[]): void {
    for (const lr of records) {
      // Map learning type to dimension
      const dim: Dim =
        lr.tags.includes("connector_reliability") || lr.tags.includes("github") ? "github_connector"
        : lr.tags.includes("base44")              ? "base44_connector"
        : lr.tags.includes("performance")         ? "planning"
        : lr.learningType === "planning_accuracy"  ? "planning"
        : "overall";

      if (lr.confidenceDelta !== 0) {
        const prev = this._dimensions[dim] ?? 0.5;
        const next = clamp(prev + lr.confidenceDelta);
        const adj: ConfidenceAdjustment = {
          id:                  makeCLEId("cadj"),
          adjustedAt:          Date.now(),
          triggeredBy:         lr.id,
          dimension:           dim,
          previousConfidence:  prev,
          delta:               lr.confidenceDelta,
          newConfidence:       next,
          evidence:            lr.recommendation,
          direction:           lr.confidenceDelta > 0 ? "increase" : lr.confidenceDelta < 0 ? "decrease" : "unchanged",
        };
        this._dimensions[dim] = next;
        this._adjustments.push(adj);
        // Keep overall in sync
        if (dim !== "overall") {
          const dims = Object.entries(this._dimensions).filter(([k]) => k !== "overall").map(([, v]) => v);
          this._dimensions["overall"] = clamp(dims.reduce((s, v) => s + v, 0) / dims.length);
        }
      }

      if (lr.riskDelta !== 0) {
        const riskDim = dim === "planning" ? "planning" : dim.includes("connector") ? dim : "overall";
        const prevRisk = this._riskDimensions[riskDim] ?? 0.3;
        const nextRisk = clamp(prevRisk + lr.riskDelta);
        this._riskDimensions[riskDim] = nextRisk;
        this._riskAdjustments.push({
          id:            makeCLEId("radj"),
          adjustedAt:    Date.now(),
          triggeredBy:   lr.id,
          area:          riskDim,
          previousRisk:  prevRisk,
          delta:         lr.riskDelta,
          newRisk:       nextRisk,
          evidence:      lr.description,
        });
      }
    }
  }

  getState(): ConfidenceState {
    return {
      lastUpdatedAt: Date.now(),
      dimensions:    { ...this._dimensions },
      adjustments:   [...this._adjustments],
    };
  }

  getConfidence(dim: string): number { return this._dimensions[dim] ?? 0.5; }
  getRisk(dim: string): number       { return this._riskDimensions[dim] ?? 0.3; }
  getRiskAdjustments(): RiskAdjustment[] { return [...this._riskAdjustments]; }
}