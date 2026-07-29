/**
 * GoogleWorkspaceSection — Engineering Sprint E-01 + Multi-Account
 * Card de conexao Google Workspace extraido de Connections.jsx.
 *
 * FEATURE (múltiplas contas Google): antes só permitia conectar UMA
 * conta por vez (conectar uma segunda sobrescrevia a primeira). Agora
 * mostra a lista de todas as contas conectadas e permite adicionar mais
 * uma sem perder as existentes. Ver GoogleMultiAccount.js pro porquê
 * disso ser seguro (o armazenamento já suportava isso, só a tela não
 * expunha).
 */

import { useCallback, useState } from "react";
import {
  Mail, Check, X, Plug, Calendar, HardDrive, User,
  RefreshCw, LogOut, Loader2, AlertTriangle, PlusCircle,
} from "lucide-react";
import { WORKSPACE_SCOPES } from "@/lib/google-auth/GoogleAuthSession";
import {
  listGoogleAccounts, connectAdditionalGoogleAccount,
  disconnectGoogleAccount, reconnectGoogleAccount,
} from "@/lib/google-auth/GoogleMultiAccount";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

const BASE_WORKSPACE_ID = getActiveWorkspaceId();

const SERVICES = [
  { icon: Mail,      label: "Gmail",        detail: "Ler e-mails" },
  { icon: Calendar,  label: "Google Agenda", detail: "Ver compromissos" },
  { icon: HardDrive, label: "Google Drive",  detail: "Acessar arquivos" },
  { icon: User,      label: "Perfil",        detail: "Nome e e-mail" },
];

const PRIVACY_NOTE =
  "Apenas leitura. Nenhuma acao e executada sem sua confirmacao explicita. Voce pode desconectar a qualquer momento.";

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

export default function GoogleWorkspaceSection() {
  const [accounts, setAccounts] = useState(() => listGoogleAccounts(BASE_WORKSPACE_ID));
  const [authState, setAuth]    = useState("NOT_CONNECTED");
  const [loading, setLoading]   = useState(false);
  const [loadingAccountId, setLoadingAccountId] = useState(null);
  const [error, setError]       = useState(null);
  const [audit, setAudit]       = useState(null);

  const syncAccounts = useCallback(() => setAccounts(listGoogleAccounts(BASE_WORKSPACE_ID)), []);

  const onStateChange = useCallback((s) => {
    setAuth(s);
    if (s === "CONNECTED" || s === "NOT_CONNECTED") syncAccounts();
  }, [syncAccounts]);

  const handleConnectNew = async () => {
    setLoading(true); setError(null); setAudit(null);
    try {
      const result = await connectAdditionalGoogleAccount(BASE_WORKSPACE_ID, WORKSPACE_SCOPES, onStateChange);
      setAudit({ phase: "SUCCESS", result });
    } catch (e) {
      setError(e?.message ?? "Falha ao conectar. Tente novamente.");
      if (e?._audit) setAudit(e._audit);
    }
    finally { setLoading(false); syncAccounts(); }
  };

  const handleDisconnect = async (accountWorkspaceId) => {
    setLoadingAccountId(accountWorkspaceId); setError(null);
    try { await disconnectGoogleAccount(accountWorkspaceId, onStateChange); }
    catch { setError("Falha ao desconectar essa conta."); }
    finally { setLoadingAccountId(null); syncAccounts(); }
  };

  const handleReconnect = async (accountWorkspaceId) => {
    setLoadingAccountId(accountWorkspaceId); setError(null); setAudit(null);
    try {
      await reconnectGoogleAccount(accountWorkspaceId, WORKSPACE_SCOPES, onStateChange);
      setAudit({ phase: "SUCCESS" });
    } catch (e) {
      setError(e?.message ?? "Falha ao reconectar.");
      if (e?._audit) setAudit(e._audit);
    }
    finally { setLoadingAccountId(null); syncAccounts(); }
  };

  const connectedAccounts = accounts.filter((c) => c.state === "CONNECTED");
  const hasAnyConnected = connectedAccounts.length > 0;

  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-foreground">Google Workspace</h3>
            {hasAnyConnected
              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><Check className="w-3 h-3" /> {connectedAccounts.length} conta{connectedAccounts.length > 1 ? "s" : ""} conectada{connectedAccounts.length > 1 ? "s" : ""}</span>
              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500"><X className="w-3 h-3" /> Nenhuma conta conectada</span>}
            {loading && (
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />{stateLabel(authState)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Conecte uma ou mais contas Google para habilitar Gmail, Agenda e Drive.</p>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="mt-4 space-y-2">
          {accounts.map((conn) => (
            <div key={conn.workspaceId} className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold">{conn.email || "Conta Google"}</span>
                {conn.isReal && <span className="ml-auto px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 text-xs font-bold">OAuth 2.0 Real</span>}
              </div>
              {conn.displayName && <div className="text-xs text-emerald-700"><span className="font-medium">Nome: </span>{conn.displayName}</div>}
              <div className="grid grid-cols-2 gap-1 text-xs text-emerald-600">
                <span><span className="font-medium">Escopos:</span> {conn.scopes?.length ?? 0}</span>
                <span><span className="font-medium">Expira:</span> {conn.expiresAt ? new Date(conn.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
              </div>
              <div className="text-xs text-emerald-600"><span className="font-medium">Status:</span> {conn.state}</div>
              <div className="flex items-center gap-2 pt-1">
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
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {SERVICES.map(({ icon: Icon, label, detail }) => (
          <div key={label} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${hasAnyConnected ? "bg-blue-50/50 text-blue-700" : "bg-zinc-50 text-zinc-400"}`}>
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

      {audit && (
        <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-700">
            <span className="text-[10px] font-mono font-bold tracking-widest text-violet-400">
              [EXCHANGE AUDIT] — {audit.phase ?? "CAPTURED"}
            </span>
            <button onClick={() => setAudit(null)} className="text-zinc-500 hover:text-zinc-300 text-xs ml-3">✕</button>
          </div>
          <pre className="text-[10px] font-mono text-zinc-300 p-3 overflow-auto max-h-72 whitespace-pre-wrap break-all">
            {JSON.stringify(audit, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button onClick={handleConnectNew} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (hasAnyConnected ? <PlusCircle className="w-4 h-4" /> : <Plug className="w-4 h-4" />)}
          {hasAnyConnected ? "Adicionar outra conta Google" : "Conectar com Google"}
        </button>
      </div>
    </div>
  );
}
