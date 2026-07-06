/**
 * Goal management test cases (Sprint 26)
 * Tests 30–35
 */

import {
  setGoal,
  getGoal,
  listGoals,
  updateGoal,
  _resetForTests,
} from "../autonomousExecutiveEngine";

export const GOAL_TESTS = [
  {
    id: 30,
    name: "setGoal stores goal and returns it",
    run: () => {
      _resetForTests();
      const g = setGoal({ title: "My Goal", priority: "high" });
      const got = getGoal(g.goalId);
      return { g, got };
    },
    assert: ({ g, got }) =>
      g.title === "My Goal" &&
      g.priority === "high" &&
      g.status === "active" &&
      got !== null &&
      got.goalId === g.goalId,
  },
  {
    id: 31,
    name: "listGoals returns all goals",
    run: () => {
      _resetForTests();
      setGoal({ title: "A" });
      setGoal({ title: "B" });
      return { list: listGoals() };
    },
    assert: ({ list }) => list.length === 2,
  },
  {
    id: 32,
    name: "listGoals filters by status",
    run: () => {
      _resetForTests();
      const g = setGoal({ title: "A" });
      updateGoal(g.goalId, { status: "completed" });
      setGoal({ title: "B" });
      return { active: listGoals("active"), completed: listGoals("completed") };
    },
    assert: ({ active, completed }) =>
      active.length === 1 && completed.length === 1,
  },
  {
    id: 33,
    name: "updateGoal preserves goalId and createdAt",
    run: () => {
      _resetForTests();
      const g = setGoal({ title: "Original" });
      const updated = updateGoal(g.goalId, { title: "Updated", status: "completed" });
      return { g, updated };
    },
    assert: ({ g, updated }) =>
      updated.goalId === g.goalId &&
      updated.createdAt === g.createdAt &&
      updated.title === "Updated" &&
      updated.status === "completed",
  },
  {
    id: 34,
    name: "updateGoal returns null for unknown goal",
    run: () => {
      _resetForTests();
      return { r: updateGoal("nonexistent", { title: "x" }) };
    },
    assert: ({ r }) => r === null,
  },
  {
    id: 35,
    name: "getGoal returns null for unknown",
    run: () => {
      _resetForTests();
      return { r: getGoal("nonexistent") };
    },
    assert: ({ r }) => r === null,
  },
];