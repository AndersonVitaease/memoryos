/**
 * ABETypes.ts — Architecture Baseline Engine v1.0
 * Sprint EF-6.7.0
 *
 * All types for the ABE system.
 * No hardcoded lists, no expected APIs, no expected imports.
 */

// ── Module snapshot ───────────────────────────────────────────────────────────

export interface ABEModuleSnapshot {
  readonly id:          string;           // module logical id (e.g. "UCRRuntime")
  readonly path:        string;           // import path
  readonly exports:     ABEExport[];      // all exported symbols
  readonly hash:        string;           // fingerprint of exports
  readonly capturedAt:  string;           // ISO timestamp
  readonly sprintLabel: string;           // e.g. "EF-6.5.0"
}

export interface ABEExport {
  readonly name:      string;
  readonly kind:      "function" | "object" | "class" | "constant" | "unknown";
  readonly arity?:    number;             // for functions: param count
  readonly hash:      string;             // fingerprint of name+kind+arity
}

// ── Dependency edge ───────────────────────────────────────────────────────────

export interface ABEDependencyEdge {
  readonly from: string;
  readonly to:   string;
}

// ── Coupling metrics ──────────────────────────────────────────────────────────

export interface ABECouplingMetrics {
  readonly module:       string;
  readonly fanIn:        number;
  readonly fanOut:       number;
  readonly instability:  number;   // fanOut / (fanIn + fanOut), 0=stable 1=unstable
}

// ── Baseline snapshot ─────────────────────────────────────────────────────────

export interface ABEBaseline {
  readonly id:           string;   // e.g. "EF-6.5.0"
  readonly label:        string;
  readonly createdAt:    string;
  readonly modules:      ABEModuleSnapshot[];
  readonly dependencies: ABEDependencyEdge[];
  readonly coupling:     ABECouplingMetrics[];
  readonly summary: {
    readonly totalModules:   number;
    readonly totalExports:   number;
    readonly totalEdges:     number;
    readonly baselineHash:   string;  // hash of all module hashes combined
  };
}

// ── Diff result ───────────────────────────────────────────────────────────────

export type ABEChangeKind =
  | "module_added"
  | "module_removed"
  | "export_added"
  | "export_removed"
  | "export_changed"
  | "dependency_added"
  | "dependency_removed"
  | "hash_changed";

export type ABEChangeCategory =
  | "Arquitetural"
  | "Infraestrutura"
  | "Dominio"
  | "Teste"
  | "Dashboard"
  | "Documentacao"
  | "Desconhecido";

export interface ABEChange {
  readonly kind:      ABEChangeKind;
  readonly module:    string;
  readonly detail:    string;
  readonly category:  ABEChangeCategory;
  readonly severity:  "critical" | "warning" | "info";
}

export interface ABEDiffResult {
  readonly baselineId:     string;
  readonly currentId:      string;
  readonly diffedAt:       string;
  readonly changes:        ABEChange[];
  readonly unchangedCount: number;
  readonly changedCount:   number;
  readonly summary: {
    readonly modulesAdded:    number;
    readonly modulesRemoved:  number;
    readonly exportsAdded:    number;
    readonly exportsRemoved:  number;
    readonly exportsChanged:  number;
    readonly depsAdded:       number;
    readonly depsRemoved:     number;
    readonly hashesChanged:   number;
  };
}

// ── Certification rules ───────────────────────────────────────────────────────
// Rules are pure functions: (diff) => violation | null
// No hardcoded module names or expected values.

export interface ABECertificationRule {
  readonly id:          string;
  readonly description: string;
  check(diff: ABEDiffResult): ABEViolation | null;
}

export interface ABEViolation {
  readonly ruleId:    string;
  readonly message:   string;
  readonly changes:   ABEChange[];
  readonly severity:  "critical" | "warning";
}

export interface ABECertificationResult {
  readonly baselineId:  string;
  readonly currentId:   string;
  readonly certifiedAt: string;
  readonly certified:   boolean;
  readonly violations:  ABEViolation[];
  readonly diff:        ABEDiffResult;
  readonly seal:        "🟢 CERTIFICADO" | "🔴 NÃO CERTIFICADO";
}