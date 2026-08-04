/**
 * MicrosoftWorkspaceSection — Card de conexao Microsoft 365 (multi-conta).
 *
 * Espelha GoogleWorkspaceSection.jsx: lista todas as contas Microsoft
 * conectadas, permite adicionar mais sem perder as existentes, e permite
 * definir qual conta esta "ativa" (a usada por padrao pelo conector).
 *
 * ADR-014 / RFC-007 — valida o workspaceId fluindo ponta a ponta:
 * o shell do MicrosoftGraphConnector usa getActiveMicrosoftWorkspaceId()
 * como fallback, entao trocar a conta ativa aqui afeta qual token o
 * conector usa nas proximas execucoes.
 */

import { useCallback, useState, useEffect } from "react";
import {
  Mail, Check, X, Plug, Calendar, HardDrive, Users,
  RefreshCw, LogOut, Loader2, AlertTriangle, PlusCircle, Star,
} from "lucide-react";
import { WORKSPACE_SCOPES } from "@/lib/microsoft-auth/MicrosoftAuthSession";
import {
  listMicrosoftAccounts, connectAdditionalMicrosoftAccount,
  disconnectMicrosoftAccount, reconnectMicrosoftAccount,
  getActiveMicrosoftWorkspaceId, setActiveMicrosoftWorkspaceId,
} from "@/lib/microsoft-auth/MicrosoftMultiAccount";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

const BASE_WORKSPACE_ID = getActiveWorkspaceId();

const SERVICES = [
  { icon: Mail,       label: "Outlook Mail",   detail: "Ler e enviar e-mails" },
  { icon: Calendar,   label: "Calendar",        detail: "Ver compromissos" },
  { icon: HardDrive,  label: "OneDrive",        detail: "Acessar arquivos" },
  { icon: Users,      label: "Contacts + To Do", detail: "Contatos e tarefas" },
];

const PRIVACY_NOTE =
  "Refresh tokens ficam apenas no backend. Voce pode desconectar qualquer conta a qualquer momento.";

function stateLabel(state) {
  const map = {
    CONNECTED:      "Conectado",
    AUTHENTICATING: "Autenticando...",
    REFRESHING:     "Renovando token...",
    DISCONNECTED:   "Desconectado",
    NOT_CONNECTED:  "Nao conectado",
  };
  return map[state] ?? state;
}

export default function MicrosoftWorkspaceSection() {
  const [accounts, setAccounts] = useState(() => listMicrosoftAccounts(BASE_WORKSPACE_ID));
  const [activeId, setActiveId]   = useState(() => getActiveMicrosoftWorkspaceId());
  const [authState, setAuth]      = useState("NOT_CONNECTED");
  const [loading, setLoading]     = useState(false);
  const [loadingAccountId, setLoadingAccountId] = useState(null);
  const [error, setError]        = useState(null);

  const syncAccounts = useCallback(() => {
    setAccounts(listMicrosoftAccounts(BASE_WORKSPACE_ID));
    setActiveId(getActiveMicrosoftWorkspaceId());
  }, []);

  // Reage a mudancas de conta ativa feitas por outros componentes.
  useEffect(() => {
    const handler = () => syncAccounts();
    window.addEventListener("memoryos:ms-active-account-changed", handler);
    return () => window.removeEventListener("memoryos:ms-active-account-changed", handler);
  }, [syncAccounts]);

  const onStateChange = useCallback((s) => {
    setAuth(s);
    if (s === "CONNECTED" || s === "NOT_CONNECTED") syncAccounts();
  }, [syncAccounts]);

  const handleConnectNew = async () => {
    setLoading(true); setError(null);
    try {
      const result = await connectAdditionalMicrosoftAccount(BASE_WORKSPACE_ID, WORKSPACE_SCOPES, onStateChange);
      // Se era a primeira conta, define-a como ativa automaticamente.
      if (listMicrosoftAccounts(BASE_WORKSPACE_ID).length === 1) {
        setActiveMicrosoftWorkspaceId(BASE_WORKSPACE_ID);
      }
      return result;
    } catch (e) {
      setError(e?.message ?? "Falha ao conectar. Tente novamente.");
    } finally {
      setLoading(false); syncAccounts();
    }
  };

  const handleDisconnect = async (accountWorkspaceId) => {
    setLoadingAccountId(accountWorkspaceId); setError(null);
    try { await disconnectMicrosoftAccount(accountWorkspaceId, onStateChange); }
    catch { setError("Falha ao desconectar essa conta."); }
    finally { setLoadingAccountId(null); syncAccounts(); }
  };

  const handleReconnect = async (accountWorkspaceId) => {
    setLoadingAccountId(accountWorkspaceId); setError(null);
    try {
      await reconnectMicrosoftAccount(accountWorkspaceId, WORKSPACE_SCOPES, onStateChange);
    } catch (e) {
      setError(e?.message ?? "Falha ao reconectar.");
    } finally { setLoadingAccountId(null); syncAccounts(); }
  };

  const handleSetActive = (accountWorkspaceId) => {
    setActiveMicrosoftWorkspaceId(accountWorkspaceId);
    syncAccounts();
  };

  const connectedAccounts = accounts.filter((c) => c.state === "CONNECTED");
  const hasAnyConnected = connectedAccounts.length > 0;

  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#0078D4]/10 border border-[#0078D4]/20 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 23 23" className="w-7 h-7" fill="none">
            <path fill="#F25022" d="M1 1h10v10H1z"/>
            <path fill="#7FBA00" d="M12 1h10v10H12z"/>
            <path fill="#00A4EF" d="M1 12h10v10H1z"/>
            <path fill="#FFB900" d="M12 12h10v10H12z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-foreground">Microsoft 365</h3>
            {hasAnyConnected
              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><Check className="w-3 h-3" /> {connectedAccounts.length} conta{connectedAccounts.length > 1 ? "s" : ""} conectada{connectedAccounts.length > 1 ? "s" : ""}</span>
              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500"><X className="w-3 h-3" /> Nenhuma conta conectada</span>}
            {loading && (
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />{stateLabel(authState)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Conecte uma ou mais contas Microsoft para habilitar Outlook, Calendar, OneDrive e mais.</p>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="mt-4 space-y-2">
          {accounts.map((conn) => {
            const isActive = conn.workspaceId === activeId;
            return (
              <div key={conn.workspaceId} className={`p-3 rounded-lg border space-y-2 ${isActive ? "bg-[#0078D4]/5 border-[#0078D4]/30" : "bg-emerald-50 border-emerald-100"}`}>
                <div className="flex items-center gap-2 text-xs">
                  <Check className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-[#0078D4]" : "text-emerald-700"}`} />
                  <span className={`font-semibold ${isActive ? "text-[#0078D4]" : "text-emerald-700"}`}>{conn.email || "Conta Microsoft"}</span>
                  {isActive && (
                    <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0078D4] text-white text-[10px] font-bold uppercase tracking-wide">
                      <Star className="w-2.5 h-2.5" /> Ativa
                    </span>
                  )}
                  {conn.isReal && !isActive && <span className="ml-auto px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 text-xs font-bold">OAuth 2.0 Real</span>}
                </div>
                {conn.displayName && <div className={`text-xs ${isActive ? "text-[#0078D4]/80" : "text-emerald-700"}`}><span className="font-medium">Nome: </span>{conn.displayName}</div>}
                <div className={`grid grid-cols-2 gap-1 text-xs ${isActive ? "text-[#0078D4]/70" : "text-emerald-600"}`}>
                  <span><span className="font-medium">Escopos:</span> {conn.scopes?.length ?? 0}</span>
                  <span><span className="font-medium">Expira:</span> {conn.expiresAt ? new Date(conn.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                </div>
                <div className={`text-xs ${isActive ? "text-[#0078D4]/70" : "text-emerald-600"}`}><span className="font-medium">Status:</span> {conn.state}</div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {!isActive && (
                    <button onClick={() => handleSetActive(conn.workspaceId)} disabled={loadingAccountId === conn.workspaceId}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#0078D4] text-white hover:bg-[#106EBE] border border-[#0078D4] disabled:opacity-40 transition">
                      <Star className="w-3 h-3" />
                      Definir como ativa
                    </button>
                  )}
                  <button onClick={() => handleReconnect(conn.workspaceId)} disabled={loadingAccountId === conn.workspaceId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white text-zinc-700 hover:bg-zinc-50 border border-zinc-200 disabled:opacity-40 transition">
                    {loadingAccountId === conn.workspaceId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Reconectar
                  </button>
                  <button onClick={() => handleDisconnect(conn.workspaceId)} disabled={loadingAccountId === conn.workspaceId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 disabled:opacity-40 transition">
                    {loadingAccountId === conn.workspaceId ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                    Desconectar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {SERVICES.map(({ icon: Icon, label, detail }) => (
          <div key={label} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${hasAnyConnected ? "bg-[#0078D4]/5 text-[#0078D4]" : "bg-zinc-50 text-zinc-400"}`}>
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">{label}</span>
            <span className="text-zinc-400 ml-auto">{detail}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/70 mt-3">{PRIVACY_NOTE}</p>

      {error && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button onClick={handleConnectNew} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (hasAnyConnected ? <PlusCircle className="w-4 h-4" /> : <Plug className="w-4 h-4" />)}
          {hasAnyConnected ? "Adicionar outra conta Microsoft" : "Conectar com Microsoft"}
        </button>
      </div>
    </div>
  );
}