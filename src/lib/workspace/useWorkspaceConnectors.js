/**
 * useWorkspaceConnectors.js — Hook React para a Workspace Connector Layer (Fase 4).
 *
 * Lista WorkspaceConnectors do workspace ativo + catalogo global de ConnectorDefinitions.
 * Mutacoes (connect/disconnect/setEnabled) via backend connectorWorkspace (unica via).
 * Reativo a troca de workspace (useWorkspace).
 */
import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";

export function useWorkspaceConnectors() {
  const { activeWorkspaceId } = useWorkspace();
  const [connectors, setConnectors] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [role, setRole] = useState("member");

  const refresh = useCallback(async () => {
    if (!activeWorkspaceId || activeWorkspaceId === "default") {
      setConnectors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listRes, catRes] = await Promise.all([
        base44.functions.invoke("connectorWorkspace", { operation: "list" }),
        base44.functions.invoke("connectorWorkspace", { operation: "catalog" }),
      ]);
      const lData = listRes?.data ?? listRes;
      const cData = catRes?.data ?? catRes;
      if (lData?.ok) {
        setConnectors(lData.connectors || []);
        setRole(lData.role || "member");
      } else {
        setError(lData?.error || "Falha ao listar connectors");
      }
      if (cData?.ok) setCatalog(cData.catalog || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = useCallback(async (params) => {
    const res = await base44.functions.invoke("connectorWorkspace", { operation: "connect", ...params });
    const data = res?.data ?? res;
    if (!data?.ok) throw new Error(data?.error || "Falha ao conectar");
    await refresh();
    return data;
  }, [refresh]);

  const disconnect = useCallback(async (connectorId, credentialOwnerId) => {
    const res = await base44.functions.invoke("connectorWorkspace", { operation: "disconnect", connectorId, credentialOwnerId });
    const data = res?.data ?? res;
    if (!data?.ok) throw new Error(data?.error || "Falha ao desconectar");
    await refresh();
    return data;
  }, [refresh]);

  const setEnabled = useCallback(async (connectorId, enabled, credentialOwnerId) => {
    const res = await base44.functions.invoke("connectorWorkspace", { operation: "setEnabled", connectorId, enabled, credentialOwnerId });
    const data = res?.data ?? res;
    if (!data?.ok) throw new Error(data?.error || "Falha ao alterar enabled");
    await refresh();
    return data;
  }, [refresh]);

  const adminListAll = useCallback(async () => {
    const res = await base44.functions.invoke("connectorWorkspace", { operation: "adminListAll" });
    const data = res?.data ?? res;
    if (!data?.ok) throw new Error(data?.error || "Falha ao listar");
    return data.connectors || [];
  }, []);

  // Map de connector_id -> lista de WorkspaceConnectors (agrupa conexoes de multiplos users)
  const connectorsByDef = useCallback(() => {
    const map = {};
    for (const c of connectors) {
      (map[c.connector_id] ??= []).push(c);
    }
    return map;
  }, [connectors]);

  return {
    connectors,
    catalog,
    connectorsByDef: connectorsByDef(),
    loading,
    error,
    role,
    isAdmin: role === "owner" || role === "admin",
    refresh,
    connect,
    disconnect,
    setEnabled,
    adminListAll,
  };
}