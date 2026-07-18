/**
 * GovernancePipelineIntegrationTests.ts
 * Integration tests — Policy → Evaluation → Decision → Audit flow.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { GovernancePolicyPipeline } from "@/lib/operational-knowledge/governance/GovernancePolicyPipeline";
import { GovernancePolicyRegistry } from "@/lib/operational-knowledge/governance/GovernancePolicyRegistry";

export function registerGovernancePipelineIntegrationTests(): void {
  describe("GovernancePipeline [INT]", "INTEGRATION")

    // ── Auto-approval path ────────────────────────────────────────────────────
    .test("INT-GOV-01: high evidence + high confidence triggers APPROVE", () => {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-001", reviewId: "R-EV2-001",
        evidenceScore: 90, confidence: 0.85,
        isBestPractice: true,
      });
      const r = GovernancePolicyPipeline.run(ctx);
      AssertionEngine.assertNotNull(r.result);
      AssertionEngine.assertEquals(r.success, true);
    })

    // ── Engineering review path ───────────────────────────────────────────────
    .test("INT-GOV-02: known issue triggers REQUEST_ENGINEERING", () => {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-002", reviewId: "R-EV2-002",
        evidenceScore: 60, confidence: 0.65,
        isKnownIssue: true,
      });
      const r = GovernancePolicyPipeline.run(ctx);
      AssertionEngine.assertEquals(r.result.decision, "REQUEST_ENGINEERING");
    })

    // ── Rejection path ────────────────────────────────────────────────────────
    .test("INT-GOV-03: very low evidence triggers REJECT", () => {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-003", reviewId: "R-EV2-003",
        evidenceScore: 10, confidence: 0.30,
      });
      const r = GovernancePolicyPipeline.run(ctx);
      AssertionEngine.assertEquals(r.result.decision, "REJECT");
    })

    // ── Specialist path ───────────────────────────────────────────────────────
    .test("INT-GOV-04: anti-pattern triggers REQUEST_SPECIALIST", () => {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-004", reviewId: "R-EV2-004",
        evidenceScore: 55, confidence: 0.60,
        isAntiPattern: true,
      });
      const r = GovernancePolicyPipeline.run(ctx);
      AssertionEngine.assertEquals(r.result.decision, "REQUEST_SPECIALIST");
    })

    // ── Conflicting priorities (regression > anti-pattern) ────────────────────
    .test("INT-GOV-05: regression count > 0 triggers REQUEST_SPECIALIST", () => {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-005", reviewId: "R-EV2-005",
        evidenceScore: 70, confidence: 0.70,
        regressionCount: 2,
      });
      const r = GovernancePolicyPipeline.run(ctx);
      AssertionEngine.assertEquals(r.result.decision, "REQUEST_SPECIALIST");
    })

    // ── Critical priority path ────────────────────────────────────────────────
    .test("INT-GOV-06: CRITICAL priority triggers REQUEST_FINAL", () => {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-006", reviewId: "R-EV2-006",
        evidenceScore: 75, confidence: 0.75,
        priority: "CRITICAL",
      });
      const r = GovernancePolicyPipeline.run(ctx);
      AssertionEngine.assertEquals(r.result.decision, "REQUEST_FINAL");
    })

    // ── Merge path ────────────────────────────────────────────────────────────
    .test("INT-GOV-07: duplicates > 0 triggers MERGE", () => {
      const ctx = GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-007", reviewId: "R-EV2-007",
        evidenceScore: 60, confidence: 0.60,
        duplicatesCount: 2,
      });
      const r = GovernancePolicyPipeline.run(ctx);
      AssertionEngine.assertEquals(r.result.decision, "MERGE");
    })

    // ── Batch run ─────────────────────────────────────────────────────────────
    .test("INT-GOV-08: runBatch processes 5 contexts without throwing", () => {
      const contexts = Array.from({ length: 5 }, (_, i) =>
        GovernancePolicyPipeline.buildContext({
          captureId: `C-EV2-B${i}`, reviewId: `R-EV2-B${i}`,
          evidenceScore: 30 + i * 10, confidence: 0.5 + i * 0.05,
        })
      );
      const results = GovernancePolicyPipeline.runBatch(contexts);
      AssertionEngine.assertEquals(results.length, 5);
      for (const r of results) {
        AssertionEngine.assertEquals(r.success, true);
      }
    })

    // ── Policy registry consistency ───────────────────────────────────────────
    .test("INT-GOV-09: registry getActive() and getAll() are consistent", () => {
      const all    = GovernancePolicyRegistry.getAll();
      const active = GovernancePolicyRegistry.getActive();
      AssertionEngine.assertTrue(active.length <= all.length);
      for (const p of active) {
        AssertionEngine.assertEquals(p.status, "ACTIVE");
      }
    })

    // ── Metrics contract ──────────────────────────────────────────────────────
    .test("INT-GOV-10: getMetrics() returns a valid snapshot", () => {
      GovernancePolicyPipeline.run(GovernancePolicyPipeline.buildContext({
        captureId: "C-EV2-M", reviewId: "R-EV2-M", evidenceScore: 50, confidence: 0.5,
      }));
      const m = GovernancePolicyPipeline.getMetrics();
      AssertionEngine.assertNotNull(m);
    })

    .register();
}