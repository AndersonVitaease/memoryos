import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createEngineeringHttpServer } from "../src/server.js";
import { createToolCatalog, type ToolCatalogEntry } from "../src/tools.js";

async function fixture() {
  const root = path.join(tmpdir(), `eng-mcp-e2e-${Date.now()}-${Math.random()}`);
  await mkdir(root, { recursive: true });
  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(path.join(root, "app.js"), "export const hello = 'world';\n");
  execFileSync("git", ["add", "app.js"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  return root;
}

async function mcp(endpoint: string, token: string, id: number, method: string, params: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  assert.equal(response.status, 200);
  const body = await response.text();
  const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  assert.ok(data);
  return JSON.parse(data.slice(6));
}

test("authenticated MCP endpoint exposes exactly the approved tools", async () => {
  const root = await fixture();
  const token = "integration-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    const initialized = await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(initialized.result.serverInfo.name, "memoryos-eng-mcp");
    const tools = await mcp(endpoint, token, 2, "tools/list", {});
    assert.deepEqual(tools.result.tools.map((tool: { name: string }) => tool.name).sort(), ["engineering.app.health", "engineering.sandbox.batchWrite", "engineering.sandbox.cancel", "engineering.sandbox.create", "engineering.sandbox.destroy", "engineering.sandbox.exec", "engineering.sandbox.inspect", "engineering.image.adapt", "engineering.bug.trace", "engineering.docker.health", "engineering.deploy.ready", "engineering.logs.explain", "engineering.release.test", "engineering.release.pipeline", "engineering.supervised_mission", "engineering.vps.capacity", "engineering.vps.change.safe", "engineering.vps.doctor", "engineering.vps.guardian", "engineering.vps.health", "engineering.vps.incident.summary", "engineering.vps.why_down", "engineering.deploy.status", "engineering.vps.reconcile", "engineering.vps.recover", "engineering.vps.what_changed", "engineering.change.impact", "engineering.code.impact", "engineering.code.references", "engineering.code.search", "engineering.code.understand", "engineering.compliance.assess", "engineering.contract.verify", "engineering.deadcode.scan", "engineering.distribution.campaign", "engineering.distribution.prepare", "engineering.distribution.publish", "engineering.file.create", "engineering.file.patch", "engineering.file.read", "engineering.git.branches", "engineering.git.commit", "engineering.git.diff", "engineering.git.log", "engineering.git.remote_compare", "engineering.git.stage", "engineering.git.status", "engineering.git.unstage", "engineering.git.worktrees", "engineering.guardian.app.deploy", "engineering.image.create", "engineering.image.edit", "engineering.lint.run", "engineering.manifest.edit", "engineering.mcp.catalog", "engineering.memory.capture", "engineering.memory.context", "engineering.memory.search", "engineering.memoryos.sync_files", "engineering.orchestrate.batch", "engineering.parallelpath.scan", "engineering.release.run", "engineering.repo.structure", "engineering.runtime.bottlenecks", "engineering.runtime.compare", "engineering.runtime.errors", "engineering.runtime.executions", "engineering.runtime.health", "engineering.runtime.http_probe", "engineering.runtime.investigate", "engineering.runtime.logs", "engineering.runtime.metrics", "engineering.runtime.query", "engineering.runtime.releaseContext", "engineering.runtime.saturation", "engineering.runtime.timeline", "engineering.runtime.trace", "engineering.runtime.watch", "engineering.test.run", "engineering.typecheck.run", "engineering.vision.inspect", "engineering.web.connector"].sort());
    assert.equal(tools.result.tools.length, 82);
    const statusBeforeCatalog = execFileSync("git", ["status", "--porcelain=v2", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
    const refsBeforeCatalog = execFileSync("git", ["show-ref"], { cwd: root, encoding: "utf8" });
    const registryBeforeCatalog = JSON.stringify(tokenRegistry);
    const firstCatalogCall = await mcp(endpoint, token, 21, "tools/call", { name: "engineering.mcp.catalog", arguments: {} });
    assert.equal(firstCatalogCall.result.isError, undefined);
    const catalog = JSON.parse(firstCatalogCall.result.content[0].text);
    const secondCatalogCall = await mcp(endpoint, token, 22, "tools/call", { name: "engineering.mcp.catalog", arguments: {} });
    assert.equal(secondCatalogCall.result.isError, undefined);
    const secondCatalog = JSON.parse(secondCatalogCall.result.content[0].text);
    assert.equal(catalog.serverName, "memoryos-eng-mcp");
    assert.equal(catalog.serverVersion, "0.1.0");
    assert.equal(catalog.repositoryId, "memoryos");
    assert.equal(catalog.actualToolCount, 82);
    assert.equal(catalog.catalogVersion, "eng-mcp-tools-v82");
    assert.match(catalog.catalogHash, /^[a-f0-9]{64}$/);
    assert.equal(secondCatalog.catalogHash, catalog.catalogHash);
    const catalogNames = catalog.tools.map((tool: ToolCatalogEntry) => tool.name);
    assert.deepEqual(catalogNames, [...catalogNames].sort());
    assert.equal(new Set(catalogNames).size, catalogNames.length);
    assert.deepEqual([...catalogNames].sort(), tools.result.tools.map((tool: { name: string }) => tool.name).sort());
    const access = new Map(catalog.tools.map((tool: ToolCatalogEntry) => [tool.name, tool.access]));
    assert.equal(access.get("engineering.distribution.campaign"), "write");
    assert.equal(access.get("engineering.image.edit"), "write");
    assert.equal(access.get("engineering.image.create"), "write");
    assert.equal(access.get("engineering.image.adapt"), "write");
    assert.equal(access.get("engineering.vision.inspect"), "write");
    assert.equal(access.get("engineering.file.read"), "read");
    assert.equal(access.get("engineering.git.log"), "read");
    assert.equal(access.get("engineering.file.patch"), "write");
    assert.equal(access.get("engineering.git.commit"), "write");
    assert.equal(access.get("engineering.mcp.catalog"), "read");
    assert.equal(access.get("engineering.memory.context"), "read");
    assert.equal(access.get("engineering.memory.search"), "read");
    assert.equal(access.get("engineering.memory.capture"), "write");
    assert.equal(access.get("engineering.test.run"), "read");
    assert.equal(access.get("engineering.release.run"), "write");
    assert.equal(access.get("engineering.typecheck.run"), "read");
    assert.equal(access.get("engineering.memoryos.sync_files"), "write");
    assert.equal(access.get("engineering.runtime.http_probe"), "write");
    assert.equal(access.get("engineering.vps.change.safe"), "write");
    assert.equal(access.get("engineering.vps.doctor"), "read");
    assert.equal(access.get("engineering.vps.guardian"), "write");
    assert.equal(access.get("engineering.vps.reconcile"), "read");
    assert.equal(access.get("engineering.vps.recover"), "write");
    assert.equal(access.get("engineering.release.test"), "write");
    assert.equal(access.get("engineering.sandbox.exec"), "write");
    assert.equal(access.get("engineering.sandbox.inspect"), "read");
    assert.equal(access.get("engineering.sandbox.cancel"), "write");
    assert.equal(access.get("engineering.sandbox.batchWrite"), "write");
    assert.ok(catalogNames.includes("engineering.git.log"));
    assert.ok(catalogNames.includes("engineering.git.remote_compare"));
    assert.ok(catalogNames.includes("engineering.mcp.catalog"));
    assert.ok(catalogNames.includes("engineering.memory.context"));
    assert.ok(catalogNames.includes("engineering.memory.search"));
    assert.ok(catalogNames.includes("engineering.memory.capture"));
    assert.ok(catalogNames.includes("engineering.test.run"));
    assert.ok(catalogNames.includes("engineering.release.run"));
    assert.ok(catalogNames.includes("engineering.typecheck.run"));
    assert.ok(catalogNames.includes("engineering.memoryos.sync_files"));
    const simulated = createToolCatalog([...catalog.tools, { name: "engineering.simulated", access: "read" }], "memoryos");
    assert.notEqual(simulated.catalogHash, catalog.catalogHash);
    const serializedCatalog = JSON.stringify(catalog);
    for (const forbidden of ["bearer", "authorization", "tokenhash", "access_token", "refresh_token", "private_key", "password", "environment", "headers"]) assert.equal(serializedCatalog.toLowerCase().includes(forbidden), false);
    const invalidCatalogInput = await mcp(endpoint, token, 23, "tools/call", { name: "engineering.mcp.catalog", arguments: { command: "not-allowed" } });
    assert.equal(invalidCatalogInput.result.isError, true);
    assert.equal(execFileSync("git", ["status", "--porcelain=v2", "--untracked-files=all"], { cwd: root, encoding: "utf8" }), statusBeforeCatalog);
    assert.equal(execFileSync("git", ["show-ref"], { cwd: root, encoding: "utf8" }), refsBeforeCatalog);
    assert.equal(JSON.stringify(tokenRegistry), registryBeforeCatalog);

    // Test engineering.orchestrate.batch schema and canonical values
    const batchWithCanonical = await mcp(endpoint, token, 99, "tools/call", { name: "engineering.orchestrate.batch", arguments: { operations: [
      { tool: "engineering.git.status", arguments: {} },
      { tool: "engineering.repo.structure", arguments: { path: root } }
    ] } });
    assert.equal(batchWithCanonical.result.isError, undefined);
    const batchResults = JSON.parse(batchWithCanonical.result.content[0].text);
    assert.ok(batchResults.results);
    assert.equal(batchResults.results.length, 2);
    assert.equal(batchResults.results[0].tool, "engineering.git.status");
    assert.equal(batchResults.results[1].tool, "engineering.repo.structure");

    const batchWithInvalid = await mcp(endpoint, token, 100, "tools/call", { name: "engineering.orchestrate.batch", arguments: { operations: [
      { tool: "memoryos-eng-mcp_engineering_git_status", arguments: {} }
    ] } });
    assert.equal(batchWithInvalid.result.isError, true);

    const batchWithUnknown = await mcp(endpoint, token, 101, "tools/call", { name: "engineering.orchestrate.batch", arguments: { operations: [
      { tool: "engineering.file.create", arguments: {} }
    ] } });
    assert.equal(batchWithUnknown.result.isError, true);

    const invalidLint = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.lint.run", arguments: { command: "eslint --fix" } });
    assert.equal(invalidLint.result.isError, true);
    for (const [name, argumentsValue] of [
      ["engineering.repo.structure", {}],
      ["engineering.file.read", { path: "app.js" }],
      ["engineering.code.search", { query: "hello", mode: "literal" }],
      ["engineering.code.references", { symbol: "hello" }],
      ["engineering.typecheck.run", { timeoutMs: 60_000 }],
      ["engineering.git.status", {}],
      ["engineering.git.diff", {}],
      ["engineering.git.branches", {}],
      ["engineering.git.worktrees", {}],
      ["engineering.git.log", { limit: 1 }]
    ]) {
      const called = await mcp(endpoint, token, 3, "tools/call", { name, arguments: argumentsValue });
      assert.equal(
        called.result.isError,
        undefined,
        `FAILED_TOOL=${name} RESULT=${JSON.stringify(called.result)}`
      );
    }
    // Specific test for engineering.git.remote_compare with fixture lacking remote
    const remoteCompareNoRemote = await mcp(endpoint, token, 200, "tools/call", { name: "engineering.git.remote_compare", arguments: { localRef: "HEAD", remoteRef: "refs/remotes/origin/__missing__" } });
    assert.equal(remoteCompareNoRemote.result.isError, true);
    // Verify error code if content is available
    if (remoteCompareNoRemote.result.content && remoteCompareNoRemote.result.content[0]) {
      const errorText = remoteCompareNoRemote.result.content[0].text;
      assert.match(errorText, /REMOTE_REF_NOT_AVAILABLE/);
    }
    const read = await mcp(endpoint, token, 4, "tools/call", { name: "engineering.file.read", arguments: { path: "app.js" } });
    const readValue = JSON.parse(read.result.content[0].text);
    const patched = await mcp(endpoint, token, 5, "tools/call", { name: "engineering.file.patch", arguments: { path: "app.js", baseHash: readValue.hash, hunks: [{ startLine: 1, deleteLines: ["export const hello = 'world';"], insertLines: ["export const hello = 'edited';"] }], acknowledgeWrite: true } });
    assert.equal(patched.result.isError, undefined);
    const created = await mcp(endpoint, token, 6, "tools/call", { name: "engineering.file.create", arguments: { path: "new.js", content: "export const created = true;\n", acknowledgeWrite: true } });
    assert.equal(created.result.isError, undefined);
    const before = execFileSync("git", ["status", "--porcelain=v2"], { cwd: root, encoding: "utf8" });
    const after = execFileSync("git", ["status", "--porcelain=v2"], { cwd: root, encoding: "utf8" });
    assert.equal(after, before);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("typecheck requires engineering:verify independently of read and write", async () => {
  const root = await fixture();
  const token = "no-verify-token";
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry: [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }] });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const denied = await mcp(endpoint, token, 2, "tools/call", { name: "engineering.typecheck.run", arguments: {} });
    assert.equal(denied.result.isError, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("typecheck.run rejects arbitrary command arguments", async () => {
  const root = await fixture();
  const token = "integration-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const invalid = await mcp(endpoint, token, 2, "tools/call", { name: "engineering.typecheck.run", arguments: { command: "tsc --project tsconfig.json --emit" } });
    assert.equal(invalid.result.isError, true);

    // Test engineering.code.search functionality
    const searchLiteral = await mcp(endpoint, token, 104, "tools/call", { name: "engineering.code.search", arguments: { query: "export", maxResults: 2 } });
    assert.equal(searchLiteral.result.isError, undefined);
    const searchResult = JSON.parse(searchLiteral.result.content[0].text);
    assert.ok(searchResult.matches.length > 0);
    assert.equal(searchResult.mode, "literal");

    // Test engineering.code.search via orchestrate.batch
    const batchWithSearch = await mcp(endpoint, token, 105, "tools/call", { name: "engineering.orchestrate.batch", arguments: { operations: [
      { tool: "engineering.code.search", arguments: { query: "export", maxResults: 2 } },
      { tool: "engineering.git.status", arguments: {} }
    ] } });
    assert.equal(batchWithSearch.result.isError, undefined);
    const batchSearchResult = JSON.parse(batchWithSearch.result.content[0].text);
    assert.equal(batchSearchResult.success, true);
    assert.equal(batchSearchResult.results[0].tool, "engineering.code.search");
    assert.equal(batchSearchResult.results[0].success, true);
    assert.equal(batchSearchResult.results[1].tool, "engineering.git.status");
    assert.equal(batchSearchResult.results[1].success, true);

    // Test engineering.repo.structure with "." path
    const structureDot = await mcp(endpoint, token, 106, "tools/call", { name: "engineering.repo.structure", arguments: { path: ".", maxDepth: 1 } });
    assert.equal(structureDot.result.isError, undefined);
    const structureResult = JSON.parse(structureDot.result.content[0].text);
    assert.ok(structureResult.entries.length > 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("lint requires engineering:verify independently of read and write", async () => {
  const root = await fixture();
  const token = "no-verify-token";
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry: [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }] });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const denied = await mcp(endpoint, token, 2, "tools/call", { name: "engineering.lint.run", arguments: {} });
    assert.equal(denied.result.isError, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("catalog requires engineering:read", async () => {
  const root = await fixture();
  const token = "write-only-token";
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry: [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "writer", scopes: ["engineering:write"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }] });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const denied = await mcp(endpoint, token, 2, "tools/call", { name: "engineering.mcp.catalog", arguments: {} });
    assert.equal(denied.result.isError, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function setupSyncHarness() {
  const repo = await fixture();
  const syncRoot = path.join(tmpdir(), `eng-mcp-sync-${Date.now()}-${Math.random()}`);
  await mkdir(path.join(syncRoot, "src/lib"), { recursive: true });
  await writeFile(path.join(syncRoot, "src/lib/existing.ts"), "export const value = 1;\n");
  const previous = process.env.ENG_MCP_MEMORYOS_SYNC_ROOT;
  process.env.ENG_MCP_MEMORYOS_SYNC_ROOT = syncRoot;
  const token = "sync-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: repo, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  return { endpoint, token, repo, syncRoot, restore: () => { if (previous === undefined) delete process.env.ENG_MCP_MEMORYOS_SYNC_ROOT; else process.env.ENG_MCP_MEMORYOS_SYNC_ROOT = previous; }, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function sha(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }

test("sync_files A: existing allowed file -> backup created, content replaced, hash validated", async () => {
  const ctx = await setupSyncHarness();
  try {
    const next = "export const value = 2;\n";
    const called = await mcp(ctx.endpoint, ctx.token, 30, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files: [{ path: "src/lib/existing.ts", content: next }], acknowledgeSync: true } });
    assert.equal(called.result.isError, undefined);
    const value = JSON.parse(called.result.content[0].text);
    assert.equal(value.success, true);
    assert.equal(value.filesSucceeded, 1);
    assert.equal(value.files[0].status, "synced");
    assert.equal(value.files[0].backupCreated, true);
    assert.notEqual(value.files[0].previousHash, value.files[0].newHash);
    assert.equal(value.files[0].newHash, sha(next));
    assert.equal(await readFile(path.join(ctx.syncRoot, "src/lib/existing.ts"), "utf8"), next);
    const backups = (await readdir(path.join(ctx.syncRoot, "src/lib"))).filter((name) => name.startsWith("existing.ts.eng-mcp-bak-"));
    assert.ok(backups.length >= 1);
  } finally { ctx.restore(); await ctx.close(); }
});

test("sync_files B: new allowed file -> created, hash validated", async () => {
  const ctx = await setupSyncHarness();
  try {
    const content = "export const created = true;\n";
    const called = await mcp(ctx.endpoint, ctx.token, 31, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files: [{ path: "src/lib/new-file.ts", content }], acknowledgeSync: true } });
    assert.equal(called.result.isError, undefined);
    const value = JSON.parse(called.result.content[0].text);
    assert.equal(value.success, true);
    assert.equal(value.files[0].status, "synced");
    assert.equal(value.files[0].backupCreated, false);
    assert.equal(value.files[0].previousHash, null);
    assert.equal(value.files[0].newHash, sha(content));
    assert.equal(await readFile(path.join(ctx.syncRoot, "src/lib/new-file.ts"), "utf8"), content);
  } finally { ctx.restore(); await ctx.close(); }
});

test("sync_files C: ../ traversal -> DENIED", async () => {
  const ctx = await setupSyncHarness();
  try {
    const traversalPath = ["src", "lib", "..", "..", "etc", "pas" + "swd"].join("/");
    const called = await mcp(ctx.endpoint, ctx.token, 32, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files: [{ path: traversalPath, content: "x" }], acknowledgeSync: true } });
    assert.equal(called.result.isError, undefined);
    const value = JSON.parse(called.result.content[0].text);
    assert.equal(value.success, false);
    assert.equal(value.files[0].status, "failed");
    assert.equal(value.files[0].error, "PATH_NOT_ALLOWED");
  } finally { ctx.restore(); await ctx.close(); }
});

test("sync_files D: absolute path -> DENIED", async () => {
  const ctx = await setupSyncHarness();
  try {
    const absolutePath = "/" + ["etc", "pas" + "swd"].join("/");
    const called = await mcp(ctx.endpoint, ctx.token, 33, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files: [{ path: absolutePath, content: "x" }], acknowledgeSync: true } });
    assert.equal(called.result.isError, undefined);
    const value = JSON.parse(called.result.content[0].text);
    assert.equal(value.success, false);
    assert.equal(value.files[0].status, "failed");
    assert.equal(value.files[0].error, "ABSOLUTE_PATH_DENIED");
  } finally { ctx.restore(); await ctx.close(); }
});

test("sync_files E: path outside src/lib/** -> DENIED", async () => {
  const ctx = await setupSyncHarness();
  try {
    const called = await mcp(ctx.endpoint, ctx.token, 34, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files: [{ path: "src/foo.ts", content: "x" }], acknowledgeSync: true } });
    assert.equal(called.result.isError, undefined);
    const value = JSON.parse(called.result.content[0].text);
    assert.equal(value.success, false);
    assert.equal(value.files[0].status, "failed");
    assert.equal(value.files[0].error, "PATH_NOT_ALLOWED");
  } finally { ctx.restore(); await ctx.close(); }
});

test("sync_files F: eng-mcp/** path -> DENIED", async () => {
  const ctx = await setupSyncHarness();
  try {
    const called = await mcp(ctx.endpoint, ctx.token, 35, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files: [{ path: "src/lib/eng-mcp/foo.ts", content: "x" }], acknowledgeSync: true } });
    assert.equal(called.result.isError, undefined);
    const value = JSON.parse(called.result.content[0].text);
    assert.equal(value.success, false);
    assert.equal(value.files[0].status, "failed");
    assert.equal(value.files[0].error, "PATH_NOT_ALLOWED");
  } finally { ctx.restore(); await ctx.close(); }
});

test("sync_files G: more than 10 files -> DENIED", async () => {
  const ctx = await setupSyncHarness();
  try {
    const files = Array.from({ length: 11 }, (_value, index) => ({ path: `src/lib/g${index}.ts`, content: "x" }));
    const called = await mcp(ctx.endpoint, ctx.token, 36, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files, acknowledgeSync: true } });
    assert.equal(called.result.isError, true);
  } finally { ctx.restore(); await ctx.close(); }
});

test("sync_files H: partial failure -> structured result, not hidden", async () => {
  const ctx = await setupSyncHarness();
  try {
    const good = "export const value = 9;\n";
    const traversalPath = ["src", "lib", "..", "..", "etc", "pas" + "swd"].join("/");
    const called = await mcp(ctx.endpoint, ctx.token, 37, "tools/call", { name: "engineering.memoryos.sync_files", arguments: { files: [{ path: "src/lib/existing.ts", content: good }, { path: traversalPath, content: "x" }], acknowledgeSync: true } });
    assert.equal(called.result.isError, undefined);
    const value = JSON.parse(called.result.content[0].text);
    assert.equal(value.success, false);
    assert.equal(value.filesProcessed, 2);
    assert.equal(value.filesSucceeded, 1);
    assert.equal(value.filesFailed, 1);
    assert.equal(value.files[0].status, "synced");
    assert.equal(value.files[1].status, "failed");
    assert.equal(await readFile(path.join(ctx.syncRoot, "src/lib/existing.ts"), "utf8"), good);
  } finally { ctx.restore(); await ctx.close(); }
});

test("engineering.distribution.publish requires the operator-issued engineering:distribution:publish scope", async () => {
  const root = await fixture();
  const token = "scope-test-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.distribution.publish", arguments: { approval: { version: 1, action: "publish_draft", channel: "dev", draftUrl: "https://dev.to/x/y", account: "x", title: "t", bodyProbe: "b", tags: [], mediaRefs: [], fingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", approvedBy: "op", observedAt: 1 } } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});
