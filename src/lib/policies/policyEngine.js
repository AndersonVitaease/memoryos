/**
 * PolicyEngine — EF-35 Production Implementation
 * Foundation v1.0 · Engineering First · 2026-07-13
 *
 * Replaces stub with real authorization pipeline:
 *   - Rule-based decisions per connector, operation, user, session, permissions
 *   - ALLOW / DENY with structured reason
 *   - Full audit log of every decision
 */

// ── Decision Log ──────────────────────────────────────────────────────────────

const _decisionLog = [];

function logDecision(decision) {
  _decisionLog.push({
    id: `pol_${Date.now()}_${(_decisionLog.length + 1).toString(36)}`,
    timestamp: Date.now(),
    ...decision,
  });
}

// ── Policy Rules ──────────────────────────────────────────────────────────────
// Rules are evaluated in order; first match wins.
// Each rule: { id, match(req), allow, reason }

const POLICY_RULES = [
  // ── DENY: system/internal connectors cannot be called by anonymous users
  {
    id: "rule-001",
    description: "Deny anonymous users from executing sensitive operations",
    match(req) {
      const sensitiveOps = ["auth.me", "auth.validate", "projects.list", "sessions.list"];
      return (
        req.context.userId === "anonymous" &&
        sensitiveOps.includes(req.operation)
      );
    },
    allow: false,
    reason: "Anonymous users may not execute authenticated operations",
  },

  // ── DENY: unknown connectors are rejected
  {
    id: "rule-002",
    description: "Deny operations on unrecognized connectors",
    match(req) {
      const knownConnectors = ["base44", "github", "mock", "hello"];
      return !knownConnectors.includes(req.connectorId);
    },
    allow: false,
    reason: "Connector not recognized by Policy Engine",
  },

  // ── DENY: destructive operations blocked in read-only mode
  {
    id: "rule-003",
    description: "Block write/delete operations on read-only connectors",
    match(req) {
      const readOnlyConnectors = ["base44", "github"];
      const writeOps = ["delete", "destroy", "drop", "write.force", "admin.reset"];
      return (
        readOnlyConnectors.includes(req.connectorId) &&
        writeOps.some(op => req.operation.includes(op))
      );
    },
    allow: false,
    reason: "Write/destructive operations are blocked — connectors are read-only in this runtime",
  },

  // ── DENY: GitHub write operations without explicit permission
  {
    id: "rule-004",
    description: "Block GitHub write operations without explicit permission flag",
    match(req) {
      const githubWriteOps = ["repos.create", "repos.delete", "branches.create", "commits.push", "prs.merge"];
      return (
        req.connectorId === "github" &&
        githubWriteOps.includes(req.operation) &&
        !req.context.identityContext?.githubWritePermission
      );
    },
    allow: false,
    reason: "GitHub write operation requires explicit identityContext.githubWritePermission",
  },

  // ── DENY: per-session rate limit exceeded (>200 executions per session)
  {
    id: "rule-005",
    description: "Deny when session execution count exceeds safe limit",
    match(req) {
      const sessionCount = _sessionCounts.get(req.context.sessionId) ?? 0;
      return sessionCount > 200;
    },
    allow: false,
    reason: "Session execution limit exceeded (>200). Start a new session.",
  },

  // ── ALLOW: pipeline validator (trusted system context)
  {
    id: "rule-100",
    description: "Allow pipeline validation system user unconditionally",
    match(req) {
      return req.context.userId === "pipeline-validator";
    },
    allow: true,
    reason: "Pipeline validator is a trusted system context",
  },

  // ── ALLOW: authenticated users on known connectors — default allow
  {
    id: "rule-999",
    description: "Default allow for authenticated users on recognized connectors",
    match(req) {
      const knownConnectors = ["base44", "github", "mock", "hello"];
      return (
        typeof req.context.userId === "string" &&
        req.context.userId.length > 0 &&
        knownConnectors.includes(req.connectorId)
      );
    },
    allow: true,
    reason: "Authenticated user allowed on recognized connector",
  },
];

// ── Session execution counter ─────────────────────────────────────────────────

const _sessionCounts = new Map();

function incrementSessionCount(sessionId) {
  _sessionCounts.set(sessionId, (_sessionCounts.get(sessionId) ?? 0) + 1);
}

// ── PolicyEngine ──────────────────────────────────────────────────────────────

export const PolicyEngine = {
  id: "policy-engine",
  name: "Policy Engine",
  version: "2.0.0",

  /**
   * Authorize a connector execution request.
   * Returns { allow: boolean, reason: string, ruleId: string, decisionId: string }
   */
  async authorize(request) {
    const { connectorId, operation, context } = request;
    const sessionId = context?.sessionId ?? "unknown";
    const userId = context?.userId ?? "anonymous";

    // Evaluate rules in order
    for (const rule of POLICY_RULES) {
      let matched = false;
      try { matched = rule.match(request); } catch { matched = false; }

      if (matched) {
        const decision = {
          allow: rule.allow,
          reason: rule.reason,
          ruleId: rule.id,
          connectorId,
          operation,
          userId,
          sessionId,
        };
        logDecision(decision);
        if (rule.allow) incrementSessionCount(sessionId);
        return {
          allow: rule.allow,
          reason: rule.reason,
          ruleId: rule.id,
          decisionId: _decisionLog[_decisionLog.length - 1]?.id,
        };
      }
    }

    // No rule matched — deny by default (fail-closed)
    const fallback = {
      allow: false,
      reason: "No matching policy rule found — default deny (fail-closed)",
      ruleId: "default-deny",
      connectorId,
      operation,
      userId,
      sessionId,
    };
    logDecision(fallback);
    return {
      allow: false,
      reason: fallback.reason,
      ruleId: "default-deny",
      decisionId: _decisionLog[_decisionLog.length - 1]?.id,
    };
  },

  /** Returns a copy of all authorization decisions logged this session */
  getDecisionLog() {
    return [..._decisionLog];
  },

  /** Returns policy rule definitions (for audit/diagnostics) */
  getRules() {
    return POLICY_RULES.map(r => ({ id: r.id, description: r.description, allow: r.allow }));
  },

  /** Clear session counters (for testing) */
  resetSessionCounters() {
    _sessionCounts.clear();
  },
};

export default PolicyEngine;