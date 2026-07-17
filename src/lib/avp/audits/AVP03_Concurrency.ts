// ══════════════════════════════════════════════════════════════════════════════
// AVP-03 — Concurrency Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, makeChain, inp } from "../AVPHelpers";

async function runBatch(n: number, tag: string): Promise<{ passed: number; failed: number; contaminated: number }> {
  // Each execution gets its own chain (own context, own clock, own bus)
  const promises = Array.from({ length: n }, (_, i) => {
    const chain = makeChain(`${tag}-${i}`);
    return chain.execute(inp(`Batch test ${i}`, `sess-${tag}-${i}`, `user-${i}`))
      .then(r => ({ ok: r.status === "COMPLETED" && r.stagesTotal === 13, userId: r.userId, chainId: r.chainId }))
      .catch(() => ({ ok: false, userId: "", chainId: "" }));
  });

  const results = await Promise.all(promises);

  // Check for context leakage: each result must have its own userId
  const userIds = new Set(results.map(r => r.userId));
  const contaminated = results.length - userIds.size; // if 0: every user got a unique id

  return {
    passed:      results.filter(r => r.ok).length,
    failed:      results.filter(r => !r.ok).length,
    contaminated,
  };
}

export async function runAVP03(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-03", "Concurrency Audit");

  const batches: Array<[number, string]> = [[100,"b100"], [500,"b500"], [1000,"b1000"]];

  for (const [n, tag] of batches) {
    try {
      const { passed, failed, contaminated } = await runBatch(n, tag);
      a.metrics[`batch_${n}_passed`]      = passed;
      a.metrics[`batch_${n}_failed`]      = failed;
      a.metrics[`batch_${n}_contaminated`] = contaminated;

      const passRate = (passed / n) * 100;

      if (passRate < 100) {
        finding(a, "CRITICAL", "RaceCondition", `Batch ${n}: ${failed} executions failed (${(100-passRate).toFixed(1)}% failure rate)`);
        a.score -= Math.round((failed / n) * 40);
      }

      if (contaminated > 0) {
        finding(a, "CRITICAL", "ContextLeakage", `Batch ${n}: ${contaminated} context contaminations detected`);
        a.score -= 30;
      }

    } catch (e: unknown) {
      finding(a, "CRITICAL", "BatchError", `Batch ${n}: ${String((e as Error).message ?? e)}`);
      a.score -= 30;
    }
  }

  a.metrics["totalExecutions"] = 1600;
  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}