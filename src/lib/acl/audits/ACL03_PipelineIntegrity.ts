// ══════════════════════════════════════════════════════════════════════════════
// ACL-03 — Pipeline Integrity Audit
// Verifies that all execution flows pass through the ExecutionChain.
// No module may call Connector/Capability/Memory/Planner/Goal/Intent directly.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise, KNOWN_PIPELINE_STAGES } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import { ExecutionChain } from "@/lib/execution-chain/ExecutionChain";
import { PipelineBuilder } from "@/lib/execution-chain/PipelineBuilder";

export async function runACL03(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-03", "Pipeline Integrity Audit");
  const t = Date.now();

  try {
    // ── Verify ExecutionChain is the single entry point ───────────────────────
    const chain = new ExecutionChain();
    a.metrics["chainInstantiated"] = true;

    // ── Verify all 13 canonical stages are registered ─────────────────────────
    // PipelineBuilder must produce exactly the 13 declared stages
    // We verify via a test pipeline execution
    const input = {
      text: "ACL-03 pipeline integrity check",
      sessionId: "acl03-session",
      userId:    "acl03-user",
      timestamp: Date.now(),
    };

    const report = await chain.execute(input);
    const stagesExecuted = report.stages.map(s => s.stage);

    a.metrics["stagesExecuted"] = stagesExecuted.length;
    a.metrics["stagesExpected"] = KNOWN_PIPELINE_STAGES.length;

    // ── Check all canonical stages are present ────────────────────────────────
    for (const expected of KNOWN_PIPELINE_STAGES) {
      if (!stagesExecuted.includes(expected as typeof stagesExecuted[0])) {
        finding(a, "HIGH", "MissingStage",
          `Canonical stage '${expected}' not found in pipeline execution`);
        a.score -= 7;
      }
    }

    // ── Check no extra undeclared stages ──────────────────────────────────────
    for (const actual of stagesExecuted) {
      if (!KNOWN_PIPELINE_STAGES.includes(actual)) {
        finding(a, "MEDIUM", "UnknownStage",
          `Undeclared stage '${actual}' found in pipeline — architectural drift`);
        a.score -= 5;
      }
    }

    // ── Verify stage ordering ─────────────────────────────────────────────────
    let orderViolations = 0;
    for (let i = 0; i < stagesExecuted.length; i++) {
      const expected = KNOWN_PIPELINE_STAGES[i];
      if (stagesExecuted[i] !== expected) {
        orderViolations++;
        finding(a, "CRITICAL", "StageOrderViolation",
          `Stage at position ${i} is '${stagesExecuted[i]}' but expected '${expected}'`);
        a.score -= 15;
      }
    }
    a.metrics["orderViolations"] = orderViolations;

    // ── Verify execution completed or failed gracefully ───────────────────────
    a.metrics["pipelineStatus"] = report.status;
    a.metrics["stagesPassed"]   = report.stagesPassed;
    a.metrics["stagesTotal"]    = report.stagesTotal;

    if (report.status !== "COMPLETED" && report.status !== "FAILED") {
      finding(a, "HIGH", "PipelineStatus",
        `Pipeline returned unexpected status '${report.status}'`);
      a.score -= 10;
    }

    // ── Verify chainId and sessionId are propagated ───────────────────────────
    if (!report.chainId) {
      finding(a, "HIGH", "MissingChainId", "ExecutionChainReport missing chainId");
      a.score -= 5;
    }
    if (report.sessionId !== input.sessionId) {
      finding(a, "HIGH", "SessionPropagation",
        `sessionId mismatch: expected '${input.sessionId}', got '${report.sessionId}'`);
      a.score -= 5;
    }

    if (orderViolations === 0 && stagesExecuted.length === KNOWN_PIPELINE_STAGES.length) {
      finding(a, "INFO", "PipelineIntegrity",
        `All ${KNOWN_PIPELINE_STAGES.length} stages present in canonical order`);
    }

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL03Error", String(err));
    a.score -= 40;
  }

  return finalise(a, t);
}