/**
 * Hooks Tests (Sprint 29)
 */

import { createHookManager } from "../connectorHooks.js";
import { HOOK_NAMES } from "../connectorManifest.js";

export const HOOKS_TESTS = [
  {
    id: 67,
    name: "createHookManager returns frozen object",
    run: () => {
      const hm = createHookManager();
      return { frozen: Object.isFrozen(hm) };
    },
    assert: ({ frozen }) => frozen === true,
  },
  {
    id: 68,
    name: "all hooks start as null (not set)",
    run: () => {
      const hm = createHookManager();
      const results = HOOK_NAMES.map((n) => hm.has(n));
      return { results };
    },
    assert: ({ results }) => results.every((r) => r === false),
  },
  {
    id: 69,
    name: "set registers a hook function",
    run: () => {
      const hm = createHookManager();
      const fn = () => {};
      const result = hm.set("beforeConnect", fn);
      return { result, has: hm.has("beforeConnect") };
    },
    assert: ({ result, has }) => result === true && has === true,
  },
  {
    id: 70,
    name: "set returns false for invalid hook name",
    run: () => {
      const hm = createHookManager();
      const result = hm.set("invalidHook", () => {});
      return { result };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 71,
    name: "set returns false for non-function value",
    run: () => {
      const hm = createHookManager();
      const result = hm.set("beforeConnect", "not a function");
      return { result };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 72,
    name: "set accepts null to clear a hook",
    run: () => {
      const hm = createHookManager();
      hm.set("beforeConnect", () => {});
      const result = hm.set("beforeConnect", null);
      return { result, has: hm.has("beforeConnect") };
    },
    assert: ({ result, has }) => result === true && has === false,
  },
  {
    id: 73,
    name: "run executes registered hook",
    run: () => {
      const hm = createHookManager();
      let called = false;
      hm.set("afterConnect", () => {
        called = true;
      });
      const result = hm.run("afterConnect", { test: true });
      return { result, called };
    },
    assert: ({ result, called }) =>
      result.executed === true && result.error === null && called === true,
  },
  {
    id: 74,
    name: "run returns executed=false for unset hook",
    run: () => {
      const hm = createHookManager();
      const result = hm.run("beforeConnect", {});
      return { result };
    },
    assert: ({ result }) =>
      result.executed === false && result.error === null,
  },
  {
    id: 75,
    name: "run returns executed=false for invalid hook name",
    run: () => {
      const hm = createHookManager();
      const result = hm.run("invalidHook", {});
      return { result };
    },
    assert: ({ result }) =>
      result.executed === false && result.error === "invalid_hook",
  },
  {
    id: 76,
    name: "run catches errors and returns error message",
    run: () => {
      const hm = createHookManager();
      hm.set("beforeConnect", () => {
        throw new Error("hook error");
      });
      const result = hm.run("beforeConnect", {});
      return { result };
    },
    assert: ({ result }) =>
      result.executed === true && result.error === "hook error",
  },
  {
    id: 77,
    name: "get returns the registered function",
    run: () => {
      const hm = createHookManager();
      const fn = () => "hello";
      hm.set("afterDestroy", fn);
      const got = hm.get("afterDestroy");
      return { got, isFn: typeof got === "function", output: got ? got() : null };
    },
    assert: ({ isFn, output }) => isFn === true && output === "hello",
  },
  {
    id: 78,
    name: "get returns null for invalid hook name",
    run: () => {
      const hm = createHookManager();
      return { got: hm.get("invalidHook") };
    },
    assert: ({ got }) => got === null,
  },
  {
    id: 79,
    name: "names returns all 6 hook names",
    run: () => {
      const hm = createHookManager();
      return { names: hm.names() };
    },
    assert: ({ names }) =>
      names.length === 6 && names.join(",") === HOOK_NAMES.join(","),
  },
  {
    id: 80,
    name: "count returns number of registered hooks",
    run: () => {
      const hm = createHookManager();
      hm.set("beforeConnect", () => {});
      hm.set("afterConnect", () => {});
      hm.set("beforeDestroy", () => {});
      return { count: hm.count() };
    },
    assert: ({ count }) => count === 3,
  },
  {
    id: 81,
    name: "reset clears all hooks",
    run: () => {
      const hm = createHookManager();
      hm.set("beforeConnect", () => {});
      hm.set("afterConnect", () => {});
      hm.reset();
      return { count: hm.count() };
    },
    assert: ({ count }) => count === 0,
  },
];