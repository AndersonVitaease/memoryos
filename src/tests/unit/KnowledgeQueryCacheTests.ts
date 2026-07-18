/**
 * KnowledgeQueryCacheTests.ts
 * Unit tests for KnowledgeQueryCache (AUD-002 coverage).
 *
 * Sprint: EV-1
 */

import { describe } from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";
import { KnowledgeQueryCache } from "@/lib/knowledge-query/KnowledgeQueryCache";
import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";

function makeItem(id: string): KnowledgeResultItem {
  return Object.freeze({
    id, source: "LESSONS", title: `Item ${id}`, summary: "test", category: "GENERAL",
    components: [], tags: [], evidenceScore: 60, confidence: 0.7,
    occurrences: 1, priority: "MEDIUM", sprint: "", createdAt: new Date().toISOString(), score: 0,
  });
}

export function registerKnowledgeQueryCacheTests(): void {
  describe("KnowledgeQueryCache", "UNIT")

    .test("cache miss returns null for unknown key", () => {
      KnowledgeQueryCache.invalidate();
      const result = KnowledgeQueryCache.get("unknown intent", {});
      AssertionEngine.assertNull(result);
    })

    .test("cache hit returns stored items after set", () => {
      KnowledgeQueryCache.invalidate();
      const items = [makeItem("I-001"), makeItem("I-002")];
      KnowledgeQueryCache.set("test intent", { sources: ["LESSONS"] }, items);
      const result = KnowledgeQueryCache.get("test intent", { sources: ["LESSONS"] });
      AssertionEngine.assertNotNull(result);
      AssertionEngine.assertEquals(result!.length, 2);
    })

    .test("different filter objects produce different cache keys", () => {
      KnowledgeQueryCache.invalidate();
      const items = [makeItem("I-003")];
      KnowledgeQueryCache.set("same intent", { sources: ["LESSONS"] }, items);
      const hit   = KnowledgeQueryCache.get("same intent", { sources: ["LESSONS"] });
      const miss  = KnowledgeQueryCache.get("same intent", { sources: ["GOVERNANCE"] });
      AssertionEngine.assertNotNull(hit);
      AssertionEngine.assertNull(miss);
    })

    .test("invalidate() clears all entries", () => {
      KnowledgeQueryCache.set("intent-a", {}, [makeItem("I-004")]);
      KnowledgeQueryCache.invalidate();
      AssertionEngine.assertNull(KnowledgeQueryCache.get("intent-a", {}));
    })

    .test("stats() returns correct size after operations", () => {
      KnowledgeQueryCache.invalidate();
      KnowledgeQueryCache.set("s1", {}, [makeItem("I-005")]);
      KnowledgeQueryCache.set("s2", {}, [makeItem("I-006")]);
      const stats = KnowledgeQueryCache.stats();
      AssertionEngine.assertEquals(stats.size, 2);
    })

    .test("stats() tracks hits and misses", () => {
      KnowledgeQueryCache.invalidate();
      KnowledgeQueryCache.set("tracked", {}, [makeItem("I-007")]);
      KnowledgeQueryCache.get("tracked", {});  // hit
      KnowledgeQueryCache.get("miss-key", {}); // miss
      const stats = KnowledgeQueryCache.stats();
      AssertionEngine.assertTrue(stats.totalHits > 0);
      AssertionEngine.assertTrue(stats.totalMisses > 0);
    })

    .register();
}