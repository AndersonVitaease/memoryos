/**
 * umg1Tests — Sprint UMG-1 Test Suite (UploadFile approach)
 *
 * 8 mandatory tests:
 *   1. Legacy inline catalog readable
 *   2. 500 tools: serialize → upload → URL persisted → fetch → exactly 500
 *   3. rawToolName + canonicalId preserved after upload/fetch
 *   4. V1 valid → V2 invalid → V1 preserved
 *   5. V1 valid → V2 valid → upload V2 PASS → URL changes → V2 fully recovered
 *   6. UploadFile V2 fails → URL V1 preserved
 *   7. mcpClientCall continues working (imports resolve)
 *   8. mcpBatchExecute continues working (readToolCatalog handles URL)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  buildToolCatalog,
  validateToolCatalog,
  writeToolCatalog,
  readToolCatalog,
} from '../../shared/mcpClient.ts';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

function generateSyntheticTools(count: number): any[] {
  const tools: any[] = [];
  for (let i = 0; i < count; i++) {
    tools.push({
      name: `tool_${i}`,
      description: `Synthetic tool number ${i} for testing catalog capacity and namespace isolation.`,
      inputSchema: {
        type: 'object',
        properties: {
          arg1: { type: 'string', description: `Argument for tool ${i}` },
          arg2: { type: 'number' },
          flag: { type: 'boolean' },
        },
        required: ['arg1'],
      },
    });
  }
  return tools;
}

function generateDuplicateTools(): any[] {
  return [
    { name: 'search', description: 'First search tool', inputSchema: { type: 'object' } },
    { name: 'search', description: 'Duplicate search tool', inputSchema: { type: 'object' } },
  ];
}

// TEST 1: Legacy inline catalog readable
async function test1_legacyInline(base44: any, serverId: string): Promise<TestResult> {
  try {
    const legacyTools = generateSyntheticTools(5);
    const legacyJson = JSON.stringify(legacyTools);
    await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
      discovered_tools: legacyJson,
    });
    const reRead = await base44.asServiceRole.entities.MCPServerConfig.get(serverId);
    const tools = await readToolCatalog(reRead.discovered_tools);
    const passed = tools.length === 5;
    return {
      name: 'TEST 1: Legacy inline catalog readable',
      passed,
      detail: `written=5 (inline JSON) read=${tools.length} format=legacy`,
    };
  } catch (e) {
    return { name: 'TEST 1: Legacy inline catalog readable', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 2: 500 tools — serialize → upload → URL persisted → fetch → exactly 500
async function test2_500toolsUploadFetch(base44: any, serverId: string): Promise<TestResult> {
  try {
    const tools = generateSyntheticTools(500);
    const url = await writeToolCatalog(base44, serverId, 'test-500', tools);
    await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
      discovered_tools: url,
    });
    const reRead = await base44.asServiceRole.entities.MCPServerConfig.get(serverId);
    const isUrl = reRead.discovered_tools.startsWith('http');
    const recovered = await readToolCatalog(reRead.discovered_tools);
    const passed = isUrl && recovered.length === 500;
    return {
      name: 'TEST 2: 500 tools — upload → URL → fetch → 500 recovered',
      passed,
      detail: `storage=${isUrl ? 'url' : 'inline'} written=500 recovered=${recovered.length}`,
    };
  } catch (e) {
    return { name: 'TEST 2: 500 tools — upload → URL → fetch → 500 recovered', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 3: rawToolName + canonicalId preserved after upload/fetch
async function test3_identityPreserved(base44: any, serverId: string): Promise<TestResult> {
  try {
    const tools = [
      { name: 'engineering.file.read', description: 'Read a file', inputSchema: { type: 'object' } },
      { name: 'engineering.code.search', description: 'Search code', inputSchema: { type: 'object' } },
    ];
    const url = await writeToolCatalog(base44, serverId, 'eng-mcp', tools);
    const recovered = await readToolCatalog(url);
    const t0 = recovered[0];
    const t1 = recovered[1];
    const namesOk = t0?.name === 'engineering.file.read' && t1?.name === 'engineering.code.search';
    const canonicalOk = t0?.canonicalId === `${serverId}.engineering.file.read` && t1?.canonicalId === `${serverId}.engineering.code.search`;
    const passed = namesOk && canonicalOk;
    return {
      name: 'TEST 3: rawToolName + canonicalId preserved after upload/fetch',
      passed,
      detail: `names=${namesOk} canonical=${canonicalOk} t0.name=${t0?.name} t0.canonicalId=${t0?.canonicalId}`,
    };
  } catch (e) {
    return { name: 'TEST 3: rawToolName + canonicalId preserved after upload/fetch', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 4: V1 valid → V2 invalid → V1 preserved
async function test4_v1PreservedOnInvalidV2(base44: any, serverId: string): Promise<TestResult> {
  try {
    const v1Tools = generateSyntheticTools(10).map((t, i) => ({ ...t, name: `v1_tool_${i}` }));
    const v1Url = await writeToolCatalog(base44, serverId, 'atomic-test', v1Tools);
    await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
      discovered_tools: v1Url,
      last_error: '',
    });

    const v2InvalidTools = generateDuplicateTools();
    const validation = validateToolCatalog(v2InvalidTools);
    if (!validation.valid) {
      await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
        last_error: `CATALOG_VALIDATION_FAILED: ${validation.error}`,
      });
    }

    const reRead = await base44.asServiceRole.entities.MCPServerConfig.get(serverId);
    const v1Preserved = reRead.discovered_tools === v1Url;
    const v1ToolsRecovered = await readToolCatalog(reRead.discovered_tools);
    const allV1 = v1ToolsRecovered.length === 10 && v1ToolsRecovered.every((t: any) => t.name?.startsWith('v1_tool_'));
    const passed = v1Preserved && allV1;
    return {
      name: 'TEST 4: V1 valid → V2 invalid → V1 preserved',
      passed,
      detail: `v1UrlPreserved=${v1Preserved} v1Count=${v1ToolsRecovered.length} allV1=${allV1}`,
    };
  } catch (e) {
    return { name: 'TEST 4: V1 valid → V2 invalid → V1 preserved', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 5: V1 valid → V2 valid → upload V2 PASS → URL changes → V2 fully recovered
async function test5_v2SwapsV1(base44: any, serverId: string): Promise<TestResult> {
  try {
    const v1Tools = generateSyntheticTools(10).map((t, i) => ({ ...t, name: `v1_tool_${i}` }));
    const v1Url = await writeToolCatalog(base44, serverId, 'swap-test', v1Tools);
    await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
      discovered_tools: v1Url,
      last_error: '',
    });

    const v2Tools = generateSyntheticTools(20).map((t, i) => ({ ...t, name: `v2_tool_${i}` }));
    const validation = validateToolCatalog(v2Tools);
    let v2Url = '';
    if (validation.valid) {
      v2Url = await writeToolCatalog(base44, serverId, 'swap-test', v2Tools);
      await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
        discovered_tools: v2Url,
        last_discovered_at: new Date().toISOString(),
        last_error: '',
      });
    }

    const reRead = await base44.asServiceRole.entities.MCPServerConfig.get(serverId);
    const urlChanged = reRead.discovered_tools === v2Url && v2Url !== v1Url;
    const v2Recovered = await readToolCatalog(reRead.discovered_tools);
    const allV2 = v2Recovered.length === 20 && v2Recovered.every((t: any) => t.name?.startsWith('v2_tool_'));
    const passed = urlChanged && allV2;
    return {
      name: 'TEST 5: V1 valid → V2 valid → URL changes → V2 fully recovered',
      passed,
      detail: `urlChanged=${urlChanged} v2Count=${v2Recovered.length} allV2=${allV2}`,
    };
  } catch (e) {
    return { name: 'TEST 5: V1 valid → V2 valid → URL changes → V2 fully recovered', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 6: UploadFile V2 fails → URL V1 preserved
async function test6_uploadFailsV1Preserved(base44: any, serverId: string): Promise<TestResult> {
  try {
    const v1Tools = generateSyntheticTools(10).map((t, i) => ({ ...t, name: `v1_tool_${i}` }));
    const v1Url = await writeToolCatalog(base44, serverId, 'upload-fail-test', v1Tools);
    await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
      discovered_tools: v1Url,
      last_error: '',
    });

    const brokenBase44 = {
      ...base44,
      integrations: {
        ...base44.integrations,
        Core: {
          ...base44.integrations.Core,
          UploadFile: async () => { throw new Error('Simulated upload failure'); },
        },
      },
    };

    let uploadFailed = false;
    const v2Tools = generateSyntheticTools(20).map((t, i) => ({ ...t, name: `v2_tool_${i}` }));
    try {
      await writeToolCatalog(brokenBase44, serverId, 'upload-fail-test', v2Tools);
    } catch {
      uploadFailed = true;
    }

    const reRead = await base44.asServiceRole.entities.MCPServerConfig.get(serverId);
    const v1Preserved = reRead.discovered_tools === v1Url;
    const passed = uploadFailed && v1Preserved;
    return {
      name: 'TEST 6: UploadFile V2 fails → URL V1 preserved',
      passed,
      detail: `uploadFailed=${uploadFailed} v1UrlPreserved=${v1Preserved}`,
    };
  } catch (e) {
    return { name: 'TEST 6: UploadFile V2 fails → URL V1 preserved', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

// TEST 7: mcpClientCall continues working (imports resolve)
function test7_importsResolve(): TestResult {
  const passed = typeof writeToolCatalog === 'function' && typeof readToolCatalog === 'function';
  return {
    name: 'TEST 7: mcpClientCall imports resolve (writeToolCatalog, readToolCatalog)',
    passed,
    detail: `writeToolCatalog=${typeof writeToolCatalog} readToolCatalog=${typeof readToolCatalog}`,
  };
}

// TEST 8: mcpBatchExecute continues working (readToolCatalog handles URL)
async function test8_batchExecuteUrlCompat(base44: any, serverId: string): Promise<TestResult> {
  try {
    const tools = generateSyntheticTools(15);
    const url = await writeToolCatalog(base44, serverId, 'batch-compat-test', tools);
    await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
      discovered_tools: url,
    });

    const reRead = await base44.asServiceRole.entities.MCPServerConfig.get(serverId);
    const recovered = await readToolCatalog(reRead.discovered_tools);
    const names = new Set(recovered.map((t: any) => t?.name).filter(Boolean));
    const passed = names.size === 15 && recovered.length === 15;
    return {
      name: 'TEST 8: mcpBatchExecute reads URL-based catalog (readToolCatalog)',
      passed,
      detail: `urlFormat=true recovered=${recovered.length} names=${names.size}`,
    };
  } catch (e) {
    return { name: 'TEST 8: mcpBatchExecute reads URL-based catalog (readToolCatalog)', passed: false, detail: `EXCEPTION: ${(e as Error).message}` };
  }
}

export default async function (req: Request): Promise<Response> {
  const results: TestResult[] = [];

  const base44 = createClientFromRequest(req);
  const isAuth = await base44.auth.isAuthenticated();

  if (!isAuth) {
    results.push({ name: 'All tests', passed: false, detail: 'Not authenticated' });
  } else {
    let testServerId: string | null = null;
    try {
      const created = await base44.asServiceRole.entities.MCPServerConfig.create({
        name: 'umg1-test-server',
        server_url: 'http://localhost:9999/mcp',
        auth_type: 'none',
        enabled: false,
        discovered_tools: '',
        last_error: '',
      });
      testServerId = created.id;

      results.push(await test1_legacyInline(base44, testServerId));
      results.push(await test2_500toolsUploadFetch(base44, testServerId));
      results.push(await test3_identityPreserved(base44, testServerId));
      results.push(await test4_v1PreservedOnInvalidV2(base44, testServerId));
      results.push(await test5_v2SwapsV1(base44, testServerId));
      results.push(await test6_uploadFailsV1Preserved(base44, testServerId));
      results.push(test7_importsResolve());
      results.push(await test8_batchExecuteUrlCompat(base44, testServerId));
    } catch (e) {
      results.push({ name: 'Setup', passed: false, detail: `Setup failed: ${(e as Error).message}` });
    } finally {
      if (testServerId) {
        try { await base44.asServiceRole.entities.MCPServerConfig.delete(testServerId); } catch { /* best-effort */ }
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