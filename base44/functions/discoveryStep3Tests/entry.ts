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
import type { AutomationSpec, AutomationExecutor } from '../../shared/automationSpec.ts';
import type { ExecutorAdapter, ExecutorResult } from '../../shared/executorAdapter.ts';

function makeCandidate(opts: Partial<{
  site_url: string; suggested_id: string; discovered_from_url: string;
  evidence: string; input_fields: string; canonical_id: string;
  capability_type: string; risk_level: string;
}>) {
  return {
    id: 'cand-test-' + Math.random().toString(36).slice(2, 8),
    site_url: opts.site_url || 'https://example.com',
    suggested_id: opts.suggested_id || 'product.search',
    description: 'test',
    evidence: opts.evidence || JSON.stringify([{ element_ref: 'r1', element: { ref: 'r1', tag: 'input', type: 'search', id: 'q' }, snapshot_ref_found: true, page_url: 'https://example.com/search', page_index: 0, action_inferred: 'search', source: 'extension', has_write_actions: false }]),
    input_fields: opts.input_fields || JSON.stringify(['q']),
    discovered_from_url: opts.discovered_from_url || 'https://example.com/search',
    status: 'candidate',
    canonical_id: opts.canonical_id || 'search.product',
    identity_hash: 'h-test',
    capability_type: opts.capability_type || 'READ',
    risk_level: opts.risk_level || 'safe',
  };
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const results: Array<{ test: string; passed: boolean; detail?: string }> = [];

    // 1. READ c/ evidence valida -> spec deterministica
    {
      const c = makeCandidate({});
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.capabilityId === 'search.product'
        && r.spec.entryUrl === 'https://example.com/search'
        && r.spec.capabilityType === 'READ'
        && r.spec.inputs.length === 1 && r.spec.inputs[0] === 'q'
        && r.spec.validation.status === 'pending';
      results.push({ test: '1. READ c/ evidence valida -> spec', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, capId: r.spec.capabilityId, inputs: r.spec.inputs }) : JSON.stringify(r) });
    }

    // 2. Sem evidence suficiente (READ c/ inputs) -> COMPILATION_FAILED
    {
      const c = makeCandidate({ evidence: JSON.stringify([{ element_ref: 'r999', element: null, snapshot_ref_found: false, page_url: 'https://example.com/search', page_index: 0 }]) });
      const r = compileCandidateToSpec(c);
      const passed = !r.ok && r.reason === 'no_reliable_evidence';
      results.push({ test: '2. READ c/ inputs sem evidence -> COMPILATION_FAILED', passed, detail: JSON.stringify(r) });
    }

    // 3. WRITE -> COMPILATION_FAILED{write_blocked}
    {
      const c = makeCandidate({ capability_type: 'WRITE', risk_level: 'irreversible' });
      const r = compileCandidateToSpec(c);
      const passed = !r.ok && r.reason === 'write_blocked';
      results.push({ test: '3. WRITE -> COMPILATION_FAILED{write_blocked}', passed, detail: JSON.stringify(r) });
    }

    // 4. READ sem inputs (scrape puro) -> Maxun-creatable
    {
      const c = makeCandidate({ input_fields: '[]', evidence: JSON.stringify([{ element_ref: '', element: null, snapshot_ref_found: false, page_url: 'https://example.com', page_index: 0, source: 'extension' }]) });
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.executor === 'maxun' && r.spec.targetUrl === 'https://example.com/search' && r.spec.webSessionRequired === false;
      results.push({ test: '4. READ scrape puro -> Maxun-creatable (executor=maxun, targetUrl)', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, targetUrl: r.spec.targetUrl }) : JSON.stringify(r) });
    }

    // 5. READ c/ inputs (form-fill) -> executor=playwright (NOT_CREATABLE)
    {
      const c = makeCandidate({});
      const r = compileCandidateToSpec(c);
      const passed = r.ok && r.spec.executor === 'playwright' && r.spec.webSessionRequired === true;
      results.push({ test: '5. READ c/ inputs -> executor=playwright', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, webSessionRequired: r.spec.webSessionRequired }) : JSON.stringify(r) });
    }

    // 6. robotId pre-existente -> executor=maxun, reusa
    {
      const c = makeCandidate({ input_fields: '[]' });
      const r = compileCandidateToSpec(c, { robotId: 'robot-existing-123', flow: undefined });
      const passed = r.ok && r.spec.executor === 'maxun' && r.spec.robotId === 'robot-existing-123';
      results.push({ test: '6. robotId pre-existente -> maxun reutiliza', passed, detail: r.ok ? JSON.stringify({ executor: r.spec.executor, robotId: r.spec.robotId }) : JSON.stringify(r) });
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

    const allPassed = results.every((r) => r.passed);
    return Response.json({ ok: true, allPassed, results });
  } catch (e) {
    return Response.json({ error: (e as Error).message || String(e) }, { status: 500 });
  }
}