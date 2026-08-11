/**
 * webConnectorExtension — Backend da Extensao Chrome (RFC-015 adendo, Sprint 1).
 *
 * Diferente do webConnectorConnect (Playwright headless) e do webConnectorLive
 * (Selenium/noVNC), esta funcao NAO orquestra nenhum browser. A extensao roda
 * dentro do Chrome real do usuario (que o Cloudflare/anti-bot ja aceitou), e o
 * backend vira so persistencia + coordenacao. A "sessao" deixa de ser cookies
 * guardados no backend e passa a ser a aba ativa do usuario.
 *
 * Sprint 1 — operations implementadas aqui:
 *   registerSession { siteUrl, siteName?, tabId? } -> cria WebSession(status=active, source=extension)
 *   heartbeat       { webSessionId }               -> atualiza last_used_at (mantem viva; sweep detecta aba fechada por falta de heartbeat)
 *   revoke          { webSessionId }               -> marca WebSession revoked (extensao fechou a aba / usuario desconectou)
 *
 * Sprints 2/3 (descoberta + execucao) virao aditivamente neste mesmo arquivo.
 *
 * Seguranca (ADR-019): nenhum cookie de auth e persistido aqui na origem
 * 'extension' — a sessao e a propria aba do usuario, nao cookies guardados.
 * O campo `source` distingue as tres origens para o roteamento do planner.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildDiscoveryPrompt, DISCOVERY_LLM_SCHEMA, saveDiscoveryCandidates, parseDiscoveryLLMResult } from '../../shared/webDiscovery.ts';
import { withTimeout } from '../../shared/mcpHelpers.ts';

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30min — mesmo TTL das outras origens

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { operation } = body;
    if (!operation) return Response.json({ error: 'Missing required field: operation' }, { status: 400 });

    // ── operation: registerSession ───────────────────────────────────
    if (operation === 'registerSession') {
      const { siteUrl: rawSiteUrl, siteName, tabId } = body;
      if (!rawSiteUrl) return Response.json({ error: 'Missing required field: siteUrl' }, { status: 400 });

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
      let session;
      try {
        session = await base44.entities.WebSession.create({
          site_url: siteUrl,
          site_name: siteName || '',
          browser_context_id: tabId ? String(tabId) : 'extension-tab',
          status: 'active',
          source: 'extension',
          last_used_at: new Date().toISOString(),
          expires_at: expiresAt,
        });
      } catch (e) {
        return Response.json({ error: 'Failed to create WebSession: ' + e.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: 'active',
        source: 'extension',
        siteUrl,
        expiresAt,
      });
    }

    // ── operation: heartbeat ──────────────────────────────────────────
    // Atualiza last_used_at. O workflow Web Session Sweep (existente) ja
    // marca sessoes sem uso recente como expired — so precisava de um
    // sinal de "ainda viva", que e o heartbeat periodico da extensao.
    if (operation === 'heartbeat') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') {
        return Response.json({ error: 'WebSession is not an extension session (source: ' + session.source + ')' }, { status: 409 });
      }
      if (session.status !== 'active') {
        return Response.json({ error: 'WebSession is not active (status: ' + session.status + ')' }, { status: 409 });
      }

      const newExpiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
      try {
        await base44.entities.WebSession.update(webSessionId, {
          last_used_at: new Date().toISOString(),
          expires_at: newExpiresAt,
        });
      } catch (e) {
        return Response.json({ error: 'Failed to update WebSession: ' + e.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        webSessionId,
        status: 'active',
        lastUsedAt: new Date().toISOString(),
        expiresAt: newExpiresAt,
      });
    }

    // ── operation: revoke ─────────────────────────────────────────────
    if (operation === 'revoke') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') {
        return Response.json({ error: 'WebSession is not an extension session (source: ' + session.source + ')' }, { status: 409 });
      }
      try {
        await base44.entities.WebSession.update(webSessionId, { status: 'revoked' });
      } catch (e) {
        return Response.json({ error: 'Failed to revoke session: ' + e.message }, { status: 500 });
      }
      return Response.json({ ok: true, webSessionId, status: 'revoked' });
    }

    // ── operation: submitSnapshot (Sprint 2 — descoberta via extensao) ──
    // A extensao (content-site.js) extrai um snapshot do DOM da aba autenticada
    // do usuario + os links do mesmo dominio, e envia aqui. O backend roda o
    // MESMO prompt de descoberta do webConnectorDiscover (compartilhado em
    // webDiscovery.ts) e salva CapabilityCandidate — fluxo de validacao admin
    // intacto. A BFS e dirigida pelo service worker da extensao, que navega a
    // aba e chama submitSnapshot a cada pagina. Backend stateless por pagina.
    if (operation === 'submitSnapshot') {
      const { webSessionId, currentUrl, snapshotText } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      if (!snapshotText || typeof snapshotText !== 'string') return Response.json({ error: 'Missing required field: snapshotText' }, { status: 400 });

      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') {
        return Response.json({ error: 'WebSession is not an extension session (source: ' + session.source + ')' }, { status: 409 });
      }
      if (session.status !== 'active') {
        return Response.json({ error: 'WebSession is not active (status: ' + session.status + ')' }, { status: 409 });
      }

      const url = currentUrl || session.site_url;
      let llmResult = null;
      try {
        llmResult = await withTimeout(
          base44.integrations.Core.InvokeLLM({
            prompt: buildDiscoveryPrompt(snapshotText, session.site_url, [url]),
            response_json_schema: DISCOVERY_LLM_SCHEMA,
          }),
          60000,
          'InvokeLLM_extension_discover'
        );
      } catch (e) {
        return Response.json({ error: 'Discovery LLM failed: ' + e.message }, { status: 502 });
      }

      const saved = await saveDiscoveryCandidates({ base44: base44, session: session, llmResult: llmResult, currentUrl: url, pageIdx: 0, sdkTimeoutMs: 10000 });
      const navLinks = parseDiscoveryLLMResult(llmResult).navigationLinks;

      try {
        await base44.entities.WebSession.update(webSessionId, { last_used_at: new Date().toISOString() });
      } catch (e) { /* best-effort */ }

      return Response.json({
        ok: true,
        webSessionId: webSessionId,
        currentUrl: url,
        candidatesSaved: saved.length,
        candidates: saved,
        navigationLinks: navLinks,
      });
    }

    // ── operation: listCapabilities (Sprint 3) ──────────────────────────
    // Retorna as capabilities validadas (CapabilityMap) do site da sessao,
    // para a extensao popular o seletor de execucao no popup. Compara por
    // origin (nao URL exata) — o site_url da sessao e o origin, o do mapa
    // pode incluir path.
    if (operation === 'listCapabilities') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') return Response.json({ error: 'WebSession is not an extension session' }, { status: 409 });

      const sessionOrigin = (() => { try { return new URL(session.site_url).origin; } catch (e) { return null; } })();
      const maps = await base44.asServiceRole.entities.CapabilityMap.list();
      const capabilities = [];
      for (const m of maps) {
        const mOrigin = (() => { try { return new URL(m.site_url).origin; } catch (e) { return null; } })();
        if (sessionOrigin && mOrigin === sessionOrigin) {
          let caps = [];
          try { caps = JSON.parse(m.capabilities || '[]'); } catch (e) { caps = []; }
          for (const c of caps) capabilities.push({ id: c.id, description: c.description, inputSchema: c.inputSchema, discoveredFrom: c.discoveredFrom });
        }
      }
      return Response.json({ ok: true, webSessionId, capabilities });
    }

    // ── operation: recordExecution (Sprint 3) ──────────────────────────
    // Persiste o resultado de uma execucao de capability na aba do usuario.
    // A execucao acontece no DOM (pageExecute via chrome.scripting, com a
    // mesma guarda de escrita do headless); o backend so valida a sessao e
    // registra o evento (auditoria/telemetria).
    if (operation === 'recordExecution') {
      const { webSessionId, discoveredFromUrl, inputFields, inputs, result } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') return Response.json({ error: 'WebSession is not an extension session' }, { status: 409 });
      if (session.status !== 'active') return Response.json({ error: 'WebSession is not active' }, { status: 409 });

      try {
        await base44.asServiceRole.entities.InteractionEvent.create({
          session_id: '',
          actor: 'system',
          event_type: 'capability_executed',
          raw_text: String(discoveredFromUrl || '').slice(0, 500),
          payload: JSON.stringify({
            webSessionId,
            discoveredFromUrl,
            inputFields,
            inputs,
            result,
          }),
        });
      } catch (e) { /* best-effort: nao bloqueia o retorno */ }

      try { await base44.entities.WebSession.update(webSessionId, { last_used_at: new Date().toISOString() }); } catch (e) { /* best-effort */ }

      return Response.json({ ok: true, webSessionId });
    }

    // ── operation: pollTasks (multi-site paralelo) ────────────────
    // A extensao chama isto a cada heartbeat (agora a cada ~30s, o minimo
    // pratico do MV3 chrome.alarms em producao) passando TODOS os
    // webSessionId que ela mantem vivos. Retorna TODAS as tarefas pendentes
    // de uma vez (nao uma por vez) — a extensao executa todas em PARALELO
    // (cada uma na sua propria aba), entao 3 sites numa mesma pergunta do
    // chat custam ~1 ciclo de heartbeat + tempo de execucao em paralelo
    // (segundos), nao 3 ciclos sequenciais.
    if (operation === 'pollTasks') {
      const { webSessionIds } = body;
      if (!Array.isArray(webSessionIds) || webSessionIds.length === 0) {
        return Response.json({ ok: true, tasks: [] });
      }
      const pending = await base44.entities.WebExecutionRequest.filter({ status: 'pending' });
      const mine = (pending || []).filter((t) => webSessionIds.includes(t.web_session_id));
      const marked = [];
      for (const t of mine) {
        try {
          await base44.entities.WebExecutionRequest.update(t.id, { status: 'in_progress' });
          marked.push({ ...t, status: 'in_progress' });
        } catch (e) { /* best-effort: pula essa, extensao tenta no proximo ciclo */ }
      }
      return Response.json({ ok: true, tasks: marked });
    }

    // ── operation: completeTask ──────────────────────────
    // A extensao chama isto pra cada tarefa que executou (sucesso ou falha).
    // Quando a ULTIMA tarefa de um batch termina, sintetiza a resposta final
    // (juntando os resultados de todos os sites do batch) e posta como nova
    // mensagem na sessao de chat original — e assim que o usuario recebe a
    // resposta "atrasada" apos a extensao processar em segundo plano.
    if (operation === 'completeTask') {
      const { requestId, result, error } = body;
      if (!requestId) return Response.json({ error: 'Missing required field: requestId' }, { status: 400 });

      const task = await base44.entities.WebExecutionRequest.get(requestId);
      if (!task) return Response.json({ error: 'WebExecutionRequest not found' }, { status: 404 });

      try {
        await base44.entities.WebExecutionRequest.update(requestId, {
          status: error ? 'failed' : 'completed',
          result: result ? JSON.stringify(result) : undefined,
          error: error || undefined,
          completed_at: new Date().toISOString(),
        });
      } catch (e) {
        return Response.json({ error: 'Failed to update task: ' + e.message }, { status: 500 });
      }

      // Verifica se o batch inteiro terminou (nenhuma tarefa irma ainda pending/in_progress).
      const siblings = await base44.entities.WebExecutionRequest.filter({ batch_id: task.batch_id });
      const stillRunning = (siblings || []).some((s) => s.id !== requestId && (s.status === 'pending' || s.status === 'in_progress'));
      if (stillRunning) {
        return Response.json({ ok: true, requestId, batchComplete: false });
      }

      // Batch completo: sintetiza resposta unica juntando todos os sites.
      try {
        const allDone = (siblings || []).map((s) => (s.id === requestId ? { ...s, status: error ? 'failed' : 'completed', result: result ? JSON.stringify(result) : s.result, error: error || s.error } : s));
        const successBlocks = [];
        const failBlocks = [];
        for (const s of allDone) {
          if (s.status === 'completed') {
            let r = {};
            try { r = JSON.parse(s.result || '{}'); } catch (e) { r = {}; }
            successBlocks.push(`SITE: ${s.site_url}\nCAPABILITY: ${s.capability_id}\nRESULTADO: ${JSON.stringify(r).slice(0, 3000)}`);
          } else {
            failBlocks.push(`SITE: ${s.site_url} — falhou (${s.error || 'motivo desconhecido'})`);
          }
        }
        const chatSessionId = allDone[0] && allDone[0].chat_session_id;
        if (chatSessionId && successBlocks.length + failBlocks.length > 0) {
          const synthPrompt =
            'Voce e o MemoryOS. O usuario pediu uma informacao que exigiu consultar VARIOS sites em paralelo. ' +
            'Aqui estao os resultados de cada site:\n\n' + successBlocks.join('\n\n') +
            (failBlocks.length > 0 ? '\n\nSites que falharam:\n' + failBlocks.join('\n') : '') +
            '\n\nMonte UMA resposta consolidada e clara em portugues, organizada por site, ' +
            'citando os dados reais encontrados. Se algum site falhou, mencione brevemente sem ' +
            'inventar motivo tecnico. Formato limpo, sem jargao interno.';
          let finalText = 'Consultei os sites solicitados, mas nao consegui montar um resumo automatico.';
          try {
            const synthResult = await withTimeout(
              base44.integrations.Core.InvokeLLM({ prompt: synthPrompt }),
              45000,
              'InvokeLLM_multiSiteSynthesis'
            );
            finalText = (synthResult && (synthResult.output || synthResult.text || synthResult.response)) || finalText;
          } catch (e) { /* usa o texto padrao de fallback */ }

          try {
            await base44.entities.Message.create({
              session_id: chatSessionId,
              role: 'assistant',
              content: finalText,
              memory_tier: 'active',
            });
          } catch (e) { /* best-effort: nao ha como notificar o usuario se isso falhar */ }
        }
      } catch (e) { /* best-effort: batch marcado completo mesmo se a sintese falhar */ }

      return Response.json({ ok: true, requestId, batchComplete: true });
    }

    // ── operation: listActiveSessions (reconciliacao apos reinstalar a extensao) ──
    // Fix (2026-08-11): o cache local da extensao (chrome.storage.local) e
    // apagado quando o usuario desinstala/reinstala a extensao (comportamento
    // padrao do Chrome). Sem isso, sessoes que continuam ATIVAS no backend
    // (Bling, Mercado Livre, etc.) somem da lista do popup mesmo estando
    // conectadas de verdade. Esta operacao devolve todas as WebSession
    // ativas de origem 'extension' deste usuario, incluindo o tabId salvo no
    // momento do registerSession, pra o background.js reidratar o cache
    // local (so mantem as que a aba ainda existe neste navegador).
    if (operation === 'listActiveSessions') {
      const sessions = await base44.entities.WebSession.filter({ status: 'active', source: 'extension' }, '-created_date', 50);
      const result = (sessions || [])
        .filter((s) => s.created_by_id === user.id)
        .map((s) => ({
          webSessionId: s.id,
          siteUrl: s.site_url,
          siteName: s.site_name || '',
          tabId: s.browser_context_id && /^\d+$/.test(s.browser_context_id) ? parseInt(s.browser_context_id, 10) : null,
          expiresAt: s.expires_at,
        }));
      return Response.json({ ok: true, sessions: result });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}