/**
 * retrieveBy* helper test cases (Sprint 25 — LTM Retrieval)
 * Tests 36–40
 */

import {
  retrieveByMemoryId,
  retrieveByType,
  retrieveByTag,
  retrieveByStatus,
  retrieveBySource,
  _resetForTests,
} from "../longTermRetrievalEngine";
import { _makeMemories } from "./helpers";

export const RETRIEVE_BY_TESTS = [
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
];