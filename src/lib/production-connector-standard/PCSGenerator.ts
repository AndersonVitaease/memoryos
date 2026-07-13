/**
 * PCSGenerator.ts — Production Connector Specification Generator
 * Beta-01.1 · MemoryOS PCS v1.0 · 2026-07-13
 *
 * Automatically generates a ProductionConnectorSpec from any connector.
 * Provider-agnostic.
 */

import type {
  ProductionConnectorSpec, ConnectorCapability, ConnectorCertification,
  ConnectorHealth, ConnectorMetrics, ConnectorPermissions,
  ConnectorDiagnostics, DiagnosticEntry, CertificationLevel,
  CapabilityType,
} from "./PCSTypes";
import { CERTIFICATION_LABELS, makePCSId } from "./PCSTypes";
import { ProductionComplianceValidator } from "./ProductionComplianceValidator";

// ── Capability classifier ──────────────────────────────────────────────────────

const OP_TYPE_MAP: Record<string, CapabilityType> = {
  list: "LIST", get: "READ", read: "READ", search: "SEARCH",
  create: "CREATE", update: "UPDATE", delete: "DELETE",
  write: "WRITE", stream: "STREAM", sync: "SYNC", event: "EVENT",
  ping: "READ", validate: "READ", user: "READ", full: "READ",
  permissions: "READ", stats: "READ", languages: "READ", health: "READ",
  branches: "LIST", commits: "LIST", files: "LIST", repos: "LIST",
  default: "READ", protected: "READ",
};

function classifyOperation(opId: string): CapabilityType {
  const parts = opId.split(".");
  for (const part of [...parts].reverse()) {
    if (OP_TYPE_MAP[part.toLowerCase()]) return OP_TYPE_MAP[part.toLowerCase()];
  }
  return "READ";
}

function buildCapabilities(rawCaps: string[]): ConnectorCapability[] {
  return rawCaps.map(id => ({
    id,
    type: classifyOperation(id),
    description: `${id.replace(/\./g, " — ")}`,
    requiredAuth: !id.includes("ping"),
    readOnly: !["create","update","delete","write","sync"].some(w => id.toLowerCase().includes(w)),
    paginated: ["list","commits","files","repos"].some(w => id.toLowerCase().includes(w)),
  }));
}

// ── Snapshot helpers ───────────────────────────────────────────────────────────

type ConnectorSurface = any;

async function snapshotHealth(c: ConnectorSurface): Promise<ConnectorHealth> {
  try {
    const h = await c.health();
    return {
      status: h.status ?? "unhealthy",
      connectorId: h.connectorId ?? c.id ?? "unknown",
      checkedAt: h.checkedAt ?? Date.now(),
      checks: Array.isArray(h.checks) ? h.checks : [],
      overallLatencyMs: h.latencyMs ?? 0,
      details: h.details ?? "",
    };
  } catch {
    return { status: "unhealthy", connectorId: c.id ?? "unknown", checkedAt: Date.now(), checks: [], overallLatencyMs: 0, details: "health() threw" };
  }
}

function snapshotMetrics(c: ConnectorSurface): ConnectorMetrics {
  const m = c.internalMetrics ?? {};
  const allMs: number[] = m.latencyAllMs ?? [];
  const min = allMs.length > 0 ? Math.min(...allMs) : 0;
  const max = allMs.length > 0 ? Math.max(...allMs) : 0;
  return {
    connectorId: c.id ?? c.metadata?.()?.id ?? "unknown",
    totalRequests:      m.totalRequests      ?? m.totalExecutions ?? 0,
    successRequests:    m.successRequests    ?? 0,
    failedRequests:     m.failedRequests     ?? m.externalFailures ?? 0,
    deniedRequests:     m.deniedRequests     ?? m.authFailures ?? 0,
    retries:            m.retries            ?? 0,
    latency: {
      avgMs:    m.avgLatencyMs ?? 0,
      p95Ms:    m.p95LatencyMs ?? 0,
      minMs:    min,
      maxMs:    max,
      samples:  allMs.length,
    },
    rateLimitRemaining: m.rateLimitRemaining ?? null,
    rateLimitLimit:     m.rateLimitLimit     ?? null,
    rateLimitUsagePct:  m.rateLimitUsagePct  ?? null,
    uptimeDurationMs:   m.uptimeDurationMs   ?? 0,
    perOperation:       m.operationCallCount ?? {},
  };
}

async function snapshotPermissions(c: ConnectorSurface): Promise<ConnectorPermissions> {
  const id = c.id ?? c.metadata?.()?.id ?? "unknown";
  try {
    if (typeof c.permissions === "function") {
      return await c.permissions();
    }
    // Build from internalMetrics for connectors that don't yet expose permissions()
    return {
      connectorId: id,
      authenticated: !!(c.authenticatedUser ?? false),
      principal: (c as any).authenticatedUser?.login ?? null,
      scopes: [],
      missingRequired: [],
      recommendations: ["Implement permissions() for LEVEL_4 compliance"],
      diagnostic: "permissions() not yet implemented — structural inference only",
    };
  } catch {
    return { connectorId: id, authenticated: false, principal: null, scopes: [], missingRequired: [], recommendations: [], diagnostic: "permissions() threw" };
  }
}

function buildDiagnostics(c: ConnectorSurface, validation: import("./PCSTypes").ConnectorValidation, health: ConnectorHealth): ConnectorDiagnostics {
  const id = c.id ?? c.metadata?.()?.id ?? "unknown";
  const meta = c.metadata?.() ?? {};
  const m = c.internalMetrics ?? {};

  const entry = (key: string, value: string, status: DiagnosticEntry["status"]): DiagnosticEntry => ({ key, value, status });

  const authEntries: DiagnosticEntry[] = [
    entry("configured", m.authFailures === 0 && m.totalRequests > 0 ? "yes" : "unknown", m.authFailures === 0 ? "ok" : "warning"),
    entry("authFailures", String(m.authFailures ?? m.deniedRequests ?? 0), (m.authFailures ?? 0) > 0 ? "warning" : "ok"),
  ];

  const healthEntries: DiagnosticEntry[] = [
    entry("status",      health.status,                  health.status === "healthy" ? "ok" : health.status === "degraded" ? "warning" : "error"),
    entry("latencyMs",   String(health.overallLatencyMs), health.overallLatencyMs < 300 ? "ok" : "warning"),
    entry("checks",      String(health.checks.length),   health.checks.length >= 4 ? "ok" : "warning"),
  ];

  const metricsEntries: DiagnosticEntry[] = [
    entry("totalRequests", String(m.totalRequests ?? 0),  "info"),
    entry("avgLatencyMs",  String(m.avgLatencyMs ?? 0),   m.avgLatencyMs < 500 ? "ok" : "warning"),
    entry("p95LatencyMs",  String(m.p95LatencyMs ?? 0),   m.p95LatencyMs < 1000 ? "ok" : "warning"),
    entry("uptime",        `${m.uptimeDurationMs ?? 0}ms`, "info"),
  ];

  const caps = meta.capabilities ?? [];
  const capEntries: DiagnosticEntry[] = [
    entry("count",              String(caps.length),                   caps.length >= 5 ? "ok" : "warning"),
    entry("connectivity.ping",  caps.includes("connectivity.ping") ? "yes" : "no", caps.includes("connectivity.ping") ? "ok" : "error"),
    entry("auth.validate",      caps.includes("auth.validate")     ? "yes" : "no", caps.includes("auth.validate")     ? "ok" : "error"),
  ];

  const failures = validation.failures;
  const errorEntries: DiagnosticEntry[] = failures.map(f => entry(f, "FAIL", "error"));

  const failCount  = failures.length;
  const warnCount  = validation.warnings.length;
  const summary = `Compliance ${(validation.score * 100).toFixed(0)}% · ${failCount} fail · ${warnCount} warn · ${health.status} · ${caps.length} capabilities`;

  return { connectorId: id, generatedAt: Date.now(), authentication: authEntries, health: healthEntries, metrics: metricsEntries, capabilities: capEntries, errors: errorEntries, summary };
}

// ── PCS Generator ─────────────────────────────────────────────────────────────

export class PCSGenerator {
  private validator = new ProductionComplianceValidator();

  async generate(connector: unknown): Promise<ProductionConnectorSpec> {
    const c = connector as ConnectorSurface;
    const meta   = c.metadata?.() ?? {};
    const connectorId      = c.id ?? meta.id ?? "unknown";
    const connectorName    = c.name ?? meta.name ?? connectorId;
    const connectorVersion = c.version ?? meta.version ?? "0.0.0";
    const description      = meta.description ?? "";
    const author           = meta.author ?? "MemoryOS";

    const [validation, health] = await Promise.all([
      this.validator.validate(c),
      snapshotHealth(c),
    ]);

    const [metrics, permissions] = await Promise.all([
      Promise.resolve(snapshotMetrics(c)),
      snapshotPermissions(c),
    ]);

    const rawCaps   = meta.capabilities ?? [];
    const capabilities = buildCapabilities(rawCaps);
    const certLevel: CertificationLevel = this.validator.certificationLevel(validation);

    const certification: ConnectorCertification = {
      level:       certLevel,
      label:       CERTIFICATION_LABELS[certLevel],
      certifiedAt: Date.now(),
      certifiedBy: "ProductionComplianceValidator v1.0",
      validUntil:  null,
      notes:       validation.overall === "PASS" ? ["Meets all required compliance checks"] : validation.warnings.slice(0, 3),
    };

    const diagnostics = buildDiagnostics(c, validation, health);

    const technicalDebt: string[] = [];
    if (!rawCaps.includes("health.full")) technicalDebt.push("Expose health.full capability");
    if (typeof c.supportedCapabilities !== "function") technicalDebt.push("Implement supportedCapabilities()");
    if (typeof c.certificationStatus !== "function")   technicalDebt.push("Implement certificationStatus()");
    if (typeof c.diagnostics !== "function")           technicalDebt.push("Implement diagnostics()");
    if (typeof c.executionHistory !== "function")      technicalDebt.push("Implement executionHistory()");
    if (typeof c.logExecution !== "function")          technicalDebt.push("Implement logExecution()");
    if (typeof c.resetMetrics !== "function")          technicalDebt.push("Implement resetMetrics()");

    const recommendations: string[] = [
      ...validation.failures.map(f => `Fix required check: ${f}`),
      ...validation.warnings.map(w => `Address warning: ${w}`),
      ...(certLevel !== "LEVEL_4" ? [`Reach LEVEL_4 by resolving: ${technicalDebt.slice(0, 3).join(", ")}`] : []),
    ].slice(0, 8);

    return Object.freeze({
      specVersion:       "1.0",
      generatedAt:       Date.now(),
      connectorId,
      connectorName,
      connectorVersion,
      description,
      author,
      capabilities,
      certificationLevel: certLevel,
      certification,
      validation,
      health,
      metrics,
      permissions,
      diagnostics,
      technicalDebt,
      recommendations,
      complianceScore:       validation.score,
      isReferenceConnector:  certLevel === "LEVEL_4" && connectorId === "github",
    } as ProductionConnectorSpec);
  }
}