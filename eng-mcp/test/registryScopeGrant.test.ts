// REGISTRY-GRANT-01 — tests for engineering.registry.scope.grant.
// Deterministic: temp-dir registries only, no network, no LLM, no SSH/shell, zero
// mutation outside mkdtemp. Covers: PLAN exact-diff zero-mutation, every refusal
// guard (self-grant by subject AND by tokenHash16, unknown/ambiguous subject,
// unknown scope, catalog-missing registry file, corrupt registry), idempotent NO_OP,
// the full GRANT path (backup + audit + other-entries unchanged + no token leak),
// the ATOMIC cases (torn write restored from backup; TOCTOU drift refused before
// rename) and the scope-catalog drift guard against the source gates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { runRegistryScopeGrant, validateTokenRegistry, KNOWN_REGISTRY_SCOPES, registryScopeGrantInputSchema } from "../src/registryScopeGrant.ts";
import type { RegistryScopeGrantDeps, RegistryScopeGrantResult } from "../src/registryScopeGrant.ts";
import { EngineeringError, type TokenRecord } from "../src/policy.ts";

const FIXTURE: TokenRecord[] = [
  { tokenHash: "a".repeat(64), subject: "alpha", scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null },
  { tokenHash: "b".repeat(64), subject: "beta", scopes: ["engineering:read", "engineering:write"], allowedRepositoryIds: ["memoryos"], expiresAt: "2020-01-01T00:00:00.000Z", revokedAt: null },
  { tokenHash: "c".repeat(64), subject: "dup", scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null },
  { tokenHash: "d".repeat(64), subject: "dup", scopes: ["engineering:verify"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null }
];

const serialize = (records: TokenRecord[]): Buffer => Buffer.from(JSON.stringify({ tokens: records }, null, 2) + "\n", "utf8");
const sha16 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

interface Harness { dir: string; registryFile: string; auditFile: string; originalBytes: Buffer; deps: RegistryScopeGrantDeps }

function harness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "registry-grant-test-"));
  const registryFile = join(dir, "tokens.json");
  const auditFile = join(dir, "audit", "registry-grant.jsonl");
  const originalBytes = serialize(FIXTURE);
  writeFileSync(registryFile, originalBytes, { mode: 0o600 });
  const deps: RegistryScopeGrantDeps = { registryFile, auditFile, callerSubject: "caller-x", authorizerHash16: "0123456789abcdef", now: () => new Date("2026-09-20T12:00:00.000Z") };
  return { dir, registryFile, auditFile, originalBytes, deps };
}

function cleanup(dir: string): void { rmSync(dir, { recursive: true, force: true }); }

function grants(subject: string, scopes: string[], execute?: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = { subject, scopes, justification: "REGISTRY-GRANT-01 test", acknowledgeGrant: true };
  if (execute !== undefined) { base.execute = execute; base.approval = { approved: true }; }
  return base;
}

const backups = (dir: string): string[] => readdirSync(dir).filter((name) => name.includes(".bak-registry-grant-"));
const tmpResidue = (dir: string): string[] => readdirSync(dir).filter((name) => name.includes(".tmp-registry-grant-") || name.includes(".tmp-"));

test("PLAN returns the exact entry diff with zero mutation (no writes, no backup, no audit)", async () => {
  const h = harness();
  try {
    const result = await runRegistryScopeGrant(grants("alpha", ["engineering:verify", "engineering:git:push"]), h.deps);
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.changed, false);
    assert.equal(result.entryIndex, 0);
    assert.deepEqual(result.scopesBefore, ["engineering:read"]);
    assert.deepEqual(result.scopesAdded, ["engineering:verify", "engineering:git:push"]);
    assert.deepEqual(result.scopesAfter, ["engineering:read", "engineering:verify", "engineering:git:push"]);
    assert.equal(result.registrySha16Before, sha16(h.originalBytes));
    assert.equal(result.registrySha16After, sha16(serialize([{ ...FIXTURE[0]!, scopes: result.scopesAfter }, ...FIXTURE.slice(1)])));
    assert.deepEqual(result.requires, ["execute=true", "approval.approved=true", "acknowledgeGrant=true"]);
    assert.equal(result.activation.effectiveImmediately, false);
    assert.equal(backups(h.dir).length, 0, "PLAN must not create a backup");
    assert.equal(tmps(h.dir).length, 0, "PLAN must leave no temp files");
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes, "registry bytes unchanged");
    assert.equal(existsSync(h.auditFile), false, "PLAN must not audit");
  } finally { cleanup(h.dir); }
});

function tmps(dir: string): string[] { return readdirSync(dir).filter((name) => name.includes(".tmp-")); }

test("refuses an unknown subject (BLOCKED, zero mutation)", async () => {
  const h = harness();
  try {
    const result = await runRegistryScopeGrant(grants("nobody-here", ["engineering:read"]), h.deps);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "REGISTRY_SUBJECT_NOT_FOUND");
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes);
    assert.equal(existsSync(h.auditFile), true, "refusals are audited");
  } finally { cleanup(h.dir); }
});

test("refuses an ambiguous subject (two entries sharing it) instead of guessing", async () => {
  const h = harness();
  try {
    const result = await runRegistryScopeGrant(grants("dup", ["engineering:read"]), h.deps);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "REGISTRY_SUBJECT_AMBIGUOUS");
    assert.match(result.detail!, /2 entries share subject/);
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes);
  } finally { cleanup(h.dir); }
});

test("self-grant is refused by subject AND by the caller's own tokenHash16", async () => {
  const h = harness();
  try {
    const bySubject = await runRegistryScopeGrant(grants("caller-x", ["engineering:read"]), h.deps);
    assert.equal(bySubject.status, "BLOCKED");
    assert.equal(bySubject.code, "REGISTRY_SELF_GRANT_REFUSED");
    // Even a differently-named entry holding the caller's bearer is refused.
    const byHash = await runRegistryScopeGrant(grants("alpha", ["engineering:verify"]), { ...h.deps, authorizerHash16: "a".repeat(16) });
    assert.equal(byHash.status, "BLOCKED");
    assert.equal(byHash.code, "REGISTRY_SELF_GRANT_REFUSED");
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes);
  } finally { cleanup(h.dir); }
});

test("refuses scopes outside the catalog, naming them", async () => {
  const h = harness();
  try {
    const result = await runRegistryScopeGrant(grants("alpha", ["engineering:not:a:thing", "engineering:read"]), h.deps);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "REGISTRY_SCOPE_UNKNOWN");
    assert.match(result.detail!, /engineering:not:a:thing/);
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes);
  } finally { cleanup(h.dir); }
});

test("duplicate scopes in the request are an input error", async () => {
  const h = harness();
  try {
    await assert.rejects(
      () => runRegistryScopeGrant(grants("alpha", ["engineering:read", "engineering:read"]), h.deps),
      (error: unknown) => error instanceof EngineeringError && error.code === "REGISTRY_GRANT_INPUT_INVALID",
    );
  } finally { cleanup(h.dir); }
});

test("missing registry file and corrupt registries fail closed with typed codes", async () => {
  const missingDir = mkdtempSync(join(tmpdir(), "registry-grant-test-"));
  try {
    const missing = await runRegistryScopeGrant(grants("alpha", ["engineering:read"]), { registryFile: join(missingDir, "absent.json"), auditFile: join(missingDir, "audit.jsonl") });
    assert.equal(missing.status, "BLOCKED");
    assert.equal(missing.code, "REGISTRY_FILE_MISSING");
  } finally { cleanup(missingDir); }

  const h = harness();
  try {
    writeFileSync(h.registryFile, "{ not json", { mode: 0o600 });
    const invalid = await runRegistryScopeGrant(grants("alpha", ["engineering:read"]), h.deps);
    assert.equal(invalid.status, "BLOCKED");
    assert.equal(invalid.code, "REGISTRY_JSON_INVALID");

  } finally { cleanup(h.dir); }
});

test("a record failing the boot rules is refused (REGISTRY_RECORD_INVALID)", async () => {
  const h = harness();
  try {
    writeFileSync(h.registryFile, JSON.stringify({ tokens: [{ tokenHash: "zz", subject: "alpha", scopes: ["engineering:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }] }), { mode: 0o600 });
    const result = await runRegistryScopeGrant(grants("alpha", ["engineering:read"]), h.deps);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "REGISTRY_RECORD_INVALID");
  } finally { cleanup(h.dir); }
});

test("execute grants: file rewritten, backup kept, audit line written, other entries byte-identical, no token leak", async () => {
  const h = harness();
  try {
    const result = await runRegistryScopeGrant(grants("alpha", ["engineering:verify", "engineering:git:push"], true), h.deps) as RegistryScopeGrantResult;
    assert.equal(result.status, "GRANTED");
    assert.equal(result.mutationPerformed, true);
    assert.equal(result.changed, true);
    assert.equal(result.entryIndex, 0);
    assert.equal(result.registrySha16After, sha16(readFileSync(h.registryFile)));
    assert.equal(result.activation.registryReload.includes("ONCE at boot"), true);
    assert.equal(result.audit, "written");

    const after = JSON.parse(readFileSync(h.registryFile, "utf8")) as { tokens: TokenRecord[] };
    assert.deepEqual(after.tokens[0]!.scopes, ["engineering:read", "engineering:verify", "engineering:git:push"]);
    assert.equal(after.tokens[0]!.revokedAt, null, "revokedAt must be preserved");
    assert.equal(after.tokens.length, 4);
    assert.deepEqual(after.tokens.slice(1), FIXTURE.slice(1), "unrelated entries must be untouched");

    assert.equal(backups(h.dir).length, 1, "exactly one backup");
    const backupPath = join(h.dir, backups(h.dir)[0]!);
    assert.deepEqual(readFileSync(backupPath), h.originalBytes, "backup holds the original bytes");

    const auditLines = readFileSync(h.auditFile, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(auditLines.length, 1);
    assert.equal(auditLines[0]!.result, "granted");
    assert.equal(auditLines[0]!.authorizerHash16, "0123456789abcdef");
    assert.equal(auditLines[0]!.targetSubject, "alpha");

    const serialized = JSON.stringify(result);
    assert.equal(/[a-f0-9]{64}/.test(serialized), false, "no 64-hex token hash may leak into the result");
    assert.equal(serialized.toLowerCase().includes("bearer"), false);
  } finally { cleanup(h.dir); }
});

test("re-executing the same grant is a NO_OP with zero writes (idempotent)", async () => {
  const h = harness();
  try {
    const first = await runRegistryScopeGrant(grants("alpha", ["engineering:verify"], true), h.deps);
    assert.equal(first.status, "GRANTED");
    const bytesAfterFirst = readFileSync(h.registryFile);
    assert.equal(backups(h.dir).length, 1);

    const second = await runRegistryScopeGrant(grants("alpha", ["engineering:verify"], true), h.deps);
    assert.equal(second.status, "NO_OP");
    assert.equal(second.changed, false);
    assert.equal(second.mutationPerformed, false);
    assert.deepEqual(second.scopesAfter, ["engineering:read", "engineering:verify"]);
    assert.equal(backups(h.dir).length, 1, "NO_OP must not create a second backup");
    assert.deepEqual(readFileSync(h.registryFile), bytesAfterFirst, "registry untouched by NO_OP");
    const auditLines = readFileSync(h.auditFile, "utf8").trim().split("\n");
    assert.equal((JSON.parse(auditLines.at(-1)!) as Record<string, unknown>).result, "noop");
  } finally { cleanup(h.dir); }
});

test("an expired target grants with an inert-token finding", async () => {
  const h = harness();
  try {
    const result = await runRegistryScopeGrant(grants("beta", ["engineering:release"], true), h.deps);
    assert.equal(result.status, "GRANTED");
    assert.equal(result.entryIndex, 1);
    assert.equal(result.findings.some((finding) => finding.startsWith("TARGET_TOKEN_EXPIRED")), true);
    const after = JSON.parse(readFileSync(h.registryFile, "utf8")) as { tokens: TokenRecord[] };
    assert.deepEqual(after.tokens[1]!.scopes, ["engineering:read", "engineering:write", "engineering:release"]);
  } finally { cleanup(h.dir); }
});

test("ATOMIC CASE: a torn write is detected by post-validation and RESTORED from the backup", async () => {
  const h = harness();
  try {
    let corruptNextTmpWrite = false;
    const deps: RegistryScopeGrantDeps = {
      ...h.deps,
      writeBytes: (path: string, bytes: Buffer, mode: number): void => {
        const isTmpWrite = path.includes(".tmp-registry-grant-");
        const payload = isTmpWrite && corruptNextTmpWrite ? Buffer.from("{ CORRUPTED") : bytes;
        if (isTmpWrite) corruptNextTmpWrite = false;
        writeFileSync(path, payload, { mode });
      }
    };
    corruptNextTmpWrite = true;
    const result = await runRegistryScopeGrant(grants("alpha", ["engineering:verify"], true), deps);
    assert.equal(result.status, "RESTORED");
    assert.equal(result.restored, true);
    assert.equal(result.mutationPerformed, false, "net mutation must be zero after a proven restore");
    assert.equal(result.changed, false);
    assert.equal(result.code, "REGISTRY_POSTVALIDATION_FAILED");
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes, "registry must be back to the exact pre-grant bytes");
    assert.equal(backups(h.dir).length, 1, "the backup used for the restore stays as evidence");
    assert.equal(tmps(h.dir).length, 0, "no temp residue");
    const auditLines = readFileSync(h.auditFile, "utf8").trim().split("\n");
    assert.equal((JSON.parse(auditLines.at(-1)!) as Record<string, unknown>).result, "restored");
  } finally { cleanup(h.dir); }
});

test("ATOMIC CASE: TOCTOU drift is refused BEFORE the rename (zero mutation)", async () => {
  const h = harness();
  try {
    let reads = 0;
    const tampered = Buffer.from(h.originalBytes.toString("utf8").replace('"alpha"', '"alpha-tampered"'), "utf8");
    const deps: RegistryScopeGrantDeps = {
      ...h.deps,
      readBytes: (path: string): Buffer => {
        reads += 1;
        return reads === 1 ? h.originalBytes : tampered;
      }
    };
    const result = await runRegistryScopeGrant(grants("alpha", ["engineering:verify"], true), deps);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "REGISTRY_DRIFT_DETECTED");
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes, "the real registry must be untouched");
    assert.equal(tmps(h.dir).length, 0, "temp must be cleaned up");
  } finally { cleanup(h.dir); }
});

test("execute without approval stays a PLAN; missing acknowledgeGrant is a schema error", async () => {
  const h = harness();
  try {
    const plan = await runRegistryScopeGrant({ subject: "alpha", scopes: ["engineering:verify"], justification: "x", acknowledgeGrant: true, execute: true }, h.deps);
    assert.equal(plan.status, "PLAN");
    assert.deepEqual(readFileSync(h.registryFile), h.originalBytes);
    await assert.rejects(
      () => runRegistryScopeGrant({ subject: "alpha", scopes: ["engineering:verify"], justification: "x" }, h.deps),
      (error: unknown) => error instanceof EngineeringError && error.code === "REGISTRY_GRANT_INPUT_INVALID",
    );
  } finally { cleanup(h.dir); }
});

test("validateTokenRegistry keeps the exact boot rules (shared with loadOperationalConfig)", () => {
  assert.deepEqual(validateTokenRegistry(FIXTURE), FIXTURE);
  const bootRules = (error: unknown): boolean => error instanceof EngineeringError && error.code === "ENG_MCP_TOKEN_REGISTRY_INVALID";
  assert.throws(() => validateTokenRegistry([]), bootRules);
  assert.throws(() => validateTokenRegistry([{ ...FIXTURE[0]!, tokenHash: "short" }]), bootRules);
  assert.throws(() => validateTokenRegistry([{ ...FIXTURE[0]!, expiresAt: "not-a-date" }]), bootRules);
});

test("scope catalog drift guard: every scope string in the source gates is in KNOWN_REGISTRY_SCOPES", () => {
  const sources = ["src/tools.ts", "src/policy.ts", "src/server.ts", "src/main.ts"]
    .map((relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8")).join("\n");
  const found = [...new Set([...sources.matchAll(/"engineering:[a-z0-9:_-]+"/g)].map((match) => match[0]!.slice(1, -1)))];
  assert.ok(found.length >= 16, `expected the full gate catalog, found ${found.length}`);
  const missing = found.filter((scope) => !KNOWN_REGISTRY_SCOPES.includes(scope));
  assert.deepEqual(missing, [], "source scope strings missing from KNOWN_REGISTRY_SCOPES — extend the catalog");
});