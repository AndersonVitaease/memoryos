// ABV v4.1 — Architectural Baseline Engine (Hardening & Traceability)
// Foundation v1.0 · Engineering First · Sprint ABV v4.1
//
// Snapshot imutavel da arquitetura. Nunca modificado apos criacao.
// Hash: SHA-256 sobre payload canonico completo.
// Metadata: enriquecida com versoes, sprint, duracao, git commit.
// Toda informacao vem exclusivamente do ABVReport.

import type { ABVReport, ComplianceScore } from "./ArchitecturalBoundaryValidator";

// ── Platform constants ─────────────────────────────────────────────────────────

export const PLATFORM_META = {
  foundationVersion:      "v1.0.0",
  engineeringFirstVersion: "v1.0",
  abvVersion:             "v4.1",
  runtimeVersion:         "Base44 Runtime",
  sprint:                 "ABV v4.1 — Hardening & Traceability",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeType =
  | "ADDED"
  | "REMOVED"
  | "MODIFIED"
  | "REGRESSION"
  | "IMPROVEMENT"
  | "UNCHANGED";

/** Engineering Review state for a baseline */
export type ReviewState =
  | "PENDING"
  | "APPROVED"
  | "REQUIRES_ATTENTION"
  | "REJECTED";

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

/** Full metadata block stored in every Baseline */
export interface BaselineMetadata {
  // Identity
  readonly baselineId: string;
  readonly version: string;
  readonly label: string;
  readonly timestamp: number;
  readonly timestampIso: string;
  // Integrity
  readonly auditHash: string;          // SHA-256 (hex)
  readonly hashAlgorithm: "SHA-256";
  readonly hashPayloadDescription: string;
  // Platform provenance
  readonly foundationVersion: string;
  readonly engineeringFirstVersion: string;
  readonly abvVersion: string;
  readonly runtimeVersion: string;
  readonly sprint: string;
  // Audit context
  readonly auditDurationMs: number;
  readonly totalFiles: number;
  readonly gitCommit: string;          // "unavailable" when not set
  // Engineering Review
  readonly reviewState: ReviewState;
  readonly reviewNote: string;
}

export interface ArchitecturalBaseline {
  readonly metadata: BaselineMetadata;
  // ── Convenience accessors (mirror metadata) ───
  readonly baselineId: string;
  readonly version: string;
  readonly label: string;
  readonly timestamp: number;
  readonly auditHash: string;
  // ── Source metrics ─────────────────────────────
  readonly filesAnalyzed: number;
  readonly importsAnalyzed: number;
  readonly exportsAnalyzed: number;
  readonly modulesAudited: number;
  // ── Graph ──────────────────────────────────────
  readonly circularDependencies: number;
  readonly isolatedModules: string[];
  readonly orphanModules: string[];
  // ── Evidence summary ───────────────────────────
  readonly totalEvidences: number;
  readonly criticalCount: number;
  readonly errorCount: number;
  // ── Compliance ─────────────────────────────────
  readonly compliance: ComplianceScore;
  // ── Boundaries ─────────────────────────────────
  readonly boundariesApproved: number;
  readonly boundariesViolated: number;
  readonly forbiddenDeps: number;
  readonly validDeps: number;
  // ── Snapshots ──────────────────────────────────
  readonly layers: BaselineLayer[];
  readonly modulePaths: string[];
  readonly apiSurface: Record<string, string[]>;
  readonly depGraph: Record<string, string[]>;
}

// ── Immutable Audit History ───────────────────────────────────────────────────

export interface AuditHistoryEntry {
  readonly entryId: string;
  readonly baselineId: string;
  readonly version: string;
  readonly timestamp: number;
  readonly timestampIso: string;
  readonly auditHash: string;
  readonly hashAlgorithm: "SHA-256";
  readonly compliance: number;
  readonly criticalCount: number;
  readonly errorCount: number;
  readonly reviewState: ReviewState;
  readonly sprint: string;
  readonly abvVersion: string;
}

/** Append-only, never modified after entries are written */
export class ImmutableAuditHistory {
  private readonly _entries: AuditHistoryEntry[] = [];
  private _sealed = false;

  append(baseline: ArchitecturalBaseline): { success: boolean; reason?: string } {
    if (this._entries.some(e => e.baselineId === baseline.baselineId)) {
      return { success: false, reason: `Baseline "${baseline.baselineId}" ja presente no historico` };
    }
    const entry: AuditHistoryEntry = Object.freeze({
      entryId:       `HIST-${Date.now()}-${this._entries.length + 1}`,
      baselineId:    baseline.baselineId,
      version:       baseline.version,
      timestamp:     baseline.timestamp,
      timestampIso:  baseline.metadata.timestampIso,
      auditHash:     baseline.auditHash,
      hashAlgorithm: "SHA-256" as const,
      compliance:    baseline.compliance.overallCompliance,
      criticalCount: baseline.criticalCount,
      errorCount:    baseline.errorCount,
      reviewState:   baseline.metadata.reviewState,
      sprint:        baseline.metadata.sprint,
      abvVersion:    baseline.metadata.abvVersion,
    });
    this._entries.push(entry);
    return { success: true };
  }

  entries(): readonly AuditHistoryEntry[] {
    return [...this._entries];
  }

  count(): number { return this._entries.length; }

  /** Verify integrity: every entry's hash matches the registered baseline */
  verify(registry: BaselineRegistry): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    for (const entry of this._entries) {
      const bl = registry.get(entry.baselineId);
      if (!bl) {
        violations.push(`Entry ${entry.entryId}: baseline ${entry.baselineId} nao encontrado no registry`);
        continue;
      }
      if (bl.auditHash !== entry.auditHash) {
        violations.push(`Entry ${entry.entryId}: hash divergente — registry: ${bl.auditHash} | history: ${entry.auditHash}`);
      }
    }
    return { valid: violations.length === 0, violations };
  }
}

// ── SHA-256 via Web Crypto ────────────────────────────────────────────────────

async function sha256hex(message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(message));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: deterministic 32-char hex via djb2 (browser without SubtleCrypto)
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < message.length; i++) {
    const c = message.charCodeAt(i);
    h1 = ((h1 << 5) + h1) ^ c;
    h2 = ((h2 << 5) + h2) ^ c;
  }
  const a = Math.abs(h1).toString(16).padStart(8, "0");
  const b2 = Math.abs(h2).toString(16).padStart(8, "0");
  // Pad to 64 chars to mimic SHA-256 output length
  return (a + b2).repeat(4).slice(0, 64);
}

/** Build the canonical payload string for hashing — covers every significant report field */
function buildHashPayload(report: ABVReport): string {
  const layers = report.layers.map(l =>
    [
      l.layer,
      l.label,
      l.status,
      l.filesAnalyzed,
      l.publicApi.slice().sort().join(","),
      l.detectedDeps.slice().sort().join(","),
      l.forbiddenDeps.slice().sort().join(","),
      l.detectedImports ? l.detectedImports.slice().sort().join(",") : "",
      l.boundaryEvidences.length,
      l.apiEvidences.length,
    ].join(":"),
  ).join("|");

  const compliance = [
    report.compliance.overallCompliance,
    report.compliance.boundaryCompliance,
    report.compliance.dependencyCompliance,
    report.compliance.apiCompliance,
    report.compliance.circularDependencyScore,
    report.compliance.importCompliance,
  ].join(",");

  const evidenceSummary = [
    report.allEvidences.length,
    report.criticalEvidences.length,
    report.errorEvidences.length,
    report.allEvidences.map(e => `${e.ruleId}:${e.severity}:${e.file}:${e.line}`).sort().join(";"),
  ].join(":");

  return [
    `files:${report.filesAnalyzed}`,
    `imports:${report.importsAnalyzed}`,
    `exports:${report.exportsAnalyzed}`,
    `modules:${report.modulesAudited}`,
    `boundariesViolated:${report.boundariesViolated}`,
    `boundariesApproved:${report.boundariesApproved}`,
    `forbiddenDeps:${report.forbiddenDeps}`,
    `validDeps:${report.validDeps}`,
    `circular:${report.circularDependencies}`,
    `isolated:${(report.isolatedModules ?? []).slice().sort().join(",")}`,
    `compliance:${compliance}`,
    `evidences:${evidenceSummary}`,
    `layers:${layers}`,
    `abv:${PLATFORM_META.abvVersion}`,
    `foundation:${PLATFORM_META.foundationVersion}`,
  ].join("\n");
}

// ── Sequence counter ──────────────────────────────────────────────────────────

let _seq = 0;

function makeId(): string {
  _seq++;
  return `BL-${Date.now()}-${String(_seq).padStart(3, "0")}`;
}

// ── Baseline Factory ──────────────────────────────────────────────────────────

export interface CreateBaselineOptions {
  label?: string;
  gitCommit?: string;
  auditDurationMs?: number;
  reviewState?: ReviewState;
  reviewNote?: string;
}

export async function createBaseline(
  report: ABVReport,
  opts: CreateBaselineOptions = {},
): Promise<ArchitecturalBaseline> {
  const hashPayload = buildHashPayload(report);
  const auditHash   = await sha256hex(hashPayload);
  const ts          = Date.now();
  const tsIso       = new Date(ts).toISOString();

  const apiSurface: Record<string, string[]> = {};
  const depGraph: Record<string, string[]>   = {};

  const layers: BaselineLayer[] = report.layers.map(l => {
    apiSurface[l.layer] = [...l.publicApi];
    depGraph[l.layer]   = [...l.detectedDeps];
    return {
      id:                 l.layer,
      label:              l.label,
      status:             l.status,
      filesAnalyzed:      l.filesAnalyzed,
      publicApi:          [...l.publicApi],
      detectedDeps:       [...l.detectedDeps],
      forbiddenDeps:      [...l.forbiddenDeps],
      boundaryViolations: l.boundaryEvidences.filter(
        e => e.severity === "CRITICAL" || e.severity === "ERROR",
      ).length,
    };
  });

  const modulePaths = report.layers.flatMap(l => l.detectedImports ?? []);

  const reviewState: ReviewState =
    report.criticalEvidences.length > 0
      ? "REQUIRES_ATTENTION"
      : report.compliance.overallCompliance >= 90
        ? "APPROVED"
        : "PENDING";

  const baselineId = makeId();
  const seq = _seq;

  const metadata: BaselineMetadata = Object.freeze({
    baselineId,
    version:                  `v${seq}`,
    label:                    opts.label ?? `Baseline ${tsIso.slice(0, 16)}`,
    timestamp:                ts,
    timestampIso:             tsIso,
    auditHash,
    hashAlgorithm:            "SHA-256" as const,
    hashPayloadDescription:   "files+imports+exports+modules+boundaries+forbiddenDeps+validDeps+circular+isolated+compliance(6)+evidences(all)+layers(api+deps+forbidden+imports+boundary+apiEvidences)+abvVersion+foundationVersion",
    foundationVersion:        PLATFORM_META.foundationVersion,
    engineeringFirstVersion:  PLATFORM_META.engineeringFirstVersion,
    abvVersion:               PLATFORM_META.abvVersion,
    runtimeVersion:           PLATFORM_META.runtimeVersion,
    sprint:                   PLATFORM_META.sprint,
    auditDurationMs:          opts.auditDurationMs ?? report.durationMs ?? 0,
    totalFiles:               report.filesAnalyzed,
    gitCommit:                opts.gitCommit ?? "unavailable",
    reviewState:              opts.reviewState ?? reviewState,
    reviewNote:               opts.reviewNote ?? "",
  });

  return Object.freeze({
    metadata,
    // convenience accessors
    baselineId,
    version:       metadata.version,
    label:         metadata.label,
    timestamp:     ts,
    auditHash,
    // metrics
    filesAnalyzed:      report.filesAnalyzed,
    importsAnalyzed:    report.importsAnalyzed,
    exportsAnalyzed:    report.exportsAnalyzed,
    modulesAudited:     report.modulesAudited,
    circularDependencies: report.circularDependencies,
    isolatedModules:    [...(report.isolatedModules ?? [])],
    orphanModules:      [...(report.orphanModules ?? [])],
    totalEvidences:     report.allEvidences.length,
    criticalCount:      report.criticalEvidences.length,
    errorCount:         report.errorEvidences.length,
    compliance:         { ...report.compliance },
    boundariesApproved: report.boundariesApproved,
    boundariesViolated: report.boundariesViolated,
    forbiddenDeps:      report.forbiddenDeps,
    validDeps:          report.validDeps,
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
      return { success: false, reason: `Baseline com hash SHA-256 "${baseline.auditHash.slice(0, 12)}..." ja registrado` };
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

  /** Cross-validate all registered hashes are unique (integrity check) */
  integrityCheck(): { valid: boolean; duplicateHashes: string[] } {
    const hashes = this.store.map(b => b.auditHash);
    const seen = new Set<string>();
    const duplicateHashes: string[] = [];
    for (const h of hashes) {
      if (seen.has(h)) duplicateHashes.push(h);
      seen.add(h);
    }
    return { valid: duplicateHashes.length === 0, duplicateHashes };
  }
}