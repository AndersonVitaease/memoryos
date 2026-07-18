/**
 * GovernancePolicyTypes.ts
 * Type contracts for the Knowledge Governance Policy Engine.
 *
 * Authority: ENGINEERING
 * SRP: Types only — no logic.
 * Sprint: KB-05
 */

// ── Enumerations ──────────────────────────────────────────────────────────────

export type PolicyPriority = "P0" | "P1" | "P2" | "P3" | "P4";

export type PolicyScope =
  | "GLOBAL"
  | "PROJECT"
  | "COMPONENT"
  | "CATEGORY"
  | "SPRINT"
  | "TEAM";

export type PolicyStatus = "ACTIVE" | "INACTIVE" | "DEPRECATED";

export type GovernanceDecisionType =
  | "APPROVE"
  | "REJECT"
  | "REQUEST_ENGINEERING"
  | "REQUEST_SPECIALIST"
  | "REQUEST_FINAL"
  | "MERGE"
  | "ARCHIVE"
  | "ESCALATE";

export type ConditionOperator =
  | "GTE"       // >=
  | "GT"        // >
  | "LTE"       // <=
  | "LT"        // <
  | "EQ"        // ==
  | "NEQ"       // !=
  | "IN"        // value in list
  | "NOT_IN"    // value not in list
  | "CONTAINS"  // string contains
  | "EXISTS"    // field is present/truthy
  | "NOT_EXISTS";

export type ConditionField =
  | "evidenceScore"
  | "confidence"
  | "regressionCount"
  | "occurrences"
  | "approvalCount"
  | "duplicatesCount"
  | "category"
  | "type"
  | "sourceType"
  | "priority"
  | "sprint"
  | "component"
  | "status"
  | "approvalLevel"
  | "isAntiPattern"
  | "isBestPractice"
  | "isKnownIssue"
  | "isLesson";

// ── Condition ─────────────────────────────────────────────────────────────────

export interface GovernanceCondition {
  readonly field:    ConditionField;
  readonly operator: ConditionOperator;
  readonly value:    string | number | boolean | string[];
}

// ── Rule ──────────────────────────────────────────────────────────────────────

export interface GovernanceRule {
  readonly id:          string;            // GR-NNN
  readonly name:        string;
  readonly description: string;
  readonly conditions:  readonly GovernanceCondition[];  // AND logic within a rule
  readonly decision:    GovernanceDecisionType;
  readonly priority:    PolicyPriority;
  readonly enabled:     boolean;
  readonly reason:      string;            // Human-readable explanation
}

// ── Policy ────────────────────────────────────────────────────────────────────

export interface GovernancePolicy {
  readonly id:          string;            // GP-NNN
  readonly name:        string;
  readonly description: string;
  readonly version:     string;
  readonly scope:       PolicyScope;
  readonly status:      PolicyStatus;
  readonly priority:    PolicyPriority;
  readonly rules:       readonly GovernanceRule[];
  readonly createdAt:   string;
  readonly updatedAt:   string;
}

// ── Evaluation Context ────────────────────────────────────────────────────────

export interface GovernanceEvaluationContext {
  readonly captureId:      string;
  readonly reviewId:       string;
  readonly evidenceScore:  number;
  readonly confidence:     number;
  readonly regressionCount:number;
  readonly occurrences:    number;
  readonly approvalCount:  number;
  readonly duplicatesCount:number;
  readonly category:       string;
  readonly type:           string;
  readonly sourceType:     string;
  readonly priority:       string;
  readonly sprint:         string;
  readonly components:     string[];
  readonly isAntiPattern:  boolean;
  readonly isBestPractice: boolean;
  readonly isKnownIssue:   boolean;
  readonly isLesson:       boolean;
  readonly status:         string;
  readonly approvalLevel:  string;
}

// ── Rule Match ────────────────────────────────────────────────────────────────

export interface RuleMatch {
  readonly ruleId:    string;
  readonly ruleName:  string;
  readonly decision:  GovernanceDecisionType;
  readonly priority:  PolicyPriority;
  readonly reason:    string;
  readonly matched:   boolean;
}

// ── Governance Result ─────────────────────────────────────────────────────────

export interface GovernanceResult {
  readonly captureId:       string;
  readonly reviewId:        string;
  readonly finalDecision:   GovernanceDecisionType;
  readonly reviewerLevel:   "AUTO" | "ENGINEERING" | "SPECIALIST" | "FINAL";
  readonly reason:          string;
  readonly confidence:      number;
  readonly matchedRules:    readonly RuleMatch[];
  readonly rejectedRules:   readonly RuleMatch[];
  readonly appliedPolicyId: string;
  readonly timestamp:       string;
}

// ── Governance Audit Entry ────────────────────────────────────────────────────

export interface GovernanceAuditEntry {
  readonly id:            string;          // GAU-NNN
  readonly timestamp:     string;
  readonly captureId:     string;
  readonly reviewId:      string;
  readonly policyId:      string;
  readonly policyVersion: string;
  readonly ruleId:        string;
  readonly ruleName:      string;
  readonly decision:      GovernanceDecisionType;
  readonly reason:        string;
  readonly reviewer:      string;
  readonly evidenceScore: number;
  readonly confidence:    number;
}

// ── Governance Metrics ────────────────────────────────────────────────────────

export interface GovernancePolicyMetrics {
  readonly activePolicies:    number;
  readonly inactivePolicies:  number;
  readonly totalDecisions:    number;
  readonly autoDecisions:     number;
  readonly humanDecisions:    number;
  readonly escalations:       number;
  readonly avgDecisionTimeMs: number;
  readonly approvalRate:      number;
  readonly rejectionRate:     number;
  readonly topPolicies:       Array<{ policyId: string; name: string; hitCount: number }>;
  readonly topRules:          Array<{ ruleId: string; name: string; hitCount: number }>;
}