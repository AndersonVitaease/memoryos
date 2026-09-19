// UNIT-CREDENTIAL-01: engineering.vps.systemd.credential — MCP-side module for
// governed registration of a systemd LoadCredential= directive via a per-unit
// drop-in (/etc/systemd/system/<unit>.d/credentials.conf). The base unit is NEVER
// edited and no service is EVER restarted here: LoadCredential is consumed at unit
// start, so the drop-in takes effect on the unit's next start — for the release
// runner that restart is the job of the existing engineering.vps.runner.restart.
//
// The host-side executor is the release runner's unit_credential operation
// (scripts/eng-mcp-unit-credential.mjs) over the official Unix socket; this module
// mirrors its grammars and typed codes fail-closed BEFORE any byte leaves the MCP
// boundary. The credential VALUE never crosses the tool boundary — only its path,
// size, mode and 16-hex sha256 prefix are reported (VPS-SECRET-WRITE-01 no-leak
// pattern).
//
// Governance: PLAN (execute defaults to false) is read-only (unit parsed, credential
// validated against the allowlisted source dir, desired drop-in + diff + baseline
// systemd-analyze verify); mutation requires execute=true AND approval.approved=true
// (collapsed runner-side into one flat execute boolean). Idempotence: a
// byte-identical drop-in is a NO_OP with zero mutation (mtime preserved, no
// daemon-reload).

import * as z from "zod/v4";
import { EngineeringError } from "./policy.js";
import { redactSensitive } from "./vpsTransport.ts";

export const VPS_SYSTEMD_CREDENTIAL_PLAN_REQUIRES = ["execute=true", "approval.approved=true"] as const;
export const VPS_SYSTEMD_CREDENTIAL_SCOPE = "engineering:vps:systemd:credential" as const;

const UNIT_GRAMMAR = /^[A-Za-z0-9][A-Za-z0-9@._-]{0,127}$/;
const CREDENTIAL_ID_GRAMMAR = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const UNIT_PATH_GRAMMAR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CRITICAL_UNIT_NAMES: ReadonlySet<string> = new Set(["eng-mcp-release-runner.service"]);

export const vpsSystemdCredentialInputSchema = z.object({
  unit: z.string().min(1).max(128),
  credentialId: z.string().min(1).max(64),
  unitPath: z.string().min(1).max(64).optional(),
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional()
}).strict();

export type VpsSystemdCredentialInput = z.infer<typeof vpsSystemdCredentialInputSchema>;
export type VpsSystemdCredentialStatus = "PLAN" | "WRITE" | "NO_OP" | "BLOCKED" | "FAILED" | "REJECTED" | "UNAVAILABLE";

// Frozen at the MCP layer as well (same convention as the Item-3 security block).
const SECURITY_BLOCK = { secretsRedacted: true, credentialValueReturned: false, baseUnitNeverEdited: true, noServiceRestart: true, freeCommandImpossible: true } as const;

export type VpsSystemdCredentialFinding = { code: string; detail?: string };
export type VpsSystemdCredentialDeps = {
  runRunner: (operation: "unit_credential", jobId?: string, params?: Record<string, unknown>) => Promise<{ httpStatus: number; body: any }>;
};

function fail(code: string): never {
  throw new EngineeringError(code);
}

function bounded(value: unknown, limit: number): string | null {
  const text = typeof value === "string" ? value : "";
  if (text.length === 0) return null;
  return text.length > limit ? `${text.slice(0, limit)}…[bounded]` : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// Mirror of the release-side grammars (scripts/eng-mcp-unit-credential.mjs) — same
// typed codes. The child re-validates authoritatively; this mirror refuses before
// the socket.
export function validateUnitCredentialRequest(input: VpsSystemdCredentialInput): VpsSystemdCredentialInput {
  if (!UNIT_GRAMMAR.test(input.unit) || input.unit.includes("..")) fail("UC_UNIT_INVALID");
  if (!CREDENTIAL_ID_GRAMMAR.test(input.credentialId) || input.credentialId.includes("..")) fail("UC_CREDENTIAL_ID_INVALID");
  if (input.unitPath !== undefined && (!UNIT_PATH_GRAMMAR.test(input.unitPath) || input.unitPath.includes(".."))) fail("UC_UNIT_PATH_INVALID");
  return input;
}

// The runner carries the child's JSON as the stdout TEXT (the real socket contract,
// same as container_probe/inspect). A structured double carrying a nested
// unitCredentialResult is equally honest — both are accepted, neither is invented.
function extractChildPayload(body: unknown): Record<string, unknown> | null {
  const record = asRecord(body);
  if (!record) return null;
  const nested = asRecord(record.unitCredentialResult);
  if (nested) return nested;
  if (typeof record.stdout === "string") {
    try {
      const parsed = asRecord(JSON.parse(record.stdout));
      if (parsed && parsed.action === "unit_credential") return parsed;
    } catch { /* stdout is not the child's JSON envelope — fall through */ }
  }
  return null;
}

// Item-3 key pattern: redactSensitive runs BEFORE the security block is attached
// (its key pattern would otherwise redact the block's own keys).
function finalize(result: Record<string, unknown>) {
  return { ...(redactSensitive(result) as Record<string, unknown>), security: SECURITY_BLOCK };
}

export async function runVpsSystemdCredential(rawInput: unknown, deps: VpsSystemdCredentialDeps) {
  const input = vpsSystemdCredentialInputSchema.parse(rawInput);
  validateUnitCredentialRequest(input);
  const mutationApproved = input.execute === true && input.approval?.approved === true;
  const findings: VpsSystemdCredentialFinding[] = [];
  const forward: Record<string, unknown> = {
    unit: input.unit,
    credentialId: input.credentialId,
    ...(input.unitPath !== undefined ? { unitPath: input.unitPath } : {}),
    execute: mutationApproved,
    // The runner-side gate collapses execute=true back to false when approval is
    // absent from the forwarded params; relay the user's approval so an approved
    // mutation actually reaches the operation layer (v94 live E2E: EXECUTE degraded
    // to PLAN because the approval never crossed the seam).
    ...(mutationApproved ? { approval: { approved: true } } : {})
  };
  const result: Record<string, unknown> = {
    unit: input.unit,
    credentialId: input.credentialId,
    ...(input.unitPath !== undefined ? { unitPath: input.unitPath } : {}),
    executeRequested: mutationApproved,
    mutationPerformed: false
  };

  let httpStatus = 0;
  let body: unknown = null;
  try {
    const answer = await deps.runRunner("unit_credential", undefined, forward);
    httpStatus = answer.httpStatus;
    body = answer.body;
  } catch (error) {
    const findings2 = [...findings, { code: "UC_TRANSPORT_FAILED", detail: bounded((error as Error)?.message, 300) ?? "release runner unreachable" }];
    return finalize({ ...result, status: "UNAVAILABLE", findings: findings2 });
  }
  const envelope = asRecord(body) ?? {};
  if (httpStatus === 409) {
    return finalize({ ...result, status: "FAILED", findings: [...findings, { code: "UC_BUSY", detail: bounded(envelope.error, 200) ?? "another unit_credential action is in flight" }] });
  }
  if (httpStatus === 400) {
    return finalize({ ...result, status: "REJECTED", findings: [...findings, { code: "UC_RUNNER_REJECTED", detail: bounded(envelope.error, 300) ?? "runner refused the request" }] });
  }
  const child = extractChildPayload(body);
  if (!child) {
    return finalize({ ...result, status: "FAILED", findings: [...findings, { code: "UC_RESULT_UNPARSEABLE", detail: bounded(envelope.error ?? envelope.stderr ?? envelope.stdout, 400) ?? `runner answered ${httpStatus}` }] });
  }

  const childStatus = typeof child.status === "string" ? child.status : null;
  const status: VpsSystemdCredentialStatus = childStatus === "PLAN" || childStatus === "WRITE" || childStatus === "NO_OP" || childStatus === "BLOCKED" ? childStatus : "FAILED";
  for (const raw of Array.isArray(child.findings) ? child.findings : []) {
    const finding = asRecord(raw);
    if (finding && typeof finding.code === "string") findings.push({ code: finding.code, ...(typeof finding.detail === "string" ? { detail: finding.detail } : {}) });
  }
  if (status === "FAILED") findings.push({ code: "UC_RUNNER_FAILED", detail: "the child action reported FAILED (see verify/apply evidence)" });

  return finalize({
    ...result,
    status,
    exitCode: typeof envelope.exitCode === "number" ? envelope.exitCode : null,
    mutationPerformed: child.mutationPerformed === true,
    ...(child.possible !== undefined ? { possible: child.possible } : {}),
    ...(child.unitPath !== undefined ? { unitPath: child.unitPath } : {}),
    ...(asRecord(child.credential) ? { credential: child.credential } : {}),
    ...(typeof child.desiredLine === "string" ? { desiredLine: child.desiredLine } : {}),
    ...(typeof child.dropinContent === "string" ? { dropinContent: child.dropinContent } : {}),
    ...(asRecord(child.planDiff) ? { planDiff: child.planDiff } : {}),
    ...(asRecord(child.existingDropin) ? { existingDropin: child.existingDropin } : {}),
    ...(Array.isArray(child.existingSameName) ? { existingSameName: child.existingSameName } : {}),
    ...(asRecord(child.baseVerify) ? { baseVerify: child.baseVerify } : {}),
    ...(asRecord(child.verify) ? { verify: child.verify } : {}),
    ...(typeof child.daemonReloaded === "boolean" ? { daemonReloaded: child.daemonReloaded } : {}),
    ...(typeof child.wrote === "boolean" ? { wrote: child.wrote } : {}),
    ...(typeof child.isActive === "string" ? { isActive: child.isActive } : {}),
    ...(typeof child.isActiveBefore === "string" ? { isActiveBefore: child.isActiveBefore } : {}),
    ...(typeof child.isActiveAfter === "string" ? { isActiveAfter: child.isActiveAfter } : {}),
    ...(typeof child.byteIdentical === "boolean" ? { byteIdentical: child.byteIdentical } : {}),
    ...(typeof child.verifyRolledBack === "boolean" ? { verifyRolledBack: child.verifyRolledBack } : {}),
    ...(child.dropinFile !== undefined ? { dropinFile: child.dropinFile } : {}),
    ...(child.dropinDir !== undefined ? { dropinDir: child.dropinDir } : {}),
    ...(child.unitFile !== undefined ? { unitFile: child.unitFile } : {}),
    ...(typeof child.criticalUnit === "boolean" ? { criticalUnit: child.criticalUnit } : {}),
    ...(typeof child.requiresRestart === "boolean" ? { requiresRestart: child.requiresRestart } : {}),
    ...(typeof child.restartNote === "string" ? { restartNote: child.restartNote } : {}),
    findings
  });
}