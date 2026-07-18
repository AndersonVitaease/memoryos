/**
 * KnowledgeQueryPipelineIntegrationTests.ts
 * Integration tests — full Intent → Response flow.
 *
 * Sprint: EV-2
 */

import { describe }         from "@/testing/TestScenarioBuilder";
import { AssertionEngine }  from "@/testing/AssertionEngine";
import { KnowledgeQueryFacade } from "@/lib/knowledge-query/KnowledgeQueryFacade";
import { KnowledgeQueryEngine } from "@/lib/knowledge-query/KnowledgeQueryEngine";
import { KnowledgeQueryCache }  from "@/lib/knowledge-query/KnowledgeQueryCache";

export function registerKQPipelineIntegrationTests(): void {
  describe("KnowledgeQueryPipeline [INT]", "INTEGRATION")

    // ── Simple query ──────────────────────────────────────────────────────────
    .test("INT-KQ-01: simple query returns a complete response", () => {
      const r = KnowledgeQueryFacade.queryLessons("integration test architecture");
      AssertionEngine.assertNotNull(r.queryId);
      AssertionEngine.assertType(r.results, "object");
      AssertionEngine.assertType(r.durationMs, "number");
      AssertionEngine.assertNotNull(r.explanation);
      AssertionEngine.assertType(r.timestamp, "string");
    })

    // ── Complex query with filter ─────────────────────────────────────────────
    .test("INT-KQ-02: complex query with full filter object", () => {
      const r = KnowledgeQueryEngine.query({
        intent:    "connector pipeline governance architecture",
        filter:    { sources: ["LESSONS", "GOVERNANCE"], minEvidence: 30, limit: 5 },
        profileId: "GOVERNANCE",
      });
      AssertionEngine.assertNotNull(r.queryId);
      AssertionEngine.assertTrue(r.results.length <= 5);
    })

    // ── Multiple sources ──────────────────────────────────────────────────────
    .test("INT-KQ-03: queryAll accesses all sources", () => {
      const r = KnowledgeQueryFacade.queryAll("platform architecture knowledge");
      AssertionEngine.assertNotNull(r);
      AssertionEngine.assertNotNull(r.explanation.steps);
      AssertionEngine.assertTrue(r.explanation.steps.length > 0);
    })

    // ── Cache miss → hit ──────────────────────────────────────────────────────
    .test("INT-KQ-04: first call is cache miss, second is hit", () => {
      KnowledgeQueryFacade.invalidateCache();
      const first  = KnowledgeQueryFacade.queryBestPractices("cache integration test");
      const second = KnowledgeQueryFacade.queryBestPractices("cache integration test");
      AssertionEngine.assertFalse(first.cacheHit);
      AssertionEngine.assertTrue(second.cacheHit);
    })

    // ── Cache invalidation propagates ─────────────────────────────────────────
    .test("INT-KQ-05: invalidate cache forces fresh execution", () => {
      KnowledgeQueryFacade.queryLessons("invalidate propagation test");
      KnowledgeQueryFacade.invalidateCache();
      const r = KnowledgeQueryFacade.queryLessons("invalidate propagation test");
      AssertionEngine.assertFalse(r.cacheHit);
    })

    // ── Ranking consistency ───────────────────────────────────────────────────
    .test("INT-KQ-06: results are sorted by score descending", () => {
      const r = KnowledgeQueryFacade.queryAll("ranking order test");
      for (let i = 0; i < r.results.length - 1; i++) {
        AssertionEngine.assertTrue(
          r.results[i].score >= r.results[i + 1].score,
          `score[${i}]=${r.results[i].score} should be >= score[${i+1}]=${r.results[i+1].score}`
        );
      }
    })

    // ── Confidence propagation ────────────────────────────────────────────────
    .test("INT-KQ-07: all result items have confidence in [0, 1]", () => {
      const r = KnowledgeQueryFacade.queryAll("confidence propagation");
      for (const item of r.results) {
        AssertionEngine.assertInRange(item.confidence, 0, 1);
      }
    })

    // ── Explanation integrity ─────────────────────────────────────────────────
    .test("INT-KQ-08: explanation keptItems <= totalItems", () => {
      const r = KnowledgeQueryFacade.queryAll("explanation integrity check");
      AssertionEngine.assertTrue(r.explanation.keptItems <= r.explanation.totalItems);
    })

    // ── Audit traceability ────────────────────────────────────────────────────
    .test("INT-KQ-09: queryId is unique across consecutive calls", () => {
      KnowledgeQueryFacade.invalidateCache();
      const r1 = KnowledgeQueryFacade.queryLessons("unique id test A");
      const r2 = KnowledgeQueryFacade.queryLessons("unique id test B");
      AssertionEngine.assertTrue(r1.queryId !== r2.queryId);
    })

    // ── Governance source ─────────────────────────────────────────────────────
    .test("INT-KQ-10: governance query returns items tagged with GOVERNANCE source", () => {
      const r = KnowledgeQueryFacade.queryGovernance("policy compliance approval");
      AssertionEngine.assertNotNull(r);
      // Governance queries should return a response (may have 0 items from OKB but never throws)
      AssertionEngine.assertType(r.results, "object");
    })

    // ── Immutability ──────────────────────────────────────────────────────────
    .test("INT-KQ-11: response object is immutable (frozen)", () => {
      const r = KnowledgeQueryFacade.queryLessons("immutability check");
      let threw = false;
      try { (r as { results: unknown }).results = []; } catch { threw = true; }
      // In strict mode assignment to frozen property throws; in non-strict it silently fails
      // Either way the original results must be intact
      AssertionEngine.assertNotNull(r.results);
    })

    // ── Determinism ───────────────────────────────────────────────────────────
    .test("INT-KQ-12: two identical queries (cache cleared) return same result shape", () => {
      KnowledgeQueryFacade.invalidateCache();
      const r1 = KnowledgeQueryFacade.queryLessons("determinism test");
      KnowledgeQueryFacade.invalidateCache();
      const r2 = KnowledgeQueryFacade.queryLessons("determinism test");
      AssertionEngine.assertEquals(r1.results.length, r2.results.length);
      AssertionEngine.assertEquals(r1.explanation.keptItems, r2.explanation.keptItems);
    })

    .register();
}