// ══════════════════════════════════════════════════════════════════════════════
// AVP-07 — Constitution Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, makeChain, inp } from "../AVPHelpers";
import { ExecutionCompositionRoot } from "../../execution-chain/ExecutionCompositionRoot";
import { DeterministicClock }       from "../../runtime-infra/RuntimeClock";
import { EMPTY_EXECUTION_STATE }    from "../../execution-chain/ExecutionState";

export async function runAVP07(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-07", "Constitution Audit");

  // ── 1. TRANSPARENCY: All stage decisions are recorded ─────────────────────
  {
    const chain = makeChain("avp07-transparency");
    const r = await chain.execute(inp("transparency test", "sess-t"));
    const allRecorded = r.stages.every(s => s.stage && s.status && s.durationMs >= 0);
    if (!allRecorded) {
      finding(a, "CRITICAL", "Transparency", "Not all stage decisions are recorded");
      a.score -= 15;
    }
    a.metrics["transparencyStages"] = r.stages.length;
  }

  // ── 2. EXPLAINABILITY: Evidences collected ────────────────────────────────
  {
    const chain = makeChain("avp07-explainability");
    const r = await chain.execute(inp("explainability test", "sess-e"));
    const ex = r.explainabilityResult as Record<string,unknown> | null;
    if (!ex || !("traceId" in ex)) {
      finding(a, "CRITICAL", "Explainability", "ExplainabilityResult missing or incomplete");
      a.score -= 15;
    }
  }

  // ── 3. AUDITABILITY: Audit record generated ───────────────────────────────
  {
    const chain = makeChain("avp07-auditability");
    const r = await chain.execute(inp("audit test", "sess-a"));
    if (!r.auditResult) {
      finding(a, "CRITICAL", "Auditability", "AuditResult not generated");
      a.score -= 15;
    }
    const events = chain.bus().history();
    if (events.length === 0) {
      finding(a, "HIGH", "Auditability", "No runtime events recorded — auditability compromised");
      a.score -= 10;
    }
    a.metrics["auditEvents"] = events.length;
  }

  // ── 4. LEAST PRIVILEGE: Permissions object is present and scoped ──────────
  {
    const clock = new DeterministicClock(10);
    const rt = ExecutionCompositionRoot.compose({ runtimeClock: clock });
    const ctx = ExecutionCompositionRoot.buildContext(rt, "exec-lp", "sess-lp", "user-lp");
    if (!ctx.permissions) {
      finding(a, "CRITICAL", "LeastPrivilege", "ExecutionContext has no permissions object");
      a.score -= 20;
    } else {
      if (!ctx.permissions.userId) {
        finding(a, "HIGH", "LeastPrivilege", "permissions.userId missing");
        a.score -= 8;
      }
      if (!Array.isArray(ctx.permissions.scopes) || ctx.permissions.scopes.length === 0) {
        finding(a, "MEDIUM", "LeastPrivilege", "permissions.scopes empty — no scope enforcement");
        a.score -= 5;
      }
    }
  }

  // ── 5. REVERSIBILITY: Reports are frozen — mutations rejected ─────────────
  {
    const chain = makeChain("avp07-reversibility");
    const r = await chain.execute(inp("reversibility test", "sess-r")) as Record<string, unknown>;
    let mutationRejected = false;
    try { r["chainId"] = "TAMPERED"; } catch { mutationRejected = true; }
    if (!mutationRejected) {
      finding(a, "HIGH", "Reversibility", "Report mutation not rejected — frozen state violated");
      a.score -= 10;
    }
    a.metrics["mutationRejected"] = mutationRejected;
  }

  // ── 6. ISOLATION: EMPTY_EXECUTION_STATE must be frozen ───────────────────
  {
    if (!Object.isFrozen(EMPTY_EXECUTION_STATE)) {
      finding(a, "CRITICAL", "Isolation", "EMPTY_EXECUTION_STATE is not frozen — shared mutable base state");
      a.score -= 20;
    }
    let baseMutated = false;
    try { (EMPTY_EXECUTION_STATE as Record<string,unknown>)["_test"] = 1; baseMutated = true; } catch { /* good */ }
    if (baseMutated) {
      finding(a, "CRITICAL", "Isolation", "EMPTY_EXECUTION_STATE is mutable — singleton state corruption risk");
      a.score -= 25;
    }
    a.metrics["emptyStateFrozen"] = Object.isFrozen(EMPTY_EXECUTION_STATE);
  }

  // ── 7. DETERMINISM: Same input → same pipeline structure ─────────────────
  {
    const runSame = async (i: number) => {
      const chain = makeChain(`avp07-det-${i}`);
      const r = await chain.execute(inp("determinism check", `sess-det-${i}`));
      return r.stagesTotal;
    };
    const counts = await Promise.all([runSame(0), runSame(1), runSame(2)]);
    if (new Set(counts).size > 1) {
      finding(a, "CRITICAL", "Determinism", `Non-deterministic pipeline stage count: ${counts.join(",")}`);
      a.score -= 20;
    }
    a.metrics["determinismCounts"] = counts.join(",");
  }

  // ── 8. IMMUTABILITY: Stage records must be frozen ─────────────────────────
  {
    const chain = makeChain("avp07-immutability");
    const r = await chain.execute(inp("immutability test", "sess-i"));
    const nonFrozen = r.stages.filter(s => !Object.isFrozen(s)).length;
    if (nonFrozen > 0) {
      finding(a, "HIGH", "Immutability", `${nonFrozen} stage records are not frozen`);
      a.score -= 10;
    }
    a.metrics["frozenStageRecords"] = r.stages.length - nonFrozen;
  }

  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}