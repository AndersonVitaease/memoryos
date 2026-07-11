// ABV — Evidence Model
// Foundation v1.0 · Engineering First
//
// Modelo de evidencias arquiteturais. READ ONLY — nunca modifica codigo.
// Toda conclusao deve possuir evidencia correspondente.

export type EvidenceSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type EvidenceStatus   = "CONFIRMED" | "SUSPECTED" | "CLEARED";

export interface ArchitecturalEvidence {
  evidenceId: string;
  timestamp: number;
  ruleId: string;
  module: string;
  file: string;
  line: number;
  description: string;
  severity: EvidenceSeverity;
  status: EvidenceStatus;
  /** 0–100: certainty of the observation */
  confidence: number;
  rawEvidence: string;
  // Optional enrichment fields
  column?: number;
  importSpecifier?: string;
  exportSymbol?: string;
  layerFrom?: string;
  layerTo?: string;
  boundaryViolated?: string;
  dependencyType?: "direct" | "indirect" | "circular" | "dynamic";
}

// ── Evidence Factory ──────────────────────────────────────────────────────────

let _counter = 0;

function nextId(): string {
  _counter++;
  return `EVD-${String(_counter).padStart(5, "0")}`;
}

export function makeEvidence(
  partial: Omit<ArchitecturalEvidence, "evidenceId" | "timestamp" | "status" | "confidence"> &
    Partial<Pick<ArchitecturalEvidence, "status" | "confidence">>,
): ArchitecturalEvidence {
  return {
    evidenceId: nextId(),
    timestamp: Date.now(),
    status: partial.status ?? "CONFIRMED",
    confidence: partial.confidence ?? 100,
    ...partial,
  };
}

// ── Compliance Score ──────────────────────────────────────────────────────────

export interface ComplianceScore {
  boundaryCompliance: number;
  dependencyCompliance: number;
  apiCompliance: number;
  circularDependencyScore: number;
  importCompliance: number;
  overallCompliance: number;
}

/**
 * Calculate compliance scores (0–100).
 * All math is deterministic — no heuristics.
 */
export function calculateCompliance(opts: {
  totalBoundaries: number;
  boundaryViolations: number;
  totalDeps: number;
  forbiddenDeps: number;
  totalExports: number;
  responsibilityViolations: number;
  filesAnalyzed: number;
  circularCycles: number;
  totalImports: number;
  brokenImports: number;
}): ComplianceScore {
  const pct = (good: number, total: number) =>
    total === 0 ? 100 : Math.round((good / total) * 100);

  const boundaryCompliance      = pct(opts.totalBoundaries - opts.boundaryViolations, opts.totalBoundaries);
  const dependencyCompliance    = pct(opts.totalDeps - opts.forbiddenDeps, Math.max(opts.totalDeps, 1));
  const apiCompliance           = pct(opts.totalExports - opts.responsibilityViolations, Math.max(opts.totalExports, 1));
  const circularDependencyScore = pct(opts.filesAnalyzed - opts.circularCycles, Math.max(opts.filesAnalyzed, 1));
  const importCompliance        = pct(opts.totalImports - opts.brokenImports, Math.max(opts.totalImports, 1));

  const overallCompliance = Math.round(
    (boundaryCompliance + dependencyCompliance + apiCompliance + circularDependencyScore + importCompliance) / 5,
  );

  return { boundaryCompliance, dependencyCompliance, apiCompliance, circularDependencyScore, importCompliance, overallCompliance };
}