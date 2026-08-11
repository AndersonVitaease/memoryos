/**
 * WorkspaceContext — Contexto reativo do Workspace ativo (Fase 2).
 *
 * Base oficial (Fase 1) mantida: _activeWorkspaceId/_workspaceIds cacheiam o
 * valor sincrono para callers legados (getActiveWorkspaceId). A Fase 2 adiciona
 * um React Context (WorkspaceProvider + useWorkspace) para a UI reagir a
 * troca de workspace, sem criar um segundo mecanismo — usa os mesmos backends
 * (workspaceMembership listMine, workspaceSetActive, workspaceCreate,
 * workspaceProvisionPersonal).
 *
 * Seguranca: toda troca/criacao passa pelo backend, que valida membership.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { queryClientInstance } from '@/lib/query-client';

// ── Cache sincrono (legado) ───────────────────────────────────────────────
let _activeWorkspaceId = 'default';
let _workspaceIds = [];
let _initialized = false;

function setCache(activeId, ids) {
  if (activeId) _activeWorkspaceId = activeId;
  if (ids) _workspaceIds = ids;
  _initialized = true;
}

export async function initWorkspaceContext() {
  try {
    const res = await base44.functions.invoke('workspaceMembership', { operation: 'listMine' });
    const data = res?.data ?? res;
    const workspaces = data?.workspaces || [];
    if (workspaces.length > 0) {
      const ids = workspaces.map((w) => w.id);
      setCache(data.active_workspace_id || ids[0], ids);
    } else {
      const prov = await base44.functions.invoke('workspaceProvisionPersonal', {});
      const pdata = prov?.data ?? prov;
      if (pdata?.ok && pdata.workspace_id) {
        setCache(pdata.workspace_id, [pdata.workspace_id]);
      }
    }
  } catch (e) {
    console.warn('[WorkspaceContext] init falhou (best-effort):', e?.message);
  }
}

export function getActiveWorkspaceId() { return _activeWorkspaceId; }
export function getWorkspaceIds() { return _workspaceIds; }
export function isWorkspaceInitialized() { return _initialized; }

export async function setActiveWorkspace(workspaceId) {
  const res = await base44.functions.invoke('workspaceSetActive', { workspaceId });
  const data = res?.data ?? res;
  if (data?.ok) setCache(workspaceId, null);
  return data;
}

// Deprecated const — mantido para imports legados.
export const ACTIVE_WORKSPACE_ID = 'default';

// ── React Context (Fase 2) ─────────────────────────────────────────────────
const WorkspaceCtx = createContext(null);

export function WorkspaceProvider({ children }) {
  const navigate = useNavigate();
  const [activeWorkspaceId, setActiveId] = useState('default');
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('workspaceMembership', { operation: 'listMine' });
      const data = res?.data ?? res;
      const ws = data?.workspaces || [];
      setWorkspaces(ws);
      const active = data?.active_workspace_id || (ws[0] ? ws[0].id : null);
      setActiveId(active || 'default');
      setCache(active, ws.map((w) => w.id));
    } catch (e) {
      setError(e?.message || 'Falha ao carregar workspaces');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await initWorkspaceContext();
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    const res = await base44.functions.invoke('workspaceSetActive', { workspaceId });
    const data = res?.data ?? res;
    if (!data?.ok) throw new Error(data?.error || 'Falha ao trocar de workspace');
    setActiveId(workspaceId);
    setCache(workspaceId, null);
    // Invalida TODAS as queries dependentes do workspace e volta p/ inicio.
    // Garante que nenhum dado do workspace anterior permaneca exibido.
    try { await queryClientInstance.invalidateQueries(); } catch (e) { /* best-effort */ }
    try { await queryClientInstance.clear(); } catch (e) { /* best-effort */ }
    navigate('/');
    return data;
  }, [navigate]);

  const createWorkspace = useCallback(async (name, description, type) => {
    const res = await base44.functions.invoke('workspaceCreate', { name, description, type });
    const data = res?.data ?? res;
    if (!data?.ok) throw new Error(data?.error || 'Falha ao criar workspace');
    await refresh();
    // Troca para o novo workspace automaticamente
    await switchWorkspace(data.workspace_id);
    return data;
  }, [refresh, switchWorkspace]);

  const value = {
    activeWorkspaceId,
    workspaces,
    activeWorkspace: workspaces.find((w) => w.id === activeWorkspaceId) || null,
    loading,
    error,
    refresh,
    switchWorkspace,
    createWorkspace,
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error('useWorkspace deve ser usado dentro de <WorkspaceProvider>');
  return ctx;
}