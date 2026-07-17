// ══════════════════════════════════════════════════════════════════════════════
// AVP-02 — Runtime Integrity Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, makeChain, inp } from "../AVPHelpers";

const CANONICAL_STAGES = [
  "USER_INPUT","INTENT_RUNTIME","GOAL_RUNTIME","PLANNING_RUNTIME",
  "KERNEL","RUNTIME_ORCHESTRATOR","CAPABILITY_RUNTIME","CONNECTOR_RUNTIME",
  "CONNECTOR","RESULT","MEMORY","EXPLAINABILITY","AUDIT",
];

const SCENARIOS = [
  { text: "What was the decision about the product roadmap last week?", tag: "memory-recall" },
  { text: "Send email to john@company.com about the Q3 review",         tag: "email" },
  { text: "Schedule a meeting for tomorrow at 3pm",                     tag: "calendar" },
  { text: "Open the architecture document in Drive",                    tag: "drive" },
  { text: "What is my name?",                                           tag: "simple" },
];

export async function runAVP02(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-02", "Runtime Integrity Audit");

  for (const scenario of SCENARIOS) {
    const chain = makeChain(`avp02-${scenario.tag}`);
    try {
      const r = await chain.execute(inp(scenario.text, `sess-${scenario.tag}`));

      // Stage count
      if (r.stagesTotal !== 13) {
        finding(a, "CRITICAL", "StageCount", `[${scenario.tag}] Expected 13 stages, got ${r.stagesTotal}`);
        a.score -= 15;
      }

      // All stages completed
      if (r.stagesPassed !== 13) {
        finding(a, "CRITICAL", "StageExecution", `[${scenario.tag}] Only ${r.stagesPassed}/13 stages passed`);
        a.score -= 15;
      }

      // Correct ordering
      const actualIds = r.stages.map(s => s.stage);
      const orderOk   = CANONICAL_STAGES.every((id, i) => actualIds[i] === id);
      if (!orderOk) {
        finding(a, "CRITICAL", "StageOrdering", `[${scenario.tag}] Stage ordering violation. Got: ${actualIds.join(",")}`);
        a.score -= 20;
      }

      // Status COMPLETED
      if (r.status !== "COMPLETED") {
        finding(a, "HIGH", "ExecutionStatus", `[${scenario.tag}] Status=${r.status}, expected COMPLETED`);
        a.score -= 10;
      }

      // State propagation — final state must have memory + explainability + audit
      if (!r.memoryResult)         { finding(a, "HIGH", "StatePropagation", `[${scenario.tag}] memoryResult missing`);         a.score -= 8; }
      if (!r.explainabilityResult) { finding(a, "HIGH", "StatePropagation", `[${scenario.tag}] explainabilityResult missing`); a.score -= 8; }
      if (!r.auditResult)          { finding(a, "HIGH", "StatePropagation", `[${scenario.tag}] auditResult missing`);          a.score -= 8; }

      // Events generated
      const events = chain.bus().history();
      const hasStarted   = events.some(e => e.type === "EXECUTION_STARTED");
      const hasCompleted = events.some(e => e.type === "EXECUTION_COMPLETED");
      if (!hasStarted)   { finding(a, "MEDIUM", "EventGeneration", `[${scenario.tag}] EXECUTION_STARTED not emitted`);   a.score -= 4; }
      if (!hasCompleted) { finding(a, "MEDIUM", "EventGeneration", `[${scenario.tag}] EXECUTION_COMPLETED not emitted`); a.score -= 4; }

      // Metrics recorded
      const m = chain.metrics().snapshot();
      if (m.executions < 1) { finding(a, "MEDIUM", "Metrics", `[${scenario.tag}] executions not incremented`); a.score -= 4; }

      // Report frozen
      if (!Object.isFrozen(r)) { finding(a, "HIGH", "Immutability", `[${scenario.tag}] Report not frozen`); a.score -= 5; }

      // Snapshot — chainId must be present
      if (!r.chainId) { finding(a, "HIGH", "SnapshotGeneration", `[${scenario.tag}] chainId missing from report`); a.score -= 5; }

    } catch (e: unknown) {
      finding(a, "CRITICAL", "RuntimeException", `[${scenario.tag}] ${String((e as Error).message ?? e)}`);
      a.score -= 20;
    }
  }

  a.metrics["scenariosExecuted"] = SCENARIOS.length;
  a.metrics["canonicalStages"]   = 13;
  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}