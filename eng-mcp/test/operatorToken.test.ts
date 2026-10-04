// SEC-OPERATOR-IDENTITY-01 — tests for src/operatorToken.ts (token de ordem do
// operator + binding Telegram da camada 2).
// Coverage: (1) leitura fail-closed do arquivo do token (absente / não-arquivo /
// modo inseguro / corrompido / revogado / placeholder disabled / hash divergente /
// expirado / válido); (2) verificação determinística por comparação de hash
// (zero-LLM, zero execução); (3) NUNCA vaza o token — só hash16; (4) anti-self-
// write (assertOperatorTokenAccess: só 'read'); (5) camada 2: binding Telegram
// (/data/manifests/operator-allowlist.json) — ausente = inativa (fail-closed,
// nota honesta), origem allowlistada conta como token, origem estranha não.
// Determinístico: sem rede, sem LLM, arquivos em tmpdir com env override.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OPERATOR_TOKEN_DEFAULT_PATH,
  assertOperatorTokenAccess,
  operatorAllowlistPath,
  operatorTokenHash16Of,
  operatorTokenPath,
  readOperatorAllowlist,
  readOperatorOrderOrigin,
  readOperatorTokenFile,
  telegramBindingAllows,
  verifyOperatorOrderToken,
} from "../src/operatorToken.ts";
import { canonicalJson } from "../src/orchPreauthArtifact.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "optoken-"));
}

const TOKEN = "ordem-token-SEC-OPERATOR-IDENTITY-01-9f2c";
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");

/** Grava um arquivo de token com autointegridade correta (ou divergente com forceHash). */
function writeTokenFile(dir: string, body: Record<string, unknown>, mode = 0o600, forceHash?: string): string {
  const path = join(dir, "operator-order-token.json");
  const { hash16, ...rest } = body as { hash16?: string };
  const computed = createHash("sha256").update(canonicalJson(rest)).digest("hex").slice(0, 16);
  const full = { ...rest, hash16: forceHash ?? computed };
  writeFileSync(path, JSON.stringify(full, null, 2) + "\n", "utf8");
  chmodSync(path, mode);
  return path;
}

function validTokenBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, tokenHash: TOKEN_HASH, createdAt: "2026-10-04T00:00:00Z", ...extra };
}

// ---- 1. leitura fail-closed do arquivo do token ----
test("token file absent: status absent, nothing verified (fail-closed)", () => {
  const dir = tempDir();
  const path = join(dir, "operator-order-token.json");
  const reading = readOperatorTokenFile(path);
  assert.equal(reading.status, "absent");
  assert.equal(reading.reason, "ABSENT");
  assert.equal(verifyOperatorOrderToken(TOKEN, path).verified, false);
  rmSync(dir, { recursive: true, force: true });
});

test("token file insecure mode (group/world bits): refused like preauth artifact", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, validTokenBody(), 0o644);
  const reading = readOperatorTokenFile(path);
  assert.equal(reading.status, "invalid");
  assert.equal(reading.reason, "INSECURE_MODE");
  rmSync(dir, { recursive: true, force: true });
});

test("token file corrupt / not an object: invalid", () => {
  const dir = tempDir();
  const corrupt = join(dir, "corrupt.json");
  writeFileSync(corrupt, "{not json", "utf8");
  chmodSync(corrupt, 0o600);
  assert.equal(readOperatorTokenFile(corrupt).reason, "UNREADABLE_OR_CORRUPT");
  const arr = join(dir, "arr.json");
  writeFileSync(arr, "[]", "utf8");
  chmodSync(arr, 0o600);
  assert.equal(readOperatorTokenFile(arr).reason, "NOT_AN_OBJECT");
  rmSync(dir, { recursive: true, force: true });
});

test("token file revoked: refused before anything else", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, validTokenBody({ revoked: true }));
  const reading = readOperatorTokenFile(path);
  assert.equal(reading.status, "revoked");
  assert.equal(verifyOperatorOrderToken(TOKEN, path).verified, false);
  rmSync(dir, { recursive: true, force: true });
});

test("placeholder disabled: status disabled, verification refuses (fail-closed até o operator ativar)", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, { version: 1, disabled: true, note: "placeholder" });
  const reading = readOperatorTokenFile(path);
  assert.equal(reading.status, "disabled");
  assert.equal(verifyOperatorOrderToken(TOKEN, path).verified, false);
  assert.equal(verifyOperatorOrderToken(TOKEN, path).status, "disabled");
  rmSync(dir, { recursive: true, force: true });
});

test("tokenHash malformed (não 64 hex): invalid", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, { version: 1, tokenHash: "abc123" });
  assert.equal(readOperatorTokenFile(path).reason, "INVALID_TOKEN_HASH");
  rmSync(dir, { recursive: true, force: true });
});

test("expiresAt no futuro/passo: TTL opcional respeitado (expirado recusa; válido passa)", () => {
  const dir = tempDir();
  const future = writeTokenFile(dir, validTokenBody({ expiresAt: "2099-01-01T00:00:00Z" }));
  assert.equal(readOperatorTokenFile(future).status, "valid");
  const past = writeTokenFile(dir, validTokenBody({ expiresAt: "2020-01-01T00:00:00Z" }));
  const reading = readOperatorTokenFile(past, Date.parse("2026-10-04T00:00:00Z"));
  assert.equal(reading.status, "expired");
  assert.equal(verifyOperatorOrderToken(TOKEN, past, Date.parse("2026-10-04T00:00:00Z")).verified, false);
  rmSync(dir, { recursive: true, force: true });
});

test("self-integrity hash16 divergente: hash_mismatch (arquivo violado nunca verifica)", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, validTokenBody(), 0o600, "0000000000000000");
  const reading = readOperatorTokenFile(path);
  assert.equal(reading.status, "hash_mismatch");
  assert.equal(verifyOperatorOrderToken(TOKEN, path).verified, false);
  rmSync(dir, { recursive: true, force: true });
});

test("token file válido (0600): status valid com tokenHash16 nos metadados", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, validTokenBody());
  const reading = readOperatorTokenFile(path);
  assert.equal(reading.status, "valid");
  assert.equal(reading.reason, null);
  assert.equal(reading.tokenHash16, TOKEN_HASH.slice(0, 16));
  assert.equal(statSync(path).mode & 0o777, 0o600);
  rmSync(dir, { recursive: true, force: true });
});

// ---- 2. verificação determinística por comparação de hash ----
test("verify: token correto verifica; token errado recusa com presentedHash16 (nunca o token)", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, validTokenBody());
  const ok = verifyOperatorOrderToken(TOKEN, path);
  assert.equal(ok.verified, true);
  assert.equal(ok.tokenHash16, TOKEN_HASH.slice(0, 16));
  const bad = verifyOperatorOrderToken("outro-token-totalmente-diferente", path);
  assert.equal(bad.verified, false);
  assert.equal(bad.status, "invalid");
  assert.equal(bad.reason, "TOKEN_HASH_MISMATCH");
  assert.match(String(bad.presentedHash16), /^[0-9a-f]{16}$/);
  const payload = JSON.stringify(ok) + JSON.stringify(bad);
  assert.ok(!payload.includes(TOKEN), "token must never leak into the verdict");
  rmSync(dir, { recursive: true, force: true });
});

test("verify: replay após rotação/revogação/expiração é recusa tipada (status preservado)", () => {
  const dir = tempDir();
  const path = writeTokenFile(dir, validTokenBody({ revoked: true }));
  const replay = verifyOperatorOrderToken(TOKEN, path);
  assert.equal(replay.verified, false);
  assert.equal(replay.status, "revoked");
  rmSync(dir, { recursive: true, force: true });
});

test("default path é /data/manifests/operator-order-token.json; env override para provas", () => {
  assert.equal(operatorTokenPath({}), OPERATOR_TOKEN_DEFAULT_PATH);
  assert.equal(operatorTokenPath({ ENG_MCP_OPERATOR_TOKEN_FILE: "/x/y.json" }), "/x/y.json");
  assert.equal(operatorAllowlistPath({}), "/data/manifests/operator-allowlist.json");
  assert.equal(operatorAllowlistPath({ ENG_MCP_OPERATOR_ALLOWLIST_FILE: "/x/a.json" }), "/x/a.json");
});

test("operatorTokenHash16Of: hash16 determinístico do candidato (audit-only)", () => {
  assert.match(operatorTokenHash16Of(TOKEN), /^[0-9a-f]{16}$/);
  assert.equal(operatorTokenHash16Of(TOKEN), TOKEN_HASH.slice(0, 16));
});

// ---- 4. anti-self-write ----
test("assertOperatorTokenAccess: só 'read' — escrita recusa ANTI_SELF_APPROVE", () => {
  assert.doesNotThrow(() => assertOperatorTokenAccess("read"));
  assert.throws(() => assertOperatorTokenAccess("write" as never), /ANTI_SELF_APPROVE/);
  assert.throws(() => assertOperatorTokenAccess("create" as never), /ANTI_SELF_APPROVE/);
});

// ---- 5. camada 2: binding Telegram ----
function writeAllowlist(dir: string, body: Record<string, unknown>, mode = 0o600, forceHash?: string): string {
  const path = join(dir, "operator-allowlist.json");
  const { hash16, ...rest } = body as { hash16?: string };
  const computed = createHash("sha256").update(canonicalJson(rest)).digest("hex").slice(0, 16);
  writeFileSync(path, JSON.stringify({ ...rest, hash16: forceHash ?? computed }, null, 2) + "\n", "utf8");
  chmodSync(path, mode);
  return path;
}

test("allowlist ausente: camada 2 INATIVA (status inactive, nota honesta, fail-closed)", () => {
  const dir = tempDir();
  const reading = readOperatorAllowlist(join(dir, "operator-allowlist.json"));
  assert.equal(reading.status, "inactive");
  assert.equal(reading.reason, "ABSENT");
  rmSync(dir, { recursive: true, force: true });
});

test("allowlist válida: origem telegram allowlistada conta como token; chat estranho não", () => {
  const dir = tempDir();
  const path = writeAllowlist(dir, { version: 1, telegram: { chatIds: [{ chatId: "424242", label: "operator" }] } });
  const reading = readOperatorAllowlist(path);
  assert.equal(reading.status, "valid");
  const allowed = telegramBindingAllows({ platform: "telegram", chatId: "424242" }, path);
  assert.equal(allowed.allowed, true);
  assert.match(String(allowed.chatHash16), /^[0-9a-f]{16}$/);
  const stranger = telegramBindingAllows({ platform: "telegram", chatId: "999999" }, path);
  assert.equal(stranger.allowed, false);
  const notTelegram = telegramBindingAllows({ platform: "discord", chatId: "424242" }, path);
  assert.equal(notTelegram.allowed, false);
  rmSync(dir, { recursive: true, force: true });
});

test("allowlist violada (hash16 divergente): invalid — fail-closed, nunca autoriza", () => {
  const dir = tempDir();
  const path = writeAllowlist(dir, { version: 1, telegram: { chatIds: [{ chatId: "424242" }] } }, 0o600, "deadbeefdeadbeef");
  const reading = readOperatorAllowlist(path);
  assert.equal(reading.status, "hash_mismatch");
  assert.equal(telegramBindingAllows({ platform: "telegram", chatId: "424242" }, path).allowed, false);
  rmSync(dir, { recursive: true, force: true });
});

test("origem SEM contexto autenticado: binding não conta (fail-closed)", () => {
  const dir = tempDir();
  const path = writeAllowlist(dir, { version: 1, telegram: { chatIds: [{ chatId: "424242" }] } });
  assert.equal(telegramBindingAllows(null, path).allowed, false);
  assert.equal(telegramBindingAllows({ platform: "telegram", chatId: "" }, path).allowed, false);
  rmSync(dir, { recursive: true, force: true });
});

test("readOperatorOrderOrigin: env autenticado server-side, nunca payload", () => {
  assert.equal(readOperatorOrderOrigin({}), null);
  assert.equal(readOperatorOrderOrigin({ ENG_MCP_ORDER_ORIGIN_PLATFORM: "telegram" }), null, "chatId ausente → null");
  assert.deepEqual(
    readOperatorOrderOrigin({ ENG_MCP_ORDER_ORIGIN_PLATFORM: "telegram", ENG_MCP_ORDER_ORIGIN_CHAT_ID: "424242" }),
    { platform: "telegram", chatId: "424242" },
  );
});