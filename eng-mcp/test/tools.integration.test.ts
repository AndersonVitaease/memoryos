import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
    assert.deepEqual(tools.result.tools.map((tool: { name: string }) => tool.name), ["engineering.repo.structure", "engineering.file.read", "engineering.code.search", "engineering.code.references", "engineering.deadcode.scan", "engineering.parallelpath.scan", "engineering.contract.verify", "engineering.change.impact", "engineering.git.status", "engineering.git.diff", "engineering.git.branches", "engineering.git.worktrees", "engineering.git.log", "engineering.git.remote_compare", "engineering.file.patch", "engineering.file.create", "engineering.test.run", "engineering.release.run", "engineering.lint.run", "engineering.git.stage", "engineering.git.unstage", "engineering.git.commit", "engineering.mcp.catalog", "engineering.typecheck.run"]);
    assert.equal(tools.result.tools.length, 24);
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
    assert.equal(catalog.actualToolCount, 39);
    assert.equal(catalog.catalogVersion, "eng-mcp-tools-v39");
    assert.match(catalog.catalogHash, /^[a-f0-9]{64}$/);
    assert.equal(secondCatalog.catalogHash, catalog.catalogHash);
    const catalogNames = catalog.tools.map((tool: ToolCatalogEntry) => tool.name);
    assert.deepEqual(catalogNames, [...catalogNames].sort());
    assert.equal(new Set(catalogNames).size, catalogNames.length);
    assert.deepEqual([...catalogNames].sort(), tools.result.tools.map((tool: { name: string }) => tool.name).sort());
    const access = new Map(catalog.tools.map((tool: ToolCatalogEntry) => [tool.name, tool.access]));
    assert.equal(access.get("engineering.file.read"), "read");
    assert.equal(access.get("engineering.git.log"), "read");
    assert.equal(access.get("engineering.file.patch"), "write");
    assert.equal(access.get("engineering.git.commit"), "write");
    assert.equal(access.get("engineering.mcp.catalog"), "read");
    assert.equal(access.get("engineering.test.run"), "read");
    assert.equal(access.get("engineering.release.run"), "write");
    assert.equal(access.get("engineering.typecheck.run"), "read");
    assert.ok(catalogNames.includes("engineering.git.log"));
    assert.ok(catalogNames.includes("engineering.git.remote_compare"));
    assert.ok(catalogNames.includes("engineering.mcp.catalog"));
    assert.ok(catalogNames.includes("engineering.test.run"));
    assert.ok(catalogNames.includes("engineering.release.run"));
    assert.ok(catalogNames.includes("engineering.typecheck.run"));
    const simulated = createToolCatalog([...catalog.tools, { name: "engineering.simulated", access: "read" }], "memoryos");
    assert.notEqual(simulated.catalogHash, catalog.catalogHash);
    const serializedCatalog = JSON.stringify(catalog);
    for (const forbidden of ["bearer", "authorization", "tokenhash", "access_token", "refresh_token", "private_key", "password", "environment", "headers"]) assert.equal(serializedCatalog.toLowerCase().includes(forbidden), false);
    const invalidCatalogInput = await mcp(endpoint, token, 23, "tools/call", { name: "engineering.mcp.catalog", arguments: { command: "not-allowed" } });
    assert.equal(invalidCatalogInput.result.isError, true);
    assert.equal(execFileSync("git", ["status", "--porcelain=v2", "--untracked-files=all"], { cwd: root, encoding: "utf8" }), statusBeforeCatalog);
    assert.equal(execFileSync("git", ["show-ref"], { cwd: root, encoding: "utf8" }), refsBeforeCatalog);
    assert.equal(JSON.stringify(tokenRegistry), registryBeforeCatalog);
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
      ["engineering.git.log", { limit: 1 }],
      ["engineering.git.remote_compare", { localRef: "HEAD", remoteRef: "HEAD" }]
    ]) {
      const called = await mcp(endpoint, token, 3, "tools/call", { name, arguments: argumentsValue });
      assert.equal(called.result.isError, undefined);
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
