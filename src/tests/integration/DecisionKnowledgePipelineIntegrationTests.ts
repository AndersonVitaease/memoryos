/**
 * DecisionKnowledgePipelineIntegrationTests.ts
 * Integration tests — Decision Request → Advisory full flow.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { DecisionKnowledgePipeline } from "@/lib/decision-engine/integration/DecisionKnowledgePipeline";
import type { DecisionRequest } from "@/lib/decision-engine/integration/DecisionKnowledgeContext";

const BASE_REQ: DecisionRequest = {
  decisionId:   "D-EV2-001",
  goalId:       "G-EV2-001",
  intent:       "approve architectural change for connector runtime",
  decisionType: "APPROVE",
  priority:     "MEDIUM",
  domain:       "ARCHITECTURE",
  components:   ["ConnectorRuntime"],
  project:      "MemoryOS",
  sprint:       "EV-2",
  tags:         ["integration", "architecture"],
};

export function registerDecisionPipelineIntegrationTests(): void {
  describe("DecisionKnowledgePipeline [INT]", "INTEGRATION")

    // ── Approved decision ─────────────────────────────────────────────────────
    .test("INT-DC-01: APPROVE request returns a complete pipeline result", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertNotNull(r.ctx);
      AssertionEngine.assertNotNull(r.advisory);
      AssertionEngine.assertNotNull(r.risk);
      AssertionEngine.assertNotNull(r.constraints);
      AssertionEngine.assertNotNull(r.governance);
      AssertionEngine.assertNotNull(r.confidence);
    })

    // ── Blocked decision (CRITICAL + high risk) ───────────────────────────────
    .test("INT-DC-02: CRITICAL REJECT request produces a result without throwing", () => {
      const req: DecisionRequest = {
        ...BASE_REQ,
        decisionId:   "D-EV2-002",
        decisionType: "REJECT",
        priority:     "CRITICAL",
        intent:       "reject architectural rollback under critical condition",
      };
      const r = DecisionKnowledgePipeline.run(req);
      AssertionEngine.assertNotNull(r);
      AssertionEngine.assertType(r.durationMs, "number");
    })

    // ── Low confidence path ───────────────────────────────────────────────────
    .test("INT-DC-03: confidence score is always in [0, 1]", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertInRange(r.confidence.score, 0, 1);
    })

    // ── Risk level is valid ───────────────────────────────────────────────────
    .test("INT-DC-04: risk.overallLevel is a valid risk level", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      const valid = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
      AssertionEngine.assertIncludes(valid, r.risk.overallLevel);
    })

    // ── Governance validation contract ────────────────────────────────────────
    .test("INT-DC-05: governance result has a boolean approved field", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertType(r.governance.approved, "boolean");
    })

    // ── Constraints contract ──────────────────────────────────────────────────
    .test("INT-DC-06: constraints.constraints is an array", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertTrue(Array.isArray(r.constraints.constraints));
    })

    // ── Advisory recommended decision ─────────────────────────────────────────
    .test("INT-DC-07: advisory.recommendedDecision is a valid value", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      const valid = ["APPROVE", "REJECT", "DEFER", "DELEGATE", "ESCALATE", "MERGE", "ARCHIVE", "REVIEW"];
      AssertionEngine.assertIncludes(valid, r.advisory.recommendedDecision);
    })

    // ── Conflict type ─────────────────────────────────────────────────────────
    .test("INT-DC-08: CONFLICT intent does not throw", () => {
      const req: DecisionRequest = {
        ...BASE_REQ,
        decisionId: "D-EV2-CONFLICT",
        intent:     "resolve architectural conflict between two competing patterns",
        decisionType: "MERGE",
      };
      const r = DecisionKnowledgePipeline.run(req);
      AssertionEngine.assertNotNull(r);
    })

    // ── Context built correctly ───────────────────────────────────────────────
    .test("INT-DC-09: ctx.decisionId matches the request", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertEquals(r.ctx.decisionId, "D-EV2-001");
    })

    // ── Duration is positive ──────────────────────────────────────────────────
    .test("INT-DC-10: durationMs is >= 0", () => {
      const r = DecisionKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertTrue(r.durationMs >= 0);
    })

    .register();
}