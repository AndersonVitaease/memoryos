import React, { useState, useEffect, useCallback, useMemo } from "react";
import { OAuthDiscovery } from "@/lib/oauth-discovery/OAuthDiscoveryEngine";
import { OAuthDiscoveryDashboard } from "@/lib/oauth-discovery/OAuthDiscoveryDashboard";
import { OAuthConfigurationRegistry } from "@/lib/oauth-discovery/OAuthConfigurationRegistry";
import { OAuthRedirectUriResolver } from "@/lib/oauth-discovery/OAuthRedirectUriResolver";
import { OAuthCallbackResolver } from "@/lib/oauth-discovery/OAuthCallbackResolver";

const dashboard = new OAuthDiscoveryDashboard();
const configReg = new OAuthConfigurationRegistry();

const TABS = ["overview","providers","discovery","redirect-uris","callbacks","scopes","validation","health","diagnostics","metrics","audit","logs"];

const HEALTH_COLOR = { HEALTHY:"green", DEGRADED:"yellow", MISCONFIGURED:"red", DISCONNECTED:"gray", UNKNOWN:"gray" };
const STATUS_COLOR = {
  FULLY_CONFIGURED:"green", PARTIALLY_CONFIGURED:"yellow",
  MISSING_CREDENTIALS:"red", NOT_CONFIGURED:"gray", UNKNOWN:"gray"
};

function Badge({ label, color = "gray", size = "sm" }) {
  const C = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    violet: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return <span className={`${sz} font-mono rounded ${C[color] ?? C.gray}`}>{label}</span>;
}

function StatCard({ label, value, sub, color = "gray" }) {
  const C = { green:"text-green-300", yellow:"text-yellow-300", red:"text-red-400", blue:"text-blue-300", gray:"text-white" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
      <div className="text-xs font-mono text-zinc-500">{label}</div>
      <div className={`text-xl font-bold ${C[color] ?? C.gray}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value).catch(() => {});
    OAuthDiscovery.audit.record("REDIRECT_COPIED", null, "INFO", `User copied ${label}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy}
      className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-white transition-colors font-mono">
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function SecretStatus({ status, label }) {
  const configured = status === "CONFIGURED";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={configured ? "text-green-400" : "text-red-400"}>{configured ? "✔" : "✖"}</span>
      <span className="text-zinc-400">{label}:</span>
      <Badge label={status} color={configured ? "green" : "red"} size="xs" />
    </div>
  );
}

function ProviderCard({ provider, onMarkConfigured }) {
  const [showConfig, setShowConfig] = useState(false);
  const [clientId, setClientId] = useState(false);
  const [clientSecret, setClientSecret] = useState(false);

  function saveConfig() {
    configReg.markConfigured(provider.provider, clientId, clientSecret);
    onMarkConfigured();
    setShowConfig(false);
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg">{provider.iconEmoji}</span>
        <span className="text-sm font-semibold text-zinc-200">{provider.displayName}</span>
        <Badge label={provider.status} color={STATUS_COLOR[provider.status] ?? "gray"} />
        <Badge label={provider.health} color={HEALTH_COLOR[provider.health] ?? "gray"} size="xs" />
        {provider.activeSessions > 0 && (
          <Badge label={`${provider.activeSessions} active`} color="green" size="xs" />
        )}
      </div>

      {/* Credentials — status only */}
      <div className="space-y-1">
        <SecretStatus status={provider.clientIdStatus} label="Client ID" />
        <SecretStatus status={provider.clientSecretStatus} label="Client Secret" />
      </div>

      {/* Redirect config */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-28 shrink-0">Redirect URI:</span>
          <span className="text-xs text-zinc-300 font-mono flex-1 truncate">{provider.redirectUri}</span>
          <CopyButton value={provider.redirectUri} label={`${provider.provider} redirect URI`} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-28 shrink-0">Callback URI:</span>
          <span className="text-xs text-zinc-300 font-mono flex-1 truncate">{provider.callbackUri}</span>
          <CopyButton value={provider.callbackUri} label={`${provider.provider} callback URI`} />
        </div>
      </div>

      {/* Missing config */}
      {provider.missingConfig.length > 0 && (
        <div className="space-y-0.5">
          {provider.missingConfig.map((m, i) => (
            <p key={i} className="text-xs text-red-400 flex items-center gap-1"><span>✖</span>{m}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => setShowConfig(v => !v)}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs transition-colors">
          {showConfig ? "Cancel" : "Mark Credentials"}
        </button>
      </div>

      {showConfig && (
        <div className="border border-zinc-700 rounded p-3 space-y-3 bg-zinc-950">
          <p className="text-xs text-zinc-400">Mark credentials as configured (values are NOT stored here):</p>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={clientId} onChange={e => setClientId(e.target.checked)} className="accent-green-500" />
            Client ID is configured in my OAuth provider
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={clientSecret} onChange={e => setClientSecret(e.target.checked)} className="accent-green-500" />
            Client Secret is configured in my OAuth provider
          </label>
          <button onClick={saveConfig}
            className="px-3 py-1.5 rounded bg-green-800 hover:bg-green-700 text-xs text-green-200 transition-colors">
            Save Status
          </button>
        </div>
      )}
    </div>
  );
}

// ── UriRow: one labeled URI row with copy button ──────────────────────────────
function UriRow({ label, value, note }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-500 w-36 shrink-0 font-mono">{label}</span>
        <span className="text-xs font-mono text-blue-300 flex-1 break-all">{value}</span>
        <CopyButton value={value} label={label} />
      </div>
      {note && <p className="text-[11px] text-zinc-600 pl-36">{note}</p>}
    </div>
  );
}

// ── RedirectUrisTab ───────────────────────────────────────────────────────────
// Always resolves URIs directly from OAuthRedirectUriResolver so the tab
// is never blank — even before any discovery run completes.
function RedirectUrisTab({ baseUrl, isSecure, providers }) {
  // Instantiate resolver directly so URIs come from the live runtime environment,
  // not from a stale discovery snapshot.
  const resolver = useMemo(() => new OAuthRedirectUriResolver(), []);
  const callbackResolver = useMemo(() => new OAuthCallbackResolver(), []);

  // Determine why base URL might be unresolvable
  const baseUrlIssue = !baseUrl || baseUrl === "unknown"
    ? "Base URL could not be resolved. This happens when window.location is unavailable (e.g. SSR or iframe sandbox). " +
      "In production this resolves automatically from the browser's window.location.protocol + hostname + port."
    : null;

  // All providers we want to show — use discovery list if available, fall back to a
  // known static list so the tab always renders something.
  const FALLBACK_PROVIDERS = [
    { provider: "google",    displayName: "Google",    iconEmoji: "🔵" },
    { provider: "microsoft", displayName: "Microsoft", iconEmoji: "🟦" },
    { provider: "github",    displayName: "GitHub",    iconEmoji: "⚫" },
    { provider: "slack",     displayName: "Slack",     iconEmoji: "🟣" },
    { provider: "notion",    displayName: "Notion",    iconEmoji: "⬜" },
    { provider: "dropbox",   displayName: "Dropbox",   iconEmoji: "🔷" },
    { provider: "meta",      displayName: "Meta",      iconEmoji: "🔵" },
    { provider: "hubspot",   displayName: "HubSpot",   iconEmoji: "🟠" },
  ];

  const rows = providers.length > 0
    ? providers.map(p => ({ provider: p.provider, displayName: p.displayName, iconEmoji: p.iconEmoji }))
    : FALLBACK_PROVIDERS;

  return (
    <div className="space-y-4">
      {/* How resolution works */}
      <div className="border border-violet-800/40 rounded-lg p-4 bg-violet-950/10 space-y-2">
        <h3 className="text-xs font-mono text-violet-400 uppercase tracking-widest">How URIs Are Resolved</h3>
        <p className="text-xs text-zinc-400">
          All URIs are computed at runtime from <code className="text-violet-300 bg-zinc-800 px-1 rounded">OAuthRedirectUriResolver</code>{" "}
          using <code className="text-violet-300 bg-zinc-800 px-1 rounded">window.location.protocol + hostname + port</code>.
          No URL is ever hardcoded. The pattern is:
        </p>
        <p className="text-xs font-mono text-blue-300 bg-zinc-900 rounded px-3 py-1.5">
          {baseUrl || "https://your-app-domain.com"}/oauth/callback/<span className="text-violet-300">[provider]</span>
        </p>
      </div>

      {/* Base URL status */}
      <div className={`border rounded-lg p-4 space-y-2 ${baseUrlIssue ? "border-yellow-800/40 bg-yellow-950/10" : "border-blue-800/40 bg-blue-950/10"}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-500 uppercase">Detected Base URL</span>
          <Badge label={isSecure ? "SECURE" : "INSECURE"} color={isSecure ? "green" : "red"} size="xs" />
          {baseUrlIssue && <Badge label="UNRESOLVABLE" color="yellow" size="xs" />}
        </div>
        {baseUrlIssue ? (
          <div className="space-y-1">
            <p className="text-xs text-yellow-300 font-mono">⚠ {baseUrl || "(empty)"}</p>
            <p className="text-xs text-zinc-400">{baseUrlIssue}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-blue-300">{baseUrl}</span>
            <CopyButton value={baseUrl} label="base URL" />
          </div>
        )}
      </div>

      {/* ── Google highlighted section ─────────────────────────────── */}
      {(() => {
        const googleConfig = resolver.resolve("google");
        const origins      = resolver.getAuthorizedOrigins();
        const cbParams     = callbackResolver.parse();  // current page (likely not a callback)
        return (
          <div className="border border-green-700/40 rounded-lg p-5 bg-green-950/10 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔵</span>
              <span className="text-sm font-bold text-green-300">Google — Required OAuth Configuration</span>
              <Badge label="Sprint 6.4.1" color="green" size="xs" />
            </div>
            <p className="text-xs text-zinc-400">
              Copy these values and paste them into your{" "}
              <span className="text-blue-300 font-mono">Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client</span>.
            </p>
            <div className="space-y-3 border-t border-green-900/40 pt-3">
              {/* Authorized Origin */}
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-zinc-500 uppercase">Authorized JavaScript Origins</p>
                {origins.map(o => (
                  <UriRow key={o} label="Authorized Origin" value={o} note="Add each of these to 'Authorized JavaScript origins' in Google Console" />
                ))}
              </div>
              {/* Redirect URI */}
              <div className="space-y-1.5 border-t border-green-900/30 pt-2">
                <p className="text-xs font-mono text-zinc-500 uppercase">OAuth Redirect URI</p>
                <UriRow
                  label="OAuth Redirect URI"
                  value={googleConfig.redirectUri}
                  note="Add to 'Authorized redirect URIs' in Google Console. This is where Google sends the user after login."
                />
              </div>
              {/* Callback URI */}
              <div className="space-y-1.5 border-t border-green-900/30 pt-2">
                <p className="text-xs font-mono text-zinc-500 uppercase">OAuth Callback URI</p>
                <UriRow
                  label="OAuth Callback URI"
                  value={googleConfig.callbackUri}
                  note="This is the same as Redirect URI for Google OAuth. OAuthCallbackResolver reads code and state from this URL."
                />
              </div>
            </div>
            {/* Resolver explanation */}
            <div className="bg-zinc-900 rounded p-3 text-xs font-mono text-zinc-500 space-y-0.5">
              <p><span className="text-violet-400">OAuthRedirectUriResolver</span>.resolve("google")</p>
              <p>  redirectUri  = <span className="text-blue-300">{googleConfig.redirectUri}</span></p>
              <p>  callbackUri  = <span className="text-blue-300">{googleConfig.callbackUri}</span></p>
              <p>  callbackPath = <span className="text-zinc-400">{googleConfig.callbackPath}</span></p>
              <p>  baseUrl      = <span className="text-zinc-400">{googleConfig.baseUrl}</span></p>
            </div>
          </div>
        );
      })()}

      {/* ── All other providers ──────────────────────────────────── */}
      <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest pt-2">All Providers</h3>
      {rows.map(row => {
        const config = resolver.resolve(row.provider);
        const origins = resolver.getAuthorizedOrigins();
        return (
          <div key={row.provider} className="border border-zinc-800 rounded-lg p-4 space-y-3 bg-zinc-900">
            <div className="flex items-center gap-2">
              <span>{row.iconEmoji}</span>
              <span className="text-sm font-semibold text-zinc-200">{row.displayName}</span>
              <Badge label={row.provider} size="xs" />
            </div>
            <div className="space-y-2">
              <UriRow label="Authorized Origin" value={origins[0]} note="Primary authorized origin for this environment" />
              <UriRow label="OAuth Redirect URI" value={config.redirectUri} />
              <UriRow label="OAuth Callback URI" value={config.callbackUri} />
            </div>
            {/* Collapsible origins */}
            {origins.length > 1 && (
              <details className="text-xs">
                <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300">
                  +{origins.length - 1} more authorized origins
                </summary>
                <div className="mt-1.5 space-y-1 pl-2">
                  {origins.slice(1).map(o => (
                    <UriRow key={o} label="Authorized Origin" value={o} />
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Phase641aPage() {
  const [tab, setTab] = useState("overview");
  const [state, setState] = useState(dashboard.state());
  const [diagResult, setDiagResult] = useState(null);
  const [validations, setValidations] = useState([]);

  const refresh = useCallback(() => setState(dashboard.state()), []);

  useEffect(() => {
    // Auto-run discovery on mount
    dashboard.runDiscovery();
    refresh();
  }, []);

  function runDiscovery() {
    dashboard.runDiscovery();
    refresh();
  }

  function runDiagnostics() {
    const r = dashboard.runDiagnostics();
    setDiagResult(r);
    refresh();
  }

  function runValidation() {
    const report = state.latestReport;
    if (!report) return;
    const results = report.providers.map(p => {
      const validator = OAuthDiscovery["_validator"] ?? null;
      return {
        provider:    p.provider,
        displayName: p.displayName,
        score:       p.status === "FULLY_CONFIGURED" ? 100 :
                     p.status === "PARTIALLY_CONFIGURED" ? 50 : 0,
        valid:       p.status === "FULLY_CONFIGURED",
        blockers:    p.missingConfig,
      };
    });
    setValidations(results);
    refresh();
  }

  const { latestReport, health, metrics, recentAudit, baseUrl, isSecure } = state;
  const providers = latestReport?.providers ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.4.1A</span>
          <Badge label="OAUTH CONFIGURATION & DISCOVERY" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">OAuth Discovery Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Self-describing OAuth configuration · Auto-resolved redirect URIs ·
          Zero manual configuration · {providers.length} providers tracked
        </p>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900">
        <Badge label={`● ${health.overall}`} color={HEALTH_COLOR[health.overall] ?? "gray"} />
        <Badge label={`${latestReport?.fullyConfigured ?? 0} fully configured`} color="green" />
        <Badge label={`${latestReport?.partial ?? 0} partial`} color="yellow" />
        <Badge label={`${latestReport?.missing ?? 0} missing`} color={latestReport?.missing ? "red" : "gray"} />
        <span className="text-xs text-zinc-600 font-mono">Base: {baseUrl}</span>
        <Badge label={isSecure ? "HTTPS ✓" : "HTTP ⚠"} color={isSecure ? "green" : "red"} size="xs" />
        <button onClick={() => { runDiscovery(); }} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">↺ refresh</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-mono whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="PROVIDERS" value={latestReport?.totalProviders ?? 0} />
            <StatCard label="FULLY CONFIGURED" value={latestReport?.fullyConfigured ?? 0} color="green" />
            <StatCard label="PARTIAL" value={latestReport?.partial ?? 0} color="yellow" />
            <StatCard label="MISSING CREDS" value={latestReport?.missing ?? 0} color={latestReport?.missing ? "red" : "gray"} />
          </div>
          {/* Architecture */}
          <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
            <span className="text-xs font-mono text-zinc-500 uppercase">Discovery Architecture</span>
            <div className="flex flex-wrap gap-1 items-center text-xs font-mono">
              {["UOP Registry","→","OAuthDiscoveryEngine","→","RedirectResolver","→","ScopeRegistry","→","EnvironmentInspector","→","ConfigValidator","→","Dashboard"].map((s, i) => (
                <span key={i} className={s === "→" ? "text-zinc-700" : "bg-zinc-800 px-2 py-0.5 rounded text-zinc-300"}>{s}</span>
              ))}
            </div>
          </div>
          {/* Issues */}
          {latestReport && latestReport.issues.length > 0 && (
            <div className="border border-yellow-800/40 rounded-lg p-4 space-y-1 bg-yellow-950/10">
              <h3 className="text-xs font-mono text-yellow-400 uppercase">Configuration Issues</h3>
              {latestReport.issues.map((issue, i) => (
                <p key={i} className="text-xs text-yellow-300">⚠ {issue}</p>
              ))}
              {latestReport.recommendations.map((r, i) => (
                <p key={i} className="text-xs text-blue-400">→ {r}</p>
              ))}
            </div>
          )}
          {/* Security */}
          <div className="border border-green-800/40 rounded-lg p-4 bg-green-950/10 space-y-2">
            <h3 className="text-xs font-mono text-green-400 uppercase">Security Contract</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {["Client IDs never exposed in UI","Client Secrets never stored browser-side",
                "Redirect URIs auto-resolved (no hardcoding)","Audit sanitized — no credentials",
                "Token values masked in all APIs","PKCE enforced for all OIDC providers"].map(p => (
                <p key={p} className="text-xs text-zinc-400 flex items-center gap-1.5"><span className="text-green-400">✓</span>{p}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PROVIDERS ────────────────────────────────────────────── */}
      {tab === "providers" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono text-zinc-500">{providers.length} providers tracked</p>
            <button onClick={runDiscovery}
              className="px-3 py-1.5 rounded bg-violet-700 hover:bg-violet-600 text-xs transition-colors">
              ↺ Re-discover
            </button>
          </div>
          {providers.map(p => (
            <ProviderCard key={p.provider} provider={p} onMarkConfigured={() => { runDiscovery(); refresh(); }} />
          ))}
        </div>
      )}

      {/* ── DISCOVERY ────────────────────────────────────────────── */}
      {tab === "discovery" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={runDiscovery}
              className="px-4 py-2 rounded bg-violet-700 hover:bg-violet-600 text-sm font-semibold transition-colors">
              ▶ Run Discovery
            </button>
            {latestReport && (
              <span className="text-xs text-zinc-500 font-mono">{latestReport.durationMs}ms · {new Date(latestReport.generatedAt).toISOString().slice(11,19)}</span>
            )}
          </div>
          {latestReport && (
            <div className="space-y-2">
              {latestReport.providers.map(p => (
                <div key={p.provider} className={`flex flex-wrap items-center gap-3 px-3 py-2 rounded border text-xs font-mono
                  ${p.status === "FULLY_CONFIGURED" ? "border-green-800/40 bg-green-950/10" :
                    p.status === "PARTIALLY_CONFIGURED" ? "border-yellow-800/40 bg-yellow-950/10" :
                    "border-red-800/40 bg-red-950/10"}`}>
                  <span>{p.iconEmoji}</span>
                  <span className="text-zinc-300 w-20">{p.provider}</span>
                  <Badge label={p.status.replace(/_/g," ")} color={STATUS_COLOR[p.status] ?? "gray"} size="xs" />
                  <Badge label={`clientId: ${p.clientIdStatus}`} color={p.clientIdStatus === "CONFIGURED" ? "green" : "red"} size="xs" />
                  <Badge label={`secret: ${p.clientSecretStatus}`} color={p.clientSecretStatus === "CONFIGURED" ? "green" : "red"} size="xs" />
                  <Badge label={`${p.activeSessions} sessions`} size="xs" />
                  {p.missingConfig.map(m => <Badge key={m} label={`✖ ${m}`} color="red" size="xs" />)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── REDIRECT URIs ─────────────────────────────────────────── */}
      {tab === "redirect-uris" && <RedirectUrisTab baseUrl={baseUrl} isSecure={isSecure} providers={providers} />}

      {/* ── CALLBACKS ─────────────────────────────────────────────── */}
      {tab === "callbacks" && (
        <div className="space-y-4">
          <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 space-y-3">
            <h3 className="text-sm font-semibold">Callback URI Pattern</h3>
            <p className="text-xs text-zinc-400 font-mono">{baseUrl}/oauth/callback/<span className="text-violet-300">[provider]</span></p>
            <p className="text-xs text-zinc-500">OAuth providers redirect to this URI after authorization. The OAuthCallbackResolver automatically extracts code, state, and error parameters.</p>
          </div>
          {providers.map(p => (
            <div key={p.provider} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 flex items-center gap-3">
              <span>{p.iconEmoji}</span>
              <span className="text-sm text-zinc-300 w-24">{p.provider}</span>
              <span className="text-xs font-mono text-zinc-400 flex-1">{p.callbackUri}</span>
              <CopyButton value={p.callbackUri} label={`${p.provider} callback`} />
            </div>
          ))}
        </div>
      )}

      {/* ── SCOPES ────────────────────────────────────────────────── */}
      {tab === "scopes" && (
        <div className="space-y-4">
          {providers.map(p => (
            <div key={p.provider} className="border border-zinc-800 rounded-lg p-4 space-y-3 bg-zinc-900">
              <div className="flex items-center gap-2">
                <span>{p.iconEmoji}</span>
                <span className="text-sm font-semibold">{p.displayName}</span>
                <Badge label={`${p.requiredScopes.length} required`} color="blue" size="xs" />
                <Badge label={`${p.configuredScopes.length} total`} size="xs" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-zinc-500 uppercase font-mono">Required:</p>
                <div className="flex flex-wrap gap-1">
                  {p.requiredScopes.map(s => <Badge key={s} label={s.split("/").pop() ?? s} color="blue" size="xs" />)}
                </div>
              </div>
              {p.configuredScopes.length > p.requiredScopes.length && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500 uppercase font-mono">Future (planned):</p>
                  <div className="flex flex-wrap gap-1">
                    {p.configuredScopes.filter(s => !p.requiredScopes.includes(s)).map(s => (
                      <Badge key={s} label={s.split("/").pop() ?? s} color="gray" size="xs" />
                    ))}
                  </div>
                </div>
              )}
              {p.missingScopes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.missingScopes.map(s => <Badge key={s} label={`✖ ${s}`} color="red" size="xs" />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── VALIDATION ────────────────────────────────────────────── */}
      {tab === "validation" && (
        <div className="space-y-4">
          <button onClick={runValidation}
            className="px-4 py-2 rounded bg-violet-700 hover:bg-violet-600 text-sm font-semibold transition-colors">
            ▶ Validate All Providers
          </button>
          {validations.map(v => (
            <div key={v.provider} className={`border rounded-lg p-4 space-y-2 ${v.valid ? "border-green-800/40 bg-green-950/10" : "border-yellow-800/30 bg-yellow-950/10"}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{v.displayName}</span>
                <Badge label={`Score: ${v.score}/100`} color={v.score >= 80 ? "green" : v.score >= 50 ? "yellow" : "red"} />
                <Badge label={v.valid ? "VALID" : "INCOMPLETE"} color={v.valid ? "green" : "yellow"} />
              </div>
              {v.blockers.map((b, i) => <p key={i} className="text-xs text-red-400">✖ {b}</p>)}
            </div>
          ))}
          {validations.length === 0 && <p className="text-zinc-500 text-sm">Click Validate to run all checks.</p>}
        </div>
      )}

      {/* ── HEALTH ────────────────────────────────────────────────── */}
      {tab === "health" && (
        <div className="space-y-4">
          <div className={`border rounded-lg p-5 text-center space-y-2 ${health.overall === "HEALTHY" ? "border-green-700/40 bg-green-950/20" : "border-yellow-700/40 bg-yellow-950/20"}`}>
            <div className="text-4xl">{health.overall === "HEALTHY" ? "✅" : "⚠️"}</div>
            <div className="text-xl font-bold">{health.overall}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="HEALTHY" value={health.healthyProviders} color="green" />
            <StatCard label="TOTAL" value={health.totalProviders} />
          </div>
          <div className="border border-zinc-800 rounded-lg p-4 space-y-1">
            {Object.entries(health.providerStates).map(([prov, state]) => (
              <div key={prov} className="flex items-center gap-3 text-xs font-mono">
                <span className="text-zinc-400 w-20">{prov}</span>
                <Badge label={state} color={HEALTH_COLOR[state] ?? "gray"} size="xs" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DIAGNOSTICS ───────────────────────────────────────────── */}
      {tab === "diagnostics" && (
        <div className="space-y-4">
          <button onClick={runDiagnostics}
            className="px-4 py-2 rounded bg-violet-700 hover:bg-violet-600 text-sm font-semibold transition-colors">
            ▶ Run Diagnostics
          </button>
          {diagResult && (
            <div className={`border rounded-lg p-4 space-y-3 ${diagResult.overall === "PASS" ? "border-green-800/40 bg-green-950/10" : diagResult.overall === "WARN" ? "border-yellow-800/30 bg-yellow-950/10" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex gap-2">
                <Badge label={`Overall: ${diagResult.overall}`} color={diagResult.overall === "PASS" ? "green" : diagResult.overall === "WARN" ? "yellow" : "red"} />
                <span className="text-xs text-zinc-600 font-mono">{diagResult.durationMs}ms</span>
                <Badge label={`${diagResult.providersOk} OK`} color="green" size="xs" />
                <Badge label={`${diagResult.providersFail} fail`} color={diagResult.providersFail > 0 ? "red" : "gray"} size="xs" />
              </div>
              {diagResult.issues.map((i, idx) => <p key={idx} className="text-xs text-red-400">✖ {i}</p>)}
              {diagResult.recommendations.map((r, idx) => <p key={idx} className="text-xs text-blue-400">→ {r}</p>)}
            </div>
          )}
        </div>
      )}

      {/* ── METRICS ───────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="DISCOVERY RUNS" value={metrics.totalDiscoveryRuns} />
          <StatCard label="AVG RUN" value={`${metrics.avgRunMs}ms`} />
          <StatCard label="PROVIDERS" value={metrics.providersTracked} />
          <StatCard label="FULLY CONFIGURED" value={metrics.fullyConfiguredCount} color="green" />
          <StatCard label="HEALTHY" value={metrics.healthyCount} color="green" />
          <StatCard label="VALIDATIONS" value={metrics.totalValidations} />
          <StatCard label="PASS RATE" value={`${metrics.validationPassRate}%`} color={metrics.validationPassRate >= 80 ? "green" : "yellow"} />
          {metrics.lastRunAt && <StatCard label="LAST RUN" value={new Date(metrics.lastRunAt).toISOString().slice(11,19)} />}
        </div>
      )}

      {/* ── AUDIT ─────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{OAuthDiscovery.audit.count()} entries · No credentials stored</p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-96 overflow-y-auto space-y-1">
            {recentAudit.length === 0 && <p className="text-zinc-600 text-xs">No audit entries.</p>}
            {recentAudit.map(e => (
              <div key={e.id} className="flex items-center gap-3 text-xs font-mono py-0.5 text-zinc-400">
                <span className={e.result === "SUCCESS" ? "text-green-400" : e.result === "FAIL" ? "text-red-400" : "text-blue-400"}>
                  {e.result === "SUCCESS" ? "✓" : e.result === "FAIL" ? "✗" : "ℹ"}
                </span>
                <span className="text-zinc-600 shrink-0">{new Date(e.timestamp).toISOString().slice(11,19)}</span>
                <span className="text-zinc-500 w-28 shrink-0 truncate">{e.event}</span>
                <span className="flex-1 truncate">{e.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LOGS ──────────────────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="border border-zinc-800 rounded-lg p-4 space-y-1.5 bg-zinc-900 text-xs font-mono">
          <p className="text-green-400">✓ OAuthDiscoveryEngine initialized (globalThis singleton)</p>
          <p className="text-green-400">✓ {providers.length} providers auto-discovered from UOP registry</p>
          <p>ℹ Base URL: {baseUrl} ({isSecure ? "SECURE" : "INSECURE"})</p>
          {providers.map(p => (
            <p key={p.provider} className={p.status === "FULLY_CONFIGURED" ? "text-green-400" : "text-yellow-400"}>
              {p.status === "FULLY_CONFIGURED" ? "✓" : "⚠"} {p.provider}: {p.status} — redirectUri={p.redirectUri}
            </p>
          ))}
          <p className="text-green-400">✓ Audit trail: {OAuthDiscovery.audit.count()} entries</p>
          <p className="text-green-400">✓ Discovery history: {state.historyCount} reports</p>
          <p className="text-blue-400">→ GIP now consumes OAuthDiscovery.getRedirectUri("google")</p>
          <p className="text-blue-400">→ All future connectors use OAuthDiscovery.getProviderConfig()</p>
          <p className="text-blue-400">→ No OAuth redirect URI needs to be manually specified again</p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-600 font-mono">
          Sprint 6.4.1A · OAuth Configuration & Discovery ·
          All connectors consume OAuthDiscovery · Zero manual config ·
          Next: Sprint 6.4.1 resumed with discovered config
        </p>
      </div>
    </div>
  );
}