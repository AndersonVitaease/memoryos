/**
 * Lifecycle Tests (Sprint 29)
 */

import { createLifecycleManager, canTransition } from "../connectorLifecycle.js";
import { LIFECYCLE_STATES } from "../connectorManifest.js";

export const LIFECYCLE_TESTS = [
  {
    id: 51,
    name: "initial state is CREATED",
    run: () => {
      const lm = createLifecycleManager();
      return { state: lm.state() };
    },
    assert: ({ state }) => state === "CREATED",
  },
  {
    id: 52,
    name: "CREATED → INITIALIZED is valid",
    run: () => {
      const lm = createLifecycleManager();
      const result = lm.transition("INITIALIZED");
      return { result };
    },
    assert: ({ result }) =>
      result.ok === true && result.entry.from === "CREATED" && result.entry.to === "INITIALIZED",
  },
  {
    id: 53,
    name: "CREATED → CONNECTED is invalid",
    run: () => {
      const lm = createLifecycleManager();
      const result = lm.transition("CONNECTED");
      return { result };
    },
    assert: ({ result }) =>
      result.ok === false && result.reason === "invalid_transition",
  },
  {
    id: 54,
    name: "INITIALIZED → CONNECTED is valid",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      const result = lm.transition("CONNECTED");
      return { result };
    },
    assert: ({ result }) =>
      result.ok === true && result.entry.from === "INITIALIZED" && result.entry.to === "CONNECTED",
  },
  {
    id: 55,
    name: "INITIALIZED → DESTROYED is valid (skip connect)",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      const result = lm.transition("DESTROYED");
      return { result };
    },
    assert: ({ result }) => result.ok === true,
  },
  {
    id: 56,
    name: "CONNECTED → DISCONNECTED is valid",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      lm.transition("CONNECTED");
      const result = lm.transition("DISCONNECTED");
      return { result };
    },
    assert: ({ result }) => result.ok === true,
  },
  {
    id: 57,
    name: "DISCONNECTED → CONNECTED is valid (reconnect)",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      lm.transition("CONNECTED");
      lm.transition("DISCONNECTED");
      const result = lm.transition("CONNECTED");
      return { result };
    },
    assert: ({ result }) => result.ok === true,
  },
  {
    id: 58,
    name: "DISCONNECTED → DESTROYED is valid",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      lm.transition("CONNECTED");
      lm.transition("DISCONNECTED");
      const result = lm.transition("DESTROYED");
      return { result };
    },
    assert: ({ result }) => result.ok === true,
  },
  {
    id: 59,
    name: "DESTROYED is terminal — no transitions out",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      lm.transition("DESTROYED");
      const result = lm.transition("INITIALIZED");
      return { result, terminal: lm.isTerminal() };
    },
    assert: ({ result, terminal }) =>
      result.ok === false && terminal === true,
  },
  {
    id: 60,
    name: "transition to invalid state fails",
    run: () => {
      const lm = createLifecycleManager();
      const result = lm.transition("INVALID_STATE");
      return { result };
    },
    assert: ({ result }) =>
      result.ok === false && result.reason === "invalid_state",
  },
  {
    id: 61,
    name: "transitions returns all entries",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      lm.transition("CONNECTED");
      lm.transition("DISCONNECTED");
      return { count: lm.transitionCount(), entries: lm.transitions() };
    },
    assert: ({ count, entries }) =>
      count === 3 && entries.length === 3 && entries[0].from === "CREATED",
  },
  {
    id: 62,
    name: "validTransitions returns allowed targets",
    run: () => {
      const lm = createLifecycleManager();
      return { valid: lm.validTransitions() };
    },
    assert: ({ valid }) => valid.length === 1 && valid[0] === "INITIALIZED",
  },
  {
    id: 63,
    name: "states returns all 5 lifecycle states",
    run: () => {
      const lm = createLifecycleManager();
      return { states: lm.states() };
    },
    assert: ({ states }) =>
      states.length === 5 && states.join(",") === LIFECYCLE_STATES.join(","),
  },
  {
    id: 64,
    name: "reset returns to CREATED",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      lm.transition("CONNECTED");
      lm.reset();
      return { state: lm.state(), count: lm.transitionCount() };
    },
    assert: ({ state, count }) => state === "CREATED" && count === 0,
  },
  {
    id: 65,
    name: "canTransition is a pure function",
    run: () => {
      return {
        a: canTransition("CREATED", "INITIALIZED"),
        b: canTransition("CREATED", "CONNECTED"),
        c: canTransition("DESTROYED", "INITIALIZED"),
      };
    },
    assert: ({ a, b, c }) => a === true && b === false && c === false,
  },
  {
    id: 66,
    name: "transition entries are frozen",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      const entry = lm.transitions()[0];
      return { frozen: Object.isFrozen(entry) };
    },
    assert: ({ frozen }) => frozen === true,
  },
];