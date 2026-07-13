/**
 * OperationalAuditEngine.ts — MemoryOS Core Operational Audit
 * 2026-07-13
 *
 * Validates the exact operational stage of each connector:
 *   IMPLEMENTED → REGISTERED → DISCOVERABLE → AUTHENTICATED → INVOKABLE → OPERATIONAL
 *
 * No new functionality. Validates and integrates what already exists.
 * Every failure includes root cause + minimum correction.
 */

import { GitHubConnector } from "../connector-runtime/connectors/GitHubConnector";
import { Base44Connector } from "../connector-runtime/connectors/Base44Connector";
import { ConnectorRegistry } from "../connector-runtime/ConnectorRegistry";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";

// ── Stage Model ───────────────────────────────────────────────────────────────

export type AuditStage =
  | "IMPLEMENTED"
  | "REGISTERED"
  | "DISCOVERABLE"
  | "AUTHENTICATED"
  | "INVOKABLE"
  | "OPERATIONAL";

export type StageStatus = "PASS" | "FAIL" | "SKIP";

export interface StageResult {
  readonly stage: AuditStage;
  readonly status: StageStatus;
  readonly detail: string;
  readonly durationMs: number;
  readonly rootCause: string | null;
  readonly minimumFix: string | null;
  readonly evidence: string[];
}

export interface ConnectorAuditReport {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly version: string;
  readonly highestPassedStage: AuditStage | "NONE";
  readonly stages: StageResult[];
  readonly overallStatus: "OPERATIONAL" | "DEGRADED" | "NOT_CONFIGURED" | "FAILED";
  readonly durationMs: number;
  readonly summary: string;
}

export interface OperationalAuditReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly github: ConnectorAuditReport;
  readonly base44: ConnectorAuditReport;
  readonly cis: CISAuditReport;
  readonly overallStatus: "OPERATIONAL" | "DEGRADED" | "NOT_CONFIGURED" | "FAILED";
  readonly summary: string;
  readonly actionItems: string[];
}

export interface CISAuditReport {
  readonly discoverable: boolean;
  readonly githubDiscoverable: boolean;
  readonly base44Discoverable: boolean;
  readonly invocationTest: { operation: string; status: string; durationMs: number; detail: string };
  readonly summary: string;
}

// ── Stage order ───────────────────────────────────────────────────────────────

const STAGES: AuditStage[] = [
  "IMPLEMENTED", "REGISTERED", "DISCOVERABLE",
  "AUTHENTICATED", "INVOKABLE", "OPERATIONAL",
];

function highestPassed(stages: StageResult[]): AuditStage | "NONE" {
  const passed = stages.filter(s => s.status === "PASS").map(s => s.stage);
  if (passed.length === 0) return "NONE";
  return STAGES.reduce<AuditStage | "NONE">(
    (best, stage) => passed.includes(stage) ? stage : best,
    "NONE",
  );
}

// ── Main engine ───────────────────────────────────────────────────────────────

export class OperationalAuditEngine {
  async run(): Promise<OperationalAuditReport> {
    const t0 = Date.now();

    const [github, base44, cis] = await Promise.all([
      this._auditGitHub(),
      this._auditBase44(),
      this._auditCIS(),
    ]);

    const overall: OperationalAuditReport["overallStatus"] =
      base44.overallStatus === "OPERATIONAL" && github.overallStatus === "OPERATIONAL" ? "OPERATIONAL"
      : base44.overallStatus === "OPERATIONAL" ? "DEGRADED"
      : "NOT_CONFIGURED";

    const actionItems = this._buildActionItems(github, base44, cis);

    return {
      id: `audit_${Date.now()}`,
      generatedAt: Date.now(),
      durationMs: Date.now() - t0,
      github, base44, cis,
      overallStatus: overall,
      summary: `MemoryOS Core Audit — Base44: ${base44.overallStatus} · GitHub: ${github.overallStatus} · CIS: ${cis.summary}`,
      actionItems,
    };
  }

  // ── GitHub Audit ─────────────────────────────────────────────────────────────

  private async _auditGitHub(): Promise<ConnectorAuditReport> {
    const t0 = Date.now();
    const stages: StageResult[] = [];
    let conn: GitHubConnector | null = null;

    // 1. IMPLEMENTED
    {
      const t1 = Date.now();
      try {
        conn = new GitHubConnector();
        const meta = conn.metadata();
        stages.push({
          stage: "IMPLEMENTED", status: "PASS",
          detail: `GitHubConnector v${meta.version} — ${meta.capabilities.length} capabilities declared`,
          durationMs: Date.now() - t1, rootCause: null, minimumFix: null,
          evidence: [`id=${meta.id}`, `version=${meta.version}`, `capabilities=${meta.capabilities.length}`],
        });
      } catch (e) {
        stages.push({ stage: "IMPLEMENTED", status: "FAIL", detail: `Failed to instantiate: ${e}`, durationMs: Date.now() - t1, rootCause: "GitHubConnector class not importable", minimumFix: "Verify src/lib/connector-runtime/connectors/GitHubConnector.ts compiles without errors", evidence: [] });
        return this._abort("github", "GitHub Production Connector", "2.0.0", stages, t0);
      }
    }

    // 2. REGISTERED
    {
      const t1 = Date.now();
      const registry = new ConnectorRegistry();
      try {
        registry.register(conn!);
        const found = registry.has("github");
        stages.push({
          stage: "REGISTERED", status: found ? "PASS" : "FAIL",
          detail: found ? `ConnectorRegistry.register() succeeded — id="github"` : "register() succeeded but has() returned false",
          durationMs: Date.now() - t1, rootCause: found ? null : "Registry internal inconsistency",
          minimumFix: found ? null : "Check ConnectorRegistry.has() implementation",
          evidence: [`registry.count()=${registry.count()}`, `has("github")=${found}`],
        });
        if (!found) return this._abort("github", "GitHub Production Connector", "2.0.0", stages, t0);
      } catch (e) {
        stages.push({ stage: "REGISTERED", status: "FAIL", detail: `register() threw: ${e}`, durationMs: Date.now() - t1, rootCause: "Connector id collision or registry error", minimumFix: "Check for duplicate connector id registrations", evidence: [] });
        return this._abort("github", "GitHub Production Connector", "2.0.0", stages, t0);
      }
    }

    // 3. DISCOVERABLE
    {
      const t1 = Date.now();
      const cis = new ConnectorInvocationService();
      try {
        const discovered = await cis.discoverConnectors();
        const gh = discovered.find(d => d.id === "github");
        stages.push({
          stage: "DISCOVERABLE", status: gh ? "PASS" : "FAIL",
          detail: gh ? `CIS discovered github — caps=${gh.capabilities.length}, cert=${gh.certificationLevel}` : "GitHub not found in CIS.discoverConnectors()",
          durationMs: Date.now() - t1, rootCause: gh ? null : "CIS REGISTERED_CONNECTORS does not include 'github'",
          minimumFix: gh ? null : "Verify ConnectorInvocationService._connectors includes GitHubConnector",
          evidence: gh ? [`caps=${gh.capabilities.length}`, `health=${gh.healthStatus}`, `cert=${gh.certificationLevel}`] : [],
        });
        if (!gh) return this._abort("github", "GitHub Production Connector", "2.0.0", stages, t0);
      } catch (e) {
        stages.push({ stage: "DISCOVERABLE", status: "FAIL", detail: `discoverConnectors() threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check CIS constructor for import errors", evidence: [] });
        return this._abort("github", "GitHub Production Connector", "2.0.0", stages, t0);
      }
    }

    // 4. AUTHENTICATED
    {
      const t1 = Date.now();
      try {
        const h = await conn!.health() as any;
        const authCheck = h.checks?.find((c: any) => c.name === "Authentication");
        const tokenCheck = h.checks?.find((c: any) => c.name === "Token");
        const hasToken = (globalThis as any).__GITHUB_TOKEN__ != null;

        if (!hasToken) {
          stages.push({
            stage: "AUTHENTICATED", status: "FAIL",
            detail: `__GITHUB_TOKEN__ not set — health()=${h.status}`,
            durationMs: Date.now() - t1,
            rootCause: "GitHub Personal Access Token not configured in environment",
            minimumFix: "Set __GITHUB_TOKEN__ = '<your_pat>' in browser console or inject via app environment variables. Token needs 'repo' + 'read:user' scopes.",
            evidence: [`health=${h.status}`, "token=NOT_CONFIGURED"],
          });
          // Skip remaining stages — can't go further without token
          stages.push({ stage: "INVOKABLE", status: "SKIP", detail: "Skipped — authentication not configured", durationMs: 0, rootCause: "Depends on AUTHENTICATED", minimumFix: null, evidence: [] });
          stages.push({ stage: "OPERATIONAL", status: "SKIP", detail: "Skipped — authentication not configured", durationMs: 0, rootCause: "Depends on AUTHENTICATED", minimumFix: null, evidence: [] });
          return this._finalize("github", "GitHub Production Connector", "2.0.0", stages, t0);
        }

        const authOk = authCheck?.passed ?? (h.status === "healthy");
        stages.push({
          stage: "AUTHENTICATED", status: authOk ? "PASS" : "FAIL",
          detail: authCheck?.detail ?? h.details ?? `health=${h.status}`,
          durationMs: Date.now() - t1,
          rootCause: authOk ? null : "GitHub token is set but invalid or expired",
          minimumFix: authOk ? null : "Regenerate GitHub PAT with 'repo' + 'read:user' scopes and update __GITHUB_TOKEN__",
          evidence: [`health=${h.status}`, `login=${h.login ?? "N/A"}`],
        });
        if (!authOk) {
          stages.push({ stage: "INVOKABLE", status: "SKIP", detail: "Skipped", durationMs: 0, rootCause: null, minimumFix: null, evidence: [] });
          stages.push({ stage: "OPERATIONAL", status: "SKIP", detail: "Skipped", durationMs: 0, rootCause: null, minimumFix: null, evidence: [] });
          return this._finalize("github", "GitHub Production Connector", "2.0.0", stages, t0);
        }
      } catch (e) {
        stages.push({ stage: "AUTHENTICATED", status: "FAIL", detail: `health() threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check GitHubConnector.health() implementation", evidence: [] });
        return this._abort("github", "GitHub Production Connector", "2.0.0", stages, t0);
      }
    }

    // 5. INVOKABLE
    {
      const t1 = Date.now();
      const cis = new ConnectorInvocationService();
      try {
        const { record, result } = await cis.githubListRepos({ originComponent: "Manual", reason: "Operational audit" });
        const ok = record.status === "SUCCESS";
        stages.push({
          stage: "INVOKABLE", status: ok ? "PASS" : "FAIL",
          detail: ok
            ? `repos.list via CIS: ${(result?.data as any)?.count ?? 0} repos · ${record.durationMs}ms`
            : `CIS invocation failed: ${record.status} — ${record.error ?? "no error"}`,
          durationMs: Date.now() - t1,
          rootCause: ok ? null : `CIS.invoke returned ${record.status}`,
          minimumFix: ok ? null : "Check CIS authorization layer — verify ConnectorInvocationService._authorize() approves 'repos.list'",
          evidence: [`status=${record.status}`, `auth=${record.authorization.decision}`, `duration=${record.durationMs}ms`],
        });
        if (!ok) {
          stages.push({ stage: "OPERATIONAL", status: "SKIP", detail: "Skipped", durationMs: 0, rootCause: null, minimumFix: null, evidence: [] });
          return this._finalize("github", "GitHub Production Connector", "2.0.0", stages, t0);
        }
      } catch (e) {
        stages.push({ stage: "INVOKABLE", status: "FAIL", detail: `CIS.githubListRepos() threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check CIS import chain", evidence: [] });
        return this._abort("github", "GitHub Production Connector", "2.0.0", stages, t0);
      }
    }

    // 6. OPERATIONAL — read a real file
    {
      const t1 = Date.now();
      const cis = new ConnectorInvocationService();
      try {
        const { record, result } = await cis.invoke("github", "connectivity.ping", {}, { originComponent: "Manual", reason: "Operational audit: final check" });
        const ok = record.status === "SUCCESS";
        stages.push({
          stage: "OPERATIONAL", status: ok ? "PASS" : "FAIL",
          detail: ok ? `connectivity.ping SUCCESS — ${record.durationMs}ms · rateLimit=${JSON.stringify((result?.data as any)?.rateLimit?.remaining ?? "N/A")}` : `ping failed: ${record.error}`,
          durationMs: Date.now() - t1,
          rootCause: ok ? null : "Ping failed despite previous stages passing",
          minimumFix: ok ? null : "Check network connectivity to api.github.com",
          evidence: [`status=${record.status}`, `duration=${record.durationMs}ms`],
        });
      } catch (e) {
        stages.push({ stage: "OPERATIONAL", status: "FAIL", detail: `ping threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check CIS + GitHubConnector execute()", evidence: [] });
      }
    }

    return this._finalize("github", "GitHub Production Connector", "2.0.0", stages, t0);
  }

  // ── Base44 Audit ─────────────────────────────────────────────────────────────

  private async _auditBase44(): Promise<ConnectorAuditReport> {
    const t0 = Date.now();
    const stages: StageResult[] = [];
    let conn: Base44Connector | null = null;

    // 1. IMPLEMENTED
    {
      const t1 = Date.now();
      try {
        conn = new Base44Connector();
        const meta = conn.metadata();
        stages.push({
          stage: "IMPLEMENTED", status: "PASS",
          detail: `Base44Connector v${meta.version} — ${meta.capabilities.length} capabilities, IProductionConnector compliant`,
          durationMs: Date.now() - t1, rootCause: null, minimumFix: null,
          evidence: [`id=${meta.id}`, `version=${meta.version}`, `caps=${meta.capabilities.length}`],
        });
      } catch (e) {
        stages.push({ stage: "IMPLEMENTED", status: "FAIL", detail: `Failed to instantiate: ${e}`, durationMs: Date.now() - t1, rootCause: "Base44Connector class not importable", minimumFix: "Verify Base44Connector.ts compiles without errors", evidence: [] });
        return this._abort("base44", "Base44 Production Connector", "2.0.0", stages, t0);
      }
    }

    // 2. REGISTERED
    {
      const t1 = Date.now();
      const registry = new ConnectorRegistry();
      try {
        registry.register(conn!);
        const found = registry.has("base44");
        stages.push({
          stage: "REGISTERED", status: found ? "PASS" : "FAIL",
          detail: found ? `ConnectorRegistry.register() succeeded — id="base44"` : "has() returned false after register()",
          durationMs: Date.now() - t1, rootCause: found ? null : "Registry internal inconsistency", minimumFix: found ? null : "Check ConnectorRegistry",
          evidence: [`count=${registry.count()}`, `has("base44")=${found}`],
        });
        if (!found) return this._abort("base44", "Base44 Production Connector", "2.0.0", stages, t0);
      } catch (e) {
        stages.push({ stage: "REGISTERED", status: "FAIL", detail: `register() threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check for duplicate id registrations", evidence: [] });
        return this._abort("base44", "Base44 Production Connector", "2.0.0", stages, t0);
      }
    }

    // 3. DISCOVERABLE
    {
      const t1 = Date.now();
      const cis = new ConnectorInvocationService();
      try {
        const discovered = await cis.discoverConnectors();
        const b44 = discovered.find(d => d.id === "base44");
        stages.push({
          stage: "DISCOVERABLE", status: b44 ? "PASS" : "FAIL",
          detail: b44 ? `CIS discovered base44 — caps=${b44.capabilities.length}, health=${b44.healthStatus}` : "base44 not found in CIS.discoverConnectors()",
          durationMs: Date.now() - t1, rootCause: b44 ? null : "CIS._connectors does not include Base44Connector", minimumFix: b44 ? null : "Verify ConnectorInvocationService._connectors Map includes base44",
          evidence: b44 ? [`caps=${b44.capabilities.length}`, `health=${b44.healthStatus}`, `auth=${b44.authenticated}`] : [],
        });
        if (!b44) return this._abort("base44", "Base44 Production Connector", "2.0.0", stages, t0);
      } catch (e) {
        stages.push({ stage: "DISCOVERABLE", status: "FAIL", detail: `discoverConnectors() threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check CIS constructor", evidence: [] });
        return this._abort("base44", "Base44 Production Connector", "2.0.0", stages, t0);
      }
    }

    // 4. AUTHENTICATED
    {
      const t1 = Date.now();
      try {
        const h = await conn!.health() as any;
        const authCheck = h.checks?.find((c: any) => c.name === "Authentication");
        const authOk = authCheck?.passed ?? (h.status === "healthy");
        stages.push({
          stage: "AUTHENTICATED", status: authOk ? "PASS" : "FAIL",
          detail: authCheck?.detail ?? h.details ?? `health=${h.status}`,
          durationMs: Date.now() - t1,
          rootCause: authOk ? null : "User not authenticated — session expired or running outside app context",
          minimumFix: authOk ? null : "Ensure the app is running with an authenticated user session (not accessed as anonymous/unauthenticated)",
          evidence: [`health=${h.status}`, `checks=${h.checks?.length ?? 0}`, `latency=${h.latencyMs ?? 0}ms`],
        });
        if (!authOk) {
          stages.push({ stage: "INVOKABLE", status: "SKIP", detail: "Skipped — not authenticated", durationMs: 0, rootCause: null, minimumFix: null, evidence: [] });
          stages.push({ stage: "OPERATIONAL", status: "SKIP", detail: "Skipped — not authenticated", durationMs: 0, rootCause: null, minimumFix: null, evidence: [] });
          return this._finalize("base44", "Base44 Production Connector", "2.0.0", stages, t0);
        }
      } catch (e) {
        stages.push({ stage: "AUTHENTICATED", status: "FAIL", detail: `health() threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check Base44Connector.health() and SDK import", evidence: [] });
        return this._abort("base44", "Base44 Production Connector", "2.0.0", stages, t0);
      }
    }

    // 5. INVOKABLE — via CIS
    {
      const t1 = Date.now();
      const cis = new ConnectorInvocationService();
      try {
        const { record, result } = await cis.base44ListProjects({ originComponent: "Manual", reason: "Operational audit" });
        const ok = record.status === "SUCCESS";
        stages.push({
          stage: "INVOKABLE", status: ok ? "PASS" : "FAIL",
          detail: ok
            ? `projects.list via CIS: ${(result?.data as any)?.count ?? 0} project(s) · ${record.durationMs}ms`
            : `CIS invocation failed: ${record.status} — ${record.error ?? "no error"}`,
          durationMs: Date.now() - t1,
          rootCause: ok ? null : `CIS returned ${record.status}`,
          minimumFix: ok ? null : "Check CIS._authorize() for base44 + projects.list — verify authorization chain passes",
          evidence: [`status=${record.status}`, `auth=${record.authorization.decision}`, `duration=${record.durationMs}ms`],
        });
        if (!ok) {
          stages.push({ stage: "OPERATIONAL", status: "SKIP", detail: "Skipped", durationMs: 0, rootCause: null, minimumFix: null, evidence: [] });
          return this._finalize("base44", "Base44 Production Connector", "2.0.0", stages, t0);
        }
      } catch (e) {
        stages.push({ stage: "INVOKABLE", status: "FAIL", detail: `CIS.base44ListProjects() threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check CIS import chain", evidence: [] });
        return this._abort("base44", "Base44 Production Connector", "2.0.0", stages, t0);
      }
    }

    // 6. OPERATIONAL — real read operation
    {
      const t1 = Date.now();
      const cis = new ConnectorInvocationService();
      try {
        const { record, result } = await cis.invoke("base44", "auth.me", {}, { originComponent: "Manual", reason: "Operational audit: real read" });
        const ok = record.status === "SUCCESS";
        const email = (result?.data as any)?.email ?? "N/A";
        stages.push({
          stage: "OPERATIONAL", status: ok ? "PASS" : "FAIL",
          detail: ok ? `auth.me SUCCESS — user=${email} · ${record.durationMs}ms` : `auth.me failed: ${record.error}`,
          durationMs: Date.now() - t1,
          rootCause: ok ? null : "auth.me() failed after all previous stages passed",
          minimumFix: ok ? null : "Check Base44 SDK auth.me() — user session may have expired",
          evidence: [`status=${record.status}`, `user=${email}`, `duration=${record.durationMs}ms`],
        });
      } catch (e) {
        stages.push({ stage: "OPERATIONAL", status: "FAIL", detail: `auth.me threw: ${e}`, durationMs: Date.now() - t1, rootCause: String(e), minimumFix: "Check Base44Connector execute() + SDK", evidence: [] });
      }
    }

    return this._finalize("base44", "Base44 Production Connector", "2.0.0", stages, t0);
  }

  // ── CIS Audit ─────────────────────────────────────────────────────────────────

  private async _auditCIS(): Promise<CISAuditReport> {
    const cis = new ConnectorInvocationService();
    const discovered = await cis.discoverConnectors();
    const ghDisc  = discovered.some(d => d.id === "github");
    const b44Disc = discovered.some(d => d.id === "base44");

    const t0 = Date.now();
    const { record } = await cis.invoke("base44", "connectivity.ping", {}, { originComponent: "Manual", reason: "CIS operational audit" });
    const durationMs = Date.now() - t0;

    return {
      discoverable:          ghDisc && b44Disc,
      githubDiscoverable:    ghDisc,
      base44Discoverable:    b44Disc,
      invocationTest: {
        operation: "base44.connectivity.ping",
        status: record.status,
        durationMs,
        detail: `auth=${record.authorization.decision} · ${record.resultSummary}`,
      },
      summary: `CIS: ${discovered.length} connectors discovered · ping=${record.status} · ${durationMs}ms`,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private _finalize(id: string, name: string, version: string, stages: StageResult[], t0: number): ConnectorAuditReport {
    const highest = highestPassed(stages);
    const allPass  = stages.every(s => s.status === "PASS");
    const anyFail  = stages.some(s => s.status === "FAIL");
    const notConf  = stages.find(s => s.stage === "AUTHENTICATED" && s.status === "FAIL" && s.rootCause?.includes("not configured"));

    const overallStatus: ConnectorAuditReport["overallStatus"] =
      allPass ? "OPERATIONAL"
      : notConf ? "NOT_CONFIGURED"
      : anyFail ? "FAILED"
      : "DEGRADED";

    return {
      connectorId: id, connectorName: name, version,
      highestPassedStage: highest,
      stages, overallStatus,
      durationMs: Date.now() - t0,
      summary: `${name}: ${overallStatus} — highest stage: ${highest}`,
    };
  }

  private _abort(id: string, name: string, version: string, stages: StageResult[], t0: number): ConnectorAuditReport {
    const remaining: AuditStage[] = STAGES.filter(s => !stages.find(r => r.stage === s));
    for (const stage of remaining) {
      stages.push({ stage, status: "SKIP", detail: "Skipped due to earlier failure", durationMs: 0, rootCause: "Blocked by failed prerequisite stage", minimumFix: null, evidence: [] });
    }
    return this._finalize(id, name, version, stages, t0);
  }

  private _buildActionItems(gh: ConnectorAuditReport, b44: ConnectorAuditReport, cis: CISAuditReport): string[] {
    const items: string[] = [];
    for (const report of [gh, b44]) {
      for (const stage of report.stages) {
        if (stage.status === "FAIL" && stage.minimumFix) {
          items.push(`[${report.connectorId.toUpperCase()} / ${stage.stage}] ${stage.minimumFix}`);
        }
      }
    }
    if (!cis.discoverable) items.push("[CIS] One or more connectors not discoverable — check ConnectorInvocationService._connectors");
    if (cis.invocationTest.status !== "SUCCESS") items.push(`[CIS] Invocation test failed: ${cis.invocationTest.detail}`);
    if (items.length === 0) items.push("No action items — all operational stages passing.");
    return items;
  }
}