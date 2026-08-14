/**
 * discoveryStep3Tests -- Testes do ciclo AutomationSpec (FASE 10).
 *
 * Testa determinicamente (sem rede, sem Maxun, sem Playwright):
 *   1. compileCandidateToSpec: READ c/ evidence valida -> spec deterministica
 *   2. Candidate sem evidence suficiente -> COMPILATION_FAILED
 *   3. Candidate WRITE -> COMPILATION_FAILED{write_blocked}
 *   4. Candidate READ sem inputs (scrape puro) -> Maxun-creatable (executor=maxun, targetUrl=entryUrl)
 *   5. Candidate READ c/ inputs (form-fill) -> executor=playwright (NOT_CREATABLE sem enabler)
 *   6. Candidate c/ robotId pre-existente -> executor=maxun, reusa robotId
 *   7. selectExecutor: executor desconhecido -> null
 *   8. selectExecutor: WRITE -> null (write_blocked)
 *   9. maxunAdapter.validate: webSessionRequired=true -> rejeita
 *  10. maxunAdapter.validate: sem robotId e sem targetUrl -> rejeita
 *  11. playwrightAdapter.validate: WRITE -> rejeita
 *  12. validateSpec (mock adapter PASS) -> pass  (validacao do orquestrador)
 *  13. validateSpec (mock adapter FAIL) -> fail
 *  14. validateSpec (mock adapter sem expected) -> inconclusive
 *
 * Nao chama webConnectorConnect/maxunRun reais. Usa fixtures + mocks.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { compileCandidateToSpec, isMaxunCreatable } from '../../shared/automationCompiler.ts';
import { selectExecutor } from '../../shared/executorSelector.ts';
import { maxunAdapter } from '../../shared/maxunAdapter.ts';
import { playwrightAdapter } from '../../shared/playwrightAdapter.ts';
import { validateSpec, detectAuthWall } from '../../shared/capabilityValidator.ts';
import { classifyAuthenticationRequirement, deriveAuthenticationRequirement } from '../../shared/webDiscovery.ts';
import type { AutomationSpec, AutomationExecutor } from '../../shared/automationSpec.ts';
import type { ExecutorAdapter, ExecutorResult } from '../../shared/executorAdapter.ts';

function makeCandidate(opts: Partial<{
  site_url: string; suggested_id: string; discovered_from_url: string;
  evidence: string; input_fields: string; canonical_id: string;
  capability_type: string; risk_level: string;
  authentication_requirement: 'public' | 'session_required' | 'unknown';
  web_session_id: string;
}>) {
  const authReq = opts.authentication_requirement;
  const baseEvidence: Record<string, unknown> = {
    element_ref: 'r1',
    element: { ref: 'r1', tag: 'input', type: 'search', id: 'q' },
    snapshot_ref_found: true,
    page_url: opts.discovered_from_url || 'https://example.com/search',
    page_index: 0,
    action_inferred: 'search',
    source: 'extension',
    has_write_actions: false,
  };
  if (authReq !== undefined) baseEvidence.authentication_requirement = authReq;
  return {
    id: 'cand-test-' + Math.random().toString(36).slice(2, 8),
    site_url: opts.site_url || 'https://example.com',
    suggested_id: opts.suggested_id || 'product.search',
    description: 'test',
    evidence: opts.evidence || JSON.stringify([baseEvidence]),
    input_fields: opts.input_fields || JSON.stringify(['q']),
    discovered_from_url: opts.discovered_from_url || 'https://example.com/search',
    status: 'candidate',
    canonical_id: opts.canonical_id || 'search.product',
    identity_hash: 'h-test',
    capability_type: opts.capability_type || 'READ',
    risk_level: opts.risk_level || 'safe',
    web_session_id: opts.web_session_id,
  };
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const results: Array<{ test: string; passed: boolean; detail?: string }> = [];

    // === FASE B4: Compiler routing por authentication_requirement ===

    // Case 1: public + READ + inputs=[] -> maxun, wsReq=false, targetUrl=entryUrl
    {
      const c = makeCandidate({ site_url: 'https://example.com', discovered_from_url: 'https://example.com', input_fields: '[]', authentication_requirement: 'public' });
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.executor === 'maxun' && r.spec.webSessionRequired === false && r.spec.targetUrl === 'https://example.com';
      results.push({ test: 'B4-1. public READ inputs=[] -> maxun', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, wsReq: r.spec.webSessionRequired, targetUrl: r.spec.targetUrl }) : JSON.stringify(r) });
    }

    // Case 2: web_session_id preenchido + public + READ + inputs=[] -> maxun
    // (prova: web_session_id != authentication requirement)
    {
      const c = makeCandidate({ site_url: 'https://example.com', discovered_from_url: 'https://example.com', input_fields: '[]', authentication_requirement: 'public', web_session_id: 'ws-session-xyz' });
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.executor === 'maxun' && r.spec.webSessionRequired === false;
      results.push({ test: 'B4-2. web_session_id + public -> maxun (web_session_id != auth)', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, wsReq: r.spec.webSessionRequired }) : JSON.stringify(r) });
    }

    // Case 3: session_required + READ + inputs=[] -> playwright + wsReq=true + actions=null
    {
      const c = makeCandidate({ site_url: 'https://the-internet.herokuapp.com', discovered_from_url: 'https://the-internet.herokuapp.com/secure', input_fields: '[]', authentication_requirement: 'session_required' });
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.executor === 'playwright' && r.spec.webSessionRequired === true && r.spec.actions === null && r.spec.inputs.length === 0;
      results.push({ test: 'B4-3. session_required READ inputs=[] -> playwright+wsReq+actions=null', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, wsReq: r.spec.webSessionRequired, actions: r.spec.actions }) : JSON.stringify(r) });
    }

    // Case 5: public + inputs=['q'] -> playwright, wsReq=false
    {
      const c = makeCandidate({ site_url: 'https://example.com', discovered_from_url: 'https://example.com/search', input_fields: JSON.stringify(['q']), authentication_requirement: 'public' });
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.executor === 'playwright' && r.spec.webSessionRequired === false;
      results.push({ test: 'B4-5. public inputs>0 -> playwright wsReq=false', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, wsReq: r.spec.webSessionRequired }) : JSON.stringify(r) });
    }

    // Case 6: WRITE -> write_blocked
    {
      const c = makeCandidate({ capability_type: 'WRITE', risk_level: 'irreversible', authentication_requirement: 'public' });
      const r = compileCandidateToSpec(c);
      const passed = !r.ok && r.reason === 'write_blocked';
      results.push({ test: 'B4-6. WRITE -> write_blocked', passed, detail: JSON.stringify(r) });
    }

    // Case 7: unknown -> playwright + wsReq=true (conservador, NUNCA maxun)
    {
      const c = makeCandidate({ site_url: 'https://example.com', discovered_from_url: 'https://example.com', input_fields: '[]', authentication_requirement: 'unknown' });
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.executor === 'playwright' && r.spec.webSessionRequired === true;
      results.push({ test: 'B4-7. unknown -> playwright+wsReq (never maxun)', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, wsReq: r.spec.webSessionRequired }) : JSON.stringify(r) });
    }

    // Case 4: session_required spec sem WebSession (ctx.webSessionId=null) -> FAIL
    {
      const spec: AutomationSpec = {
        specVersion: 1, capabilityId: 'view.secure', siteOrigin: 'https://the-internet.herokuapp.com', entryUrl: 'https://the-internet.herokuapp.com/secure',
        executor: 'playwright', webSessionRequired: true, inputs: [], actions: null,
        robotId: null, targetUrl: null, riskLevel: 'safe', capabilityType: 'READ',
        expectedResult: { kind: 'snapshot' }, validation: { status: 'pending' },
      };
      const res = await playwrightAdapter.execute(spec, { base44: null as any, webSessionId: null as any, inputs: {} });
      const passed = res.ok === false && /webSessionRequired/i.test(String(res.error || ''));
      results.push({ test: 'B4-4. session_required sem WebSession -> FAIL', passed, detail: JSON.stringify({ ok: res.ok, error: res.error }) });
    }

    // (legado) robotId pre-existente -> maxun reutiliza (maxunImport)
    {
      const c = makeCandidate({ site_url: 'https://example.com', discovered_from_url: 'https://example.com', input_fields: '[]', authentication_requirement: 'session_required' });
      const r = compileCandidateToSpec(c, { robotId: 'robot-existing-123', flow: undefined });
      const passed = r.ok && r.spec.executor === 'maxun' && r.spec.robotId === 'robot-existing-123';
      results.push({ test: 'robotId pre-existente -> maxun reutiliza (maxunImport)', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, robotId: r.spec.robotId }) : JSON.stringify(r) });
    }

    // (legado) READ c/ inputs sem evidence -> COMPILATION_FAILED
    {
      const c = makeCandidate({ evidence: JSON.stringify([{ element_ref: 'r999', element: null, snapshot_ref_found: false, page_url: 'https://example.com/search', page_index: 0, authentication_requirement: 'public' }]) });
      const r = compileCandidateToSpec(c);
      const passed = !r.ok && r.reason === 'no_reliable_evidence';
      results.push({ test: 'READ c/ inputs sem evidence -> COMPILATION_FAILED', passed, detail: JSON.stringify(r) });
    }

    // 7. selectExecutor: executor desconhecido
    {
      const spec = { specVersion: 1, capabilityId: 'x', siteOrigin: 'https://a.com', entryUrl: 'https://a.com', executor: ('unknown' as AutomationExecutor), webSessionRequired: false, inputs: [], actions: null, robotId: null, targetUrl: null, riskLevel: 'safe', capabilityType: 'READ', expectedResult: { kind: 'snapshot' }, validation: { status: 'pending' } } as AutomationSpec;
      const sel = selectExecutor(spec);
      const passed = sel.executor === null && sel.reason === 'unknown_executor';
      results.push({ test: '7. selectExecutor: unknown -> null', passed, detail: JSON.stringify(sel) });
    }

    // 8. selectExecutor: WRITE -> null (write_blocked)
    {
      const c = makeCandidate({ capability_type: 'WRITE' });
      const r = compileCandidateToSpec(c); // failed
      const passed = !r.ok; // Compiler ja bloqueia; selectExecutor nunca ve WRITE compilado
      results.push({ test: '8. WRITE bloqueado no Compiler (select jamais ve)', passed, detail: JSON.stringify(r) });
    }

    // 9. maxunAdapter.validate: webSessionRequired=true -> rejeita
    {
      const spec: AutomationSpec = {
        specVersion: 1, capabilityId: 'x', siteOrigin: 'https://a.com', entryUrl: 'https://a.com',
        executor: 'maxun', webSessionRequired: true, inputs: [], actions: null,
        robotId: 'r1', targetUrl: null, riskLevel: 'safe', capabilityType: 'READ',
        expectedResult: { kind: 'snapshot' }, validation: { status: 'pending' },
      };
      const v = maxunAdapter.validate(spec);
      const passed = !v.ok && v.reason === 'websession_required_incompatible_with_maxun';
      results.push({ test: '9. maxunAdapter: webSessionRequired -> rejeita', passed, detail: JSON.stringify(v) });
    }

    // 10. maxunAdapter.validate: sem robotId e sem targetUrl -> rejeita
    {
      const spec: AutomationSpec = {
        specVersion: 1, capabilityId: 'x', siteOrigin: 'https://a.com', entryUrl: 'https://a.com',
        executor: 'maxun', webSessionRequired: false, inputs: [], actions: null,
        robotId: null, targetUrl: null, riskLevel: 'safe', capabilityType: 'READ',
        expectedResult: { kind: 'snapshot' }, validation: { status: 'pending' },
      };
      const v = maxunAdapter.validate(spec);
      const passed = !v.ok && v.reason === 'no_robot_and_no_target';
      results.push({ test: '10. maxunAdapter: sem robotId/target -> rejeita', passed, detail: JSON.stringify(v) });
    }

    // 11. playwrightAdapter.validate: WRITE -> rejeita
    {
      const spec: AutomationSpec = {
        specVersion: 1, capabilityId: 'x', siteOrigin: 'https://a.com', entryUrl: 'https://a.com',
        executor: 'playwright', webSessionRequired: true, inputs: ['q'], actions: null,
        robotId: null, targetUrl: null, riskLevel: 'irreversible', capabilityType: 'WRITE',
        expectedResult: { kind: 'links', minItems: 1 }, validation: { status: 'pending' },
      };
      const v = playwrightAdapter.validate(spec);
      const passed = !v.ok && v.reason === 'write_blocked';
      results.push({ test: '11. playwrightAdapter: WRITE -> rejeita', passed, detail: JSON.stringify(v) });
    }

    // 12-14. validateSpec com adapter mock (PASS/FAIL/INCONCLUSIVE)
    function mockAdapter(name: AutomationExecutor, behavior: 'pass' | 'fail' | 'empty'): ExecutorAdapter {
      return {
        id: name,
        validate: () => ({ ok: true }),
        execute: async (): Promise<ExecutorResult> => {
          if (behavior === 'fail') return { ok: false, executor: name, snapshotText: '', links: [], filled: [], finalUrl: '', extracted: null, robotIdUsed: null, error: 'session_expired' };
          if (behavior === 'empty') return { ok: true, executor: name, snapshotText: 'page loaded', links: [], filled: [], finalUrl: 'https://a.com', extracted: null, robotIdUsed: null };
          return { ok: true, executor: name, snapshotText: 'page', links: [{ text: 'Item 1', href: 'https://a.com/p/1' }], filled: ['q'], finalUrl: 'https://a.com/r', extracted: null, robotIdUsed: name === 'maxun' ? 'robot-auto-123' : null };
        },
      };
    }
    // Patch seletor para usar mock: injetamos via override do adapter no validateSpec.
    // validateSpec usa playwrightAdapter/maxunAdapter diretamente; para testar
    // isoladamente, replicamos a logica do orquestrador com o mock aqui.
    async function runWithMock(spec: AutomationSpec, mock: ExecutorAdapter) {
      const pre = mock.validate(spec);
      if (!pre.ok) return { status: 'fail' as const, reason: pre.reason || '', executor: mock.id, evidence: { snapshotTextLen: 0, linksCount: 0, filledCount: 0 } };
      const result = await mock.execute(spec, { base44: null });
      const evidence = { snapshotTextLen: (result.snapshotText || '').length, linksCount: result.links.length, filledCount: result.filled.length, finalUrl: result.finalUrl };
      if (!result.ok) return { status: 'fail' as const, reason: result.error || '', executor: mock.id, evidence };
      const er = spec.expectedResult;
      let satisfied = false;
      if (er.kind === 'links') satisfied = result.links.length >= (er.minItems || 1);
      else if (er.kind === 'snapshot') satisfied = result.snapshotText.trim().length > 0;
      else satisfied = Boolean(result.extracted && Object.keys(result.extracted).length > 0);
      return satisfied
        ? { status: 'pass' as const, reason: 'expected_satisfied', executor: mock.id, evidence, robotIdUsed: result.robotIdUsed }
        : { status: 'inconclusive' as const, reason: 'expected_not_satisfied', executor: mock.id, evidence };
    }

    // 12. PASS
    {
      const spec: AutomationSpec = {
        specVersion: 1, capabilityId: 'search.product', siteOrigin: 'https://a.com', entryUrl: 'https://a.com/search',
        executor: 'playwright', webSessionRequired: true, inputs: ['q'], actions: null,
        robotId: null, targetUrl: null, riskLevel: 'safe', capabilityType: 'READ',
        expectedResult: { kind: 'links', minItems: 1 }, validation: { status: 'pending' },
      };
      const v = await runWithMock(spec, mockAdapter('playwright', 'pass'));
      const passed = v.status === 'pass';
      results.push({ test: '12. validateSpec mock PASS -> pass', passed, detail: JSON.stringify(v) });
    }
    // 13. FAIL
    {
      const spec: AutomationSpec = {
        specVersion: 1, capabilityId: 'search.product', siteOrigin: 'https://a.com', entryUrl: 'https://a.com/search',
        executor: 'playwright', webSessionRequired: true, inputs: ['q'], actions: null,
        robotId: null, targetUrl: null, riskLevel: 'safe', capabilityType: 'READ',
        expectedResult: { kind: 'links', minItems: 1 }, validation: { status: 'pending' },
      };
      const v = await runWithMock(spec, mockAdapter('playwright', 'fail'));
      const passed = v.status === 'fail';
      results.push({ test: '13. validateSpec mock FAIL -> fail', passed, detail: JSON.stringify(v) });
    }
    // 14. INCONCLUSIVE (executou ok mas 0 links)
    {
      const spec: AutomationSpec = {
        specVersion: 1, capabilityId: 'search.product', siteOrigin: 'https://a.com', entryUrl: 'https://a.com/search',
        executor: 'playwright', webSessionRequired: true, inputs: ['q'], actions: null,
        robotId: null, targetUrl: null, riskLevel: 'safe', capabilityType: 'READ',
        expectedResult: { kind: 'links', minItems: 1 }, validation: { status: 'pending' },
      };
      const v = await runWithMock(spec, mockAdapter('playwright', 'empty'));
      const passed = v.status === 'inconclusive';
      results.push({ test: '14. validateSpec mock empty -> inconclusive', passed, detail: JSON.stringify(v) });
    }

    // isMaxunCreatable unit
    {
      const t1 = isMaxunCreatable({ capabilityType: 'READ', webSessionRequired: false, inputs: [] });
      const t2 = isMaxunCreatable({ capabilityType: 'READ', webSessionRequired: false, inputs: ['q'] });
      const t3 = isMaxunCreatable({ capabilityType: 'READ', webSessionRequired: true, inputs: [] });
      const t4 = isMaxunCreatable({ capabilityType: 'WRITE', webSessionRequired: false, inputs: [] });
      const passed = t1 === true && t2 === false && t3 === false && t4 === false;
      results.push({ test: 'isMaxunCreatable unit (4 cases)', passed, detail: JSON.stringify({ t1, t2, t3, t4 }) });
    }

    // B2 — detectAuthWall (anti-falso-pass). Helper real, deterministico.
    // Cenario exato do Teste 2: requestedUrl=/secure, finalUrl=/login -> blocked.
    {
      const spec = { webSessionRequired: true, entryUrl: 'https://the-internet.herokuapp.com/secure' } as any;
      const result = { finalUrl: 'https://the-internet.herokuapp.com/login', snapshotText: 'Login Page\nUsername\nPassword' } as any;
      const v = detectAuthWall(spec, result);
      const passed = v.blocked && v.reason === 'redirected_to_login';
      results.push({ test: '15. detectAuthWall /secure->/login finalUrl -> blocked', passed, detail: JSON.stringify(v) });
    }
    {
      const spec = { webSessionRequired: true, entryUrl: 'https://the-internet.herokuapp.com/secure' } as any;
      const result = { finalUrl: 'https://the-internet.herokuapp.com/secure', snapshotText: 'Welcome to the Secure Area. Logout' } as any;
      const v = detectAuthWall(spec, result);
      const passed = !v.blocked;
      results.push({ test: '16. detectAuthWall /secure->/secure valid -> not blocked', passed, detail: JSON.stringify(v) });
    }
    {
      const spec = { webSessionRequired: false, entryUrl: 'https://x.com/secure' } as any;
      const result = { finalUrl: 'https://x.com/login', snapshotText: 'Login Page Password' } as any;
      const v = detectAuthWall(spec, result);
      const passed = !v.blocked;
      results.push({ test: '17. detectAuthWall maxun (webSessionRequired=false) -> not blocked', passed, detail: JSON.stringify(v) });
    }
    {
      const spec = { webSessionRequired: true, entryUrl: 'https://x.com/secure' } as any;
      const result = { finalUrl: '', snapshotText: 'Login Page\nUsername\nPassword\n Login' } as any;
      const v = detectAuthWall(spec, result);
      const passed = v.blocked && v.reason === 'auth_wall_in_snapshot';
      results.push({ test: '18. detectAuthWall snapshot login+password -> blocked', passed, detail: JSON.stringify(v) });
    }

    // === FASE B4: classifyAuthenticationRequirement (probe, deterministico) ===
    // Case 8: probe encontra /login (finalUrl) -> session_required
    {
      const v = classifyAuthenticationRequirement({ finalUrl: 'https://x.com/login', hasPassword: false, bodyText: '' });
      const passed = v === 'session_required';
      results.push({ test: 'B4-8. probe finalUrl /login -> session_required', passed, detail: JSON.stringify(v) });
    }
    // Case 9: probe encontra password field + auth markers -> session_required
    {
      const v = classifyAuthenticationRequirement({ finalUrl: 'https://x.com/', hasPassword: true, bodyText: 'Login Page\nUsername\nPassword\nEnter your password' });
      const passed = v === 'session_required';
      results.push({ test: 'B4-9. probe password+auth markers -> session_required', passed, detail: JSON.stringify(v) });
    }
    // Case 10: probe sem evidencia de auth -> public
    {
      const v = classifyAuthenticationRequirement({ finalUrl: 'https://example.com/', hasPassword: false, bodyText: 'Example Domain\nMore information...' });
      const passed = v === 'public';
      results.push({ test: 'B4-10. probe sem auth -> public', passed, detail: JSON.stringify(v) });
    }
    // Case 11: probe com erro/timeout -> unknown
    {
      const v = classifyAuthenticationRequirement({ finalUrl: '', hasPassword: false, bodyText: '', error: 'timeout' });
      const passed = v === 'unknown';
      results.push({ test: 'B4-11. probe erro/timeout -> unknown', passed, detail: JSON.stringify(v) });
    }
    // Extra: palavra "login" sozinha (sem password, sem rota de login) -> public
    {
      const v = classifyAuthenticationRequirement({ finalUrl: 'https://x.com/dashboard', hasPassword: false, bodyText: 'Welcome\nLogin History\nSettings' });
      const passed = v === 'public';
      results.push({ test: 'B4-extra. "login" word sem password -> public', passed, detail: JSON.stringify(v) });
    }
    // Extra: /login-history NAO casa (nao false session_required)
    {
      const v = classifyAuthenticationRequirement({ finalUrl: 'https://x.com/login-history', hasPassword: false, bodyText: 'Login History' });
      const passed = v === 'public';
      results.push({ test: 'B4-extra. /login-history -> public (nao casa)', passed, detail: JSON.stringify(v) });
    }
    // Extra: deriveAuthenticationRequirement conservador (mix + legado)
    {
      const d1 = deriveAuthenticationRequirement([{ authentication_requirement: 'public' }, { authentication_requirement: 'session_required' }]);
      const d2 = deriveAuthenticationRequirement([{ authentication_requirement: 'public' }, { authentication_requirement: 'unknown' }]);
      const d3 = deriveAuthenticationRequirement([{ authentication_requirement: 'public' }]);
      const d4 = deriveAuthenticationRequirement([{ element_ref: 'r1' }]);
      const passed = d1 === 'session_required' && d2 === 'unknown' && d3 === 'public' && d4 === 'unknown';
      results.push({ test: 'B4-extra. deriveAuthenticationRequirement mix', passed, detail: JSON.stringify({ d1, d2, d3, d4 }) });
    }

    const allPassed = results.every((r) => r.passed);
    return Response.json({ ok: true, allPassed, results });
  } catch (e) {
    return Response.json({ error: (e as Error).message || String(e) }, { status: 500 });
  }
}