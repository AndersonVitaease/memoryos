// ITEM-2: engineering.vps.container.probe — MCP-side module for one-off, read-only
// probes of LOCAL eng-mcp-candidate:* images through a disposable container.
//
// The command is INEXPRESSIBLE: no caller field reaches docker beyond
// {image, probe, path, maxBytes}. The docker argv is frozen host-side (PROBE_SPECS
// + PROBE_ISOLATION in scripts/eng-mcp-release.mjs, spawned with shell:false) and
// the isolation flags are structural (--rm --network none --read-only --user
// 65534:65534 --cap-drop ALL --security-opt no-new-privileges --memory 256m
// --pids-limit 64). The constants below are kept in structural sync with that
// file — the child re-validates authoritatively; this mirror fails closed EARLIER
// (before any byte leaves the MCP boundary). Zero mutation; the image is never
// pulled; outputs are sanitized at both layers (child sanitizeSecrets + key-based
// redactSensitive).

import * as z from "zod/v4";
import { EngineeringError } from "./policy.js";
import { redactSensitive } from "./vpsTransport.ts";

export const VPS_CONTAINER_PROBE_PROBES = ["file_stat", "read_text", "list_dir"] as const;
export type VpsContainerProbeKind = (typeof VPS_CONTAINER_PROBE_PROBES)[number];

const PROBE_IMAGE_PREFIX = "eng-mcp-candidate:";
const PROBE_IMAGE_REST = /^[A-Za-z0-9._:-]{1,200}$/;
const PROBE_PATH_GRAMMAR = /^\/[A-Za-z0-9._/@+-]{1,256}$/;
const PROBE_PATH_DENYLIST_SEGMENTS = [".env", ".npmrc", ".ssh", ".aws", ".gnupg", ".netrc", ".git-credentials", "id_rsa", "id_ed25519", "id_ecdsa", "credentials"];
const PROBE_PATH_DENYLIST_SUBSTRING = /token|secret|password|credential/i;
const PROBE_OUTPUT_DISPLAY_LIMIT = 12_000;

export const vpsContainerProbeInputSchema = z.object({
  image: z.string().min(1).max(220),
  probe: z.enum(VPS_CONTAINER_PROBE_PROBES),
  path: z.string().min(1).max(256),
  maxBytes: z.number().int().min(1).max(4_096).optional()
}).strict();

export type VpsContainerProbeInput = z.infer<typeof vpsContainerProbeInputSchema>;
export type VpsContainerProbeStatus = "OK" | "NOT_FOUND" | "BINARY_REFUSED" | "FAILED" | "REJECTED" | "UNAVAILABLE";

// Frozen at the MCP layer as well (same convention as the Item-3 security block).
const SECURITY_BLOCK = { secretsRedacted: true, environmentValuesReturned: false, readOnly: true, freeCommandImpossible: true } as const;

export type VpsContainerProbeFinding = { code: string; detail?: string };
export type VpsContainerProbeDeps = {
  runRunner: (operation: "container_probe", jobId?: string, params?: Record<string, unknown>) => Promise<{ httpStatus: number; body: any }>;
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

// Mirror of the release-side validation (scripts/eng-mcp-release.mjs
// validateContainerProbeParams) — same grammar, same denylist, same typed codes.
// The child re-validates authoritatively; this mirror refuses before the socket.
export function validateProbeRequest(input: VpsContainerProbeInput): VpsContainerProbeInput {
  if (!input.image.startsWith(PROBE_IMAGE_PREFIX)) fail("PROBE_TARGET_NOT_ALLOWLISTED");
  if (!PROBE_IMAGE_REST.test(input.image.slice(PROBE_IMAGE_PREFIX.length))) fail("PROBE_PARAM_INVALID");
  if (!PROBE_PATH_GRAMMAR.test(input.path) || input.path.includes("..")) fail("PROBE_PARAM_INVALID");
  if (input.path.split("/").some((segment) => PROBE_PATH_DENYLIST_SEGMENTS.includes(segment)) || PROBE_PATH_DENYLIST_SUBSTRING.test(input.path)) fail("PROBE_SENSITIVE_PATH_DENIED");
  if (input.probe === "read_text") {
    if (input.maxBytes !== undefined && (!Number.isInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 4_096)) fail("PROBE_PARAM_INVALID");
  } else if (input.maxBytes !== undefined) {
    fail("PROBE_PARAM_INVALID");
  }
  return input;
}

// The runner carries the release action's JSON as the child's stdout TEXT (the real
// socket contract, same as inspect). Structured bodies (test doubles) are equally
// honest envelopes — both are accepted; neither is invented.
function extractProbePayload(body: unknown): Record<string, unknown> | null {
  const record = asRecord(body);
  if (!record) return null;
  const nested = asRecord(record.probeResult);
  if (nested) return nested;
  if (typeof record.stdout === "string") {
    try {
      const parsed = asRecord(JSON.parse(record.stdout));
      if (parsed && ("probe" in parsed || "exists" in parsed || "exitCode" in parsed)) return parsed;
    } catch { /* stdout is not the child's JSON envelope — fall through */ }
  }
  return null;
}

// Item-3 key pattern: redactSensitive runs BEFORE the security block is attached
// (its key pattern would otherwise redact the block's own keys).
function finalize(result: Record<string, unknown>) {
  return { ...(redactSensitive(result) as Record<string, unknown>), security: SECURITY_BLOCK };
}

export async function runVpsContainerProbe(rawInput: unknown, deps: VpsContainerProbeDeps) {
  const input = vpsContainerProbeInputSchema.parse(rawInput);
  const params = validateProbeRequest(input);
  const findings: VpsContainerProbeFinding[] = [];
  let status: VpsContainerProbeStatus = "OK";
  const forward: Record<string, unknown> = { image: params.image, probe: params.probe, path: params.path };
  if (params.maxBytes !== undefined) forward.maxBytes = params.maxBytes;

  const result: Record<string, unknown> = {
    probe: params.probe,
    image: params.image,
    path: params.path,
    ...(params.probe === "read_text" && params.maxBytes !== undefined ? { maxBytes: params.maxBytes } : {}),
    mutationPerformed: false
  };

  let httpStatus = 0;
  let body: unknown = null;
  try {
    const answer = await deps.runRunner("container_probe", undefined, forward);
    httpStatus = answer.httpStatus;
    body = answer.body;
  } catch (error) {
    status = "UNAVAILABLE";
    findings.push({ code: "PROBE_TRANSPORT_FAILED", detail: bounded((error as Error)?.message, 300) ?? "transport failure" });
    return finalize({ ...result, status, findings });
  }

  const envelope = asRecord(body) ?? {};
  if (httpStatus === 409) {
    status = "FAILED";
    findings.push({ code: "PROBE_BUSY", detail: bounded(envelope.error, 200) ?? "another probe is in flight" });
  } else if (httpStatus === 400) {
    status = "REJECTED";
    findings.push({ code: "PROBE_RUNNER_REJECTED", detail: bounded(envelope.error, 300) ?? "runner refused the request" });
  } else if (httpStatus !== 200 || envelope.success === false) {
    status = "FAILED";
    findings.push({ code: "PROBE_RUNNER_FAILED", detail: bounded(envelope.error ?? envelope.stderr ?? (asRecord(envelope.job)?.error), 300) ?? `runner answered ${httpStatus}` });
  } else {
    const probeResult = extractProbePayload(body);
    if (!probeResult) {
      status = "FAILED";
      findings.push({ code: "PROBE_RESULT_UNPARSEABLE", detail: "the runner envelope did not carry the child's JSON result" });
    } else {
      const exitCode = typeof probeResult.exitCode === "number" ? probeResult.exitCode : null;
      const timedOut = probeResult.timedOut === true;
      const cleanupVerified = probeResult.cleanupVerified !== false;
      const binaryRefused = probeResult.binaryRefused === true;
      const exists = typeof probeResult.exists === "boolean" ? probeResult.exists : undefined;
      const stdout = bounded(probeResult.stdout, PROBE_OUTPUT_DISPLAY_LIMIT);
      const stderr = bounded(probeResult.stderr, PROBE_OUTPUT_DISPLAY_LIMIT);

      if (timedOut) {
        status = "FAILED";
        findings.push({ code: "PROBE_TIMEOUT" });
      } else if (params.probe === "file_stat" && exists === false) {
        status = "NOT_FOUND";
      } else if (exitCode !== 0) {
        status = "FAILED";
        findings.push({ code: "PROBE_NONZERO_EXIT", detail: bounded(stderr, 300) ?? `exit ${exitCode}` });
      }
      if (binaryRefused) {
        status = "BINARY_REFUSED";
        findings.push({ code: "PROBE_BINARY_REFUSED", detail: "container output contains undecodable bytes; content withheld" });
      }
      if (!cleanupVerified) findings.push({ code: "PROBE_CLEANUP_UNVERIFIED" });
      if (probeResult.truncated === true) findings.push({ code: "PROBE_OUTPUT_TRUNCATED" });

      Object.assign(result, {
        status,
        exitCode,
        ...(exists !== undefined ? { exists } : {}),
        timedOut,
        cleanupVerified,
        binaryRefused,
        redacted: true,
        ...(stdout !== null && !binaryRefused ? { stdout } : {}),
        ...(stderr !== null ? { stderr } : {}),
        imageEvidence: { imageId: probeResult.imageId ?? null, repoDigests: probeResult.repoDigests ?? null },
        ...(typeof probeResult.containerName === "string" ? { containerName: probeResult.containerName } : {}),
        ...(typeof probeResult.durationMs === "number" ? { durationMs: probeResult.durationMs } : {}),
        ...(asRecord(probeResult.probesLog) ? { probesLog: probeResult.probesLog } : {})
      });
    }
  }
  return finalize({ ...result, status, findings });
}
