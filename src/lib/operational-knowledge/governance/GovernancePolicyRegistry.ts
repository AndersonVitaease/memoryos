/**
 * GovernancePolicyRegistry.ts
 * Stores all governance policies — append-only, versioned, activatable.
 *
 * Authority: ENGINEERING
 * SRP: Storage only — no evaluation, no decision logic.
 * Sprint: KB-05
 *
 * Nothing is deleted. Status transitions only.
 */

import type { GovernancePolicy, PolicyStatus, PolicyScope } from "./GovernancePolicyTypes";

function nowIso(): string { return new Date().toISOString().split("T")[0]; }

// ── Built-in default policies ──────────────────────────────────────────────────

const DEFAULT_POLICIES: GovernancePolicy[] = [
  {
    id:          "GP-001",
    name:        "Auto-Approval Policy",
    description: "Auto-approve high-quality evidence with strong confidence.",
    version:     "1.0",
    scope:       "GLOBAL",
    status:      "ACTIVE",
    priority:    "P0",
    createdAt:   nowIso(),
    updatedAt:   nowIso(),
    rules: [
      {
        id:          "GR-001",
        name:        "High Evidence Auto-Approve",
        description: "Evidence score >= 80 AND confidence >= 0.75 → auto-approve",
        conditions:  [
          { field: "evidenceScore", operator: "GTE", value: 80 },
          { field: "confidence",    operator: "GTE", value: 0.75 },
        ],
        decision:    "APPROVE",
        priority:    "P0",
        enabled:     true,
        reason:      "Evidence score >= 80 and confidence >= 75% qualify for automatic approval",
      },
      {
        id:          "GR-002",
        name:        "Best Practice Auto-Promote",
        description: "Best practices with evidence >= 65 auto-approve",
        conditions:  [
          { field: "isBestPractice", operator: "EQ",  value: true },
          { field: "evidenceScore",  operator: "GTE", value: 65 },
        ],
        decision:    "APPROVE",
        priority:    "P0",
        enabled:     true,
        reason:      "Best practices with sufficient evidence qualify for automatic approval",
      },
    ],
  },
  {
    id:          "GP-002",
    name:        "Engineering Review Policy",
    description: "Route medium-quality knowledge to engineering review.",
    version:     "1.0",
    scope:       "GLOBAL",
    status:      "ACTIVE",
    priority:    "P1",
    createdAt:   nowIso(),
    updatedAt:   nowIso(),
    rules: [
      {
        id:          "GR-003",
        name:        "Known Issue Engineering Review",
        description: "Known issues always require engineering review",
        conditions:  [
          { field: "isKnownIssue", operator: "EQ", value: true },
        ],
        decision:    "REQUEST_ENGINEERING",
        priority:    "P1",
        enabled:     true,
        reason:      "Known issues require engineering validation before promotion",
      },
      {
        id:          "GR-004",
        name:        "Medium Evidence Engineering Review",
        description: "Evidence 40–79 routes to engineering",
        conditions:  [
          { field: "evidenceScore", operator: "GTE", value: 40 },
          { field: "evidenceScore", operator: "LT",  value: 80 },
        ],
        decision:    "REQUEST_ENGINEERING",
        priority:    "P1",
        enabled:     true,
        reason:      "Medium evidence score requires engineering review for validation",
      },
    ],
  },
  {
    id:          "GP-003",
    name:        "Specialist Review Policy",
    description: "Route regression and anti-patterns to specialist review.",
    version:     "1.0",
    scope:       "GLOBAL",
    status:      "ACTIVE",
    priority:    "P2",
    createdAt:   nowIso(),
    updatedAt:   nowIso(),
    rules: [
      {
        id:          "GR-005",
        name:        "Regression Specialist Review",
        description: "Any regression count > 0 requires specialist",
        conditions:  [
          { field: "regressionCount", operator: "GT", value: 0 },
        ],
        decision:    "REQUEST_SPECIALIST",
        priority:    "P2",
        enabled:     true,
        reason:      "Regression history requires specialist analysis",
      },
      {
        id:          "GR-006",
        name:        "Anti-Pattern Specialist Review",
        description: "Anti-patterns require specialist review",
        conditions:  [
          { field: "isAntiPattern", operator: "EQ", value: true },
        ],
        decision:    "REQUEST_SPECIALIST",
        priority:    "P2",
        enabled:     true,
        reason:      "Anti-patterns must be validated by a specialist before promotion",
      },
    ],
  },
  {
    id:          "GP-004",
    name:        "Critical Escalation Policy",
    description: "Critical priority and duplicates trigger final review or escalation.",
    version:     "1.0",
    scope:       "GLOBAL",
    status:      "ACTIVE",
    priority:    "P3",
    createdAt:   nowIso(),
    updatedAt:   nowIso(),
    rules: [
      {
        id:          "GR-007",
        name:        "Critical Priority Final Review",
        description: "CRITICAL priority → final review required",
        conditions:  [
          { field: "priority", operator: "EQ", value: "CRITICAL" },
        ],
        decision:    "REQUEST_FINAL",
        priority:    "P3",
        enabled:     true,
        reason:      "Critical priority knowledge requires final human approval",
      },
      {
        id:          "GR-008",
        name:        "Duplicate Merge",
        description: "Duplicates detected → merge",
        conditions:  [
          { field: "duplicatesCount", operator: "GT", value: 0 },
        ],
        decision:    "MERGE",
        priority:    "P3",
        enabled:     true,
        reason:      "Duplicate knowledge must be merged rather than independently promoted",
      },
    ],
  },
  {
    id:          "GP-005",
    name:        "Reject & Archive Policy",
    description: "Reject low-quality or archive stale knowledge.",
    version:     "1.0",
    scope:       "GLOBAL",
    status:      "ACTIVE",
    priority:    "P4",
    createdAt:   nowIso(),
    updatedAt:   nowIso(),
    rules: [
      {
        id:          "GR-009",
        name:        "Low Evidence Reject",
        description: "Evidence score < 20 → reject",
        conditions:  [
          { field: "evidenceScore", operator: "LT", value: 20 },
        ],
        decision:    "REJECT",
        priority:    "P4",
        enabled:     true,
        reason:      "Insufficient evidence quality — knowledge rejected",
      },
      {
        id:          "GR-010",
        name:        "High Confidence Skip Specialist",
        description: "Confidence >= 0.95 → escalate upward for fast-track",
        conditions:  [
          { field: "confidence", operator: "GTE", value: 0.95 },
        ],
        decision:    "ESCALATE",
        priority:    "P4",
        enabled:     true,
        reason:      "Very high confidence (>=95%) triggers fast-track escalation",
      },
    ],
  },
];

// ── Registry ──────────────────────────────────────────────────────────────────

const _store: Map<string, GovernancePolicy> = new Map(DEFAULT_POLICIES.map(p => [p.id, p]));
let _counter = DEFAULT_POLICIES.length;

export const GovernancePolicyRegistry = Object.freeze({

  getAll(): GovernancePolicy[] {
    return [..._store.values()];
  },

  getActive(): GovernancePolicy[] {
    return [..._store.values()]
      .filter(p => p.status === "ACTIVE")
      .sort((a, b) => a.priority.localeCompare(b.priority));
  },

  getById(id: string): GovernancePolicy | undefined {
    return _store.get(id);
  },

  getByScope(scope: PolicyScope): GovernancePolicy[] {
    return [..._store.values()].filter(p => p.scope === scope || p.scope === "GLOBAL");
  },

  /**
   * Register a new policy (append-only — never replaces existing).
   */
  register(policy: Omit<GovernancePolicy, "id" | "createdAt" | "updatedAt">): GovernancePolicy {
    _counter++;
    const id  = `GP-${String(_counter).padStart(3, "0")}`;
    const now = nowIso();
    const full: GovernancePolicy = { ...policy, id, createdAt: now, updatedAt: now };
    _store.set(id, full);
    return full;
  },

  /**
   * Activate or deactivate a policy (status transition only, no delete).
   */
  setStatus(id: string, status: PolicyStatus): GovernancePolicy | null {
    const existing = _store.get(id);
    if (!existing) return null;
    const updated = { ...existing, status, updatedAt: nowIso() };
    _store.set(id, updated);
    return updated;
  },

  count(): { active: number; inactive: number; total: number } {
    const all = [..._store.values()];
    return {
      active:   all.filter(p => p.status === "ACTIVE").length,
      inactive: all.filter(p => p.status !== "ACTIVE").length,
      total:    all.length,
    };
  },

  reset(): void { /* intentionally no-op in prod; test environments only */},
});