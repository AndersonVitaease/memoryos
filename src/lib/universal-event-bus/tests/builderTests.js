/**
 * Builder Tests (Sprint 28)
 * Event building, frozen objects, sequential IDs, deep freeze.
 */

import {
  buildEvent,
  buildSubscription,
  buildHistoryEntry,
  buildParticipant,
  EVENT_FIELDS,
  PRIORITIES,
  _resetIdsForTests,
} from "../eventBusContracts.js";

export const BUILDER_TESTS = [
  {
    id: 1,
    name: "buildEvent creates object with all required fields",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({ eventType: "user.created", priority: "HIGH" });
      return { e };
    },
    assert: ({ e }) => EVENT_FIELDS.every((f) => f in e),
  },
  {
    id: 2,
    name: "buildEvent freezes the event (Object.isFrozen)",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({ eventType: "test" });
      return { frozen: Object.isFrozen(e) };
    },
    assert: ({ frozen }) => frozen === true,
  },
  {
    id: 3,
    name: "buildEvent deep-freezes payload and metadata",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({
        eventType: "test",
        payload: { nested: { deep: true }, arr: [1, 2] },
        metadata: { info: { val: 42 } },
      });
      return {
        pFrozen: Object.isFrozen(e.payload),
        pNestedFrozen: Object.isFrozen(e.payload.nested),
        pArrFrozen: Object.isFrozen(e.payload.arr),
        mFrozen: Object.isFrozen(e.metadata),
        mNestedFrozen: Object.isFrozen(e.metadata.info),
      };
    },
    assert: ({ pFrozen, pNestedFrozen, pArrFrozen, mFrozen, mNestedFrozen }) =>
      pFrozen && pNestedFrozen && pArrFrozen && mFrozen && mNestedFrozen,
  },
  {
    id: 4,
    name: "buildEvent defaults priority to NORMAL",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({ eventType: "test" });
      return { priority: e.priority };
    },
    assert: ({ priority }) => priority === "NORMAL",
  },
  {
    id: 5,
    name: "buildEvent accepts all valid priorities",
    run: () => {
      _resetIdsForTests();
      const results = PRIORITIES.map((p) => buildEvent({ eventType: "t", priority: p }).priority);
      return { results };
    },
    assert: ({ results }) => results.every((r, i) => r === PRIORITIES[i]),
  },
  {
    id: 6,
    name: "buildEvent generates sequential deterministic IDs",
    run: () => {
      _resetIdsForTests();
      const e1 = buildEvent({ eventType: "a" });
      const e2 = buildEvent({ eventType: "b" });
      _resetIdsForTests();
      const e3 = buildEvent({ eventType: "c" });
      return { e1: e1.eventId, e2: e2.eventId, e3: e3.eventId };
    },
    assert: ({ e1, e2, e3 }) => e1 === "evt-1" && e2 === "evt-2" && e3 === "evt-1",
  },
  {
    id: 7,
    name: "buildEvent throws on missing eventType",
    run: () => {
      _resetIdsForTests();
      try {
        buildEvent({});
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
  {
    id: 8,
    name: "buildSubscription creates frozen subscription with all fields",
    run: () => {
      _resetIdsForTests();
      const s = buildSubscription({ consumerName: "c1", eventType: "test.event" });
      return { s };
    },
    assert: ({ s }) =>
      s.subscriptionId.startsWith("sub-") &&
      s.consumerName === "c1" &&
      s.eventType === "test.event" &&
      s.active === true &&
      s.paused === false &&
      Object.isFrozen(s),
  },
  {
    id: 9,
    name: "buildHistoryEntry creates frozen entry with valid status",
    run: () => {
      _resetIdsForTests();
      const h = buildHistoryEntry({ eventId: "evt-1", status: "processed", detail: "ok" });
      return { h };
    },
    assert: ({ h }) =>
      h.historyId.startsWith("his-") &&
      h.eventId === "evt-1" &&
      h.status === "processed" &&
      h.detail === "ok" &&
      Object.isFrozen(h),
  },
  {
    id: 10,
    name: "buildHistoryEntry throws on invalid status",
    run: () => {
      _resetIdsForTests();
      try {
        buildHistoryEntry({ eventId: "evt-1", status: "INVALID" });
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
  {
    id: 11,
    name: "buildParticipant creates frozen participant",
    run: () => {
      _resetIdsForTests();
      const p = buildParticipant({ kind: "publisher", name: "pub-1" });
      return { p };
    },
    assert: ({ p }) =>
      p.participantId.startsWith("par-") &&
      p.kind === "publisher" &&
      p.name === "pub-1" &&
      p.active === true &&
      Object.isFrozen(p),
  },
  {
    id: 12,
    name: "buildEvent assigns string values to all ID fields",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({
        eventType: "test",
        companyId: 100,
        tenantId: 200,
        userId: 300,
        sessionId: "sess-1",
        correlationId: "corr-1",
        connectorId: "gmail",
        source: "api",
        target: "memory-engine",
      });
      return { e };
    },
    assert: ({ e }) =>
      typeof e.companyId === "string" &&
      e.companyId === "100" &&
      typeof e.tenantId === "string" &&
      e.source === "api" &&
      e.target === "memory-engine",
  },
];