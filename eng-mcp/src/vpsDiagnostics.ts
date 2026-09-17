// engineering.vps.diagnostics — read-only host diagnostics for the OFFICIAL
// release runner service (eng-mcp-release-runner.service), the only entry on
// the frozen allowlist. Zero raw shell/SSH from the MCP side: every view is a
// projection of the runner's OWN "inspect" operation over the official Unix
// socket channel (callReleaseRunner, injected here as runRunner). The pipeline
// script serves inspect with systemctl show (effective unit directives,
// including the restart trio the controlled-restart prechecks rely on),
// /proc process evidence, a fixed-column docker ps -a inventory and sanitized
// journal lines. The MCP tool never extends the allowlist, never runs commands
// and never mutates: view only selects which read-only sections are returned.
//
// Redaction is layered: the pipeline sanitizes values (sanitizeSecrets) before
// they ever leave the host; this module re-wraps the final evidence in
// redactSensitive (key-based, src/vpsTransport.ts) so a secret hiding behind a
// non-sensitive-looking key still cannot surface. environmentValuesReturned
// stays false by construction — no environment values are ever requested.
//
// The scope engineering:vps:diagnostics:read is UNCONDITIONAL even though the
// operation is read-only: host-level state sits outside the repository
// boundary, so the operator-issued scope is the primary control and redaction
// is defense in depth.
import * as z from "zod/v4";
import { redactSensitive } from "./vpsTransport.ts";

export const VPS_DIAGNOSTICS_VIEWS = ["unit", "journal", "docker"] as const;
export type VpsDiagnosticsView = (typeof VPS_DIAGNOSTICS_VIEWS)[number];

export const vpsDiagnosticsInputSchema = z.object({
  view: z.enum(["unit", "journal", "docker"]).optional()
}).strict();
export type VpsDiagnosticsInput = z.infer<typeof vpsDiagnosticsInputSchema>;

export type VpsDiagnosticsRunnerOperation = "inspect" | "status";
export interface VpsDiagnosticsRunnerResponse { httpStatus: number; body: unknown; }

export interface VpsDiagnosticsDeps {
  runRunner?: (operation: VpsDiagnosticsRunnerOperation, jobId?: string) => Promise<VpsDiagnosticsRunnerResponse>;
}

export interface VpsDiagnosticsFinding {
  code: string;
  severity: "critical" | "warning" | "info";
  detail?: string;
  httpStatus?: number;
}

export interface VpsDiagnosticsDirectives {
  restart?: string | null;
  successExitStatus?: string[];
  restartForceExitStatus?: string[];
  noNewPrivileges?: string | null;
  protectSystem?: string | null;
}

export interface VpsDiagnosticsCrossCheck {
  restartMatch: boolean | null;
  successExitStatusMatch: boolean | null;
  restartForceExitStatusMatch: boolean | null;
}

export interface VpsDiagnosticsResult {
  view: VpsDiagnosticsView;
  status: "OK" | "PARTIAL" | "UNAVAILABLE";
  mutationPerformed: boolean;
  service?: unknown;
  process?: unknown;
  runner?: unknown;
  directives?: VpsDiagnosticsDirectives | null;
  runnerMeta?: unknown;
  crossCheck?: VpsDiagnosticsCrossCheck | null;
  recentLogs?: unknown;
  docker?: unknown;
  dockerInspection?: string;
  security: { secretsRedacted: true; environmentValuesReturned: false; readOnly: true };
  findings: VpsDiagnosticsFinding[];
  partialFailures: unknown[];
}

const SECURITY_BLOCK = { secretsRedacted: true, environmentValuesReturned: false, readOnly: true } as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// The runner merges the inspect action's fields at the top level of its socket
// response (same convention as runnerMeta on status responses); the fallback
// keys cover a nested envelope without changing the contract.
function extractInspectPayload(body: unknown): Record<string, unknown> | null {
  const record = asRecord(body);
  if (!record) return null;
  if ("service" in record || "recentLogs" in record || "docker" in record || "directives" in record) return record;
  for (const key of ["inspection", "result"]) {
    const nested = asRecord(record[key]);
    if (nested && ("service" in nested || "recentLogs" in nested || "docker" in nested || "directives" in nested)) return nested;
  }
  return record;
}

// systemd prints exit codes as space-separated strings ("42", "42 143"); the
// runner's parsed unit directives carry them as string arrays. Normalize both
// sides through Number() so "42", 42 and "042" compare equal.
function normalizeExitCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === null || raw === undefined || raw === "") return "";
  const num = Number(raw);
  return Number.isFinite(num) ? String(num) : String(raw);
}

function normalizeCodeList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalizeExitCode).filter(Boolean).sort();
  if (typeof value === "string") return value.split(/\s+/).map(normalizeExitCode).filter(Boolean).sort();
  return [];
}

function codesMatch(a: unknown, b: unknown): boolean | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return JSON.stringify(normalizeCodeList(a)) === JSON.stringify(normalizeCodeList(b));
}

function scalarMatch(a: unknown, b: unknown): boolean | null {
  if (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") return null;
  return String(a) === String(b);
}

// Divergence evidence, not enforcement: the controlled-restart prechecks run
// runner-side and tool-side at mutation time; here the same two sources
// (systemctl show effective directives vs the runner's self-reported parsed
// unit) are compared so drift becomes visible in PLAN-mode diagnostics.
function crossCheckFor(directives: unknown, unit: unknown): VpsDiagnosticsCrossCheck {
  const left = asRecord(directives);
  const right = asRecord(unit);
  return {
    restartMatch: scalarMatch(left?.restart, right?.restart),
    successExitStatusMatch: codesMatch(left?.successExitStatus, right?.successExitStatus),
    restartForceExitStatusMatch: codesMatch(left?.restartForceExitStatus, right?.restartForceExitStatus)
  };
}

// The security block is a constant; redactSensitive would redact its own
// "secretsRedacted" key (the key pattern matches /secret/), so it is attached
// AFTER the value-level redaction pass. Everything else goes through
// redactSensitive unchanged.
function finalize(result: VpsDiagnosticsResult): VpsDiagnosticsResult {
  const { security, ...evidence } = result;
  const redacted = redactSensitive(evidence) as Omit<VpsDiagnosticsResult, "security">;
  return { ...redacted, security };
}

export async function runVpsDiagnostics(rawInput: unknown, deps: VpsDiagnosticsDeps = {}): Promise<VpsDiagnosticsResult> {
  const input = vpsDiagnosticsInputSchema.parse(rawInput ?? {});
  const view: VpsDiagnosticsView = input.view ?? "unit";
  const findings: VpsDiagnosticsFinding[] = [];
  const result: VpsDiagnosticsResult = { view, status: "UNAVAILABLE", mutationPerformed: false, security: SECURITY_BLOCK, findings, partialFailures: [] };

  const runRunner = deps.runRunner;
  if (!runRunner) {
    findings.push({ code: "RUNNER_CHANNEL_UNAVAILABLE", severity: "warning", detail: "official release runner channel is not available" });
    return finalize(result);
  }

  let payload: Record<string, unknown> | null = null;
  try {
    const inspect = await runRunner("inspect");
    if (inspect.httpStatus !== 200) {
      findings.push({ code: "RUNNER_INSPECT_NON_200", severity: "warning", httpStatus: inspect.httpStatus });
    } else {
      payload = extractInspectPayload(inspect.body);
    }
  } catch (error) {
    findings.push({ code: "RUNNER_UNREACHABLE", severity: "warning", detail: error instanceof Error ? error.message.slice(0, 200) : "inspect call failed" });
  }

  if (!payload) {
    return finalize(result);
  }

  const partialFailures = Array.isArray(payload.partialFailures) ? payload.partialFailures : [];
  result.partialFailures = partialFailures;

  if (view === "unit") {
    result.service = payload.service ?? null;
    result.process = payload.process ?? null;
    result.runner = payload.runner ?? {};
    result.directives = asRecord(payload.directives) ? (payload.directives as VpsDiagnosticsDirectives) : null;

    // Best-effort cross-check against the runner's self-reported unit directives
    // (status op). A missing status never fails the view: crossCheck becomes
    // null and the mismatch evidence simply stays absent.
    let runnerMeta: unknown = null;
    try {
      const status = await runRunner("status");
      if (status.httpStatus === 200) {
        runnerMeta = asRecord(status.body)?.runnerMeta ?? null;
      } else {
        findings.push({ code: "RUNNER_STATUS_NON_200", severity: "info", httpStatus: status.httpStatus });
      }
    } catch (error) {
      findings.push({ code: "RUNNER_STATUS_UNAVAILABLE", severity: "info", detail: error instanceof Error ? error.message.slice(0, 200) : "status call failed" });
    }
    result.runnerMeta = runnerMeta;
    const unit = asRecord(asRecord(runnerMeta)?.unit);
    result.crossCheck = unit ? crossCheckFor(result.directives, unit) : null;
  } else if (view === "journal") {
    result.recentLogs = Array.isArray(payload.recentLogs) ? payload.recentLogs : [];
  } else {
    result.docker = Array.isArray(payload.docker) ? payload.docker : [];
    result.dockerInspection = typeof payload.dockerInspection === "string" ? payload.dockerInspection : "unknown";
  }

  result.status = partialFailures.length > 0 ? "PARTIAL" : "OK";
  return finalize(result);
}
