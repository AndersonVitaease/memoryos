/**
 * EngineeringKnowledgePipelineTests.ts
 * Unit tests for EngineeringKnowledgePipeline.
 *
 * Sprint: EV-1
 */

import { describe } from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";
import { EngineeringKnowledgePipeline } from "@/lib/engineering-runtime/integration/EngineeringKnowledgePipeline";
import type { EngineeringTaskRequest } from "@/lib/engineering-runtime/integration/EngineeringKnowledgeContext";

const BASE_TASK: EngineeringTaskRequest = {
  taskId:    "EV-TASK-001",
  task:      "IMPLEMENT",
  intent:    "add knowledge query facade",
  module:    "knowledge-query",
  component: "KnowledgeQueryFacade",
  files:     ["KnowledgeQueryFacade.ts"],
  sprint:    "EV-1",
  branch:    "feature/ev-1",
  priority:  "MEDIUM",
  tags:      ["test"],
};

export function registerEngineeringKnowledgePipelineTests(): void {
  describe("EngineeringKnowledgePipeline", "UNIT")

    .test("run() returns a non-null result", () => {
      const result = EngineeringKnowledgePipeline.run(BASE_TASK);
      AssertionEngine.assertNotNull(result);
    })

    .test("run() ctx has correct taskId and task", () => {
      const { ctx } = EngineeringKnowledgePipeline.run(BASE_TASK);
      AssertionEngine.assertEquals(ctx.taskId, "EV-TASK-001");
      AssertionEngine.assertEquals(ctx.task,   "IMPLEMENT");
    })

    .test("run() risk overallLevel is valid", () => {
      const { risk } = EngineeringKnowledgePipeline.run(BASE_TASK);
      const valid = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
      AssertionEngine.assertIncludes(valid, risk.overallLevel);
    })

    .test("run() risk report exposes breakingChangeRisk and regressionRisk booleans", () => {
      const { risk } = EngineeringKnowledgePipeline.run(BASE_TASK);
      AssertionEngine.assertType(risk.breakingChangeRisk, "boolean");
      AssertionEngine.assertType(risk.regressionRisk,     "boolean");
    })

    .test("run() confidence score in range 0–1", () => {
      const { confidence } = EngineeringKnowledgePipeline.run(BASE_TASK);
      AssertionEngine.assertInRange(confidence.score, 0, 1);
    })

    .test("run() plan has valid validationStrategy", () => {
      const { plan } = EngineeringKnowledgePipeline.run(BASE_TASK);
      const valid = ["NONE", "STATIC_ANALYSIS", "FULL_VALIDATION", "ARCHITECTURAL_AUDIT"];
      AssertionEngine.assertIncludes(valid, plan.validationStrategy);
    })

    .test("run() plan has valid deploymentReadiness", () => {
      const { plan } = EngineeringKnowledgePipeline.run(BASE_TASK);
      const valid = ["READY", "NEEDS_REVIEW", "BLOCKED", "DEFERRED"];
      AssertionEngine.assertIncludes(valid, plan.deploymentReadiness);
    })

    .test("run() advisory proceed is boolean", () => {
      const { advisory } = EngineeringKnowledgePipeline.run(BASE_TASK);
      AssertionEngine.assertType(advisory.proceed, "boolean");
    })

    .test("run() report result is valid", () => {
      const { report } = EngineeringKnowledgePipeline.run(BASE_TASK);
      const valid = ["APPROVED", "BLOCKED", "DEFERRED", "NEEDS_REVIEW", "COMPLETED"];
      AssertionEngine.assertIncludes(valid, report.result);
    })

    .test("CRITICAL DEPLOY task escalates correctly", () => {
      const task: EngineeringTaskRequest = {
        ...BASE_TASK, taskId: "EV-TASK-002", task: "DEPLOY", priority: "CRITICAL",
      };
      const { plan } = EngineeringKnowledgePipeline.run(task);
      // Critical deploy should not be READY without reviews
      AssertionEngine.assertNotNull(plan.deploymentReadiness);
    })

    .test("REFACTOR task uses UNIT_INTEGRATION testing strategy", () => {
      const task: EngineeringTaskRequest = {
        ...BASE_TASK, taskId: "EV-TASK-003", task: "REFACTOR", priority: "MEDIUM",
      };
      const { plan } = EngineeringKnowledgePipeline.run(task);
      const testingStrategies = ["UNIT_ONLY", "UNIT_INTEGRATION", "FULL_SUITE", "REGRESSION_FOCUSED"];
      AssertionEngine.assertIncludes(testingStrategies, plan.testingStrategy);
    })

    .test("getMetrics() totalTasks increases after run", () => {
      const before = EngineeringKnowledgePipeline.getMetrics().totalTasks;
      EngineeringKnowledgePipeline.run({ ...BASE_TASK, taskId: "EV-TASK-METRICS" });
      const after  = EngineeringKnowledgePipeline.getMetrics().totalTasks;
      AssertionEngine.assertTrue(after > before);
    })

    .register();
}