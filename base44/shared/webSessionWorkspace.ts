/**
 * webSessionWorkspace.ts — Helpers de isolamento multi-workspace (FASE B8).
 *
 * Centraliza a validacao deterministica de pertencimento de WebSession e
 * credenciais OAuth ao workspace ativo do caller. Usada por:
 *   - webConnectorConnect (login/confirm/use/executeCapability/revoke)
 *   - connectorWorkspace._checkCredential (compat tokens legados)
 *   - webConnectorExtension.pollTasks (serializacao por browser_session_id)
 *   - b8WorkspaceIsolationTest (provas deterministicas)
 *
 * Modelo:
 *  - WebSession headless legada (workspace_id null) -> PERMITIDA (nao havia
 *    workspace quando foi criada; o browser compartilhado nao tem workspace).
 *  - WebSession de extensao (workspace_id setado) -> so pode ser usada pelo
 *    workspace ativo que a criou.
 *  - Token OAuth legado (workspace_id null ou valor nao-real como 'default')
 *    -> PERMITIDO (nao exige backfill), DESDE QUE nao pertença a OUTRO
 *    workspace real do mesmo usuario.
 *  - Token em OUTRO workspace real do usuario -> REJEITADO.
 *
 * Tudo deterministico — sem LLM, sem rede.
 */

export interface WsCheckResult {
  ok: boolean;
  reason?: string;
  detail?: string;
}

/**
 * Valida que uma WebSession pode ser usada pelo workspace ativo do caller.
 * - sessionWsId null/vazio (headless legada) -> ok.
 * - sessionWsId === activeWsId -> ok.
 * - sessionWsId setado e != activeWsId -> REJEITA (session_wrong_workspace).
 * - sessionWsId setado mas caller sem active -> REJEITA (no_active_workspace).
 */
export function assertSessionWorkspace(sessionWsId: string | null | undefined, activeWsId: string | null | undefined): WsCheckResult {
  if (!sessionWsId) return { ok: true };
  if (!activeWsId) {
    return { ok: false, reason: 'no_active_workspace', detail: 'WebSession tem workspace_id mas caller nao tem workspace ativo' };
  }
  if (sessionWsId === activeWsId) return { ok: true };
  return { ok: false, reason: 'session_wrong_workspace', detail: 'WebSession pertence a outro workspace' };
}

/**
 * True se o workspace_id do token e um valor "legado" (nao corresponde a
 * nenhum workspace real do usuario). Tokens pre-workspace tinham workspace_id
 * = 'default' ou similar — esses continuam validos sem backfill.
 */
export function isLegacyCredentialWorkspace(tokenWsId: string | null | undefined, userWorkspaceIds: string[]): boolean {
  if (!tokenWsId) return true; // null/vazio = legado headless
  if (!Array.isArray(userWorkspaceIds) || userWorkspaceIds.length === 0) return true;
  return !userWorkspaceIds.includes(tokenWsId);
}

/**
 * Valida que uma credencial OAuth pode ser usada pelo workspace ativo.
 * Compat legada: tokens cujo workspace_id nao e um workspace real do usuario
 * (null, 'default', etc.) sao aceitos sem backfill. Tokens que pertencem a
 * OUTRO workspace real do mesmo usuario sao rejeitados (sem fallback global).
 */
export function credentialMatchesWorkspace(tokenWsId: string | null | undefined, activeWsId: string | null | undefined, userWorkspaceIds: string[]): WsCheckResult {
  if (!tokenWsId) return { ok: true }; // legado sem workspace
  if (tokenWsId === activeWsId) return { ok: true }; // workspace exato
  if (isLegacyCredentialWorkspace(tokenWsId, userWorkspaceIds)) {
    // legado: workspace_id nao e um workspace real -> aceita (compat)
    return { ok: true };
  }
  // tokenWsId e um workspace real do usuario, mas != ativo -> pertence a outro
  return { ok: false, reason: 'credential_wrong_workspace', detail: 'credencial pertence a outro workspace real' };
}

/**
 * Serializa tarefas por browser_session_id: retorna no maximo UMA tarefa por
 * browser_session_id por ciclo de poll (mais as sem browser_session_id). Evita
 * que duas tarefas concorrentes corrompam o estado da mesma aba Chrome.
 * Deterministico e estável (preserva ordem de entrada).
 */
export function serializeByBrowserSession<T extends { browser_session_id?: string | null }>(tasks: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of tasks) {
    const bs = t.browser_session_id || null;
    if (!bs) { out.push(t); continue; }
    if (seen.has(bs)) continue;
    seen.add(bs);
    out.push(t);
  }
  return out;
}