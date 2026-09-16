import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  runWebConnector,
  validateUploadFile,
  PLAYWRIGHT_ALLOWED_TOOLS,
  PLAYWRIGHT_DENIED_TOOLS,
  PLAYWRIGHT_SERVERS,
  UPLOAD_VIEW_ROOT,
  MAX_FILES_PER_UPLOAD,
  type WebConnectorTransport,
} from "../src/webConnector.ts";

type RecordedCall = { tool: string; args: Record<string, unknown> };

function fakeTransport(failOn?: string) {
  const calls: RecordedCall[] = [];
  const transport: WebConnectorTransport = {
    name: "fake",
    async call(tool: string, args: Record<string, unknown>) {
      calls.push({ tool, args });
      if (failOn !== undefined && tool === failOn) {
        return { ok: false, status: 403, error: `TOOL_NOT_ALLOWLISTED:${tool}`, durationMs: 1 };
      }
      return { ok: true, status: 200, result: { content: [{ type: "text", text: "ok" }] }, durationMs: 1 };
    },
    async callSequence(items: { toolName: string; args: Record<string, unknown> }[]) {
      // Fake gateway: runs the sequence through the same per-tool logic so the
      // existing per-call assertions (calls[], failOn) keep their meaning.
      const results: Array<Record<string, unknown>> = [];
      for (const [index, item] of items.entries()) {
        const single = await transport.call(item.toolName, item.args);
        if (!single.ok) {
          results.push({ index, toolName: item.toolName, ok: false, error: { code: "EXECUTE_FAILED", message: single.error ?? "UPSTREAM_ERROR" } });
          break; // stop-on-first-error mirrors the gateway contract
        }
        results.push({ index, toolName: item.toolName, ok: true, result: single.result ?? null });
      }
      return {
        ok: results.every((r) => r.ok),
        status: 200,
        durationMs: 1,
        results,
        stepsRequested: items.length,
        stepsExecuted: results.filter((r) => r.ok).length,
      };
    },
  };
  return { calls, transport };
}

async function withTempStaging(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "wc-staging-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const VALID_PNG = { name: "guardian-dev-distribution-test.png", mimeType: "image/png", base64: Buffer.from("hello guardian").toString("base64") };

test("T1 allowed snapshot step executes via mapped browser_snapshot", async () => {
  const { calls, transport } = fakeTransport();
  const result: any = await runWebConnector("test", { steps: [{ action: "snapshot" }] }, { transport });
  assert.equal(result.status, "OK");
  assert.equal(result.stepsExecuted, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool, "browser_snapshot");
  assert.deepEqual(calls[0].args, {});
  assert.equal(result.results[0].tool, "browser_snapshot");
});

test("T2 browser_run_code_unsafe is impossible (absent from allowlist; caller toolName rejected)", async () => {
  const { calls, transport } = fakeTransport();
  assert.equal((PLAYWRIGHT_ALLOWED_TOOLS as readonly string[]).includes("browser_run_code_unsafe"), false);
  const result: any = await runWebConnector("test", { steps: [{ action: "snapshot" }], toolName: "browser_run_code_unsafe" } as any, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(result.error, "INPUT_SCHEMA_REJECTED");
  assert.equal(calls.length, 0);
  const asAction: any = await runWebConnector("test", { steps: [{ action: "browser_run_code_unsafe", code: "async (page) => {}" }] }, { transport });
  assert.equal(asAction.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T3 browser_evaluate is impossible (absent from allowlist; no such action)", async () => {
  const { calls, transport } = fakeTransport();
  assert.equal((PLAYWRIGHT_ALLOWED_TOOLS as readonly string[]).includes("browser_evaluate"), false);
  assert.equal((PLAYWRIGHT_DENIED_TOOLS as readonly string[]).includes("browser_evaluate"), true);
  const result: any = await runWebConnector("test", { steps: [{ action: "browser_evaluate", function: "() => 1" }] } as any, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T4 arbitrary toolName/serverId/server_url/raw args are rejected by the strict schema", async () => {
  const { calls, transport } = fakeTransport();
  const variants: unknown[] = [
    { serverId: "6a8dc3a3beadf81a8ed535cc", steps: [{ action: "snapshot" }] },
    { server_url: "https://evil.example/mcp", steps: [{ action: "snapshot" }] },
    { steps: [{ action: "snapshot", toolName: "browser_run_code_unsafe" }] },
    { steps: [{ action: "snapshot", arguments: { evil: true } }] },
  ];
  for (const variant of variants) {
    const result: any = await runWebConnector("test", variant, { transport });
    assert.equal(result.status, "INPUT_INVALID");
  }
  assert.equal(calls.length, 0);
});

test("T5 Dokploy governance untouched: only pinned playwright server ids exist here", () => {
  const dokployId = "6a8dc3a3beadf81a8ed535cc";
  const ids = Object.values(PLAYWRIGHT_SERVERS).map((server) => server.serverId);
  assert.deepEqual(ids.sort(), ["6a765c1bb57aee8a937ab86c", "6a78ee796cdb3d67b4acdf2d"]);
  assert.equal(ids.includes(dokployId), false);
  assert.equal((PLAYWRIGHT_SERVERS as Record<string, unknown>)["dokploy"], undefined);
});

test("T6 upload path outside staging root impossible: only generated staging paths are sent; drop paths rejected", async () => {
  await withTempStaging(async (root) => {
    const { calls, transport } = fakeTransport();
    const result: any = await runWebConnector("test", { steps: [{ action: "upload", files: [VALID_PNG] }] }, { transport, stagingRoot: root });
    assert.equal(result.status, "OK");
    assert.equal(calls[0].tool, "browser_file_upload");
    const sentPaths = (calls[0].args as { paths: string[] }).paths;
    assert.equal(sentPaths.length, 1);
    assert.ok(sentPaths[0].startsWith(UPLOAD_VIEW_ROOT + path.sep)); // SAME host bind viewed at the MCP allowed root
    assert.ok(/^[0-9a-f]{32}_guardian-dev-distribution-test\.png$/.test(path.basename(sentPaths[0])));
    const dropAttempt: any = await runWebConnector("test", { steps: [{ action: "drop", target: "#x", paths: ["/etc/passwd"] }] } as any, { transport, stagingRoot: root });
    assert.equal(dropAttempt.status, "INPUT_INVALID");
    const fileUploadAttempt: any = await runWebConnector("test", { steps: [{ action: "upload", files: [VALID_PNG], paths: ["/etc/passwd"] }] } as any, { transport, stagingRoot: root });
    assert.equal(fileUploadAttempt.status, "INPUT_INVALID");
  });
});

test("T7 traversal filename denied", async () => {
  const bad = ["../../etc/passwd.png", "sub/dir.png", "..\\windows.png", "..", "a..b.png"];
  for (const name of bad) {
    const verdict = validateUploadFile({ name, mimeType: "image/png", base64: VALID_PNG.base64 });
    assert.equal(verdict.ok, false, name);
    if (!verdict.ok) assert.equal(verdict.reason, "FILENAME_TRAVERSAL_DENIED");
  }
  const { calls, transport } = fakeTransport();
  const result: any = await runWebConnector("test", { steps: [{ action: "upload", files: [{ ...VALID_PNG, name: "../../etc/passwd.png" }] }] }, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T8 decoded file >2 MiB denied", () => {
  const oversized = "A".repeat(2_800_000); // decodes to ~2.1 MB > 2 MiB
  const verdict = validateUploadFile({ name: "big.png", mimeType: "image/png", base64: oversized });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.reason, "FILE_TOO_LARGE");
  const border = "A".repeat(Math.ceil(((2 * 1024 * 1024) / 3) * 4)); // ~2 MiB minus padding -> allowed by size check
  const okVerdict = validateUploadFile({ name: "border.png", mimeType: "image/png", base64: border.slice(0, border.length - (border.length % 4)) });
  assert.equal(okVerdict.ok, true);
});

test("T9 more than 4 files per upload denied", async () => {
  const { calls, transport } = fakeTransport();
  const files = Array.from({ length: MAX_FILES_PER_UPLOAD + 1 }, () => ({ ...VALID_PNG }));
  const result: any = await runWebConnector("test", { steps: [{ action: "upload", files }] }, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T10 more than 10 steps denied", async () => {
  const { calls, transport } = fakeTransport();
  const steps = Array.from({ length: 11 }, () => ({ action: "snapshot" }));
  const result: any = await runWebConnector("test", { steps }, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T11 unknown action denied", async () => {
  const { calls, transport } = fakeTransport();
  const result: any = await runWebConnector("test", { steps: [{ action: "explode" }] } as any, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T12 staged file deleted after successful execution", async () => {
  await withTempStaging(async (root) => {
    const { transport } = fakeTransport();
    const result: any = await runWebConnector("test", { steps: [{ action: "upload", files: [VALID_PNG] }] }, { transport, stagingRoot: root });
    assert.equal(result.status, "OK");
    assert.ok(result.evidence.some((entry: string) => entry.includes("cleaned 1 staged file")));
    const remaining = await readdir(root);
    assert.deepEqual(remaining, []);
  });
});

test("T13 staged file deleted after failed execution (upload step fails upstream)", async () => {
  await withTempStaging(async (root) => {
    const { transport } = fakeTransport("browser_file_upload");
    const result: any = await runWebConnector("test", { steps: [{ action: "upload", files: [VALID_PNG] }] }, { transport, stagingRoot: root });
    assert.equal(result.status, "STEP_FAILED");
    assert.equal(result.toolName, "browser_file_upload");
    const remaining = await readdir(root);
    assert.deepEqual(remaining, []);
  });
});

test("stop-on-first-error preserves prior results and skips later steps", async () => {
  const { calls, transport } = fakeTransport("browser_click");
  const result: any = await runWebConnector(
    "test",
    { steps: [{ action: "navigate", url: "https://example.com" }, { action: "click", target: "e1" }, { action: "snapshot" }] },
    { transport },
  );
  assert.equal(result.status, "STEP_FAILED");
  assert.equal(result.failedStep, 1);
  assert.equal(result.results.length, 1);
  assert.equal(calls.length, 2);
});

test("default injection: browser_file_upload args carry catalog-required defaults", async () => {
  const { calls, transport } = fakeTransport();
  await runWebConnector("test", { steps: [{ action: "console_messages" }, { action: "network_requests" }, { action: "screenshot" }] }, { transport });
  assert.deepEqual(calls[0].args, { level: "info" });
  assert.deepEqual(calls[1].args, { static: false });
  assert.deepEqual(calls[2].args, { scale: "css" });
});

test("orphan sweep removes only expired staging-pattern files; nothing exposed", async () => {
  await withTempStaging(async (root) => {
    const orphan = path.join(root, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_old.png");
    const foreign = path.join(root, "keep-me.txt");
    await Promise.all([writeFile(orphan, "x"), writeFile(foreign, "x")]);
    const old = new Date(Date.now() - 11 * 60_000);
    await utimes(orphan, old, old);
    const { transport } = fakeTransport();
    const result: any = await runWebConnector("test", { steps: [{ action: "upload", files: [VALID_PNG] }] }, { transport, stagingRoot: root });
    assert.equal(result.status, "OK");
    const remaining = await readdir(root);
    assert.deepEqual(remaining.sort(), ["keep-me.txt"]);
    assert.equal(JSON.stringify(result.results).includes(root), false, "staging paths are never echoed to the caller");
  });
});
