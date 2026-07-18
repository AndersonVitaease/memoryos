/**
 * PlanningKnowledgePipelineIntegrationTests.ts
 * Integration tests — Goal → Advisory full flow.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { PlanningKnowledgePipeline } from "@/lib/planning-engine/integration/PlanningKnowledgePipeline";
import type { PlanningGoalInput }    from "@/lib/planning-engine/integration/PlanningKnowledgeContext";

const BASE_GOAL: PlanningGoalInput = {
  goalId:     "G-EV2-001",
  intent:     "implement knowledge query integration tests",
  priority:   "MEDIUM",
  domain:     "TESTING",
  components: ["TestEngine", "AssertionEngine"],
  project:    "MemoryOS",
  sprint:     "EV-2",
  tags:       ["testing", "integration"],
};

export function registerPlanningPipelineIntegrationTests(): void {
  describe("PlanningKnowledgePipeline [INT]", "INTEGRATION")

    // ── Simple plan ───────────────────────────────────────────────────────────
    .test("INT-PL-01: simple goal produces a non-null advisory", () => {
      const r = PlanningKnowledgePipeline.run(BASE_GOAL);
      AssertionEngine.assertNotNull(r.advisory);
      AssertionEngine.assertNotNull(r.filtered);
    })

    // ── Multiple constraints ──────────────────────────────────────────────────
    .test("INT-PL-02: CRITICAL priority goal activates constraints", () => {
      const goal: PlanningGoalInput = { ...BASE_GOAL, goalId: "G-EV2-002", priority: "CRITICAL" };
      const r = PlanningKnowledgePipeline.run(goal);
      AssertionEngine.assertNotNull(r.advisory);
      AssertionEngine.assertType(r.durationMs, "number");
      AssertionEngine.assertTrue(r.durationMs >= 0);
    })

    // ── Conflict detection ────────────────────────────────────────────────────
    .test("INT-PL-03: conflicts array is present and is an array", () => {
      const r = PlanningKnowledgePipeline.run(BASE_GOAL);
      AssertionEngine.assertNotNull(r.conflicts);
      AssertionEngine.assertTrue(Array.isArray(r.conflicts));
    })

    // ── Cache miss → hit ──────────────────────────────────────────────────────
    .test("INT-PL-04: second run with same goalId is a cache hit", () => {
      PlanningKnowledgePipeline.invalidateCache();
      const g: PlanningGoalInput = { ...BASE_GOAL, goalId: "G-EV2-CACHE" };
      const first  = PlanningKnowledgePipeline.run(g);
      const second = PlanningKnowledgePipeline.run(g);
      AssertionEngine.assertFalse(first.cacheHit);
      AssertionEngine.assertTrue(second.cacheHit);
    })

    // ── Empty component list ──────────────────────────────────────────────────
    .test("INT-PL-05: goal with no components does not throw", () => {
      const g: PlanningGoalInput = { ...BASE_GOAL, goalId: "G-EV2-EMPTY", components: [] };
      const r = PlanningKnowledgePipeline.run(g);
      AssertionEngine.assertNotNull(r);
    })

    // ── Complex multi-component plan ──────────────────────────────────────────
    .test("INT-PL-06: complex multi-component plan executes fully", () => {
      const g: PlanningGoalInput = {
        ...BASE_GOAL,
        goalId:     "G-EV2-COMPLEX",
        components: ["ConnectorRuntime", "KnowledgeQueryFacade", "GovernancePipeline", "EngineeringPipeline"],
        priority:   "HIGH",
        domain:     "ARCHITECTURE",
      };
      const r = PlanningKnowledgePipeline.run(g);
      AssertionEngine.assertNotNull(r.advisory);
      AssertionEngine.assertNotNull(r.itemCount);
    })

    // ── ItemCount contract ────────────────────────────────────────────────────
    .test("INT-PL-07: itemCount.kept <= itemCount.total", () => {
      const r = PlanningKnowledgePipeline.run({ ...BASE_GOAL, goalId: "G-EV2-COUNT" });
      AssertionEngine.assertTrue(r.itemCount.kept    <= r.itemCount.total);
      AssertionEngine.assertTrue(r.itemCount.ranked  <= r.itemCount.kept);
      AssertionEngine.assertTrue(r.itemCount.accepted <= r.itemCount.ranked);
    })

    // ── Metrics increment ─────────────────────────────────────────────────────
    .test("INT-PL-08: metrics totalExecutions increases after run", () => {
      const before = PlanningKnowledgePipeline.getMetrics().totalExecutions;
      PlanningKnowledgePipeline.run({ ...BASE_GOAL, goalId: "G-EV2-METRICS" });
      const after  = PlanningKnowledgePipeline.getMetrics().totalExecutions;
      AssertionEngine.assertTrue(after > before);
    })

    .register();
}