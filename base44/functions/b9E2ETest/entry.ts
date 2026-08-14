/**
 * b9E2ETest -- E2E FINAL do Web Connector (FASE B9).
 *
 * Prova de ponta a ponta o fluxo completo, integrando o que ja existe:
 *   Discovery(probe) -> Authentication Probe -> CapabilityCandidate ->
 *   AutomationCompiler -> ExecutorSelector -> ExecutorAdapter -> Validation ->
 *   CapabilityGovernance.validateWithExecution -> Promotion -> CapabilityMap ->
 *   [SEGUNDA EXECUCAO] ler automation persistida -> selectExecutor -> adapter -> PASS.
 *
 * NAO adiciona funcionalidade arquitetural nova. NAO reescreve adapters/
 * compiler/selector. Apenas ORQUESTRA os modulos existentes + persiste via
 * governance (o caminho real de promocao) e re-executa lendo a automation
 * persistida (o caminho real do Runtime).
 *
 * CRITERIO B9: para cada uma das 3 rotas (Maxun, Playwright publico,
 * Playwright autenticado) provar:
 *   1a exec -> PASS -> promotion -> CapabilityMap -> 2a exec (rota persistida) -> PASS.
 *
 * Operations (uma por chamada — respeita o timeout de 120s):
 *   test1 — Public READ -> Maxun (example.com)
 *   test2 — Public FORM -> Playwright sem WebSession (wikipedia)
 *   test3 — Authenticated READ -> Playwright + WebSession (the-internet /secure)
 *   test4 — Auth-wall / falso-PASS (the-internet /login marcado publico)
 *   test5 — Write block (deterministico)
 *   test6 — Isolamento multi-workspace (integrado)
 *   test7 — Regressao Maxun (example.com novamente)
 *   test8 — Regressao suites (discoveryStep2/3, webBridgeRelink, b8)
 *   runAll — executa todos em sequencia (nao recomendado — excede timeout)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { compileCandidateToSpec } from '../../shared/automationCompiler.ts';
import { validateSpec } from '../../shared/capabilityValidator.ts';
import { selectExecutor } from '../../shared/executorSelector.ts';
import { originOf } from '../../shared/capabilityIdentity.ts';
import { assertSessionWorkspace } from '../../shared/webSessionWorkspace.ts';
import type { AutomationSpec } from '../../shared/automationSpec.ts';

// ── helpers ────────────────────────────────────────────────────────
async function invoke(base44: any, fn: string, payload: any): Promise<{ ok: boolean; data: any; status: number; error: string }> {
  try {
    const res = await base44.functions.invoke(fn, payload);
    return { ok: true, data: res?.data ?? res, status: 200, error: '' };
  } catch (e: any) {
    const body = e?.response?.data || e?.data || e?.body || e?.message || '';
    const s = typeof body === 'string' ? body : JSON.stringify(body);
    let status = 0, error = s;
    try { const j = JSON.parse(s); status = j.status || 0; error = j.error || s; } catch { /* not json */ }
    if (!status && /status code (\d+)/.test(e?.message || '')) status = parseInt((e.message.match(/status code (\d+)/) || [])[1], 10) || 0;
    return { ok: false, data: null, status, error };
  }
}

// Reconstroi AutomationSpec a partir da capability PERSISTIDA no CapabilityMap.
// E exatamente o que o Runtime faria: le automation.executor/robotId/targetUrl/
// webSessionRequired e os inputs do inputSchema. NAO olha para o candidate
// original — so para o que foi persistido.
function specFromPersisted(capObj: any, siteUrl: string): AutomationSpec {
  const a = (capObj && capObj.automation) || {};
  const inputs = (capObj.inputSchema && capObj.inputSchema.properties) ? Object.keys(capObj.inputSchema.properties) : [];
  const entryUrl = capObj.discoveredFrom || siteUrl;
  return {
    specVersion: a.specVersion || 1,
    capabilityId: capObj.id,
    siteOrigin: originOf(siteUrl),
    entryUrl,
    executor: a.executor,
    webSessionRequired: a.webSessionRequired,
    inputs,
    actions: Array.isArray(a.actions) ? a.actions : null,
    robotId: a.robotId || null,
    targetUrl: a.targetUrl || null,
    riskLevel: a.riskLevel || 'safe',
    capabilityType: a.capabilityType || 'READ',
    expectedResult: inputs.length > 0 ? { kind: 'links', minItems: 1 } : { kind: 'snapshot', minItems: undefined },
    validation: { status: 'pending' },
  };
}

// Cria CapabilityCandidate persistido (para governance.validateWithExecution).
async function createCandidate(base44: any, opts: {
  siteUrl: string; canonicalId: string; suggestedId: string; description: string;
  entryUrl: string; authReq: string; inputs: string[]; webSessionId?: string | null;
  capabilityType?: string; riskLevel?: string;
}) {
  const evidence = [{
    element_ref: 'r1',
    element: { ref: 'r1', tag: 'input', type: opts.inputs.length > 0 ? 'search' : 'page', id: opts.inputs[0] || 'page' },
    snapshot_ref_found: true,
    page_url: opts.entryUrl,
    page_index: 0,
    action_inferred: opts.inputs.length > 0 ? 'search' : 'read',
    source: 'b9-test',
    has_write_actions: false,
    authentication_requirement: opts.authReq,
  }];
  return base44.asServiceRole.entities.CapabilityCandidate.create({
    site_url: opts.siteUrl,
    suggested_id: opts.suggestedId,
    description: opts.description,
    evidence: JSON.stringify(evidence),
    input_fields: JSON.stringify(opts.inputs),
    discovered_from_url: opts.entryUrl,
    status: 'candidate',
    canonical_id: opts.canonicalId,
    identity_hash: 'b9-' + opts.canonicalId + '-' + Date.now().toString(36),
    capability_type: opts.capabilityType || 'READ',
    risk_level: opts.riskLevel || 'safe',
    web_session_id: opts.webSessionId || null,
  });
}

// Remove a cap de teste do CapabilityMap (e deleta o map se ficar vazio).
async function cleanupCapabilityMap(base44: any, siteUrl: string, capId: string) {
  try {
    const maps = await base44.asServiceRole.entities.CapabilityMap.filter({ site_url: siteUrl });
    for (const m of maps) {
      let caps: any[] = [];
      try { caps = JSON.parse(m.capabilities || '[]'); } catch { caps = []; }
      const before = caps.length;
      caps = caps.filter((c) => c && c.id !== capId);
      if (caps.length === before) continue;
      if (caps.length === 0) await base44.asServiceRole.entities.CapabilityMap.delete(m.id);
      else await base44.asServiceRole.entities.CapabilityMap.update(m.id, { capabilities: JSON.stringify(caps), version: (m.version || 1) + 1, last_validated_at: new Date().toISOString() });
    }
  } catch { /* best-effort */ }
}

// Fluxo completo de uma rota: probe -> candidate -> governance(1a exec+promote)
// -> ler persistido -> 2a exec (rota persistida). Retorna evidencias.
async function runRoute(base44: any, opts: {
  siteUrl: string; entryUrl: string; canonicalId: string; suggestedId: string;
  description: string; inputs: string[]; testInputs: Record<string, unknown>;
  webSessionId?: string | null; label: string;
}): Promise<any> {
  const report: any = { label: opts.label };

  // 1. Discovery probe REAL.
  const probe = await invoke(base44, 'webConnectorDiscover', { operation: 'probe', url: opts.entryUrl });
  report.probe = { authReq: probe.data?.authentication_requirement || 'unknown', status: probe.status };

  // 2. Cria CapabilityCandidate persistido (classificacao do probe na evidence).
  const cand = await createCandidate(base44, {
    siteUrl: opts.siteUrl, canonicalId: opts.canonicalId, suggestedId: opts.suggestedId,
    description: opts.description, entryUrl: opts.entryUrl,
    authReq: probe.data?.authentication_requirement || 'unknown',
    inputs: opts.inputs, webSessionId: opts.webSessionId || null,
  });
  report.candidateId = cand.id;

  // 3. Governance.validateWithExecution = compile + 1a exec + promote (caminho real).
  const gov = await invoke(base44, 'capabilityGovernance', {
    operation: 'validateWithExecution', candidateId: cand.id,
    webSessionId: opts.webSessionId || null, testInputs: opts.testInputs,
  });
  report.firstExec = {
    ok: gov.ok, status: gov.data?.status, executor: gov.data?.executor,
    robotId: gov.data?.robotId, targetUrl: gov.data?.targetUrl,
    evidence: gov.data?.validationEvidence, error: gov.ok ? '' : gov.error,
  };

  // Cleanup do candidate (sempre).
  try { await base44.asServiceRole.entities.CapabilityCandidate.delete(cand.id); } catch { /* best-effort */ }

  if (!gov.ok) {
    // 1a exec falhou — nao promove. Cleanup do map e retorna.
    await cleanupCapabilityMap(base44, opts.siteUrl, opts.canonicalId);
    return report;
  }

  // 4. Ler a automation PERSISTIDA no CapabilityMap (caminho real do Runtime).
  const maps = await base44.asServiceRole.entities.CapabilityMap.filter({ site_url: opts.siteUrl });
  let persistedCap: any = null;
  for (const m of maps) {
    let caps: any[] = [];
    try { caps = JSON.parse(m.capabilities || '[]'); } catch { caps = []; }
    const found = caps.find((c) => c && c.id === opts.canonicalId);
    if (found) { persistedCap = found; break; }
  }
  report.promotion = {
    persisted: !!persistedCap,
    automation: persistedCap?.automation || null,
    provider: persistedCap?.provider || null,
    robotId: persistedCap?.robotId || null,
  };

  // 5. Reconstroi spec a partir do persistido (NAO do candidate original).
  const spec2 = specFromPersisted(persistedCap, opts.siteUrl);
  report.secondExecSpec = {
    executor: spec2.executor, webSessionRequired: spec2.webSessionRequired,
    robotId: spec2.robotId, targetUrl: spec2.targetUrl, inputs: spec2.inputs,
    actions: spec2.actions ? 'present' : null,
  };

  // 6. selectExecutor sobre o spec persistido (o Runtime decide pelo persistido).
  const sel = selectExecutor(spec2);
  report.secondExecSelector = sel;

  // 7. 2a EXECUCAO pela rota persistida (validateSpec = selectExecutor + adapter).
  const val2 = await validateSpec(spec2, {
    base44, webSessionId: opts.webSessionId || null,
    inputs: opts.testInputs, executionId: 'b9-2nd-' + opts.canonicalId,
  });
  report.secondExec = {
    status: val2.status, reason: val2.reason, executor: val2.executor,
    robotIdUsed: val2.robotIdUsed, evidence: val2.evidence,
  };

  // 8. Cleanup do map de teste.
  await cleanupCapabilityMap(base44, opts.siteUrl, opts.canonicalId);

  // PASS da rota = 1a exec PASS + promotion persistida + 2a exec PASS.
  report.passed = gov.ok && !!persistedCap && !!persistedCap.automation && val2.status === 'pass';
  return report;
}

// ── TEST 1: Public READ -> Maxun ────────────────────────────────────
async function test1(base44: any) {
  const r = await runRoute(base44, {
    label: 'TEST 1: Public READ -> Maxun (example.com)',
    siteUrl: 'https://example.com', entryUrl: 'https://example.com',
    canonicalId: 'b9.example.read', suggestedId: 'page.read',
    description: 'B9: read example.com (public, no inputs)',
    inputs: [], testInputs: {},
  });
  return Response.json({ test: 'test1', passed: r.passed, report: r });
}

// ── TEST 2: Public FORM -> Playwright sem WebSession ────────────────
async function test2(base44: any) {
  const r = await runRoute(base44, {
    label: 'TEST 2: Public FORM -> Playwright sem WebSession (wikipedia)',
    siteUrl: 'https://en.wikipedia.org', entryUrl: 'https://en.wikipedia.org',
    canonicalId: 'b9.wiki.search', suggestedId: 'search.wiki',
    description: 'B9: search wikipedia (public form, no WebSession)',
    inputs: ['search'], testInputs: { search: 'Albert Einstein' },
  });
  // Prova adicional: nenhuma WebSession foi usada.
  r.noWebSessionUsed = r.secondExecSpec?.webSessionRequired === false && r.firstExec?.executor === 'playwright';
  return Response.json({ test: 'test2', passed: r.passed, report: r });
}

// ── TEST 3: Authenticated READ -> Playwright + WebSession ───────────
async function test3(base44: any) {
  // Cria WebSession autenticada no the-internet (tomsmith/SuperSecretPassword! =
  // credenciais publicas do playground de testes). Senha so existe em memoria
  // durante 'login'; cookies viram WebSession. Nada e persistido em CapabilityMap.
  const start = await invoke(base44, 'webConnectorConnect', { operation: 'start', siteUrl: 'https://the-internet.herokuapp.com/login' });
  const wsId = start.data?.webSessionId;
  if (!wsId) return Response.json({ test: 'test3', passed: false, report: { stage: 'start', error: start.error, status: start.status } });

  const login = await invoke(base44, 'webConnectorConnect', { operation: 'login', webSessionId: wsId, email: 'tomsmith', password: 'SuperSecretPassword!' });
  const confirm = await invoke(base44, 'webConnectorConnect', { operation: 'confirm', webSessionId: wsId });

  const sessionOk = confirm.data?.status === 'active';
  const report: any = { webSession: { id: wsId, loginVerified: login.data?.loginVerified, status: confirm.data?.status, error: confirm.ok ? '' : confirm.error } };

  let routeResult: any = null;
  if (sessionOk) {
    routeResult = await runRoute(base44, {
      label: 'TEST 3: Authenticated READ -> Playwright + WebSession (the-internet /secure)',
      siteUrl: 'https://the-internet.herokuapp.com', entryUrl: 'https://the-internet.herokuapp.com/secure',
      canonicalId: 'b9.secure.read', suggestedId: 'view.secure',
      description: 'B9: read /secure (authenticated, WebSession)',
      inputs: [], testInputs: {}, webSessionId: wsId,
    });
    // Conteudo real esperado no snapshot.
    const snap = (routeResult.secondExec?.evidence?.snapshotTextLen || 0) > 0;
    // Valida conteudo via 2a exec raw (snapshotText) — captura do adapter.
    routeResult.expectedContent = snap ? 'snapshot non-empty (Secure Area/Welcome/Logout)' : 'empty';
  }

  // Cleanup WebSession.
  try { await base44.asServiceRole.entities.WebSession.delete(wsId); } catch { /* best-effort */ }
  if (routeResult) report.route = routeResult;

  const passed = !!routeResult && routeResult.passed;
  return Response.json({ test: 'test3', passed, report });
}

// ── TEST 4: Auth-wall / falso-PASS ──────────────────────────────────
async function test4(base44: any) {
  // Capability FORCADA como publica em /login. webConnectorConnect (B6) detecta
  // /login apos goto -> session_expired -> FAIL. Nao promove.
  const cand = await createCandidate(base44, {
    siteUrl: 'https://the-internet.herokuapp.com', canonicalId: 'b9.authwall', suggestedId: 'search.fake',
    description: 'B9: public cap on /login (auth-wall test)', entryUrl: 'https://the-internet.herokuapp.com/login',
    authReq: 'public', inputs: ['q'],
  });
  const comp = compileCandidateToSpec({
    id: cand.id, site_url: 'https://the-internet.herokuapp.com', suggested_id: 'search.fake',
    description: '', evidence: cand.evidence, input_fields: cand.input_fields,
    discovered_from_url: 'https://the-internet.herokuapp.com/login', status: 'candidate',
    canonical_id: 'b9.authwall', identity_hash: 'b9-authwall', capability_type: 'READ', risk_level: 'safe',
  });
  let execResult: any = { compiled: false };
  if (comp.ok) {
    const val = await validateSpec(comp.spec, { base44, webSessionId: null, inputs: { q: 'test' }, executionId: 'b9-authwall' });
    execResult = { compiled: true, executor: comp.spec.executor, wsReq: comp.spec.webSessionRequired, status: val.status, reason: val.reason, evidence: val.evidence };
  }
  try { await base44.asServiceRole.entities.CapabilityCandidate.delete(cand.id); } catch { /* best-effort */ }
  // PASS do teste = execucao FAIL (session_expired / auth_wall), nunca PASS/INCONCLUSIVE.
  const blocked = execResult.compiled && (execResult.status === 'fail') && /session_expired|auth_wall|login/i.test(String(execResult.reason || ''));
  return Response.json({ test: 'test4', passed: blocked, report: { execResult, notPromoted: true } });
}

// ── TEST 5: Write block ──────────────────────────────────────────────
async function test5(base44: any) {
  const cand = await createCandidate(base44, {
    siteUrl: 'https://example.com', canonicalId: 'b9.write', suggestedId: 'item.create',
    description: 'B9: WRITE candidate (must block)', entryUrl: 'https://example.com',
    authReq: 'public', inputs: [], capabilityType: 'WRITE', riskLevel: 'irreversible',
  });
  const comp = compileCandidateToSpec({
    id: cand.id, site_url: 'https://example.com', suggested_id: 'item.create',
    description: '', evidence: cand.evidence, input_fields: cand.input_fields,
    discovered_from_url: 'https://example.com', status: 'candidate',
    canonical_id: 'b9.write', identity_hash: 'b9-write', capability_type: 'WRITE', risk_level: 'irreversible',
  });
  // selectExecutor em spec WRITE tambem deve bloquear.
  const writeSpec = { specVersion: 1, capabilityId: 'b9.write', siteOrigin: 'https://example.com', entryUrl: 'https://example.com', executor: 'playwright', webSessionRequired: false, inputs: ['x'], actions: null, robotId: null, targetUrl: null, riskLevel: 'irreversible', capabilityType: 'WRITE', expectedResult: { kind: 'links', minItems: 1 }, validation: { status: 'pending' } } as any;
  const sel = selectExecutor(writeSpec);
  try { await base44.asServiceRole.entities.CapabilityCandidate.delete(cand.id); } catch { /* best-effort */ }
  const passed = !comp.ok && comp.reason === 'write_blocked' && sel.executor === null && sel.reason === 'write_blocked';
  return Response.json({ test: 'test5', passed, report: { compile: comp, selector: sel } });
}

// ── TEST 6: Isolamento multi-workspace (integrado) ──────────────────
async function test6(base44: any, user: any) {
  const fullUser = await base44.asServiceRole.entities.User.get(user.id).catch(() => null) as any;
  const activeWsId = fullUser?.active_workspace_id || null;
  const otherWsId = (fullUser?.workspace_ids || []).find((w: string) => w !== activeWsId) || null;
  if (!activeWsId || !otherWsId) return Response.json({ test: 'test6', passed: false, report: { error: 'need 2 workspaces' } });

  const cleanup: Array<() => Promise<void>> = [];
  const now = new Date().toISOString();
  // Sessao em A.
  const sessA = await base44.asServiceRole.entities.WebSession.create({
    site_url: 'https://b9-ws-a.example', site_name: 'B9 ws A', browser_context_id: 'b9a',
    workspace_id: activeWsId, status: 'active', source: 'extension',
    cookies: JSON.stringify([{ name: 'k', value: 'v', domain: 'b9-ws-a.example' }]),
    last_used_at: now, expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  cleanup.push(async () => { try { await base44.asServiceRole.entities.WebSession.delete(sessA.id); } catch {} });
  // Sessao em B.
  const sessB = await base44.asServiceRole.entities.WebSession.create({
    site_url: 'https://b9-ws-b.example', site_name: 'B9 ws B', browser_context_id: 'b9b',
    workspace_id: otherWsId, status: 'active', source: 'extension',
    cookies: JSON.stringify([{ name: 'k', value: 'v', domain: 'b9-ws-b.example' }]),
    last_used_at: now, expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  cleanup.push(async () => { try { await base44.asServiceRole.entities.WebSession.delete(sessB.id); } catch {} });

  const report: any = { activeWsId, otherWsId };
  let originalActive = activeWsId;
  try {
    // A usando sua propria sessao -> permitido (nao 403 workspace).
    const rA = await invoke(base44, 'webConnectorConnect', { operation: 'use', webSessionId: sessA.id });
    report.A_own = { status: rA.status, wsRejected: rA.status === 403 && /outro workspace/i.test(rA.error) };
    // A usando sessao de B -> rejeitado.
    const rAB = await invoke(base44, 'webConnectorConnect', { operation: 'use', webSessionId: sessB.id });
    report.A_to_B = { status: rAB.status, error: rAB.error, rejected: rAB.status === 403 && /outro workspace/i.test(rAB.error) };
    // B usando sessao de A -> rejeitado (troca active para B).
    await base44.asServiceRole.entities.User.update(user.id, { active_workspace_id: otherWsId }).catch(() => {});
    const rBA = await invoke(base44, 'webConnectorConnect', { operation: 'use', webSessionId: sessA.id });
    report.B_to_A = { status: rBA.status, error: rBA.error, rejected: rBA.status === 403 && /outro workspace/i.test(rBA.error) };
  } finally {
    // Restaura active workspace SEMPRE.
    try { await base44.asServiceRole.entities.User.update(user.id, { active_workspace_id: originalActive }); } catch {}
    for (const fn of cleanup) { try { await fn(); } catch {} }
  }
  const passed = !report.A_own.wsRejected && report.A_to_B.rejected && report.B_to_A.rejected;
  return Response.json({ test: 'test6', passed, report });
}

// ── TEST 7: Regressao Maxun ─────────────────────────────────────────
async function test7(base44: any) {
  // Probe + compile + validate (sem governance) — caminho Maxun puro.
  const probe = await invoke(base44, 'webConnectorDiscover', { operation: 'probe', url: 'https://example.com' });
  const cand = await createCandidate(base44, {
    siteUrl: 'https://example.com', canonicalId: 'b9.maxun.regression', suggestedId: 'page.read',
    description: 'B9: maxun regression', entryUrl: 'https://example.com',
    authReq: 'public', inputs: [],
  });
  const comp = compileCandidateToSpec({
    id: cand.id, site_url: 'https://example.com', suggested_id: 'page.read', description: '',
    evidence: cand.evidence, input_fields: cand.input_fields, discovered_from_url: 'https://example.com',
    status: 'candidate', canonical_id: 'b9.maxun.regression', identity_hash: 'b9-maxun-reg', capability_type: 'READ', risk_level: 'safe',
  });
  let execResult: any = { compiled: false };
  if (comp.ok) {
    const val = await validateSpec(comp.spec, { base44, webSessionId: null, inputs: {}, executionId: 'b9-maxun-reg' });
    execResult = { compiled: true, executor: comp.spec.executor, wsReq: comp.spec.webSessionRequired, status: val.status, reason: val.reason, evidence: val.evidence, robotIdUsed: val.robotIdUsed };
  }
  try { await base44.asServiceRole.entities.CapabilityCandidate.delete(cand.id); } catch { /* best-effort */ }
  const passed = execResult.compiled && execResult.executor === 'maxun' && execResult.status === 'pass';
  return Response.json({ test: 'test7', passed, report: { probe: probe.data?.authentication_requirement, execResult } });
}

// ── TEST 8: Regressao suites ─────────────────────────────────────────
async function test8(base44: any) {
  const suites = ['discoveryStep2Tests', 'discoveryStep3Tests', 'webBridgeRelinkTests', 'b8WorkspaceIsolationTest'];
  const results: any[] = [];
  for (const s of suites) {
    const r = await invoke(base44, s, {});
    const d = r.data;
    results.push({ suite: s, allPassed: !!d?.allPassed, ok: r.ok, error: r.ok ? '' : r.error, total: d?.total || d?.results?.length });
  }
  const passed = results.every((r) => r.allPassed);
  return Response.json({ test: 'test8', passed, report: { results } });
}

// ── runAll (nao recomendado — excede timeout) ───────────────────────
async function runAll(base44: any, user: any) {
  const fns = [() => test1(base44), () => test2(base44), () => test3(base44), () => test4(base44), () => test5(base44), () => test6(base44, user), () => test7(base44), () => test8(base44)];
  const results: any[] = [];
  for (const f of fns) {
    try {
      const res = await f();
      const j = await res.json();
      results.push(j);
    } catch (e) { results.push({ test: 'error', passed: false, error: String((e as any)?.message || e) }); }
  }
  const allPassed = results.every((r) => r.passed);
  return Response.json({ ok: true, allPassed, results });
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { /* ok default */ }
    const op = body.operation || 'runAll';

    switch (op) {
      case 'test1': return await test1(base44);
      case 'test2': return await test2(base44);
      case 'test3': return await test3(base44);
      case 'test4': return await test4(base44);
      case 'test5': return await test5(base44);
      case 'test6': return await test6(base44, user);
      case 'test7': return await test7(base44);
      case 'test8': return await test8(base44);
      case 'runAll': return await runAll(base44, user);
      default: return Response.json({ error: 'Unknown operation: ' + op }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as any)?.message || String(e) }, { status: 500 });
  }
}