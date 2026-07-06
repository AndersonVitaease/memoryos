/**
 * Builder test cases (Sprint 25 — LTM Retrieval)
 * Tests 1–14: buildRetrievalRequest / buildRetrievalResult
 */

import {
  buildRetrievalRequest,
  buildRetrievalResult,
  LTM_RETRIEVAL_REQUEST_FIELDS,
  LTM_RETRIEVAL_RESULT_FIELDS,
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
} from "../longTermRetrieval";
import { _resetForTests } from "../longTermRetrievalEngine";

export const BUILDER_TESTS = [
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
];