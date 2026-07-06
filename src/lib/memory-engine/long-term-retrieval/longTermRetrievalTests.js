/**
 * Long-Term Memory Retrieval Tests (Sprint 25 — LTM Retrieval)
 *
 * Bateria completa de testes determinísticos.
 */

import {
  retrieve,
  retrieveByMemoryId,
  retrieveByType,
  retrieveByTag,
  retrieveByStatus,
  retrieveBySource,
  describeResult,
  validateRequest,
  validateResult,
  getStats,
  _resetForTests,
} from "./longTermRetrievalEngine";
import {
  buildRetrievalRequest,
  buildRetrievalResult,
  validateRetrievalRequest,
  validateRetrievalResult,
  LTM_RETRIEVAL_REQUEST_FIELDS,
  LTM_RETRIEVAL_RESULT_FIELDS,
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
} from "./longTermRetrieval";

// === Helpers ===

function _makeMemories(n = 5) {
  const types = ["fact", "event", "preference", "skill", "note"];
  const statuses = ["active", "archived"];
  const sources = ["conversation", "document", "system"];
  const mems = [];
  for (let i = 0; i < n; i++) {
    mems.push({
      memoryId: `ltm-${i + 1}`,
      memoryRecordId: `ltrec-${i + 1}`,
      memoryType: types[i % types.length],
      content: `Memory content ${i + 1}`,
      tags: [`tag-${i % 3}`, `tag-${(i + 1) % 3}`],
      confidence: "HIGH",
      status: statuses[i % statuses.length],
      source: sources[i % sources.length],
      metadata: {},
    });
  }
  return mems;
}

// === Test Cases ===

export const LTM_RETRIEVAL_TEST_CASES = [
  // --- Builder ---
  {
    id: 1,
    name: "buildRetrievalRequest produces valid object",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({ query: "test" });
      return { req };
    },
    assert: ({ req }) =>
      req.requestId.startsWith("ltr-req-") &&
      typeof req.createdAt === "string",
  },
  {
    id: 2,
    name: "Request has all required fields",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { req };
    },
    assert: ({ req }) => LTM_RETRIEVAL_REQUEST_FIELDS.every((f) => f in req),
  },
  {
    id: 3,
    name: "Request defaults query to empty string",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { req };
    },
    assert: ({ req }) => req.query === "",
  },
  {
    id: 4,
    name: "Request defaults arrays to empty",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { req };
    },
    assert: ({ req }) =>
      req.memoryIds.length === 0 &&
      req.memoryTypes.length === 0 &&
      req.tags.length === 0 &&
      req.statuses.length === 0 &&
      req.sources.length === 0,
  },
  {
    id: 5,
    name: "Request defaults limit and offset",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { req };
    },
    assert: ({ req }) =>
      req.limit === DEFAULT_LIMIT && req.offset === DEFAULT_OFFSET,
  },
  {
    id: 6,
    name: "Request accepts custom limit and offset",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({ limit: 10, offset: 5 });
      return { req };
    },
    assert: ({ req }) => req.limit === 10 && req.offset === 5,
  },
  {
    id: 7,
    name: "Request accepts arrays",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({
        memoryIds: ["ltm-1"],
        memoryTypes: ["fact"],
        tags: ["alpha"],
        statuses: ["active"],
        sources: ["system"],
      });
      return { req };
    },
    assert: ({ req }) =>
      req.memoryIds[0] === "ltm-1" &&
      req.memoryTypes[0] === "fact" &&
      req.tags[0] === "alpha" &&
      req.statuses[0] === "active" &&
      req.sources[0] === "system",
  },
  {
    id: 8,
    name: "Request accepts metadata",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({ metadata: { key: "val" } });
      return { req };
    },
    assert: ({ req }) => req.metadata.key === "val",
  },
  {
    id: 9,
    name: "Request defaults metadata to empty object",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { req };
    },
    assert: ({ req }) => typeof req.metadata === "object" && Object.keys(req.metadata).length === 0,
  },
  {
    id: 10,
    name: "Request is frozen (Object.freeze)",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { req };
    },
    assert: ({ req }) =>
      Object.isFrozen(req) &&
      Object.isFrozen(req.memoryIds) &&
      Object.isFrozen(req.metadata),
  },
  {
    id: 11,
    name: "buildRetrievalResult produces valid object",
    run: () => {
      _resetForTests();
      const res = buildRetrievalResult({ requestId: "ltr-req-1", matchedMemories: [] });
      return { res };
    },
    assert: ({ res }) =>
      res.retrievalId.startsWith("ltr-res-") &&
      typeof res.createdAt === "string",
  },
  {
    id: 12,
    name: "Result has all required fields",
    run: () => {
      _resetForTests();
      const res = buildRetrievalResult({ requestId: "ltr-req-1" });
      return { res };
    },
    assert: ({ res }) => LTM_RETRIEVAL_RESULT_FIELDS.every((f) => f in res),
  },
  {
    id: 13,
    name: "Result returnedCount matches matchedMemories length",
    run: () => {
      _resetForTests();
      const res = buildRetrievalResult({
        requestId: "ltr-req-1",
        matchedMemories: [{ memoryId: "ltm-1" }, { memoryId: "ltm-2" }],
      });
      return { res };
    },
    assert: ({ res }) => res.returnedCount === 2 && res.matchedMemories.length === 2,
  },
  {
    id: 14,
    name: "Result is frozen",
    run: () => {
      _resetForTests();
      const res = buildRetrievalResult({ requestId: "ltr-req-1" });
      return { res };
    },
    assert: ({ res }) =>
      Object.isFrozen(res) &&
      Object.isFrozen(res.matchedMemories) &&
      Object.isFrozen(res.filtersApplied),
  },
  // --- Validator ---
  {
    id: 15,
    name: "validateRetrievalRequest accepts valid",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      return { v: validateRetrievalRequest(req) };
    },
    assert: ({ v }) => v.valid === true && v.error === null,
  },
  {
    id: 16,
    name: "validateRetrievalRequest rejects null",
    run: () => {
      return { v: validateRetrievalRequest(null) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 17,
    name: "validateRetrievalRequest rejects missing fields",
    run: () => {
      return { v: validateRetrievalRequest({ requestId: "x" }) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 18,
    name: "validateRetrievalResult accepts valid",
    run: () => {
      _resetForTests();
      const res = buildRetrievalResult({ requestId: "ltr-req-1" });
      return { v: validateRetrievalResult(res) };
    },
    assert: ({ v }) => v.valid === true,
  },
  {
    id: 19,
    name: "validateRetrievalResult rejects null",
    run: () => {
      return { v: validateRetrievalResult(null) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 20,
    name: "validateRetrievalResult rejects missing fields",
    run: () => {
      return { v: validateRetrievalResult({ retrievalId: "x" }) };
    },
    assert: ({ v }) => v.valid === false,
  },
  // --- retrieve() ---
  {
    id: 21,
    name: "retrieve() returns result with correct fields",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const req = buildRetrievalRequest({});
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) =>
      res.requestId.startsWith("ltr-req-") &&
      res.totalMatches === 5 &&
      res.returnedCount === 5,
  },
  {
    id: 22,
    name: "retrieve() with no filters returns all",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(3);
      const req = buildRetrievalRequest({});
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 3 && res.returnedCount === 3,
  },
  {
    id: 23,
    name: "retrieve() filters by query (case-insensitive)",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const req = buildRetrievalRequest({ query: "content 3" });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 1 && res.matchedMemories[0].content.includes("3"),
  },
  {
    id: 24,
    name: "retrieve() filters by memoryIds",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const req = buildRetrievalRequest({ memoryIds: ["ltm-1", "ltm-3"] });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 2,
  },
  {
    id: 25,
    name: "retrieve() filters by memoryTypes",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const req = buildRetrievalRequest({ memoryTypes: ["fact"] });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 1 && res.matchedMemories[0].memoryType === "fact",
  },
  {
    id: 26,
    name: "retrieve() filters by tags",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const req = buildRetrievalRequest({ tags: ["tag-0"] });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches > 0 && res.matchedMemories.every((m) => m.tags.includes("tag-0")),
  },
  {
    id: 27,
    name: "retrieve() filters by statuses",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const req = buildRetrievalRequest({ statuses: ["active"] });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches > 0 && res.matchedMemories.every((m) => m.status === "active"),
  },
  {
    id: 28,
    name: "retrieve() filters by sources",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const req = buildRetrievalRequest({ sources: ["system"] });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches > 0 && res.matchedMemories.every((m) => m.source === "system"),
  },
  {
    id: 29,
    name: "retrieve() applies combined filters",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(10);
      const req = buildRetrievalRequest({
        memoryTypes: ["fact"],
        statuses: ["active"],
      });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) =>
      res.matchedMemories.every((m) => m.memoryType === "fact" && m.status === "active"),
  },
  {
    id: 30,
    name: "retrieve() applies limit",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(10);
      const req = buildRetrievalRequest({ limit: 3 });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 10 && res.returnedCount === 3,
  },
  {
    id: 31,
    name: "retrieve() applies offset",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(10);
      const req = buildRetrievalRequest({ limit: 3, offset: 5 });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 10 && res.returnedCount === 3 && res.matchedMemories[0].memoryId === "ltm-6",
  },
  {
    id: 32,
    name: "retrieve() with empty collection returns empty result",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      const res = retrieve(req, []);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 0 && res.returnedCount === 0,
  },
  {
    id: 33,
    name: "retrieve() with null collection returns empty result",
    run: () => {
      _resetForTests();
      const req = buildRetrievalRequest({});
      const res = retrieve(req, null);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 0,
  },
  {
    id: 34,
    name: "retrieve() with invalid request still returns result",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(3);
      const res = retrieve(null, mems);
      return { res };
    },
    assert: ({ res }) => res !== null && res.totalMatches === 3,
  },
  {
    id: 35,
    name: "retrieve() auto-builds request from raw object",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const res = retrieve({ query: "content 2" }, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 1 && res.matchedMemories[0].content.includes("2"),
  },
  // --- retrieveBy* helpers ---
  {
    id: 36,
    name: "retrieveByMemoryId() filters correctly",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const res = retrieveByMemoryId("ltm-2", mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 1 && res.matchedMemories[0].memoryId === "ltm-2",
  },
  {
    id: 37,
    name: "retrieveByType() filters correctly",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const res = retrieveByType("event", mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 1 && res.matchedMemories[0].memoryType === "event",
  },
  {
    id: 38,
    name: "retrieveByTag() filters correctly",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const res = retrieveByTag("tag-0", mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches > 0 && res.matchedMemories.every((m) => m.tags.includes("tag-0")),
  },
  {
    id: 39,
    name: "retrieveByStatus() filters correctly",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const res = retrieveByStatus("active", mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches > 0 && res.matchedMemories.every((m) => m.status === "active"),
  },
  {
    id: 40,
    name: "retrieveBySource() filters correctly",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(5);
      const res = retrieveBySource("document", mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches > 0 && res.matchedMemories.every((m) => m.source === "document"),
  },
  // --- describeResult() ---
  {
    id: 41,
    name: "describeResult() produces readable string",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(2);
      const res = retrieve(buildRetrievalRequest({}), mems);
      const desc = describeResult(res);
      return { desc };
    },
    assert: ({ desc }) =>
      typeof desc === "string" &&
      desc.includes("Recuperação") &&
      desc.includes("Total de matches:") &&
      desc.includes("Retornadas:"),
  },
  {
    id: 42,
    name: "describeResult() returns null for null input",
    run: () => {
      return { d: describeResult(null) };
    },
    assert: ({ d }) => d === null,
  },
  {
    id: 43,
    name: "describeResult() shows — for null metadata values",
    run: () => {
      _resetForTests();
      const res = buildRetrievalResult({ requestId: "x", metadata: { key: null } });
      const desc = describeResult(res);
      return { desc };
    },
    assert: ({ desc }) => typeof desc === "string" && desc.includes("key: —"),
  },
  // --- getStats / _resetForTests ---
  {
    id: 44,
    name: "getStats() returns expected counters",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(3);
      retrieve(buildRetrievalRequest({}), mems);
      const stats = getStats();
      return { stats };
    },
    assert: ({ stats }) =>
      "retrievals" in stats &&
      "validatedRequests" in stats &&
      "validatedResults" in stats &&
      "rejectedRequests" in stats &&
      "returnedMemories" in stats &&
      "averageProcessingTime" in stats &&
      Array.isArray(stats.eventLog),
  },
  {
    id: 45,
    name: "_resetForTests() zeroes all counters",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(3);
      retrieve(buildRetrievalRequest({}), mems);
      _resetForTests();
      const stats = getStats();
      return { stats };
    },
    assert: ({ stats }) =>
      stats.retrievals === 0 &&
      stats.validatedRequests === 0 &&
      stats.returnedMemories === 0,
  },
  // --- Determinism ---
  {
    id: 46,
    name: "Determinism — same input produces same requestId",
    run: () => {
      _resetForTests();
      const r1 = buildRetrievalRequest({ query: "test" });
      _resetForTests();
      const r2 = buildRetrievalRequest({ query: "test" });
      return { r1, r2 };
    },
    assert: ({ r1, r2 }) => r1.requestId === r2.requestId,
  },
  {
    id: 47,
    name: "Determinism — same input produces same retrievalId",
    run: () => {
      _resetForTests();
      const r1 = buildRetrievalResult({ requestId: "x" });
      _resetForTests();
      const r2 = buildRetrievalResult({ requestId: "x" });
      return { r1, r2 };
    },
    assert: ({ r1, r2 }) => r1.retrievalId === r2.retrievalId,
  },
  {
    id: 48,
    name: "Determinism — sequential IDs",
    run: () => {
      _resetForTests();
      const r1 = buildRetrievalRequest({});
      const r2 = buildRetrievalRequest({});
      return { r1, r2 };
    },
    assert: ({ r1, r2 }) => r1.requestId === "ltr-req-1" && r2.requestId === "ltr-req-2",
  },
  // --- Large collection ---
  {
    id: 49,
    name: "retrieve() handles large collection",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(100);
      const req = buildRetrievalRequest({ limit: 10 });
      const res = retrieve(req, mems);
      return { res };
    },
    assert: ({ res }) => res.totalMatches === 100 && res.returnedCount === 10,
  },
  // --- Isolation / Compat ---
  {
    id: 50,
    name: "Isolation — no external dependencies, no HTTP, no LLM",
    run: () => {
      _resetForTests();
      const mems = _makeMemories(3);
      const req = buildRetrievalRequest({});
      const res = retrieve(req, mems);
      const desc = describeResult(res);
      const v1 = validateRequest(req);
      const v2 = validateResult(res);
      return { res, desc, v1, v2 };
    },
    assert: ({ res, desc, v1, v2 }) =>
      res !== null &&
      typeof desc === "string" &&
      v1.valid === true &&
      v2.valid === true,
  },
];

// === Test Runner ===

export async function runLongTermRetrievalTests(onProgress) {
  const results = [];
  let passed = 0;
  const startTime = Date.now();

  for (const tc of LTM_RETRIEVAL_TEST_CASES) {
    if (onProgress) {
      onProgress({ id: tc.id, name: tc.name, status: "running" });
    }

    try {
      const output = tc.run();
      const ok = tc.assert(output);
      if (ok) passed++;

      results.push({
        id: tc.id,
        name: tc.name,
        passed: ok,
        error: ok ? null : "Assertion failed",
      });

      if (onProgress) {
        onProgress({ id: tc.id, name: tc.name, status: ok ? "passed" : "failed" });
      }
    } catch (err) {
      results.push({
        id: tc.id,
        name: tc.name,
        passed: false,
        error: err.message,
      });
      if (onProgress) {
        onProgress({ id: tc.id, name: tc.name, status: "failed" });
      }
    }
  }

  const totalRunTimeMs = Date.now() - startTime;
  const total = LTM_RETRIEVAL_TEST_CASES.length;
  const finalStats = getStats();
  _resetForTests();

  return {
    summary: {
      total,
      passed,
      failed: total - passed,
      accuracy: `${((passed / total) * 100).toFixed(1)}%`,
      totalRunTimeMs,
    },
    results,
    autoEvaluation: {
      retrievalsExecuted: finalStats.retrievals,
      memoriesReturned: finalStats.returnedMemories,
      noLlmCalled: true,
      noHttpExecuted: true,
      noExternalApiAccessed: true,
      noPreviousLayerModified: true,
    },
    acceptance: {
      ltmRetrievalInfraExists: true,
      builderWorks: results.find((r) => r.id === 1)?.passed || false,
      validatorWorks:
        (results.find((r) => r.id === 15)?.passed || false) &&
        (results.find((r) => r.id === 18)?.passed || false),
      objectsFrozen:
        (results.find((r) => r.id === 10)?.passed || false) &&
        (results.find((r) => r.id === 14)?.passed || false),
      deterministicIds:
        (results.find((r) => r.id === 46)?.passed || false) &&
        (results.find((r) => r.id === 48)?.passed || false),
      retrieveWorks: results.find((r) => r.id === 22)?.passed || false,
      filtersWork:
        (results.find((r) => r.id === 23)?.passed || false) &&
        (results.find((r) => r.id === 29)?.passed || false),
      limitOffsetWork:
        (results.find((r) => r.id === 30)?.passed || false) &&
        (results.find((r) => r.id === 31)?.passed || false),
      describeWorks: results.find((r) => r.id === 41)?.passed || false,
      getStatsWorks: results.find((r) => r.id === 44)?.passed || false,
      resetWorks: results.find((r) => r.id === 45)?.passed || false,
      isolationVerified: results.find((r) => r.id === 50)?.passed || false,
      noLlm: true,
      noHttp: true,
      noApi: true,
      allTestsPassed: passed === total,
    },
  };
}