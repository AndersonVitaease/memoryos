import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
    assert.deepEqual(tools.result.tools.map((tool: { name: string }) => tool.name).sort(), ["engineering.app.health", "engineering.sandbox.batchWrite", "engineering.sandbox.cancel", "engineering.sandbox.create", "engineering.sandbox.destroy", "engineering.sandbox.exec", "engineering.sandbox.inspect", "engineering.image.adapt", "engineering.bug.trace", "engineering.docker.health", "engineering.deploy.ready", "engineering.logs.explain", "engineering.release.test", "engineering.release.pipeline", "engineering.supervised_mission", "engineering.vps.capacity", "engineering.vps.change.safe", "engineering.vps.container.probe", "engineering.vps.diagnostics", "engineering.vps.doctor", "engineering.vps.guardian", "engineering.vps.health", "engineering.vps.incident.summary", "engineering.vps.why_down", "engineering.deploy.status", "engineering.vps.reconcile", "engineering.vps.recover", "engineering.vps.runner.restart", "engineering.vps.secret.write", "engineering.vps.systemd.credential", "engineering.vps.what_changed", "engineering.change.impact", "engineering.code.impact", "engineering.code.references", "engineering.code.search", "engineering.code.understand", "engineering.compliance.assess", "engineering.contract.verify", "engineering.deadcode.scan", "engineering.distribution.campaign", "engineering.distribution.prepare", "engineering.distribution.publish", "engineering.file.create", "engineering.file.patch", "engineering.file.read", "engineering.git.branches", "engineering.git.commit", "engineering.git.diff", "engineering.git.inspect_changes", "engineering.git.inspect_commit", "engineering.git.log", "engineering.git.push", "engineering.git.remote_compare", "engineering.git.stage", "engineering.git.status", "engineering.git.unstage", "engineering.git.worktrees", "engineering.github.read", "engineering.guardian.app.deploy", "engineering.image.create", "engineering.image.edit", "engineering.lint.run", "engineering.manifest.edit", "engineering.mcp.catalog", "engineering.memory.capture", "engineering.memory.context", "engineering.memory.search", "engineering.memoryos.sync_files", "engineering.notify.hermes", "engineering.orchestrate.batch", "engineering.parallelpath.scan", "engineering.release.run", "engineering.repo.structure", "engineering.runtime.bottlenecks", "engineering.runtime.compare", "engineering.runtime.errors", "engineering.runtime.executions", "engineering.runtime.health", "engineering.runtime.http_probe", "engineering.runtime.investigate", "engineering.runtime.logs", "engineering.runtime.metrics", "engineering.runtime.query", "engineering.runtime.releaseContext", "engineering.runtime.saturation", "engineering.runtime.timeline", "engineering.runtime.trace", "engineering.runtime.watch", "engineering.test.run", "engineering.test.status", "engineering.typecheck.run", "engineering.vision.inspect", "engineering.web.connector"].sort());
    assert.equal(tools.result.tools.length, 93);
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
    assert.equal(catalog.actualToolCount, 93);
    assert.equal(catalog.catalogVersion, "eng-mcp-tools-v93");
    assert.match(catalog.catalogHash, /^[a-f0-9]{64}$/);
    assert.equal(secondCatalog.catalogHash, catalog.catalogHash);
    const catalogNames = catalog.tools.map((tool: ToolCatalogEntry) => tool.name);
    assert.deepEqual(catalogNames, [...catalogNames].sort());
    assert.equal(new Set(catalogNames).size, catalogNames.length);
    assert.deepEqual([...catalogNames].sort(), tools.result.tools.map((tool: { name: string }) => tool.name).sort());
    const access = new Map(catalog.tools.map((tool: ToolCatalogEntry) => [tool.name, tool.access]));
    assert.equal(access.get("engineering.distribution.campaign"), "write");
    assert.equal(access.get("engineering.image.edit"), "write");
    assert.equal(access.get("engineering.git.inspect_commit"), "read");
    assert.equal(access.get("engineering.git.inspect_changes"), "read");
    assert.equal(access.get("engineering.image.create"), "write");
    assert.equal(access.get("engineering.image.adapt"), "write");
    assert.equal(access.get("engineering.vision.inspect"), "write");
    assert.equal(access.get("engineering.file.read"), "read");
    assert.equal(access.get("engineering.git.log"), "read");
    assert.equal(access.get("engineering.file.patch"), "write");
    assert.equal(access.get("engineering.git.commit"), "write");
    assert.equal(access.get("engineering.git.push"), "write");
    assert.equal(access.get("engineering.mcp.catalog"), "read");
    assert.equal(access.get("engineering.notify.hermes"), "write");
    assert.equal(access.get("engineering.memory.context"), "read");
    assert.equal(access.get("engineering.memory.search"), "read");
    assert.equal(access.get("engineering.memory.capture"), "write");
    assert.equal(access.get("engineering.test.run"), "read");
    assert.equal(access.get("engineering.test.status"), "read");
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

    const batchWithInspect = await mcp(endpoint, token, 102, "tools/call", { name: "engineering.orchestrate.batch", arguments: { operations: [
      { tool: "engineering.git.inspect_changes", arguments: {} },
      { tool: "engineering.git.inspect_commit", arguments: { ref: "HEAD", mode: "meta" } }
    ] } });
    assert.equal(batchWithInspect.result.isError, undefined);
    const inspectResults = JSON.parse(batchWithInspect.result.content[0].text);
    assert.equal(inspectResults.results.length, 2);
    assert.equal(inspectResults.results[0].success, true);
    assert.equal(inspectResults.results[1].success, true);

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

test("engineering.test.run suite profile starts a persisted job without waiting (skips where the release runner socket exists)", async () => {
  const socketPath = process.env.ENG_MCP_RELEASE_SOCKET ?? "/opt/eng-mcp-release-data/run/release-runner.sock";
  if (existsSync(socketPath)) return; // honest skip: a test must never touch the real release runner
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
    const started = await mcp(endpoint, token, 2, "tools/call", { name: "engineering.test.run", arguments: { mode: "suite" } });
    assert.equal(started.result.isError, undefined);
    const job = JSON.parse(started.result.content[0].text);
    assert.equal(job.status, "RUNNING");
    assert.equal(job.executor, "release-runner");
    assert.match(job.executionId, /^suite-[a-z0-9]+-[a-f0-9]{8}$/);
    const deadline = Date.now() + 15_000;
    let terminal: Record<string, unknown> | null = null;
    while (Date.now() < deadline) {
      const status = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.test.status", arguments: { executionId: job.executionId } });
      assert.equal(status.result.isError, undefined);
      const view = JSON.parse(status.result.content[0].text);
      if (view.status === "INFRA_ERROR" || view.status === "PASS" || view.status === "FAIL") { terminal = view; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(terminal, "suite job must reach a terminal state without the release runner");
    assert.equal(terminal.status, "INFRA_ERROR");
    assert.ok(Array.isArray(terminal.infraFailures) && terminal.infraFailures.length >= 1);
    assert.equal(terminal.failed, null); // INFRA never increments failed counters
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

// ITEM-0 SCOPE GAP — engineering.vps.change.safe (and the guardian approved-mutation
// path) now require the operator-issued engineering:vps:application:redeploy scope,
// mirroring the engineering:distribution:publish enforcement pattern above. Read-only
// guardian classification must stay reachable WITHOUT the mutation scope (no side-door,
// no usability regression). All four probes are offline: the scope refusal fires at the
// tool boundary before any transport exists; the positive control runs plan-only and
// fails closed at transport validation, never on scope.
test("engineering.vps.change.safe requires the operator-issued engineering:vps:application:redeploy scope", async () => {
  const root = await fixture();
  const token = "vps-change-scope-refusal-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.change.safe", arguments: { action: "redeploy_application", target: { applicationId: "app-test" }, execute: true, approval: { approved: true } } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.change.safe accepts a token holding engineering:vps:application:redeploy (plan-only; fails closed downstream, never on scope)", async () => {
  const root = await fixture();
  const token = "vps-change-scope-granted-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:vps:application:redeploy"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.change.safe", arguments: { action: "redeploy_application", target: { applicationId: "app-test" } } });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `scope gate must open for the granted scope, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.guardian requires engineering:vps:application:redeploy only for approved mutation requests", async () => {
  const root = await fixture();
  const token = "vps-guardian-mutation-scope-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.guardian", arguments: { execute: true, approval: { approved: true } } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal for approved mutation, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.guardian read-only classification stays reachable without the mutation scope", async () => {
  const root = await fixture();
  const token = "vps-guardian-readonly-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.guardian", arguments: {} });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `read-only guardian must not demand the mutation scope, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

// ITEM-1: stub of the official release runner unix socket (same pattern as the
// release-test integration scaffold): canned answers per operation, private
// socket path inside a tempdir, ENG_MCP_RELEASE_SOCKET swapped for the call and
// restored on close.
async function stubReleaseRunner(responder: (operation: string) => { httpStatus: number; body: unknown }) {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-runner-restart-"));
  const socketPath = path.join(dir, "runner.sock");
  const stub = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      let operation = "";
      try { operation = String((JSON.parse(Buffer.concat(chunks).toString("utf8")) as { operation?: string }).operation ?? ""); } catch { operation = ""; }
      const result = responder(operation);
      response.writeHead(result.httpStatus, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    });
  });
  await new Promise<void>((resolve, reject) => { stub.once("error", reject); stub.listen(socketPath, resolve); });
  const previousSocket = process.env.ENG_MCP_RELEASE_SOCKET;
  process.env.ENG_MCP_RELEASE_SOCKET = socketPath;
  return {
    close: async () => {
      process.env.ENG_MCP_RELEASE_SOCKET = previousSocket;
      await new Promise<void>((resolve) => stub.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  };
}

const RUNNER_RESTART_META = { pid: 111, uptime: 12, startedAt: "2026-09-16T00:00:00.000Z", draining: false, lastRestartId: null, lastRestartOutcome: null, lastRecoveryMarked: 0, unit: { restart: "on-failure", successExitStatus: ["42"], restartForceExitStatus: ["42"] } };

test("engineering.vps.runner.restart requires the operator-issued engineering:vps:runner:restart scope", async () => {
  const root = await fixture();
  const token = "vps-runner-restart-refusal-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.runner.restart", arguments: { execute: true, approval: { approved: true } } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.runner.restart plan-only is reachable with the granted scope and never mutates", async () => {
  const root = await fixture();
  const token = "vps-runner-restart-plan-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:vps:runner:restart"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const stub = await stubReleaseRunner((operation) => operation === "status" ? { httpStatus: 200, body: { operation: "status", success: true, runnerMeta: RUNNER_RESTART_META } } : { httpStatus: 400, body: { error: "UNEXPECTED_CALL" } });
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.runner.restart", arguments: {} });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `plan-only must not demand the mutation scope, got ${text.slice(0, 300)}`);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.status, "PLAN");
    assert.equal(payload.mutationPerformed, false);
    assert.equal(payload.precheck.runnerReachable, true);
    assert.equal(payload.plan.possible, true);
  } finally {
    await stub.close();
    server.close();
  }
});

test("engineering.vps.runner.restart mutation with the granted scope stays fail-closed when the runner itself refuses (jobs in flight)", async () => {
  const root = await fixture();
  const token = "vps-runner-restart-mutation-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:vps:runner:restart"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const stub = await stubReleaseRunner((operation) => {
    if (operation === "status") return { httpStatus: 200, body: { operation: "status", success: true, runnerMeta: RUNNER_RESTART_META } };
    if (operation === "restart") return { httpStatus: 409, body: { operation: "restart", accepted: false, refused: true, blockers: ["JOBS_IN_FLIGHT:job-1:deploy"], error: "RUNNER_RESTART_REFUSED:JOBS_IN_FLIGHT:job-1:deploy" } };
    return { httpStatus: 400, body: { error: "UNEXPECTED_CALL" } };
  });
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.runner.restart", arguments: { execute: true, approval: { approved: true } } });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `scope gate must open for the granted scope, got ${text.slice(0, 300)}`);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.status, "NOT_RESTARTED");
    assert.equal(payload.mutationPerformed, false);
    assert.ok(text.includes("JOBS_IN_FLIGHT:job-1:deploy"), `runner blockers must surface, got ${text.slice(0, 400)}`);
  } finally {
    await stub.close();
    server.close();
  }
});

test("engineering.vps.secret.write requires the operator-issued engineering:vps:secret:write scope", async () => {
  const root = await fixture();
  const token = "vps-secret-write-refusal-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.secret.write", arguments: { path: "/data/credentials/release-bearer", source: { kind: "staging", path: "/data/.staging-secret-x" }, acknowledgeWrite: true, execute: true, approval: { approved: true } } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.secret.write with the granted scope stays read-only in PLAN mode and refuses outside the allowlist", async () => {
  const root = await fixture();
  const token = "vps-secret-write-plan-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:vps:secret:write"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    // a path outside the credential allowlist: PLAN answers read-only with possible=false
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.secret.write", arguments: { path: "/etc/forbidden", source: { kind: "env", name: "ABSENT_VAR" }, acknowledgeWrite: true } });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `scope gate must open for the granted scope, got ${text.slice(0, 300)}`);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.status, "PLAN");
    assert.equal(payload.mutationPerformed, false);
    assert.equal(payload.plan.possible, false);
    assert.ok(payload.findings.some((finding: { code: string }) => finding.code === "SECRET_TARGET_NOT_ALLOWED"));
  } finally {
    server.close();
  }
});

test("engineering.vps.systemd.credential requires the operator-issued engineering:vps:systemd:credential scope", async () => {
  const root = await fixture();
  const token = "vps-systemd-credential-refusal-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    // Schema-VALID arguments: zod validates BEFORE the scope gate, so a refusal here
    // must come from the authorization layer, not the schema.
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.systemd.credential", arguments: { unit: "some.service", credentialId: "some-cred" } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.systemd.credential with the granted scope opens the gate and degrades honestly when the runner socket is unreachable", async () => {
  const root = await fixture();
  const token = "vps-systemd-credential-plan-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:vps:systemd:credential"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  // Hermetic: point the transport at an absent socket so the PLAN degrades to
  // UNAVAILABLE without touching the production runner or /etc/systemd.
  const previous = process.env.ENG_MCP_RELEASE_SOCKET;
  process.env.ENG_MCP_RELEASE_SOCKET = path.join(root, "absent-runner.sock");
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.systemd.credential", arguments: { unit: "some.service", credentialId: "some-cred" } });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `scope gate must open for the granted scope, got ${text.slice(0, 300)}`);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.status, "UNAVAILABLE");
    assert.equal(payload.mutationPerformed, false);
    assert.ok(payload.findings.some((finding: { code: string }) => finding.code === "UC_TRANSPORT_FAILED"));
    assert.equal(payload.security.credentialValueReturned, false);
    assert.equal(payload.security.noServiceRestart, true);
  } finally {
    if (previous === undefined) delete process.env.ENG_MCP_RELEASE_SOCKET; else process.env.ENG_MCP_RELEASE_SOCKET = previous;
    server.close();
  }
});

test("engineering.vps.diagnostics requires the operator-issued engineering:vps:diagnostics:read scope", async () => {
  const root = await fixture();
  const token = "vps-diagnostics-refusal-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.diagnostics", arguments: {} });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.container.probe requires the operator-issued engineering:vps:container:probe scope", async () => {
  const root = await fixture();
  const token = "vps-container-probe-refusal-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    // Schema-VALID arguments: zod validates BEFORE the scope gate, so a refusal here
    // must come from the authorization layer, not the schema.
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.container.probe", arguments: { image: "eng-mcp-candidate:candidate-x", probe: "file_stat", path: "/app/package.json" } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.vps.container.probe file_stat OK: forwards bounded params to the runner and reports the security block", async () => {
  const root = await fixture();
  const token = "vps-container-probe-ok-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:vps:container:probe"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const stub = await stubReleaseRunner((operation) => {
    if (operation === "container_probe") {
      // REAL socket contract: the release child's probe result travels as stdout TEXT.
      const probeResult = { probe: "file_stat", image: "eng-mcp-candidate:candidate-x", path: "/app/package.json", imageId: "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", repoDigests: "", containerName: "mcp-probe-00000000", exitCode: 0, exists: true, timedOut: false, truncated: false, cleanupVerified: true, binaryRefused: false, redacted: true, stdout: "-rw-r--r-- 1 root root 1024 /app/package.json", stderr: "", durationMs: 120, probesLog: { retained: 1, path: "probes.jsonl" } };
      return { httpStatus: 200, body: { operation: "container_probe", success: true, exitCode: 0, durationMs: 130, truncated: false, timedOut: false, stdout: JSON.stringify(probeResult), stderr: "" } };
    }
    return { httpStatus: 400, body: { error: "UNEXPECTED_CALL" } };
  });
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.container.probe", arguments: { image: "eng-mcp-candidate:candidate-x", probe: "file_stat", path: "/app/package.json" } });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `scope gate must open for the granted scope, got ${text.slice(0, 300)}`);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.status, "OK");
    assert.equal(payload.mutationPerformed, false);
    assert.equal(payload.probe, "file_stat");
    assert.equal(payload.exists, true);
    assert.equal(payload.exitCode, 0);
    assert.deepEqual(payload.findings, []);
    assert.equal(payload.security.secretsRedacted, true);
    assert.equal(payload.security.environmentValuesReturned, false);
    assert.equal(payload.security.readOnly, true);
    assert.equal(payload.security.freeCommandImpossible, true);
  } finally {
    await stub.close();
    server.close();
  }
});

// FASE 2: engineering.github.read — three offline probes at the HTTP boundary:
// (1) the operator-issued engineering:github:read scope gates the tool (args are
// schema-valid, so ONLY the scope can refuse); (2) without the outbound PAT the
// tool fails closed with GITHUB_CREDENTIAL_MISSING (scope granted, credential
// absent — order proven: scope first, credential second); (3) happy path with a
// stubbed globalThis.fetch: URL/auth correct, payload mapped, quota block
// present, PAT never echoed.
test("engineering.github.read requires the operator-issued engineering:github:read scope", async () => {
  const root = await fixture();
  const token = "github-read-scope-refusal-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.github.read", arguments: { operation: "get_rate_limit" } });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally {
    server.close();
  }
});

test("engineering.github.read fails closed with GITHUB_CREDENTIAL_MISSING when no PAT is provisioned", async () => {
  const root = await fixture();
  const token = "github-read-credential-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:github:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const previousToken = process.env.GITHUB_TOKEN;
  const previousTokenFile = process.env.GITHUB_TOKEN_FILE;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN_FILE;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.github.read", arguments: { operation: "get_rate_limit" } });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `scope gate must open for the granted scope, got ${text.slice(0, 300)}`);
    assert.ok(text.includes("GITHUB_CREDENTIAL_MISSING"), `expected credential refusal, got ${text.slice(0, 300)}`);
  } finally {
    if (previousToken !== undefined) process.env.GITHUB_TOKEN = previousToken; else delete process.env.GITHUB_TOKEN;
    if (previousTokenFile !== undefined) process.env.GITHUB_TOKEN_FILE = previousTokenFile; else delete process.env.GITHUB_TOKEN_FILE;
    server.close();
  }
});

test("engineering.github.read get_repo happy path: live URL, Bearer auth, quota block, PAT never echoed", async () => {
  const root = await fixture();
  const token = "github-read-happy-token";
  const pat = "ghp_integration-stub-token-000000000000";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:github:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  const previousTokenFile = process.env.GITHUB_TOKEN_FILE;
  const upstreamCalls: string[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (!target.startsWith("https://api.github.com/")) return previousFetch(url as Parameters<typeof fetch>[0], init);
    upstreamCalls.push(target);
    return new Response(JSON.stringify({ full_name: "AndersonVitaease/memoryos", private: false, visibility: "public", default_branch: "main", pushed_at: "2026-09-17T15:47:46Z", html_url: "https://github.com/AndersonVitaease/memoryos" }), { status: 200, headers: { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3500) } });
  }) as typeof fetch;
  process.env.GITHUB_TOKEN = pat;
  delete process.env.GITHUB_TOKEN_FILE;
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.github.read", arguments: { operation: "get_repo" } });
    const text = JSON.stringify(call.result);
    assert.ok(!call.result.isError, `get_repo must not error, got: ${text.slice(0, 300)}`);
    assert.ok(text.includes("AndersonVitaease/memoryos"), `repo payload missing, got: ${text.slice(0, 400)}`);
    assert.ok(text.includes("4999"), `quota block missing, got: ${text.slice(0, 400)}`);
    assert.deepEqual(upstreamCalls, ["https://api.github.com/repos/AndersonVitaease/memoryos"]);
    assert.ok(!text.includes(pat), "the PAT must never appear in the MCP response");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken !== undefined) process.env.GITHUB_TOKEN = previousToken; else delete process.env.GITHUB_TOKEN;
    if (previousTokenFile !== undefined) process.env.GITHUB_TOKEN_FILE = previousTokenFile; else delete process.env.GITHUB_TOKEN_FILE;
    server.close();
  }
});

test("engineering.vps.diagnostics unit view: inspect+status projection with crossCheck and security block", async () => {
  const root = await fixture();
  const token = "vps-diagnostics-unit-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:vps:diagnostics:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const stub = await stubReleaseRunner((operation) => {
    if (operation === "inspect") return { httpStatus: 200, body: { operation: "inspect", success: true, service: { name: "eng-mcp-release-runner.service", activeState: "active", mainPid: 779490 }, process: { pid: 779490, command: "node scripts/eng-mcp-release-runner.mjs" }, runner: { socketPath: "/opt/eng-mcp-release-data/run/release-runner.sock" }, directives: { restart: "on-failure", successExitStatus: ["42"], restartForceExitStatus: ["42"], noNewPrivileges: "yes", protectSystem: "full" }, docker: [], recentLogs: [], partialFailures: [] } };
    if (operation === "status") return { httpStatus: 200, body: { operation: "status", success: true, runnerMeta: RUNNER_RESTART_META } };
    return { httpStatus: 400, body: { error: "UNEXPECTED_CALL" } };
  });
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.diagnostics", arguments: {} });
    const text = JSON.stringify(call.result);
    assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `scope gate must open for the granted scope, got ${text.slice(0, 300)}`);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.view, "unit");
    assert.equal(payload.status, "OK");
    assert.equal(payload.mutationPerformed, false);
    assert.equal(payload.directives.restart, "on-failure");
    assert.deepEqual(payload.directives.successExitStatus, ["42"]);
    assert.equal(payload.crossCheck.restartMatch, true);
    assert.equal(payload.crossCheck.successExitStatusMatch, true);
    assert.equal(payload.crossCheck.restartForceExitStatusMatch, true);
    assert.equal(payload.runnerMeta.unit.restart, "on-failure");
    assert.equal(payload.security.environmentValuesReturned, false);
    assert.equal(payload.security.secretsRedacted, true);
    assert.equal(payload.security.readOnly, true);
  } finally {
    await stub.close();
    server.close();
  }
});

test("engineering.vps.diagnostics: runner-token canary is redacted, journal and docker views surface their sections", async () => {
  const root = await fixture();
  const token = "vps-diagnostics-redaction-token";
  const tokenRegistry = [{ tokenHash: createHash("sha256").update(token).digest("hex"), subject: "tester", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:vps:diagnostics:read"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const CANARY = "canary-token-abcdef0123456789";
  const stub = await stubReleaseRunner((operation) => {
    if (operation === "inspect") return { httpStatus: 200, body: { operation: "inspect", success: true, service: { name: "eng-mcp-release-runner.service" }, process: null, runner: { token: CANARY, socketPath: "/runner.sock" }, directives: null, docker: [{ names: "memoryos-eng-mcp", image: "eng-mcp-candidate:candidate-x", status: "Up 2 hours", ports: "127.0.0.1:8787->8787/tcp" }], dockerInspection: "inventory", recentLogs: ["Sep 17 03:00:00 host runner[111]: deployment PASSED", "Sep 17 03:00:01 host runner[111]: smoke PASS"], partialFailures: [] } };
    return { httpStatus: 200, body: { operation: "status", success: true, runnerMeta: RUNNER_RESTART_META } };
  });
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const unitCall = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.vps.diagnostics", arguments: { view: "unit" } });
    const unitPayload = JSON.parse(unitCall.result.content[0].text);
    const unitText = JSON.stringify(unitCall.result);
    assert.equal(unitPayload.runner.token, "[REDACTED]");
    assert.ok(!unitText.includes(CANARY), `key-based redaction must scrub the runner token canary, got ${unitText.slice(0, 400)}`);
    const journalCall = await mcp(endpoint, token, 4, "tools/call", { name: "engineering.vps.diagnostics", arguments: { view: "journal" } });
    const journalPayload = JSON.parse(journalCall.result.content[0].text);
    assert.equal(journalPayload.view, "journal");
    assert.deepEqual(journalPayload.recentLogs, ["Sep 17 03:00:00 host runner[111]: deployment PASSED", "Sep 17 03:00:01 host runner[111]: smoke PASS"]);
    assert.equal(journalPayload.service, undefined);
    const dockerCall = await mcp(endpoint, token, 5, "tools/call", { name: "engineering.vps.diagnostics", arguments: { view: "docker" } });
    const dockerPayload = JSON.parse(dockerCall.result.content[0].text);
    assert.equal(dockerPayload.view, "docker");
    assert.equal(dockerPayload.dockerInspection, "inventory");
    assert.deepEqual(dockerPayload.docker, [{ names: "memoryos-eng-mcp", image: "eng-mcp-candidate:candidate-x", status: "Up 2 hours", ports: "127.0.0.1:8787->8787/tcp" }]);
  } finally {
    await stub.close();
    server.close();
  }
});
