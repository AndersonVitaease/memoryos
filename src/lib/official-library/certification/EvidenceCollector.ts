/**
 * EvidenceCollector.ts — Sprint EF-42.8
 *
 * SRP: collect traceable evidence for each certification claim.
 * Every Pass/Fail/Obs conclusion must have a backing Evidence record.
 *
 * Evidence is collected from:
 *   - ScanResult (from ArchitectureScanner)
 *   - DependencyGraph (from DependencyGraphBuilder)
 *   - PipelineInspectionResult (from PipelineInspector)
 */

import type { ScanResult }              from "./ArchitectureScanner";
import type { DependencyGraph }         from "./DependencyGraphBuilder";
import type { PipelineInspectionResult } from "./PipelineInspector";

export type EvidenceResult = "PASS" | "FAIL" | "OBS";

export interface Evidence {
  readonly id:         number;
  readonly rule:       string;          // what architectural rule is being checked
  readonly component:  string;          // component involved
  readonly file:       string;          // source file
  readonly finding:    string;          // what was found
  readonly result:     EvidenceResult;
  readonly isCritical: boolean;
}

export interface EvidenceCollection {
  readonly items:      readonly Evidence[];
  readonly total:      number;
  readonly passed:     number;
  readonly failed:     number;
  readonly observed:   number;
  readonly criticalFailures: number;
  readonly collectedAt: string;
  readonly durationMs: number;
}

// ── Evidence rule evaluators ──────────────────────────────────────────────────

class EvidenceCollectorImpl {

  collect(
    scan:     ScanResult,
    graph:    DependencyGraph,
    pipeline: PipelineInspectionResult,
  ): EvidenceCollection {
    const t0    = Date.now();
    const items: Evidence[] = [];
    let id = 1;

    function add(
      rule: string, component: string, file: string,
      finding: string, result: EvidenceResult, isCritical = false,
    ): void {
      items.push(Object.freeze({ id: id++, rule, component, file, finding, result, isCritical }));
    }

    // ── R1: All components are singletons ─────────────────────────────────────
    for (const c of scan.components) {
      const ok = c.isSingleton;
      add(
        "All components must be HMR-safe singletons",
        c.id, c.file,
        ok ? `Singleton confirmed via globalThis.${c.globalKey}` : `No singleton key found in globalThis`,
        ok ? "PASS" : "FAIL", !ok,
      );
    }

    // ── R2: No circular dependencies ──────────────────────────────────────────
    if (!graph.hasCircular) {
      add("Dependency graph must be acyclic (no circular deps)", "Graph", "certification/DependencyGraphBuilder.ts",
        "No circular dependencies detected in the full dependency graph", "PASS");
    } else {
      add("Dependency graph must be acyclic (no circular deps)", "Graph", "certification/DependencyGraphBuilder.ts",
        "CIRCULAR DEPENDENCY detected — architecture is invalid", "FAIL", true);
    }

    // ── R3: No layer violations ───────────────────────────────────────────────
    if (graph.violations.length === 0) {
      add("No layer inversion violations", "Graph", "certification/DependencyGraphBuilder.ts",
        "All dependency directions are correct (bootstrap→content→index→retrieval)", "PASS");
    } else {
      for (const v of graph.violations) {
        add("No layer inversion violations", `${v.from}→${v.to}`, v.from,
          `Layer violation: ${v.fromLayer} → ${v.toLayer} (type: ${v.type})`, "FAIL", true);
      }
    }

    // ── R4: No orphan components ──────────────────────────────────────────────
    const orphans = graph.nodes.filter(n => n.isOrphan);
    if (orphans.length === 0) {
      add("No orphan components (all referenced)", "Graph", "certification/DependencyGraphBuilder.ts",
        "All components are reachable from at least one consumer", "PASS");
    } else {
      for (const o of orphans) {
        add("No orphan components", o.id, o.file,
          `Component has 0 consumers — may be dead code or legacy`, "OBS");
      }
    }

    // ── R5: Pipeline is complete ──────────────────────────────────────────────
    if (pipeline.isComplete) {
      add("Official pipeline must be fully operational",
        "Pipeline", "certification/PipelineInspector.ts",
        `All ${pipeline.totalStages} pipeline stages are operational`, "PASS");
    } else {
      for (const s of pipeline.missingStages) {
        add("Official pipeline must be fully operational",
          s, "certification/PipelineInspector.ts",
          `Stage '${s}' is NOT operational — singleton missing or methods absent`, "FAIL", true);
      }
    }

    // ── R6: Each pipeline stage has required methods ───────────────────────────
    for (const stage of pipeline.stages) {
      add(
        "Pipeline stage must expose its required methods",
        stage.stage, stage.file,
        stage.isOperational
          ? `Methods confirmed: [${stage.methodsFound.slice(0, 5).join(", ")}]`
          : `Stage missing or incomplete — globalKey: ${stage.globalKey}`,
        stage.isOperational ? "PASS" : "FAIL", !stage.isOperational,
      );
    }

    // ── R7: SRP — each component has a distinct role ──────────────────────────
    const roles = scan.components.map(c => c.role);
    const uniqueRoles = new Set(roles);
    if (uniqueRoles.size === roles.length) {
      add("SRP: each component has a unique architectural role",
        "All components", "certification/ArchitectureScanner.ts",
        `${scan.totalFound} components, ${uniqueRoles.size} unique roles — no overlap`, "PASS");
    } else {
      add("SRP: each component has a unique architectural role",
        "All components", "certification/ArchitectureScanner.ts",
        `Role duplication detected: ${roles.length} components but ${uniqueRoles.size} roles`, "OBS");
    }

    // ── R8: Single bootstrap ───────────────────────────────────────────────────
    const bootstraps = scan.components.filter(c => c.role === "bootstrap" && c.id === "OfficialLibraryAutoBootstrap");
    add("There must be exactly one official Bootstrap",
      "OfficialLibraryAutoBootstrap", "bootstrap/OfficialLibraryAutoBootstrap.ts",
      bootstraps.length === 1
        ? "Exactly one bootstrap found and operational"
        : `${bootstraps.length} bootstraps found`,
      bootstraps.length === 1 ? "PASS" : "FAIL", bootstraps.length !== 1);

    // ── R9: Single ChunkIndex ─────────────────────────────────────────────────
    const chunkIndexes = scan.components.filter(c => c.role === "chunk_index");
    add("There must be exactly one ChunkIndex",
      "ChunkIndex", "content/ChunkIndex.ts",
      chunkIndexes.length === 1
        ? "Exactly one ChunkIndex singleton found"
        : `${chunkIndexes.length} ChunkIndex instances found`,
      chunkIndexes.length === 1 ? "PASS" : "FAIL", chunkIndexes.length !== 1);

    // ── R10: Single OfficialLibraryIndex ──────────────────────────────────────
    const libIndexes = scan.components.filter(c => c.role === "library_index");
    add("There must be exactly one OfficialLibraryIndex",
      "OfficialLibraryIndex", "index/OfficialLibraryIndex.ts",
      libIndexes.length === 1
        ? "Exactly one OfficialLibraryIndex singleton found"
        : `${libIndexes.length} library indexes found`,
      libIndexes.length === 1 ? "PASS" : "FAIL", libIndexes.length !== 1);

    // ── R11: Single Retrieval ─────────────────────────────────────────────────
    const retrievers = scan.components.filter(c => c.role === "retrieval");
    add("There must be exactly one Retrieval engine",
      "OfficialRetrievalEngine", "retrieval/OfficialRetrievalEngine.ts",
      retrievers.length === 1
        ? "Exactly one OfficialRetrievalEngine singleton found"
        : `${retrievers.length} retrieval engines found`,
      retrievers.length === 1 ? "PASS" : "FAIL", retrievers.length !== 1);

    // ── R12: Retrieval must not write ─────────────────────────────────────────
    const retrievalWrites = graph.edges.filter(e => e.from === "OfficialRetrievalEngine" && e.type === "writes");
    add("Retrieval engine must not write to any index",
      "OfficialRetrievalEngine", "retrieval/OfficialRetrievalEngine.ts",
      retrievalWrites.length === 0
        ? "OfficialRetrievalEngine has no write edges — read-only confirmed"
        : `Retrieval writes detected: ${retrievalWrites.map(e => e.to).join(", ")}`,
      retrievalWrites.length === 0 ? "PASS" : "FAIL", retrievalWrites.length > 0);

    // ── Compute summary ───────────────────────────────────────────────────────
    const passed   = items.filter(i => i.result === "PASS").length;
    const failed   = items.filter(i => i.result === "FAIL").length;
    const observed = items.filter(i => i.result === "OBS").length;
    const criticalFailures = items.filter(i => i.result === "FAIL" && i.isCritical).length;

    return Object.freeze({
      items:           Object.freeze(items),
      total:           items.length,
      passed, failed, observed, criticalFailures,
      collectedAt:     new Date().toISOString(),
      durationMs:      Date.now() - t0,
    });
  }
}

const G = globalThis as typeof globalThis & { __EF428_EVIDENCE__?: EvidenceCollectorImpl };
if (!G.__EF428_EVIDENCE__) G.__EF428_EVIDENCE__ = new EvidenceCollectorImpl();
export const EvidenceCollector: EvidenceCollectorImpl = G.__EF428_EVIDENCE__;