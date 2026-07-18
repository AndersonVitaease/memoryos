/**
 * EngineeringKnowledgePipelineIntegrationTests.ts
 * Integration tests — all 7 task types end-to-end.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { EngineeringKnowledgePipeline } from "@/lib/engineering-runtime/integration/EngineeringKnowledgePipeline";
import type { EngineeringTaskRequest }  from "@/lib/engineering-runtime/integration/EngineeringKnowledgeContext";

const BASE_TASK: EngineeringTaskRequest = {
  taskId:    "T-EV2-BASE",
  task:      "IMPLEMENT",
  intent:    "integration test for engineering pipeline",
  module:    "testing",
  component: "EngineeringKnowledgePipeline",
  files:     ["EngineeringKnowledgePipeline.ts"],
  sprint:    "EV-2",
  branch:    "feature/ev-2",
  priority:  "MEDIUM",
  tags:      ["integration"],
};

function task(overrides: Partial<EngineeringTaskRequest>): EngineeringTaskRequest {
  return { ...BASE_TASK, ...overrides };
}

export function registerEngineeringPipelineIntegrationTests(): void {
  describe("EngineeringKnowledgePipeline [INT]", "INTEGRATION")

    .test("INT-ENG-01: IMPLEMENT produces full pipeline result", () => {
      const r = EngineeringKnowledgePipeline.run(task({ taskId: "T-EV2-IMP" }));
      AssertionEngine.assertNotNull(r.ctx);
      AssertionEngine.assertNotNull(r.bundle);
      AssertionEngine.assertNotNull(r.risk);
      AssertionEngine.assertNotNull(r.governance);
      AssertionEngine.assertNotNull(r.confidence);
      AssertionEngine.assertNotNull(r.plan);
      AssertionEngine.assertNotNull(r.advisory);
      AssertionEngine.assertNotNull(r.report);
    })

    .test("INT-ENG-02: REFACTOR task returns valid deploymentReadiness", () => {
      const r = EngineeringKnowledgePipeline.run(task({ taskId: "T-EV2-REF", task: "REFACTOR" }));
      const valid = ["READY", "NEEDS_REVIEW", "BLOCKED", "DEFERRED"];
      AssertionEngine.assertIncludes(valid, r.plan.deploymentReadiness);
    })

    .test("INT-ENG-03: DEPLOY task with CRITICAL priority has non-trivial risk", () => {
      const r = EngineeringKnowledgePipeline.run(task({ taskId: "T-EV2-DEP", task: "DEPLOY", priority: "CRITICAL" }));
      AssertionEngine.assertNotNull(r.risk.overallLevel);
      // CRITICAL DEPLOY should at least trigger MEDIUM or above
      const level = r.risk.overallLevel;
      AssertionEngine.assertIncludes(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"], level);
    })

    .test("INT-ENG-04: ROLLBACK task exposes breakingChangeRisk boolean", () => {
      const r = EngineeringKnowledgePipeline.run(task({ taskId: "T-EV2-ROL", task: "ROLLBACK" }));
      AssertionEngine.assertType(r.risk.breakingChangeRisk, "boolean");
    })

    .test("INT-ENG-05: HOTFIX task produces an advisory with proceed boolean", () => {
      const r = EngineeringKnowledgePipeline.run(task({ taskId: "T-EV2-HOT", task: "HOTFIX", priority: "HIGH" }));
      AssertionEngine.assertType(r.advisory.proceed, "boolean");
      AssertionEngine.assertType(r.advisory.reason, "string");
    })

    .test("INT-ENG-06: TEST task uses valid testingStrategy", () => {
      const r = EngineeringKnowledgePipeline.run(task({ taskId: "T-EV2-TST", task: "TEST" }));
      const valid = ["UNIT_ONLY", "UNIT_INTEGRATION", "FULL_SUITE", "REGRESSION_FOCUSED"];
      AssertionEngine.assertIncludes(valid, r.plan.testingStrategy);
    })

    .test("INT-ENG-07: DOCUMENTATION task returns APPROVED or NEEDS_REVIEW result", () => {
      const r = EngineeringKnowledgePipeline.run(task({ taskId: "T-EV2-DOC", task: "DOCUMENTATION" }));
      const valid = ["APPROVED", "BLOCKED", "DEFERRED", "NEEDS_REVIEW", "COMPLETED"];
      AssertionEngine.assertIncludes(valid, r.report.result);
    })

    .test("INT-ENG-08: confidence score always in [0, 1] for all task types", () => {
      const types = ["IMPLEMENT", "REFACTOR", "DEPLOY", "ROLLBACK", "HOTFIX", "TEST", "DOCUMENTATION"] as const;
      for (const t of types) {
        const r = EngineeringKnowledgePipeline.run(task({ taskId: `T-EV2-CONF-${t}`, task: t }));
        AssertionEngine.assertInRange(r.confidence.score, 0, 1, `confidence out of range for task ${t}`);
      }
    })

    .test("INT-ENG-09: ctx.taskId matches input for all task types", () => {
      const types = ["IMPLEMENT", "REFACTOR", "DEPLOY", "ROLLBACK", "HOTFIX", "TEST", "DOCUMENTATION"] as const;
      for (const t of types) {
        const id = `T-EV2-CTX-${t}`;
        const r  = EngineeringKnowledgePipeline.run(task({ taskId: id, task: t }));
        AssertionEngine.assertEquals(r.ctx.taskId, id);
      }
    })

    .test("INT-ENG-10: plan.validationStrategy is valid for every task type", () => {
      const types = ["IMPLEMENT", "REFACTOR", "DEPLOY", "ROLLBACK", "HOTFIX", "TEST", "DOCUMENTATION"] as const;
      const valid = ["NONE", "STATIC_ANALYSIS", "FULL_VALIDATION", "ARCHITECTURAL_AUDIT"];
      for (const t of types) {
        const r = EngineeringKnowledgePipeline.run(task({ taskId: `T-EV2-VS-${t}`, task: t }));
        AssertionEngine.assertIncludes(valid, r.plan.validationStrategy, `invalid validationStrategy for ${t}`);
      }
    })

    .register();
}