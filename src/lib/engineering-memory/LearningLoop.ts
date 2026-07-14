/**
 * LearningLoop.ts — Sprint 6.2.4
 * Executes after every implementation: Extract Lessons → Store Memory → Update Ranking → Improve Confidence.
 */
import type { AnyMemoryEntry, OutcomeType } from "./MEMTypes";
import type { MemoryRanking } from "./MemoryRanking";
import type { PatternMemory } from "./PatternMemory";

export interface LearningLoopResult {
  lessonsExtracted: string[];
  memoriesUpdated:  number;
  confidenceDelta:  number;
  newPatterns:      number;
  durationMs:       number;
}

export class LearningLoop {
  constructor(
    private readonly _ranking: MemoryRanking,
    private readonly _patterns: PatternMemory,
  ) {}

  execute(
    allEntries: AnyMemoryEntry[],
    latestOutcome: OutcomeType,
    latestComponents: string[],
  ): LearningLoopResult {
    const t0 = Date.now();
    const lessons: string[] = [];

    // 1. Extract lessons from outcome
    if (latestOutcome === "PASS") {
      lessons.push("Implementation succeeded — reinforce similar strategies");
      lessons.push(`Components used: ${latestComponents.slice(0,3).join(", ")}`);
    } else if (latestOutcome === "ROLLBACK") {
      lessons.push("Rollback executed — record failed strategy for future avoidance");
    } else if (latestOutcome === "FAIL") {
      lessons.push("Implementation failed — analyze root cause before retry");
    }

    // 2. Update ranking
    const ranked = this._ranking.rankAll(allEntries);
    let updated = 0;
    ranked.forEach((e, i) => {
      allEntries[i] = e;
      updated++;
    });

    // 3. Detect patterns
    const impls = allEntries.filter(e => e.kind === "IMPLEMENTATION") as any[];
    const patsBefore = this._patterns.all().length;
    this._patterns.detectFromHistory(impls.map(i => ({ objective: i.objective ?? "", components: i.components ?? [], outcome: i.outcome ?? "" })));
    const newPatterns = this._patterns.all().length - patsBefore;

    // 4. Confidence improvement
    const confidenceDelta = latestOutcome === "PASS" ? 0.01 : latestOutcome === "ROLLBACK" ? -0.02 : 0;

    if (newPatterns > 0) lessons.push(`${newPatterns} new pattern(s) detected`);

    return {
      lessonsExtracted: lessons,
      memoriesUpdated:  updated,
      confidenceDelta,
      newPatterns,
      durationMs: Date.now() - t0,
    };
  }
}