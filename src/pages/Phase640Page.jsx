import React, { useState, useEffect } from "react";
import { OAuthRuntime } from "@/lib/universal-oauth/OAuthRuntime";
import { listProviders } from "@/lib/universal-oauth/OAuthProvider";

// ── Singleton runtime ─────────────────────────────────────────────────────────
const runtime = new OAuthRuntime();
runtime.start();

const TABS = [
  "overview","providers","sessions","scopes","permissions",
  "health","persistence","diagnostics","metrics","audit","logs",
];

const HEALTH_COLOR = {
  CONNECTED:      "green",
  CONNECTING:     "blue",
  REFRESHING:     "yellow",
  SESSION_EXPIRED:"red",
  DISCONNECTED:   "gray",
  ERROR:          "red",
};

const PROVIDER_ICONS = {
  google:"🔵", microsoft:"🟦", slack:"💬", notion:"📝",
  dropbox:"📦", hubspot:"🟠", meta:"🔷", github:"⚫",
};

// ── UI Helpers ────────────────────────────────────────────────────────────────
function Badge({ label, color = "gray", size = "sm" }) {
  const C = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    violet: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    orange: "bg-orange-900/40 text-orange-300 border border-orange-700/40",
    teal:   "bg-teal-900/40 text-teal-300 border border-teal-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return <span className={`${sz} font-mono rounded ${C[color] ?? C.gray}`}>{label}</span>;
}

function StatCard({ label, value, sub, color = "gray" }) {
  const C = { green:"text-green-300", yellow:"text-yellow-300", red:"text-red-400", blue:"text-blue-300", violet:"text-violet-300", gray:"text-white" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
      <div className="text-xs font-mono text-zinc-500">{label}</div>
      <div className={`text-xl font-bold ${C[color] ?? C.gray}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function ProviderCard({ provider }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setExpanded(e => !e)}>
        <span className="text-lg">{PROVIDER_ICONS[provider.name] ?? "🔗"}</span>
        <span className="text-sm font-semibold text-zinc-200">{provider.displayName}</span>
        <Badge label={provider.name} color="gray" size="xs" />
        <Badge label={provider.supportsRefresh ? "refresh ✓" : "no refresh"} color={provider.supportsRefresh ? "green" : "yellow"} size="xs" />
        <span className="ml-auto text-zinc-600 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3">
          <div className="grid grid-cols-1 gap-1 text-xs font-mono text-zinc-400">
            <div><span className="text-zinc-600">auth:</span> {provider.authorizationUrl}</div>
            <div><span className="text-zinc-600">token:</span> {provider.tokenUrl}</div>
            <div><span className="text-zinc-600">userinfo:</span> {provider.userInfoUrl}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-zinc-600 font-mono">Grants:</div>
            <div className="flex flex-wrap gap-1">
              {provider.supportedGrants.map(g => <Badge key={g} label={g} size="xs" />)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-zinc-600 font-mono">Scopes ({provider.supportedScopes.length}):</div>
            <div className="flex flex-wrap gap-1">
              {provider.supportedScopes.slice(0, 8).map(s => <Badge key={s} label={s.split("/").pop() ?? s} size="xs" color="blue" />)}
              {provider.supportedScopes.length > 8 && <Badge label={`+${provider.supportedScopes.length - 8} more`} size="xs" color="gray" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Phase640Page() {
  const [tab, setTab] = useState("overview");
  const [status, setStatus] = useState(runtime.status());
  const [sessions, setSessions] = useState(runtime.registry.listSessions());
  const [auditEntries, setAuditEntries] = useState(runtime.audit.recent(50));
  const [metrics, setMetrics] = useState(runtime.metrics.snapshot());
  const [healthSummary, setHealthSummary] = useState(runtime.health.summary());
  const [diagResults, setDiagResults] = useState([]);
  const [persistResult, setPersistResult] = useState(null);
  const [tick, setTick] = useState(0);

  // Seed a demo session for display
  useEffect(() => {
    if (runtime.registry.sessionCount() === 0) {
      const s = runtime.registry.createSession(
        "google", "demo_user",
        ["openid", "email", "https://www.googleapis.com/auth/calendar"],
        ["openid", "email"],
        Date.now() + 3600_000,
        { env: "demo" }
      );
      runtime.health.mark("google", s.id, "CONNECTED", "Demo session active");
      runtime.audit.record("SESSION_CREATED", "google", s.id, ["openid", "email"], "SUCCESS", 120, "Demo session created");
      runtime.metrics.recordAuth("google", 245, true);
      runtime.metrics.setActiveSessions(1);
    }
  }, []);

  function refresh() {
    setStatus(runtime.status());
    setSessions(runtime.registry.listSessions());
    setAuditEntries(runtime.audit.recent(50));
    setMetrics(runtime.metrics.snapshot());
    setHealthSummary(runtime.health.summary());
    setTick(t => t + 1);
  }

  function runDiagnostics() {
    const results = runtime.diagnostics.runAll();
    setDiagResults(results);
    runtime.audit.record("DIAGNOSTIC_RUN", "SYSTEM", null, [], "INFO", 0, `Diagnostics ran on ${results.length} sessions`);
    refresh();
  }

  function runPersistence() {
    runtime.persistence.save();
    const result = runtime.persistence.restore();
    setPersistResult(result);
    refresh();
  }

  const providers = listProviders();
  const scopes = runtime.scopeManager.allScopes();
  const permissions = runtime.permissionManager.allPermissions();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.4.0</span>
          <Badge label="UNIVERSAL OAUTH PLATFORM" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Universal OAuth Platform</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Centralized OAuth infrastructure — all connectors must use UOP for authentication.
          No individual OAuth implementations permitted.
        </p>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900">
        <Badge label={`● ${status.state}`} color={status.state === "RUNNING" ? "green" : "yellow"} />
        <Badge label={`${status.registeredProviders} providers`} color="blue" />
        <Badge label={`${status.activeSessions} active sessions`} color={status.activeSessions > 0 ? "green" : "gray"} />
        {status.startedAt && (
          <span className="text-xs text-zinc-600 font-mono ml-auto">
            uptime {Math.round(status.uptime / 1000)}s
          </span>
        )}
        <button onClick={refresh} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">↺ refresh</button>
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

      {/* ── OVERVIEW ──────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="PROVIDERS" value={status.registeredProviders} color="blue" />
            <StatCard label="ACTIVE SESSIONS" value={status.activeSessions} color={status.activeSessions > 0 ? "green" : "gray"} />
            <StatCard label="SCOPES DEFINED" value={scopes.length} sub={`${runtime.scopeManager.scopeCount()} total`} />
            <StatCard label="PERMISSIONS" value={permissions.length} />
            <StatCard label="AUDIT ENTRIES" value={runtime.audit.count()} />
            <StatCard label="REFRESH SUCCESS" value={runtime.refreshManager.successCount()} color="green" />
            <StatCard label="REFRESH FAILED" value={runtime.refreshManager.failCount()} color={runtime.refreshManager.failCount() > 0 ? "red" : "gray"} />
            <StatCard label="HEALTH CONNECTED" value={runtime.health.connectedCount()} color="green" />
          </div>
          {/* Architecture diagram */}
          <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Architecture</span>
            <div className="flex flex-wrap gap-1 items-center text-xs font-mono text-zinc-400">
              {["Universal Connector Platform","→","Universal OAuth Platform","→","Registry","→",
                "Session Manager","→","Token Manager","→","Refresh Manager","→","Persistence","→","External Providers"].map((s, i) => (
                <span key={i} className={s === "→" ? "text-zinc-700" : "bg-zinc-800 px-2 py-0.5 rounded text-zinc-300"}>{s}</span>
              ))}
            </div>
          </div>
          {/* Security policy */}
          <div className="border border-green-800/40 rounded-lg p-4 bg-green-950/10 space-y-2">
            <h3 className="text-xs font-mono text-green-400 uppercase tracking-widest">Security Policy</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-zinc-400">
              {["No access tokens persisted","No refresh tokens in storage","No client secrets in logs",
                "No auth codes in audit","All metadata sanitized","PKCE ready for OAuth flows"].map(p => (
                <div key={p} className="flex items-center gap-2"><span className="text-green-400">✓</span>{p}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PROVIDERS ─────────────────────────────────────────────── */}
      {tab === "providers" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{providers.length} providers registered · Extensible for future connectors</p>
          {providers.map(p => <ProviderCard key={p.name} provider={p} />)}
        </div>
      )}

      {/* ── SESSIONS ──────────────────────────────────────────────── */}
      {tab === "sessions" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">{sessions.length} total sessions · {runtime.registry.activeSessions().length} active</p>
          {sessions.length === 0 && <p className="text-zinc-500 text-sm py-8 text-center">No sessions created yet.</p>}
          {sessions.map(s => (
            <div key={s.id} className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{PROVIDER_ICONS[s.provider]}</span>
                <span className="text-sm font-mono text-zinc-300">{s.provider}</span>
                <Badge label={s.status} color={s.status === "ACTIVE" ? "green" : s.status === "EXPIRED" ? "red" : "yellow"} />
                <Badge label={s.health} color={HEALTH_COLOR[s.health] ?? "gray"} />
                <span className="text-xs text-zinc-600 font-mono ml-auto">{s.id}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {s.grantedScopes.map(sc => (
                  <Badge key={sc} label={sc.split("/").pop() ?? sc} size="xs" color="blue" />
                ))}
              </div>
              {s.expiresAt && (
                <p className="text-xs text-zinc-600 font-mono">
                  Expires: {new Date(s.expiresAt).toISOString().slice(0, 19)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── SCOPES ────────────────────────────────────────────────── */}
      {tab === "scopes" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{scopes.length} scopes registered across {new Set(scopes.map(s => s.provider)).size} providers</p>
          {["google","microsoft","slack","github","notion","dropbox","hubspot","meta"].map(prov => {
            const ps = scopes.filter(s => s.provider === prov);
            if (ps.length === 0) return null;
            return (
              <div key={prov} className="border border-zinc-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span>{PROVIDER_ICONS[prov]}</span>
                  <span className="text-sm font-semibold capitalize">{prov}</span>
                  <Badge label={`${ps.length} scopes`} size="xs" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {ps.map(s => (
                    <div key={s.id} title={s.description}>
                      <Badge label={s.name.split("/").pop() ?? s.name} size="xs"
                        color={s.required ? "red" : s.service ? "blue" : "gray"} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PERMISSIONS ───────────────────────────────────────────── */}
      {tab === "permissions" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{permissions.length} permission mappings · Service → Scopes</p>
          {permissions.map((p, i) => (
            <div key={i} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 flex flex-wrap items-center gap-3">
              <span>{PROVIDER_ICONS[p.provider]}</span>
              <Badge label={p.provider} size="xs" />
              <span className="text-xs text-zinc-400 font-mono">→</span>
              <Badge label={p.service} color="violet" size="xs" />
              {p.required && <Badge label="required" color="red" size="xs" />}
              <div className="flex flex-wrap gap-1 ml-auto">
                {p.scopes.map(s => <Badge key={s} label={s.split("/").pop() ?? s} size="xs" color="blue" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── HEALTH ────────────────────────────────────────────────── */}
      {tab === "health" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {Object.entries(healthSummary).map(([state, count]) => (
              <StatCard key={state} label={state} value={count}
                color={state === "CONNECTED" ? "green" : state === "SESSION_EXPIRED" || state === "ERROR" ? "red" : "gray"} />
            ))}
          </div>
          <div className="space-y-2">
            {runtime.health.all().map((snap, i) => (
              <div key={i} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 flex items-center gap-3">
                <span>{PROVIDER_ICONS[snap.provider] ?? "🔗"}</span>
                <span className="text-sm font-mono text-zinc-300">{snap.provider}</span>
                <Badge label={snap.state} color={HEALTH_COLOR[snap.state] ?? "gray"} />
                <span className="text-xs text-zinc-500 flex-1">{snap.detail}</span>
                <span className="text-xs text-zinc-700 font-mono">{new Date(snap.lastCheck).toISOString().slice(11,19)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PERSISTENCE ───────────────────────────────────────────── */}
      {tab === "persistence" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <button onClick={runPersistence}
              className="px-4 py-2 rounded bg-violet-700 hover:bg-violet-600 text-sm font-semibold transition-colors">
              ▶ Save + Restore Cycle
            </button>
          </div>
          <div className="border border-zinc-800 rounded-lg p-4 space-y-2 bg-zinc-900">
            <h3 className="text-xs font-mono text-zinc-500 uppercase">Persistence Policy</h3>
            {["Sessions saved without tokens","Expired sessions not restored","Revoked sessions not restored",
              "Token re-auth required after restore","Metadata preserved across restarts"].map(p => (
              <p key={p} className="text-xs text-zinc-400 flex items-center gap-2"><span className="text-green-400">✓</span>{p}</p>
            ))}
          </div>
          {persistResult && (
            <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-mono text-zinc-500 uppercase">Last Cycle Result</h3>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="TOTAL" value={persistResult.total} />
                <StatCard label="RESTORED" value={persistResult.restored} color="green" />
                <StatCard label="SKIPPED" value={persistResult.skipped} color="yellow" />
                <StatCard label="FAILED" value={persistResult.failed} color={persistResult.failed > 0 ? "red" : "gray"} />
              </div>
              <div className="space-y-1">
                {persistResult.log.map((l, i) => <p key={i} className="text-xs text-zinc-400 font-mono">{l}</p>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DIAGNOSTICS ───────────────────────────────────────────── */}
      {tab === "diagnostics" && (
        <div className="space-y-4">
          <button onClick={runDiagnostics}
            className="px-4 py-2 rounded bg-violet-700 hover:bg-violet-600 text-sm font-semibold transition-colors">
            ▶ Run Diagnostics
          </button>
          {diagResults.length === 0 && sessions.length === 0 && (
            <p className="text-zinc-500 text-sm">No sessions to diagnose. Sessions appear in the Sessions tab.</p>
          )}
          {diagResults.map((r, i) => (
            <div key={i} className={`border rounded-lg p-4 space-y-2 ${r.overall ? "border-green-800/40 bg-green-950/10" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span>{PROVIDER_ICONS[r.provider]}</span>
                <Badge label={r.provider} />
                <Badge label={r.healthState} color={HEALTH_COLOR[r.healthState] ?? "gray"} />
                <Badge label={r.overall ? "PASS" : "FAIL"} color={r.overall ? "green" : "red"} />
                <span className="text-xs text-zinc-600 font-mono">{r.durationMs}ms</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {[["Expiration OK", r.expirationOk], ["Refresh Capable", r.refreshCapable],
                  ["Scopes Valid", r.scopesValid], ["Provider Reachable", r.providerReachable]].map(([label, ok]) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className={ok ? "text-green-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                    <span className="text-zinc-400">{label}</span>
                  </div>
                ))}
              </div>
              {r.issues.length > 0 && (
                <div>{r.issues.map((iss, j) => <p key={j} className="text-xs text-red-400 font-mono">• {iss}</p>)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── METRICS ───────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="TOTAL SESSIONS" value={metrics.totalSessions} />
            <StatCard label="ACTIVE" value={metrics.activeSessions} color="green" />
            <StatCard label="EXPIRED" value={metrics.expiredSessions} color={metrics.expiredSessions > 0 ? "red" : "gray"} />
            <StatCard label="AVG AUTH" value={`${metrics.avgAuthMs}ms`} />
            <StatCard label="TOTAL REFRESHES" value={metrics.totalRefreshAttempts} />
            <StatCard label="REFRESH OK" value={metrics.successfulRefreshes} color="green" />
            <StatCard label="REFRESH FAIL" value={metrics.failedRefreshes} color={metrics.failedRefreshes > 0 ? "red" : "gray"} />
            <StatCard label="AVG REFRESH" value={`${metrics.avgRefreshMs}ms`} />
          </div>
          {Object.keys(metrics.providerBreakdown).length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-mono text-zinc-500 uppercase">Sessions by Provider</h3>
              {Object.entries(metrics.providerBreakdown).map(([prov, count]) => (
                <div key={prov} className="flex items-center gap-3 text-sm">
                  <span>{PROVIDER_ICONS[prov] ?? "🔗"}</span>
                  <span className="text-zinc-300 w-24">{prov}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, count * 20)}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 font-mono">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AUDIT ─────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-zinc-500">{runtime.audit.count()} total audit entries · No credentials stored</p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-96 overflow-y-auto space-y-1">
            {auditEntries.length === 0 && <p className="text-zinc-600 text-xs">No audit entries yet.</p>}
            {auditEntries.map(e => (
              <div key={e.id} className="flex items-center gap-3 text-xs text-zinc-400 font-mono py-0.5">
                <span className={e.result === "SUCCESS" ? "text-green-400" : e.result === "FAIL" ? "text-red-400" : "text-blue-400"}>
                  {e.result === "SUCCESS" ? "✓" : e.result === "FAIL" ? "✗" : "ℹ"}
                </span>
                <span className="text-zinc-600 shrink-0">{new Date(e.timestamp).toISOString().slice(11,19)}</span>
                <span className="text-zinc-500 w-28 shrink-0">{e.event.replace("_", " ")}</span>
                <span>{e.provider}</span>
                <span className="text-zinc-500 flex-1 truncate">{e.detail}</span>
                {e.scopes.length > 0 && <Badge label={`${e.scopes.length} scopes`} size="xs" color="blue" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LOGS ──────────────────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="space-y-2">
          <div className="border border-zinc-800 rounded-lg p-4 space-y-2 bg-zinc-900">
            <h3 className="text-xs font-mono text-zinc-500 uppercase">Platform Log</h3>
            <div className="space-y-1 text-xs font-mono text-zinc-400">
              <p className="text-green-400">✓ Universal OAuth Platform started</p>
              <p>ℹ {runtime.registry.providerCount()} OAuth providers registered (google, microsoft, slack, notion, dropbox, hubspot, meta, github)</p>
              <p>ℹ {runtime.scopeManager.scopeCount()} scopes defined</p>
              <p>ℹ {runtime.permissionManager.permissionCount()} permission mappings configured</p>
              <p className="text-green-400">✓ Session persistence layer active</p>
              <p className="text-green-400">✓ Security policy enforced — zero token persistence</p>
              <p className="text-green-400">✓ Audit trail initialized — {runtime.audit.count()} entries</p>
              <p className="text-blue-400">ℹ Ready for Sprint 6.4.1 — Google OAuth Adapter</p>
              <p className="text-blue-400">ℹ Ready for Sprint 6.4.2 — Google Calendar Connector</p>
              <p className="text-blue-400">ℹ Ready for Sprint 6.4.3 — Gmail Connector</p>
              <p className="text-blue-400">ℹ Ready for Sprint 6.4.4 — Google Drive Connector</p>
              <p className="text-blue-400">ℹ Ready for Sprint 6.4.5 — Google Tasks Connector</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-600 font-mono">
          Sprint 6.4.0 · Universal OAuth Platform · All connectors MUST use UOP for OAuth authentication ·
          Next: Sprint 6.4.1 — Google OAuth Adapter
        </p>
      </div>
    </div>
  );
}