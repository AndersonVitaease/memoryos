/**
 * Validator test cases (Sprint 26)
 * Tests 16–22
 */

import {
  buildGoal,
  buildSupervisionEntry,
  buildCoordinationPlan,
  buildCoordinationResult,
} from "../executiveContracts";
import {
  validateGoal,
  validateSupervisionEntry,
  validateCoordinationPlan,
  validateCoordinationResult,
  _resetForTests,
} from "../autonomousExecutiveEngine";

export const VALIDATOR_TESTS = [
  {
    id: 16,
    name: "validateGoal accepts valid",
    run: () => {
      _resetForTests();
      const g = buildGoal({ title: "Test" });
      return { v: validateGoal(g) };
    },
    assert: ({ v }) => v.valid === true && v.error === null,
  },
  {
    id: 17,
    name: "validateGoal rejects null",
    run: () => {
      return { v: validateGoal(null) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 18,
    name: "validateSupervisionEntry accepts valid",
    run: () => {
      _resetForTests();
      const e = buildSupervisionEntry({ kind: "engine", name: "memory" });
      return { v: validateSupervisionEntry(e) };
    },
    assert: ({ v }) => v.valid === true,
  },
  {
    id: 19,
    name: "validateSupervisionEntry rejects null",
    run: () => {
      return { v: validateSupervisionEntry(null) };
    },
    assert: ({ v }) => v.valid === false,
  },
  {
    id: 20,
    name: "validateCoordinationPlan accepts valid",
    run: () => {
      _resetForTests();
      const p = buildCoordinationPlan({ goalId: "g1", steps: [] });
      return { v: validateCoordinationPlan(p) };
    },
    assert: ({ v }) => v.valid === true,
  },
  {
    id: 21,
    name: "validateCoordinationResult accepts valid",
    run: () => {
      _resetForTests();
      const r = buildCoordinationResult({ goalId: "g1" });
      return { v: validateCoordinationResult(r) };
    },
    assert: ({ v }) => v.valid === true,
  },
  {
    id: 22,
    name: "validateCoordinationResult rejects null",
    run: () => {
      return { v: validateCoordinationResult(null) };
    },
    assert: ({ v }) => v.valid === false,
  },
];