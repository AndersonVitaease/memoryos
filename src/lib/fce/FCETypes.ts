// Foundation Compliance Engine — Types
// Foundation v1.0 · Engineering First · Sprint FCE-1

export type FCESeverity  = "CRITICAL" | "ERROR" | "WARNING" | "INFO";
export type FCEStatus    = "COMPLIANT" | "VIOLATION" | "PARTIAL" | "UNKNOWN";
export type RuleCategory =
  | "engineering_first"
  | "boundary"
  | "reuse"
  | "contract"
  | "responsibility"
  | "autonomy_policy"
  | "frozen_baseline"
  | "runtime_isolation"
  | "zero_duplication"
  | "principle";

// ── Foundation Rule ───────────────────────────────────────────────────────────

export interface FoundationRule {
  readonly ruleId: string;
  readonly name: string;
  readonly category: RuleCategory;
  readonly sourceDocument: string;
  readonly sourceSection: string;
  readonly description: string;
  readonly severity: FCESeverity;
  /** The exact invariant/principle text from the Foundation document */
  readonly invariantText: string;
}

// ── Compliance Evidence ───────────────────────────────────────────────────────

export interface ComplianceEvidence {
  readonly evidenceId: string;
  readonly ruleId: string;
  readonly sourceDocument: string;
  readonly sourceSection: string;
  readonly severity: FCESeverity;
  readonly status: FCEStatus;
  readonly description: string;
  readonly relatedFiles: string[];
  readonly timestamp: number;
  readonly confidence: number;
  /** Full traceability chain */
  readonly traceability: {
    foundation: string;
    document: string;
    section: string;
    principle: string;
    architecture?: string;
    code?: string;
    conclusion: string;
  };
}

// ── FCE Log Entry ─────────────────────────────────────────────────────────────

export interface FCELogEntry {
  readonly executionId: string;
  readonly ruleId: string;
  readonly document: string;
  readonly status: FCEStatus;
  readonly durationMs: number;
  readonly severity: FCESeverity;
  readonly result: string;
  readonly timestamp: number;
}

// ── FCE Compliance Score ──────────────────────────────────────────────────────

export interface FCEComplianceScore {
  readonly foundationCompliance: number;
  readonly architectureCompliance: number;
  readonly runtimeCompliance: number;
  readonly boundaryCompliance: number;
  readonly contractCompliance: number;
  readonly overallCompliance: number;
}

// ── FCE Report ────────────────────────────────────────────────────────────────

export interface FCEReport {
  readonly executionId: string;
  readonly runAt: number;
  readonly durationMs: number;
  // Documents
  readonly documentsLoaded: string[];
  readonly documentsEvaluated: number;
  // Rules
  readonly rulesTotal: number;
  readonly rulesApproved: number;
  readonly rulesViolated: number;
  readonly rulesPartial: number;
  // Evidence
  readonly evidences: ComplianceEvidence[];
  readonly compliantEvidences: ComplianceEvidence[];
  readonly violationEvidences: ComplianceEvidence[];
  // Scores
  readonly score: FCEComplianceScore;
  // Logs
  readonly logs: FCELogEntry[];
  // ABV integration
  readonly abvFilesAnalyzed: number;
  readonly abvBoundaryCompliance: number;
  readonly abvCircularDeps: number;
  // Conclusion
  readonly conclusion: string;
}