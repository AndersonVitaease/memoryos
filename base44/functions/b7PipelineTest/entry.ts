/**
 * b7PipelineTest — Harness de teste end-to-end da FASE B7.
 *
 * Prova o PIPELINE COMPLETO sem chamar webConnectorConnect diretamente e sem
 * promover/persistir nada em CapabilityMap/CapabilityCandidate:
 *
 *   Discovery(probe real) -> classificacao public/auth
 *   -> compileCandidateToSpec (AutomationSpec)
 *   -> validateSpec (selectExecutor + adapter.execute -> webConnectorConnect)
 *   -> checkExpectedResult -> PASS/FAIL
 *
 * Reutiliza os modulos compartilhados existentes (automationCompiler +
 * capabilityValidator + playwrightAdapter via validateSpec). NAO e um novo
 * sistema de execucao — e um orquestrador fino sobre o pipeline ja existente.
 * O CapabilityCandidate e sintetico e EM MEMORIA (nunca persistido).
 *
 * Operations:
 *   run { url, inputFields, inputs?, webSessionId? } -> classificacao + spec + validation
 *
 * Uso:
 *   - Publico:  { url: 'https://en.wikipedia.org', inputFields: ['search'], inputs: { search: 'Albert Einstein' } }
 *   - Autenticado: { url: 'https://the-internet.herokuapp.com/secure', inputFields: [], webSessionId: '<id>' }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { compileCandidateToSpec } from '../../shared/automationCompiler.ts';
import { validateSpec } from '../../shared/capabilityValidator.ts';

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { url, inputFields, inputs, webSessionId } = body;
    if (!url || typeof url !== 'string') return Response.json({ error: 'Missing required field: url' }, { status: 400 });
    if (!Array.isArray(inputFields)) return Response.json({ error: 'Missing required field: inputFields (array)' }, { status: 400 });

    // 1. Discovery probe REAL — classifica a URL como public/session_required/unknown.
    //    Reutiliza o mecanismo B4 existente (webConnectorDiscover.probe).
    let probeRes: any = null;
    try {
      probeRes = await base44.functions.invoke('webConnectorDiscover', { operation: 'probe', url });
    } catch (e) {
      return Response.json({ ok: false, stage: 'probe', error: String((e as any)?.message || e) }, { status: 502 });
    }
    const pd = probeRes?.data ?? probeRes;
    const authReq: string = (pd && typeof pd.authentication_requirement === 'string') ? pd.authentication_requirement : 'unknown';

    // 2. CapabilityCandidate SINTETICO em memoria (nao persistido). A evidence
    //    carrega a classificacao real do probe — exatamente como o Discovery
    //    real grava em saveDiscoveryCandidates.
    const firstField = inputFields.length > 0 ? String(inputFields[0]) : 'q';
    const candidate = {
      id: 'b7-test-' + Date.now().toString(36),
      site_url: url,
      suggested_id: 'search.test',
      description: 'B7 pipeline test (synthetic, not persisted)',
      evidence: JSON.stringify([{
        element_ref: 'r1',
        element: { ref: 'r1', tag: 'input', type: 'search', id: firstField },
        snapshot_ref_found: true,
        page_url: url,
        page_index: 0,
        action_inferred: 'search',
        source: 'headless',
        has_write_actions: false,
        authentication_requirement: authReq,
      }]),
      input_fields: JSON.stringify(inputFields),
      discovered_from_url: url,
      status: 'candidate',
      canonical_id: 'search.test',
      identity_hash: 'b7-' + url,
      capability_type: 'READ',
      risk_level: 'safe',
      web_session_id: webSessionId || null,
    };

    // 3. Compile -> AutomationSpec (Compiler real).
    const compilation = compileCandidateToSpec(candidate as any);
    if (!compilation.ok) {
      return Response.json({
        ok: false, stage: 'compile', authReq,
        reason: compilation.reason, detail: (compilation as any).detail || null,
      }, { status: 422 });
    }
    const spec = compilation.spec;

    // 4. selectExecutor + adapter.execute + checkExpectedResult (validateSpec real).
    //    playwrightAdapter.execute -> webConnectorConnect (sem chamada direta nossa).
    const validation = await validateSpec(spec, {
      base44,
      webSessionId: webSessionId || null,
      inputs: (inputs && typeof inputs === 'object' && !Array.isArray(inputs)) ? inputs : {},
      executionId: 'b7-' + Date.now(),
    });

    return Response.json({
      ok: validation.status === 'pass',
      stage: 'validate',
      authReq,
      spec: {
        executor: spec.executor,
        webSessionRequired: spec.webSessionRequired,
        inputs: spec.inputs,
        capabilityType: spec.capabilityType,
        riskLevel: spec.riskLevel,
        expectedResult: spec.expectedResult,
      },
      validation: {
        status: validation.status,
        reason: validation.reason,
        executor: validation.executor,
        evidence: validation.evidence,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as any)?.message || String(e) }, { status: 500 });
  }
}