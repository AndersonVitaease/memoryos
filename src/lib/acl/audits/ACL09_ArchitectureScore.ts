// ══════════════════════════════════════════════════════════════════════════════
// ACL-09 — Architecture Score
// Computes: Coupling, Cohesion, Complexity, Fan-in, Fan-out,
//           Depth, Dependencies, Components, Architecture Score.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import { ExecutionCompositionRoot } from "@/lib/execution-chain/ExecutionCompositionRoot";

export async function runACL09(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-09", "Architecture Score");
  const t = Date.now();

  try {
    const rt = ExecutionCompositionRoot.compose({});
    const graph = rt.registry.dependencyGraph();
    const descriptors = rt.registry.listAll();

    const N = graph.length; // total components

    // ── Fan-in / Fan-out ──────────────────────────────────────────────────────
    const fanIn  = new Map<string, number>();
    const fanOut = new Map<string, number>();

    for (const node of graph) {
      fanOut.set(node.id, node.dependencies.length);
      for (const dep of node.dependencies) {
        fanIn.set(dep, (fanIn.get(dep) ?? 0) + 1);
      }
    }

    const avgFanOut = N > 0 ? graph.reduce((s,n) => s + n.dependencies.length, 0) / N : 0;
    const avgFanIn  = N > 0 ? Array.from(fanIn.values()).reduce((s,v) => s+v, 0) / N : 0;
    const maxFanOut = Math.max(...graph.map(n => n.dependencies.length), 0);
    const maxFanIn  = Math.max(...Array.from(fanIn.values()), 0);

    a.metrics["components"]  = N;
    a.metrics["avgFanOut"]   = Math.round(avgFanOut * 100) / 100;
    a.metrics["avgFanIn"]    = Math.round(avgFanIn  * 100) / 100;
    a.metrics["maxFanOut"]   = maxFanOut;
    a.metrics["maxFanIn"]    = maxFanIn;

    // ── Coupling (lower = better) ─────────────────────────────────────────────
    // Coupling = total edges / (N*(N-1)) — normalized 0..1
    const totalEdges = graph.reduce((s,n) => s + n.dependencies.length, 0);
    const maxEdges   = N > 1 ? N * (N - 1) : 1;
    const coupling   = totalEdges / maxEdges;
    a.metrics["coupling"] = Math.round(coupling * 1000) / 1000;

    // ── Cohesion (approximated — more capabilities per component = higher cohesion) ─
    const avgCaps = descriptors.length > 0
      ? descriptors.reduce((s,d) => s + d.capabilities.length, 0) / descriptors.length
      : 0;
    const cohesion = Math.min(1, avgCaps / 5); // normalize to 0..1 (5 caps = max)
    a.metrics["cohesion"] = Math.round(cohesion * 1000) / 1000;

    // ── Depth (longest dependency chain) ─────────────────────────────────────
    function depth(id: string, visited = new Set<string>()): number {
      if (visited.has(id)) return 0;
      visited.add(id);
      const node = graph.find(n => n.id === id);
      if (!node || node.dependencies.length === 0) return 0;
      return 1 + Math.max(...node.dependencies.map(d => depth(d, new Set(visited))));
    }
    const maxDepth = graph.length > 0 ? Math.max(...graph.map(n => depth(n.id))) : 0;
    a.metrics["maxDepth"] = maxDepth;

    // ── Complexity (approximated McCabe-style) ────────────────────────────────
    // Complexity = E - N + 2 (edges - nodes + 2)
    const complexity = Math.max(1, totalEdges - N + 2);
    a.metrics["complexity"] = complexity;

    // ── Architecture Score calculation ────────────────────────────────────────
    let score = 100;

    // Coupling penalty: > 0.3 coupling is concerning
    if (coupling > 0.5) {
      score -= 20;
      finding(a, "HIGH", "HighCoupling",
        `Coupling = ${coupling.toFixed(3)} (threshold: 0.5) — tightly coupled architecture`);
    } else if (coupling > 0.3) {
      score -= 8;
      finding(a, "MEDIUM", "ModerateCoupling",
        `Coupling = ${coupling.toFixed(3)} — moderate coupling`);
    } else {
      finding(a, "INFO", "LowCoupling", `Coupling = ${coupling.toFixed(3)} — well-decoupled`);
    }

    // Fan-out penalty: > 7 fan-out suggests god-component
    if (maxFanOut > 10) {
      score -= 15;
      finding(a, "HIGH", "HighFanOut",
        `Max fan-out = ${maxFanOut} — god component detected`);
    } else if (maxFanOut > 7) {
      score -= 5;
      finding(a, "MEDIUM", "ModerateFanOut", `Max fan-out = ${maxFanOut}`);
    } else {
      finding(a, "INFO", "FanOut", `Max fan-out = ${maxFanOut} — acceptable`);
    }

    // Depth penalty: > 5 is deep
    if (maxDepth > 8) {
      score -= 15;
      finding(a, "HIGH", "ExcessiveDepth",
        `Max dependency depth = ${maxDepth} — deeply nested architecture`);
    } else if (maxDepth > 5) {
      score -= 5;
      finding(a, "MEDIUM", "ModerateDepth", `Max depth = ${maxDepth}`);
    } else {
      finding(a, "INFO", "Depth", `Max depth = ${maxDepth} — shallow hierarchy`);
    }

    // Complexity penalty
    if (complexity > 20) {
      score -= 10;
      finding(a, "HIGH", "Complexity", `Complexity = ${complexity} — high cyclomatic complexity`);
    } else {
      finding(a, "INFO", "Complexity", `Complexity = ${complexity} — manageable`);
    }

    // Cohesion bonus/penalty
    if (cohesion < 0.2 && descriptors.length > 0) {
      score -= 5;
      finding(a, "MEDIUM", "LowCohesion", `Cohesion = ${cohesion.toFixed(3)} — modules have few capabilities`);
    } else {
      finding(a, "INFO", "Cohesion", `Cohesion = ${cohesion.toFixed(3)}`);
    }

    a.metrics["architectureScore"] = Math.max(0, score);
    a.score = Math.max(0, score);

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL09Error", String(err));
    a.score = 0;
  }

  return finalise(a, t);
}