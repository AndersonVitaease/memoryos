import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { createEngineeringHttpServer } from "../src/server.ts";

async function fixture() {
  const root = path.join(tmpdir(), `eng-mcp-batch-test-${Date.now()}-${Math.random()}`);
  await mkdir(root, { recursive: true });
  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(path.join(root, "test-file.ts"), "export const test = 'value';\n");
  execFileSync("git", ["add", "test-file.ts"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  return root;
}

async function mcp(endpoint: string, token: string, id: number, method: string, params: unknown) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params } })
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  assert.ok(data);
  return JSON.parse(data.slice(6));
}

// Integration tests for engineering.orchestrate.batch
test("engineering.orchestrate.batch with light operations", async () => {
  const root = await fixture();
  const token = "batch-test-token";
  const tokenRegistry = [{
    tokenHash: createHash("sha256").update(token).digest("hex"),
    subject: "tester",
    scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"],
    allowedRepositoryIds: ["memoryos"],
    expiresAt: "2099-01-01T00:00:00.000Z"
  }];
  
  const server = await createEngineeringHttpServer({
    repositoryId: "memoryos",
    configuredRoot: root,
    tokenRegistry
  });
  
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  
  try {
    await mcp(endpoint, token, 1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    });
    
    // Test H: Batch search
    const batchResult = await mcp(endpoint, token, 2, "tools/call", {
      name: "engineering.orchestrate.batch",
      arguments: {
        operations: [
          { tool: "engineering.repo.structure", arguments: { maxDepth: 1 } },
          { tool: "engineering.file.read", arguments: { path: "test-file.ts" } },
          { tool: "engineering.code.search", arguments: { query: "test", mode: "literal" } },
          { tool: "engineering.code.references", arguments: { symbol: "test" } },
          { tool: "engineering.git.status", arguments: {} }
        ]
      }
    });
    
    assert.equal(batchResult.result.isError, undefined);
    const result = JSON.parse(batchResult.result.content[0].text);
    assert.equal(result.success, true);
    assert.equal(result.results.length, 5);
    
    // Verify all operations succeeded
    for (const opResult of result.results) {
      assert.equal(opResult.success, true);
    }
    
    // Verify order preserved
    const toolOrder = result.results.map((r: any) => r.tool);
    assert.deepEqual(toolOrder, [
      "engineering.repo.structure",
      "engineering.file.read",
      "engineering.code.search",
      "engineering.code.references",
      "engineering.git.status"
    ]);
    
  } finally {
    await new Promise<void>((resolve, reject) => 
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

// Test L: Write tool rejected
test("engineering.orchestrate.batch rejects write operations", async () => {
  const root = await fixture();
  const token = "batch-test-token";
  const tokenRegistry = [{
    tokenHash: createHash("sha256").update(token).digest("hex"),
    subject: "tester",
    scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"],
    allowedRepositoryIds: ["memoryos"],
    expiresAt: "2099-01-01T00:00:00.000Z"
  }];
  
  const server = await createEngineeringHttpServer({
    repositoryId: "memoryos",
    configuredRoot: root,
    tokenRegistry
  });
  
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  
  try {
    await mcp(endpoint, token, 1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    });
    
    const batchResult = await mcp(endpoint, token, 2, "tools/call", {
      name: "engineering.orchestrate.batch",
      arguments: {
        operations: [
          { tool: "engineering.repo.structure", arguments: {} },
          { tool: "engineering.file.patch", arguments: { 
            path: "test-file.ts",
            baseHash: "invalid",
            hunks: [{ startLine: 1, deleteLines: ["export const test = 'value';"], insertLines: ["export const test = 'modified';"] }],
            acknowledgeWrite: true 
          } }
        ]
      }
    });
    
    // Should fail because file.patch is not in ALLOWED_TOOLS
    assert.equal(batchResult.result.isError, true);
    
  } finally {
    await new Promise<void>((resolve, reject) => 
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

// Test M: Unknown tool rejected
test("engineering.orchestrate.batch rejects unknown tools", async () => {
  const root = await fixture();
  const token = "batch-test-token";
  const tokenRegistry = [{
    tokenHash: createHash("sha256").update(token).digest("hex"),
    subject: "tester",
    scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"],
    allowedRepositoryIds: ["memoryos"],
    expiresAt: "2099-01-01T00:00:00.000Z"
  }];
  
  const server = await createEngineeringHttpServer({
    repositoryId: "memoryos",
    configuredRoot: root,
    tokenRegistry
  });
  
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  
  try {
    await mcp(endpoint, token, 1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    });
    
    const batchResult = await mcp(endpoint, token, 2, "tools/call", {
      name: "engineering.orchestrate.batch",
      arguments: {
        operations: [
          { tool: "engineering.repo.structure", arguments: {} },
          { tool: "engineering.fake.tool", arguments: {} }
        ]
      }
    });
    
    // Should fail because fake.tool is not in ALLOWED_TOOLS
    assert.equal(batchResult.result.isError, true);
    
  } finally {
    await new Promise<void>((resolve, reject) => 
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

// Test N: Max operations
test("engineering.orchestrate.batch respects operation limits", async () => {
  const root = await fixture();
  const token = "batch-test-token";
  const tokenRegistry = [{
    tokenHash: createHash("sha256").update(token).digest("hex"),
    subject: "tester",
    scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release"],
    allowedRepositoryIds: ["memoryos"],
    expiresAt: "2099-01-01T00:00:00.000Z"
  }];
  
  const server = await createEngineeringHttpServer({
    repositoryId: "memoryos",
    configuredRoot: root,
    tokenRegistry
  });
  
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  
  try {
    await mcp(endpoint, token, 1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    });
    
    // 10 operations: should succeed
    const batch10 = await mcp(endpoint, token, 2, "tools/call", {
      name: "engineering.orchestrate.batch",
      arguments: {
        operations: Array(10).fill(0).map((_, i) => ({
          tool: "engineering.repo.structure",
          arguments: { maxDepth: 1 }
        }))
      }
    });
    
    assert.equal(batch10.result.isError, undefined);
    
    // 11 operations: should be rejected by schema validation
    const batch11 = await mcp(endpoint, token, 3, "tools/call", {
      name: "engineering.orchestrate.batch",
      arguments: {
        operations: Array(11).fill(0).map((_, i) => ({
          tool: "engineering.repo.structure",
          arguments: { maxDepth: 1 }
        }))
      }
    });
    
    // Schema validation should reject 11 operations
    assert.equal(batch11.result.isError, true);
    
  } finally {
    await new Promise<void>((resolve, reject) => 
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});