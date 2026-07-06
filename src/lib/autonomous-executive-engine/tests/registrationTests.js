/**
 * Registration test cases (Sprint 26)
 * Tests 23–29
 */

import {
  registerEngine,
  registerSpecialist,
  registerService,
  registerConnector,
  getSupervisionEntry,
  listSupervisionEntries,
  _resetForTests,
} from "../autonomousExecutiveEngine";

export const REGISTRATION_TESTS = [
  {
    id: 23,
    name: "registerEngine adds entry to registry",
    run: () => {
      _resetForTests();
      const e = registerEngine("memory-engine");
      const got = getSupervisionEntry("engine", "memory-engine");
      return { e, got };
    },
    assert: ({ e, got }) =>
      e.name === "memory-engine" &&
      got !== null &&
      got.name === "memory-engine",
  },
  {
    id: 24,
    name: "registerSpecialist adds entry",
    run: () => {
      _resetForTests();
      registerSpecialist("auditor");
      const got = getSupervisionEntry("specialist", "auditor");
      return { got };
    },
    assert: ({ got }) => got !== null && got.kind === "specialist",
  },
  {
    id: 25,
    name: "registerService adds entry",
    run: () => {
      _resetForTests();
      registerService("search");
      const got = getSupervisionEntry("service", "search");
      return { got };
    },
    assert: ({ got }) => got !== null && got.kind === "service",
  },
  {
    id: 26,
    name: "registerConnector adds entry",
    run: () => {
      _resetForTests();
      registerConnector("gmail");
      const got = getSupervisionEntry("connector", "gmail");
      return { got };
    },
    assert: ({ got }) => got !== null && got.kind === "connector",
  },
  {
    id: 27,
    name: "listSupervisionEntries returns all of a kind",
    run: () => {
      _resetForTests();
      registerEngine("a");
      registerEngine("b");
      const list = listSupervisionEntries("engine");
      return { list };
    },
    assert: ({ list }) => list.length === 2,
  },
  {
    id: 28,
    name: "getSupervisionEntry returns null for unknown",
    run: () => {
      _resetForTests();
      return { v: getSupervisionEntry("engine", "nonexistent") };
    },
    assert: ({ v }) => v === null,
  },
  {
    id: 29,
    name: "registerEngine throws on missing name",
    run: () => {
      _resetForTests();
      let err = null;
      try { registerEngine(""); } catch (e) { err = e.message; }
      return { err };
    },
    assert: ({ err }) => typeof err === "string" && err.length > 0,
  },
];