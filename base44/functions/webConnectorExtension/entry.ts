/**
 * webConnectorExtension — Backend da Extensao Chrome (Fase 5: Multi-Workspace).
 *
 * SEGURANCA FASE 5: toda operacao resolve userId+workspaceId server-side a partir
 * do token autenticado. Nenhum valor de identidade enviado pela extensao
 * (bridgeId, workspaceId, browserSessionId) e confiado cegamente — todos sao
 * validados contra registros server-side (WebBridge, WebSession, WorkspaceMember).
 *
 * Operacoes:
 *   registerBridge      { extensionVersion? }   -> emite bridge_id, registra WebBridge(user, workspace, online)
 *   heartbeatBridge     { bridgeId }            -> atualiza last_seen_at + status=online
 *   registerSession     { siteUrl, siteName?, tabId, bridgeId, browserSessionId } -> cria WebSession ativa vinculada a bridge
 *   heartbeat           { webSessionId }       -> atualiza last_used_at (mantem viva)
 *   revoke              { webSessionId }        -> marca revoked
 *   submitSnapshot      { webSessionId, ... }   -> descoberta (LLM) — valida sessao ativa do caller
 *   listCapabilities    { webSessionId }       -> lista capabilities validadas do site
 *   recordExecution     { webSessionId, ... }   -> registra evento de execucao (auditoria)
 *   pollTasks           { bridgeId, webSessionIds? } -> valida bridge online + claim ATOMICO por tarefa
 *   completeTask        { bridgeId, requestId, result?, error? } -> valida bridge autorizada + persiste via conversationContext
 *   listActiveSessions  { }                    -> sessoes ativas do caller NO WORKSPACE ATIVO apenas
 *
 * Importacao de helpers compartilhados (webDiscovery) preservada.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildDiscoveryPrompt, DISCOVERY_LLM_SCHEMA, saveDiscoveryCandidates, parseDiscoveryLLMResult } from '../../shared/webDiscovery.ts';
import { withTimeout } from '../../shared/mcpHelpers.ts';
import { assertWorkspaceMember } from '../../shared/workspaceAuth.ts';

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const BRIDGE_ONLINE_TIMEOUT_MS = 2 * 60 * 1000; // sem heartbeat por 2min = offline

function makeBridgeId() {
  return 'bridge-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { operation } = body;
    if (!operation) return Response.json({ error: 'Missing required field: operation' }, { status: 400 });

    // Resolve workspace ativo server-side (nao confia no frontend)
    const fullUser = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
    const activeWsId = (fullUser as any)?.active_workspace_id || null;
    if (!activeWsId) {
      return Response.json({ error: 'Nenhum workspace ativo. Selecione um workspace antes de usar o Web Connector.' }, { status: 400 });
    }
    const { role } = await assertWorkspaceMember(base44, user.id, activeWsId);

    // ── operation: registerBridge ────────────────────────────────────
    // Emite um bridge_id estavel para esta instancia da extensao. Se a extensao
    // ja tem um bridge_id (chrome.storage.local) e ele bate com user+workspace,
    // revalida (status=online, last_seen_at=now) e devolve o mesmo. Se nao tem
    // ou o bridge_id nao bate com este user/workspace, emite um NOVO bridge_id.
    // Resultado: reinstalacao da extensao (storage local apagado) sempre gera
    // bridge novo — nunca herda a identidade de uma instalacao anterior.
    if (operation === 'registerBridge') {
      const claimedBridgeId = typeof body.bridgeId === 'string' ? body.bridgeId.trim() : '';
      const extensionVersion = typeof body.extensionVersion === 'string' ? body.extensionVersion : '';
      const now = new Date().toISOString();

      // Tenta revalidar um bridge_id reclamado pela extensao (se existir E for deste user+workspace)
      if (claimedBridgeId) {
        const existing = await base44.asServiceRole.entities.WebBridge.filter({
          bridge_id: claimedBridgeId, user_id: user.id, workspace_id: activeWsId,
        });
        if (existing.length > 0) {
          const bridge = existing[0];
          await base44.asServiceRole.entities.WebBridge.update(bridge.id, {
            status: 'online', last_seen_at: now, extension_version: extensionVersion || bridge.extension_version,
          }).catch(() => {});
          return Response.json({ ok: true, bridgeId: bridge.bridge_id, status: 'online', workspaceId: activeWsId, revalidated: true });
        }
        // bridgeId existe mas nao bate com (user, workspace) — nao reusa: emite novo
      }

      // Emite novo bridge_id
      const bridgeId = makeBridgeId();
      const bridge = await base44.asServiceRole.entities.WebBridge.create({
        bridge_id: bridgeId,
        user_id: user.id,
        workspace_id: activeWsId,
        status: 'online',
        last_seen_at: now,
        extension_version: extensionVersion,
        registered_at: now,
      });
      return Response.json({ ok: true, bridgeId: bridge.bridge_id, status: 'online', workspaceId: activeWsId, revalidated: false });
    }

    // ── operation: heartbeatBridge ────────────────────────────────────
    if (operation === 'heartbeatBridge') {
      const { bridgeId } = body;
      if (!bridgeId) return Response.json({ error: 'Missing required field: bridgeId' }, { status: 400 });
      const bridges = await base44.asServiceRole.entities.WebBridge.filter({ bridge_id: bridgeId, user_id: user.id });
      if (!bridges || bridges.length === 0) return Response.json({ error: 'WebBridge not found for this user' }, { status: 404 });
      const bridge = bridges[0];
      if (bridge.workspace_id !== activeWsId) {
        return Response.json({ error: 'WebBridge pertence a outro workspace' }, { status: 403 });
      }
      await base44.asServiceRole.entities.WebBridge.update(bridge.id, {
        status: 'online', last_seen_at: new Date().toISOString(),
      }).catch(() => {});
      return Response.json({ ok: true, bridgeId: bridge.bridge_id, status: 'online' });
    }

    // ── Helper: resolve e valida um bridge_id reclamado pelo cliente ──
    // Retorna o WebBridge se (bridge_id, user.id, workspace ativo) baterem E status=online.
    async function resolveActiveBridge(claimedBridgeId) {
      if (!claimedBridgeId) return null;
      const bridges = await base44.asServiceRole.entities.WebBridge.filter({ bridge_id: claimedBridgeId, user_id: user.id });
      const bridge = bridges[0] ?? null;
      if (!bridge) return null;
      if (bridge.workspace_id !== activeWsId) return null;
      // online se heartbeat recente; senao considera offline e rejeita
      const lastSeen = bridge.last_seen_at ? new Date(bridge.last_seen_at).getTime() : 0;
      const isOnline = bridge.status === 'online' && (Date.now() - lastSeen) < BRIDGE_ONLINE_TIMEOUT_MS;
      if (!isOnline) return null;
      return bridge;
    }

    // ── operation: registerSession ────────────────────────────────────
    if (operation === 'registerSession') {
      const { siteUrl: rawSiteUrl, siteName, tabId, bridgeId, browserSessionId } = body;
      if (!rawSiteUrl) return Response.json({ error: 'Missing required field: siteUrl' }, { status: 400 });

      // Valida bridgeId (recebido da extensao) contra registro server-side
      const bridge = await resolveActiveBridge(bridgeId);
      if (!bridge) {
        return Response.json({ error: 'Bridge invalido/offline. Re-registre a extensao (registerBridge).' }, { status: 403 });
      }

      let siteUrl = String(rawSiteUrl).trim();
      if (!/^https?:\/\//i.test(siteUrl)) siteUrl = 'https://' + siteUrl;
      try {
        const parsed = new URL(siteUrl);
        if (!parsed.hostname || !parsed.hostname.includes('.') || /\s/.test(parsed.hostname)) {
          return Response.json({ error: 'URL invalida: "' + rawSiteUrl + '" nao e um endereco valido.' }, { status: 400 });
        }
      } catch (e) {
        return Response.json({ error: 'URL invalida: "' + rawSiteUrl + '".' }, { status: 400 });
      }

      const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
      // browser_session_id: se a extensao enviou, usa; senao deriva do tabId.
      const bsid = (typeof browserSessionId === 'string' && browserSessionId) ? browserSessionId : (tabId != null ? String(tabId) : 'ext-tab');
      let session;
      try {
        session = await base44.entities.WebSession.create({
          site_url: siteUrl,
          site_name: siteName || '',
          browser_context_id: tabId != null ? String(tabId) : 'extension-tab',
          browser_session_id: bsid,
          bridge_id: bridge.bridge_id,
          workspace_id: activeWsId,
          status: 'active',
          source: 'extension',
          last_used_at: new Date().toISOString(),
          expires_at: expiresAt,
        });
      } catch (e) {
        return Response.json({ error: 'Failed to create WebSession: ' + e.message }, { status: 500 });
      }

      // Registra WorkspaceConnector(web) se ainda nao existe para este user+workspace (best-effort)
      try {
        const existing = await base44.asServiceRole.entities.WorkspaceConnector.filter({
          workspace_id: activeWsId, connector_id: 'web-connector', credential_owner_id: user.id, status: 'connected',
        });
        if (existing.length === 0) {
          await base44.asServiceRole.entities.WorkspaceConnector.create({
            workspace_id: activeWsId,
            connector_id: 'web-connector',
            credential_owner_id: user.id,
            status: 'connected',
            enabled: true,
            provider_kind: 'web',
            display_label: 'Web Connector — ' + new URL(siteUrl).hostname,
            configuration: JSON.stringify({ bridge_id: bridge.bridge_id }),
            last_connected_at: new Date().toISOString(),
          });
        }
      } catch (e) { /* best-effort: gate authorizeExecution valida de qualquer forma */ }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: 'active',
        source: 'extension',
        siteUrl,
        expiresAt,
        bridgeId: bridge.bridge_id,
        browserSessionId: bsid,
        workspaceId: activeWsId,
      });
    }

    // ── operation: heartbeat ──────────────────────────────────────────
    if (operation === 'heartbeat') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') return Response.json({ error: 'WebSession is not an extension session' }, { status: 409 });
      if (session.status !== 'active') return Response.json({ error: 'WebSession is not active' }, { status: 409 });
      if (session.created_by_id !== user.id) return Response.json({ error: 'WebSession pertence a outro usuario' }, { status: 403 });
      const newExpiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
      await base44.entities.WebSession.update(webSessionId, { last_used_at: new Date().toISOString(), expires_at: newExpiresAt }).catch(() => {});
      return Response.json({ ok: true, webSessionId, status: 'active', expiresAt: newExpiresAt });
    }

    // ── operation: revoke ─────────────────────────────────────────────
    if (operation === 'revoke') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.created_by_id !== user.id && role !== 'admin') return Response.json({ error: 'Apenas o dono pode revogar' }, { status: 403 });
      await base44.entities.WebSession.update(webSessionId, { status: 'revoked' }).catch(() => {});
      return Response.json({ ok: true, webSessionId, status: 'revoked' });
    }

    // ── operation: submitSnapshot (descoberta) ───────────────────────
    if (operation === 'submitSnapshot') {
      const { webSessionId, currentUrl, snapshotText } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      if (!snapshotText || typeof snapshotText !== 'string') return Response.json({ error: 'Missing required field: snapshotText' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') return Response.json({ error: 'WebSession is not an extension session' }, { status: 409 });
      if (session.status !== 'active') return Response.json({ error: 'WebSession is not active' }, { status: 409 });
      if (session.created_by_id !== user.id) return Response.json({ error: 'WebSession pertence a outro usuario' }, { status: 403 });
      const url = currentUrl || session.site_url;
      let llmResult = null;
      try {
        llmResult = await withTimeout(
          base44.integrations.Core.InvokeLLM({ prompt: buildDiscoveryPrompt(snapshotText, session.site_url, [url]), response_json_schema: DISCOVERY_LLM_SCHEMA }),
          60000, 'InvokeLLM_extension_discover'
        );
      } catch (e) { return Response.json({ error: 'Discovery LLM failed: ' + e.message }, { status: 502 }); }
      const saved = await saveDiscoveryCandidates({ base44, session, llmResult, currentUrl: url, pageIdx: 0, sdkTimeoutMs: 10000 });
      const navLinks = parseDiscoveryLLMResult(llmResult).navigationLinks;
      await base44.entities.WebSession.update(webSessionId, { last_used_at: new Date().toISOString() }).catch(() => {});
      return Response.json({ ok: true, webSessionId, currentUrl: url, candidatesSaved: saved.length, candidates: saved, navigationLinks: navLinks });
    }

    // ── operation: listCapabilities ──────────────────────────────────
    if (operation === 'listCapabilities') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') return Response.json({ error: 'WebSession is not an extension session' }, { status: 409 });
      if (session.created_by_id !== user.id) return Response.json({ error: 'WebSession pertence a outro usuario' }, { status: 403 });
      const sessionOrigin = (() => { try { return new URL(session.site_url).origin; } catch { return null; } })();
      const maps = await base44.asServiceRole.entities.CapabilityMap.list();
      const capabilities = [];
      for (const m of maps) {
        const mOrigin = (() => { try { return new URL(m.site_url).origin; } catch { return null; } })();
        if (sessionOrigin && mOrigin === sessionOrigin) {
          let caps = []; try { caps = JSON.parse(m.capabilities || '[]'); } catch { caps = []; }
          for (const c of caps) capabilities.push({ id: c.id, description: c.description, inputSchema: c.inputSchema, discoveredFrom: c.discoveredFrom });
        }
      }
      return Response.json({ ok: true, webSessionId, capabilities });
    }

    // ── operation: recordExecution ───────────────────────────────────
    if (operation === 'recordExecution') {
      const { webSessionId, discoveredFromUrl, inputFields, inputs, result } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') return Response.json({ error: 'WebSession is not an extension session' }, { status: 409 });
      if (session.created_by_id !== user.id) return Response.json({ error: 'WebSession pertence a outro usuario' }, { status: 403 });
      try {
        await base44.asServiceRole.entities.InteractionEvent.create({
          session_id: '', actor: 'system', event_type: 'capability_executed',
          raw_text: String(discoveredFromUrl || '').slice(0, 500),
          payload: JSON.stringify({ webSessionId, bridge_id: session.bridge_id, browser_session_id: session.browser_session_id, workspace_id: session.workspace_id, discoveredFromUrl, inputFields, inputs, result }),
        });
      } catch { /* best-effort */ }
      await base44.entities.WebSession.update(webSessionId, { last_used_at: new Date().toISOString() }).catch(() => {});
      return Response.json({ ok: true, webSessionId });
    }

    // ── operation: pollTasks (Fase 5 — seguro) ─────────────────────────
    // A extensao envia seu bridgeId. O backend valida o bridge contra o registro
    // server-side (user+workspace+online) e SO ENTAO devolve tarefas cujas
    // WebSessions pertencem a este bridge. Claim ATOMICO via updateMany condicional
    // (filter status=pending + $set status=in_progress + claimed_by_bridge_id) —
    // duas chamadas simultaneas nao conseguem claimar a mesma tarefa.
    if (operation === 'pollTasks') {
      const { bridgeId, webSessionIds } = body;
      const bridge = await resolveActiveBridge(bridgeId);
      if (!bridge) {
        return Response.json({ ok: false, error: 'Bridge invalido/offline. Re-registre a extensao.' }, { status: 403 });
      }

      // Tarefas pendentes visiveis ao caller (RLS: created_by_id == user.id)
      const pending = await base44.entities.WebExecutionRequest.filter({ status: 'pending' });

      // Filtra: web_session_id deve pertencer a uma WebSession deste bridge (user+workspace implicitos no bridge)
      let candidateTasks = pending;
      if (Array.isArray(webSessionIds) && webSessionIds.length > 0) {
        // Extensao enviou a lista de sessoes ativas — filtra por essas (mas valida bridge ownership abaixo)
        candidateTasks = pending.filter((t) => webSessionIds.includes(t.web_session_id));
      }
      // Valida que cada web_session_id pertence a uma WebSession deste bridge
      const bridgeSessionIds = new Set();
      const sessionsOfBridge = await base44.asServiceRole.entities.WebSession.filter({ bridge_id: bridge.bridge_id });
      for (const s of sessionsOfBridge) bridgeSessionIds.add(s.id);
      const mine = candidateTasks.filter((t) => bridgeSessionIds.has(t.web_session_id));

      // Claim ATOMICO por tarefa: updateMany condicional (status=pending → in_progress).
      // Se duas chamadas concorrem, so a primeira consegue (a segunda nao acha status=pending).
      const claimed = [];
      const now = new Date().toISOString();
      for (const t of mine) {
        try {
          const res = await base44.asServiceRole.entities.WebExecutionRequest.updateMany(
            { id: t.id, status: 'pending' },
            { $set: { status: 'in_progress', claimed_by: bridge.bridge_id, claimed_at: now } }
          );
          // updateMany retorna { updated: N } — se N==1, claim OK
          if (res && res.updated > 0) {
            claimed.push({ ...t, status: 'in_progress' });
          }
          // se updated==0, outra extensao/ciclo ja claimou — nao inclui (evita dupla execucao)
        } catch { /* best-effort: pula esta, extensao tenta no proximo ciclo */ }
      }
      return Response.json({ ok: true, tasks: claimed, bridgeId: bridge.bridge_id });
    }

    // ── operation: completeTask (Fase 5 — seguro) ────────────────────
    // Valida que o bridge que conclui e o mesmo que recebeu (claimed_by).
    // Resultado final (quando batch completo) e persistido via conversationContext.persistMessage
    // — nunca via Message.create direto (garante workspace_id, scope, membership).
    if (operation === 'completeTask') {
      const { bridgeId, requestId, result, error } = body;
      if (!requestId) return Response.json({ error: 'Missing required field: requestId' }, { status: 400 });

      const bridge = await resolveActiveBridge(bridgeId);
      if (!bridge) return Response.json({ ok: false, error: 'Bridge invalido/offline.' }, { status: 403 });

      const task = await base44.entities.WebExecutionRequest.get(requestId);
      if (!task) return Response.json({ error: 'WebExecutionRequest not found' }, { status: 404 });

      // IDEMPOTENCIA (TESTE 6): se a tarefa ja esta completed/failed, nao re-processa.
      // Retorna sucesso sem re-sintetizar/re-persistir — evita dupla execucao de persistencia.
      if (task.status === 'completed' || task.status === 'failed') {
        return Response.json({ ok: true, requestId, batchComplete: true, alreadyCompleted: true, status: task.status });
      }

      // Validacao de identidade: o bridge que conclui deve ser o mesmo que claimou.
      // Se a tarefa nao foi claimada via pollTasks (claimed_by vazio), exige que o
      // bridge seja o dono da WebSession da tarefa.
      if (task.claimed_by) {
        if (task.claimed_by !== bridge.bridge_id) {
          return Response.json({ ok: false, error: 'Tarefa pertence a outro bridge — conclusao negada.' }, { status: 403 });
        }
      } else {
        const sess = await base44.asServiceRole.entities.WebSession.get(task.web_session_id).catch(() => null);
        if (!sess || sess.bridge_id !== bridge.bridge_id) {
          return Response.json({ ok: false, error: 'Tarefa nao pertence a uma sessao deste bridge.' }, { status: 403 });
        }
      }

      try {
        await base44.entities.WebExecutionRequest.update(requestId, {
          status: error ? 'failed' : 'completed',
          result: result ? JSON.stringify(result) : undefined,
          error: error || undefined,
          completed_at: new Date().toISOString(),
        });
      } catch (e) { return Response.json({ error: 'Failed to update task: ' + e.message }, { status: 500 }); }

      // Verifica se o batch inteiro terminou
      const siblings = await base44.entities.WebExecutionRequest.filter({ batch_id: task.batch_id });
      const stillRunning = (siblings || []).some((s) => s.id !== requestId && (s.status === 'pending' || s.status === 'in_progress'));
      if (stillRunning) return Response.json({ ok: true, requestId, batchComplete: false });

      // Batch completo: sintetiza resposta e persiste via conversationContext (Fase 3 — workspace-aware)
      try {
        const allDone = (siblings || []).map((s) => (s.id === requestId ? { ...s, status: error ? 'failed' : 'completed', result: result ? JSON.stringify(result) : s.result, error: error || s.error } : s));
        const successBlocks = [];
        const failBlocks = [];
        for (const s of allDone) {
          if (s.status === 'completed') {
            let r = {}; try { r = JSON.parse(s.result || '{}'); } catch { r = {}; }
            successBlocks.push(`SITE: ${s.site_url}\nCAPABILITY: ${s.capability_id}\nRESULTADO: ${JSON.stringify(r).slice(0, 3000)}`);
          } else {
            failBlocks.push(`SITE: ${s.site_url} — falhou (${s.error || 'motivo desconhecido'})`);
          }
        }
        const chatSessionId = allDone[0] && allDone[0].chat_session_id;
        if (chatSessionId && successBlocks.length + failBlocks.length > 0) {
          const synthPrompt = 'Voce e o MemoryOS. O usuario pediu uma informacao que exigiu consultar VARIOS sites em paralelo. ' +
            'Aqui estao os resultados de cada site:\n\n' + successBlocks.join('\n\n') +
            (failBlocks.length > 0 ? '\n\nSites que falharam:\n' + failBlocks.join('\n') : '') +
            '\n\nMonte UMA resposta consolidada e clara em portugues, organizada por site, citando os dados reais encontrados.';
          let finalText = 'Consultei os sites solicitados, mas nao consegui montar um resumo automatico.';
          try {
            const synthResult = await withTimeout(base44.integrations.Core.InvokeLLM({ prompt: synthPrompt }), 45000, 'InvokeLLM_multiSiteSynthesis');
            finalText = (synthResult && (synthResult.output || synthResult.text || synthResult.response)) || finalText;
          } catch { /* fallback */ }

          // Fase 3: persiste via conversationContext.persistMessage (workspace-aware, valida membership)
          try {
            const persistRes = await base44.functions.invoke('conversationContext', {
              operation: 'persistMessage',
              sessionId: chatSessionId,
              role: 'assistant',
              content: finalText,
            });
            const pd = persistRes?.data ?? persistRes;
            if (pd?.error) {
              // fallback: nao silencia erro — loga para diagnostico mas nao quebra o fluxo
              console.warn('[webConnectorExtension] persistMessage falhou:', pd.error);
            }
          } catch (e) { console.warn('[webConnectorExtension] conversationContext.persistMessage erro:', e?.message || e); }
        }
      } catch { /* best-effort */ }

      return Response.json({ ok: true, requestId, batchComplete: true });
    }

    // ── operation: listActiveSessions (Fase 5 — filtrado por workspace) ──
    // So retorna sessoes do caller NO WORKSPACE ATIVO. Mesmo usuario em
    // workspace diferente nao ve as sessoes do outro workspace.
    if (operation === 'listActiveSessions') {
      const sessions = await base44.entities.WebSession.filter({ status: 'active', source: 'extension' }, '-created_date', 50);
      const result = (sessions || [])
        .filter((s) => s.created_by_id === user.id && s.workspace_id === activeWsId)
        .map((s) => ({
          webSessionId: s.id,
          siteUrl: s.site_url,
          siteName: s.site_name || '',
          tabId: s.browser_context_id && /^\d+$/.test(s.browser_context_id) ? parseInt(s.browser_context_id, 10) : null,
          bridgeId: s.bridge_id || '',
          browserSessionId: s.browser_session_id || '',
          expiresAt: s.expires_at,
        }));
      return Response.json({ ok: true, sessions: result, workspaceId: activeWsId });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}