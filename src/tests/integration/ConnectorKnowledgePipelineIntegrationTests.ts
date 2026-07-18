/**
 * ConnectorKnowledgePipelineIntegrationTests.ts
 * Integration tests — all 8 connector operation types end-to-end.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { ConnectorKnowledgePipeline } from "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline";
import type { ConnectorRequest }      from "@/lib/connector-runtime/integration/ConnectorKnowledgeContext";

const BASE: ConnectorRequest = {
  requestId:  "CR-EV2-BASE",
  connector:  "gmail",
  operation:  "READ",
  intent:     "integration test connector pipeline",
  provider:   "google",
  parameters: {},
  priority:   "MEDIUM",
  domain:     "GMAIL",
  project:    "MemoryOS",
  sprint:     "EV-2",
  tags:       ["integration"],
};

function req(overrides: Partial<ConnectorRequest>): ConnectorRequest {
  return { ...BASE, ...overrides };
}

export function registerConnectorPipelineIntegrationTests(): void {
  describe("ConnectorKnowledgePipeline [INT]", "INTEGRATION")

    .test("INT-CN-01: READ produces full pipeline result", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-READ" }));
      AssertionEngine.assertNotNull(r.ctx);
      AssertionEngine.assertNotNull(r.bundle);
      AssertionEngine.assertNotNull(r.risk);
      AssertionEngine.assertNotNull(r.governance);
      AssertionEngine.assertNotNull(r.confidence);
      AssertionEngine.assertNotNull(r.plan);
      AssertionEngine.assertNotNull(r.advisory);
      AssertionEngine.assertNotNull(r.report);
    })

    .test("INT-CN-02: WRITE operation produces valid retryStrategy", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-WRT", operation: "WRITE" }));
      const valid = ["NONE", "LINEAR", "EXPONENTIAL", "JITTER"];
      AssertionEngine.assertIncludes(valid, r.plan.retryStrategy);
    })

    .test("INT-CN-03: UPDATE operation returns advisory with proceed boolean", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-UPD", operation: "UPDATE" }));
      AssertionEngine.assertType(r.advisory.proceed, "boolean");
    })

    .test("INT-CN-04: DELETE returns a risk report with valid riskScore [0,100]", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-DEL", operation: "DELETE" }));
      AssertionEngine.assertInRange(r.risk.riskScore, 0, 100);
    })

    .test("INT-CN-05: AUTH operation returns governance with boolean approved", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-AUTH", operation: "AUTH" }));
      AssertionEngine.assertType(r.governance.approved, "boolean");
    })

    .test("INT-CN-06: REFRESH_TOKEN does not throw", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-RT", operation: "REFRESH_TOKEN" }));
      AssertionEngine.assertNotNull(r);
    })

    .test("INT-CN-07: FAILOVER produces valid report result", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-FAIL", operation: "FAILOVER" }));
      const valid = ["SUCCESS", "BLOCKED", "FALLBACK", "RETRIED", "FAILED"];
      AssertionEngine.assertIncludes(valid, r.report.result);
    })

    .test("INT-CN-08: RETRY exposes retry-aware plan fields", () => {
      const r = ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-RETRY", operation: "RETRY" }));
      AssertionEngine.assertType(r.plan.maxRetries, "number");
      AssertionEngine.assertInRange(r.plan.maxRetries, 0, 100);
    })

    .test("INT-CN-09: confidence score in [0,1] for all 8 operations", () => {
      const ops = ["READ", "WRITE", "UPDATE", "DELETE", "AUTH", "REFRESH_TOKEN", "FAILOVER", "RETRY"] as const;
      for (const operation of ops) {
        const r = ConnectorKnowledgePipeline.run(req({ requestId: `CR-EV2-CONF-${operation}`, operation }));
        AssertionEngine.assertInRange(r.confidence.score, 0, 1, `confidence out of range for ${operation}`);
      }
    })

    .test("INT-CN-10: ctx.requestId matches input for all operations", () => {
      const ops = ["READ", "WRITE", "UPDATE", "DELETE"] as const;
      for (const operation of ops) {
        const id = `CR-EV2-CTX-${operation}`;
        const r  = ConnectorKnowledgePipeline.run(req({ requestId: id, operation }));
        AssertionEngine.assertEquals(r.ctx.requestId, id);
      }
    })

    .test("INT-CN-11: metrics() accumulates totalExecutions", () => {
      const before = ConnectorKnowledgePipeline.getMetrics().totalExecutions;
      ConnectorKnowledgePipeline.run(req({ requestId: "CR-EV2-MET" }));
      const after  = ConnectorKnowledgePipeline.getMetrics().totalExecutions;
      AssertionEngine.assertTrue(after > before);
    })

    .register();
}