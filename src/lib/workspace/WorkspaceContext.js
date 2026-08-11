/**
 * WorkspaceContext — Resolucao dinamica do Workspace ativo (Fase 1).
 *
 * ANTES: ACTIVE_WORKSPACE_ID = "default" fixo.
 * AGORA: o workspace ativo e resolvido do usuario (auth.me().active_workspace_id),
 * validado server-side, e cacheado sincronamente para nao quebrar callers que
 * usam getActiveWorkspaceId() de forma sync.
 *
 * Ciclo:
 *  - initWorkspaceContext() (async, chamado no login): busca o workspace ativo
 *    do usuario; se nao tiver nenhum, provisiona um pessoal via backend.
 *  - getActiveWorkspaceId() (sync): retorna o valor cacheado ('default' ate init).
 *  - setActiveWorkspace(id) (async): valida membership no backend antes de trocar.
 *
 * Seguranca: o backend (workspaceSetActive/resolveActiveWorkspace) valida
 * membership; o frontend nunca concede acesso sozinho.
 */
import { base44 } from '@/api/base44Client';

let _activeWorkspaceId = 'default';
let _workspaceIds = [];
let _initialized = false;

export async function initWorkspaceContext() {
  try {
    const me = await base44.auth.me();
    if (me?.workspace_ids && me.workspace_ids.length > 0) {
      _workspaceIds = me.workspace_ids;
      _activeWorkspaceId = me.active_workspace_id || me.workspace_ids[0];
    } else {
      const res = await base44.functions.invoke('workspaceProvisionPersonal', {});
      const data = res?.data ?? res;
      if (data?.ok && data.workspace_id) {
        _activeWorkspaceId = data.workspace_id;
        const me2 = await base44.auth.me();
        _workspaceIds = me2?.workspace_ids || [_activeWorkspaceId];
      }
    }
    _initialized = true;
  } catch (e) {
    console.warn('[WorkspaceContext] init falhou (best-effort, usa default):', e?.message);
  }
}

export function getActiveWorkspaceId() {
  return _activeWorkspaceId;
}

export function getWorkspaceIds() {
  return _workspaceIds;
}

export function isWorkspaceInitialized() {
  return _initialized;
}

export async function setActiveWorkspace(workspaceId) {
  const res = await base44.functions.invoke('workspaceSetActive', { workspaceId });
  const data = res?.data ?? res;
  if (data?.ok) {
    _activeWorkspaceId = workspaceId;
  }
  return data;
}

// Deprecated — mantido para compatibilidade com imports legados que referenciam
// a constante diretamente. Use getActiveWorkspaceId() para o valor dinamico.
export const ACTIVE_WORKSPACE_ID = 'default';