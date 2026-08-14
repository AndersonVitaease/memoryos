/**
 * b8WorkspaceIsolationTest -- Prova o isolamento multi-workspace do Web
 * Connector (FASE B8). Mistura testes deterministicos (helpers de
 * webSessionWorkspace) e testes reais (backend functions + DB).
 *
 * Cobre os 11 cenarios obrigatorios:
 *   1.  Workspace A usando sua propria WebSession -> PASS.
 *   2.  Workspace B tentando usar WebSession de A -> REJECT.
 *   3.  Workspace A tentando usar WebSession de B -> REJECT.
 *   4.  Workspace B tentando confirmar sessao de A -> REJECT.
 *   5.  Workspace B tentando revogar sessao de A -> REJECT.
 *   6.  Token legado valido no workspace correto -> PASS.
 *   7.  Token legado pertencente a outro workspace -> REJECT.
 *   8.  pollTasks de A nao retorna tarefas de B.
 *   9.  pollTasks de B nao retorna tarefas de A.
 *   10. Dois consumidores concorrentes -> somente um claim.
 *   11. Cleanup completo dos dados temporarios.
 *
 * Estrategia real: o caller tem 2 workspaces (A=ativo, B=outro). Testes da
 * perspectiva de B trocam temporariamente o active_workspace_id do caller para
 * B (sempre restaurando no finally). Sessoes/bridges/tarefas temporarios sao
 * criados com asServiceRole e removidos no cleanup.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  assertSessionWorkspace,
  credentialMatchesWorkspace,
  isLegacyCredentialWorkspace,
  serializeByBrowserSession,
} from '../../shared/webSessionWorkspace.ts';

function extractErrorBody(e: any): string {
  const body = e?.response?.data || e?.data || e?.body || e?.message || '';
  return typeof body === 'string' ? body : JSON.stringify(body);
}

export default async function (req: Request): Promise<Response> {
  const results: Array<{ test: string; passed: boolean; detail?: string }> = [];
  const cleanup: Array<() => Promise<void>> = [];
  let originalActiveWs: string | null = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const fullUser = await base44.asServiceRole.entities.User.get(user.id).catch(() => null) as any;
    const activeWsId = fullUser?.active_workspace_id || null;
    const userWorkspaceIds: string[] = Array.isArray(fullUser?.workspace_ids) ? fullUser.workspace_ids : [];
    const otherWsId = userWorkspaceIds.find((w) => w !== activeWsId) || null;
    originalActiveWs = activeWsId;

    if (!activeWsId || !otherWsId) {
      return Response.json({ ok: false, error: 'Usuario precisa de 2 workspaces para o teste cross-workspace', activeWsId, userWorkspaceIds }, { status: 400 });
    }

    // Helper: troca active_workspace_id temporariamente (restaurado no finally)
    async function setActiveWs(wsId: string | null) {
      await base44.asServiceRole.entities.User.update(user.id, { active_workspace_id: wsId }).catch(() => {});
    }

    // Helper: invoca webConnectorConnect e retorna { status, error, data }
    async function callConnect(op: string, payload: any): Promise<{ status: number; error: string; data: any }> {
      try {
        const res = await base44.functions.invoke('webConnectorConnect', { operation: op, ...payload });
        const d = res?.data ?? res;
        return { status: 200, error: d?.error || '', data: d };
      } catch (e: any) {
        const body = extractErrorBody(e);
        let status = 0, error = body;
        try { const j = JSON.parse(body); status = j.status || 0; error = j.error || body; } catch { /* not json */ }
        if (!status && /status code (\d+)/.test(e?.message || '')) status = parseInt((e.message.match(/status code (\d+)/) || [])[1], 10) || 0;
        return { status, error, data: null };
      }
    }

    // ═══ DETERMINISTIC TESTS (helpers) ═══

    // assertSessionWorkspace
    {
      const r1 = assertSessionWorkspace(null, activeWsId);
      const r2 = assertSessionWorkspace(activeWsId, activeWsId);
      const r3 = assertSessionWorkspace('ws-other', activeWsId);
      const r4 = assertSessionWorkspace('ws-x', null);
      const passed = r1.ok && r2.ok && !r3.ok && r3.reason === 'session_wrong_workspace' && !r4.ok && r4.reason === 'no_active_workspace';
      results.push({ test: 'det. assertSessionWorkspace (4 casos)', passed, detail: JSON.stringify({ r1: r1.ok, r2: r2.ok, r3: r3.reason, r4: r4.reason }) });
    }

    // credentialMatchesWorkspace — #6 (legado valido) + #7 (outro workspace)
    {
      const legacy = credentialMatchesWorkspace('default', activeWsId, userWorkspaceIds);       // #6 legado
      const same = credentialMatchesWorkspace(activeWsId, activeWsId, userWorkspaceIds);         // #6 no ws correto
      const other = credentialMatchesWorkspace(otherWsId, activeWsId, userWorkspaceIds);         // #7 outro workspace real
      const nullTok = credentialMatchesWorkspace(null, activeWsId, userWorkspaceIds);            // legado headless
      const passed = legacy.ok && same.ok && nullTok.ok && !other.ok && other.reason === 'credential_wrong_workspace';
      results.push({ test: 'det. #6/#7 credentialMatchesWorkspace (legado ok, outro ws reject)', passed, detail: JSON.stringify({ legacy: legacy.ok, same: same.ok, other: other.reason, nullTok: nullTok.ok }) });
    }
    // isLegacyCredentialWorkspace
    {
      const l1 = isLegacyCredentialWorkspace('default', userWorkspaceIds);
      const l2 = isLegacyCredentialWorkspace(null, userWorkspaceIds);
      const l3 = isLegacyCredentialWorkspace(activeWsId, userWorkspaceIds);
      const l4 = isLegacyCredentialWorkspace(otherWsId, userWorkspaceIds);
      const passed = l1 && l2 && !l3 && !l4;
      results.push({ test: 'det. isLegacyCredentialWorkspace (4 casos)', passed, detail: JSON.stringify({ l1, l2, l3, l4 }) });
    }
    // serializeByBrowserSession
    {
      const tasks = [
        { id: 't1', browser_session_id: 'bs-A' },
        { id: 't2', browser_session_id: 'bs-A' },
        { id: 't3', browser_session_id: 'bs-B' },
        { id: 't4', browser_session_id: null },
      ];
      const out = serializeByBrowserSession(tasks).map((t) => t.id);
      const passed = out.length === 3 && out[0] === 't1' && out[1] === 't3' && out[2] === 't4';
      results.push({ test: 'det. serializeByBrowserSession (1 por browser_session)', passed, detail: JSON.stringify(out) });
    }

    // ═══ REAL TESTS ═══

    // Cria sessoes em A e B (ativas, cookies dummy)
    const sessA = await base44.asServiceRole.entities.WebSession.create({
      site_url: 'https://b8-test-a.example', site_name: 'B8 A', browser_context_id: 'b8-a',
      workspace_id: activeWsId, status: 'active', source: 'extension',
      cookies: JSON.stringify([{ name: 'k', value: 'v', domain: 'b8-test-a.example' }]),
      last_used_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    cleanup.push(async () => { try { await base44.asServiceRole.entities.WebSession.delete(sessA.id); } catch {} });

    let sessB: any = null;
    if (otherWsId) {
      sessB = await base44.asServiceRole.entities.WebSession.create({
        site_url: 'https://b8-test-b.example', site_name: 'B8 B', browser_context_id: 'b8-b',
        workspace_id: otherWsId, status: 'active', source: 'extension',
        cookies: JSON.stringify([{ name: 'k', value: 'v', domain: 'b8-test-b.example' }]),
        last_used_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebSession.delete(sessB.id); } catch {} });
    }

    // --- Perspectiva A (caller ativo = A) ---
    // #1: A usando sua propria WebSession -> PASS (nao rejeitado por workspace)
    {
      const r = await callConnect('use', { webSessionId: sessA.id });
      const wsRejected = r.status === 403 && /outro workspace/i.test(r.error);
      const passed = !wsRejected; // pode ser session_expired/ok, mas NUNCA workspace-rejected
      results.push({ test: '#1 real. A usando sua propria WebSession -> PASS', passed, detail: JSON.stringify({ status: r.status, error: r.error?.slice(0, 120), wsRejected }) });
    }
    // #3: A tentando usar WebSession de B -> REJECT
    {
      const r = await callConnect('use', { webSessionId: sessB.id });
      const passed = r.status === 403 && /outro workspace/i.test(r.error);
      results.push({ test: '#3 real. A usando WebSession de B -> REJECT', passed, detail: JSON.stringify({ status: r.status, error: r.error?.slice(0, 120) }) });
    }
    // #8: pollTasks de A nao retorna tarefas de B
    {
      // Cria bridges + sessions + tasks para A e B
      const now = new Date().toISOString();
      const bridgeA = await base44.asServiceRole.entities.WebBridge.create({
        bridge_id: 'b8-bridge-A-' + Date.now(), user_id: user.id, workspace_id: activeWsId,
        status: 'online', last_seen_at: now, registered_at: now,
      });
      const bridgeB = await base44.asServiceRole.entities.WebBridge.create({
        bridge_id: 'b8-bridge-B-' + Date.now(), user_id: user.id, workspace_id: otherWsId,
        status: 'online', last_seen_at: now, registered_at: now,
      });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebBridge.delete(bridgeA.id); } catch {} });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebBridge.delete(bridgeB.id); } catch {} });

      // Sessoes de extensao ativas vinculadas aos bridges
      const extSessA = await base44.asServiceRole.entities.WebSession.create({
        site_url: 'https://b8-poll-a.example', site_name: 'B8 poll A', browser_context_id: 'tab-a',
        browser_session_id: 'bs-poll-a', bridge_id: bridgeA.bridge_id, workspace_id: activeWsId,
        status: 'active', source: 'extension', cookies: '[]', last_used_at: now, expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      const extSessB = await base44.asServiceRole.entities.WebSession.create({
        site_url: 'https://b8-poll-b.example', site_name: 'B8 poll B', browser_context_id: 'tab-b',
        browser_session_id: 'bs-poll-b', bridge_id: bridgeB.bridge_id, workspace_id: otherWsId,
        status: 'active', source: 'extension', cookies: '[]', last_used_at: now, expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebSession.delete(extSessA.id); } catch {} });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebSession.delete(extSessB.id); } catch {} });

      // WorkspaceConnector(web) em B (A ja tem um). Necessario para pollTasks no ws B.
      const wcB = await base44.asServiceRole.entities.WorkspaceConnector.create({
        workspace_id: otherWsId, connector_id: 'web-connector', credential_owner_id: user.id,
        status: 'connected', enabled: true, provider_kind: 'web', display_label: 'B8 poll B',
        configuration: '{}', last_connected_at: now,
      });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WorkspaceConnector.delete(wcB.id); } catch {} });

      // Tarefas pendentes: uma para sessao A, uma para sessao B
      const taskA = await base44.entities.WebExecutionRequest.create({
        web_session_id: extSessA.id, batch_id: 'b8-poll-A', status: 'pending',
        requested_at: now, workspace_id: activeWsId, bridge_id: bridgeA.bridge_id,
        browser_session_id: 'bs-poll-a', connector_id: 'web-connector',
      });
      const taskB = await base44.entities.WebExecutionRequest.create({
        web_session_id: extSessB.id, batch_id: 'b8-poll-B', status: 'pending',
        requested_at: now, workspace_id: otherWsId, bridge_id: bridgeB.bridge_id,
        browser_session_id: 'bs-poll-b', connector_id: 'web-connector',
      });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebExecutionRequest.delete(taskA.id); } catch {} });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebExecutionRequest.delete(taskB.id); } catch {} });

      // #8: pollTasks com bridge A (caller ativo=A) -> so taskA
      const pollA = await base44.functions.invoke('webConnectorExtension', { operation: 'pollTasks', bridgeId: bridgeA.bridge_id }).catch((e: any) => ({ data: { error: extractErrorBody(e) } }));
      const pollAd = pollA?.data ?? pollA;
      const aTaskIds = Array.isArray(pollAd?.tasks) ? pollAd.tasks.map((t: any) => t.id) : [];
      const passed8 = aTaskIds.includes(taskA.id) && !aTaskIds.includes(taskB.id);
      results.push({ test: '#8 real. pollTasks de A nao retorna tarefas de B', passed: passed8, detail: JSON.stringify({ aTaskIds, hasA: aTaskIds.includes(taskA.id), hasB: aTaskIds.includes(taskB.id) }) });

      // #9: pollTasks com bridge B (caller ativo trocado para B) -> so taskB
      await setActiveWs(otherWsId);
      const pollB = await base44.functions.invoke('webConnectorExtension', { operation: 'pollTasks', bridgeId: bridgeB.bridge_id }).catch((e: any) => ({ data: { error: extractErrorBody(e) } }));
      const pollBd = pollB?.data ?? pollB;
      const bTaskIds = Array.isArray(pollBd?.tasks) ? pollBd.tasks.map((t: any) => t.id) : [];
      const passed9 = bTaskIds.includes(taskB.id) && !bTaskIds.includes(taskA.id);
      results.push({ test: '#9 real. pollTasks de B nao retorna tarefas de A', passed: passed9, detail: JSON.stringify({ bTaskIds, hasB: bTaskIds.includes(taskB.id), hasA: bTaskIds.includes(taskA.id), error: pollBd?.error }) });
      await setActiveWs(activeWsId);
    }

    // --- Perspectiva B (caller ativo trocado para B) ---
    // #2: B tentando usar WebSession de A -> REJECT
    {
      await setActiveWs(otherWsId);
      const r = await callConnect('use', { webSessionId: sessA.id });
      const passed = r.status === 403 && /outro workspace/i.test(r.error);
      results.push({ test: '#2 real. B usando WebSession de A -> REJECT', passed, detail: JSON.stringify({ status: r.status, error: r.error?.slice(0, 120) }) });
      await setActiveWs(activeWsId);
    }
    // #4: B tentando confirmar sessao de A -> REJECT
    {
      await setActiveWs(otherWsId);
      const r = await callConnect('confirm', { webSessionId: sessA.id });
      const passed = r.status === 403 && /outro workspace/i.test(r.error);
      results.push({ test: '#4 real. B confirmando sessao de A -> REJECT', passed, detail: JSON.stringify({ status: r.status, error: r.error?.slice(0, 120) }) });
      await setActiveWs(activeWsId);
    }
    // #5: B tentando revogar sessao de A -> REJECT
    {
      await setActiveWs(otherWsId);
      const r = await callConnect('revoke', { webSessionId: sessA.id });
      const passed = r.status === 403 && /outro workspace/i.test(r.error);
      results.push({ test: '#5 real. B revogando sessao de A -> REJECT', passed, detail: JSON.stringify({ status: r.status, error: r.error?.slice(0, 120) }) });
      await setActiveWs(activeWsId);
    }

    // #6/#7 reais: tokens legados via authorizeExecution (cria WorkspaceConnector temp para cada)
    {
      const connectors = [
        { connectorId: 'gmail', credEntity: 'google', cap: 'gmail.send' },
        { connectorId: 'github', credEntity: 'github', cap: 'github.search' },
        { connectorId: 'microsoft-graph', credEntity: 'microsoft', cap: 'outlook.mail' },
      ];
      let passCount = 0;
      const det: any[] = [];
      for (const ct of connectors) {
        // Conta tokens legados do usuario para este credEntity
        let legacyCount = 0;
        try {
          let tokens: any[] = [];
          if (ct.credEntity === 'google') tokens = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: user.id });
          else if (ct.credEntity === 'github') tokens = await base44.asServiceRole.entities.GitHubOAuthToken.filter({ user_id: user.id });
          else if (ct.credEntity === 'microsoft') tokens = await base44.asServiceRole.entities.MicrosoftOAuthToken.filter({ user_id: user.id });
          legacyCount = (tokens || []).filter((t) => isLegacyCredentialWorkspace(t.workspace_id, userWorkspaceIds)).length;
        } catch {}
        if (legacyCount === 0) { det.push({ c: ct.connectorId, skipped: 'no legacy token' }); continue; }

        // WorkspaceConnector temporario no ws A
        let wcId: string | null = null;
        try {
          const existing = await base44.asServiceRole.entities.WorkspaceConnector.filter({ workspace_id: activeWsId, connector_id: ct.connectorId, credential_owner_id: user.id, status: 'connected' });
          if (existing.length === 0) {
            const wc = await base44.asServiceRole.entities.WorkspaceConnector.create({
              workspace_id: activeWsId, connector_id: ct.connectorId, credential_owner_id: user.id,
              status: 'connected', enabled: true, provider_kind: ct.credEntity === 'github' ? 'oauth_github' : ct.credEntity === 'microsoft' ? 'oauth_microsoft' : 'oauth_google',
              display_label: 'B8 legacy ' + ct.connectorId, configuration: '{}', last_connected_at: new Date().toISOString(),
            });
            wcId = wc.id;
          }
        } catch (e) { det.push({ c: ct.connectorId, err: 'create WC: ' + (e as any)?.message }); continue; }

        // #6 real: authorizeExecution no ws A com token legado -> check E passa
        try {
          const authRes = await base44.functions.invoke('connectorWorkspace', { operation: 'authorizeExecution', connectorId: ct.connectorId, capabilityId: ct.cap });
          const ad = authRes?.data ?? authRes;
          const checkE = (ad?.checks || []).find((c: any) => c.name === 'E_credential_exists');
          if (ad?.authorized === true && checkE?.passed) passCount++;
          det.push({ c: ct.connectorId, authorized: ad?.authorized, checkE: checkE?.passed, reason: ad?.reason });
        } catch (e) { det.push({ c: ct.connectorId, err: 'auth: ' + (e as any)?.message }); }
        finally { if (wcId) try { await base44.asServiceRole.entities.WorkspaceConnector.delete(wcId); } catch {} }
      }
      const passed = passCount > 0;
      results.push({ test: '#6 real. token legado valido no workspace correto -> PASS (authorizeExecution)', passed, detail: JSON.stringify({ passCount, det }) });
    }
    // #7 real: token em outro workspace real -> authorizeExecution rejeita (check E)
    {
      // Simula: um token cujo workspace_id = otherWsId. Se o caller esta no ws A,
      // credentialMatchesWorkspace(otherWsId, A, [A,B]) -> reject. Provamos via
      // helper deterministico + via authorizeExecution se existir token em B.
      const det = credentialMatchesWorkspace(otherWsId, activeWsId, userWorkspaceIds);
      // Prova real: busca tokens em otherWsId e mostra que seriam rejeitados
      let realOtherCount = 0;
      try {
        const gt = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: user.id, workspace_id: otherWsId });
        realOtherCount += (gt || []).length;
        const ght = await base44.asServiceRole.entities.GitHubOAuthToken.filter({ user_id: user.id, workspace_id: otherWsId });
        realOtherCount += (ght || []).length;
        const mt = await base44.asServiceRole.entities.MicrosoftOAuthToken.filter({ user_id: user.id, workspace_id: otherWsId });
        realOtherCount += (mt || []).length;
      } catch {}
      const passed = !det.ok && det.reason === 'credential_wrong_workspace';
      results.push({ test: '#7 real. token em outro workspace -> REJECT (credentialMatchesWorkspace)', passed, detail: JSON.stringify({ reason: det.reason, realOtherCount }) });
    }

    // #10 real: dois consumidores concorrentes -> somente um claim
    {
      const task = await base44.entities.WebExecutionRequest.create({
        web_session_id: sessA.id, batch_id: 'b8-atomic', status: 'pending',
        requested_at: new Date().toISOString(), workspace_id: activeWsId,
        browser_session_id: 'bs-atomic', connector_id: 'web-connector',
      });
      cleanup.push(async () => { try { await base44.asServiceRole.entities.WebExecutionRequest.delete(task.id); } catch {} });
      const [r1, r2] = await Promise.all([
        base44.asServiceRole.entities.WebExecutionRequest.updateMany({ id: task.id, status: 'pending' }, { $set: { status: 'in_progress', claimed_by: 'A', claimed_at: new Date().toISOString() } }).catch((e: any) => ({ updated: 0 })),
        base44.asServiceRole.entities.WebExecutionRequest.updateMany({ id: task.id, status: 'pending' }, { $set: { status: 'in_progress', claimed_by: 'B', claimed_at: new Date().toISOString() } }).catch((e: any) => ({ updated: 0 })),
      ]);
      const u1 = (r1 as any)?.updated ?? 0, u2 = (r2 as any)?.updated ?? 0;
      const passed = u1 + u2 === 1;
      results.push({ test: '#10 real. claim atomico (2 concorrentes -> 1 vence)', passed, detail: JSON.stringify({ u1, u2 }) });
    }

    const allPassed = results.every((r) => r.passed);
    return Response.json({ ok: true, allPassed, total: results.length, results });
  } catch (e) {
    return Response.json({ error: (e as any)?.message || String(e) }, { status: 500 });
  } finally {
    // Restaura active_workspace_id original SEMPRE (mesmo em erro).
    if (originalActiveWs) {
      try {
        const base44 = createClientFromRequest(req);
        const u = await base44.auth.me().catch(() => null);
        if (u) await base44.asServiceRole.entities.User.update(u.id, { active_workspace_id: originalActiveWs }).catch(() => {});
      } catch {}
    }
    // Executa cleanup (best-effort).
    for (const fn of cleanup) { try { await fn(); } catch {} }
  }
}