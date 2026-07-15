/**
 * WorkspaceProvider — Engineering Sprint E-01
 * Provider React centralizado para estado do Workspace Google.
 *
 * Fornece: connection, status, profile, metrics.
 * Elimina duplicacao de estado entre componentes de UI.
 * Nao armazena tokens. Nao gerencia OAuth diretamente.
 */

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  getConnection, isConnected, getMetrics,
  connect, disconnect, reconnect,
  WORKSPACE_SCOPES,
} from "@/lib/google-auth/GoogleAuthSession";
import { getActiveWorkspaceId } from "./WorkspaceContext";

const WorkspaceCtx = createContext(null);

export function WorkspaceProvider({ children }) {
  const workspaceId = getActiveWorkspaceId();

  const [connection, setConnection] = useState(() => getConnection(workspaceId));
  const [authState, setAuthState]   = useState(() => connection?.state ?? "NOT_CONNECTED");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const sync = useCallback(() => {
    setConnection(getConnection(workspaceId));
  }, [workspaceId]);

  const onStateChange = useCallback((s) => {
    setAuthState(s);
    if (s === "CONNECTED" || s === "NOT_CONNECTED") sync();
  }, [sync]);

  const handleConnect = useCallback(async (scopes = WORKSPACE_SCOPES) => {
    setLoading(true);
    setError(null);
    try {
      await connect({ workspaceId, scopes, onStateChange });
    } catch (e) {
      setError(e?.message ?? "Falha ao conectar.");
    } finally {
      setLoading(false);
      sync();
    }
  }, [workspaceId, onStateChange, sync]);

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await disconnect(workspaceId, onStateChange);
    } catch {
      setError("Falha ao desconectar.");
    } finally {
      setLoading(false);
      sync();
    }
  }, [workspaceId, onStateChange, sync]);

  const handleReconnect = useCallback(async (scopes = WORKSPACE_SCOPES) => {
    setLoading(true);
    setError(null);
    try {
      await reconnect({ workspaceId, scopes, onStateChange });
    } catch (e) {
      setError(e?.message ?? "Falha ao reconectar.");
    } finally {
      setLoading(false);
      sync();
    }
  }, [workspaceId, onStateChange, sync]);

  const connected = isConnected(workspaceId);
  const metrics   = getMetrics();

  const value = {
    workspaceId,
    connection,
    authState,
    connected,
    loading,
    error,
    metrics,
    connect:    handleConnect,
    disconnect: handleDisconnect,
    reconnect:  handleReconnect,
    sync,
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}