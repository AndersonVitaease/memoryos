/**
 * TaskDependencyResolver.ts — Sprint EF-43 · Cognitive Orchestrator v1.0
 *
 * SRP: ordenar CognitiveTasks respeitando suas dependências via sort topológico.
 *
 * Detecta: ciclos, dependências inválidas, tarefas órfãs.
 * Produz: lista de ids em ordem de execução segura.
 *
 * Imutável — sem side effects.
 */

import type { CognitiveTask } from "./COTypes";
import type { ExecStrategy }  from "@/lib/planner-engine/PlannerTypes";

export interface DependencyResolution {
  readonly orderedIds:   readonly string[];
  readonly strategy:     ExecStrategy;
  readonly parallelGroups: readonly (readonly string[])[];  // tasks that can run in parallel
  readonly hasCircular:  boolean;
  readonly warnings:     readonly string[];
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────────────

function topologicalSort(tasks: readonly CognitiveTask[]): { order: string[]; hasCircular: boolean } {
  const inDegree  = new Map<string, number>();
  const adjList   = new Map<string, string[]>();
  const idSet     = new Set(tasks.map(t => t.id));

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    adjList.set(t.id, []);
  }

  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!idSet.has(dep)) continue; // unknown dep — skip (reported in warnings)
      adjList.get(dep)!.push(t.id);
      inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
    }
  }

  // BFS queue: all nodes with in-degree 0
  const queue   = tasks.filter(t => inDegree.get(t.id) === 0).map(t => t.id);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    ordered.push(curr);
    for (const next of (adjList.get(curr) ?? [])) {
      const newDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  return {
    order:       ordered,
    hasCircular: ordered.length < tasks.length,
  };
}

// ── Parallel group builder ────────────────────────────────────────────────────
// Tasks that share the same "dependency frontier" can run in parallel.

function buildParallelGroups(
  ordered: readonly string[],
  tasks:   readonly CognitiveTask[],
): readonly (readonly string[])[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const groups: string[][] = [];
  const assigned = new Set<string>();

  for (const id of ordered) {
    if (assigned.has(id)) continue;
    const task = taskMap.get(id);
    if (!task) continue;

    // Find siblings: same dependency set and all canParallelize
    if (task.canParallelize) {
      const depKey = [...task.dependsOn].sort().join(",");
      const siblings = ordered.filter(sid => {
        if (assigned.has(sid)) return false;
        const s = taskMap.get(sid);
        if (!s || !s.canParallelize) return false;
        return [...s.dependsOn].sort().join(",") === depKey;
      });
      if (siblings.length > 1) {
        groups.push(siblings);
        siblings.forEach(s => assigned.add(s));
        continue;
      }
    }

    groups.push([id]);
    assigned.add(id);
  }

  return Object.freeze(groups.map(g => Object.freeze(g)));
}

// ── Strategy selector ─────────────────────────────────────────────────────────

function selectStrategy(groups: readonly (readonly string[])[], hasParallel: boolean): ExecStrategy {
  if (hasParallel) return "Parallel";
  return "Sequential";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function resolveDependencies(tasks: readonly CognitiveTask[]): DependencyResolution {
  const warnings: string[] = [];
  const idSet = new Set(tasks.map(t => t.id));

  // Validate all dependsOn references
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!idSet.has(dep)) {
        warnings.push(`Task '${t.title}' depends on unknown task id '${dep}' — dependency ignored`);
      }
    }
  }

  const { order, hasCircular } = topologicalSort(tasks);

  if (hasCircular) {
    warnings.push("Circular dependency detected in task graph — using partial order");
    // Fallback: use index order for remaining tasks
    const missing = tasks.filter(t => !order.includes(t.id)).map(t => t.id);
    order.push(...missing);
  }

  const groups     = buildParallelGroups(order, tasks);
  const hasParallel = groups.some(g => g.length > 1);
  const strategy   = selectStrategy(groups, hasParallel);

  return Object.freeze({
    orderedIds:     Object.freeze(order),
    strategy,
    parallelGroups: groups,
    hasCircular,
    warnings:       Object.freeze(warnings),
  });
}