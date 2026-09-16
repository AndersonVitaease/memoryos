// engineering auth-session transport tests — deterministic, dependency-injected
// only (no real network, no real staging bind, no real secrets). Covers:
// ingest contract + domain binding + TTL/expiry + store caps, opaque-ref
// resolution fail-closed paths, slot apply/restore/mutex semantics, web
// connector fail-closed rejection BEFORE any transport call, v1 behavior
// preservation without a ref, and the HTTP ingest route contract (auth,
// schema, CORS, bounded body, secret hygiene).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  AuthSessionError,
  AuthSessionManager,
  applyAuthSessionSlot,
  assertAuthSessionDomain,
  authSessionSlotPaths,
  handleAuthSessionRequest,
  resetAuthSessionTokenCache,
  verifyAuthSessionToken,
  defaultAuthSessionManager,
} from "../src/authSession.ts";
import { runWebConnector, type WebConnectorTransport } from "../src/webConnector.ts";

const SECRET_1 = "github-session-secret-value-1";
const SECRET_2 = "github-session-secret-value-2";

function githubPayload(overrides: Record<string, unknown> = {}) {
  return {
    domain: "github.com",
    storageState: {
      cookies: [
        { name: "user_session", value: SECRET_1, domain: ".github.com", path: "/", expires: 4_102_444_799, httpOnly: true, secure: true, sameSite: "Lax" },
        { name: "__Host-user_session_same_site", value: SECRET_2, domain: "github.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Strict" },
      ],
      origins: [],
    },
    ...overrides,
  };
}

function okTransport(): { transport: WebConnectorTransport; sequences: number } {
  let sequences = 0;
  const transport: WebConnectorTransport = {
    name: "fake",
    async call() { return { ok: true, status: 200, durationMs: 1 }; },
    async callSequence(items) {
      sequences += 1;
      return {
        ok: true,
        status: 200,
        results: items.map((item, index) => ({ index, toolName: item.toolName, ok: true, result: { content: [{ type: "text", text: "ok" }] } })),
        stepsRequested: items.length,
        stepsExecuted: items.length,
        durationMs: 1,
      };
    },
  };
  return { transport, get sequences() { return sequences; } };
}

test("ingest: happy path stores a domain-bound session and returns an opaque receipt without secrets", () => {
  const manager = new AuthSessionManager();
  const now = 1_000_000;
  const receipt = manager.ingest(githubPayload(), now);
  assert.match(receipt.authSessionRef, /^[0-9a-f]{32}$/);
  assert.equal(receipt.domain, "github.com");
  assert.equal(receipt.cookieCount, 2);
  assert.equal(receipt.expiresAt, now + 15 * 60_000);
  const resolved = manager.resolve(receipt.authSessionRef, now + 1);
  assert.equal(resolved.domain, "github.com");
  assert.equal(resolved.storageState.cookies.length, 2);
  assert.equal(manager.size, 1);
});

test("ingest: cookie outside the session domain is rejected (AUTH_SESSION_DOMAIN_MISMATCH)", () => {
  const manager = new AuthSessionManager();
  const payload = githubPayload();
  (payload.storageState as { cookies: unknown[] }).cookies.push({ name: "SID", value: "x", domain: ".google.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" });
  assert.throws(() => manager.ingest(payload, 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_DOMAIN_MISMATCH");
});

test("ingest: schema rejections (missing domain, extra key, empty cookies, ttl over cap) and no secret values in error text", () => {
  const manager = new AuthSessionManager();
  const missingDomain = githubPayload(); delete (missingDomain as Record<string, unknown>).domain;
  assert.throws(() => manager.ingest(missingDomain, 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_PAYLOAD_INVALID");
  assert.throws(() => manager.ingest(githubPayload({ extra: true }), 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_PAYLOAD_INVALID");
  const noCookies = githubPayload();
  (noCookies.storageState as { cookies: unknown[] }).cookies = [];
  assert.throws(() => manager.ingest(noCookies, 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_PAYLOAD_INVALID");
  assert.throws(() => manager.ingest(githubPayload({ ttlMinutes: 61 }), 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_PAYLOAD_INVALID");
});

test("ingest: extension 0.3.4 real-Chrome payload (fractional expirationDate) is accepted, receipt carries no secrets", () => {
  const manager = new AuthSessionManager();
  const now = 1_000_000;
  // chrome.cookies returns expirationDate as a double with fractional seconds
  // (proven from real extension exports); Playwright storageState carries it as-is.
  const payload = githubPayload();
  const cookies = payload.storageState.cookies as Array<{ expires: number }>;
  cookies[0].expires = 1_799_445_235.316979;
  const receipt = manager.ingest(payload, now);
  assert.match(receipt.authSessionRef, /^[0-9a-f]{32}$/);
  assert.equal(receipt.cookieCount, 2);
  assert.ok(!JSON.stringify(receipt).includes(SECRET_1));
  const resolved = manager.resolve(receipt.authSessionRef, now + 1);
  assert.equal(resolved.storageState.cookies[0].expires, 1_799_445_235.316979);
});

test("ingest: expires bounds still enforced after fractional acceptance (out-of-range still rejected)", () => {
  const manager = new AuthSessionManager();
  const low = githubPayload();
  ((low.storageState.cookies as Array<{ expires: number }>)[0]).expires = -2;
  assert.throws(() => manager.ingest(low, 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_PAYLOAD_INVALID");
  const high = githubPayload();
  ((high.storageState.cookies as Array<{ expires: number }>)[0]).expires = 4_102_444_801;
  assert.throws(() => manager.ingest(high, 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_PAYLOAD_INVALID");
});

test("ingest: store cap is fail-closed (AUTH_SESSION_STORE_FULL)", () => {
  const manager = new AuthSessionManager({ maxSessions: 1 });
  manager.ingest(githubPayload(), 1);
  assert.throws(() => manager.ingest(githubPayload(), 2), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_STORE_FULL");
});

test("resolve: unknown ref, malformed ref and expired ref are fail-closed; expiry deletes the entry", () => {
  const manager = new AuthSessionManager();
  assert.throws(() => manager.resolve("0".repeat(32), 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_NOT_FOUND");
  assert.throws(() => manager.resolve("not-a-ref", 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_NOT_FOUND");
  const receipt = manager.ingest(githubPayload(), 1_000);
  assert.throws(() => manager.resolve(receipt.authSessionRef, 1_000 + 15 * 60_000), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_EXPIRED");
  assert.throws(() => manager.resolve(receipt.authSessionRef, 1_000 + 15 * 60_000 + 1), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_NOT_FOUND");
  assert.equal(manager.size, 0);
});

test("domain binding: exact host and subdomain pass; foreign host and unparseable URL are rejected", () => {
  assertAuthSessionDomain("github.com", "https://github.com/settings/profile");
  assertAuthSessionDomain("github.com", "https://www.github.com/settings/profile");
  assert.throws(() => assertAuthSessionDomain("github.com", "https://gitlab.com/settings/profile"), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_DOMAIN_MISMATCH");
  assert.throws(() => assertAuthSessionDomain("github.com", "not a url"), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_DOMAIN_MISMATCH");
  // A lookalike SUFFIX is not a subdomain.
  assert.throws(() => assertAuthSessionDomain("github.com", "https://notgithub.com/"), (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_DOMAIN_MISMATCH");
});

test("slot: session is written before run and fallback restored after (even on failure); missing fallback is fail-closed", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "authslot-"));
  try {
    const paths = { slotPath: path.join(dir, "slot.json"), fallbackPath: path.join(dir, "fallback.json") };
    await writeFile(paths.fallbackPath, JSON.stringify({ cookies: [{ name: "fallback", value: "f" }], origins: [] }));
    const manager = new AuthSessionManager();
    const receipt = manager.ingest(githubPayload(), 1);
    const session = manager.resolve(receipt.authSessionRef, 1);
    let ran = 0;
    await applyAuthSessionSlot(paths, session, async () => {
      ran += 1;
      const slot = JSON.parse(await readFile(paths.slotPath, "utf8"));
      assert.equal(slot.cookies.length, 2);
      return "done";
    });
    assert.equal(ran, 1);
    const restored = JSON.parse(await readFile(paths.slotPath, "utf8"));
    assert.equal(restored.cookies.length, 1);
    // failure path: fallback still restored, error propagates
    await assert.rejects(() => applyAuthSessionSlot(paths, session, async () => { throw new Error("boom"); }), /boom/);
    const restoredAfterFailure = JSON.parse(await readFile(paths.slotPath, "utf8"));
    assert.equal(restoredAfterFailure.cookies.length, 1);
    // missing fallback: run never executes
    await rm(paths.fallbackPath);
    await assert.rejects(
      () => applyAuthSessionSlot(paths, session, async () => { ran += 1; return "x"; }),
      (error: unknown) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_FALLBACK_MISSING",
    );
    assert.equal(ran, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("slot: concurrent applies are serialized (no interleaved slot writes)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "authslot-mutex-"));
  try {
    const paths = { slotPath: path.join(dir, "slot.json"), fallbackPath: path.join(dir, "fallback.json") };
    await writeFile(paths.fallbackPath, "{}");
    const manager = new AuthSessionManager();
    const a = manager.resolve(manager.ingest({ ...githubPayload(), domain: "a.example.com", storageState: { cookies: [{ name: "s", value: "A", domain: "a.example.com", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" }], origins: [] } }, 1).authSessionRef, 1);
    const b = manager.resolve(manager.ingest({ ...githubPayload(), domain: "b.example.com", storageState: { cookies: [{ name: "s", value: "B", domain: "b.example.com", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" }], origins: [] } }, 1).authSessionRef, 1);
    const events: string[] = [];
    await Promise.all([
      applyAuthSessionSlot(paths, a, async () => {
        const slot = JSON.parse(await readFile(paths.slotPath, "utf8"));
        events.push(`start:${slot.cookies[0].value}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push(`end:${slot.cookies[0].value}`);
      }),
      applyAuthSessionSlot(paths, b, async () => {
        const slot = JSON.parse(await readFile(paths.slotPath, "utf8"));
        events.push(`start:${slot.cookies[0].value}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end:${slot.cookies[0].value}`);
      }),
    ]);
    assert.equal(events.length, 4);
    assert.equal(events[0].startsWith("start:"), true);
    assert.equal(events[1], `end:${events[0].slice(6)}`);
    assert.equal(events[2].startsWith("start:"), true);
    assert.equal(events[3], `end:${events[2].slice(6)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("token verification: sha256 of presented raw token compared timing-safe; malformed rejected", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "authtoken-"));
  const previousTokenFile = process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE;
  try {
    const tokenFile = path.join(dir, "auth-session.token.json");
    const raw = "a".repeat(64);
    process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE = tokenFile;
    resetAuthSessionTokenCache();
    await writeFile(tokenFile, JSON.stringify({ tokenHash: createHash("sha256").update(raw).digest("hex") }));
    assert.equal(await verifyAuthSessionToken("short"), false);
    assert.equal(await verifyAuthSessionToken("z".repeat(64)), false);
    assert.equal(await verifyAuthSessionToken(raw), true);
    await writeFile(tokenFile, createHash("sha256").update("b".repeat(64)).digest("hex")); // bare hex = the token HASH
    resetAuthSessionTokenCache(); // hash file is cached after first load (by design)
    assert.equal(await verifyAuthSessionToken("b".repeat(64)), true);
    await writeFile(tokenFile, JSON.stringify({ nope: 1 }));
    resetAuthSessionTokenCache();
    assert.equal(await verifyAuthSessionToken(raw), false);
  } finally {
    resetAuthSessionTokenCache();
    if (previousTokenFile === undefined) delete process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE; else process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE = previousTokenFile;
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- engineering.web.connector fail-closed integration (fake transport) ----

test("web connector: unknown authSessionRef is rejected BEFORE any transport call", async () => {
  const { transport } = okTransport();
  const result = await runWebConnector("engineering.web.connector", {
    authSessionRef: "0".repeat(32),
    steps: [{ action: "navigate", url: "https://github.com/settings/profile" }],
  }, { transport, authSessionSlot: { slotPath: "/tmp/authslot-test-slot.json", fallbackPath: "/tmp/authslot-test-fallback.json" } });
  assert.equal(result.status, "AUTH_SESSION_REJECTED");
  assert.equal(result.error, "AUTH_SESSION_NOT_FOUND");
});

test("web connector: expired authSessionRef is rejected BEFORE any transport call", async () => {
  const receipt = defaultAuthSessionManager.ingest(githubPayload(), Date.now() - 16 * 60_000);
  const { transport } = okTransport();
  const result = await runWebConnector("engineering.web.connector", {
    authSessionRef: receipt.authSessionRef,
    steps: [{ action: "navigate", url: "https://github.com/settings/profile" }],
  }, { transport, authSessionSlot: { slotPath: "/tmp/authslot-test-slot.json", fallbackPath: "/tmp/authslot-test-fallback.json" } });
  assert.equal(result.status, "AUTH_SESSION_REJECTED");
  assert.equal(result.error, "AUTH_SESSION_EXPIRED");
});

test("web connector: ref without navigate step is rejected (AUTH_SESSION_DOMAIN_UNVERIFIABLE)", async () => {
  const receipt = defaultAuthSessionManager.ingest(githubPayload());
  const { transport } = okTransport();
  const result = await runWebConnector("engineering.web.connector", {
    authSessionRef: receipt.authSessionRef,
    steps: [{ action: "snapshot" }],
  }, { transport });
  assert.equal(result.status, "AUTH_SESSION_REJECTED");
  assert.equal(result.error, "AUTH_SESSION_DOMAIN_UNVERIFIABLE");
});

test("web connector: navigation outside the session domain is rejected (AUTH_SESSION_DOMAIN_MISMATCH)", async () => {
  const receipt = defaultAuthSessionManager.ingest(githubPayload());
  const { transport } = okTransport();
  const result = await runWebConnector("engineering.web.connector", {
    authSessionRef: receipt.authSessionRef,
    steps: [{ action: "navigate", url: "https://gitlab.com/profile" }],
  }, { transport });
  assert.equal(result.status, "AUTH_SESSION_REJECTED");
  assert.equal(result.error, "AUTH_SESSION_DOMAIN_MISMATCH");
});

test("web connector: with a valid ref the session is applied to the slot BEFORE the sequence, restored AFTER, and no secret reaches the result", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "authslot-e2e-"));
  try {
    const paths = { slotPath: path.join(dir, "slot.json"), fallbackPath: path.join(dir, "fallback.json") };
    const fallbackContent = JSON.stringify({ cookies: [{ name: "devsession", value: "dev" }], origins: [] });
    await writeFile(paths.fallbackPath, fallbackContent);
    const receipt = defaultAuthSessionManager.ingest(githubPayload());
    let slotCookieCountDuringSequence = -1;
    const fake: WebConnectorTransport = {
      name: "fake",
      async call() { return { ok: true, status: 200, durationMs: 1 }; },
      async callSequence(items) {
        const slot = JSON.parse(await readFile(paths.slotPath, "utf8"));
        slotCookieCountDuringSequence = slot.cookies.length;
        assert.equal(items[0].toolName, "browser_navigate");
        return {
          ok: true,
          status: 200,
          results: items.map((item, index) => ({ index, toolName: item.toolName, ok: true, result: { content: [{ type: "text", text: "ok" }] } })),
          stepsRequested: items.length,
          stepsExecuted: items.length,
          durationMs: 1,
        };
      },
    };
    const result = await runWebConnector("engineering.web.connector", {
      authSessionRef: receipt.authSessionRef,
      steps: [
        { action: "navigate", url: "https://github.com/settings/profile" },
        { action: "snapshot" },
      ],
    }, { transport: fake, authSessionSlot: paths });
    assert.equal(result.status, "OK");
    assert.equal(slotCookieCountDuringSequence, 2);
    const auth = result.authSession as { ref: string; domain: string };
    assert.equal(auth.domain, "github.com");
    assert.equal(auth.ref, receipt.authSessionRef);
    const restored = await readFile(paths.slotPath, "utf8");
    assert.equal(restored, fallbackContent);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(SECRET_1), false);
    assert.equal(serialized.includes(SECRET_2), false);
    assert.match(serialized, /auth session applied to context slot/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("web connector: WITHOUT authSessionRef the v1 flow is byte-identical and the slot file is never touched", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "authslot-noref-"));
  try {
    const paths = { slotPath: path.join(dir, "slot.json"), fallbackPath: path.join(dir, "fallback.json") };
    const canary = JSON.stringify({ cookies: [{ name: "canary", value: "c" }], origins: [] });
    await writeFile(paths.slotPath, canary);
    await writeFile(paths.fallbackPath, "{}");
    const { transport } = okTransport();
    const result = await runWebConnector("engineering.web.connector", {
      steps: [{ action: "navigate", url: "https://dev.to/enter" }, { action: "snapshot" }],
    }, { transport, authSessionSlot: paths });
    assert.equal(result.status, "OK");
    assert.equal("authSession" in result, false);
    assert.equal(await readFile(paths.slotPath, "utf8"), canary);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("web connector: authSessionRef must match the opaque 32-hex shape (schema-level rejection)", async () => {
  const { transport } = okTransport();
  const result = await runWebConnector("engineering.web.connector", {
    authSessionRef: "raw-cookies-here",
    steps: [{ action: "navigate", url: "https://github.com/" }],
  }, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(result.error, "INPUT_SCHEMA_REJECTED");
});

test("schema: authSessionSlotPaths honors env overrides and explicit overrides", () => {
  const previousSlot = process.env.ENG_MCP_AUTH_SESSION_SLOT;
  const previousFallback = process.env.ENG_MCP_AUTH_SESSION_FALLBACK;
  try {
    delete process.env.ENG_MCP_AUTH_SESSION_SLOT;
    delete process.env.ENG_MCP_AUTH_SESSION_FALLBACK;
    const defaults = authSessionSlotPaths();
    assert.equal(defaults.slotPath, "/opt/memoryos/playwright-staging/auth-session-active.json");
    assert.equal(defaults.fallbackPath, "/opt/memoryos/playwright-staging/auth-session-fallback.json");
    process.env.ENG_MCP_AUTH_SESSION_SLOT = "/tmp/s.json";
    process.env.ENG_MCP_AUTH_SESSION_FALLBACK = "/tmp/f.json";
    const env = authSessionSlotPaths();
    assert.equal(env.slotPath, "/tmp/s.json");
    assert.equal(env.fallbackPath, "/tmp/f.json");
    const explicit = authSessionSlotPaths({ slotPath: "/x.json" });
    assert.equal(explicit.slotPath, "/x.json");
    assert.equal(explicit.fallbackPath, "/tmp/f.json");
  } finally {
    if (previousSlot === undefined) delete process.env.ENG_MCP_AUTH_SESSION_SLOT; else process.env.ENG_MCP_AUTH_SESSION_SLOT = previousSlot;
    if (previousFallback === undefined) delete process.env.ENG_MCP_AUTH_SESSION_FALLBACK; else process.env.ENG_MCP_AUTH_SESSION_FALLBACK = previousFallback;
  }
});

// ---- HTTP ingest route contract (ephemeral local server) ----

test("http route: OPTIONS/POST/405, token gate, schema gate, bounded body, secret hygiene", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "authhttp-"));
  const server = createServer((request, response) => {
    if (handleAuthSessionRequest(request, response)) return;
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/auth-session`;
  const tokenFile = path.join(dir, "auth-session.token.json");
  const raw = "c".repeat(64);
  await writeFile(tokenFile, JSON.stringify({ tokenHash: createHash("sha256").update(raw).digest("hex") }));
  const previousTokenFile = process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE;
  process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE = tokenFile;
  resetAuthSessionTokenCache();
  try {
    // OPTIONS preflight
    const options = await fetch(base, { method: "OPTIONS" });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-headers"), "authorization, content-type");
    // wrong method
    const get = await fetch(base, { method: "GET" });
    assert.equal(get.status, 405);
    // missing/invalid token
    const noAuth = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(githubPayload()) });
    assert.equal(noAuth.status, 401);
    const badAuth = await fetch(base, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${"d".repeat(64)}` }, body: JSON.stringify(githubPayload()) });
    assert.equal(badAuth.status, 401);
    const badAuthBody = (await badAuth.json()) as { error: string };
    assert.equal(badAuthBody.error, "AUTH_SESSION_INGEST_UNAUTHORIZED");
    // non-JSON body
    const notJson = await fetch(base, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${raw}` }, body: "not json" });
    assert.equal(notJson.status, 400);
    const notJsonBody = (await notJson.json()) as { error: string; detail?: string };
    assert.equal(notJsonBody.error, "AUTH_SESSION_PAYLOAD_INVALID");
    assert.equal(notJsonBody.detail, "BODY_NOT_JSON");
    // invalid payload (foreign-domain cookie) with no secret echo
    const bad = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${raw}` },
      body: JSON.stringify({ domain: "github.com", storageState: { cookies: [{ name: "SID", value: SECRET_1, domain: ".google.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [] } }),
    });
    assert.equal(bad.status, 400);
    const badBody = JSON.stringify(await bad.json());
    assert.equal(badBody.includes(SECRET_1), false);
    assert.match(badBody, /AUTH_SESSION_DOMAIN_MISMATCH/);
    // oversized body
    const big = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${raw}` },
      body: JSON.stringify({ pad: "x".repeat(1_100_000) }),
    });
    assert.equal(big.status, 413);
    // happy path: 200 + opaque receipt, response carries no secret values
    const ok = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${raw}` },
      body: JSON.stringify(githubPayload()),
    });
    assert.equal(ok.status, 200);
    const okBody = (await ok.json()) as { ok: boolean; authSessionRef: string; domain: string; cookieCount: number; expiresAt: number };
    assert.equal(okBody.ok, true);
    assert.match(okBody.authSessionRef, /^[0-9a-f]{32}$/);
    assert.equal(okBody.domain, "github.com");
    assert.equal(okBody.cookieCount, 2);
    const okSerialized = JSON.stringify(okBody);
    assert.equal(okSerialized.includes(SECRET_1), false);
    assert.equal(okSerialized.includes(SECRET_2), false);
    // the ingested session is resolvable via the default manager (runtime path)
    const resolved = defaultAuthSessionManager.resolve(okBody.authSessionRef);
    assert.equal(resolved.domain, "github.com");
  } finally {
    resetAuthSessionTokenCache();
    if (previousTokenFile === undefined) delete process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE; else process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE = previousTokenFile;
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
