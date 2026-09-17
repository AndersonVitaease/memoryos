import { test } from "node:test";
import assert from "node:assert/strict";
import { PROBE_ISOLATION, PROBE_SPECS, validateContainerProbeParams } from "../scripts/eng-mcp-release.mjs";
import { VPS_CONTAINER_PROBE_PROBES, runVpsContainerProbe, validateProbeRequest, vpsContainerProbeInputSchema } from "../src/vpsContainerProbe.ts";

const VALID = { image: "eng-mcp-candidate:candidate-x", probe: "file_stat" as const, path: "/app/package.json" };

function double(answer: { httpStatus: number; body: unknown }) {
  const calls: Array<{ operation: "container_probe"; jobId?: string; params?: Record<string, unknown> }> = [];
  return {
    calls,
    runRunner: async (operation: "container_probe", jobId?: string, params?: Record<string, unknown>) => {
      calls.push({ operation, jobId, params });
      return { httpStatus: answer.httpStatus, body: answer.body };
    }
  };
}

// The REAL socket contract: the runner answers with the release child's stdout as
// TEXT — the child's JSON result travels inside body.stdout as a string.
function probeBody(probeResult: Record<string, unknown>) {
  return { operation: "container_probe", success: true, exitCode: 0, durationMs: 120, truncated: false, timedOut: false, stdout: JSON.stringify(probeResult), stderr: "", job: { jobId: "job-1", operation: "container_probe", status: "success" } };
}

test("container probe schema is strict: valid input parses, extra keys are refused", () => {
  const parsed = vpsContainerProbeInputSchema.parse({ ...VALID });
  assert.equal(parsed.probe, "file_stat");
  assert.throws(() => vpsContainerProbeInputSchema.parse({ ...VALID, command: "sh" }));
  assert.deepEqual([...VPS_CONTAINER_PROBE_PROBES], ["file_stat", "read_text", "list_dir"]);
});

test("image allowlist: only LOCAL eng-mcp-candidate:* tags pass both mirrors", () => {
  validateProbeRequest({ ...VALID });
  validateContainerProbeParams({ ...VALID });
  for (const bad of ["memoryos-eng-mcp:latest", "docker.io/library/alpine:3", "eng-mcp-candidate"]) {
    assert.throws(() => validateProbeRequest({ ...VALID, image: bad }), /PROBE_TARGET_NOT_ALLOWLISTED/);
    assert.throws(() => validateContainerProbeParams({ ...VALID, image: bad }), /PROBE_TARGET_NOT_ALLOWLISTED/);
  }
  assert.throws(() => validateProbeRequest({ ...VALID, image: "eng-mcp-candidate:x y" }), /PROBE_PARAM_INVALID/);
  assert.throws(() => validateContainerProbeParams({ ...VALID, image: "eng-mcp-candidate:x y" }), /PROBE_PARAM_INVALID/);
});

test("path grammar + sensitive denylist: traversal and secret paths are refused by both mirrors", () => {
  validateProbeRequest({ ...VALID, path: "/app/src/main.ts" });
  for (const bad of ["app/src/main.ts", "/app/../etc/passwd", "/root/.ssh/id_rsa", "/app/credentials.json", "/app/token-store"]) {
    assert.throws(() => validateProbeRequest({ ...VALID, path: bad }), /PROBE_(PARAM_INVALID|SENSITIVE_PATH_DENIED)/);
    assert.throws(() => validateContainerProbeParams({ ...VALID, path: bad }), /PROBE_(PARAM_INVALID|SENSITIVE_PATH_DENIED)/);
  }
});

test("maxBytes rules: read_text defaults/bounds; other probes refuse it entirely", () => {
  validateProbeRequest({ ...VALID, probe: "read_text", path: "/app/package.json", maxBytes: 4_096 });
  validateContainerProbeParams({ ...VALID, probe: "read_text", path: "/app/package.json" });
  assert.throws(() => validateProbeRequest({ ...VALID, probe: "read_text", maxBytes: 4_097 }), /PROBE_PARAM_INVALID/);
  assert.throws(() => validateContainerProbeParams({ ...VALID, probe: "read_text", maxBytes: 4_097 }), /PROBE_PARAM_INVALID/);
  assert.throws(() => validateProbeRequest({ ...VALID, maxBytes: 1_024 }), /PROBE_PARAM_INVALID/);
  assert.throws(() => validateContainerProbeParams({ ...VALID, maxBytes: 1_024 }), /PROBE_PARAM_INVALID/);
});

test("probe allowlist: unknown probe kinds are refused (child code PROBE_NOT_ALLOWLISTED)", () => {
  assert.throws(() => validateContainerProbeParams({ ...VALID, probe: "run" }), /PROBE_NOT_ALLOWLISTED/);
  assert.throws(() => vpsContainerProbeInputSchema.parse({ ...VALID, probe: "sh" }));
});

test("the docker argv is structurally frozen: isolation flags + dumb per-probe entrypoints", () => {
  assert.deepEqual([...PROBE_ISOLATION], ["--rm", "--network", "none", "--read-only", "--user", "65534:65534", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--memory", "256m", "--pids-limit", "64"]);
  assert.equal(PROBE_SPECS.file_stat.entrypoint, "ls");
  assert.equal(PROBE_SPECS.read_text.entrypoint, "head");
  assert.deepEqual([...PROBE_SPECS.file_stat.argsFor({ path: "/app/package.json", maxBytes: undefined })], ["-ld", "--", "/app/package.json"]);
  assert.deepEqual([...PROBE_SPECS.read_text.argsFor({ path: "/app/package.json", maxBytes: 4_096 })], ["-c", "4096", "--", "/app/package.json"]);
  assert.deepEqual([...PROBE_SPECS.list_dir.argsFor({ path: "/app/src", maxBytes: undefined })], ["-la", "--", "/app/src"]);
});

test("file_stat OK: the real stdout-JSON envelope is parsed and NOTHING beyond {image, probe, path} is forwarded", async () => {
  const stub = double({ httpStatus: 200, body: probeBody({ probe: "file_stat", image: VALID.image, path: VALID.path, exitCode: 0, exists: true, timedOut: false, truncated: false, cleanupVerified: true, imageId: "sha256:abcdef", repoDigests: "", containerName: "mcp-probe-1a2b3c4d", durationMs: 120 }) });
  const result = await runVpsContainerProbe({ ...VALID }, stub);
  assert.equal(stub.calls.length, 1);
  assert.deepEqual(stub.calls[0], { operation: "container_probe", jobId: undefined, params: { image: VALID.image, probe: "file_stat", path: VALID.path } });
  assert.equal(result.status, "OK");
  assert.equal(result.exists, true);
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.security.freeCommandImpossible, true);
  assert.deepEqual(result.findings, []);
});

test("file_stat on a missing path is an honest NOT_FOUND, not an error", async () => {
  const stub = double({ httpStatus: 200, body: probeBody({ probe: "file_stat", exitCode: 2, exists: false, timedOut: false, truncated: false, cleanupVerified: true }) });
  const result = await runVpsContainerProbe({ ...VALID }, stub);
  assert.equal(result.status, "NOT_FOUND");
  assert.equal(result.exists, false);
});

test("structured bodies (probeResult nested) are equally honest envelopes", async () => {
  const stub = double({ httpStatus: 200, body: { operation: "container_probe", success: true, exitCode: 0, probeResult: { probe: "file_stat", exitCode: 0, exists: true, timedOut: false, cleanupVerified: true } } });
  const result = await runVpsContainerProbe({ ...VALID }, stub);
  assert.equal(result.status, "OK");
  assert.deepEqual(result.findings, []);
});

test("a runner without the container_probe operation answers 400 -> REJECTED (honest, never OK)", async () => {
  const stub = double({ httpStatus: 400, body: { error: "RELEASE_ACTION_INVALID" } });
  const result = await runVpsContainerProbe({ ...VALID }, stub);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "PROBE_RUNNER_REJECTED"));
});

test("PROBE_BUSY: a concurrent probe is refused with 409 and surfaces as PROBE_BUSY", async () => {
  const stub = double({ httpStatus: 409, body: { operation: "container_probe", success: false, error: "PROBE_BUSY" } });
  const result = await runVpsContainerProbe({ ...VALID }, stub);
  assert.equal(result.status, "FAILED");
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "PROBE_BUSY"));
});

test("runner 502 (child threw) surfaces as FAILED with PROBE_RUNNER_FAILED", async () => {
  const stub = double({ httpStatus: 502, body: { operation: "container_probe", success: false, exitCode: 1, stderr: "PROBE_TARGET_NOT_LOCAL:eng-mcp-candidate:missing" } });
  const result = await runVpsContainerProbe({ ...VALID, image: "eng-mcp-candidate:missing" }, stub);
  assert.equal(result.status, "FAILED");
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "PROBE_RUNNER_FAILED"));
});

test("transport failure surfaces as UNAVAILABLE, never invented success", async () => {
  const result = await runVpsContainerProbe({ ...VALID }, { runRunner: async () => { throw new Error("RELEASE_REQUEST_TIMEOUT"); } });
  assert.equal(result.status, "UNAVAILABLE");
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "PROBE_TRANSPORT_FAILED"));
});

test("read_text forwards maxBytes and returns the bounded, child-sanitized content", async () => {
  const stub = double({ httpStatus: 200, body: probeBody({ probe: "read_text", exitCode: 0, timedOut: false, truncated: false, cleanupVerified: true, stdout: "console.log(1);" }) });
  const result = await runVpsContainerProbe({ ...VALID, probe: "read_text", path: "/app/package.json", maxBytes: 64 }, stub);
  assert.deepEqual(stub.calls[0].params, { image: VALID.image, probe: "read_text", path: "/app/package.json", maxBytes: 64 });
  assert.equal(result.status, "OK");
  assert.equal(result.stdout, "console.log(1);");
});

test("binary content is refused: stdout withheld, BINARY_REFUSED finding, cleanup still reported", async () => {
  const stub = double({ httpStatus: 200, body: probeBody({ probe: "read_text", exitCode: 0, timedOut: false, truncated: false, cleanupVerified: true, binaryRefused: true, stdout: "MZ��" }) });
  const result = await runVpsContainerProbe({ ...VALID, probe: "read_text", maxBytes: 64 }, stub);
  assert.equal(result.status, "BINARY_REFUSED");
  assert.equal(result.binaryRefused, true);
  assert.equal(result.stdout, undefined);
});

test("timeout: PROBE_TIMEOUT and cleanup unverified are honest findings", async () => {
  const stub = double({ httpStatus: 200, body: probeBody({ probe: "list_dir", exitCode: null, timedOut: true, truncated: false, cleanupVerified: false }) });
  const result = await runVpsContainerProbe({ ...VALID, probe: "list_dir", path: "/app/src" }, stub);
  assert.equal(result.status, "FAILED");
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "PROBE_TIMEOUT"));
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "PROBE_CLEANUP_UNVERIFIED"));
});

test("oversized stdout is bounded at the MCP layer and the child truncation flag surfaces", async () => {
  const stub = double({ httpStatus: 200, body: probeBody({ probe: "list_dir", exitCode: 0, timedOut: false, truncated: true, cleanupVerified: true, stdout: "x".repeat(20_000) }) });
  const result = await runVpsContainerProbe({ ...VALID, probe: "list_dir", path: "/app/src" }, stub);
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "PROBE_OUTPUT_TRUNCATED"));
  assert.ok(typeof result.stdout === "string" && result.stdout.length <= 12_100);
});
