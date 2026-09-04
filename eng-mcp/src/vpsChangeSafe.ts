import { readFile } from "node:fs/promises";
import { createGuardianVpsRedeployAdapter, loadGuardianCore, type GuardianCoreModule, type GuardianVpsDispatchRecord } from "./guardianVpsAdapter.ts";

// engineering.vps.change.safe — controlled VPS change supertool (MVP).
//
// Purpose: let the MemoryOS Orchestrator change VPS infrastructure WITHOUT SSH/Linux,
// through a deterministic, allowlisted, approval-gated flow:
//   PLAN -> PRE-CHECK -> RISK -> APPROVAL GATE -> CHANGE -> VALIDATION -> RESULT
//
// Hard rules (this sprint):
// - ONLY action "redeploy_application" is supported. The ONLY mutating Dokploy
//   primitive is "application-redeploy" (real catalog schema: { applicationId } required,
//   optional title/description — intentionally NOT sent to keep the change minimal).
// - execute defaults to false (plan-only). A mutation happens ONLY when
//   execute === true AND approval.approved === true.
// - DG01R: the mutation is dispatched ONLY through the frozen Guardian Core
//   (executeGuardianIntent) via the operator-side adapter (src/guardianVpsAdapter.ts):
//   bind is read-only fail-closed eligibility, apply is the ONLY mutating boundary,
//   and a runtime where the Core package is not resolvable degrades fail-closed
//   (zero mutation) — the tool never mutates ungoverned.
// - Read primitives (pre/post checks) come from the real Dokploy MCP catalog:
//   application-one, application-search, application-readLogs,
//   application-readAppMonitoring, deployment-all, deployment-queueList.
//   No other primitive can be invoked: the transport receives toolName ONLY from
//   MUTATION_ALLOWLIST / this module's fixed read list — never from caller input.
// - rollback.available is ALWAYS false: no rollback primitive/strategy is proven yet.
//   No old-version redeploy, no restore, no simulation.
// - backupAvailable stays false: per-app-type applicability is not proven this sprint.
//   Backups are NEVER executed here (vps.backup is a future supertool).
// - ZERO LLM, no SSH, no shell, no arbitrary Dokploy tool execution. Secrets, auth
//   headers and env values are never returned or logged (metadata-only observability).
// - Execution channel: the existing Base44 "mcpClientCall" function (real contract:
//   POST {serverId, action:"call", toolName, arguments, confirmation:{toolName}}),
//   reusing the same endpoint/credential channel as engineering.memory.* and
//   engineering.runtime.http_probe. The transport is injectable so tests run fully
//   offline with fakes. If the upstream channel refuses (e.g. user-session-only auth
//   boundary), the result is a structured UPSTREAM_ERROR — never a fabricated success.
//
// Result semantics (ok field): ok=false for CHANGE_BLOCKED / TARGET_NOT_FOUND /
// AMBIGUOUS_TARGET / UPSTREAM_ERROR / EXECUTED_FAILED; ok=true for PLANNED /
// EXECUTED_HEALTHY / EXECUTED_DEGRADED (degraded = mutation confirmed, real-world
// health not yet proven — the orchestrator decides what to do next).

export const DOKPLOY_SERVER_ID_DEFAULT = "6a8dc3a3beadf81a8ed535cc";

// DG01R: runtime-immutable authority — the operator allowlist can never be
// expanded, replaced or mutated through any caller channel.
export const MUTATION_ALLOWLIST = Object.freeze({
  redeploy_application: Object.freeze({
    primitive: "application-redeploy",
    risk: "medium",
    approvalRequired: true,
  }),
} as const);

export type VpsAction = keyof typeof MUTATION_ALLOWLIST;

export const READ_PRIMITIVES = [
  "application-one",
  "application-search",
  "application-readLogs",
  "application-readAppMonitoring",
  "deployment-all",
  "deployment-queueList",
] as const;

export type VpsOutcome =
  | "PLANNED"
  | "EXECUTED_HEALTHY"
  | "EXECUTED_DEGRADED"
  | "EXECUTED_FAILED"
  | "CHANGE_BLOCKED"
  | "TARGET_NOT_FOUND"
  | "AMBIGUOUS_TARGET"
  | "UPSTREAM_ERROR";

export type VpsTransportCall = {
  toolName: string;
  arguments: Record<string, unknown>;
  mutating: boolean;
  confirmation: { toolName: string };
};

export type VpsTransportResponse = {
  ok: boolean;
  status: number;
  result?: unknown;
  error?: string;
  durationMs: number;
};

export interface VpsTransport {
  name: string;
  call(request: VpsTransportCall): Promise<VpsTransportResponse>;
}

export type VpsChangeSafeInput = {
  action: VpsAction;
  target: { applicationId?: string; applicationName?: string };
  execute?: boolean;
  approval?: { approved: boolean };
  validation?: { externalHealth?: boolean };
};

export type VpsChangeSafeDeps = {
  transport?: VpsTransport;
  now?: () => number;
  dokployServerId?: string;
  // DG01R: operator/test-only injection of the frozen Guardian Core module
  // (same trust boundary as transport). MCP callers can never reach deps;
  // production resolves the real package via loadGuardianCore().
  guardianCore?: GuardianCoreModule | null;
};

const DEFAULT_MEMORY_ENDPOINT = "https://ever-mind-core.base44.app/functions/agentMemoryBridge";
const DEFAULT_CALL_TIMEOUT_MS = 20_000;
const MAX_CALL_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 65_536;
const CONFLICT_WINDOW_MS = 15 * 60_000; // in-flight deployments newer than this block the change
const CLOCK_SKEW_GUARD_MS = 2_000;
const MAX_SEARCH_RESULTS = 100;
const MAX_CANDIDATES_SHOWN = 10;
const LOG_TAIL = 50;
const MAX_EVIDENCE = 40;
const REDACTED = "[REDACTED]";
// Key-based scrub only: this module never holds credential material. "env" is matched
// exactly (^env$ / envvars) so unrelated keys like "environmentId" pass through.
const SENSITIVE_KEY_PATTERN = /authorization|token|secret|api_?key|password|cookie|bearer|envvars|^env$/i;
const FAILED_STATUS_PATTERN = /error|fail|cancel/i;
const SUCCESS_STATUS_PATTERN = /\bdone\b|success|complete/i;
const IN_FLIGHT_STATUS_PATTERN = /building|queu|running|deploying|pending|progress|starting|initializ|wait/i;

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function redactSensitive(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value;
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redactSensitive(item, depth + 1));
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitive(child, depth + 1);
    }
    return output;
  }
  return value;
}

type DeploymentClassification = "success" | "failed" | "in_flight" | "unknown";

// Conservative, deterministic classification over raw status strings returned by
// Dokploy. Unrecognized statuses never count as success (never claim healthy without
// evidence) and never count as failure (no invented failure semantics).
function classifyStatus(status: unknown): DeploymentClassification {
  if (typeof status !== "string" || status.length === 0) return "unknown";
  if (FAILED_STATUS_PATTERN.test(status)) return "failed";
  if (SUCCESS_STATUS_PATTERN.test(status)) return "success";
  if (IN_FLIGHT_STATUS_PATTERN.test(status)) return "in_flight";
  return "unknown";
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// Whitelist copy: application records can carry env/secret-bearing fields; only these
// harmless metadata keys are ever echoed back.
function pickApplicationSummary(app: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const key of ["id", "applicationId", "name", "appName", "applicationStatus", "status", "createdAt", "updatedAt"]) {
    const value = app[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") summary[key] = value;
  }
  return summary;
}

function deploymentSummary(deployment: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!deployment) return null;
  return {
    deploymentId: asString(deployment.deploymentId) ?? asString(deployment.id),
    status: typeof deployment.status === "string" ? deployment.status : null,
    createdAt: typeof deployment.createdAt === "string" || typeof deployment.createdAt === "number" ? deployment.createdAt : null,
    classification: classifyStatus(deployment.status),
  };
}

function newestDeployment(deployments: Record<string, unknown>[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const deployment of deployments) {
    const time = parseTimestamp(deployment.createdAt) ?? Number.NEGATIVE_INFINITY;
    if (best === null || time >= bestTime) {
      best = deployment;
      bestTime = time;
    }
  }
  return best;
}

// DG01R: single source of truth for in-flight conflict detection, shared by the
// pre-check phase and the Guardian adapter's state-bound re-proof at dispatch time.
export function findInFlightConflict(deployments: Record<string, unknown>[], observedAtMs: number): Record<string, unknown> | null {
  const conflict = deployments.find((deployment) => {
    if (classifyStatus(deployment.status) !== "in_flight") return false;
    const created = parseTimestamp(deployment.createdAt);
    if (created === null) return true; // in-flight with unknown age: conservative block
    const age = observedAtMs - created;
    return age >= -CLOCK_SKEW_GUARD_MS && age <= CONFLICT_WINDOW_MS;
  });
  return conflict ?? null;
}

function asDeploymentArray(result: unknown): Record<string, unknown>[] {
  return Array.isArray(result) ? result.filter(isRecord) : [];
}

// Accepts either a bare array or { applications: [...] } from application-search.
// SPRINT VPS-SUPERTOOLS-01D: mcp_execute returns the raw MCP callTool envelope. Unwrap it
// deterministically BEFORE the extractors run: structuredContent wins; JSON text payloads are
// parsed; plain text (e.g. logs) is preserved without invented parsing; ambiguous envelopes are
// returned unchanged so downstream extractors fail safe (UPSTREAM_ERROR). Non-records pass through.
function parseJsonTextIfValid(text: string): { json: true; value: unknown } | { json: false; value: string } {
  try {
    return { json: true, value: JSON.parse(text) };
  } catch {
    return { json: false, value: text };
  }
}

export function normalizeMcpResult(result: unknown): unknown {
  if (!isRecord(result)) return result;
  if (isRecord(result.structuredContent) || Array.isArray(result.structuredContent)) return result.structuredContent;
  if (!Array.isArray(result.content)) return result;
  const jsonValues: unknown[] = [];
  const textValues: string[] = [];
  for (const element of result.content) {
    if (!isRecord(element) || element.type !== "text" || typeof element.text !== "string") continue;
    const parsed = parseJsonTextIfValid(element.text);
    if (parsed.json) jsonValues.push(parsed.value);
    else textValues.push(parsed.value);
  }
  if (jsonValues.length === 1 && textValues.length === 0) return jsonValues[0];
  if (jsonValues.length === 0 && textValues.length > 0) return { text: textValues.join("\n") };
  return result;
}

// SPRINT VPS-SUPERTOOLS-01F: the UMG/Dokploy contract observed live in production is
// { success: boolean, message: string, data: { items: Application[], total: number } }.
// Deterministic and fail-safe: collect every recognized wrapper and use it ONLY when exactly one
// exists (conflicting wrappers are never resolved arbitrarily). success === false and
// present-but-non-array wrapper fields never become a valid list (null -> UPSTREAM_ERROR).
function extractSearchResults(result: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(result)) return result.filter(isRecord);
  if (!isRecord(result)) return null;
  if (result.success === false) return null;
  const wrappers: unknown[] = [];
  if (isRecord(result.data)) {
    if (Array.isArray(result.data.items)) wrappers.push(result.data.items);
    else if (result.data.items !== undefined) return null;
  } else if (Array.isArray(result.data)) {
    wrappers.push(result.data);
  }
  if (result.items !== undefined) {
    if (!Array.isArray(result.items)) return null;
    wrappers.push(result.items);
  }
  if (result.applications !== undefined) {
    if (!Array.isArray(result.applications)) return null;
    wrappers.push(result.applications);
  }
  if (wrappers.length !== 1) return null;
  return (wrappers[0] as unknown[]).filter(isRecord);
}

type NormalizedInput = {
  action: VpsAction;
  target: { applicationId: string | null; applicationName: string | null };
  execute: boolean;
  approved: boolean;
  externalHealthRequested: boolean;
};

function validateInput(input: unknown): Result<NormalizedInput> {
  if (!isRecord(input)) return { ok: false, reason: "INPUT_MUST_BE_OBJECT" };
  if (input.action !== "redeploy_application" || !Object.prototype.hasOwnProperty.call(MUTATION_ALLOWLIST, input.action)) {
    return { ok: false, reason: "ACTION_NOT_ALLOWLISTED" };
  }
  const target = input.target;
  if (!isRecord(target)) return { ok: false, reason: "TARGET_REQUIRED" };
  const applicationId = asString(target.applicationId);
  const applicationName = asString(target.applicationName);
  if (applicationId === null && applicationName === null) return { ok: false, reason: "TARGET_APPLICATION_ID_OR_NAME_REQUIRED" };
  if ((applicationId !== null && applicationId.length > 200) || (applicationName !== null && applicationName.length > 200)) {
    return { ok: false, reason: "TARGET_TOO_LONG" };
  }
  if (input.execute !== undefined && typeof input.execute !== "boolean") return { ok: false, reason: "EXECUTE_MUST_BE_BOOLEAN" };
  if (input.approval !== undefined) {
    if (!isRecord(input.approval) || typeof input.approval.approved !== "boolean") return { ok: false, reason: "APPROVAL_SHAPE_INVALID" };
  }
  if (input.validation !== undefined) {
    if (!isRecord(input.validation)) return { ok: false, reason: "VALIDATION_SHAPE_INVALID" };
    const externalHealth = input.validation.externalHealth;
    if (externalHealth !== undefined && typeof externalHealth !== "boolean") return { ok: false, reason: "VALIDATION_EXTERNAL_HEALTH_MUST_BE_BOOLEAN" };
  }
  const approval = input.approval as { approved?: boolean } | undefined;
  const validation = input.validation as { externalHealth?: boolean } | undefined;
  return {
    ok: true,
    value: {
      action: input.action as VpsAction,
      target: { applicationId, applicationName },
      execute: input.execute === true,
      approved: approval?.approved === true,
      externalHealthRequested: validation?.externalHealth === true,
    },
  };
}

// Default transport: the existing Base44 mcpClientCall executor, over the same
// s2s channel as engineering.memory.* (endpoint env + credential file). The token
// is attached server-side, never logged and never returned.
export function createMcpClientCallTransport(options: { dokployServerId?: string; timeoutMs?: number } = {}): VpsTransport {
  const serverId = options.dokployServerId ?? process.env.ENG_MCP_VPS_DOKPLOY_SERVER_ID ?? DOKPLOY_SERVER_ID_DEFAULT;
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS, 1), MAX_CALL_TIMEOUT_MS);
  return {
    name: "base44-mcpClientCall",
    async call(request: VpsTransportCall): Promise<VpsTransportResponse> {
      const start = Date.now();
      const endpoint = process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT ?? DEFAULT_MEMORY_ENDPOINT;
      let bridgeUrl: string;
      try {
        const u = new URL(endpoint);
        bridgeUrl = u.pathname.endsWith("/agentMemoryBridge") ? endpoint : `${u.origin}/functions/agentMemoryBridge`;
      } catch {
        return { ok: false, status: 0, error: "GATEWAY_ENDPOINT_INVALID", durationMs: Date.now() - start };
      }
      const headers: Record<string, string> = { "content-type": "application/json" };
      const credentialFile = process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE;
      if (credentialFile) {
        try {
          const token = (await readFile(credentialFile, "utf8")).trim();
          if (token) headers["x-agent-memory-token"] = token;
        } catch {
          /* proceed without token; the upstream channel decides authentication */
        }
      }
      let body: string;
      try {
        body = JSON.stringify({
          serverId,
          operation: "mcp_execute",
          toolName: request.toolName,
          arguments: request.arguments,
          confirmation: { toolName: request.toolName }, // UMG-3 tool-scoped confirmation
        });
      } catch {
        return { ok: false, status: 0, error: "REQUEST_BODY_INVALID", durationMs: Date.now() - start };
      }
      let response: Response;
      try {
        response = await fetch(bridgeUrl, {
          method: "POST",
          headers,
          body,
          redirect: "manual", // never follow redirects away from the allowlisted origin
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error instanceof Error && error.name === "TimeoutError" ? "GATEWAY_TIMEOUT" : "GATEWAY_NETWORK_ERROR",
          durationMs: Date.now() - start,
        };
      }
      let raw = "";
      try {
        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder("utf-8", { fatal: false });
          const chunks: Buffer[] = [];
          let bytes = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              bytes += value.byteLength;
              chunks.push(Buffer.from(value));
              if (bytes >= MAX_RESPONSE_BYTES) {
                void reader.cancel().catch(() => {});
                break;
              }
            }
          }
          raw = decoder.decode(Buffer.concat(chunks));
        }
      } catch {
        /* bounded read failure -> empty body */
      }
      let parsed: unknown = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      }
      const okStatus = response.status >= 200 && response.status < 300;
      const parsedOk = isRecord(parsed) && parsed.ok === true;
      const parsedFailed = isRecord(parsed) && parsed.ok === false;
      const errText = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : null;
      const errObj = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null;
      const errCode = errObj && typeof errObj.code === "string" ? errObj.code : null;
      const errMsg = errObj && typeof errObj.message === "string" ? errObj.message : null;
      const base = errCode ?? errText ?? `HTTP_${response.status}`;
      const detail = errMsg && !base.includes(errMsg) ? `${base}: ${errMsg}` : base;
      if (!okStatus || parsedFailed || errText !== null) {
        return { ok: false, status: response.status, error: detail, durationMs: Date.now() - start };
      }
      return {
        ok: true,
        status: response.status,
        result: redactSensitive(isRecord(parsed) && parsedOk ? (parsed.result ?? null) : null),
        durationMs: Date.now() - start,
      };
    },
  };
}

function auditLog(subject: string, mode: string, outcome: string, executed: boolean, durationMs: number, primitives: string[]): void {
  // Metadata only: never logs tokens, secrets, auth headers, env values or target payloads.
  console.log(JSON.stringify({ event: "engineering.vps.change.safe", subject, mode, outcome, executed, durationMs, primitives }));
}

export async function runVpsChangeSafe(subject: string, input: unknown, deps: VpsChangeSafeDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const transport = deps.transport ?? createMcpClientCallTransport({ dokployServerId: deps.dokployServerId });
  const evidence: string[] = [];
  const primitivesInvoked: string[] = [];
  const skippedPhases: string[] = [];
  const timings: Record<string, number> = {};
  const note = (message: string): void => {
    if (evidence.length < MAX_EVIDENCE) evidence.push(message);
  };
  const callPrimitive = async (toolName: string, args: Record<string, unknown>): Promise<{ ok: boolean; status: number; result?: unknown; error?: string }> => {
    primitivesInvoked.push(toolName);
    const response = await transport.call({ toolName, arguments: args, mutating: false, confirmation: { toolName } });
    return response.ok ? { ok: true, result: redactSensitive(normalizeMcpResult(response.result)), status: response.status } : { ok: false, status: response.status, error: response.error ?? "UNKNOWN" };
  };
  const finish = (result: Record<string, unknown>): Record<string, unknown> => {
    const totalMs = now() - t0;
    const complete: Record<string, unknown> = { evidence, primitivesInvoked, skippedPhases, timings: { ...timings, totalMs }, durationMs: totalMs, ...result };
    auditLog(subject, String(complete.mode ?? "plan"), String(complete.outcome ?? "UPSTREAM_ERROR"), complete.executed === true, totalMs, primitivesInvoked);
    return JSON.parse(JSON.stringify(redactSensitive(complete))) as Record<string, unknown>;
  };
  const baseTarget = (applicationId: string, applicationName: string | null, resolvedBy: string): Record<string, unknown> => ({
    applicationId,
    applicationName,
    resolvedBy,
    dokployServerId: deps.dokployServerId ?? process.env.ENG_MCP_VPS_DOKPLOY_SERVER_ID ?? DOKPLOY_SERVER_ID_DEFAULT,
  });

  // ---- Phase 0: input + allowlist (a non-allowlisted action never reaches any transport) ----
  const parsed = validateInput(input);
  if (!parsed.ok) {
    skippedPhases.push("resolve", "pre-check", "plan", "risk", "change", "validation");
    return finish({ ok: false, mode: "plan", action: null, outcome: "CHANGE_BLOCKED", executed: false, blocked: { phase: "input", reason: parsed.reason }, rollback: { available: false, performed: false } });
  }
  const plan = parsed.value;
  const actionPolicy = MUTATION_ALLOWLIST[plan.action];

  // ---- Phase 1: target resolution (read-only) ----
  const resolveStart = now();
  let applicationId: string;
  let resolvedBy: string;
  let applicationSummary: Record<string, unknown> | null = null;
  if (plan.target.applicationId !== null) {
    applicationId = plan.target.applicationId;
    resolvedBy = "applicationId";
    if (plan.target.applicationName !== null) note("target: applicationId and applicationName both provided; applicationId takes precedence (deterministic)");
    const r = await callPrimitive("application-one", { applicationId });
    timings.resolveMs = now() - resolveStart;
    if (!r.ok) {
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget(applicationId, plan.target.applicationName, resolvedBy), outcome: "UPSTREAM_ERROR", executed: false, upstream: { phase: "resolve", primitive: "application-one", status: r.status, error: r.error }, rollback: { available: false, performed: false } });
    }
    if (!isRecord(r.result)) {
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget(applicationId, plan.target.applicationName, resolvedBy), outcome: "TARGET_NOT_FOUND", executed: false, blocked: { phase: "resolve", reason: "application-one returned no application record for the provided applicationId" }, rollback: { available: false, performed: false } });
    }
    applicationSummary = pickApplicationSummary(r.result);
  } else {
    const searchName = plan.target.applicationName as string;
    const r = await callPrimitive("application-search", { name: searchName, limit: MAX_SEARCH_RESULTS });
    if (!r.ok) {
      timings.resolveMs = now() - resolveStart;
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget("", searchName, "application-search"), outcome: "UPSTREAM_ERROR", executed: false, upstream: { phase: "resolve", primitive: "application-search", status: r.status, error: r.error }, rollback: { available: false, performed: false } });
    }
    const results = extractSearchResults(r.result);
    if (results === null) {
      timings.resolveMs = now() - resolveStart;
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget("", searchName, "application-search"), outcome: "UPSTREAM_ERROR", executed: false, upstream: { phase: "resolve", primitive: "application-search", status: r.status, error: "application-search returned an unexpected shape" }, rollback: { available: false, performed: false } });
    }
    if (results.length === 0) {
      timings.resolveMs = now() - resolveStart;
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget("", searchName, "application-search"), outcome: "TARGET_NOT_FOUND", executed: false, blocked: { phase: "resolve", reason: "application-search returned zero candidates" }, candidates: [], rollback: { available: false, performed: false } });
    }
    const exactMatches = results.filter((candidate) => typeof candidate.name === "string" && candidate.name.toLowerCase() === searchName.toLowerCase());
    const chosen = exactMatches.length === 1 ? exactMatches : results;
    if (chosen.length !== 1) {
      timings.resolveMs = now() - resolveStart;
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      const candidates = chosen.slice(0, MAX_CANDIDATES_SHOWN).map((candidate) => ({
        applicationId: asString(candidate.applicationId) ?? asString(candidate.id),
        name: typeof candidate.name === "string" ? candidate.name : null,
        appName: typeof candidate.appName === "string" ? candidate.appName : null,
      }));
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget("", searchName, "application-search"), outcome: "AMBIGUOUS_TARGET", executed: false, blocked: { phase: "resolve", reason: `application-search matched ${chosen.length} candidates; ambiguous target is never silently resolved` }, candidates, rollback: { available: false, performed: false } });
    }
    const candidate = chosen[0];
    const candidateId = asString(candidate.applicationId) ?? asString(candidate.id);
    if (candidateId === null) {
      timings.resolveMs = now() - resolveStart;
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget("", searchName, "application-search"), outcome: "UPSTREAM_ERROR", executed: false, upstream: { phase: "resolve", primitive: "application-search", status: r.status, error: "unique candidate has no application identifier" }, rollback: { available: false, performed: false } });
    }
    applicationId = candidateId;
    resolvedBy = "application-search";
    const hydrate = await callPrimitive("application-one", { applicationId });
    timings.resolveMs = now() - resolveStart;
    if (!hydrate.ok) {
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget(applicationId, searchName, resolvedBy), outcome: "UPSTREAM_ERROR", executed: false, upstream: { phase: "resolve", primitive: "application-one", status: hydrate.status, error: hydrate.error }, rollback: { available: false, performed: false } });
    }
    if (!isRecord(hydrate.result)) {
      skippedPhases.push("pre-check", "plan", "risk", "change", "validation");
      return finish({ ok: false, mode: "plan", action: plan.action, target: baseTarget(applicationId, searchName, resolvedBy), outcome: "TARGET_NOT_FOUND", executed: false, blocked: { phase: "resolve", reason: "search matched a candidate but application-one returned no record" }, rollback: { available: false, performed: false } });
    }
    applicationSummary = pickApplicationSummary(hydrate.result);
  }
  note(`resolve: target resolved via ${resolvedBy} (applicationId=${applicationId})`);

  // ---- Phase 2: pre-check (read-only) ----
  const precheckStart = now();
  const deploymentsRead = await callPrimitive("deployment-all", { applicationId });
  if (!deploymentsRead.ok) {
    timings.precheckMs = now() - precheckStart;
    skippedPhases.push("plan", "risk", "change", "validation");
    return finish({ ok: false, mode: plan.execute ? "execute" : "plan", action: plan.action, target: baseTarget(applicationId, plan.target.applicationName, resolvedBy), before: { application: applicationSummary }, outcome: "UPSTREAM_ERROR", executed: false, upstream: { phase: "pre-check", primitive: "deployment-all", status: deploymentsRead.status, error: deploymentsRead.error }, rollback: { available: false, performed: false }, failSafeNote: "Pre-check could not read deployment state; mutation is never attempted without a trustworthy pre-check." });
  }
  const deployments = asDeploymentArray(deploymentsRead.result);
  const queueRead = await callPrimitive("deployment-queueList", {});
  const logsRead = await callPrimitive("application-readLogs", { applicationId, tail: LOG_TAIL });
  const appName = applicationSummary !== null && typeof applicationSummary.appName === "string" ? applicationSummary.appName : null;
  let monitoring: { available: boolean; reason?: string } = appName === null
    ? { available: false, reason: "appName unknown on application record; readAppMonitoring not attempted" }
    : { available: false, reason: "not yet read" };
  if (appName !== null) {
    const monitoringRead = await callPrimitive("application-readAppMonitoring", { appName });
    monitoring = monitoringRead.ok ? { available: true } : { available: false, reason: `readAppMonitoring unavailable (${monitoringRead.error})` };
  }
  const conflict = findInFlightConflict(deployments, now());
  const logsLineCount = typeof logsRead.result === "string" && logsRead.ok ? logsRead.result.split(/\r?\n/).length : Array.isArray(logsRead.result) && logsRead.ok ? logsRead.result.length : null;
  const logsRecentErrorMarker = typeof logsRead.result === "string" && logsRead.ok ? /error|fail/i.test(logsRead.result.slice(-4_000)) : null;
  timings.precheckMs = now() - precheckStart;
  note(`pre-check: deployments=${deployments.length} queueDepth=${Array.isArray(queueRead.result) ? queueRead.result.length : "indeterminable"} monitoring=${monitoring.available ? "available" : "unavailable"} conflict=${conflict ? "DETECTED" : "none-detected"}`);

  const failSafePrecheckNote = "Pre-check failure blocks the change; no mutation is ever attempted without a trustworthy pre-check.";
  if (conflict) {
    skippedPhases.push("plan", "risk", "change", "validation");
    return finish({
      ok: false,
      mode: plan.execute ? "execute" : "plan",
      action: plan.action,
      target: baseTarget(applicationId, plan.target.applicationName, resolvedBy),
      before: { application: applicationSummary, conflictDetected: true },
      outcome: "CHANGE_BLOCKED",
      executed: false,
      blocked: { phase: "pre-check", reason: "CONFLICTING_DEPLOYMENT_IN_FLIGHT", deployment: deploymentSummary(conflict) },
      rollback: { available: false, performed: false },
      failSafeNote: failSafePrecheckNote,
    });
  }

  const precheckObservedAt = now(); // DG01R: the observation the Guardian proposal binds to
  // ---- Phase 3: plan + risk (no mutation) ----
  const planStart = now();
  const lastDeployment = deploymentSummary(newestDeployment(deployments));
  const queueDepth = Array.isArray(queueRead.result) ? queueRead.result.length : null;
  const beforeBlock: Record<string, unknown> = {
    application: applicationSummary,
    lastDeployment,
    queueDepth,
    logsRecent: { primitive: "application-readLogs", tail: LOG_TAIL, lineCount: logsLineCount, recentErrorMarker: logsRecentErrorMarker },
    monitoring,
    conflictDetected: false,
  };
  const precheckChecks = [
    { check: "application-exists", result: "ok" },
    { check: "conflicting-deployment", result: "none-detected" },
    { check: "queue-depth", result: queueDepth === null ? "indeterminable" : String(queueDepth) },
    { check: "recent-logs", result: logsLineCount === null ? "unavailable" : `${logsLineCount} lines inspected (log content is never returned)` },
    { check: "monitoring", result: monitoring.available ? "available" : "unavailable" },
  ];
  const planBlock: Record<string, unknown> = {
    primitive: actionPolicy.primitive,
    args: { applicationId },
    effects: "Triggers a new Dokploy deployment (rebuild + redeploy) of the application; brief service interruption is possible.",
    preconditions: [
      { check: "application-exists", satisfied: true },
      { check: "no-conflicting-deployment", satisfied: true },
      { check: "approval-granted-when-executing", satisfied: plan.execute ? plan.approved : "n/a-plan-only" },
    ],
    validationPlan: [
      "application-one (state after change)",
      "deployment-all (newest deployment status)",
      "deployment-queueList (no residual conflict)",
      "application-readLogs (log metadata only)",
      "application-readAppMonitoring (when appName is known)",
      "externalHealth: unknown — no deterministically proven domain field on application records this sprint",
    ],
    backupAvailable: false,
    backupNote: "Backup applicability per app type is not proven this sprint; backups are NEVER executed here (vps.backup is a future supertool).",
  };
  timings.planMs = now() - planStart;

  // ---- Phase 4: approval gate + Guardian Core participation (DG01R) ----
  // The Guardian participates in EVERY gate outcome. Its intent is data-only;
  // the adapter is constructed internally from operator-owned state and can
  // never be supplied, replaced or configured by the caller (strict MCP input
  // schema + internal construction; deps are operator/test-only, the same
  // trust boundary as the transport). When the frozen Core package is not
  // resolvable in this runtime, refusals are enforced by the operator flow
  // itself and recorded honestly as unavailable.
  const gateSatisfied = plan.execute && plan.approved;
  const guardianCore = deps.guardianCore !== undefined ? { core: deps.guardianCore, error: null as string | null } : await loadGuardianCore();
  const guardianIntent = { action: plan.action, applicationId, approved: plan.approved, observedAt: precheckObservedAt, observedConflictDetected: false };
  const guardianDispatch: GuardianVpsDispatchRecord = { response: null, startedAt: 0, completedAt: 0, revalidation: null };
  const guardianAdapter = createGuardianVpsRedeployAdapter({
    transport,
    primitive: actionPolicy.primitive,
    applicationId,
    now,
    readDeployments: async () => {
      const read = await callPrimitive("deployment-all", { applicationId });
      return { ok: read.ok, status: read.status, error: read.error, deployments: read.ok ? asDeploymentArray(read.result) : [] };
    },
    findInFlightConflict: (deployments) => findInFlightConflict(deployments, now()),
    dispatchRecord: guardianDispatch,
    registerMutationPrimitive: (primitive) => primitivesInvoked.push(primitive),
  });
  if (!gateSatisfied) {
    let guardian: Record<string, unknown>;
    if (guardianCore.core === null) {
      guardian = { available: false, reason: guardianCore.error };
      note(`approval-gate: not satisfied (execute=${plan.execute}, approved=${plan.approved}); returning plan only, no mutation (guardian core unavailable; refusal enforced operator-side)`);
    } else {
      const guardianResult = await guardianCore.core.executeGuardianIntent(guardianIntent, guardianAdapter);
      guardian = guardianResult as unknown as Record<string, unknown>;
      note(`approval-gate: not satisfied (execute=${plan.execute}, approved=${plan.approved}); returning plan only, no mutation (guardian=${guardianResult.outcome})`);
    }
    skippedPhases.push("change", "validation");
    return finish({
      ok: true,
      mode: "plan",
      action: plan.action,
      target: baseTarget(applicationId, plan.target.applicationName, resolvedBy),
      before: beforeBlock,
      plan: planBlock,
      risk: actionPolicy.risk,
      approvalRequired: true,
      approvalGate: { required: true, satisfied: false, execute: plan.execute, approved: plan.approved },
      executed: false,
      primitive: actionPolicy.primitive,
      mutation: null,
      after: null,
      validation: { application: null, deployment: null, monitoring, externalHealth: "unknown", checks: precheckChecks },
      outcome: "PLANNED",
      guardian,
      rollback: { available: false, performed: false },
    });
  }

  // ---- Phase 5: change — dispatched ONLY through Guardian Core (DG01R) ----
  // FAIL-CLOSED: when the frozen Guardian Core is not importable in this
  // runtime, the mutation is NEVER dispatched (zero application-redeploy).
  // When present, the Core forwards the opaque proposal to the adapter — the
  // ONLY potentially mutating boundary — which re-proves the observation
  // against current state, dispatches the existing primitive exactly once and
  // reports the honest boundary truth. The existing post-validation (Phase 6)
  // still adjudicates the postcondition; the Guardian result is attached
  // verbatim as evidence.
  const mutationStart = now();
  if (guardianCore.core === null) {
    timings.mutationMs = now() - mutationStart;
    note("change: Guardian Core package is not importable in this runtime; mutation refused fail-closed (zero application-redeploy)");
    skippedPhases.push("validation");
    return finish({
      ok: false,
      mode: "execute",
      action: plan.action,
      target: baseTarget(applicationId, plan.target.applicationName, resolvedBy),
      before: beforeBlock,
      plan: planBlock,
      risk: actionPolicy.risk,
      approvalRequired: true,
      approvalGate: { required: true, satisfied: true, execute: true, approved: true },
      executed: false,
      primitive: actionPolicy.primitive,
      mutation: { attempted: false, occurred: false },
      guardian: { available: false, reason: guardianCore.error },
      after: null,
      validation: { application: null, deployment: null, monitoring: null, externalHealth: "unknown", checks: [{ check: "guardian-core", result: "unavailable; dispatch refused fail-closed; zero mutation" }] },
      outcome: "UPSTREAM_ERROR",
      upstream: { phase: "change", primitive: "guardian-core-load", status: 0, error: guardianCore.error ?? "GUARDIAN_CORE_UNAVAILABLE" },
      rollback: { available: false, performed: false },
      failSafeNote: "engineering.vps.change.safe never mutates without the Guardian Core; deliver the pinned dependency (memoryos-guardian-core v0.1.0, commit e10626c) into the runtime image to enable governed execution.",
    });
  }
  const guardian = await guardianCore.core.executeGuardianIntent(guardianIntent, guardianAdapter);
  timings.mutationMs = now() - mutationStart;
  if (guardian.outcome === "NOT_EXECUTED") {
    note(`change: Guardian Core refused before the mutating boundary (stage=${guardian.stage}, refusal=${guardian.refusal}); zero application-redeploy`);
    skippedPhases.push("validation");
    return finish({
      ok: false,
      mode: "execute",
      action: plan.action,
      target: baseTarget(applicationId, plan.target.applicationName, resolvedBy),
      before: beforeBlock,
      plan: planBlock,
      risk: actionPolicy.risk,
      approvalRequired: true,
      approvalGate: { required: true, satisfied: true, execute: true, approved: true },
      executed: false,
      primitive: actionPolicy.primitive,
      mutation: null,
      guardian,
      after: null,
      validation: { application: null, deployment: null, monitoring: null, externalHealth: "unknown", checks: [{ check: "post-check", result: "skipped: Guardian Core refused the dispatch; zero mutation" }] },
      outcome: "CHANGE_BLOCKED",
      blocked: { phase: "change", reason: guardian.stage === "COMPATIBILITY" ? "STATE_CHANGED_SINCE_PRECHECK" : "GUARDIAN_REFUSED_BEFORE_DISPATCH", stage: guardian.stage, refusal: guardian.refusal },
      rollback: { available: false, performed: false },
      failSafeNote: "Guardian Core NOT_EXECUTED is preserved verbatim: the mutating boundary was never reached (zero application-redeploy).",
    });
  }
  if (guardianDispatch.response === null) {
    note("change: Guardian Core could not re-prove the pre-check observation before dispatch; mutating boundary never reached (zero application-redeploy)");
    skippedPhases.push("validation");
    return finish({
      ok: false,
      mode: "execute",
      action: plan.action,
      target: baseTarget(applicationId, plan.target.applicationName, resolvedBy),
      before: beforeBlock,
      plan: planBlock,
      risk: actionPolicy.risk,
      approvalRequired: true,
      approvalGate: { required: true, satisfied: true, execute: true, approved: true },
      executed: false,
      primitive: actionPolicy.primitive,
      mutation: { attempted: false, occurred: false },
      guardian,
      after: null,
      validation: { application: null, deployment: null, monitoring: null, externalHealth: "unknown", checks: [{ check: "dispatch-revalidation", result: "failed; dispatch refused fail-closed; zero mutation" }] },
      outcome: "UPSTREAM_ERROR",
      upstream: { phase: "change-revalidation", primitive: "deployment-all", status: guardianDispatch.revalidation?.status ?? 0, error: guardianDispatch.revalidation?.error ?? "UNKNOWN" },
      rollback: { available: false, performed: false },
      failSafeNote: "Without a trustworthy dispatch-time re-proof the mutation is never attempted; no retry, no auto-recovery.",
    });
  }
  const mutationResponse = guardianDispatch.response;
  if (!mutationResponse.ok) {
    note(`change: ${actionPolicy.primitive} attempt failed (transport=${transport.name}, status=${mutationResponse.status}, error=${mutationResponse.error}); no further mutations are attempted`);
    skippedPhases.push("validation");
    return finish({
      ok: false,
      mode: "execute",
      action: plan.action,
      target: baseTarget(applicationId, plan.target.applicationName, resolvedBy),
      before: beforeBlock,
      plan: planBlock,
      risk: actionPolicy.risk,
      approvalRequired: true,
      approvalGate: { required: true, satisfied: true, execute: true, approved: true },
      executed: false,
      primitive: actionPolicy.primitive,
      guardian,
      mutation: { attempted: true, occurred: false, ok: false, transport: transport.name, status: mutationResponse.status, error: mutationResponse.error, durationMs: mutationResponse.durationMs },
      after: null,
      validation: { application: null, deployment: null, monitoring: null, externalHealth: "unknown", checks: [{ check: "post-check", result: "skipped: mutation attempt did not confirm success" }] },
      outcome: "UPSTREAM_ERROR",
      upstream: { phase: "change", primitive: actionPolicy.primitive, status: mutationResponse.status, error: mutationResponse.error },
      rollback: { available: false, performed: false },
      failSafeNote: "The mutation attempt did not confirm success and the real upstream state is unknown. This tool never retries or auto-recovers (vps.recover is a future supertool).",
    });
  }
  const mutationCompletedAt = guardianDispatch.completedAt;
  note(`change: ${actionPolicy.primitive} dispatched through Guardian Core executeGuardianIntent (transport=${transport.name}, status=${mutationResponse.status}, durationMs=${mutationResponse.durationMs}); boundary reached, occurrence UNDETERMINED at the boundary — post-validation adjudicates`);

  // ---- Phase 6: validation / post-check (read-only; a failed validation never triggers more mutations) ----
  const validationStart = now();
  const appAfterRead = await callPrimitive("application-one", { applicationId });
  const deploymentsAfterRead = await callPrimitive("deployment-all", { applicationId });
  const queueAfterRead = await callPrimitive("deployment-queueList", {});
  const logsAfterRead = await callPrimitive("application-readLogs", { applicationId, tail: LOG_TAIL });
  let monitoringAfter = monitoring;
  if (appName !== null) {
    const monitoringRead = await callPrimitive("application-readAppMonitoring", { appName });
    monitoringAfter = monitoringRead.ok ? { available: true } : { available: false, reason: `readAppMonitoring unavailable (${monitoringRead.error})` };
  }
  timings.validationMs = now() - validationStart;
  const appAfterOk = appAfterRead.ok && isRecord(appAfterRead.result);
  const appGone = appAfterRead.ok && !isRecord(appAfterRead.result);
  const appAfter = appAfterOk ? pickApplicationSummary(appAfterRead.result as Record<string, unknown>) : null;
  const deploymentsAfter = deploymentsAfterRead.ok ? asDeploymentArray(deploymentsAfterRead.result) : [];
  const postMutations = deploymentsAfter.filter((deployment) => {
    const created = parseTimestamp(deployment.createdAt);
    return created !== null && created >= mutationCompletedAt - timings.mutationMs - CLOCK_SKEW_GUARD_MS;
  });
  const newestPost = postMutations.length > 0 ? newestDeployment(postMutations) : null;
  let outcome: VpsOutcome;
  let outcomeReason: string;
  if (appGone) {
    outcome = "EXECUTED_FAILED";
    outcomeReason = "application record no longer retrievable after redeploy";
  } else if (appAfter === null && !deploymentsAfterRead.ok) {
    outcome = "EXECUTED_DEGRADED";
    outcomeReason = "post-check reads unavailable; executed change could not be validated";
  } else if (newestPost === null) {
    outcome = "EXECUTED_DEGRADED";
    outcomeReason = "no deployment with createdAt after the mutation start; new deployment not yet visible (not proven healthy)";
  } else {
    const classification = classifyStatus(newestPost.status);
    if (classification === "failed") {
      outcome = "EXECUTED_FAILED";
      outcomeReason = `newest post-mutation deployment status='${String(newestPost.status)}' classified failed`;
    } else if (classification === "success") {
      outcome = "EXECUTED_HEALTHY";
      outcomeReason = `newest post-mutation deployment status='${String(newestPost.status)}' classified success`;
    } else {
      outcome = "EXECUTED_DEGRADED";
      outcomeReason = `newest post-mutation deployment status='${String(newestPost.status)}' is in progress or unrecognized; not proven healthy`;
    }
  }
  note(`validation: outcome=${outcome} (${outcomeReason})`);
  const newestPostSummary = deploymentSummary(newestPost);
  const logsAfterLineCount = typeof logsAfterRead.result === "string" && logsAfterRead.ok ? logsAfterRead.result.split(/\r?\n/).length : Array.isArray(logsAfterRead.result) && logsAfterRead.ok ? logsAfterRead.result.length : null;
  const validationChecks = [
    { check: "application-one-after", result: appAfterOk ? "ok" : appGone ? "missing-after-change" : "unavailable" },
    { check: "deployment-newest-after", result: newestPostSummary === null ? "not-yet-visible" : String(newestPostSummary.classification) },
    { check: "queue-after", result: Array.isArray(queueAfterRead.result) ? (queueAfterRead.result.some((entry) => isRecord(entry) && (entry.applicationId === applicationId || entry.id === applicationId)) ? "entries-for-application-present" : "no-matching-entries") : "indeterminable" },
    { check: "recent-logs-after", result: logsAfterLineCount === null ? "unavailable" : `${logsAfterLineCount} lines inspected (log content is never returned)` },
    { check: "monitoring-after", result: monitoringAfter.available ? "available" : "unavailable" },
    { check: "external-health", result: "unknown", reason: plan.externalHealthRequested ? "requested; not determinable this sprint (no proven domain field on application records)" : "not requested; not determinable this sprint" },
  ];
  return finish({
    ok: outcome === "EXECUTED_HEALTHY" || outcome === "EXECUTED_DEGRADED",
    mode: "execute",
    action: plan.action,
    target: baseTarget(applicationId, plan.target.applicationName, resolvedBy),
    before: beforeBlock,
    plan: planBlock,
    risk: actionPolicy.risk,
    approvalRequired: true,
    approvalGate: { required: true, satisfied: true, execute: true, approved: true },
    executed: true,
    primitive: actionPolicy.primitive,
    guardian,
    mutation: { attempted: true, occurred: true, ok: true, transport: transport.name, status: mutationResponse.status, durationMs: mutationResponse.durationMs },
    after: {
      application: appAfter,
      newestDeployment: newestPostSummary,
      queueDepth: Array.isArray(queueAfterRead.result) ? queueAfterRead.result.length : null,
      logsRecent: { primitive: "application-readLogs", tail: LOG_TAIL, lineCount: logsAfterLineCount },
    },
    validation: {
      application: appAfter,
      deployment: newestPostSummary,
      monitoring: monitoringAfter,
      externalHealth: "unknown",
      checks: validationChecks,
    },
    outcome,
    outcomeReason,
    rollback: { available: false, performed: false },
    failSafeNote: "Validation is read-only and never triggers further mutations; recovery is the responsibility of the future vps.recover supertool.",
  });
}
