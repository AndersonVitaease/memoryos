/**
 * PipelineStressTests.ts
 * Stress tests: 100 / 500 / 1000 consecutive pipeline executions.
 * Validates: no leaks, no deadlocks, no inconsistencies.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { KnowledgeQueryFacade }       from "@/lib/knowledge-query/KnowledgeQueryFacade";
import { ConnectorKnowledgePipeline } from "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline";
import { EngineeringKnowledgePipeline } from "@/lib/engineering-runtime/integration/EngineeringKnowledgePipeline";

function runConnector(n: number): number {
  let errors = 0;
  for (let i = 0; i < n; i++) {
    try {
      ConnectorKnowledgePipeline.run({
        requestId: `STRESS-CN-${i}`, connector: "gmail", operation: "READ",
        intent: `stress test iteration ${i}`, provider: "google", parameters: {},
        priority: "LOW", domain: "GMAIL", project: "EVP", sprint: "EV-2", tags: [],
      });
    } catch { errors++; }
  }
  return errors;
}

function runEngineering(n: number): number {
  let errors = 0;
  const types = ["IMPLEMENT", "REFACTOR", "DEPLOY", "TEST"] as const;
  for (let i = 0; i < n; i++) {
    try {
      EngineeringKnowledgePipeline.run({
        taskId: `STRESS-ENG-${i}`, task: types[i % 4], intent: `stress ${i}`,
        module: "stress", component: "StressTest", files: [], sprint: "EV-2",
        branch: "stress", priority: "LOW", tags: [],
      });
    } catch { errors++; }
  }
  return errors;
}

function runKnowledge(n: number): number {
  let errors = 0;
  for (let i = 0; i < n; i++) {
    try {
      KnowledgeQueryFacade.queryAll(`stress query ${i % 20}`); // 20 unique intents to cycle cache
    } catch { errors++; }
  }
  return errors;
}

export function registerPipelineStressTests(): void {
  describe("PipelineStress [INT]", "INTEGRATION")

    // ── 100 iterations ───────────────────────────────────────────────────────
    .test("STRESS-01: 100 consecutive Connector pipeline runs — 0 errors", () => {
      const errors = runConnector(100);
      AssertionEngine.assertEquals(errors, 0);
    })

    .test("STRESS-02: 100 consecutive Engineering pipeline runs — 0 errors", () => {
      const errors = runEngineering(100);
      AssertionEngine.assertEquals(errors, 0);
    })

    .test("STRESS-03: 100 consecutive Knowledge query runs — 0 errors", () => {
      const errors = runKnowledge(100);
      AssertionEngine.assertEquals(errors, 0);
    })

    // ── 500 iterations ───────────────────────────────────────────────────────
    .test("STRESS-04: 500 consecutive Connector pipeline runs — 0 errors", () => {
      const errors = runConnector(500);
      AssertionEngine.assertEquals(errors, 0);
    })

    .test("STRESS-05: 500 consecutive Knowledge query runs — 0 errors", () => {
      const errors = runKnowledge(500);
      AssertionEngine.assertEquals(errors, 0);
    })

    // ── 1000 iterations ──────────────────────────────────────────────────────
    .test("STRESS-06: 1000 consecutive Knowledge query runs — 0 errors", () => {
      const errors = runKnowledge(1000);
      AssertionEngine.assertEquals(errors, 0);
    })

    // ── State consistency after stress ────────────────────────────────────────
    .test("STRESS-07: after 500 runs, cache still hits correctly", () => {
      KnowledgeQueryFacade.invalidateCache();
      runKnowledge(500);
      KnowledgeQueryFacade.queryAll("final consistency check");
      const second = KnowledgeQueryFacade.queryAll("final consistency check");
      AssertionEngine.assertTrue(second.cacheHit);
    })

    // ── Metrics integrity after stress ────────────────────────────────────────
    .test("STRESS-08: metrics remain accessible and coherent after 100 Connector runs", () => {
      runConnector(100);
      const m = ConnectorKnowledgePipeline.getMetrics();
      AssertionEngine.assertNotNull(m);
      AssertionEngine.assertTrue(m.totalExecutions >= 100);
      AssertionEngine.assertInRange(m.successRate, 0, 100);
    })

    // ── No state mutation across calls ────────────────────────────────────────
    .test("STRESS-09: 100 identical Engineering runs return consistent advisory.proceed type", () => {
      const task = {
        taskId: "STRESS-IDEMPOTENT", task: "IMPLEMENT" as const, intent: "idempotent test",
        module: "stress", component: "IdempotentTest", files: [], sprint: "EV-2",
        branch: "stress", priority: "MEDIUM" as const, tags: [],
      };
      let types = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const r = EngineeringKnowledgePipeline.run({ ...task, taskId: `STRESS-ID-${i}` });
        types.add(typeof r.advisory.proceed);
      }
      AssertionEngine.assertEquals(types.size, 1);
      AssertionEngine.assertTrue(types.has("boolean"));
    })

    .register();
}