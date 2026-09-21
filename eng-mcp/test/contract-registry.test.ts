// CONTRACT-01 — contract tests for the REAL registry boot parser
// (validateTokenRegistry in src/registryScopeGrant.ts — the single validator
// shared by loadOperationalConfig and engineering.registry.scope.grant).
// The zod schema (src/judgeContracts.ts, pinned to TokenRecord at compile
// time) and the boot parser are two independent derivations of the registry
// boundary: the matrix below requires the schema to never be weaker than the
// boot gate, and the drift guard keeps main.ts wired to the shared validator
// (REGISTRY-GRANT-01 point 7). All hashes are synthetic runtime values.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateTokenRegistry, KNOWN_REGISTRY_SCOPES } from "../src/registryScopeGrant.ts";
import { EngineeringError, type TokenRecord } from "../src/policy.ts";
import { registryFileSchema, registryTokenRecordSchema } from "../src/judgeContracts.ts";

const record = (overrides: Partial<TokenRecord> = {}): TokenRecord => ({
  tokenHash: "ab".repeat(32),
  subject: "release-runner-2026-09-19",
  scopes: ["engineering:release", "engineering:judge:read"],
  allowedRepositoryIds: ["memoryos"],
  expiresAt: "2099-01-01T00:00:00.000Z",
  revokedAt: null,
  ...overrides,
});

const without = (token: TokenRecord, key: keyof TokenRecord): unknown => {
  const copy: Record<string, unknown> = { ...token };
  delete copy[key];
  return copy;
};

const bootAccepts = (tokens: unknown): boolean => {
  try {
    validateTokenRegistry(tokens);
    return true;
  } catch {
    return false;
  }
};
const schemaAccepts = (tokens: unknown): boolean => registryFileSchema.safeParse({ tokens }).success;

test("boot parser round-trips the synthetic fixture and the schema parses the same file", () => {
  const tokens: TokenRecord[] = [
    record(),
    record({
      tokenHash: "cd".repeat(32),
      subject: "operator-2026-09-17b",
      scopes: ["engineering:registry:scope:grant"],
      revokedAt: "2026-08-01T00:00:00.000Z",
    }),
  ];
  const file = JSON.parse(JSON.stringify({ tokens }));
  assert.deepEqual(validateTokenRegistry(file.tokens), tokens);
  assert.deepEqual(registryFileSchema.parse(file).tokens, tokens);
  for (const scope of tokens.flatMap((token) => token.scopes)) {
    assert.ok(KNOWN_REGISTRY_SCOPES.includes(scope), `${scope} is in the catalog`);
  }
});

test("CONTRACT: boot parser and schema agree on every mutated record", () => {
  const cases: Array<[string, unknown, boolean]> = [
    ["valid record, revokedAt null", [record()], true],
    ["valid record, revokedAt as ISO string (legacy revoked entry)", [record({ revokedAt: "2026-08-01T00:00:00.000Z" })], true],
    ["uppercase hex hash (boot regex is case-insensitive)", [record({ tokenHash: "CD".repeat(32) })], true],
    ["non-hex hash", [record({ tokenHash: "zz".repeat(32) })], false],
    ["short hash", [record({ tokenHash: "ab".repeat(16) })], false],
    ["garbage expiresAt", [record({ expiresAt: "not-a-date" })], false],
    ["missing expiresAt", [without(record(), "expiresAt")], false],
    ["missing subject", [without(record(), "subject")], false],
    ["subject not a string", [record({ subject: 42 as unknown as string })], false],
    ["missing scopes", [without(record(), "scopes")], false],
    ["scopes not an array", [record({ scopes: "engineering:read" as unknown as string[] })], false],
    ["missing allowedRepositoryIds", [without(record(), "allowedRepositoryIds")], false],
    ["tokens: empty array", [], false],
    ["tokens: not an array", "tokens", false],
    ["tokens: undefined", undefined, false],
  ];
  for (const [label, tokens, accepts] of cases) {
    assert.equal(bootAccepts(tokens), accepts, `boot verdict for ${label}`);
    assert.equal(schemaAccepts(tokens), accepts, `schema verdict for ${label}`);
  }
});

test("CONTRACT invariants: the schema is never weaker than the boot gate", () => {
  // Directional invariants: (a) schema-accept implies boot-accept (universal —
  // the schema is the stricter write-shape contract); (b) boot-accept implies
  // schema-accept on every case without the extra-field asymmetry, which is
  // asserted separately below.
  const candidateTokens: Array<[string, unknown]> = [
    ["valid", [record()]],
    ["revoked ISO string", [record({ revokedAt: "2026-08-01T00:00:00.000Z" })]],
    ["uppercase hash", [record({ tokenHash: "CD".repeat(32) })]],
    ["non-hex hash", [record({ tokenHash: "zz".repeat(32) })]],
    ["garbage expiresAt", [record({ expiresAt: "nope" })]],
    ["missing expiresAt", [without(record(), "expiresAt")]],
    ["missing scopes", [without(record(), "scopes")]],
    ["empty array", []],
    ["non-array", "tokens"],
  ];
  for (const [label, tokens] of candidateTokens) {
    const boot = bootAccepts(tokens);
    const schema = schemaAccepts(tokens);
    assert.ok(!schema || boot, `schema must accept only records production boots (${label})`);
    assert.ok(!boot || schema, `schema must accept everything the boot gate accepts (${label})`);
  }
});

test("CONTRACT asymmetry, documented: boot parser tolerates legacy extra fields; the schema pins the TokenRecord shape", () => {
  // The boot loader is a lenient legacy reader (extra fields pass through);
  // registryTokenRecordSchema pins the TYPED shape the grant tool writes.
  // This is the same deliberate asymmetry as the error envelope: read side
  // lenient, write/type side exact.
  const legacy = { ...record(), legacyNote: "pre-REGISTRY-GRANT-01 field" };
  assert.doesNotThrow(() => validateTokenRegistry([legacy]));
  assert.equal(registryTokenRecordSchema.safeParse(legacy).success, false);
});

test("validateTokenRegistry keeps the exact historical boot failure signature", () => {
  assert.throws(
    () => validateTokenRegistry([]),
    (error: unknown) => error instanceof EngineeringError
      && error.code === "ENG_MCP_TOKEN_REGISTRY_INVALID"
      && error.message === "tokens must be a non-empty array",
  );
  assert.throws(
    () => validateTokenRegistry([record({ tokenHash: "zz".repeat(32) })]),
    (error: unknown) => error instanceof EngineeringError
      && error.code === "ENG_MCP_TOKEN_REGISTRY_INVALID"
      && error.message === "token record fails the boot validation rules",
  );
});

test("registryFileSchema mirrors the boot loader's file-level parsing (loose top level, tokens required)", () => {
  const file = JSON.parse(JSON.stringify({ tokens: [record()] }));
  assert.equal(registryFileSchema.safeParse(file).success, true);
  // Extra top-level fields are tolerated exactly like JSON.parse in loadOperationalConfig:
  assert.equal(registryFileSchema.safeParse({ ...file, legacyField: 1 }).success, true);
  // tokens missing/empty/non-array fail the file schema the same way the boot
  // validator fails the parsed value:
  assert.equal(registryFileSchema.safeParse({}).success, false);
  assert.equal(bootAccepts(undefined), false);
});

test("drift guard: main.ts boots through the shared validateTokenRegistry (single source of truth)", () => {
  const mainSource = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
  assert.ok(
    mainSource.includes('import { validateTokenRegistry } from "./registryScopeGrant.ts"'),
    "loadOperationalConfig must import the shared validator from registryScopeGrant.ts",
  );
  assert.ok(
    mainSource.includes("validateTokenRegistry(parsed.tokens)"),
    "boot must validate the registry through the shared validator",
  );
});