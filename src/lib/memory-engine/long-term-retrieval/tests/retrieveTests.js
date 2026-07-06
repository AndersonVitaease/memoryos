/**
 * retrieve() test cases (Sprint 25 — LTM Retrieval)
 * Tests 21–35: retrieve() core + filters + limit/offset + edge cases
 */

import { buildRetrievalRequest } from "../longTermRetrieval";
import { retrieve, _resetForTests } from "../longTermRetrievalEngine";
import { _makeMemories } from "./helpers";

export const RETRIEVE_TESTS = [
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
];