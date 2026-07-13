/**
 * GoalDecomposer.ts — Goal Intelligence Engine
 * Phase 5 · 2026-07-13
 *
 * Decomposes a goal into Objectives, Milestones, Tasks, Subgoals, Dependencies.
 * Every item preserves provenance back to the parent goal.
 * Pure computation — no connector calls, no side effects.
 */

import type { Goal, GoalDecomposition, DecompositionItem, DecompositionItemType } from "./GIETypes";
import { makeGIEId } from "./GIETypes";

function item(
  type: DecompositionItemType,
  title: string,
  description: string,
  effort: "low" | "medium" | "high",
  order: number,
  goalId: string,
  dependsOn: string[] = [],
  connectors: string[] = [],
): DecompositionItem {
  return Object.freeze({
    id:                 makeGIEId(type.slice(0, 3)),
    type, title, description,
    estimatedEffort:    effort,
    dependsOn,
    requiredConnectors: connectors,
    order,
    provenance:         goalId,
  });
}

// Category-specific decomposition templates
const CATEGORY_TEMPLATES: Record<string, { objectives: string[]; milestones: string[]; tasks: string[]; connectors: string[]; days: number; complexity: number }> = {
  architecture: {
    objectives: ["Define architectural boundaries", "Document decisions as ADRs", "Validate consistency"],
    milestones: ["Architecture draft complete", "Peer review passed", "Documentation published"],
    tasks:      ["Identify affected components", "Draft boundary definitions", "Write ADR", "Run ABV validation"],
    connectors: ["github", "base44"],
    days: 14, complexity: 70,
  },
  knowledge: {
    objectives: ["Identify knowledge sources", "Reconstruct knowledge graph", "Resolve identity conflicts"],
    milestones: ["Sources connected", "Graph built", "Conflicts resolved"],
    tasks:      ["Connect knowledge sources", "Run KRE", "Run KFE", "Run IRE", "Generate snapshot"],
    connectors: ["github", "base44"],
    days: 7, complexity: 55,
  },
  performance: {
    objectives: ["Baseline current performance", "Identify bottlenecks", "Implement improvements"],
    milestones: ["Baseline measured", "Bottlenecks catalogued", "Improvements deployed"],
    tasks:      ["Measure current metrics", "Profile critical paths", "Implement optimizations", "Validate improvement"],
    connectors: ["base44"],
    days: 10, complexity: 60,
  },
  product: {
    objectives: ["Define user value", "Break down requirements", "Deliver incrementally"],
    milestones: ["Requirements clear", "First increment live", "User feedback collected"],
    tasks:      ["Write user stories", "Prioritize backlog", "Implement feature", "Deploy", "Collect feedback"],
    connectors: ["base44"],
    days: 21, complexity: 65,
  },
  security: {
    objectives: ["Audit current posture", "Identify vulnerabilities", "Implement mitigations"],
    milestones: ["Audit complete", "Vulnerabilities triaged", "Mitigations deployed"],
    tasks:      ["Run security scan", "Review access controls", "Patch vulnerabilities", "Document controls"],
    connectors: ["github"],
    days: 14, complexity: 75,
  },
  documentation: {
    objectives: ["Identify documentation gaps", "Write documentation", "Publish and maintain"],
    milestones: ["Gaps catalogued", "Draft complete", "Published"],
    tasks:      ["Audit existing docs", "Write missing sections", "Review for accuracy", "Publish"],
    connectors: ["github"],
    days: 5, complexity: 30,
  },
  testing: {
    objectives: ["Define test strategy", "Implement test coverage", "Automate and monitor"],
    milestones: ["Strategy documented", "Coverage target reached", "CI/CD integrated"],
    tasks:      ["Define coverage targets", "Write unit tests", "Write integration tests", "Set up CI"],
    connectors: ["github"],
    days: 10, complexity: 50,
  },
  other: {
    objectives: ["Clarify scope", "Plan execution", "Deliver outcome"],
    milestones: ["Scope defined", "Midpoint checkpoint", "Delivery complete"],
    tasks:      ["Define scope", "Plan tasks", "Execute", "Review"],
    connectors: [],
    days: 14, complexity: 40,
  },
};

export class GoalDecomposer {
  decompose(goal: Goal): GoalDecomposition {
    const tmpl = CATEGORY_TEMPLATES[goal.category] ?? CATEGORY_TEMPLATES["other"];
    const gid  = goal.id;

    const objectives = tmpl.objectives.map((t, i) =>
      item("objective", t, `Objective for goal: ${goal.title}`, "medium", i + 1, gid, [], tmpl.connectors));

    const milestones = tmpl.milestones.map((t, i) =>
      item("milestone", t, `Milestone ${i + 1} for goal: ${goal.title}`, "medium", i + 1, gid,
        i > 0 ? [milestones[i - 1]?.id ?? ""].filter(Boolean) : []));

    // Tasks depend on previous task (sequential by default)
    const tasks: DecompositionItem[] = [];
    for (let i = 0; i < tmpl.tasks.length; i++) {
      tasks.push(item("task", tmpl.tasks[i], `Task for: ${goal.title}`, i === tmpl.tasks.length - 1 ? "high" : "medium", i + 1, gid,
        i > 0 ? [tasks[i - 1].id] : [], tmpl.connectors));
    }

    // Subgoals for complex/high-priority goals
    const subgoals: DecompositionItem[] = [];
    if (goal.priority === "high" || goal.priority === "critical") {
      subgoals.push(item("subgoal", `Validate: ${goal.title}`, "Validation subgoal for quality assurance", "medium", 1, gid));
      subgoals.push(item("subgoal", `Document: ${goal.title}`, "Documentation subgoal for knowledge preservation", "low", 2, gid));
    }

    // Dependencies: connector deps + knowledge deps
    const dependencies: DecompositionItem[] = tmpl.connectors.map((c, i) =>
      item("dependency", `${c} connector available`, `${c} connector must be authenticated and healthy`, "low", i + 1, gid));

    const allItems = [...objectives, ...milestones, ...tasks, ...subgoals, ...dependencies];

    // Complexity adjusted by priority
    const priorityMult = goal.priority === "critical" ? 1.3 : goal.priority === "high" ? 1.1 : 1.0;
    const complexity = Math.min(100, Math.round(tmpl.complexity * priorityMult));

    return Object.freeze({
      id:                     makeGIEId("decomp"),
      goalId:                 gid,
      generatedAt:            Date.now(),
      objectives:             Object.freeze(objectives),
      milestones:             Object.freeze(milestones),
      tasks:                  Object.freeze(tasks),
      subgoals:               Object.freeze(subgoals),
      dependencies:           Object.freeze(dependencies),
      totalItems:             allItems.length,
      estimatedCompletionDays: Math.round(tmpl.days * priorityMult),
      complexityScore:         complexity,
    });
  }
}