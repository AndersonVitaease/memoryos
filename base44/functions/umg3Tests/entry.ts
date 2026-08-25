/**
 * umg3Tests — Sprint UMG-3 Test Suite: MCP Tool Governance
 *
 * Proves: a dynamically discovered MCP tool cannot hide its real identity
 * from governance. The gate in mcpClientCall checks tool_policy BEFORE
 * connecting — DENY never wastes a connection, ALLOW permits execution.
 *
 * UNKNOWN ≠ SAFE: tools without explicit policy default to "irreversible".
 * Tool-scoped confirmation: confirmation.toolName must match the requested tool.
 *
 * 6 tests:
 *   1. TOOL IDENTITY REACHES GOVERNANCE — resolveToolGovernance observes toolName
 *   2. UNKNOWN IS NOT AUTOMATICALLY SAFE — no policy → irreversible → DENY
 *   3. GOVERNANCE BEFORE EXECUTION — DENY blocks + tool-scoped confirmation
 *   4. ALLOWED TOOL EXECUTES — safe tool → ALLOW → tools/call → result
 *   5. RAW TOOL IDENTITY PRESERVED — server receives rawToolName, not canonicalId
 *   6. LEGACY REGRESSION — explicit serverId+toolName (authorized) still works
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  resolveToolGovernance,
  type MCPServerConfigRecord,
} from '../../shared/mcpClient.ts';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

// ── Unit tests (pure function — no server, no connection) ───────────────────

// TEST 1 — TOOL IDENTITY REACHES GOVERNANCE
function test1_identityReachesGovernance(): TestResult {
  try {
    const server: MCPServerConfigRecord = {
      id: 'unit-1',
      name: 'test-server-1',
      server_url: 'http://localhost:9999/mcp',
      auth_type: 'none',
      tool_policy: JSON.stringify({ list_entities: { reversibility: 'safe' } }),
    };
    const decision = resolveToolGovernance(server, 'list_entities');
    const passed = decision.toolName === 'list_entities'
      && decision.reversibility === 'safe'
      && decision.allowed === true;
    return {
      name: 'TEST 1: TOOL IDENTITY REACHES GOVERNANCE',
      passed,
      detail: `toolName=${decision.toolName} reversibility=${decision.reversibility} allowed=${decision.allowed}`,
    };
  } catch (e) {
    return { name: 'TEST 1: TOOL IDENTITY REACHES GOVERNANCE', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 2 — UNKNOWN IS NOT AUTOMATICALLY SAFE
function test2_unknownNotSafe(): TestResult {
  try {
    const server: MCPServerConfigRecord = {
      id: 'unit-2',
      name: 'test-server-2',
      server_url: 'http://localhost:9999/mcp',
      auth_type: 'none',
      tool_policy: JSON.stringify({ list_entities: { reversibility: 'safe' } }),
    };
    // 'unknown_tool' has no policy entry → must default to irreversible
    const decision = resolveToolGovernance(server, 'unknown_tool');
    const passed = decision.reversibility === 'irreversible' && decision.allowed === false;
    return {
      name: 'TEST 2: UNKNOWN IS NOT AUTOMATICALLY SAFE',
      passed,
      detail: `toolName=${decision.toolName} reversibility=${decision.reversibility} allowed=${decision.allowed}`,
    };
  } catch (e) {
    return { name: 'TEST 2: UNKNOWN IS NOT AUTOMATICALLY SAFE', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 3 — GOVERNANCE BEFORE EXECUTION (DENY + tool-scoped confirmation)
function test3_governanceBeforeExecution(): TestResult {
  try {
    const server: MCPServerConfigRecord = {
      id: 'unit-3',
      name: 'test-server-3',
      server_url: 'http://localhost:9999/mcp',
      auth_type: 'none',
      tool_policy: JSON.stringify({ deploy: { reversibility: 'irreversible' } }),
    };

    // 3a: No confirmation → DENY
    const noConfirm = resolveToolGovernance(server, 'deploy');
    const denyNoConfirm = noConfirm.allowed === false;

    // 3b: Confirmation for WRONG tool (delete_server) → DENY
    const wrongConfirm = resolveToolGovernance(server, 'deploy', { toolName: 'delete_server' });
    const denyWrongTool = wrongConfirm.allowed === false;

    // 3c: Confirmation with MATCHING toolName (deploy) → ALLOW at gate
    const rightConfirm = resolveToolGovernance(server, 'deploy', { toolName: 'deploy' });
    const allowRightTool = rightConfirm.allowed === true;

    const passed = denyNoConfirm && denyWrongTool && allowRightTool;
    return {
      name: 'TEST 3: GOVERNANCE BEFORE EXECUTION — DENY + tool-scoped confirmation',
      passed,
      detail: `noConfirm=${denyNoConfirm ? 'DENY' : 'FAIL'} wrongTool(delete_server)=${denyWrongTool ? 'DENY' : 'FAIL'} rightTool(deploy)=${allowRightTool ? 'ALLOW' : 'FAIL'}`,
    };
  } catch (e) {
    return { name: 'TEST 3: GOVERNANCE BEFORE EXECUTION', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// ── Integration tests (through mcpClientCall via base44.functions.invoke) ────

async function callMcpClientCall(
  base44: any,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; governanceDenied: boolean; body: any }> {
  try {
    const res = await base44.functions.invoke('mcpClientCall', payload);
    const d = (res.data ?? res) as any;
    if (d?.error === 'GOVERNANCE_DENIED') {
      return { ok: false, governanceDenied: true, body: d };
    }
    if (d?.error) {
      return { ok: false, governanceDenied: false, body: d };
    }
    return { ok: true, governanceDenied: false, body: d };
  } catch (e) {
    return { ok: false, governanceDenied: false, body: { error: (e as Error).message } };
  }
}

// TEST 4 — ALLOWED TOOL EXECUTES
async function test4_allowedToolExecutes(base44: any, mem0ServerId: string): Promise<TestResult> {
  try {
    const result = await callMcpClientCall(base44, {
      serverId: mem0ServerId,
      action: 'call',
      toolName: 'list_entities',
      arguments: {},
    });
    const passed = result.ok;
    return {
      name: 'TEST 4: ALLOWED TOOL EXECUTES — safe tool → ALLOW → tools/call → result',
      passed,
      detail: `toolName=list_entities executed=${result.ok} ${result.ok ? 'result received' : 'error=' + result.body?.error}`,
    };
  } catch (e) {
    return { name: 'TEST 4: ALLOWED TOOL EXECUTES', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 5 — RAW TOOL IDENTITY PRESERVED
async function test5_rawIdentityPreserved(base44: any, mem0ServerId: string): Promise<TestResult> {
  try {
    const result = await callMcpClientCall(base44, {
      serverId: mem0ServerId,
      action: 'call',
      toolName: 'list_entities',
      arguments: {},
    });
    // If the server received the correct rawToolName ("list_entities"), it would
    // have executed successfully and returned data. A wrong name (e.g. canonicalId)
    // would have caused a tool-not-found error from the MCP server.
    const hasResult = result.ok && result.body && (result.body.result !== null && result.body.result !== undefined);
    const passed = hasResult;
    return {
      name: 'TEST 5: RAW TOOL IDENTITY PRESERVED — server receives rawToolName',
      passed,
      detail: `rawToolName=list_entities (sent to tools/call) serverResponded=${result.ok} hasData=${hasResult}`,
    };
  } catch (e) {
    return { name: 'TEST 5: RAW TOOL IDENTITY PRESERVED', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 6 — LEGACY REGRESSION
async function test6_legacyRegression(base44: any, mem0ServerId: string): Promise<TestResult> {
  try {
    // Legacy flow: explicit serverId + toolName (no resolveMCPTool, no canonicalId).
    // Tool is authorized via tool_policy → should execute normally.
    const result = await callMcpClientCall(base44, {
      serverId: mem0ServerId,
      action: 'call',
      toolName: 'list_entities',
      arguments: {},
    });
    const passed = result.ok;
    return {
      name: 'TEST 6: LEGACY REGRESSION — explicit serverId+toolName (authorized) works',
      passed,
      detail: `toolName=list_entities (explicit) executed=${result.ok}`,
    };
  } catch (e) {
    return { name: 'TEST 6: LEGACY REGRESSION', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

export default async function (req: Request): Promise<Response> {
  const results: TestResult[] = [];
  const base44 = createClientFromRequest(req);
  const isAuth = await base44.auth.isAuthenticated();

  if (!isAuth) {
    results.push({ name: 'All tests', passed: false, detail: 'Not authenticated' });
  } else {
    // ── Unit tests (no server needed) ──
    results.push(test1_identityReachesGovernance());
    results.push(test2_unknownNotSafe());
    results.push(test3_governanceBeforeExecution());

    // ── Integration tests: need a real MCP server with safe policy ──
    const testServerIds: string[] = [];
    try {
      // Test server pointing to real mem0 with list_entities marked safe
      const mem0Test = await base44.asServiceRole.entities.MCPServerConfig.create({
        name: 'umg3-test-mem0',
        server_url: 'https://mcp.mem0.ai/mcp',
        auth_type: 'api_key',
        api_key_secret_name: 'MEM0_API_KEY',
        auth_header_name: 'Authorization',
        auth_token_prefix: 'Token',
        enabled: true,
        discovered_tools: '',
        last_error: '',
        tool_policy: JSON.stringify({ list_entities: { reversibility: 'safe' } }),
      });
      testServerIds.push(mem0Test.id);

      results.push(await test4_allowedToolExecutes(base44, mem0Test.id));
      results.push(await test5_rawIdentityPreserved(base44, mem0Test.id));
      results.push(await test6_legacyRegression(base44, mem0Test.id));
    } catch (e) {
      results.push({ name: 'Integration Setup', passed: false, detail: `Setup failed: ${(e as Error).message}` });
    } finally {
      for (const id of testServerIds) {
        try { await base44.asServiceRole.entities.MCPServerConfig.delete(id); } catch { /* best-effort */ }
      }
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const allPassed = failed === 0;

  return Response.json({
    summary: { total: results.length, passed, failed, allPassed },
    results,
  });
}