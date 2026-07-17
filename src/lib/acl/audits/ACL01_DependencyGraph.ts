// ══════════════════════════════════════════════════════════════════════════════
// ACL-01 — Dependency Graph Audit
// Builds the dependency graph from the RuntimeRegistry and validates it.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise, KNOWN_RUNTIMES } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import { ExecutionCompositionRoot } from "@/lib/execution-chain/ExecutionCompositionRoot";

export async function runACL01(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-01", "Dependency Graph Audit");
  const t = Date.now();

  try {
    const rt = ExecutionCompositionRoot.compose({});
    const registry = rt.registry;
    const graph = registry.dependencyGraph();
    const allNodes = graph.map(n => n.id);

    a.metrics["nodes"] = allNodes.length;

    // ── Cycle detection (DFS) ─────────────────────────────────────────────────
    let cycles = 0;
    const visited = new Set<string>();
    const stack   = new Set<string>();

    function dfs(id: string): boolean {
      if (stack.has(id)) return true;  // cycle
      if (visited.has(id)) return false;
      visited.add(id);
      stack.add(id);
      const node = graph.find(n => n.id === id);
      for (const dep of (node?.dependencies ?? [])) {
        if (dfs(dep)) {
          cycles++;
          finding(a, "CRITICAL", "DependencyCycle", `Cycle detected involving '${id}' → '${dep}'`);
          a.score -= 20;
        }
      }
      stack.delete(id);
      return false;
    }
    for (const n of graph) dfs(n.id);
    a.metrics["cycles"] = cycles;

    // ── Orphan detection ─────────────────────────────────────────────────────
    const allDeps = new Set(graph.flatMap(n => [...n.dependencies]));
    const orphans = graph.filter(n => !allDeps.has(n.id) && n.dependencies.length === 0);
    a.metrics["orphans"] = orphans.length;
    for (const o of orphans) {
      finding(a, "LOW", "OrphanNode", `Runtime '${o.id}' has no dependencies and nothing depends on it`);
      a.score -= 1;
    }

    // ── Unresolved dependencies ───────────────────────────────────────────────
    const unresolved = graph.filter(n => !n.resolved);
    a.metrics["unresolved"] = unresolved.length;
    for (const u of unresolved) {
      finding(a, "HIGH", "UnresolvedDependency", `Runtime '${u.id}' has unresolved dependencies`);
      a.score -= 8;
    }

    // ── Isolated modules (known but not in registry) ──────────────────────────
    const isolated = KNOWN_RUNTIMES.filter(k => !allNodes.includes(k));
    a.metrics["isolated"] = isolated.length;
    for (const m of isolated) {
      finding(a, "MEDIUM", "IsolatedModule", `Known module '${m}' not found in RuntimeRegistry`);
      a.score -= 3;
    }

    // ── Validation ────────────────────────────────────────────────────────────
    const validation = registry.validate();
    a.metrics["registryValid"] = validation.valid;
    for (const v of validation.violations) {
      finding(a, "HIGH", "RegistryViolation", v);
      a.score -= 5;
    }

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL01Error", String(err));
    a.score = 0;
  }

  return finalise(a, t);
}