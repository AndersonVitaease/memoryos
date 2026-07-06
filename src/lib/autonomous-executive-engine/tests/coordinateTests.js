/**
 * coordinate() + supervise() test cases (Sprint 26)
 * Tests 36–42
 */

import {
  registerEngine,
  registerSpecialist,
  registerService,
  registerConnector,
  setGoal,
  coordinate,
  supervise,
  _resetForTests,
} from "../autonomousExecutiveEngine";

export const COORDINATE_TESTS = [
  {
    id: 36,
    name: "coordinate() rejects unknown goal",
    run: () => {
      _resetForTests();
      const r = coordinate("nonexistent");
      return { r };
    },
    assert: ({ r }) => r.status === "REJECTED",
  },
  {
    id: 37,
    name: "coordinate() returns SUPERVISED with assigned engines",
    run: () => {
      _resetForTests();
      registerEngine("memory-engine");
      const g = setGoal({ title: "Test", assignedEngines: ["memory-engine"] });
      const r = coordinate(g.goalId);
      return { r };
    },
    assert: ({ r }) =>
      r.status === "SUPERVISED" &&
      r.stepsPlanned === 1 &&
      r.coordinatedEngines.length === 1 &&
      r.coordinatedEngines[0] === "memory-engine",
  },
  {
    id: 38,
    name: "coordinate() returns PLANNED when no assignments",
    run: () => {
      _resetForTests();
      const g = setGoal({ title: "Empty" });
      const r = coordinate(g.goalId);
      return { r };
    },
    assert: ({ r }) => r.status === "PLANNED" && r.stepsPlanned === 0,
  },
  {
    id: 39,
    name: "coordinate() builds steps for all 4 kinds",
    run: () => {
      _resetForTests();
      registerEngine("e1");
      registerSpecialist("s1");
      registerService("sv1");
      registerConnector("c1");
      const g = setGoal({
        title: "Full",
        assignedEngines: ["e1"],
        assignedSpecialists: ["s1"],
        assignedServices: ["sv1"],
        assignedConnectors: ["c1"],
      });
      const r = coordinate(g.goalId);
      return { r };
    },
    assert: ({ r }) =>
      r.stepsPlanned === 4 &&
      r.coordinatedEngines.length === 1 &&
      r.coordinatedSpecialists.length === 1 &&
      r.coordinatedServices.length === 1 &&
      r.coordinatedConnectors.length === 1,
  },
  {
    id: 40,
    name: "coordinate() does not execute (stepsExecuted = 0)",
    run: () => {
      _resetForTests();
      registerEngine("memory-engine");
      const g = setGoal({ title: "Test", assignedEngines: ["memory-engine"] });
      const r = coordinate(g.goalId);
      return { r };
    },
    assert: ({ r }) => r.stepsExecuted === 0,
  },
  {
    id: 41,
    name: "coordinate() only coordinates registered entities",
    run: () => {
      _resetForTests();
      registerEngine("registered-engine");
      const g = setGoal({
        title: "Test",
        assignedEngines: ["registered-engine", "unregistered-engine"],
      });
      const r = coordinate(g.goalId);
      return { r };
    },
    assert: ({ r }) =>
      r.stepsPlanned === 2 &&
      r.coordinatedEngines.length === 1 &&
      r.coordinatedEngines[0] === "registered-engine",
  },
  {
    id: 42,
    name: "supervise() returns frozen snapshot of all registries",
    run: () => {
      _resetForTests();
      registerEngine("e");
      registerSpecialist("s");
      registerService("sv");
      registerConnector("c");
      setGoal({ title: "G" });
      const snap = supervise();
      return { snap };
    },
    assert: ({ snap }) =>
      Object.isFrozen(snap) &&
      snap.engines.length === 1 &&
      snap.specialists.length === 1 &&
      snap.services.length === 1 &&
      snap.connectors.length === 1 &&
      snap.goals.length === 1,
  },
];