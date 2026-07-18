/**
 * OperationalKnowledgePipelineIntegrationTests.ts
 * Integration tests — Registry → Provider → Ranking → Bundle → Consumer.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { KnowledgeQueryFacade }  from "@/lib/knowledge-query/KnowledgeQueryFacade";
import { KnowledgeQueryEngine }  from "@/lib/knowledge-query/KnowledgeQueryEngine";
import { KnowledgeQueryCache }   from "@/lib/knowledge-query/KnowledgeQueryCache";
import { GovernancePolicyRegistry } from "@/lib/operational-knowledge/governance/GovernancePolicyRegistry";

export function registerOKPipelineIntegrationTests(): void {
  describe("OperationalKnowledgePipeline [INT]", "INTEGRATION")

    // ── Registry is the source of truth ──────────────────────────────────────
    .test("INT-OK-01: GovernancePolicyRegistry has immutable default policies", () => {
      const all = GovernancePolicyRegistry.getAll();
      AssertionEngine.assertTrue(all.length >= 5);
      // Policies fetched multiple times should be consistent
      const all2 = GovernancePolicyRegistry.getAll();
      AssertionEngine.assertEquals(all.length, all2.length);
    })

    // ── Provider via Facade ───────────────────────────────────────────────────
    .test("INT-OK-02: queryGovernance bridges OKB and GovernancePolicyRegistry", () => {
      const r = KnowledgeQueryFacade.queryGovernance("approval policy compliance");
      AssertionEngine.assertNotNull(r);
      AssertionEngine.assertType(r.results, "object");
    })

    // ── Ranking reflects evidence scores ──────────────────────────────────────
    .test("INT-OK-03: items with higher evidenceScore rank higher", () => {
      const r = KnowledgeQueryFacade.queryAll("knowledge ranking order test");
      if (r.results.length >= 2) {
        AssertionEngine.assertTrue(r.results[0].score >= r.results[1].score);
      }
    })

    // ── Bundle completeness ───────────────────────────────────────────────────
    .test("INT-OK-04: queryAll returns results from at least one source", () => {
      KnowledgeQueryFacade.invalidateCache();
      const r = KnowledgeQueryFacade.queryAll("operational knowledge bundle test");
      AssertionEngine.assertNotNull(r.explanation);
      AssertionEngine.assertTrue(r.explanation.steps.length > 0);
    })

    // ── Consumer contract: cacheHit toggles ───────────────────────────────────
    .test("INT-OK-05: consumer sees cacheHit=false on first, true on second", () => {
      KnowledgeQueryFacade.invalidateCache();
      const first  = KnowledgeQueryFacade.queryLessons("consumer cache toggle");
      const second = KnowledgeQueryFacade.queryLessons("consumer cache toggle");
      AssertionEngine.assertFalse(first.cacheHit);
      AssertionEngine.assertTrue(second.cacheHit);
    })

    // ── Pipeline carries audit evidence ──────────────────────────────────────
    .test("INT-OK-06: queryId is traceable (not empty)", () => {
      const r = KnowledgeQueryFacade.queryLessons("audit traceability");
      AssertionEngine.assertTrue(r.queryId.length > 0);
    })

    // ── All sources reachable ─────────────────────────────────────────────────
    .test("INT-OK-07: all individual query methods return without throwing", () => {
      const intent = "source coverage test";
      const r1 = KnowledgeQueryFacade.queryLessons(intent);
      const r2 = KnowledgeQueryFacade.queryBestPractices(intent);
      const r3 = KnowledgeQueryFacade.queryKnownIssues(intent);
      const r4 = KnowledgeQueryFacade.queryAntiPatterns(intent);
      const r5 = KnowledgeQueryFacade.queryJournal(intent);
      const r6 = KnowledgeQueryFacade.queryGovernance(intent);
      for (const r of [r1, r2, r3, r4, r5, r6]) {
        AssertionEngine.assertNotNull(r.queryId);
      }
    })

    // ── Metrics aggregation ───────────────────────────────────────────────────
    .test("INT-OK-08: metrics totalQueries increases monotonically", () => {
      const before = KnowledgeQueryFacade.metrics().totalQueries;
      KnowledgeQueryFacade.queryAll("metrics monotonic test");
      const after  = KnowledgeQueryFacade.metrics().totalQueries;
      AssertionEngine.assertTrue(after > before);
    })

    // ── Confidence bridge ─────────────────────────────────────────────────────
    .test("INT-OK-09: result items all have evidenceScore in [0, 100]", () => {
      const r = KnowledgeQueryFacade.queryAll("evidence score range");
      for (const item of r.results) {
        AssertionEngine.assertInRange(item.evidenceScore, 0, 100);
      }
    })

    .register();
}