/**
 * IdempotencyValidator.ts — EV-5.1
 * Runs a scenario N times and verifies consistent behavior.
 * Any status divergence or state mutation → FAIL.
 */

export interface IdempotencyRun {
  runIndex: number;
  status: "PASS" | "FAIL" | "SKIP";
  stages: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP" }>;
  durationMs: number;
  error?: string;
}

export interface IdempotencyResult {
  n: number;
  passed: boolean;
  consistent: boolean;
  divergences: string[];
  runs: IdempotencyRun[];
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
}

type ScenarioFn = () => Promise<{ status: "PASS" | "FAIL" | "SKIP"; stages: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP" }> }>;

function stageFingerprint(stages: Array<{ name: string; status: string }>): string {
  return stages.map(s => `${s.name}:${s.status}`).join("|");
}

export const IdempotencyValidator = Object.freeze({
  async validate(scenarioFn: ScenarioFn, n: number): Promise<IdempotencyResult> {
    const runs: IdempotencyRun[] = [];
    const divergences: string[] = [];
    let referenceFingerprint: string | null = null;

    for (let i = 0; i < n; i++) {
      const t0 = Date.now();
      try {
        const result = await scenarioFn();
        const fp = stageFingerprint(result.stages);
        const run: IdempotencyRun = {
          runIndex: i + 1,
          status: result.status,
          stages: result.stages,
          durationMs: Date.now() - t0,
        };
        runs.push(run);

        if (i === 0) {
          referenceFingerprint = fp;
        } else if (fp !== referenceFingerprint) {
          divergences.push(`Run ${i + 1}: stage fingerprint differs from run 1 (expected "${referenceFingerprint}" got "${fp}")`);
        }
      } catch (e) {
        runs.push({ runIndex: i + 1, status: "FAIL", stages: [], durationMs: Date.now() - t0, error: (e as Error).message });
        divergences.push(`Run ${i + 1}: threw exception — ${(e as Error).message}`);
      }
    }

    const durations = runs.map(r => r.durationMs);
    const avgDurationMs = runs.length ? Math.round(durations.reduce((a, b) => a + b, 0) / runs.length) : 0;

    return {
      n,
      passed: divergences.length === 0,
      consistent: divergences.length === 0,
      divergences,
      runs,
      avgDurationMs,
      minDurationMs: runs.length ? Math.min(...durations) : 0,
      maxDurationMs: runs.length ? Math.max(...durations) : 0,
    };
  },
});