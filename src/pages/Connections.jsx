import React, { useState, useEffect, useCallback } from "react";
import {
  Mail, Shield, ArrowLeft, Check, X, Plug, Lock,
  RefreshCw, LogOut, Loader2, Play, CheckCircle2, XCircle,
  AlertTriangle, Calendar, HardDrive, User, GitBranch,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  connect, disconnect, reconnect, getConnection, isConnected,
  getMetrics, BASE_SCOPES, WORKSPACE_SCOPES,
} from "@/lib/google-auth/GoogleAuthSession";
import { runGoogleAuthTests } from "@/lib/google-auth/googleAuthTests";
import { runGmailConnectorTests } from "@/lib/google-auth/gmailConnectorTests";
import { runGoogleCalendarConnectorTests } from "@/lib/google-auth/googleCalendarConnectorTests";
import { runGoogleDriveConnectorTests } from "@/lib/google-auth/googleDriveConnectorTests";
import { runGoogleWorkspaceIntegrationTests } from "@/lib/google-auth/googleWorkspaceIntegrationTests";
import { runGoogleOAuth007Tests } from "@/lib/google-auth/googleOAuth007Tests";

// ─── Google Workspace connector card ─────────────────────────────────────────

const GOOGLE_CONNECTOR = {
  id:          "google-workspace",
  name:        "Google Workspace",
  description: "Conecte sua conta Google para habilitar Gmail, Agenda e Drive.",
  workspaceId: "default",
  scopes:      WORKSPACE_SCOPES,
  services: [
    { icon: Mail,     label: "Gmail",         detail: "Ler e-mails" },
    { icon: Calendar, label: "Google Agenda",  detail: "Ver compromissos" },
    { icon: HardDrive,label: "Google Drive",   detail: "Acessar arquivos" },
    { icon: User,     label: "Perfil",         detail: "Nome e e-mail" },
  ],
  privacyNote: "Apenas leitura. Nenhuma ação é executada sem sua confirmação explícita. Você pode desconectar a qualquer momento.",
};

const FUTURE_CONNECTORS = [
  { id: "whatsapp",    name: "WhatsApp",    description: "Enviar e receber mensagens." },
  { id: "shopify",     name: "Shopify",     description: "Pedidos, produtos e clientes." },
  { id: "erp",         name: "ERP",         description: "Dados do sistema interno." },
];

// ─── State label ──────────────────────────────────────────────────────────────

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

// ─── Google Connector Card ────────────────────────────────────────────────────

function GoogleConnectorCard() {
  const [conn, setConn]         = useState(() => getConnection(GOOGLE_CONNECTOR.workspaceId));
  const [authState, setAuth]    = useState(conn?.state ?? "NOT_CONNECTED");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  // Sync conn when state changes
  const syncConn = useCallback(() => {
    setConn(getConnection(GOOGLE_CONNECTOR.workspaceId));
  }, []);

  const onStateChange = useCallback((s) => {
    setAuth(s);
    if (s === "CONNECTED" || s === "NOT_CONNECTED") {
      syncConn();
    }
  }, [syncConn]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await connect({
        workspaceId: GOOGLE_CONNECTOR.workspaceId,
        scopes:      GOOGLE_CONNECTOR.scopes,
        onStateChange,
      });
    } catch (e) {
      setError(e?.message ?? "Falha ao conectar. Tente novamente.");
    } finally {
      setLoading(false);
      syncConn();
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await disconnect(GOOGLE_CONNECTOR.workspaceId, onStateChange);
    } catch (e) {
      setError("Falha ao desconectar.");
    } finally {
      setLoading(false);
      syncConn();
    }
  };

  const handleReconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await reconnect({
        workspaceId: GOOGLE_CONNECTOR.workspaceId,
        scopes:      GOOGLE_CONNECTOR.scopes,
        onStateChange,
      });
    } catch (e) {
      setError("Falha ao reconectar.");
    } finally {
      setLoading(false);
      syncConn();
    }
  };

  const connected = isConnected(GOOGLE_CONNECTOR.workspaceId);

  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      {/* Header */}
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
            <h3 className="font-heading font-semibold text-foreground">{GOOGLE_CONNECTOR.name}</h3>
            {connected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                <Check className="w-3 h-3" /> Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500">
                <X className="w-3 h-3" /> Nao conectado
              </span>
            )}
            {loading && (
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {stateLabel(authState)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{GOOGLE_CONNECTOR.description}</p>
        </div>
      </div>

      {/* Connected account info */}
      {connected && conn && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100 space-y-2">
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">Workspace conectado</span>
            {conn.isReal && (
              <span className="ml-auto px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 text-xs font-bold">OAuth 2.0 Real</span>
            )}
          </div>
          {conn.email && (
            <div className="text-xs text-emerald-700">
              <span className="font-medium">E-mail: </span>{conn.email}
            </div>
          )}
          {conn.displayName && (
            <div className="text-xs text-emerald-700">
              <span className="font-medium">Workspace: </span>{conn.displayName}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1 text-xs text-emerald-600">
            <span><span className="font-medium">Escopos:</span> {conn.scopes?.length ?? 0}</span>
            <span><span className="font-medium">Expira:</span> {new Date(conn.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {conn.lastRefreshedAt && (
            <div className="text-xs text-emerald-600">
              <span className="font-medium">Ultima renovacao:</span> {new Date(conn.lastRefreshedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <div className="text-xs text-emerald-600">
            <span className="font-medium">Status:</span> {conn.state === "CONNECTED" ? "CONNECTED" : conn.state}
          </div>
        </div>
      )}

      {/* Services */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {GOOGLE_CONNECTOR.services.map(({ icon: Icon, label, detail }) => (
          <div key={label} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${connected ? "bg-blue-50/50 text-blue-700" : "bg-zinc-50 text-zinc-400"}`}>
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">{label}</span>
            <span className="text-zinc-400 ml-auto">{detail}</span>
          </div>
        ))}
      </div>

      {/* Privacy note */}
      <p className="text-xs text-muted-foreground/70 mt-3">{GOOGLE_CONNECTOR.privacyNote}</p>

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {!connected ? (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            Conectar com Google
          </button>
        ) : (
          <>
            <button
              onClick={handleReconnect}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 transition"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reconectar
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 disabled:opacity-40 transition"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              Desconectar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── OAuth007 Test Panel — Implementation 007 ────────────────────────────────

function OAuth007TestPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGoogleOAuth007Tests();
      setResults(r);
    } catch (e) {
      setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-semibold text-white">Google OAuth 2.0 Backend</span>
          <span className="text-xs text-zinc-400 ml-1">Implementation 007</span>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 transition"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Validando..." : "Rodar Testes"}
        </button>
      </div>

      {results && (
        <div className="p-4 space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {results.verdict === "PASS"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
          </div>
          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {suite.passed}/{suite.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                    <span className="flex-1 font-mono">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                    <span className="text-zinc-400 shrink-0">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Workspace Integration Validation Panel — Implementation 006 ─────────────

const STATUS_COMPONENTS = [
  { key: "gmailConnector",           label: "Gmail Connector",              impl: "Impl-003" },
  { key: "calendarConnector",        label: "Calendar Connector",           impl: "Impl-004" },
  { key: "driveConnector",           label: "Drive Connector",              impl: "Impl-005" },
  { key: "googleAuthSession",        label: "GoogleAuthSession",            impl: "Impl-001" },
  { key: "connectorInvocationService", label: "ConnectorInvocationService", impl: "CIS" },
  { key: "runtimeIntegration",       label: "Runtime Integration",          impl: "E2E" },
  { key: "oauthTokenExchange",       label: "OAuth Token Exchange",         impl: "Pending" },
];

function StatusBadge({ status }) {
  if (status === "PASS") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
      <CheckCircle2 className="w-3 h-3" /> PASS
    </span>
  );
  if (status === "FAIL") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> FAIL
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
      <AlertTriangle className="w-3 h-3" /> NOT_CONFIGURED
    </span>
  );
}

function WorkspaceIntegrationPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGoogleWorkspaceIntegrationTests();
      setResults(r);
    } catch (e) {
      setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [], componentStatus: {} });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-semibold text-white">Google Workspace Integration</span>
          <span className="text-xs text-zinc-400 ml-1">Implementation 006</span>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 transition"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Validando..." : "Rodar Validacao"}
        </button>
      </div>

      {/* Component grid — always visible */}
      <div className="p-4 grid grid-cols-1 gap-2">
        {STATUS_COMPONENTS.map(({ key, label, impl }) => {
          const status = results?.componentStatus?.[key] ?? null;
          return (
            <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-zinc-50 border border-zinc-100">
              <div className="flex items-center gap-2">
                {status === null
                  ? <div className="w-3 h-3 rounded-full border-2 border-zinc-300" />
                  : status === "PASS"
                  ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  : status === "NOT_CONFIGURED"
                  ? <AlertTriangle className="w-3 h-3 text-amber-500" />
                  : <XCircle className="w-3 h-3 text-red-500" />}
                <span className="text-sm font-medium text-zinc-700">{label}</span>
                <span className="text-xs text-zinc-400">{impl}</span>
              </div>
              {status !== null && <StatusBadge status={status} />}
            </div>
          );
        })}
      </div>

      {/* Overall result + suite breakdown */}
      {results && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 pt-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {results.verdict === "PASS"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
          </div>

          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {suite.passed}/{suite.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                    <span className="flex-1 font-mono">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                    <span className="text-zinc-400 shrink-0">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Drive Test Panel — Implementation 005 ───────────────────────────────────

function DriveTestPanel() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGoogleDriveConnectorTests();
      setResults(r);
    } catch (e) {
      setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-700">Testes — Implementation 005 (GoogleDriveConnector)</span>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Executando..." : "Rodar Testes"}
        </button>
      </div>

      {results && (
        <div className="p-4 space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {results.verdict === "PASS"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
          </div>

          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {suite.passed}/{suite.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                    <span className="flex-1 font-mono">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                    <span className="text-zinc-400 shrink-0">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Calendar Test Panel — Implementation 004 ────────────────────────────────

function CalendarTestPanel() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGoogleCalendarConnectorTests();
      setResults(r);
    } catch (e) {
      setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-700">Testes — Implementation 004 (GoogleCalendarConnector)</span>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Executando..." : "Rodar Testes"}
        </button>
      </div>

      {results && (
        <div className="p-4 space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {results.verdict === "PASS"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
          </div>

          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {suite.passed}/{suite.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                    <span className="flex-1 font-mono">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                    <span className="text-zinc-400 shrink-0">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Gmail Test Panel — Implementation 002 ───────────────────────────────────

function GmailTestPanel() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGmailConnectorTests();
      setResults(r);
    } catch (e) {
      setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-700">Testes — Implementation 002 (GmailConnector)</span>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Executando..." : "Rodar Testes"}
        </button>
      </div>

      {results && (
        <div className="p-4 space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {results.verdict === "PASS"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
          </div>

          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {suite.passed}/{suite.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                    <span className="flex-1 font-mono">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                    <span className="text-zinc-400 shrink-0">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Test Panel ───────────────────────────────────────────────────────────────

function TestPanel() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGoogleAuthTests();
      setResults(r);
    } catch (e) {
      setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-700">Testes — Implementation 001</span>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Executando..." : "Rodar Testes"}
        </button>
      </div>

      {results && (
        <div className="p-4 space-y-3">
          {/* Verdict */}
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {results.verdict === "PASS"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests}</span>
          </div>

          {/* Suite results */}
          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {suite.passed}/{suite.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                    <span className="flex-1 font-mono">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                    <span className="text-zinc-400 shrink-0">{r.duration}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Connections() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <h1 className="text-2xl font-heading font-bold text-foreground">Conectores</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            Conecte seus servicos para ampliar as capacidades do MemoryOS. Cada conexao e opcional —
            voce constroi seu proprio MemoryOS, no seu ritmo.
          </p>
        </div>

        {/* Available */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Disponivel agora
          </h2>
          <GoogleConnectorCard />
        </div>

        {/* OAuth Backend Tests — Implementation 007 */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            OAuth 2.0 Backend — Implementation 007
          </h2>
          <OAuth007TestPanel />
        </div>

        {/* Integration Validation — Implementation 006 */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Google Workspace Integration — Implementation 006
          </h2>
          <WorkspaceIntegrationPanel />
        </div>

        {/* Tests — Implementation 001 */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Validacao — Implementation 001 (GoogleAuthSession)
          </h2>
          <TestPanel />
        </div>

        {/* Tests — Implementation 002 */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Validacao — Implementation 002/003 (GmailConnector + CIS)
          </h2>
          <GmailTestPanel />
        </div>

        {/* Tests — Implementation 004 */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Validacao — Implementation 004 (GoogleCalendarConnector)
          </h2>
          <CalendarTestPanel />
        </div>

        {/* Tests — Implementation 005 */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Validacao — Implementation 005 (GoogleDriveConnector)
          </h2>
          <DriveTestPanel />
        </div>

        {/* Future */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Em breve
          </h2>
          <div className="space-y-2">
            {FUTURE_CONNECTORS.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-muted/30 opacity-60">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy */}
        <div className="p-4 rounded-xl bg-muted/50 border border-border">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Privacidade e Controle</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Toda integracao informa claramente quais dados serao acessados e quais permissoes
                serao concedidas. Voce pode desconectar qualquer servico a qualquer momento. Sua
                memoria permanece preservada — o que pertence a voce, fica com voce.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}