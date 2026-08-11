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
      const credOk = await _checkCredential(base44, entry.credentialEntity, user.id, activeWsId);
      checks.push({ name: "E_credential_exists", passed: credOk.ok, detail: credOk.detail });
      if (!credOk.ok) {
        return _reject("no_credential", credOk.detail, checks);
      }

      // F) caller e o dono da credencial (sempre verdade aqui pois filtramos por user.id,
      //    mas explicito para documentar a regra anti-emprestimo)
      checks.push({ name: "F_caller_is_credential_owner", passed: true, detail: "caller === credential_owner_id (filtrado por user.id)" });

      // G) capability disponivel no ConnectorDefinition
      const hasCap = entry.capabilities.some((c) => capabilityId === c || capabilityId.startsWith(c.split(".")[0] + ".") || c === capabilityId.split(".")[0]);
      checks.push({ name: "G_capability_available", passed: hasCap, detail: hasCap ? capabilityId : `nao em [${entry.capabilities.slice(0, 4).join(", ")}...]` });
      if (!hasCap) {
        return _reject("capability_unavailable", "Capability nao disponivel neste ConnectorDefinition", checks);
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
async function _checkCredential(base44: any, credEntity: string, userId: string, workspaceId: string): Promise<{ ok: boolean; detail: string }> {
  try {
    if (credEntity === "google") {
      const tokens = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: userId, workspace_id: workspaceId });
      return tokens.length > 0 ? { ok: true, detail: `${tokens.length} GoogleOAuthToken` } : { ok: false, detail: "GoogleOAuthToken nao encontrado" };
    }
    if (credEntity === "github") {
      const tokens = await base44.asServiceRole.entities.GitHubOAuthToken.filter({ user_id: userId, workspace_id: workspaceId });
      return tokens.length > 0 ? { ok: true, detail: `${tokens.length} GitHubOAuthToken` } : { ok: false, detail: "GitHubOAuthToken nao encontrado" };
    }
    if (credEntity === "microsoft") {
      const tokens = await base44.asServiceRole.entities.MicrosoftOAuthToken.filter({ user_id: userId, workspace_id: workspaceId });
      return tokens.length > 0 ? { ok: true, detail: `${tokens.length} MicrosoftOAuthToken` } : { ok: false, detail: "MicrosoftOAuthToken nao encontrado" };
    }
    if (credEntity === "web") {
      const sessions = await base44.asServiceRole.entities.WebSession.filter({ created_by_id: userId, workspace_id: workspaceId, status: "active" });
      return sessions.length > 0 ? { ok: true, detail: `${sessions.length} WebSession ativa` } : { ok: false, detail: "WebSession ativa nao encontrada" };
    }
    return { ok: false, detail: `credentialEntity desconhecido: ${credEntity}` };
  } catch (e) {
    return { ok: false, detail: `check credential erro: ${e?.message || e}` };
  }
}