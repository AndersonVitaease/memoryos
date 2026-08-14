/**
 * capabilityGovernance — Governanca de CapabilityCandidate/CapabilityMap.
 *
 * Motivacao (2026-08-10): antes, QUALQUER usuario autenticado que usasse o
 * Web Connector podia clicar "Validar" e promover um candidato pra
 * CapabilityMap — que e GLOBAL e COMPARTILHADO entre todos os usuarios do
 * app (base44.entities.CapabilityMap.read RLS = {} = sem restricao). Isso
 * significa que qualquer usuario, mesmo sem ma intencao, podia introduzir
 * uma capability incorreta/insegura que passaria a valer pra todo mundo,
 * sem nenhuma aprovacao do administrador.
 *
 * Esta function centraliza a decisao: SOMENTE usuarios com role=admin podem
 * validar ou rejeitar candidatos. Usa asServiceRole pra (a) enxergar
 * candidatos de TODOS os usuarios (a RLS nativa de CapabilityCandidate
 * restringe leitura ao proprio criador) e (b) escrever em CapabilityMap
 * mesmo que o usuario admin nao seja o "created_by_id" original do registro.
 *
 * Operations:
 *   listAllCandidates { siteUrl? }               -> (admin only) lista candidatos de TODOS os usuarios, opcionalmente filtrado por site
 *   validate          { candidateId }            -> (admin only) promove candidato pra CapabilityMap
 *   reject            { candidateId, reason? }   -> (admin only) marca candidato como rejeitado
 *
 * IMPORTANTE: isto e defesa em profundidade a nivel de APLICACAO. A RLS
 * nativa das entidades (CapabilityMap.update ainda permite created_by_id
 * proprio, nao apenas admin) NAO foi alterada porque a ferramenta de
 * schema exigiu uma aprovacao manual na UI do Base44 que nao pude
 * completar remotamente. Recomendo fortemente aplicar essa trava na UI do
 * Base44 tambem (Data > CapabilityMap > Security) pra fechar o buraco por
 * completo — ver SESSION doc de 2026-08-10 sobre governanca de capabilities.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem gerenciar capabilities validadas.' }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { operation } = body;
    if (!operation) return Response.json({ error: 'Missing required field: operation' }, { status: 400 });

    // ── operation: listAllCandidates ────────────────────────────────
    if (operation === 'listAllCandidates') {
      const { siteUrl } = body;
      const query = siteUrl ? { site_url: siteUrl } : {};
      const candidates = await base44.asServiceRole.entities.CapabilityCandidate.filter(query, '-created_date', 200);
      return Response.json({ ok: true, candidates: candidates || [] });
    }

    // ── operation: validate ─────────────────────────────────────────
    if (operation === 'validate') {
      const { candidateId } = body;
      if (!candidateId) return Response.json({ error: 'Missing required field: candidateId' }, { status: 400 });

      const cand = await base44.asServiceRole.entities.CapabilityCandidate.get(candidateId);
      if (!cand) return Response.json({ error: 'Candidate not found' }, { status: 404 });

      let fields = [];
      try { fields = JSON.parse(cand.input_fields || '[]'); } catch (e) { fields = []; }
      const props = {};
      (Array.isArray(fields) ? fields : []).forEach((f) => { props[f] = { type: 'string' }; });
      const capObj = {
        id: cand.suggested_id,
        description: cand.description || '',
        inputSchema: { type: 'object', properties: props },
        discoveredFrom: cand.discovered_from_url || '',
      };

      const existing = await base44.asServiceRole.entities.CapabilityMap.filter({ site_url: cand.site_url });
      if (existing.length > 0) {
        const map = existing[0];
        let caps = [];
        try { caps = JSON.parse(map.capabilities || '[]'); } catch (e) { caps = []; }
        if (!Array.isArray(caps)) caps = [];
        if (!caps.find((x) => x.id === capObj.id)) caps.push(capObj);
        await base44.asServiceRole.entities.CapabilityMap.update(map.id, {
          capabilities: JSON.stringify(caps),
          last_validated_at: new Date().toISOString(),
        });
      } else {
        await base44.asServiceRole.entities.CapabilityMap.create({
          site_url: cand.site_url,
          capabilities: JSON.stringify([capObj]),
          last_validated_at: new Date().toISOString(),
        });
      }

      await base44.asServiceRole.entities.CapabilityCandidate.update(cand.id, {
        status: 'validated',
        validation_notes: `Validado por administrador (${user.email}) via capabilityGovernance.`,
      });

      return Response.json({ ok: true, candidateId: cand.id, status: 'validated' });
    }

    // ── operation: validateWithExecution (FASE 6) ────────────────────
    // Promove Candidate -> CapabilityMap SOMENTE apos:
    //   compileCandidateToSpec -> validateSpec (execucao controlada) -> PASS.
    // Persiste automation (executor/robotId/flow/...) na cap promovida.
    // Admin-only (mesma governanca). `validate` legado permanece intacto.
    if (operation === 'validateWithExecution') {
      const { candidateId, webSessionId, testInputs } = body;
      if (!candidateId) return Response.json({ error: 'Missing required field: candidateId' }, { status: 400 });

      const cand = await base44.asServiceRole.entities.CapabilityCandidate.get(candidateId);
      if (!cand) return Response.json({ error: 'Candidate not found' }, { status: 404 });

      // Marca em validacao (estado existente no enum, ate aqui inerte).
      try {
        await base44.asServiceRole.entities.CapabilityCandidate.update(cand.id, { status: 'validating' });
      } catch { /* best-effort */ }

      // 1. Resolve robot associado pre-existente (capability do CapabilityMap
      //    que ja tenha provider=maxun+robotId para este site+capabilityId).
      let associatedRobot: { robotId: string; flow?: unknown[] } | null = null;
      try {
        const maps = await base44.asServiceRole.entities.CapabilityMap.filter({ site_url: cand.site_url });
        if (maps && maps.length > 0) {
          let caps: any[] = [];
          try { caps = JSON.parse(maps[0].capabilities || '[]'); } catch { caps = []; }
          const capObj = caps.find((c) => c && c.id === (cand.canonical_id || cand.suggested_id));
          if (capObj && capObj.provider === 'maxun' && typeof capObj.robotId === 'string' && capObj.robotId) {
            associatedRobot = { robotId: capObj.robotId, flow: Array.isArray(capObj.flow) ? capObj.flow : undefined };
          }
        }
      } catch { /* best-effort */ }

      // 2. Compila Candidate -> AutomationSpec.
      const { compileCandidateToSpec } = await import('../../shared/automationCompiler.ts');
      const compilation = compileCandidateToSpec({
        id: cand.id, site_url: cand.site_url, suggested_id: cand.suggested_id,
        description: cand.description, evidence: cand.evidence, input_fields: cand.input_fields,
        discovered_from_url: cand.discovered_from_url, status: cand.status,
        canonical_id: cand.canonical_id, identity_hash: cand.identity_hash,
        capability_type: cand.capability_type, risk_level: cand.risk_level,
        web_session_id: cand.web_session_id,
      }, associatedRobot);
      if (!compilation.ok) {
        await base44.asServiceRole.entities.CapabilityCandidate.update(cand.id, {
          status: 'rejected',
          rejected_reason: 'COMPILATION_FAILED: ' + compilation.reason,
          validation_notes: JSON.stringify(compilation),
        }).catch(() => {});
        return Response.json({ ok: false, status: 'compilation_failed', reason: compilation.reason, detail: (compilation as any).detail || null }, { status: 422 });
      }
      const spec = compilation.spec;

      // 3. Valida (execucao controlada). ctx.base44 injetado para os adapters.
      const { validateSpec } = await import('../../shared/capabilityValidator.ts');
      const validation = await validateSpec(spec, {
        base44,
        webSessionId: typeof webSessionId === 'string' ? webSessionId : null,
        inputs: (testInputs && typeof testInputs === 'object' && !Array.isArray(testInputs)) ? testInputs : {},
        executionId: 'validate-' + cand.id,
      });

      // 4. Somente PASS promove. FAIL/INCONCLUSIVE registrados, nao promovem.
      if (validation.status !== 'pass') {
        await base44.asServiceRole.entities.CapabilityCandidate.update(cand.id, {
          status: validation.status === 'fail' ? 'rejected' : 'candidate',
          validation_notes: `Validacao por execucao: ${validation.status} (${validation.reason}). Executor: ${validation.executor || 'n/a'}.`,
        }).catch(() => {});
        return Response.json({
          ok: false, status: validation.status, reason: validation.reason,
          executor: validation.executor, evidence: validation.evidence,
          spec: { executor: spec.executor, robotId: spec.robotId, targetUrl: spec.targetUrl, webSessionRequired: spec.webSessionRequired },
        }, { status: 422 });
      }

      // 5. Promove para CapabilityMap preservando campos atuais + automation.
      const robotIdToPersist = validation.robotIdUsed || spec.robotId || null;
      const automation = {
        executor: spec.executor,
        webSessionRequired: spec.webSessionRequired,
        specVersion: spec.specVersion,
        actions: spec.actions,
        robotId: robotIdToPersist,
        targetUrl: spec.targetUrl,
        riskLevel: spec.riskLevel,
        capabilityType: spec.capabilityType,
      };
      const fields: string[] = (() => { try { const p = JSON.parse(cand.input_fields || '[]'); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } })();
      const props: Record<string, { type: string }> = {};
      fields.forEach((f) => { props[f] = { type: 'string' }; });
      const capObj = {
        id: cand.canonical_id || cand.suggested_id,
        description: cand.description || '',
        inputSchema: { type: 'object', properties: props },
        discoveredFrom: cand.discovered_from_url || '',
        automation,
        // Compatibilidade legada: provider/robotId/flow no nivel da cap (lidos
        // pelo WebSiteIntentResolver pickSearchCapabilityWithMaxun e branch
        // early do webConnectorConnect). Capabilities sem automation continuam
        // funcionando pelo caminho legado.
        ...(spec.executor === 'maxun' && robotIdToPersist ? { provider: 'maxun', robotId: robotIdToPersist } : {}),
        ...(Array.isArray(spec.actions) && spec.actions.length > 0 ? { flow: spec.actions } : {}),
      };

      const existing = await base44.asServiceRole.entities.CapabilityMap.filter({ site_url: cand.site_url });
      let action = 'created';
      if (existing.length > 0) {
        const map = existing[0];
        let caps: any[] = [];
        try { caps = JSON.parse(map.capabilities || '[]'); } catch { caps = []; }
        if (!Array.isArray(caps)) caps = [];
        const idx = caps.findIndex((c) => c && c.id === capObj.id);
        if (idx >= 0) { caps[idx] = capObj; action = 'updated'; } else { caps.push(capObj); action = 'added'; }
        await base44.asServiceRole.entities.CapabilityMap.update(map.id, {
          capabilities: JSON.stringify(caps),
          version: (map.version || 1) + 1,
          last_validated_at: new Date().toISOString(),
        });
      } else {
        await base44.asServiceRole.entities.CapabilityMap.create({
          site_url: cand.site_url,
          site_name: cand.site_name || '',
          capabilities: JSON.stringify([capObj]),
          version: 1,
          last_validated_at: new Date().toISOString(),
        });
      }

      await base44.asServiceRole.entities.CapabilityCandidate.update(cand.id, {
        status: 'validated',
        validation_notes: `Validado por execucao (admin ${user.email}): PASS via ${validation.executor}. Robot: ${robotIdToPersist || 'n/a'}.`,
      });

      return Response.json({
        ok: true, candidateId: cand.id, status: 'validated',
        executor: spec.executor, robotId: robotIdToPersist, targetUrl: spec.targetUrl,
        automation, action, validationEvidence: validation.evidence,
      });
    }

    // ── operation: reject ───────────────────────────────────────────
    if (operation === 'reject') {
      const { candidateId, reason } = body;
      if (!candidateId) return Response.json({ error: 'Missing required field: candidateId' }, { status: 400 });

      const cand = await base44.asServiceRole.entities.CapabilityCandidate.get(candidateId);
      if (!cand) return Response.json({ error: 'Candidate not found' }, { status: 404 });

      await base44.asServiceRole.entities.CapabilityCandidate.update(candidateId, {
        status: 'rejected',
        rejected_reason: reason || `Rejeitado por administrador (${user.email}).`,
      });

      return Response.json({ ok: true, candidateId, status: 'rejected' });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}