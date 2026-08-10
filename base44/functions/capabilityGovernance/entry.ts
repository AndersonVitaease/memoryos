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
