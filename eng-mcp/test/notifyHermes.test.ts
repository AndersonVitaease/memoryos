import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { notifyHermesInputSchema, runNotifyHermes, __resetNotifyHermesStateForTests } from "../src/notifyHermes.ts";

// engineering.notify.hermes unit suite - deterministic, zero real network:
// globalThis.fetch is replaced by a fixture and restored in each test's
// finally. Every key below is a synthetic fixture. The sensitive-content
// trigger strings are BUILT at runtime (concatenation) so this source file
// itself never trips assertNoSensitiveContent.

type Fixture = { status: number; body?: unknown };

function stubFetch(respond: (url: string, body: unknown) => Fixture): { calls: Array<{ url: string; authorization?: string; sessionId?: string; body?: unknown }>; restore: () => void } {
  const calls: Array<{ url: string; authorization?: string; sessionId?: string; body?: unknown }> = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), authorization: headers.authorization ?? headers.Authorization, sessionId: headers["X-Hermes-Session-Id"], body: parsedBody });
    const fixture = respond(String(url), parsedBody);
    return new Response(JSON.stringify(fixture.body ?? {}), { status: fixture.status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

function withEnv(overrides: Record<string, string | undefined>): () => void {
  const keys = ["HERMES_API_KEY", "ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE", "ENG_MCP_HERMES_API_BASE", "ENG_MCP_HERMES_SESSION_ID", "ENG_MCP_HERMES_TIMEOUT_MS", "ENG_MCP_HERMES_COOLDOWN_MS", "ENG_MCP_HERMES_HOURLY_LIMIT"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) process.env[key] = value;
  return () => { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

// Longer than the 64-char run-id cap on purpose (truncation is asserted).
const GATEWAY_BODY = { id: "chatcmpl-fixture-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef-EXTRA-TAIL", choices: [{ message: { content: "ok" } }] };
const GH_TRIGGER = "ghp_" + "A".repeat(36);
const SK_TRIGGER = "sk-" + "f".repeat(25);

test("input schema: accepts the approved shape only - no URL, endpoint or credential field exists", () => {
  assert.equal(notifyHermesInputSchema.safeParse({ summary: "s" }).success, true);
  assert.equal(notifyHermesInputSchema.safeParse({ summary: "s", status: "partial" }).success, true);
  assert.equal(notifyHermesInputSchema.safeParse({ summary: "" }).success, false);
  assert.equal(notifyHermesInputSchema.safeParse({ summary: "x".repeat(501) }).success, false);
  assert.equal(notifyHermesInputSchema.safeParse({ summary: "s", status: "wtf" }).success, false);
  assert.equal(notifyHermesInputSchema.safeParse({ summary: "s", url: "http://attacker.example" }).success, false);
  assert.equal(notifyHermesInputSchema.safeParse({ summary: "s", endpoint: "http://attacker.example", credential: "x" }).success, false);
});

test("happy path: PT-BR one-way message to the fixed endpoint, delivered with bounded run id", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key" });
  const { calls, restore } = stubFetch((url) => url === "http://127.0.0.1:8642/v1/chat/completions" ? { status: 200, body: GATEWAY_BODY } : { status: 404 });
  try {
    const result = await runNotifyHermes({ summary: "Missão X concluída, testes 10/10" });
    assert.equal(result.delivered, true);
    assert.equal(result.status_code, 200);
    assert.equal(typeof result.latency_ms, "number");
    assert.equal(result.error, undefined);
    assert.equal(result.hermes_run_id?.length, 64);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8642/v1/chat/completions");
    assert.equal(calls[0].authorization, "Bearer fixture-hermes-key");
    assert.equal(calls[0].sessionId, "gh-notifications");
    assert.equal(result.session_id, "gh-notifications");
    const body = calls[0].body as { model: string; stream: boolean; messages: Array<{ role: string; content: string }> };
    assert.equal(body.model, "hermes-agent");
    assert.equal(body.stream, false);
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, "user");
    assert.match(body.messages[0].content, /\[GH\] Missão finalizada — status: complete/);
    assert.match(body.messages[0].content, /Missão X concluída, testes 10\/10/);
    assert.match(body.messages[0].content, /one-way/);
  } finally { restore(); restoreEnv(); }
});

test("credential missing: typed HERMES_CREDENTIAL_MISSING, zero network attempts", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({});
  const { calls, restore } = stubFetch(() => { throw new Error("network must not be reached"); });
  try {
    const result = await runNotifyHermes({ summary: "qualquer resumo" });
    assert.equal(result.delivered, false);
    assert.equal(result.error, "HERMES_CREDENTIAL_MISSING");
    assert.equal(calls.length, 0);
  } finally { restore(); restoreEnv(); }
});

test("credential file fallback + server-level API base override honored", async () => {
  __resetNotifyHermesStateForTests();
  const dir = await mkdtemp(path.join(tmpdir(), "hermes-notify-"));
  const credentialFile = path.join(dir, "hermes-notify-api-key");
  await writeFile(credentialFile, "fixture-file-key\n", "utf8");
  const restoreEnv = withEnv({ ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE: credentialFile, ENG_MCP_HERMES_API_BASE: "http://127.0.0.1:59999" });
  const { calls, restore } = stubFetch((url) => url.startsWith("http://127.0.0.1:59999/v1/chat/completions") ? { status: 200, body: { id: "chatcmpl-2" } } : { status: 404 });
  try {
    const result = await runNotifyHermes({ summary: "resumo via arquivo" });
    assert.equal(result.delivered, true);
    assert.equal(calls[0].url, "http://127.0.0.1:59999/v1/chat/completions");
    assert.equal(calls[0].authorization, "Bearer fixture-file-key");
  } finally { restore(); restoreEnv(); await rm(dir, { recursive: true, force: true }); }
});

test("status mapping: 401/400/429/5xx map to typed errors and never throw", async () => {
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key" });
  try {
    for (const [status, expected] of [[401, "HERMES_AUTH_REJECTED"], [400, "HERMES_BAD_REQUEST"], [429, "HERMES_BUSY"], [500, "HERMES_UPSTREAM_ERROR"], [503, "HERMES_UPSTREAM_ERROR"]] as Array<[number, string]>) {
      __resetNotifyHermesStateForTests();
      const { calls, restore } = stubFetch(() => ({ status, body: { error: "upstream fixture" } }));
      try {
        const result = await runNotifyHermes({ summary: `resumo status ${status}` });
        assert.equal(result.delivered, false);
        assert.equal(result.error, expected);
        assert.equal(calls.length, 1);
      } finally { restore(); }
    }
  } finally { restoreEnv(); }
});

test("network failure: HERMES_UNAVAILABLE with redacted detail, never throws", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key" });
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error(`connect ECONNREFUSED 127.0.0.1:8642 Bearer ${SK_TRIGGER}`); }) as typeof fetch;
  try {
    const result = await runNotifyHermes({ summary: "resumo rede" });
    assert.equal(result.delivered, false);
    assert.equal(result.error, "HERMES_UNAVAILABLE");
    assert.ok(!String(result.detail).includes(SK_TRIGGER));
  } finally { globalThis.fetch = previous; restoreEnv(); }
});

test("timeout: abort maps to HERMES_RUN_TIMEOUT", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key", ENG_MCP_HERMES_TIMEOUT_MS: "50" });
  const previous = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      reject(error);
    });
  })) as typeof fetch;
  try {
    const result = await runNotifyHermes({ summary: "resumo timeout" });
    assert.equal(result.delivered, false);
    assert.equal(result.error, "HERMES_RUN_TIMEOUT");
  } finally { globalThis.fetch = previous; restoreEnv(); }
});

test("cooldown: second attempt inside the window is RATE_LIMITED_LOCAL and reaches no network", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key" });
  let hits = 0;
  const { restore } = stubFetch(() => { hits += 1; return { status: 200, body: { id: "chatcmpl-3" } }; });
  try {
    const first = await runNotifyHermes({ summary: "primeira" });
    assert.equal(first.delivered, true);
    const second = await runNotifyHermes({ summary: "segunda" });
    assert.equal(second.delivered, false);
    assert.equal(second.error, "RATE_LIMITED_LOCAL");
    assert.equal(hits, 1);
  } finally { restore(); restoreEnv(); }
});

test("hourly budget: limit reached -> RATE_LIMITED_LOCAL; budget consumed on attempt even when the gateway fails", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key", ENG_MCP_HERMES_COOLDOWN_MS: "0" });
  const { restore } = stubFetch(() => ({ status: 500, body: {} }));
  try {
    for (let i = 0; i < 10; i++) {
      const result = await runNotifyHermes({ summary: `resumo tentativa ${i}` });
      assert.equal(result.delivered, false, "gateway is failing in this fixture");
    }
    const blocked = await runNotifyHermes({ summary: "resumo que estoura" });
    assert.equal(blocked.delivered, false);
    assert.equal(blocked.error, "RATE_LIMITED_LOCAL");
  } finally { restore(); restoreEnv(); }
});

test("dedupe: identical status+summary inside TTL -> DEDUPLICATED, no network hit, no budget consumption", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key", ENG_MCP_HERMES_COOLDOWN_MS: "0" });
  let hits = 0;
  const { restore } = stubFetch(() => { hits += 1; return { status: 200, body: { id: "chatcmpl-4" } }; });
  try {
    const first = await runNotifyHermes({ summary: "resumo repetido", status: "partial" });
    assert.equal(first.delivered, true);
    const second = await runNotifyHermes({ summary: "resumo repetido", status: "partial" });
    assert.equal(second.delivered, false);
    assert.equal(second.error, "DEDUPLICATED");
    assert.equal(hits, 1);
    const third = await runNotifyHermes({ summary: "resumo repetido", status: "failed" });
    assert.equal(third.delivered, true);
    assert.equal(hits, 2);
  } finally { restore(); restoreEnv(); }
});

test("sensitive content: SENSITIVE_CONTENT_BLOCKED before any rate state or network", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key" });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: {} }));
  try {
    const result = await runNotifyHermes({ summary: `token vazado: ${GH_TRIGGER}` });
    assert.equal(result.delivered, false);
    assert.equal(result.error, "SENSITIVE_CONTENT_BLOCKED");
    assert.equal(calls.length, 0);
  } finally { restore(); restoreEnv(); }
});

test("session continuity: default header gh-notifications lands every call in ONE persistent session", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key", ENG_MCP_HERMES_COOLDOWN_MS: "0" });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: { id: "chatcmpl-5" } }));
  try {
    const first = await runNotifyHermes({ summary: "primeira na sessão dedicada" });
    const second = await runNotifyHermes({ summary: "segunda na sessão dedicada" });
    assert.equal(first.delivered, true);
    assert.equal(second.delivered, true);
    assert.equal(first.session_id, "gh-notifications");
    assert.equal(second.session_id, "gh-notifications");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].sessionId, "gh-notifications");
    assert.equal(calls[1].sessionId, "gh-notifications");
  } finally { restore(); restoreEnv(); }
});

test("session continuity: env ENG_MCP_HERMES_SESSION_ID overrides the default (server-side only, never caller input)", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key", ENG_MCP_HERMES_SESSION_ID: "operator-main" });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: {} }));
  try {
    const result = await runNotifyHermes({ summary: "resumo na sessão do operador" });
    assert.equal(result.delivered, true);
    assert.equal(result.session_id, "operator-main");
    assert.equal(calls[0].sessionId, "operator-main");
  } finally { restore(); restoreEnv(); }
});

test("session continuity: invalid server-side session id is fail-closed HERMES_SESSION_ID_INVALID with zero network", async () => {
  __resetNotifyHermesStateForTests();
  const restoreEnv = withEnv({ HERMES_API_KEY: "fixture-hermes-key", ENG_MCP_HERMES_SESSION_ID: "bad/../id" });
  const { calls, restore } = stubFetch(() => { throw new Error("network must not be reached"); });
  try {
    const result = await runNotifyHermes({ summary: "resumo com sessão inválida" });
    assert.equal(result.delivered, false);
    assert.equal(result.error, "HERMES_SESSION_ID_INVALID");
    assert.equal(calls.length, 0);
  } finally { restore(); restoreEnv(); }
});
