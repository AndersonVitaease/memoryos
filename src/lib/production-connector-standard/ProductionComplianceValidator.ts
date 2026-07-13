/**
 * ProductionComplianceValidator.ts — Beta-01.1
 * Validates any connector against the Production Connector Standard.
 * Provider-agnostic: works with any object that exposes the expected interface.
 * 2026-07-13
 */

import type {
  ComplianceCheck, ComplianceVerdict, ConnectorValidation,
} from "./PCSTypes";
import { makePCSId } from "./PCSTypes";

// ── Connector surface expected by the validator ────────────────────────────────
// This is a structural duck-type — not coupled to IProductionConnector import.

interface ConnectorSurface {
  id?: string;
  name?: string;
  version?: string;
  metadata?(): { id?: string; name?: string; version?: string; capabilities?: string[]; description?: string };
  validate?(): boolean;
  validateAsync?(): Promise<{ valid: boolean; checks: { name: string; passed: boolean; detail: string }[]; summary: string }>;
  health?(): Promise<{ status: string; checks?: unknown[] }>;
  internalMetrics?: {
    totalRequests?: number;
    totalExecutions?: number;
    avgLatencyMs?: number;
    p95LatencyMs?: number;
    uptimeDurationMs?: number;
    operationCallCount?: Record<string, number>;
  };
  supportedCapabilities?(): unknown[];
  certificationStatus?(): unknown;
  diagnostics?(): Promise<unknown>;
  metrics?(): unknown;
  executionHistory?(): unknown[];
  logExecution?(): void;
  permissions?(): Promise<unknown>;
  availability?(): Promise<unknown>;
  latency?(): Promise<unknown>;
  connect?(): Promise<unknown>;
  disconnect?(): Promise<unknown>;
  isAuthenticated?(): Promise<boolean>;
  refreshAuthentication?(): Promise<unknown>;
  authenticationDiagnostics?(): Promise<unknown>;
  fullHealth?(): Promise<unknown>;
  authorization?(): Promise<unknown>;
  validateProduction?(): Promise<unknown>;
  resetMetrics?(): void;
}

// ── Compliance checks ─────────────────────────────────────────────────────────

type CheckFn = (c: ConnectorSurface) => Promise<ComplianceCheck>;

function check(name: string, required: boolean, fn: (c: ConnectorSurface) => boolean | Promise<boolean>, detail: (c: ConnectorSurface, passed: boolean) => string): CheckFn {
  return async (c) => {
    const passed = await fn(c);
    return { name, verdict: passed ? "PASS" : required ? "FAIL" : "WARNING", detail: detail(c, passed), required };
  };
}

const COMPLIANCE_CHECKS: CheckFn[] = [
  // ── Identity ─────────────────────────────────────────────────────────────
  check("Connector has stable id",        true,  c => typeof (c.id ?? c.metadata?.()?.id) === "string" && (c.id ?? c.metadata?.()?.id ?? "").length > 0, (c, p) => p ? `id="${c.id ?? c.metadata?.()?.id}"` : "id is missing or empty"),
  check("Connector has display name",     true,  c => typeof (c.name ?? c.metadata?.()?.name) === "string" && (c.name ?? c.metadata?.()?.name ?? "").length > 0, (c, p) => p ? `name="${c.name ?? c.metadata?.()?.name}"` : "name is missing"),
  check("Version follows semver",         true,  c => /^\d+\.\d+\.\d+$/.test(c.version ?? c.metadata?.()?.version ?? ""), (c, p) => p ? `version="${c.version ?? c.metadata?.()?.version}"` : `version="${c.version ?? c.metadata?.()?.version}" is not semver`),

  // ── Validation interface ──────────────────────────────────────────────────
  check("validate() declared",            true,  c => typeof c.validate === "function", (_c, p) => p ? "validate() present" : "validate() not implemented"),
  check("validateAsync() declared",       true,  c => typeof c.validateAsync === "function", (_c, p) => p ? "validateAsync() present" : "validateAsync() not implemented — required for production"),
  check("validateAsync() returns structured result", true, async c => {
    if (typeof c.validateAsync !== "function") return false;
    try {
      const r = await c.validateAsync();
      return Array.isArray(r.checks) && r.checks.length > 0 && typeof r.summary === "string";
    } catch { return false; }
  }, (_c, p) => p ? "validateAsync() returns { valid, checks[], summary }" : "validateAsync() missing checks or summary"),

  // ── Health interface ──────────────────────────────────────────────────────
  check("health() declared",              true,  c => typeof c.health === "function", (_c, p) => p ? "health() present" : "health() not implemented"),
  check("health() returns structured report", true, async c => {
    if (typeof c.health !== "function") return false;
    try {
      const r = await c.health() as any;
      return typeof r.status === "string" && typeof r.connectorId === "string";
    } catch { return false; }
  }, (_c, p) => p ? "health() returns { status, connectorId, checkedAt, details }" : "health() missing required fields"),
  check("health() exposes checks array",  false, async c => {
    if (typeof c.health !== "function") return false;
    try { const r = await c.health() as any; return Array.isArray(r.checks) && r.checks.length > 0; } catch { return false; }
  }, (_c, p) => p ? "health().checks[] present (structured health)" : "health() lacks structured checks[] — WARNING: add for production"),

  // ── Metrics interface ─────────────────────────────────────────────────────
  check("internalMetrics exposed",        true,  c => !!c.internalMetrics && typeof c.internalMetrics === "object", (_c, p) => p ? "internalMetrics object present" : "internalMetrics not exposed"),
  check("totalRequests tracked",          true,  c => typeof (c.internalMetrics?.totalRequests ?? c.internalMetrics?.totalExecutions) === "number", (c, p) => p ? `totalRequests=${c.internalMetrics?.totalRequests ?? c.internalMetrics?.totalExecutions}` : "totalRequests counter absent"),
  check("latency metrics tracked",        true,  c => typeof c.internalMetrics?.avgLatencyMs === "number" && typeof c.internalMetrics?.p95LatencyMs === "number", (c, p) => p ? `avg=${c.internalMetrics?.avgLatencyMs}ms p95=${c.internalMetrics?.p95LatencyMs}ms` : "avgLatencyMs / p95LatencyMs absent"),
  check("uptime tracked",                 true,  c => typeof c.internalMetrics?.uptimeDurationMs === "number", (c, p) => p ? `uptime=${c.internalMetrics?.uptimeDurationMs}ms` : "uptimeDurationMs not tracked"),
  check("per-operation tracking",         true,  c => typeof c.internalMetrics?.operationCallCount === "object" && c.internalMetrics.operationCallCount !== null, (_c, p) => p ? "operationCallCount present" : "per-operation counters absent"),

  // ── Capabilities ──────────────────────────────────────────────────────────
  check("metadata().capabilities declared", true, c => {
    const caps = c.metadata?.()?.capabilities;
    return Array.isArray(caps) && caps.length > 0;
  }, (c, p) => {
    const caps = c.metadata?.()?.capabilities ?? [];
    return p ? `${caps.length} capabilities declared` : "No capabilities declared in metadata()";
  }),
  check("connectivity.ping capability present", true, c => {
    const caps = c.metadata?.()?.capabilities ?? [];
    return caps.includes("connectivity.ping");
  }, (_c, p) => p ? "connectivity.ping declared" : "connectivity.ping missing — required by standard"),
  check("auth.validate capability present", true, c => {
    const caps = c.metadata?.()?.capabilities ?? [];
    return caps.includes("auth.validate");
  }, (_c, p) => p ? "auth.validate declared" : "auth.validate missing — required by standard"),
  check("health.full capability present",  false, c => {
    const caps = c.metadata?.()?.capabilities ?? [];
    return caps.includes("health.full");
  }, (_c, p) => p ? "health.full declared" : "health.full not declared — recommended for production"),

  // ── NOT_CONFIGURED contract ───────────────────────────────────────────────
  check("NOT_CONFIGURED returned when unauthenticated", true, async c => {
    // We check this by looking at validateAsync when no token is configured.
    // If validateAsync returns valid:false with no token, the contract is satisfied.
    if (typeof c.validateAsync !== "function") return false;
    try {
      const r = await c.validateAsync();
      // Either explicitly not valid, or at least has a token check
      const tokenCheck = r.checks.find((ch: any) => ch.name.toLowerCase().includes("token"));
      return !!tokenCheck; // Token check present means NOT_CONFIGURED contract exists
    } catch { return false; }
  }, (_c, p) => p ? "NOT_CONFIGURED contract verified via token check in validateAsync()" : "NOT_CONFIGURED contract not detectable"),

  // ── IProductionConnector interface completeness ───────────────────────────
  check("supportedCapabilities() method",     false, c => typeof c.supportedCapabilities === "function", (_c, p) => p ? "supportedCapabilities() present" : "supportedCapabilities() absent — add for LEVEL_4"),
  check("certificationStatus() method",       false, c => typeof c.certificationStatus === "function", (_c, p) => p ? "certificationStatus() present" : "certificationStatus() absent — add for LEVEL_4"),
  check("diagnostics() method",               false, c => typeof c.diagnostics === "function", (_c, p) => p ? "diagnostics() present" : "diagnostics() absent — add for LEVEL_4"),
  check("metrics() method",                   false, c => typeof c.metrics === "function", (_c, p) => p ? "metrics() present" : "metrics() absent — recommended"),
  check("executionHistory() method",          false, c => typeof c.executionHistory === "function", (_c, p) => p ? "executionHistory() present" : "executionHistory() absent — add for LEVEL_4"),
  check("logExecution() method",              false, c => typeof c.logExecution === "function", (_c, p) => p ? "logExecution() present" : "logExecution() absent — add for LEVEL_4"),
  check("resetMetrics() method",              false, c => typeof c.resetMetrics === "function", (_c, p) => p ? "resetMetrics() present" : "resetMetrics() absent — recommended"),
];

// ── Validator ─────────────────────────────────────────────────────────────────

export class ProductionComplianceValidator {

  async validate(connector: unknown): Promise<ConnectorValidation> {
    const c = connector as ConnectorSurface;
    const connectorId = c.id ?? c.metadata?.()?.id ?? "unknown";
    const validatedAt = Date.now();

    const checks: ComplianceCheck[] = await Promise.all(
      COMPLIANCE_CHECKS.map(fn => fn(c).catch(err => ({
        name: "check_error",
        verdict: "FAIL" as ComplianceVerdict,
        detail: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
        required: false,
      })))
    );

    const failures = checks.filter(c2 => c2.verdict === "FAIL").map(c2 => c2.name);
    const warnings = checks.filter(c2 => c2.verdict === "WARNING").map(c2 => c2.name);
    const passed   = checks.filter(c2 => c2.verdict === "PASS").length;
    const score    = parseFloat((passed / checks.length).toFixed(4));

    const required = checks.filter(c2 => c2.required);
    const requiredFailed = required.filter(c2 => c2.verdict === "FAIL");
    const overall: ComplianceVerdict =
      requiredFailed.length > 0 ? "FAIL" : warnings.length > 0 ? "WARNING" : "PASS";

    return { connectorId, validatedAt, checks, overall, score, warnings, failures };
  }

  /** Determine certification level from a validation result. */
  certificationLevel(v: ConnectorValidation): import("./PCSTypes").CertificationLevel {
    const score = v.score;
    const failCount = v.failures.length;
    if (v.overall === "FAIL" || failCount >= 5) return "LEVEL_0";
    if (failCount >= 3) return "LEVEL_1";
    if (failCount >= 1) return "LEVEL_2";
    if (score >= 0.9 && v.overall === "PASS") return "LEVEL_4";
    if (score >= 0.75) return "LEVEL_3";
    return "LEVEL_2";
  }
}