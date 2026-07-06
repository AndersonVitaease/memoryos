/**
 * Contract builder test cases (Sprint 26)
 * Tests 1–15: buildGoal, buildSupervisionEntry, buildCoordinationStep/Plan/Result
 */

import {
  buildGoal,
  buildSupervisionEntry,
  buildCoordinationStep,
  buildCoordinationPlan,
  buildCoordinationResult,
  GOAL_FIELDS,
  SUPERVISION_ENTRY_FIELDS,
  COORDINATION_RESULT_FIELDS,
} from "../executiveContracts";
import { _resetForTests } from "../autonomousExecutiveEngine";

export const BUILDER_TESTS = [
  {
    id: 1,
    name: "buildGoal produces valid frozen object",
    run: () => {
      _resetForTests();
      const g = buildGoal({ title: "Test Goal" });
      return { g };
    },
    assert: ({ g }) =>
      g.goalId.startsWith("goal-") &&
      typeof g.createdAt === "string" &&
      Object.isFrozen(g),
  },
  {
    id: 2,
    name: "Goal has all required fields",
    run: () => {
      _resetForTests();
      const g = buildGoal({ title: "Test" });
      return { g };
    },
    assert: ({ g }) => GOAL_FIELDS.every((f) => f in g),
  },
  {
    id: 3,
    name: "Goal defaults priority and status",
    run: () => {
      _resetForTests();
      const g = buildGoal({ title: "Test" });
      return { g };
    },
    assert: ({ g }) => g.priority === "medium" && g.status === "pending",
  },
  {
    id: 4,
    name: "Goal accepts arrays",
    run: () => {
      _resetForTests();
      const g = buildGoal({
        title: "Test",
        assignedEngines: ["memory"],
        assignedSpecialists: ["auditor"],
        assignedServices: ["search"],
        assignedConnectors: ["gmail"],
      });
      return { g };
    },
    assert: ({ g }) =>
      g.assignedEngines[0] === "memory" &&
      g.assignedSpecialists[0] === "auditor" &&
      g.assignedServices[0] === "search" &&
      g.assignedConnectors[0] === "gmail",
  },
  {
    id: 5,
    name: "Goal throws on missing title",
    run: () => {
      _resetForTests();
      let err = null;
      try { buildGoal({}); } catch (e) { err = e.message; }
      return { err };
    },
    assert: ({ err }) => typeof err === "string" && err.length > 0,
  },
  {
    id: 6,
    name: "Goal is deeply frozen (arrays, metadata)",
    run: () => {
      _resetForTests();
      const g = buildGoal({ title: "Test", metadata: { k: "v" } });
      return { g };
    },
    assert: ({ g }) =>
      Object.isFrozen(g.assignedEngines) &&
      Object.isFrozen(g.metadata),
  },
  {
    id: 7,
    name: "buildSupervisionEntry produces valid object",
    run: () => {
      _resetForTests();
      const e = buildSupervisionEntry({ kind: "engine", name: "memory-engine" });
      return { e };
    },
    assert: ({ e }) =>
      e.entryId.startsWith("sup-") &&
      e.kind === "engine" &&
      e.name === "memory-engine" &&
      e.registered === true &&
      e.active === true &&
      Object.isFrozen(e),
  },
  {
    id: 8,
    name: "SupervisionEntry has all required fields",
    run: () => {
      _resetForTests();
      const e = buildSupervisionEntry({ kind: "specialist", name: "auditor" });
      return { e };
    },
    assert: ({ e }) => SUPERVISION_ENTRY_FIELDS.every((f) => f in e),
  },
  {
    id: 9,
    name: "SupervisionEntry throws on invalid kind",
    run: () => {
      _resetForTests();
      let err = null;
      try { buildSupervisionEntry({ kind: "invalid", name: "x" }); } catch (e) { err = e.message; }
      return { err };
    },
    assert: ({ err }) => typeof err === "string" && err.length > 0,
  },
  {
    id: 10,
    name: "SupervisionEntry throws on missing name",
    run: () => {
      _resetForTests();
      let err = null;
      try { buildSupervisionEntry({ kind: "engine" }); } catch (e) { err = e.message; }
      return { err };
    },
    assert: ({ err }) => typeof err === "string" && err.length > 0,
  },
  {
    id: 11,
    name: "buildCoordinationStep produces valid object",
    run: () => {
      _resetForTests();
      const s = buildCoordinationStep({ kind: "engine", target: "memory", action: "coordinate" });
      return { s };
    },
    assert: ({ s }) =>
      s.stepId.startsWith("step-") &&
      s.kind === "engine" &&
      s.target === "memory" &&
      s.action === "coordinate" &&
      Object.isFrozen(s),
  },
  {
    id: 12,
    name: "buildCoordinationPlan produces valid object",
    run: () => {
      _resetForTests();
      const p = buildCoordinationPlan({
        goalId: "goal-1",
        steps: [{ kind: "engine", target: "memory" }],
      });
      return { p };
    },
    assert: ({ p }) =>
      p.planId.startsWith("plan-") &&
      p.goalId === "goal-1" &&
      p.steps.length === 1 &&
      Object.isFrozen(p),
  },
  {
    id: 13,
    name: "buildCoordinationResult produces valid object",
    run: () => {
      _resetForTests();
      const r = buildCoordinationResult({ goalId: "goal-1", planId: "plan-1", status: "SUPERVISED" });
      return { r };
    },
    assert: ({ r }) =>
      r.resultId.startsWith("cor-") &&
      r.status === "SUPERVISED" &&
      Object.isFrozen(r),
  },
  {
    id: 14,
    name: "CoordinationResult defaults status to PLANNED",
    run: () => {
      _resetForTests();
      const r = buildCoordinationResult({});
      return { r };
    },
    assert: ({ r }) => r.status === "PLANNED",
  },
  {
    id: 15,
    name: "CoordinationResult has all required fields",
    run: () => {
      _resetForTests();
      const r = buildCoordinationResult({});
      return { r };
    },
    assert: ({ r }) => COORDINATION_RESULT_FIELDS.every((f) => f in r),
  },
];