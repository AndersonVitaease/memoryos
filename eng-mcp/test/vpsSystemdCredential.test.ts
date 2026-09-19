// UNIT-CREDENTIAL-01: tool-side unit tests for engineering.vps.systemd.credential
// (src/vpsSystemdCredential.ts). The runner transport is a stub — these tests pin
// the fail-closed grammar mirror BEFORE the socket, the execute/approval collapse,
// the honest status mapping (PLAN/WRITE/NO_OP/BLOCKED/FAILED/REJECTED/UNAVAILABLE)
// and the no-leak security block. The child logic itself is exercised in
// release-runner-unit-credential.test.ts and the real serialization seam in
// release-runner-unit-credential-contract.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { EngineeringError } from "../src/policy.ts";
import { runVpsSystemdCredential, validateUnitCredentialRequest, vpsSystemdCredentialInputSchema, VPS_SYSTEMD_CREDENTIAL_SCOPE, VPS_SYSTEMD_CREDENTIAL_PLAN_REQUIRES, type VpsSystemdCredentialDeps } from "../src/vpsSystemdCredential.ts";

type RunnerCall = { operation: string; jobId?: string; params?: Record<string, unknown> };

function childEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "unit_credential",
    unit: "test-unit.service",
    credentialId: "test-cred",
    unitPath: "test-cred",
    execute: false,
    possible: true,
    desiredLine: "LoadCredential=test-cred:/opt/eng-mcp-release-data/credentials/test-cred",
    dropinContent: "[Service]\nLoadCredential=test-cred:/opt/eng-mcp-release-data/credentials/test-cred\n",
    existingDropin: { existed: false, size: null },
    existingSameName: [],
    baseVerify: { exitCode: 0, output: null },
    criticalUnit: false,
    requiresRestart: true,
    restartNote: "systemd loads LoadCredential= only when the unit (re)starts",
    planDiff: { before: null, after: "[Service]\nLoadCredential=test-cred:/opt/eng-mcp-release-data/credentials/test-cred\n", unchanged: false },
    findings: [],
    status: "PLAN",
    mutationPerformed: false,
    unitFile: "/etc/systemd/system/test-unit.service",
    dropinDir: "/etc/systemd/system/test-unit.service.d",
    dropinFile: "/etc/systemd/system/test-unit.service.d/credentials.conf",
    ...overrides
  };
}

interface DepsFixture { calls: RunnerCall[]; deps: VpsSystemdCredentialDeps }

function makeDeps(child: Record<string, unknown>, httpStatus = 200): DepsFixture {
  const calls: RunnerCall[] = [];
  const deps: VpsSystemdCredentialDeps = {
    runRunner: async (operation: "unit_credential", jobId?: string, params?: Record<string, unknown>) => {
      calls.push({ operation, ...(jobId !== undefined ? { jobId } : {}), ...(params !== undefined ? { params } : {}) });
      return { httpStatus, body: { exitCode: httpStatus === 200 ? 0 : 1, stdout: httpStatus === 200 ? JSON.stringify(child) : "" } };
    }
  };
  return { calls, deps };
}

function codeOf(error: unknown): string {
  assert.ok(error instanceof EngineeringError, `expected EngineeringError, got ${String(error)}`);
  return (error as { code?: string }).code ?? "";
}

test("grammar mirror refuses malformed input BEFORE the socket with typed codes", async () => {
  const { calls, deps } = makeDeps(childEnvelope());
  await assert.rejects(() => runVpsSystemdCredential({ unit: "../evil", credentialId: "test-cred" }, deps), (error: unknown) => codeOf(error).includes("UC_UNIT_INVALID"));
  await assert.rejects(() => runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "BAD ID" }, deps), (error: unknown) => codeOf(error).includes("UC_CREDENTIAL_ID_INVALID"));
  await assert.rejects(() => runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred", unitPath: "with/slash" }, deps), (error: unknown) => codeOf(error).includes("UC_UNIT_PATH_INVALID"));
  assert.equal(calls.length, 0, "refusals must happen before any runner call");
});

test("validateUnitCredentialRequest passes a valid request through untouched and rejects traversal", () => {
  const valid = validateUnitCredentialRequest({ unit: "eng-mcp-release-runner.service", credentialId: "release-bearer-2026-09-19" });
  assert.equal(valid.credentialId, "release-bearer-2026-09-19");
  assert.throws(() => validateUnitCredentialRequest({ unit: "..", credentialId: "x" }), EngineeringError);
  assert.throws(() => validateUnitCredentialRequest({ unit: "u.service", credentialId: "c", unitPath: ".." }), EngineeringError);
});

test("strict schema rejects unknown keys and wrong types", () => {
  assert.equal(vpsSystemdCredentialInputSchema.safeParse({ unit: "u.service", credentialId: "c", extra: 1 }).success, false);
  assert.equal(vpsSystemdCredentialInputSchema.safeParse({ unit: "u.service", credentialId: "c", execute: "yes" }).success, false);
  assert.equal(vpsSystemdCredentialInputSchema.safeParse({ unit: "u.service", credentialId: "c", approval: { approved: "yes" } }).success, false);
  assert.equal(vpsSystemdCredentialInputSchema.safeParse({ unit: "u.service", credentialId: "c", approval: { approved: true, extra: 1 } }).success, false);
  assert.equal(vpsSystemdCredentialInputSchema.safeParse({ unit: "u.service", credentialId: "c" }).success, true);
  assert.deepEqual([...VPS_SYSTEMD_CREDENTIAL_PLAN_REQUIRES], ["execute=true", "approval.approved=true"]);
  assert.equal(VPS_SYSTEMD_CREDENTIAL_SCOPE, "engineering:vps:systemd:credential");
});

test("PLAN (execute omitted) forwards execute=false and returns the child PLAN envelope with the security block", async () => {
  const { calls, deps } = makeDeps(childEnvelope());
  const result = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, deps);
  assert.equal(result.status, "PLAN");
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.executeRequested, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { operation: "unit_credential", params: { unit: "test-unit.service", credentialId: "test-cred", execute: false } });
  assert.equal(result.desiredLine, childEnvelope().desiredLine);
  assert.equal(result.criticalUnit, false);
  assert.equal(result.requiresRestart, true);
  assert.deepEqual(result.security, { secretsRedacted: true, credentialValueReturned: false, baseUnitNeverEdited: true, noServiceRestart: true, freeCommandImpossible: true });
});

test("execute=true without approval collapses to execute=false at the MCP layer", async () => {
  const { calls, deps } = makeDeps(childEnvelope());
  const result = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred", execute: true }, deps);
  assert.equal(result.executeRequested, false);
  // deepEqual pins the FULL forward: on the collapse path the approval key must be
  // absent entirely (the runner-side gate reads approval, not just execute).
  assert.deepEqual(calls[0].params, { unit: "test-unit.service", credentialId: "test-cred", execute: false });
});

test("execute=true + approval.approved=true relays the approval to the runner and maps WRITE", async () => {
  const write = childEnvelope({ status: "WRITE", execute: true, mutationPerformed: true, wrote: true, daemonReloaded: true, isActiveBefore: "active", isActiveAfter: "active" });
  const { calls, deps } = makeDeps(write);
  const result = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred", execute: true, approval: { approved: true } }, deps);
  assert.equal(result.status, "WRITE");
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.daemonReloaded, true);
  assert.equal(result.isActiveBefore, "active");
  assert.equal(result.isActiveAfter, "active");
  assert.equal(calls[0].params?.execute, true);
  // v94 live E2E regression: the runner-side gate collapses execute=true back to false
  // when approval is ABSENT from the forwarded params, so the tool must relay the
  // user's approval across the MCP->runner seam (otherwise EXECUTE degrades to PLAN).
  assert.deepEqual(calls[0].params, { unit: "test-unit.service", credentialId: "test-cred", execute: true, approval: { approved: true } });
});

test("NO_OP and BLOCKED child statuses pass through with their evidence", async () => {
  const noOp = childEnvelope({ status: "NO_OP", byteIdentical: true, isActive: "active" });
  const { deps } = makeDeps(noOp);
  const result = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, deps);
  assert.equal(result.status, "NO_OP");
  assert.equal(result.byteIdentical, true);
  assert.equal(result.isActive, "active");

  const blocked = childEnvelope({ status: "BLOCKED", possible: false, findings: [{ code: "UC_CREDENTIAL_EMPTY", detail: "empty credential files are refused" }] });
  const fixture2 = makeDeps(blocked);
  const result2 = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred", execute: true, approval: { approved: true } }, fixture2.deps);
  assert.equal(result2.status, "BLOCKED");
  assert.ok(result2.findings.some((finding: { code: string }) => finding.code === "UC_CREDENTIAL_EMPTY"));
});

test("child FAILED and unknown statuses map to FAILED + UC_RUNNER_FAILED", async () => {
  const failed = childEnvelope({ status: "FAILED", findings: [{ code: "UC_DAEMON_RELOAD_FAILED", detail: "systemctl daemon-reload failed" }] });
  const { deps } = makeDeps(failed);
  const result = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred", execute: true, approval: { approved: true } }, deps);
  assert.equal(result.status, "FAILED");
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_DAEMON_RELOAD_FAILED"));
  assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_RUNNER_FAILED"));

  const weird = childEnvelope({ status: "SURPRISE" });
  const fixture2 = makeDeps(weird);
  const result2 = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, fixture2.deps);
  assert.equal(result2.status, "FAILED");
  assert.ok(result2.findings.some((finding: { code: string }) => finding.code === "UC_RUNNER_FAILED"));
});

test("a nested unitCredentialResult is accepted alongside the stdout JSON contract", async () => {
  // The nested envelope lives at the TOP level of the runner body (not wrapped in
  // stdout), so this test builds runRunner directly instead of going through makeDeps.
  const calls: string[] = [];
  const nested: VpsSystemdCredentialDeps = {
    runRunner: async (operation) => { calls.push(operation); return { httpStatus: 200, body: { exitCode: 0, unitCredentialResult: childEnvelope({ status: "PLAN" }) } }; },
  };
  const result = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, nested);
  assert.equal(result.status, "PLAN");
  assert.equal(calls.length, 1);
});

test("runner 409 maps to FAILED + UC_BUSY, 400 to REJECTED + UC_RUNNER_REJECTED", async () => {
  const busy = makeDeps({ error: "UNIT_CREDENTIAL_BUSY" }, 409);
  const busyResult = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, busy.deps);
  assert.equal(busyResult.status, "FAILED");
  assert.ok(busyResult.findings.some((finding: { code: string }) => finding.code === "UC_BUSY"));

  const rejected = makeDeps({ error: "INPUT_INVALID" }, 400);
  const rejectedResult = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, rejected.deps);
  assert.equal(rejectedResult.status, "REJECTED");
  assert.ok(rejectedResult.findings.some((finding: { code: string }) => finding.code === "UC_RUNNER_REJECTED"));
});

test("transport failure maps to UNAVAILABLE + UC_TRANSPORT_FAILED and unparseable stdout to FAILED + UC_RESULT_UNPARSEABLE", async () => {
  const unreachable: VpsSystemdCredentialDeps = { runRunner: async () => { throw new Error("connect ECONNREFUSED"); } };
  const unavailable = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, unreachable);
  assert.equal(unavailable.status, "UNAVAILABLE");
  assert.equal(unavailable.mutationPerformed, false);
  assert.ok(unavailable.findings.some((finding: { code: string }) => finding.code === "UC_TRANSPORT_FAILED"));

  const junk = makeDeps({ exitCode: 0, stdout: "not the child envelope" });
  const junkResult = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, junk.deps);
  assert.equal(junkResult.status, "FAILED");
  assert.ok(junkResult.findings.some((finding: { code: string }) => finding.code === "UC_RESULT_UNPARSEABLE"));
});

test("no-leak: sensitive-keyed fields are scrubbed before the security block is attached", async () => {
  // redactSensitive is key-based (authorization|token|secret|api_?key|password|cookie|bearer|envvars|^env):
  // a compromised child echoing a value under such a key is scrubbed at the boundary; the
  // value itself never appears because the child only ever reports path/size/mode/sha16.
  // The leak rides inside the copied `credential` block (finalize copies it wholesale),
  // so the key-based scrub must fire at the boundary: token -> [REDACTED].
  const leaky = childEnvelope({ credential: { id: "test-cred", token: "secret-credential-value-42" }, planDiff: { before: null, after: "[Service]\nLoadCredential=test-cred:/opt/eng-mcp-release-data/credentials/test-cred\n", unchanged: false } });
  const { deps } = makeDeps(leaky);
  const result = await runVpsSystemdCredential({ unit: "test-unit.service", credentialId: "test-cred" }, deps);
  const text = JSON.stringify(result);
  assert.ok(!text.includes("secret-credential-value-42"), "sensitive-keyed fields must be [REDACTED] before the security block is attached");
  assert.ok(text.includes("[REDACTED]"), "the redaction evidence must be visible");
  // The child-layer no-leak guarantee (value never reported at all) is asserted in
  // release-runner-unit-credential.test.ts against the real child JSON.
});