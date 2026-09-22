// REGISTRY-LIFECYCLE-01 — tests for engineering.registry.entry.create / .revoke.
// Deterministic: temp-dir registries only, no network, no LLM, no SSH/shell, zero
// mutation outside mkdtemp. Covers: PLAN read-only exact preview (predicted
// tokenHash16 + planned bytes), every guard (operator authorizer, operator pair
// membership, unknown scope, duplicate scopes, whitespace credential, past
// expiry, self-credential by hash16, existing subject, reused tokenHash,
// conflicting credential file, self-revoke by subject AND by hash16, operator
// victim authorizer), idempotent NO_OP, the full CREATED/REVOKED paths (backup,
// audit without the credential value, credential 0600 with fileSha16 ==
// tokenHash16, others byte-identical), the ATOMIC cases (TOCTOU drift refused
// before rename; post-write credential failure restored from backup), the
// authenticateBearer cross-check (revoked -> AUTHENTICATION_REVOKED) and the
// contract fixture against validateTokenRegistry + registryTokenRecordSchema.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { runRegistryEntryCreate, runRegistryEntryRevoke } from "../src/registryEntryLifecycle.ts";
import type { RegistryEntryLifecycleDeps } from "../src/registryEntryLifecycle.ts";
import { validateTokenRegistry, KNOWN_REGISTRY_SCOPES } from "../src/registryScopeGrant.ts";
import { registryTokenRecordSchema } from "../src/judgeContracts.ts";
import { authenticateBearer, type TokenRecord } from "../src/policy.ts";

const OPERATOR_BEARER = "operator-bearer-2026-09-17b-real-value";
const OPERATOR2_BEARER = "operator-bearer-2026-09-20-pair-value";
const RUNNER_BEARER = "release-runner-bearer-2026-09-real";
const LEGACY_BEARER = "legacy-bearer-long-expired-2025";
const HERMES_BEARER = "hermes-bearer-2026-09-read-only-supervision";
const FIXED_NOW = new Date("2026-09-22T12:00:00.000Z");
const FUTURE = "2027-09-22T12:00:00.000Z";

const sha256hex = (text: string): string => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
const sha16 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

const FIXTURE: TokenRecord[] = [
  { tokenHash: sha256hex(OPERATOR_BEARER), subject: "operator-2026-09-17b", scopes: ["engineering:read", "engineering:write", "engineering:registry:scope:grant"], allowedRepositoryIds: ["memoryos"], expiresAt: FUTURE, revokedAt: null },
  { tokenHash: sha256hex(RUNNER_BEARER), subject: "release-runner", scopes: ["engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: FUTURE, revokedAt: null },
  { tokenHash: sha256hex(LEGACY_BEARER), subject: "legacy-2025", scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2026-01-01T00:00:00.000Z", revokedAt: null },
  { tokenHash: sha256hex(OPERATOR2_BEARER), subject: "operator-2026-09-20", scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: FUTURE, revokedAt: null }
];

const serialize = (records: TokenRecord[]): Buffer => Buffer.from(JSON.stringify({ tokens: records }, null, 2) + "\n", "utf8");

interface Harness { dir: string; registryFile: string; auditFile: string; credentialDir: string; originalBytes: Buffer }

function harness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "registry-entry-test-"));
  const registryFile = join(dir, "tokens.json");
  const auditFile = join(dir, "audit", "registry-lifecycle.jsonl");
  const credentialDir = join(dir, "credentials");
  const originalBytes = serialize(FIXTURE);
  writeFileSync(registryFile, originalBytes, { mode: 0o600 });
  return { dir, registryFile, auditFile, credentialDir, originalBytes };
}

function deps(h: Harness, overrides: Partial<RegistryEntryLifecycleDeps> = {}): RegistryEntryLifecycleDeps {
  return {
    registryFile: h.registryFile,
    auditFile: h.auditFile,
    credentialDir: h.credentialDir,
    callerSubject: "operator-2026-09-17b",
    authorizerHash16: sha256hex(OPERATOR_BEARER).slice(0, 16),
    now: () => new Date(FIXED_NOW),
    ...overrides
  };
}

const createInput = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  subject: "hermes-2026-09",
  credentialValue: HERMES_BEARER,
  scopes: ["engineering:read"],
  allowedRepositoryIds: ["memoryos"],
  expiresAt: FUTURE,
  justification: "read-only supervision for the hermes observer channel",
  acknowledgeCreate: true,
  ...overrides
});

const revokeInput = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  subject: "legacy-2025",
  reason: "legacy entry superseded by the operator pair",
  acknowledgeRevoke: true,
  ...overrides
});

const auditLines = (h: Harness): Record<string, unknown>[] => existsSync(h.auditFile) ? readFileSync(h.auditFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>) : [];
const readRegistry = (h: Harness): TokenRecord[] => JSON.parse(readFileSync(h.registryFile, "utf8")).tokens as TokenRecord[];
const backups = (h: Harness): string[] => readdirSync(h.dir).filter((f) => f.includes(".bak-registry-entry-"));
const tmps = (h: Harness): string[] => readdirSync(h.dir).filter((f) => f.includes(".tmp-registry-entry-"));
const newEntryFixture = (): TokenRecord => ({ tokenHash: sha256hex(HERMES_BEARER), subject: "hermes-2026-09", scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: FUTURE, revokedAt: null });

// ---------------------------------------------------------------------------
// engineering.registry.entry.create
// ---------------------------------------------------------------------------

test("create PLAN is a read-only exact preview: zero writes, predicted hashes, append position", async () => {
  const h = harness();
  try {
    const result = await runRegistryEntryCreate(createInput(), deps(h));
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.changed, false);
    assert.equal(result.entryIndex, FIXTURE.length);
    assert.equal(result.tokenHash16, sha256hex(HERMES_BEARER).slice(0, 16));
    assert.equal(result.credentialPath, join(h.credentialDir, "hermes-2026-09"));
    assert.equal(result.credentialFileExisted, false);
    assert.equal(result.registrySha16Before, sha16(h.originalBytes));
    assert.equal(result.requires?.includes("execute=true"), true);
    assert.equal(result.activation.effectiveImmediately, false);
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry bytes unchanged");
    assert.equal(backups(h).length, 0, "no backup on PLAN");
    assert.equal(tmps(h).length, 0, "no tmp on PLAN");
    assert.equal(auditLines(h).length, 0, "no audit on PLAN");
    assert.equal(existsSync(join(h.credentialDir, "hermes-2026-09")), false, "no credential file on PLAN");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create PLAN predicted bytes equal the exact append and pass boot validation", async () => {
  const h = harness();
  try {
    const result = await runRegistryEntryCreate(createInput(), deps(h));
    const planned = serialize([...FIXTURE, newEntryFixture()]);
    assert.equal(result.registrySha16After, sha16(planned));
    const parsed = JSON.parse(planned.toString("utf8")).tokens as TokenRecord[];
    assert.equal(validateTokenRegistry(parsed).length, FIXTURE.length + 1);
    assert.equal(registryTokenRecordSchema.safeParse(newEntryFixture()).success, true);
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create refuses a non-operator authorizer and fails closed on a null authorizer", async () => {
  const h = harness();
  try {
    const nonOperator = await runRegistryEntryCreate(createInput(), deps(h, { callerSubject: "hermes-2026-09" }));
    assert.equal(nonOperator.status, "BLOCKED");
    assert.equal(nonOperator.code, "REGISTRY_ENTRY_CREATE_AUTHORIZER_REQUIRED");
    const nullCaller = await runRegistryEntryCreate(createInput(), deps(h, { callerSubject: null, authorizerHash16: null }));
    assert.equal(nullCaller.status, "BLOCKED");
    assert.equal(nullCaller.code, "REGISTRY_ENTRY_CREATE_AUTHORIZER_REQUIRED");
    const refused = auditLines(h).filter((line) => line.result === "refused-authorizer");
    assert.equal(refused.length, 2, "both refusals audited");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
    assert.equal(backups(h).length, 0);
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create refuses an operator-* target without pair membership and accepts with the pair", async () => {
  const h = harness();
  try {
    const outside = await runRegistryEntryCreate(createInput({ subject: "operator-2026-09-23" }), deps(h, { authorizerHash16: "ffffffffffffffff" }));
    assert.equal(outside.status, "BLOCKED");
    assert.equal(outside.code, "OPERATOR_PAIR_MEMBERSHIP_REQUIRED");
    const pairMember = await runRegistryEntryCreate(createInput({ subject: "operator-2026-09-23" }), deps(h));
    assert.equal(pairMember.status, "PLAN", "the A/B pair governs its own kind");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create input guards: unknown scope, duplicate scopes, whitespace credential, past expiry", async () => {
  const h = harness();
  try {
    const unknownScope = await runRegistryEntryCreate(createInput({ scopes: ["engineering:not-a-scope"] }), deps(h));
    assert.equal(unknownScope.code, "REGISTRY_SCOPE_UNKNOWN");
    assert.ok(KNOWN_REGISTRY_SCOPES.includes("engineering:read"), "sanity: the fixture scope is in the catalog");
    await assert.rejects(() => runRegistryEntryCreate(createInput({ scopes: ["engineering:read", "engineering:read"] }), deps(h)), (error: { code?: string }) => error.code === "REGISTRY_ENTRY_CREATE_INPUT_INVALID", "duplicate scopes throw");
    await assert.rejects(() => runRegistryEntryCreate(createInput({ credentialValue: "bearer with spaces inside 1234567890" }), deps(h)), (error: { code?: string; message?: string }) => error.code === "REGISTRY_CREDENTIAL_VALUE_INVALID" && !String(error.message).includes("bearer with spaces"), "the bad value is not echoed");
    await assert.rejects(() => runRegistryEntryCreate(createInput({ expiresAt: "2026-01-01T00:00:00.000Z" }), deps(h)), (error: { code?: string }) => error.code === "REGISTRY_EXPIRY_INVALID", "past expiry throws");
    await assert.rejects(() => runRegistryEntryCreate(createInput({ expiresAt: "not-a-date" }), deps(h)), (error: { code?: string }) => error.code === "REGISTRY_EXPIRY_INVALID", "unparseable expiry throws");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create refuses its own bearer (self-credential) and any reuse of an existing tokenHash", async () => {
  const h = harness();
  try {
    const selfEntry = await runRegistryEntryCreate(createInput({ credentialValue: OPERATOR_BEARER }), deps(h));
    assert.equal(selfEntry.status, "BLOCKED");
    assert.equal(selfEntry.code, "REGISTRY_SELF_ENTRY_REFUSED");
    const reuse = await runRegistryEntryCreate(createInput({ credentialValue: RUNNER_BEARER }), deps(h));
    assert.equal(reuse.status, "BLOCKED");
    assert.equal(reuse.code, "REGISTRY_TOKENHASH_EXISTS");
    const existingSubject = await runRegistryEntryCreate(createInput({ subject: "release-runner" }), deps(h));
    assert.equal(existingSubject.status, "BLOCKED");
    assert.equal(existingSubject.code, "REGISTRY_SUBJECT_EXISTS");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create full path: CREATED — entry appended, others byte-identical, 0600 credential with fileSha16 == tokenHash16, backup + audited, no value leak", async () => {
  const h = harness();
  try {
    const result = await runRegistryEntryCreate(createInput({ execute: true, approval: { approved: true } }), deps(h));
    assert.equal(result.status, "CREATED");
    assert.equal(result.changed, true);
    assert.equal(result.mutationPerformed, true);
    const tokens = readRegistry(h);
    assert.equal(tokens.length, FIXTURE.length + 1);
    assert.deepEqual(tokens.slice(0, FIXTURE.length), FIXTURE, "pre-existing entries byte-identical");
    assert.deepEqual(tokens[tokens.length - 1], newEntryFixture());
    const credentialPath = join(h.credentialDir, "hermes-2026-09");
    assert.equal(readFileSync(credentialPath, "utf8"), HERMES_BEARER, "credential file byte-exact");
    assert.equal(statSync(credentialPath).mode & 0o777, 0o600, "credential file is 0600");
    assert.equal(sha16(readFileSync(credentialPath)), result.tokenHash16, "file-sha16 == registry tokenHash16");
    assert.equal(backups(h).length, 1, "exactly one backup");
    assert.equal(tmps(h).length, 0, "tmp cleaned up");
    const lines = auditLines(h);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.action, "entry-create");
    assert.equal(lines[0]!.result, "created");
    assert.equal(JSON.stringify(lines).includes(HERMES_BEARER), false, "no credential value in the audit");
    assert.equal(JSON.stringify(result).includes(HERMES_BEARER), false, "no credential value in the output");
    assert.equal(readFileSync(h.registryFile, "utf8").includes(HERMES_BEARER), false, "no credential value in the registry");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create with a pre-existing identical credential file is a NO_OP write and still verifies", async () => {
  const h = harness();
  try {
    const credentialPath = join(h.credentialDir, "hermes-2026-09");
    mkdirSync(h.credentialDir, { recursive: true });
    writeFileSync(credentialPath, Buffer.from(HERMES_BEARER, "utf8"), { mode: 0o600 });
    const result = await runRegistryEntryCreate(createInput({ execute: true, approval: { approved: true } }), deps(h));
    assert.equal(result.status, "CREATED");
    assert.equal(result.credentialFileExisted, true);
    assert.equal(result.credentialFileWritten, false);
    assert.ok(result.findings.some((f) => f.startsWith("CREDENTIAL_FILE_ALREADY_MATCHES")));
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create is blocked at PLAN when a different-bytes credential file pre-exists", async () => {
  const h = harness();
  try {
    const credentialPath = join(h.credentialDir, "hermes-2026-09");
    mkdirSync(h.credentialDir, { recursive: true });
    writeFileSync(credentialPath, Buffer.from("a totally different credential value!!", "utf8"), { mode: 0o600 });
    const result = await runRegistryEntryCreate(createInput(), deps(h));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "REGISTRY_CREDENTIAL_FILE_CONFLICT");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create TOCTOU drift refuses before rename and leaves the registry untouched", async () => {
  const h = harness();
  try {
    let reads = 0;
    const drifted = serialize(FIXTURE.slice(0, 2));
    const d = deps(h, { readBytes: (p: string) => { reads += 1; return reads === 1 ? readFileSync(p) : drifted; } });
    const result = await runRegistryEntryCreate(createInput({ execute: true, approval: { approved: true } }), d);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "REGISTRY_DRIFT_DETECTED");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
    assert.equal(tmps(h).length, 0, "tmp cleaned up");
    assert.equal(backups(h).length, 1, "backup stays as evidence");
    assert.equal(existsSync(join(h.credentialDir, "hermes-2026-09")), false, "no credential file written");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create RESTORED: post-write credential failure restores the backup bytes", async () => {
  const h = harness();
  try {
    const d = deps(h, {
      writeBytes: (p: string, bytes: Buffer, mode: number) => {
        if (p.includes("credentials")) throw new Error("credential write exploded");
        writeFileSync(p, bytes, { mode });
      }
    });
    const result = await runRegistryEntryCreate(createInput({ execute: true, approval: { approved: true } }), d);
    assert.equal(result.status, "RESTORED");
    assert.equal(result.restored, true);
    assert.equal(result.code, "REGISTRY_CREDENTIAL_WRITE_FAILED");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry restored byte-exact");
    assert.equal(readRegistry(h).length, FIXTURE.length, "entry not present after restore");
    assert.equal(existsSync(join(h.credentialDir, "hermes-2026-09")), false, "no usable credential left behind");
    assert.equal(backups(h).length, 1, "backup is the evidence");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("create redacts the credential value from justification, output and audit", async () => {
  const h = harness();
  try {
    const result = await runRegistryEntryCreate(createInput({ justification: `deploy credential ${HERMES_BEARER} for hermes`, execute: true, approval: { approved: true } }), deps(h));
    assert.equal(result.status, "CREATED");
    assert.equal(result.justification.includes("[REDACTED]"), true);
    assert.equal(result.justification.includes(HERMES_BEARER), false);
    assert.equal(JSON.stringify(result).includes(HERMES_BEARER), false);
    assert.equal(JSON.stringify(auditLines(h)).includes(HERMES_BEARER), false);
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// engineering.registry.entry.revoke
// ---------------------------------------------------------------------------

test("revoke PLAN is read-only with the planned revokedAt and zero writes", async () => {
  const h = harness();
  try {
    const result = await runRegistryEntryRevoke(revokeInput(), deps(h));
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.entryIndex, 2);
    assert.equal(result.tokenHash16, sha256hex(LEGACY_BEARER).slice(0, 16));
    assert.equal(result.revokedAt, null);
    assert.ok(result.revokedAtPlanned && !Number.isNaN(Date.parse(result.revokedAtPlanned)));
    assert.deepEqual(result.scopesBefore, ["engineering:read"]);
    assert.equal(result.requires?.includes("execute=true"), true);
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry bytes unchanged");
    assert.equal(backups(h).length, 0);
    assert.equal(tmps(h).length, 0);
    assert.equal(auditLines(h).length, 0, "no audit on PLAN");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("revoke self-guards: by subject and by holding the same bearer (hash16)", async () => {
  const h = harness();
  try {
    const bySubject = await runRegistryEntryRevoke(revokeInput({ subject: "operator-2026-09-17b" }), deps(h));
    assert.equal(bySubject.status, "BLOCKED");
    assert.equal(bySubject.code, "REGISTRY_SELF_REVOKE_REFUSED");
    const byHash = await runRegistryEntryRevoke(revokeInput({ subject: "operator-2026-09-17b" }), deps(h, { callerSubject: "someone-else" }));
    assert.equal(byHash.status, "BLOCKED");
    assert.equal(byHash.code, "REGISTRY_SELF_REVOKE_REFUSED");
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("revoke of an operator-* victim requires an operator authorizer", async () => {
  const h = harness();
  try {
    const result = await runRegistryEntryRevoke(revokeInput({ subject: "operator-2026-09-20" }), deps(h, { callerSubject: "release-runner", authorizerHash16: sha256hex(RUNNER_BEARER).slice(0, 16) }));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "OPERATOR_ENTRY_OPERATOR_AUTHORIZER_REQUIRED");
    const refused = auditLines(h).filter((line) => line.result === "refused-operator-authorizer");
    assert.equal(refused.length, 1);
    assert.equal(readFileSync(h.registryFile).equals(h.originalBytes), true, "registry untouched");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("revoke is an idempotent NO_OP on an already-revoked entry (zero writes, no backup)", async () => {
  const h = harness();
  try {
    const revokedAt = "2026-09-01T00:00:00.000Z";
    const preRevoked = serialize(FIXTURE.map((entry) => entry.subject === "legacy-2025" ? { ...entry, revokedAt } : entry));
    writeFileSync(h.registryFile, preRevoked, { mode: 0o600 });
    const result = await runRegistryEntryRevoke(revokeInput(), deps(h));
    assert.equal(result.status, "NO_OP");
    assert.equal(result.changed, false);
    assert.equal(result.code, "REGISTRY_REVOKE_NO_OP");
    assert.equal(result.revokedAt, revokedAt);
    assert.equal(readFileSync(h.registryFile).equals(preRevoked), true, "registry untouched");
    assert.equal(backups(h).length, 0, "no backup on NO_OP");
    const lines = auditLines(h);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.result, "noop");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("revoke full path: REVOKED — only revokedAt changed, credential removed, others byte-identical", async () => {
  const h = harness();
  try {
    const credentialPath = join(h.credentialDir, "legacy-2025");
    mkdirSync(h.credentialDir, { recursive: true });
    writeFileSync(credentialPath, Buffer.from(LEGACY_BEARER, "utf8"), { mode: 0o600 });
    const result = await runRegistryEntryRevoke(revokeInput({ execute: true, approval: { approved: true } }), deps(h));
    assert.equal(result.status, "REVOKED");
    assert.equal(result.changed, true);
    assert.equal(result.revokedAt, result.revokedAtPlanned);
    assert.equal(result.credentialFileRemoved, true);
    const tokens = readRegistry(h);
    assert.equal(tokens.length, FIXTURE.length, "entry count unchanged");
    assert.equal(tokens[2]!.revokedAt, result.revokedAtPlanned);
    const { revokedAt: _before, ...targetBefore } = FIXTURE[2]!;
    const { revokedAt: _after, ...targetAfter } = tokens[2]!;
    assert.deepEqual(targetAfter, targetBefore, "fields other than revokedAt unchanged");
    assert.deepEqual(tokens.filter((_, index) => index !== 2), FIXTURE.filter((_, index) => index !== 2), "unrelated entries byte-identical");
    assert.equal(existsSync(credentialPath), false, "credential file neutralized");
    assert.equal(backups(h).length, 1);
    const lines = auditLines(h);
    assert.equal(lines[lines.length - 1]!.action, "entry-revoke");
    assert.equal(lines[lines.length - 1]!.result, "revoked");
    assert.equal(JSON.stringify(lines).includes(LEGACY_BEARER), false, "no bearer value in the audit");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("revoke with an absent credential file reports CREDENTIAL_FILE_ABSENT and still revokes", async () => {
  const h = harness();
  try {
    const result = await runRegistryEntryRevoke(revokeInput({ execute: true, approval: { approved: true } }), deps(h));
    assert.equal(result.status, "REVOKED");
    assert.equal(result.credentialFileExisted, false);
    assert.equal(result.credentialFileRemoved, false);
    assert.ok(result.findings.some((f) => f.startsWith("CREDENTIAL_FILE_ABSENT")));
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("authenticateBearer cross-check: revoked bearer -> AUTHENTICATION_REVOKED, operator bearer still authenticates", async () => {
  const h = harness();
  try {
    await runRegistryEntryRevoke(revokeInput({ execute: true, approval: { approved: true } }), deps(h));
    const tokens = validateTokenRegistry(readRegistry(h));
    assert.throws(() => authenticateBearer(`Bearer ${LEGACY_BEARER}`, tokens, "memoryos", new Date(FIXED_NOW), null), (error: { code?: string }) => error.code === "AUTHENTICATION_REVOKED");
    const subject = authenticateBearer(`Bearer ${OPERATOR_BEARER}`, tokens, "memoryos", new Date(FIXED_NOW), null);
    assert.equal(subject.subject, "operator-2026-09-17b");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("contract fixture: planned create and revoke bytes pass the boot validator and registryTokenRecordSchema", async () => {
  const h = harness();
  try {
    const createResult = await runRegistryEntryCreate(createInput(), deps(h));
    assert.equal(createResult.status, "PLAN");
    const plannedTokens = [...FIXTURE, newEntryFixture()];
    const validated = validateTokenRegistry(plannedTokens);
    assert.equal(validated.length, plannedTokens.length);
    for (const record of validated) assert.equal(registryTokenRecordSchema.safeParse(record).success, true, "each planned record matches the contract schema");

    const revokeResult = await runRegistryEntryRevoke(revokeInput(), deps(h));
    assert.equal(revokeResult.status, "PLAN");
    const revokedTokens = plannedTokens.map((entry) => entry.subject === "legacy-2025" ? { ...entry, revokedAt: revokeResult.revokedAtPlanned! } : entry);
    const validatedRevoked = validateTokenRegistry(revokedTokens);
    assert.equal(validatedRevoked.length, revokedTokens.length);
    for (const record of validatedRevoked) assert.equal(registryTokenRecordSchema.safeParse(record).success, true, "each planned revoked record matches the contract schema");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});
