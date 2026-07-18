/**
 * RegressionSuite.ts
 * Regression tests — ensures previously validated behaviors are never broken.
 *
 * Sprint: EV-1
 */

import { describe } from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";
import { KnowledgeQueryFacade } from "@/lib/knowledge-query/KnowledgeQueryFacade";
import { ConnectorKnowledgePipeline } from "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline";
import { EngineeringKnowledgePipeline } from "@/lib/engineering-runtime/integration/EngineeringKnowledgePipeline";

export function registerRegressionTests(): void {
  describe("Regression", "REGRESSION")

    // Knowledge Facade must always return a response (never throw)
    .test("REG-001: KnowledgeQueryFacade never throws on any intent", () => {
      const intents = ["", "   ", "a".repeat(100), "CRITICAL architecture violation"];
      for (const intent of intents) {
        const r = KnowledgeQueryFacade.queryAll(intent);
        AssertionEngine.assertNotNull(r);
      }
    })

    // Connector pipeline must never throw regardless of input
    .test("REG-002: ConnectorKnowledgePipeline never throws on valid request", () => {
      const result = ConnectorKnowledgePipeline.run({
        requestId: "REG-001", connector: "unknown", operation: "READ",
        intent: "regression test", provider: "test", parameters: {},
        priority: "LOW", domain: "GENERIC", project: "EVP", sprint: "EV-1", tags: [],
      });
      AssertionEngine.assertNotNull(result);
    })

    // Engineering pipeline must never throw
    .test("REG-003: EngineeringKnowledgePipeline never throws on valid request", () => {
      const result = EngineeringKnowledgePipeline.run({
        taskId: "REG-003", task: "TEST", intent: "regression test",
        module: "evp", component: "RegressionSuite", files: [],
        sprint: "EV-1", branch: "main", priority: "LOW", tags: [],
      });
      AssertionEngine.assertNotNull(result);
    })

    // Cache invalidation must be idempotent
    .test("REG-004: KnowledgeQueryCache invalidation is idempotent", () => {
      KnowledgeQueryFacade.invalidateCache();
      KnowledgeQueryFacade.invalidateCache();
      KnowledgeQueryFacade.invalidateCache();
      const r = KnowledgeQueryFacade.queryLessons("idempotent test");
      AssertionEngine.assertNotNull(r);
    })

    // Connector confidence score is always in 0–1 range
    .test("REG-005: Confidence score is always in [0, 1]", () => {
      const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
      for (const priority of priorities) {
        const { confidence } = ConnectorKnowledgePipeline.run({
          requestId: `REG-CONF-${priority}`, connector: "gmail", operation: "READ",
          intent: "confidence range test", provider: "google", parameters: {},
          priority, domain: "GMAIL", project: "EVP", sprint: "EV-1", tags: [],
        });
        AssertionEngine.assertInRange(confidence.score, 0, 1,
          `score out of range for priority ${priority}`);
      }
    })

    // GovernancePolicyRegistry must always have at least 5 active policies
    .test("REG-006: GovernancePolicyRegistry always has >= 5 default policies", async () => {
      const { GovernancePolicyRegistry } = await import(
        "@/lib/operational-knowledge/governance/GovernancePolicyRegistry"
      );
      const active = GovernancePolicyRegistry.getActive();
      AssertionEngine.assertTrue(active.length >= 5);
    })

    .register();
}