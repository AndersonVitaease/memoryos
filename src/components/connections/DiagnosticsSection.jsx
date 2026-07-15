/**
 * DiagnosticsSection — Engineering Sprint E-01
 * Paineis de diagnostico OAuth e testes extraidos de Connections.jsx.
 */

import { useState } from "react";
import { GitBranch, Loader2, Play, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { runGoogleAuthTests } from "@/lib/google-auth/googleAuthTests";
import { runGmailConnectorTests } from "@/lib/google-auth/gmailConnectorTests";
import { runGoogleCalendarConnectorTests } from "@/lib/google-auth/googleCalendarConnectorTests";
import { runGoogleDriveConnectorTests } from "@/lib/google-auth/googleDriveConnectorTests";
import { runGoogleWorkspaceIntegrationTests } from "@/lib/google-auth/googleWorkspaceIntegrationTests";
import { runGoogleOAuth007Tests } from "@/lib/google-auth/googleOAuth007Tests";

// ── Shared sub-components ─────────────────────────────────────────────────────

function SuiteResult({ results }) {
  if (!results) return null;
  return (
    <div className="p-4 space-y-3">
      <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
        {results.verdict === "PASS" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
        <span>{results.architecturalStatus}</span>
        <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
      </div>
      {results.suites?.map((suite) => (
        <div key={suite.suite}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
            <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>{suite.passed}/{suite.total}</span>
          </div>
          <div className="space-y-0.5">
            {suite.results?.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                {r.passed ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                <span className="flex-1 font-mono">{r.name}</span>
                {!r.passed && <span className="text-red-400 truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                <span className="text-zinc-400 shrink-0">{r.durationMs ?? r.duration}ms</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TestPanel({ title, impl, darkHeader = false, runFn }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true); setResults(null);
    try { setResults(await runFn()); }
    catch (e) { setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] }); }
    finally { setRunning(false); }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${darkHeader ? "bg-zinc-900 border-zinc-700" : "bg-zinc-50 border-zinc-200"}`}>
        <div className="flex items-center gap-2">
          <GitBranch className={`w-4 h-4 ${darkHeader ? "text-zinc-300" : "text-zinc-500"}`} />
          <span className={`text-sm font-semibold ${darkHeader ? "text-white" : "text-zinc-700"}`}>{title}</span>
          {impl && <span className={`text-xs ml-1 ${darkHeader ? "text-zinc-400" : "text-zinc-400"}`}>{impl}</span>}
        </div>
        <button onClick={handleRun} disabled={running}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 transition ${darkHeader ? "bg-white text-zinc-900 hover:bg-zinc-100" : "bg-zinc-900 text-white hover:bg-zinc-800"}`}>
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Executando..." : "Rodar Testes"}
        </button>
      </div>
      <SuiteResult results={results} />
    </div>
  );
}

// ── OAuth Init Diagnostics ────────────────────────────────────────────────────

export function OAuthInitDiagnosticsPanel() {
  const [running, setRunning] = useState(false);
  const [diag, setDiag]       = useState(null);

  const handleRun = async () => {
    setRunning(true); setDiag(null);
    const origin = window.location.origin;
    const redirectUri = `${origin}/oauth/google/callback`;
    let result = null; let error = null;
    try {
      const res = await base44.functions.invoke("googleOAuthInit", {
        scopes: ["openid","https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/userinfo.profile","https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/calendar","https://www.googleapis.com/auth/drive"],
        redirectUri,
      });
      const authUrl = res.data?.authUrl ?? "";
      let parsedRedirectUri = null, parsedClientId = null;
      try { const u = new URL(authUrl); parsedRedirectUri = u.searchParams.get("redirect_uri"); parsedClientId = u.searchParams.get("client_id"); } catch (_) {}
      result = { windowLocationOrigin: origin, redirectUriSentToFunction: redirectUri, authUrlComplete: authUrl, redirectUriInAuthUrl: parsedRedirectUri, clientId: parsedClientId };
    } catch (e) { error = e?.message ?? String(e); }
    setDiag({ result, error });
    setRunning(false);
  };

  return (
    <div className="border border-amber-300 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200">
        <span className="text-sm font-semibold text-amber-800">Diagnostico — OAuth Init (sem abrir popup)</span>
        <button onClick={handleRun} disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-800 text-white hover:bg-amber-700 disabled:opacity-40 transition">
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Coletando..." : "Executar diagnostico"}
        </button>
      </div>
      {diag && (
        <div className="p-4 space-y-3 font-mono text-xs bg-white">
          {diag.error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700"><span className="font-bold">ERRO:</span> {diag.error}</div>}
          {diag.result && Object.entries(diag.result).map(([key, val]) => (
            <div key={key} className="space-y-0.5">
              <div className="text-zinc-400 uppercase tracking-wide text-[10px]">{key}</div>
              <div className="break-all bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 text-zinc-800 select-all">{val ?? "(null)"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Workspace Integration Status ──────────────────────────────────────────────

const STATUS_COMPONENTS = [
  { key: "gmailConnector",             label: "Gmail Connector",            impl: "Impl-003" },
  { key: "calendarConnector",          label: "Calendar Connector",         impl: "Impl-004" },
  { key: "driveConnector",             label: "Drive Connector",            impl: "Impl-005" },
  { key: "googleAuthSession",          label: "GoogleAuthSession",          impl: "Impl-001" },
  { key: "connectorInvocationService", label: "ConnectorInvocationService", impl: "CIS" },
  { key: "runtimeIntegration",         label: "Runtime Integration",        impl: "E2E" },
  { key: "oauthTokenExchange",         label: "OAuth Token Exchange",       impl: "Pending" },
];

function StatusBadge({ status }) {
  if (status === "PASS")           return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> PASS</span>;
  if (status === "FAIL")           return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><XCircle className="w-3 h-3" /> FAIL</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><AlertTriangle className="w-3 h-3" /> NOT_CONFIGURED</span>;
}

export function WorkspaceIntegrationPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true); setResults(null);
    try { setResults(await runGoogleWorkspaceIntegrationTests()); }
    catch (e) { setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [], componentStatus: {} }); }
    finally { setRunning(false); }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-semibold text-white">Google Workspace Integration</span>
          <span className="text-xs text-zinc-400 ml-1">Implementation 006</span>
        </div>
        <button onClick={handleRun} disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 transition">
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Validando..." : "Rodar Validacao"}
        </button>
      </div>
      <div className="p-4 grid grid-cols-1 gap-2">
        {STATUS_COMPONENTS.map(({ key, label, impl }) => {
          const status = results?.componentStatus?.[key] ?? null;
          return (
            <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-zinc-50 border border-zinc-100">
              <div className="flex items-center gap-2">
                {status === null ? <div className="w-3 h-3 rounded-full border-2 border-zinc-300" />
                  : status === "PASS" ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  : status === "NOT_CONFIGURED" ? <AlertTriangle className="w-3 h-3 text-amber-500" />
                  : <XCircle className="w-3 h-3 text-red-500" />}
                <span className="text-sm font-medium text-zinc-700">{label}</span>
                <span className="text-xs text-zinc-400">{impl}</span>
              </div>
              {status !== null && <StatusBadge status={status} />}
            </div>
          );
        })}
      </div>
      {results && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 pt-3">
          <SuiteResult results={results} />
        </div>
      )}
    </div>
  );
}

// ── Exported test panels ──────────────────────────────────────────────────────

export function OAuth007TestPanel() {
  return <TestPanel title="Google OAuth 2.0 Backend" impl="Implementation 007" darkHeader runFn={runGoogleOAuth007Tests} />;
}

export function AuthTestPanel() {
  return <TestPanel title="Testes — Implementation 001" runFn={runGoogleAuthTests} />;
}

export function GmailCISTestPanel() {
  return <TestPanel title="Testes — Implementation 002/003 (GmailConnector + CIS)" runFn={runGmailConnectorTests} />;
}

export function CalendarTestPanel() {
  return <TestPanel title="Testes — Implementation 004 (GoogleCalendarConnector)" runFn={runGoogleCalendarConnectorTests} />;
}

export function DriveTestPanel() {
  return <TestPanel title="Testes — Implementation 005 (GoogleDriveConnector)" runFn={runGoogleDriveConnectorTests} />;
}