/**
 * BaselineSnapshot.ts — Architecture Baseline Engine v1.0
 * Sprint EF-6.7.0
 *
 * Captures the LIVE state of any set of modules.
 * NO hardcoded lists. NO expected APIs. NO expected imports.
 * Everything is extracted from the actual exported objects at runtime.
 */

import type {
  ABEBaseline,
  ABEModuleSnapshot,
  ABEExport,
  ABEDependencyEdge,
  ABECouplingMetrics,
} from "./ABETypes";

// ── Hash ──────────────────────────────────────────────────────────────────────
// Lightweight deterministic string fingerprint (djb2 variant).
// No crypto dependency — runs in browser.

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h.toString(16).padStart(8, "0");
}

function hashExports(exports: ABEExport[]): string {
  const canonical = exports.map(e => `${e.name}:${e.kind}:${e.arity ?? "?"}`)
                           .sort()
                           .join("|");
  return hash(canonical);
}

function hashAllModules(modules: ABEModuleSnapshot[]): string {
  const combined = modules.map(m => m.hash).sort().join("|");
  return hash(combined);
}

// ── Export introspector ───────────────────────────────────────────────────────
// Given any object (module namespace or exported singleton), extract its
// exported symbols automatically.

function introspectExports(obj: Record<string, unknown>): ABEExport[] {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([name, value]) => {
      const kind: ABEExport["kind"] =
        typeof value === "function"
          ? (value.prototype && Object.keys(value.prototype).length > 0 ? "class" : "function")
          : typeof value === "object" ? "object"
          : "constant";
      const arity = typeof value === "function" ? (value as Function).length : undefined;
      return {
        name,
        kind,
        arity,
        hash: hash(`${name}:${kind}:${arity ?? "?"}`),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Module descriptor ─────────────────────────────────────────────────────────

export interface ABEModuleDescriptor {
  /** Logical identifier for this module (e.g. "UCRRuntime") */
  id:    string;
  /** Import path (e.g. "@/lib/ucr/UCRRuntime") */
  path:  string;
  /** The actual exported object / namespace */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj:   Record<string, any>;
  /** Sprint that owns this module */
  sprint?: string;
  /** Explicit dependencies (logical ids) — provided by caller since we can't read import statements at runtime */
  deps?: string[];
}

// ── Main snapshot function ────────────────────────────────────────────────────

export function captureBaseline(
  id: string,
  label: string,
  modules: ABEModuleDescriptor[],
): ABEBaseline {
  const now = new Date().toISOString();

  // Build module snapshots — fully automatic, no hardcoded expected values
  const snapshots: ABEModuleSnapshot[] = modules.map(m => {
    const exports  = introspectExports(m.obj);
    const modHash  = hashExports(exports);
    return {
      id:          m.id,
      path:        m.path,
      exports,
      hash:        modHash,
      capturedAt:  now,
      sprintLabel: m.sprint ?? id,
    };
  });

  // Build dependency graph from caller-provided deps (since we can't inspect imports at runtime)
  const dependencies: ABEDependencyEdge[] = [];
  for (const m of modules) {
    for (const dep of (m.deps ?? [])) {
      dependencies.push({ from: m.id, to: dep });
    }
  }

  // Compute coupling metrics
  const modIds = modules.map(m => m.id);
  const coupling: ABECouplingMetrics[] = modIds.map(modId => {
    const fanOut = (modules.find(m => m.id === modId)?.deps ?? []).length;
    const fanIn  = modules.filter(m => (m.deps ?? []).includes(modId)).length;
    const instability = (fanIn + fanOut) === 0 ? 0
      : Math.round((fanOut / (fanIn + fanOut)) * 100) / 100;
    return { module: modId, fanIn, fanOut, instability };
  });

  const baselineHash = hashAllModules(snapshots);

  return Object.freeze({
    id,
    label,
    createdAt: now,
    modules: Object.freeze(snapshots),
    dependencies: Object.freeze(dependencies),
    coupling: Object.freeze(coupling),
    summary: Object.freeze({
      totalModules:  snapshots.length,
      totalExports:  snapshots.reduce((s, m) => s + m.exports.length, 0),
      totalEdges:    dependencies.length,
      baselineHash,
    }),
  });
}