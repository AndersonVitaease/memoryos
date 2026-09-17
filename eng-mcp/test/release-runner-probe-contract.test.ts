// REGRESSION (ITEM-2 live certification, 2026-09-17): every live container probe
// answered 400 INPUT_INVALID although both sides passed their isolated unit tests.
// Root cause: callReleaseRunner serialized the probe params as a NESTED {params}
// body key while the runner's HTTP layer only accepts FLAT bounded primitives
// (allowedKeys operation/image/probe/path/maxBytes). This file exercises the REAL
// seam end-to-end: the real callReleaseRunner transport (src/tools.ts) against the
// real createReleaseRunner HTTP layer (scripts/eng-mcp-release-runner.mjs) on a
// private unix socket with the operation layer injected — the exact serialization
// contract is asserted, so a one-sided test double can never mask it again.
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createReleaseRunner } from "../scripts/eng-mcp-release-runner.mjs";
import { callReleaseRunner } from "../src/tools.ts";

type RecordedJob = { operation: string; params?: Record<string, unknown> };

async function withRunner(socketCallback: (socketPath: string, seen: RecordedJob[]) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-probe-contract-"));
  const socketPath = path.join(dir, "runner.sock");
  const seen: RecordedJob[] = [];
  const runner = createReleaseRunner({
    socketPath,
    jobsDir: path.join(dir, "jobs"),
    lockPath: path.join(dir, "runner.lock"),
    pipeline: path.join(dir, "unused.mjs"),
    execute: async (job: RecordedJob) => {
      seen.push({ operation: job.operation, ...(job.params !== undefined ? { params: job.params } : {}) });
      return { success: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "", truncated: false, timedOut: false };
    }
  });
  await new Promise<void>((resolve) => runner.server.listen(socketPath, resolve));
  try {
    await socketCallback(socketPath, seen);
  } finally {
    await new Promise<void>((resolve) => runner.server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}

test("REGRESSION: the real callReleaseRunner body satisfies the real runner HTTP contract for container_probe (flat primitives reach the operation layer)", async () => {
  await withRunner(async (socketPath, seen) => {
    const previous = process.env.ENG_MCP_RELEASE_SOCKET;
    process.env.ENG_MCP_RELEASE_SOCKET = socketPath;
    try {
      // read_text WITH maxBytes: exercises the conditional flat threading end-to-end
      const withMax = await callReleaseRunner("container_probe", undefined, { image: "eng-mcp-candidate:contract-test", probe: "read_text", path: "/app/package.json", maxBytes: 512 });
      assert.equal(withMax.httpStatus, 200);
      assert.equal(withMax.body.success, true);
      assert.deepEqual(seen[0], { operation: "container_probe", params: { image: "eng-mcp-candidate:contract-test", probe: "read_text", path: "/app/package.json", maxBytes: 512 } });
      // file_stat WITHOUT maxBytes: the conditional spread must stay absent
      const withoutMax = await callReleaseRunner("container_probe", undefined, { image: "eng-mcp-candidate:contract-test", probe: "file_stat", path: "/app" });
      assert.equal(withoutMax.httpStatus, 200);
      assert.deepEqual(seen[1], { operation: "container_probe", params: { image: "eng-mcp-candidate:contract-test", probe: "file_stat", path: "/app" } });
      // a no-params operation must serialize exactly as before the flatten
      const status = await callReleaseRunner("status");
      assert.equal(status.httpStatus, 200);
      assert.equal(status.body.success, true);
      assert.deepEqual(seen[2], { operation: "status" });
      assert.equal(seen.length, 3);
    } finally {
      if (previous === undefined) delete process.env.ENG_MCP_RELEASE_SOCKET; else process.env.ENG_MCP_RELEASE_SOCKET = previous;
    }
  });
});

test("GUARD: the pre-fix nested {params} body shape is refused 400 INPUT_INVALID by the real runner HTTP layer and never reaches the operation layer", async () => {
  await withRunner(async (socketPath, seen) => {
    const answer = await new Promise<{ httpStatus: number; body: any }>((resolve, reject) => {
      const req = httpRequest({ socketPath, path: "/v1/release", method: "POST", headers: { "content-type": "application/json" } }, (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          try { resolve({ httpStatus: incoming.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
          catch (error) { reject(error); }
        });
      });
      req.on("error", reject);
      req.end(JSON.stringify({ operation: "container_probe", params: { image: "eng-mcp-candidate:contract-test", probe: "file_stat", path: "/app" } }));
    });
    assert.equal(answer.httpStatus, 400);
    assert.equal(answer.body.error, "INPUT_INVALID");
    assert.equal(seen.length, 0);
  });
});
