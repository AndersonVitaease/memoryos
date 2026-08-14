/**
 * connectorWorkspace/entry.ts — Fase 4: Workspace Connector Layer
 *
 * UNICA via de mutacao de WorkspaceConnector. RLS bloqueia mutacao direta via SDK
 * para nao-platform-admins; este backend usa asServiceRole e enforce a role do
 * Workspace consultando WorkspaceMember server-side.
 *
 * Operacoes:
 *   - list                : WorkspaceConnectors do workspace ativo (membro)
 *   - catalog             : lista ConnectorDefinitions disponiveis (global)
 *   - connect             : cria/upsert WorkspaceConnector (self credential). Member+.
 *   - disconnect          : marca disconnected/remove. Self OU owner/admin.
 *   - setEnabled          : toggle enabled. Owner/admin apenas.
 *   - adminListAll        : owner/admin lista todas as conexoes do workspace (incl. de outros).
 *   - authorizeExecution  : GATE server-side (checks A-G). Chamado pelo ConversationPipeline.
 *
 * Seguranca: NUNCA confia em workspace_id/connector_id/credential_owner_id do
 * frontend para autorizacao. Resolve o contexto do usuario autenticado.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  assertWorkspaceMember,
  resolveActiveWorkspace,
} from "../../shared/workspaceAuth.ts";
import {
  CONNECTOR_CATALOG,
  getCatalogEntry,
  listCatalogConnectors,
  googleConnectorsForScopes,
} from "../../shared/connectorCatalog.ts";
import { credentialMatchesWorkspace } from "../../shared/webSessionWorkspace.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const op = body.operation;

    // Resolve workspace ativo validado (nao confia no frontend)
    const fullUser = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
    const activeWsId = (fullUser as any)?.active_workspace_id || null;
    if (!activeWsId) {
      return Response.json({ ok: false, error: "Nenhum workspace ativo" }, { status: 400 });
    }
    const { role } = await assertWorkspaceMember(base44, user.id, activeWsId);

    // ── list: WorkspaceConnectors do workspace ativo visiveis ao caller ──
    if (op === "list") {
      const all = await base44.asServiceRole.entities.WorkspaceConnector.filter({
        workspace_id: activeWsId,
      });
      // Member/Viewer veem todas as conexoes do workspace (para saber o que esta habilitado),
      // mas so conseguem EXECUTAR as suas (authorizeExecution valida credential_owner_id).
      return Response.json({ ok: true, connectors: all, activeWorkspaceId: activeWsId, role });
    }

    // ── catalog: ConnectorDefinitions globais disponiveis ──
    if (op === "catalog") {
      return Response.json({ ok: true, catalog: listCatalogConnectors() });
    }

    // ── connect: caller conecta SUA PROPRIA credencial (self) ──
    // Member+ pode. Nao aceita credential_owner_id do frontend — sempre user.id.
    if (op === "connect") {
      const connectorId = String(body.connectorId || "");
      const displayLabel = String(body.displayLabel || "");
      const configuration = String(body.configuration || "");
      const providerKind = String(body.providerKind || "");
      const scopes = Array.isArray(body.scopes) ? body.scopes : [];

      const entry = getCatalogEntry(connectorId);
      if (!entry) {
        return Response.json({ ok: false, error: "ConnectorDefinition nao encontrado" }, { status: 400 });
      }
      // Para Google, um exchange pode habilitar multi connectors (gmail+drive+calendar).
      // Se scopes foram passados, resolvemos quais connectors criar; senao so o connectorId.
      const connectorIds = entry.credentialEntity === "google" && scopes.length > 0
        ? googleConnectorsForScopes(scopes)
        : [connectorId];

      const created = [];
      for (const cid of connectorIds) {
        const existing = await base44.asServiceRole.entities.WorkspaceConnector.filter({
          workspace_id: activeWsId,
          connector_id: cid,
          credential_owner_id: user.id,
        });
        const now = new Date().toISOString();
        if (existing.length > 0) {
          const updated = await base44.asServiceRole.entities.WorkspaceConnector.update(existing[0].id, {
            status: "connected",
            enabled: true,
            display_label: displayLabel,
            configuration,
            provider_kind: providerKind || getCatalogEntry(cid)?.providerKind || "oauth_google",
            last_connected_at: now,
            last_error: "",
          });
          created.push(updated);
        } else {
          const rec = await base44.asServiceRole.entities.WorkspaceConnector.create({
            workspace_id: activeWsId,
            connector_id: cid,
            credential_owner_id: user.id,
            status: "connected",
            enabled: true,
            provider_kind: providerKind || getCatalogEntry(cid)?.providerKind || "oauth_google",
            display_label: displayLabel,
            configuration,
            last_connected_at: now,
          });
          created.push(rec);
        }
      }
      return Response.json({ ok: true, created, role });
    }

    // ── disconnect: self OU owner/admin ──
    if (op === "disconnect") {
      const connectorId = String(body.connectorId || "");
      const targetOwner = String(body.credentialOwnerId || user.id);

      // Se targetOwner !== user.id, exige owner/admin do workspace
      if (targetOwner !== user.id) {
        if (role !== "owner" && role !== "admin") {
          return Response.json({ ok: false, error: "Apenas owner/admin pode desconectar credencial de outro usuario" }, { status: 403 });
        }
      }

      const existing = await base44.asServiceRole.entities.WorkspaceConnector.filter({
        workspace_id: activeWsId,
        connector_id: connectorId,
        credential_owner_id: targetOwner,
      });
      for (const rec of existing) {
        await base44.asServiceRole.entities.WorkspaceConnector.update(rec.id, {
          status: "disconnected",
          enabled: false,
        });
      }
      return Response.json({ ok: true, disconnected: existing.length, role });
    }

    // ── setEnabled: owner/admin apenas — alterna o gate do connector no workspace ──
    if (op === "setEnabled") {
      const connectorId = String(body.connectorId || "");
      const enabled = !!body.enabled;
      const targetOwner = body.credentialOwnerId ? String(body.credentialOwnerId) : null;

      if (role !== "owner" && role !== "admin") {
        return Response.json({ ok: false, error: "Apenas owner/admin pode habilitar/desabilitar connectors" }, { status: 403 });
      }

      const query: any = { workspace_id: activeWsId, connector_id: connectorId };
      if (targetOwner) query.credential_owner_id = targetOwner;

      const records = await base44.asServiceRole.entities.WorkspaceConnector.filter(query);
      for (const rec of records) {
        await base44.asServiceRole.entities.WorkspaceConnector.update(rec.id, { enabled });
      }
      return Response.json({ ok: true, updated: records.length, enabled, role });
    }

    // ── adminListAll: owner/admin lista TODAS as conexoes do workspace (incl. de outros) ──
    if (op === "adminListAll") {
      if (role !== "owner" && role !== "admin") {
        return Response.json({ ok: false, error: "Apenas owner/admin" }, { status: 403 });
      }
      const all = await base44.asServiceRole.entities.WorkspaceConnector.filter({
        workspace_id: activeWsId,
      });
      return Response.json({ ok: true, connectors: all, role });
    }

    // ── authorizeExecution: GATE server-side (checks A-G) ──
    // Chamado pelo ConversationPipeline ANTES de despachar para o ConnectorRuntime.
    // NAO confia em workspace_id/connector_id/credential_owner_id do frontend —
    // resolve tudo do usuario autenticado + workspace ativo validado.
    if (op === "authorizeExecution") {
      const connectorId = String(body.connectorId || "");
      const capabilityId = String(body.capabilityId || "");
      const checks: { name: string; passed: boolean; detail: string }[] = [];

      // A) caller e membro ativo do workspace ativo (ja validado por assertWorkspaceMember acima)
      checks.push({ name: "A_active_member", passed: true, detail: `role=${role}` });

      // B) WorkspaceConnector existe para (workspace, connector, caller)
      const wc = await base44.asServiceRole.entities.WorkspaceConnector.filter({
        workspace_id: activeWsId,
        connector_id: connectorId,
        credential_owner_id: user.id,
        status: "connected",
      });
      const connectorRec = wc[0] ?? null;
      checks.push({ name: "B_workspace_connector_exists", passed: !!connectorRec, detail: connectorRec ? `id=${connectorRec.id}` : "nenhum para (workspace, connector, caller)" });
      if (!connectorRec) {
        // Distingue: existe WorkspaceConnector deste connector neste workspace de OUTRO usuario?
        const anyWc = await base44.asServiceRole.entities.WorkspaceConnector.filter({
          workspace_id: activeWsId, connector_id: connectorId, status: "connected",
        });
        if (anyWc && anyWc.length > 0) {
          return _reject("not_credential_owner", "WorkspaceConnector existe mas pertence a outro usuario — caller nao e o dono da credencial", checks);
        }
        return _reject("not_configured", "WorkspaceConnector nao existe para este usuario+connector neste workspace", checks);
      }

      // C) enabled === true
      const enabled = connectorRec.enabled !== false;
      checks.push({ name: "C_enabled", passed: enabled, detail: `enabled=${connectorRec.enabled}` });
      if (!enabled) {
        return _reject("not_enabled", "Connector esta desabilitado neste workspace", checks);
      }

      // D) ConnectorDefinition existe (catalogo)
      const entry = getCatalogEntry(connectorId);
      checks.push({ name: "D_definition_exists", passed: !!entry, detail: entry ? entry.displayName : "nao encontrado" });
      if (!entry) {
        return _reject("definition_not_found", "ConnectorDefinition nao encontrada no catalogo", checks);
      }

      // E) credencial necessaria existe para (caller, workspace, connector)
      //    Para Web Connector, se webSessionId foi passado, valida a SESSAO ESPECIFICA
      //    (ativa, do caller, do workspace, com bridge online) — check E+F+H+I+K em um so.
      if (entry.credentialEntity === "web" && body.webSessionId) {
        const wsCheck = await _checkWebSession(base44, String(body.webSessionId), user.id, activeWsId);
        checks.push({ name: "E_credential_exists", passed: wsCheck.ok, detail: wsCheck.detail });
        if (!wsCheck.ok) return _reject(wsCheck.reason || "no_credential", wsCheck.detail, checks);
        checks.push({ name: "F_caller_is_credential_owner", passed: true, detail: "WebSession.created_by_id === caller (validado em E)" });
        checks.push({ name: "H_bridge_belongs_to_user", passed: true, detail: wsCheck.bridgeDetail || "bridge online e do caller" });
        checks.push({ name: "I_browser_session_matches_bridge", passed: true, detail: "browser_session_id da WebSession validado via bridge_id" });
        checks.push({ name: "K_session_active", passed: true, detail: "status=active verificado em E" });
      } else {
        const userWsIds = Array.isArray((fullUser as any)?.workspace_ids) ? (fullUser as any).workspace_ids : [];
        const credOk = await _checkCredential(base44, entry.credentialEntity, user.id, activeWsId, userWsIds);
        checks.push({ name: "E_credential_exists", passed: credOk.ok, detail: credOk.detail });
        if (!credOk.ok) {
          return _reject("no_credential", credOk.detail, checks);
        }
        checks.push({ name: "F_caller_is_credential_owner", passed: true, detail: "caller === credential_owner_id (filtrado por user.id)" });
      }

      // G) capability disponivel no ConnectorDefinition
      // Para Web Connector (credentialEntity === "web" com webSessionId): gate
      // BIFASICO. Preserva a distincao arquitetural:
      //   G1 = capacidade TECNICA do connector (exact match contra o catalogo).
      //        O caller deve passar o verb tecnico (ex: "web.capability.execute")
      //        como capabilityId — NUNCA o ID especifico do site. Fail-closed.
      //   G2 = capability especifica do SITE existe no CapabilityMap cujo origin
      //        bate com o origin da WebSession (resolvida server-side), e nao
      //        esta rejeitada/desabilitada.
      // Para connectors NAO-web: mantem o comportamento atual (match fuzzy).
      const isWebGate = entry.credentialEntity === "web" && body.webSessionId;
      if (isWebGate) {
        // G1: exact match do verb tecnico contra o catalogo (fail-closed).
        // Um siteCapabilityId spoofado aqui (ex: "reservation.search") nao e
        // catalogo → rejeita. O catalogo e a unica fonte de verdade tecnica.
        const g1 = entry.capabilities.includes(capabilityId);
        checks.push({ name: "G1_technical_capability", passed: g1, detail: g1 ? capabilityId : `"${capabilityId}" nao e um verb tecnico do Web Connector (esperado um de: ${entry.capabilities.join(", ")})` });
        if (!g1) {
          return _reject("technical_capability_unavailable", "Web Connector nao possui esta capacidade tecnica. Passe o verb tecnico (ex: web.capability.execute) como capabilityId.", checks);
        }
        // G2: site capability existe no CapabilityMap do site da WebSession.
        const siteCapabilityId = typeof body.siteCapabilityId === "string" ? body.siteCapabilityId.trim() : "";
        const g2 = await _checkSiteCapability(base44, siteCapabilityId, String(body.webSessionId));
        checks.push({ name: "G2_site_capability", passed: g2.ok, detail: g2.detail });
        if (!g2.ok) {
          return _reject(g2.reason || "site_capability_not_found", g2.detail, checks);
        }
      } else {
        const hasCap = entry.capabilities.some((c) => capabilityId === c || capabilityId.startsWith(c.split(".")[0] + ".") || c === capabilityId.split(".")[0]);
        checks.push({ name: "G_capability_available", passed: hasCap, detail: hasCap ? capabilityId : `nao em [${entry.capabilities.slice(0, 4).join(", ")}...]` });
        if (!hasCap) {
          return _reject("capability_unavailable", "Capability nao disponivel neste ConnectorDefinition", checks);
        }
      }

      return Response.json({
        ok: true,
        authorized: true,
        workspaceId: activeWsId,
        connectorId,
        capabilityId,
        credentialOwnerId: user.id,
        checks,
      });
    }

    return Response.json({ ok: false, error: `Operacao desconhecida: ${op}` }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}

function _reject(reason: string, detail: string, checks: any[]): Response {
  return Response.json({
    ok: true,
    authorized: false,
    reason,
    detail,
    checks,
  });
}

/**
 * Check E: credencial existe para (user, workspace, connector).
 * Map connector_id -> entidade de credencial via catalog.credentialEntity.
 */
async function _checkCredential(base44: any, credEntity: string, userId: string, workspaceId: string, userWorkspaceIds: string[]): Promise<{ ok: boolean; detail: string }> {
  try {
    // B8: compat legada. Tokens pre-workspace tem workspace_id null/'default' e
    // continuam funcionando sem backfill. Tokens em OUTRO workspace real do
    // usuario sao rejeitados (sem fallback global). Filtra por user_id (largo)
    // e valida client-side com credentialMatchesWorkspace.
    if (credEntity === "google") {
      const tokens = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: userId });
      const valid = (tokens || []).filter((t) => credentialMatchesWorkspace(t.workspace_id, workspaceId, userWorkspaceIds).ok);
      return valid.length > 0 ? { ok: true, detail: `${valid.length} GoogleOAuthToken (workspace ${workspaceId})` } : { ok: false, detail: "GoogleOAuthToken nao encontrado para este workspace" };
    }
    if (credEntity === "github") {
      const tokens = await base44.asServiceRole.entities.GitHubOAuthToken.filter({ user_id: userId });
      const valid = (tokens || []).filter((t) => credentialMatchesWorkspace(t.workspace_id, workspaceId, userWorkspaceIds).ok);
      return valid.length > 0 ? { ok: true, detail: `${valid.length} GitHubOAuthToken (workspace ${workspaceId})` } : { ok: false, detail: "GitHubOAuthToken nao encontrado para este workspace" };
    }
    if (credEntity === "microsoft") {
      const tokens = await base44.asServiceRole.entities.MicrosoftOAuthToken.filter({ user_id: userId });
      const valid = (tokens || []).filter((t) => credentialMatchesWorkspace(t.workspace_id, workspaceId, userWorkspaceIds).ok);
      return valid.length > 0 ? { ok: true, detail: `${valid.length} MicrosoftOAuthToken (workspace ${workspaceId})` } : { ok: false, detail: "MicrosoftOAuthToken nao encontrado para este workspace" };
    }
    if (credEntity === "web") {
      // WebSession ativa do caller: legacy (workspace_id null) OU do workspace ativo.
      const sessions = await base44.asServiceRole.entities.WebSession.filter({ created_by_id: userId, status: "active" });
      const valid = (sessions || []).filter((s) => !s.workspace_id || s.workspace_id === workspaceId);
      return valid.length > 0 ? { ok: true, detail: `${valid.length} WebSession ativa (workspace ${workspaceId})` } : { ok: false, detail: "WebSession ativa nao encontrada para este workspace" };
    }
    return { ok: false, detail: `credentialEntity desconhecido: ${credEntity}` };
  } catch (e) {
    return { ok: false, detail: `check credential erro: ${e?.message || e}` };
  }
}

/**
 * Check E (web especifico): valida a WebSession exata que sera usada pela tarefa.
 * Cumula checks E (session existe+ativa), F (owner), H (bridge do caller),
 * I (browser_session pertence ao bridge) e K (status active).
 * RLS do asServiceRole e bypassado aqui — validacao explicita por user.id + workspace_id.
 */
async function _checkWebSession(base44: any, webSessionId: string, userId: string, workspaceId: string): Promise<{ ok: boolean; detail: string; reason?: string; bridgeDetail?: string }> {
  try {
    const session = await base44.asServiceRole.entities.WebSession.get(webSessionId).catch(() => null);
    if (!session) return { ok: false, reason: "session_not_found", detail: "WebSession nao encontrada" };

    // K) status ativa
    if (session.status !== "active") {
      return { ok: false, reason: "session_not_active", detail: `WebSession status=${session.status} (esperado active)` };
    }
    // F) pertence ao caller
    if (session.created_by_id !== userId) {
      return { ok: false, reason: "session_not_owner", detail: "WebSession pertence a outro usuario" };
    }
    // E-extra) pertence ao workspace ativo
    if (session.workspace_id && session.workspace_id !== workspaceId) {
      return { ok: false, reason: "session_wrong_workspace", detail: "WebSession pertence a outro workspace" };
    }
    // H) bridge_id preenchido e valido (online, do caller, do workspace)
    if (!session.bridge_id) {
      return { ok: false, reason: "session_no_bridge", detail: "WebSession sem bridge_id — nao foi registrada via bridge" };
    }
    const bridges = await base44.asServiceRole.entities.WebBridge.filter({ bridge_id: session.bridge_id, user_id: userId });
    const bridge = bridges[0] ?? null;
    if (!bridge) {
      return { ok: false, reason: "bridge_not_found", detail: `WebBridge ${session.bridge_id} nao encontrada para este usuario` };
    }
    if (bridge.workspace_id !== workspaceId) {
      return { ok: false, reason: "bridge_wrong_workspace", detail: "WebBridge pertence a outro workspace" };
    }
    if (bridge.status !== "online") {
      return { ok: false, reason: "bridge_offline", detail: `WebBridge status=${bridge.status} (esperado online)` };
    }
    return { ok: true, detail: `WebSession ativa (bridge ${session.bridge_id} online)`, bridgeDetail: `bridge ${bridge.bridge_id} status=online` };
  } catch (e) {
    return { ok: false, detail: `check web session erro: ${e?.message || e}` };
  }
}

/**
 * Check G2 (web especifico): valida que a capability especifica do site
 * existe no CapabilityMap cujo origin bate com o origin da WebSession, e nao
 * esta rejeitada/desabilitada. Nao confia em site_url do frontend — resolve
 * o site_url da WebSession (ja validada em E/F/H/I/K) server-side e cruza
 * com o CapabilityMap por origin.
 *
 * RLS do CapabilityMap e read={} (publico a qualquer auth), entao asServiceRole
 * e usado apenas para consistencia — a protecao real e o match de origin contra
 * a WebSession do caller.
 */
async function _checkSiteCapability(base44: any, siteCapabilityId: string, webSessionId: string): Promise<{ ok: boolean; detail: string; reason?: string }> {
  try {
    if (!siteCapabilityId) return { ok: false, reason: "site_capability_not_provided", detail: "siteCapabilityId e obrigatorio para execucao de capability web" };
    // Resolve a WebSession (ja validada em E/F/H/I/K) para obter site_url server-side
    const session = await base44.asServiceRole.entities.WebSession.get(webSessionId).catch(() => null);
    if (!session) return { ok: false, reason: "session_not_found", detail: "WebSession nao encontrada para validacao de site capability" };
    const sessionOrigin = (() => { try { return new URL(session.site_url).origin; } catch { return null; } })();
    if (!sessionOrigin) return { ok: false, reason: "session_invalid_origin", detail: `WebSession.site_url invalido: ${session.site_url}` };
    // Busca o CapabilityMap cujo origin bate com o da WebSession
    const maps = await base44.asServiceRole.entities.CapabilityMap.list();
    const map = (maps || []).find((m) => { try { return new URL(m.site_url).origin === sessionOrigin; } catch { return false; } });
    if (!map) return { ok: false, reason: "capability_map_not_found", detail: `Nenhum CapabilityMap para origin ${sessionOrigin}` };
    let caps: any[] = []; try { caps = JSON.parse(map.capabilities || "[]"); } catch { caps = []; }
    const cap = caps.find((c) => c && c.id === siteCapabilityId);
    if (!cap) return { ok: false, reason: "site_capability_not_found", detail: `Capability "${siteCapabilityId}" nao encontrada no CapabilityMap de ${sessionOrigin}` };
    // Defensivo: se a capability tem status explicito rejeitado/disabled, rejeita.
    // (Schema atual do CapabilityMap nao tem esses campos por capability — e
    // forward-compatible para quando o status por-capability for adicionado.)
    if (cap.status === "rejected") return { ok: false, reason: "site_capability_rejected", detail: `Capability "${siteCapabilityId}" marcada como rejected no CapabilityMap` };
    if (cap.disabled === true) return { ok: false, reason: "site_capability_disabled", detail: `Capability "${siteCapabilityId}" marcada como disabled no CapabilityMap` };
    return { ok: true, detail: `Capability "${siteCapabilityId}" validada no CapabilityMap de ${sessionOrigin}` };
  } catch (e) {
    return { ok: false, detail: `check site capability erro: ${e?.message || e}` };
  }
}