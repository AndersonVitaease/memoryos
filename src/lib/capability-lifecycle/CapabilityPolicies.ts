/**
 * CapabilityPolicies.ts — Engineering Sprint 7.0.2
 * Execution policies per lifecycle state.
 * Pure evaluation — no side effects, no persistence.
 */

import type { CapabilityState, PolicyResult, CapabilityRecord } from "./CapabilityLifecycleTypes";

// ── Policy rules per state ────────────────────────────────────────────────────

export function evaluatePolicy(record: CapabilityRecord, env: "dev" | "prod" = "prod"): PolicyResult {
  const { state, certified, lastCertification } = record;

  // Disabled — always blocked
  if (state === "disabled") {
    return { allowed: false, blocked: true, warning: null, reason: "Capability is disabled and cannot be executed." };
  }

  // Draft — blocked (not ready)
  if (state === "draft") {
    return { allowed: false, blocked: true, warning: null, reason: "Capability is in Draft state — not ready for execution." };
  }

  // Experimental — only in dev
  if (state === "experimental" && env === "prod") {
    return { allowed: false, blocked: true, warning: null, reason: "Experimental capabilities are not allowed in production." };
  }

  // Deprecated — allow with warning
  if (state === "deprecated") {
    return {
      allowed: true,
      blocked: false,
      warning: `Capability "${record.id}" is DEPRECATED (since ${record.deprecatedIn ?? "unknown"}). Migrate to a newer version.`,
      reason:  "Deprecated capabilities may still execute but will be removed.",
    };
  }

  // Production — requires certification
  if (state === "production" || state === "enterprise") {
    if (!certified) {
      return { allowed: false, blocked: true, warning: null, reason: "Production/Enterprise capabilities must be certified before execution." };
    }
    // Check cert freshness — 30 days
    const certAge = lastCertification ? Date.now() - lastCertification : Infinity;
    if (certAge > 30 * 24 * 3600_000) {
      return { allowed: false, blocked: true, warning: null, reason: "Certification expired (>30 days). Re-certify before execution." };
    }
  }

  // Enterprise — additional flag
  if (state === "enterprise") {
    return {
      allowed: true,
      blocked: false,
      warning: "Enterprise capability — ensure license entitlement before calling.",
      reason:  "Enterprise tier: allowed.",
    };
  }

  return { allowed: true, blocked: false, warning: null, reason: `State "${state}" — execution allowed.` };
}

// ── Quality gate ──────────────────────────────────────────────────────────────

export function qualityGate(record: CapabilityRecord): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (record.state === "disabled")              failures.push("Capability is disabled");
  if (record.state === "draft")                 failures.push("Capability is not ready (Draft)");
  if (!record.certified && record.state === "production") failures.push("Not certified for production");
  if (record.successRate !== undefined && record.executionCount > 10) {
    const rate = record.successCount / Math.max(record.executionCount, 1);
    if (rate < 0.9) failures.push(`Success rate ${Math.round(rate * 100)}% below 90% threshold`);
  }
  return { pass: failures.length === 0, failures };
}

// ── Success rate helper ───────────────────────────────────────────────────────

export function computeMetrics(record: CapabilityRecord) {
  const total = record.executionCount;
  return {
    successRate:    total > 0 ? record.successCount / total : 0,
    averageLatency: total > 0 ? Math.round(record.totalLatencyMs / total) : 0,
    p95Latency:     total > 0 ? Math.round((record.totalLatencyMs / total) * 1.4) : 0, // approximation
  };
}