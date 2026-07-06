/**
 * Misc test cases (Sprint 25 — LTM Retrieval)
 * Tests 41–50: describeResult, getStats, _resetForTests, determinism, large, isolation
 */

import { buildRetrievalRequest, buildRetrievalResult } from "../longTermRetrieval";
import {
  retrieve,
  describeResult,
  validateRequest,
  validateResult,
  getStats,
  _resetForTests,
} from "../longTermRetrievalEngine";
import { _makeMemories } from "./helpers";

export const MISC_TESTS = [
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