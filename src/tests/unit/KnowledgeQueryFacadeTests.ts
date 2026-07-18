/**
 * KnowledgeQueryFacadeTests.ts
 * Unit tests for KnowledgeQueryFacade.
 *
 * Sprint: EV-1
 */

import { describe } from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";
import { KnowledgeQueryFacade } from "@/lib/knowledge-query/KnowledgeQueryFacade";

export function registerKnowledgeQueryFacadeTests(): void {
  describe("KnowledgeQueryFacade", "UNIT")

    .test("queryLessons() returns a valid KnowledgeQueryResponse", () => {
      const resp = KnowledgeQueryFacade.queryLessons("architecture pattern");
      AssertionEngine.assertNotNull(resp);
      AssertionEngine.assertNotNull(resp.queryId);
      AssertionEngine.assertType(resp.results, "object");
    })

    .test("queryBestPractices() returns results array", () => {
      const resp = KnowledgeQueryFacade.queryBestPractices("SRP clean architecture");
      AssertionEngine.assertNotNull(resp.results);
      AssertionEngine.assertTrue(Array.isArray(resp.results));
    })

    .test("queryKnownIssues() includes durationMs", () => {
      const resp = KnowledgeQueryFacade.queryKnownIssues("regression bug");
      AssertionEngine.assertType(resp.durationMs, "number");
      AssertionEngine.assertTrue(resp.durationMs >= 0);
    })

    .test("queryAntiPatterns() returns explanation with profileUsed", () => {
      const resp = KnowledgeQueryFacade.queryAntiPatterns("singleton state");
      AssertionEngine.assertNotNull(resp.explanation);
      AssertionEngine.assertType(resp.explanation.profileUsed, "string");
    })

    .test("queryGovernance() returns governance items from registry", () => {
      const resp = KnowledgeQueryFacade.queryGovernance("approval review policy");
      AssertionEngine.assertNotNull(resp);
      AssertionEngine.assertTrue(Array.isArray(resp.results));
    })

    .test("queryJournal() returns a response with timestamp", () => {
      const resp = KnowledgeQueryFacade.queryJournal("sprint history");
      AssertionEngine.assertType(resp.timestamp, "string");
      AssertionEngine.assertTrue(resp.timestamp.length > 0);
    })

    .test("queryAll() returns results from multiple sources", () => {
      const resp = KnowledgeQueryFacade.queryAll("knowledge platform connector");
      AssertionEngine.assertNotNull(resp.results);
    })

    .test("second identical query produces a cache hit", () => {
      KnowledgeQueryFacade.invalidateCache();
      KnowledgeQueryFacade.queryLessons("cache test intent");
      const second = KnowledgeQueryFacade.queryLessons("cache test intent");
      AssertionEngine.assertTrue(second.cacheHit);
    })

    .test("invalidateCache() causes next query to miss cache", () => {
      KnowledgeQueryFacade.queryLessons("invalidate test");
      KnowledgeQueryFacade.invalidateCache();
      const resp = KnowledgeQueryFacade.queryLessons("invalidate test");
      AssertionEngine.assertFalse(resp.cacheHit);
    })

    .test("metrics() returns valid KnowledgeQueryMetrics", () => {
      const m = KnowledgeQueryFacade.metrics();
      AssertionEngine.assertNotNull(m);
      AssertionEngine.assertTrue(m.totalQueries >= 0);
      AssertionEngine.assertInRange(m.cacheHitRate, 0, 1);
    })

    .test("getRankingProfiles() returns at least 4 built-in profiles", () => {
      const profiles = KnowledgeQueryFacade.getRankingProfiles();
      AssertionEngine.assertTrue(profiles.length >= 4);
    })

    .register();
}