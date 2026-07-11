// ABV — Architectural Baseline Engine
// Foundation v1.0 · Engineering First
//
// Snapshot imutavel da arquitetura. Nunca modificado apos criacao.
// Toda informacao vem exclusivamente do ABVReport.

import type { ABVReport, ComplianceScore } from "./ArchitecturalBoundaryValidator";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeType =
  | "ADDED"
  | "REMOVED"
  | "MODIFIED"
  | "REGRESSION"
  | "IMPROVEMENT"
  | "UNCHANGED";

export interface BaselineLayer {
  id: string;
  label: string;
  status: string;
  filesAnalyzed: number;
  publicApi: string[];
  detectedDeps: string[];
  forbiddenDeps: string[];
  boundaryViolations: number;
}

export interface ArchitecturalBaseline {
  readonly baselineId: string;
  readonly version: string;
  readonly label: string;
  readonly timestamp: number;
  readonly auditHash: string;
  // Source metrics
  readonly filesAnalyzed: number;
  readonly importsAnalyzed: number;
  readonly exportsAnalyzed: number;
  readonly modulesAudited: number;
  // Graph
  readonly circularDependencies: number;
  readonly isolatedModules: string[];
  readonly orphanModules: string[];
  // Evidence summary
  readonly totalEvidences: number;
  readonly criticalCount: number;
  readonly errorCount: number;
  // Compliance
  readonly compliance: ComplianceScore;
  // Boundaries
  readonly boundariesApproved: number;
  readonly boundariesViolated: number;
  readonly forbiddenDeps: number;
  readonly validDeps: number;
  // Layer snapshots
  readonly layers: BaselineLayer[];
  // Detected module paths (for diff)
  readonly modulePaths: string[];
  // All public API exports per layer
  readonly apiSurface: Record<string, string[]>;
  // All detected deps per layer
  readonly depGraph: Record<string, string[]>;
}

// ── Baseline Factory ──────────────────────────────────────────────────────────

let _seq = 0;

function makeId(): string {
  _seq++;
  return `BL-${Date.now()}-${String(_seq).padStart(3, "0")}`;
}

/** Simple deterministic hash from string */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}

export function createBaseline(report: ABVReport, label?: string): ArchitecturalBaseline {
  // Build a stable hash from key report fields
  const hashInput = [
    report.filesAnalyzed,
    report.importsAnalyzed,
    report.exportsAnalyzed,
    report.boundariesViolated,
    report.circularDependencies,
    report.compliance.overallCompliance,
    report.layers.map(l => `${l.layer}:${l.status}:${l.filesAnalyzed}`).join("|"),
  ].join("::");

  const apiSurface: Record<string, string[]> = {};
  const depGraph: Record<string, string[]>   = {};
  const layers: BaselineLayer[] = report.layers.map(l => {
    apiSurface[l.layer] = [...l.publicApi];
    depGraph[l.layer]   = [...l.detectedDeps];
    return {
      id: l.layer,
      label: l.label,
      status: l.status,
      filesAnalyzed: l.filesAnalyzed,
      publicApi: [...l.publicApi],
      detectedDeps: [...l.detectedDeps],
      forbiddenDeps: [...l.forbiddenDeps],
      boundaryViolations: l.boundaryEvidences.filter(e => e.severity === "CRITICAL" || e.severity === "ERROR").length,
    };
  });

  const modulePaths = report.layers.flatMap(l => l.detectedImports ?? []);

  const seq = _seq + 1;
  return Object.freeze({
    baselineId: makeId(),
    version: `v${seq}`,
    label: label ?? `Baseline ${new Date().toISOString().slice(0, 16)}`,
    timestamp: Date.now(),
    auditHash: simpleHash(hashInput),
    filesAnalyzed: report.filesAnalyzed,
    importsAnalyzed: report.importsAnalyzed,
    exportsAnalyzed: report.exportsAnalyzed,
    modulesAudited: report.modulesAudited,
    circularDependencies: report.circularDependencies,
    isolatedModules: [...(report.isolatedModules ?? [])],
    orphanModules:   [...(report.orphanModules ?? [])],
    totalEvidences: report.allEvidences.length,
    criticalCount:  report.criticalEvidences.length,
    errorCount:     report.errorEvidences.length,
    compliance: { ...report.compliance },
    boundariesApproved: report.boundariesApproved,
    boundariesViolated: report.boundariesViolated,
    forbiddenDeps: report.forbiddenDeps,
    validDeps: report.validDeps,
    layers,
    modulePaths,
    apiSurface,
    depGraph,
  });
}

// ── Baseline Registry ─────────────────────────────────────────────────────────

export class BaselineRegistry {
  private readonly store: ArchitecturalBaseline[] = [];

  register(baseline: ArchitecturalBaseline): { success: boolean; reason?: string } {
    if (this.store.some(b => b.auditHash === baseline.auditHash)) {
      return { success: false, reason: `Baseline com hash "${baseline.auditHash}" ja registrado` };
    }
    if (this.store.some(b => b.baselineId === baseline.baselineId)) {
      return { success: false, reason: `ID "${baseline.baselineId}" duplicado` };
    }
    this.store.push(baseline);
    return { success: true };
  }

  list(): ArchitecturalBaseline[] {
    return [...this.store].sort((a, b) => a.timestamp - b.timestamp);
  }

  get(id: string): ArchitecturalBaseline | null {
    return this.store.find(b => b.baselineId === id) ?? null;
  }

  latest(): ArchitecturalBaseline | null {
    return this.store.length === 0
      ? null
      : this.store.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  }

  previous(current: ArchitecturalBaseline): ArchitecturalBaseline | null {
    const sorted = this.list();
    const idx = sorted.findIndex(b => b.baselineId === current.baselineId);
    return idx > 0 ? sorted[idx - 1] : null;
  }

  count(): number { return this.store.length; }
}