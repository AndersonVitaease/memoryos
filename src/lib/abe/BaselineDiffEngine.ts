/**
 * BaselineDiffEngine.ts — Architecture Baseline Engine v1.0
 * Sprint EF-6.7.0
 *
 * Compares two baselines and produces a structured diff.
 * NO knowledge of specific modules, expected APIs, or expected imports.
 * Pure structural comparison: baseline A vs baseline B.
 */

import type { ABEBaseline, ABEDiffResult, ABEChange, ABEChangeCategory } from "./ABETypes";

// ── Category classifier ───────────────────────────────────────────────────────
// Classifies modules by naming convention — no hardcoded module lists.

function classifyModule(moduleId: string): ABEChangeCategory {
  const id = moduleId.toLowerCase();
  if (id.includes("test") || id.includes("spec") || id.includes("cert"))  return "Teste";
  if (id.includes("page") || id.includes("dashboard") || id.includes("ui")) return "Dashboard";
  if (id.includes("doc") || id.includes("readme"))                         return "Documentacao";
  if (id.includes("runtime") || id.includes("pipeline") || id.includes("registry") ||
      id.includes("transport") || id.includes("circuit") || id.includes("rate") ||
      id.includes("metrics") || id.includes("utl"))                        return "Infraestrutura";
  if (id.includes("adapter") || id.includes("executor") || id.includes("connector") ||
      id.includes("gmail") || id.includes("drive") || id.includes("calendar"))  return "Dominio";
  return "Desconhecido";
}

function classifySeverity(kind: ABEChange["kind"], category: ABEChangeCategory): ABEChange["severity"] {
  if (category === "Infraestrutura" && (kind === "export_removed" || kind === "export_changed")) return "critical";
  if (category === "Infraestrutura" && kind === "hash_changed") return "warning";
  if (kind === "module_removed") return "critical";
  if (kind === "export_removed") return "warning";
  return "info";
}

// ── Main diff ─────────────────────────────────────────────────────────────────

export function diffBaselines(baseline: ABEBaseline, current: ABEBaseline): ABEDiffResult {
  const changes: ABEChange[] = [];
  const now = new Date().toISOString();

  const baseMap = new Map(baseline.modules.map(m => [m.id, m]));
  const currMap = new Map(current.modules.map(m => [m.id, m]));

  let modulesAdded    = 0;
  let modulesRemoved  = 0;
  let exportsAdded    = 0;
  let exportsRemoved  = 0;
  let exportsChanged  = 0;
  let hashesChanged   = 0;

  // 1. Find removed modules
  for (const [id, bMod] of baseMap) {
    if (!currMap.has(id)) {
      modulesRemoved++;
      const category = classifyModule(id);
      changes.push({
        kind: "module_removed", module: id,
        detail: `Module "${id}" present in baseline but absent in current snapshot`,
        category, severity: classifySeverity("module_removed", category),
      });
    }
  }

  // 2. Find added modules
  for (const [id] of currMap) {
    if (!baseMap.has(id)) {
      modulesAdded++;
      const category = classifyModule(id);
      changes.push({
        kind: "module_added", module: id,
        detail: `Module "${id}" not in baseline (new addition)`,
        category, severity: classifySeverity("module_added", category),
      });
    }
  }

  // 3. Compare existing modules
  for (const [id, bMod] of baseMap) {
    const cMod = currMap.get(id);
    if (!cMod) continue;

    // Hash comparison
    if (bMod.hash !== cMod.hash) {
      hashesChanged++;
      const category = classifyModule(id);
      changes.push({
        kind: "hash_changed", module: id,
        detail: `Hash changed: ${bMod.hash} → ${cMod.hash}`,
        category, severity: classifySeverity("hash_changed", category),
      });
    }

    // Export-level diff
    const bExports = new Map(bMod.exports.map(e => [e.name, e]));
    const cExports = new Map(cMod.exports.map(e => [e.name, e]));
    const category = classifyModule(id);

    for (const [name, bExp] of bExports) {
      if (!cExports.has(name)) {
        exportsRemoved++;
        changes.push({
          kind: "export_removed", module: id,
          detail: `Export "${name}" (${bExp.kind}) removed`,
          category, severity: classifySeverity("export_removed", category),
        });
      } else {
        const cExp = cExports.get(name)!;
        if (cExp.hash !== bExp.hash) {
          exportsChanged++;
          changes.push({
            kind: "export_changed", module: id,
            detail: `Export "${name}" changed: ${bExp.kind}(${bExp.arity ?? "?"}) → ${cExp.kind}(${cExp.arity ?? "?"})`,
            category, severity: classifySeverity("export_changed", category),
          });
        }
      }
    }

    for (const [name] of cExports) {
      if (!bExports.has(name)) {
        exportsAdded++;
        changes.push({
          kind: "export_added", module: id,
          detail: `Export "${name}" added`,
          category, severity: classifySeverity("export_added", category),
        });
      }
    }
  }

  // 4. Dependency diff
  const baseDeps = new Set(baseline.dependencies.map(d => `${d.from}→${d.to}`));
  const currDeps = new Set(current.dependencies.map(d => `${d.from}→${d.to}`));
  let depsAdded = 0, depsRemoved = 0;

  for (const dep of currDeps) {
    if (!baseDeps.has(dep)) {
      depsAdded++;
      const [from] = dep.split("→");
      const category = classifyModule(from);
      changes.push({
        kind: "dependency_added", module: from,
        detail: `Dependency "${dep}" added`,
        category, severity: classifySeverity("dependency_added", category),
      });
    }
  }
  for (const dep of baseDeps) {
    if (!currDeps.has(dep)) {
      depsRemoved++;
      const [from] = dep.split("→");
      const category = classifyModule(from);
      changes.push({
        kind: "dependency_removed", module: from,
        detail: `Dependency "${dep}" removed`,
        category, severity: classifySeverity("dependency_removed", category),
      });
    }
  }

  const unchangedCount = baseline.modules.length - modulesRemoved -
    changes.filter(c => c.kind === "hash_changed" || c.kind === "export_added" || c.kind === "export_removed" || c.kind === "export_changed").length;

  return Object.freeze({
    baselineId:     baseline.id,
    currentId:      current.id,
    diffedAt:       now,
    changes:        Object.freeze(changes),
    unchangedCount: Math.max(0, unchangedCount),
    changedCount:   changes.length,
    summary: Object.freeze({ modulesAdded, modulesRemoved, exportsAdded, exportsRemoved, exportsChanged, depsAdded, depsRemoved, hashesChanged }),
  });
}