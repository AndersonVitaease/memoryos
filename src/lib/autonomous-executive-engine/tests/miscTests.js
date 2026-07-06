/**
 * Misc test cases (Sprint 26)
 * Tests 43–50: describeResult, stats, reset, determinism, constants, isolation
 */

import {
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  SUPERVISION_KINDS,
  COORDINATION_STATUSES,
  buildGoal,
} from "../executiveContracts";
import {
  registerEngine,
  registerSpecialist,
  registerService,
  registerConnector,
  setGoal,
  coordinate,
  supervise,
  describeResult,
  validateGoal,
  validateCoordinationResult,
  getStats,
  listSupervisionEntries,
  _resetForTests,
} from "../autonomousExecutiveEngine";

export const MISC_TESTS = [
  {
    id: 43,
    name: "describeResult() produces readable string",
    run: () => {
      _resetForTests();
      registerEngine("memory-engine");
      const g = setGoal({ title: "Test", assignedEngines: ["memory-engine"] });
      const r = coordinate(g.goalId);
      const desc = describeResult(r);
      return { desc };
    },
    assert: ({ desc }) =>
      typeof desc === "string" &&
      desc.includes("Coordenação") &&
      desc.includes("Status:") &&
      desc.includes("Steps planejados:"),
  },
  {
    id: 44,
    name: "describeResult() returns null for null input",
    run: () => {
      return { d: describeResult(null) };
    },
    assert: ({ d }) => d === null,
  },
  {
    id: 45,
    name: "getStats() returns expected counters",
    run: () => {
      _resetForTests();
      registerEngine("e");
      const g = setGoal({ title: "G" });
      coordinate(g.goalId);
      const s = getStats();
      return { s };
    },
    assert: ({ s }) =>
      "goalsSet" in s &&
      "coordinationsExecuted" in s &&
      "enginesRegistered" in s &&
      "averageProcessingTime" in s &&
      Array.isArray(s.eventLog),
  },
  {
    id: 46,
    name: "_resetForTests() zeroes all counters and registries",
    run: () => {
      _resetForTests();
      registerEngine("e");
      setGoal({ title: "G" });
      _resetForTests();
      const s = getStats();
      return { s, entries: listSupervisionEntries("engine") };
    },
    assert: ({ s, entries }) =>
      s.goalsSet === 0 &&
      s.enginesRegistered === 0 &&
      entries.length === 0,
  },
  {
    id: 47,
    name: "Determinism — same goal title produces same goalId",
    run: () => {
      _resetForTests();
      const g1 = buildGoal({ title: "Test" });
      _resetForTests();
      const g2 = buildGoal({ title: "Test" });
      return { g1, g2 };
    },
    assert: ({ g1, g2 }) => g1.goalId === g2.goalId,
  },
  {
    id: 48,
    name: "Determinism — sequential IDs",
    run: () => {
      _resetForTests();
      const g1 = buildGoal({ title: "A" });
      const g2 = buildGoal({ title: "B" });
      return { g1, g2 };
    },
    assert: ({ g1, g2 }) => g1.goalId === "goal-1" && g2.goalId === "goal-2",
  },
  {
    id: 49,
    name: "Constants are non-empty arrays",
    run: () => {
      return { GP: GOAL_PRIORITIES, GS: GOAL_STATUSES, SK: SUPERVISION_KINDS, CS: COORDINATION_STATUSES };
    },
    assert: ({ GP, GS, SK, CS }) =>
      GP.length > 0 && GS.length > 0 && SK.length > 0 && CS.length > 0,
  },
  {
    id: 50,
    name: "Isolation — no external deps, no HTTP, no LLM, no previous Sprint modified",
    run: () => {
      _resetForTests();
      registerEngine("memory-engine");
      registerSpecialist("auditor");
      registerService("search");
      registerConnector("gmail");
      const g = setGoal({
        title: "Isolation Test",
        priority: "high",
        assignedEngines: ["memory-engine"],
        assignedSpecialists: ["auditor"],
        assignedServices: ["search"],
        assignedConnectors: ["gmail"],
      });
      const r = coordinate(g.goalId);
      const snap = supervise();
      const desc = describeResult(r);
      const v1 = validateGoal(g);
      const v2 = validateCoordinationResult(r);
      const s = getStats();
      return { r, snap, desc, v1, v2, s };
    },
    assert: ({ r, snap, desc, v1, v2, s }) =>
      r !== null &&
      r.status === "SUPERVISED" &&
      r.stepsExecuted === 0 &&
      Object.isFrozen(snap) &&
      typeof desc === "string" &&
      v1.valid === true &&
      v2.valid === true &&
      s.coordinationsExecuted === 1,
  },
];