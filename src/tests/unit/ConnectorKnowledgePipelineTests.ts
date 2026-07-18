/**
 * ConnectorKnowledgePipelineTests.ts
 * Unit tests for ConnectorKnowledgePipeline.
 *
 * Sprint: EV-1
 */

import { describe } from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";
import { ConnectorKnowledgePipeline } from "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline";
import type { ConnectorRequest } from "@/lib/connector-runtime/integration/ConnectorKnowledgeContext";

const BASE_REQ: ConnectorRequest = {
  requestId:  "TEST-001",
  connector:  "gmail",
  operation:  "READ",
  intent:     "read emails from inbox",
  provider:   "google",
  parameters: {},
  priority:   "MEDIUM",
  domain:     "GMAIL",
  project:    "EVP",
  sprint:     "EV-1",
  tags:       ["test"],
};

export function registerConnectorKnowledgePipelineTests(): void {
  describe("ConnectorKnowledgePipeline", "UNIT")

    .test("run() returns a non-null result", () => {
      const result = ConnectorKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertNotNull(result);
    })

    .test("run() result contains frozen ctx with correct requestId", () => {
      const { ctx } = ConnectorKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertEquals(ctx.requestId, "TEST-001");
      AssertionEngine.assertEquals(ctx.connector,  "gmail");
      AssertionEngine.assertEquals(ctx.operation,  "READ");
    })

    .test("run() result contains bundle with all array fields", () => {
      const { bundle } = ConnectorKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertNotNull(bundle.all);
      AssertionEngine.assertNotNull(bundle.lessons);
      AssertionEngine.assertNotNull(bundle.governance);
    })

    .test("run() risk report has valid overallLevel", () => {
      const { risk } = ConnectorKnowledgePipeline.run(BASE_REQ);
      const validLevels = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
      AssertionEngine.assertIncludes(validLevels, risk.overallLevel);
    })

    .test("run() risk report riskScore is in range 0–100", () => {
      const { risk } = ConnectorKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertInRange(risk.riskScore, 0, 100);
    })

    .test("run() confidence score is in range 0–1", () => {
      const { confidence } = ConnectorKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertInRange(confidence.score, 0, 1);
    })

    .test("run() confidence has valid level", () => {
      const { confidence } = ConnectorKnowledgePipeline.run(BASE_REQ);
      const validLevels = ["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "INSUFFICIENT"];
      AssertionEngine.assertIncludes(validLevels, confidence.level);
    })

    .test("run() plan has valid retryStrategy", () => {
      const { plan } = ConnectorKnowledgePipeline.run(BASE_REQ);
      const validStrategies = ["NONE", "LINEAR", "EXPONENTIAL", "JITTER"];
      AssertionEngine.assertIncludes(validStrategies, plan.retryStrategy);
    })

    .test("run() advisory has a boolean proceed field", () => {
      const { advisory } = ConnectorKnowledgePipeline.run(BASE_REQ);
      AssertionEngine.assertType(advisory.proceed, "boolean");
      AssertionEngine.assertType(advisory.reason,  "string");
    })

    .test("run() report has valid result status", () => {
      const { report } = ConnectorKnowledgePipeline.run(BASE_REQ);
      const validResults = ["SUCCESS", "BLOCKED", "FALLBACK", "RETRIED", "FAILED"];
      AssertionEngine.assertIncludes(validResults, report.result);
    })

    .test("CRITICAL priority request is handled without throwing", () => {
      const req: ConnectorRequest = { ...BASE_REQ, requestId: "TEST-002", priority: "CRITICAL" };
      const result = ConnectorKnowledgePipeline.run(req);
      AssertionEngine.assertNotNull(result);
    })

    .test("getMetrics() returns a valid metrics snapshot", () => {
      ConnectorKnowledgePipeline.run(BASE_REQ);
      const metrics = ConnectorKnowledgePipeline.getMetrics();
      AssertionEngine.assertTrue(metrics.totalExecutions >= 1);
      AssertionEngine.assertInRange(metrics.successRate, 0, 100);
    })

    .register();
}