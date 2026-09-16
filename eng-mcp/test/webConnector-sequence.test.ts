// engineering.web.connector — sequence persistence tests (T1..T10).
// All tests inject FAKE transports/staging roots: no network, no gateway, no
// Playwright, zero mutation. Verifies: one callSequence per invocation (single
// downstream MCP session), stop-on-first-error, allowlist/deny preservation,
// single-action compat, staging cleanup on success AND failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWebConnector, type WebConnectorTransport, type WebConnectorSequenceResult } from "../src/webConnector.ts";

const SINGLE_OK: WebConnectorSequenceResult = {
  ok: true, status: 200, durationMs: 1,
  stepsRequested: 1, stepsExecuted: 1,
  results: [{ index: 0, toolName: "browser_navigate", ok: true, result: { content: [] } }],
};

function fakeTransport(behavior: {
  sequenceResults?: Array<{ index: number; toolName: string; ok: boolean; result?: unknown; error?: Record<string, unknown> }>;
  ok?: boolean;
  error?: string;
} = {}): WebConnectorTransport & { seqCalls: number; lastItems: Array<{ toolName: string; args: Record<string, unknown> }>; closed: boolean } {
  const fake = {
    name: "fake",
    seqCalls: 0,
    lastItems: [] as Array<{ toolName: string; args: Record<string, unknown> }>,
    closed: false,
    async call(toolName: string, args: Record<string, unknown>) {
      fake.seqCalls += 1;
      return { ok: true, status: 200, result: { content: [] }, durationMs: 1 };
    },
    async callSequence(items: Array<{ toolName: string; args: Record<string, unknown> }>): Promise<WebConnectorSequenceResult> {
      fake.seqCalls += 1;
      fake.lastItems = items;
      fake.closed = true; // gateway closes transport in finally -> session ended after the ONE call
      if (behavior.ok === false) return { ok: false, status: 502, error: behavior.error ?? "UPSTREAM_ERROR", durationMs: 1 };
      return {
        ok: true, status: 200, durationMs: 1,
        stepsRequested: items.length,
        stepsExecuted: (behavior.sequenceResults ?? []).filter((r) => r.ok).length,
        results: behavior.sequenceResults ?? items.map((item, index) => ({ index, toolName: item.toolName, ok: true, result: { content: [{ type: "text", text: "ok" }] } })),
      };
    },
  };
  return fake as unknown as WebConnectorTransport & typeof fake;
}

const BASE = { server: "web-connector" as const };

test("T1+T2+T3: navigate->snapshot / tabs / find ride ONE sequence call in order", async () => {
  const fake = fakeTransport();
  const out = await runWebConnector("t", { ...BASE, steps: [
    { action: "navigate", url: "https://dev.to/new" },
    { action: "snapshot" },
  ] }, { transport: fake });
  assert.equal(out.status, "OK");
  assert.equal(fake.seqCalls, 1, "exactly ONE gateway call => ONE downstream MCP session");
  assert.equal(fake.lastItems.length, 2);
  assert.deepEqual(fake.lastItems.map((i) => i.toolName), ["browser_navigate", "browser_snapshot"]);

  const fake2 = fakeTransport();
  const out2 = await runWebConnector("t", { ...BASE, steps: [
    { action: "navigate", url: "https://dev.to/new" },
    { action: "tabs", tabAction: "list" },
  ] }, { transport: fake2 });
  assert.equal(out2.status, "OK");
  assert.equal(fake2.seqCalls, 1);
  assert.deepEqual(fake2.lastItems.map((i) => i.toolName), ["browser_navigate", "browser_tabs"]);
  assert.deepEqual(fake2.lastItems[1].args, { action: "list" });

  const fake3 = fakeTransport();
  const out3 = await runWebConnector("t", { ...BASE, steps: [
    { action: "navigate", url: "https://dev.to/new" },
    { action: "snapshot" },
    { action: "find", text: "Publish" },
  ] }, { transport: fake3 });
  assert.equal(out3.status, "OK");
  assert.equal(fake3.seqCalls, 1);
  assert.deepEqual(fake3.lastItems.map((i) => i.toolName), ["browser_navigate", "browser_snapshot", "browser_find"]);
  const results = out3.results as Array<Record<string, unknown>>;
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.step), [0, 1, 2]);
});

test("T4: error at step N prevents N+1 (stop-on-first-error)", async () => {
  const fake = fakeTransport({ sequenceResults: [
    { index: 0, toolName: "browser_navigate", ok: true, result: { content: [] } },
    { index: 1, toolName: "browser_snapshot", ok: false, error: { code: "EXECUTE_FAILED", message: "boom" } },
    { index: 2, toolName: "browser_find", ok: true, result: { content: [] } },
  ] });
  const out = await runWebConnector("t", { ...BASE, steps: [
    { action: "navigate", url: "https://dev.to/new" },
    { action: "snapshot" },
    { action: "find", text: "x" },
  ] }, { transport: fake });
  assert.equal(out.status, "STEP_FAILED");
  assert.equal(out.failedStep, 1);
  assert.equal(out.stepsExecuted, 1, "step N+1 never ran");
  const results = out.results as Array<Record<string, unknown>>;
  assert.equal(results.length, 1);
});

test("T5+T6: forbidden tool and arbitrary server remain blocked (schema closed)", async () => {
  const fake = fakeTransport();
  const denied = await runWebConnector("t", { ...BASE, steps: [{ action: "browser_run_code_unsafe" } as never] }, { transport: fake });
  assert.equal(denied.status, "INPUT_INVALID");
  assert.equal(fake.seqCalls, 0, "nothing reached the gateway");
  const evalDenied = await runWebConnector("t", { ...BASE, steps: [{ action: "browser_evaluate" } as never] }, { transport: fake });
  assert.equal(evalDenied.status, "INPUT_INVALID");
  const evilServer = await runWebConnector("t", { ...BASE, server: "evil" as never, steps: [{ action: "navigate", url: "https://x" }] }, { transport: fake });
  assert.equal(evilServer.status, "INPUT_INVALID");
  assert.equal(fake.seqCalls, 0);
});

test("T7: single action keeps working through the sequence path", async () => {
  const fake = fakeTransport();
  const out = await runWebConnector("t", { ...BASE, steps: [{ action: "navigate", url: "https://dev.to/new" }] }, { transport: fake });
  assert.equal(out.status, "OK");
  assert.equal(fake.seqCalls, 1);
  assert.equal((out.stepsExecuted as number), 1);
});

test("T8: staging cleanup happens on success", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stage-ok-"));
  try {
    const fake = fakeTransport();
    // 1x1 transparent PNG, well under 2 MiB
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const out = await runWebConnector("t", { ...BASE, steps: [{ action: "upload", files: [{ name: "a.png", mimeType: "image/png", base64: png }] }] }, { transport: fake, stagingRoot: dir });
    assert.equal(out.status, "OK");
    assert.deepEqual(fake.lastItems[0].args, { paths: fake.lastItems[0].args.paths });
    const remaining = await readdir(dir);
    assert.equal(remaining.length, 0, "staging empty after success");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("T9: staging cleanup happens on intermediate failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stage-fail-"));
  try {
    const fake = fakeTransport({ sequenceResults: [
      { index: 0, toolName: "browser_navigate", ok: true, result: { content: [] } },
      { index: 1, toolName: "browser_file_upload", ok: false, error: { code: "EXECUTE_FAILED", message: "chooser failed" } },
    ] });
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const out = await runWebConnector("t", { ...BASE, steps: [
      { action: "navigate", url: "https://dev.to/new" },
      { action: "upload", files: [{ name: "b.png", mimeType: "image/png", base64: png }] },
    ] }, { transport: fake, stagingRoot: dir });
    assert.equal(out.status, "STEP_FAILED");
    assert.equal(out.failedStep, 1);
    const remaining = await readdir(dir);
    assert.equal(remaining.length, 0, "staging empty after failure");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("T10: session scope = the invocation (one call; gateway closes after it)", async () => {
  const fake = fakeTransport();
  await runWebConnector("t", { ...BASE, steps: [
    { action: "navigate", url: "https://dev.to/new" },
    { action: "snapshot" },
    { action: "tabs", tabAction: "list" },
  ] }, { transport: fake });
  assert.equal(fake.seqCalls, 1, "exactly one downstream session for the whole invocation");
  assert.equal(fake.closed, true, "transport marked closed after the sequence call (gateway finally)");
});
