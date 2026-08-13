/**
 * maxunImport — Importa um WorkflowFile do Maxun como capability do MemoryOS.
 *
 * MAXUN = RECORDER. Esta funcao NAO executa nada. Recebe o WorkflowFile
 * {meta, workflow} gravado no Maxun, sanitiza, extrai parametros ($param),
 * e faz upsert em CapabilityMap.capabilities[] (campo flow). O Web Connector
 * existente permanece o executor na WebSession autenticada do usuario.
 *
 * Seguranca: admin-only (mesmo padrao de capabilityGovernance). Sanitiza
 * removendo where.cookies e promptLlmApiKey; converte valores 'type'
 * (texto digitado, cifrado pelo Maxun) em $param. NAO importa tokens
 * Google/Airtable/cookies de sessao — o WorkflowFile nao os carrega (ficam
 * em colunas separadas no Maxun).
 *
 * Operations:
 *   importWorkflow { workflowFile, capabilityId?, description? } -> upsert CapabilityMap
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

function collectParams(value, params) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && '$param' in value && typeof value['$param'] === 'string') {
    params.add(value['$param']);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectParams(v, params);
  } else {
    for (const v of Object.values(value)) collectParams(v, params);
  }
}

function sanitizeAction(action, idx) {
  if (!action || typeof action !== 'object') return action;
  const out = { ...action };
  // Maxun cifra args[1] de 'type' (texto digitado) — indecifravel aqui.
  // Converte em $param para o usuario fornecer em runtime via WebSession.
  if (out.action === 'type' && Array.isArray(out.args) && typeof out.args[1] === 'string') {
    const pname = out.name || out.actionId || ('input_' + idx);
    out.args = [out.args[0], { $param: pname }, ...out.args.slice(2)];
  }
  return out;
}

function sanitizeWorkflow(workflow) {
  const out = [];
  for (const pair of workflow) {
    if (!pair || typeof pair !== 'object' || !Array.isArray(pair.what)) continue;
    const where = pair.where && typeof pair.where === 'object' ? { ...pair.where } : {};
    delete where.cookies; // nunca persistir cookies de sessao
    const what = pair.what.map(sanitizeAction).filter(Boolean);
    out.push({ where, what });
  }
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem importar workflows do Maxun.' }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { operation } = body;
    if (!operation) return Response.json({ error: 'Missing required field: operation' }, { status: 400 });

    if (operation === 'importWorkflow') {
      const { workflowFile, capabilityId, description } = body;
      if (!workflowFile || typeof workflowFile !== 'object') {
        return Response.json({ error: 'Missing required field: workflowFile' }, { status: 400 });
      }
      const { meta, workflow } = workflowFile;
      if (!meta || typeof meta !== 'object') return Response.json({ error: 'workflowFile.meta is required' }, { status: 400 });
      if (!Array.isArray(workflow)) return Response.json({ error: 'workflowFile.workflow must be an array of WhereWhatPair' }, { status: 400 });

      const cleanMeta = { ...meta };
      delete cleanMeta.promptLlmApiKey; // nunca persistir

      let siteUrl = '';
      if (typeof cleanMeta.url === 'string' && cleanMeta.url.trim()) {
        siteUrl = cleanMeta.url.trim();
      } else {
        const firstUrlPair = workflow.find((p) => p && p.where && typeof p.where.url === 'string' && p.where.url.trim());
        if (firstUrlPair) siteUrl = firstUrlPair.where.url.trim();
      }
      if (!siteUrl) return Response.json({ error: 'Cannot determine site_url (meta.url or a pair where.url required)' }, { status: 400 });

      const flow = sanitizeWorkflow(workflow);
      if (flow.length === 0) return Response.json({ error: 'Workflow has no valid WhereWhatPair entries' }, { status: 400 });

      // Extrai params ($param) do workflow sanitizado
      const paramSet = new Set();
      collectParams(flow, paramSet);
      const properties = {};
      for (const p of paramSet) properties[p] = { type: 'string' };

      const cap = {
        id: (typeof capabilityId === 'string' && capabilityId.trim()) || (typeof cleanMeta.name === 'string' && cleanMeta.name) || ('maxun-' + Date.now()),
        description: (typeof description === 'string' && description) || (typeof cleanMeta.desc === 'string' && cleanMeta.desc) || (typeof cleanMeta.name === 'string' && cleanMeta.name) || '',
        site_url: siteUrl,
        inputSchema: { type: 'object', properties },
        flow,
        discoveredFrom: siteUrl,
      };

      // Upsert em CapabilityMap (match por site_url)
      const existing = await base44.asServiceRole.entities.CapabilityMap.filter({ site_url: siteUrl });
      if (existing.length > 0) {
        const map = existing[0];
        let caps = [];
        try { caps = JSON.parse(map.capabilities || '[]'); } catch { caps = []; }
        if (!Array.isArray(caps)) caps = [];
        const idx = caps.findIndex((c) => c && c.id === cap.id);
        if (idx >= 0) caps[idx] = cap; else caps.push(cap);
        await base44.asServiceRole.entities.CapabilityMap.update(map.id, {
          capabilities: JSON.stringify(caps),
          version: (map.version || 1) + 1,
          last_validated_at: new Date().toISOString(),
        });
        return Response.json({ ok: true, capability: cap, capabilityMapId: map.id, action: idx >= 0 ? 'updated' : 'added' });
      } else {
        const map = await base44.asServiceRole.entities.CapabilityMap.create({
          site_url: siteUrl,
          site_name: cleanMeta.name || '',
          capabilities: JSON.stringify([cap]),
          version: 1,
          last_validated_at: new Date().toISOString(),
        });
        return Response.json({ ok: true, capability: cap, capabilityMapId: map.id, action: 'created' });
      }
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}