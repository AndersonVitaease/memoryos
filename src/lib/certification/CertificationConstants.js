/**
 * CertificationConstants — EF-40.3
 * Single source of truth for all certification constants.
 * No React. No side effects. Pure data.
 */

export const STATUS = { PASS: "PASS", FAIL: "FAIL", NOT_EXECUTED: "NOT_EXECUTED" };

export const ALL_PHASES = [
  "TESTS", "ARCHITECTURE", "SOLID", "IMMUTABILITY",
  "PERFORMANCE", "STRUCTURAL", "SOURCE", "AST",
];

export const TOTAL_PHASES = ALL_PHASES.length;
export const MIN_SCORE    = 95;

export const STATUS_COLOR = { PASS: "#22c55e", FAIL: "#ef4444", NOT_EXECUTED: "#f59e0b" };
export const STATUS_BG    = { PASS: "#052e16", FAIL: "#450a0a", NOT_EXECUTED: "#422006" };
export const STATUS_LABEL = { PASS: "PASS",    FAIL: "FAIL",    NOT_EXECUTED: "NOT EXECUTED" };
export const STATUS_ICON  = { PASS: "✓",       FAIL: "✗",       NOT_EXECUTED: "⊘" };

export const CERT_STATUS = {
  CERTIFIED:           "CERTIFIED",
  PARTIALLY_CERTIFIED: "PARTIALLY_CERTIFIED",
  NOT_CERTIFIED:       "NOT_CERTIFIED",
};

export const CERT_CONFIG = {
  CERTIFIED:           { color: "#22c55e", bg: "#052e16", icon: "✓", label: "CERTIFIED" },
  PARTIALLY_CERTIFIED: { color: "#f59e0b", bg: "#422006", icon: "⊘", label: "PARTIALLY CERTIFIED" },
  NOT_CERTIFIED:       { color: "#ef4444", bg: "#450a0a", icon: "✗", label: "NOT CERTIFIED" },
};

export const EVIDENCE_LABEL = {
  PASS:         "RUNTIME VERIFIED",
  FAIL:         "FAILED",
  NOT_EXECUTED: "DOCUMENTED LIMITATION",
};

export const EVIDENCE_COLOR = {
  PASS:         "#22c55e",
  FAIL:         "#ef4444",
  NOT_EXECUTED: "#f59e0b",
};

export const SOURCE_OF_TRUTH = {
  TESTS:        "MemoryStoreTests",
  ARCHITECTURE: "ArchitecturalAuditor",
  SOLID:        "ArchitecturalAuditor / SOLIDAuditor",
  IMMUTABILITY: "ArchitecturalAuditor / ImmutabilityAuditor",
  PERFORMANCE:  "ArchitecturalAuditor / PerformanceBenchmarkEngine",
  STRUCTURAL:   "SourceAuditStructural",
  SOURCE:       "SourceAudit (isolated at /ef393-certification)",
  AST:          "ASTAuditor (isolated at /ef393-certification)",
};

export const CHANGE_COLOR = { IMPROVEMENT: "#22c55e", REGRESSION: "#ef4444", NO_CHANGE: "#52525b" };
export const CHANGE_ICON  = { IMPROVEMENT: "↑", REGRESSION: "↓", NO_CHANGE: "=" };