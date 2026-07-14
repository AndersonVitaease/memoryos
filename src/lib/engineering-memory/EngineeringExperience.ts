/**
 * EngineeringExperience.ts — Sprint 6.2.4
 * Continuously updated experience score across all engineering activities.
 */
import type { EngineeringExperienceSnapshot, MemoryKind, AnyMemoryEntry } from "./MEMTypes";

export class EngineeringExperience {
  private _totalImplementations = 0;
  private _successCount         = 0;
  private _rollbackCount        = 0;
  private _reuseCount           = 0;
  private _bugsAvoided          = 0;
  private _timeSavedMs          = 0;
  private _confidenceSum        = 0;
  private _confidenceCount      = 0;

  recordImplementation(success: boolean, rollback: boolean, reused: boolean, durationMs: number, confidence: number) {
    this._totalImplementations++;
    if (success)  this._successCount++;
    if (rollback) this._rollbackCount++;
    if (reused)   this._reuseCount++;
    // Estimated time saved if reused (assume 30% faster)
    if (reused) this._timeSavedMs += Math.round(durationMs * 0.3);
    this._confidenceSum += confidence;
    this._confidenceCount++;
  }

  recordBugAvoided() { this._bugsAvoided++; }

  snapshot(allEntries: AnyMemoryEntry[]): EngineeringExperienceSnapshot {
    const kinds = {} as Record<MemoryKind, number>;
    for (const e of allEntries) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;

    return {
      totalImplementations: this._totalImplementations,
      successRate:          this._totalImplementations ? Math.round((this._successCount / this._totalImplementations) * 100) : 0,
      rollbackRate:         this._totalImplementations ? Math.round((this._rollbackCount / this._totalImplementations) * 100) : 0,
      reuseRate:            this._totalImplementations ? Math.round((this._reuseCount / this._totalImplementations) * 100) : 0,
      bugsAvoided:          this._bugsAvoided,
      estimatedTimeSavedMs: this._timeSavedMs,
      averageConfidence:    this._confidenceCount ? Math.round((this._confidenceSum / this._confidenceCount) * 100) : 0,
      totalMemories:        allEntries.length,
      memoriesByKind:       kinds,
    };
  }
}