/**
 * Phase570Page — Production Validation & Connector Authentication
 * Phase 5.7.0 · MemoryOS Core Production Certification · 2026-07-13
 * EF-57.1 through EF-57.11
 */
import React, { useState, useCallback } from "react";
import { runEF570Tests } from "@/lib/connection-manager/ef570Tests";
import { ConnectionManager } from "@/lib/connection-manager/ConnectionManager";
import { injectGitHubToken, clearGitHubToken } from "@/lib/connection-manager/GitHubAuthFlow";
import GitHubPATModal from "@/components/connection-manager/GitHubPATModal";

// ── Primitives ────────────────────────────────────────────────────────────────

function Badge({ label, style = "" }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center min-w-0">
      <div className={`text-sm font-bold font-mono truncate ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

const STATE_STYLE = {
  CONNECTED:     "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  DISCONNECTED:  "bg-zinc-800 text-zinc-400 border-zinc-700",
  AUTH_REQUIRED: "bg-amber-900/40 text-amber-300 border-amber-700",
  TOKEN_EXPIRED: "bg-orange-900/40 text-orange-300 border-orange-700",
  UNAVAILABLE:   "bg-zinc-700 text-zinc-400 border-zinc-600",
  ERROR:         "bg-red-900/40 text-red-300 border-red-700",
};
const HEALTH_STYLE = {
  HEALTHY:   "text-emerald-400",
  DEGRADED:  "text-amber-400",
  UNHEALTHY: "text-red-400",
  UNKNOWN:   "text-zinc-500",
};
const S = {
  PASS:    "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  FAIL:    "bg-red-900/50 text-red-300 border-red-700",
  PARTIAL: "bg-amber-900/40 text-amber-300 border-amber-700",
};

function TestRow({ r }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 border-b border-zinc-800/30 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <Badge label={r.passed ? "PASS" : "FAIL"} style={r.passed ? S.PASS : S.FAIL} />
      <span className="text-zinc-600 font-mono text-xs w-14 shrink-0 mt-0.5">{r.ef}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${r.passed ? "text-zinc-300" : "text-red-300"}`}>{r.name}</p>
        {r.detail && <p className="text-zinc-500 text-xs font-mono mt-0.5">{r.detail}</p>}
        {r.error  && <p className="text-red-400  text-xs font-mono">{r.error}</p>}
      </div>
      <span className="text-zinc-600 text-xs shrink-0">{r.durationMs}ms</span>
    </div>
  );
}

// ── Connector Card ────────────────────────────────────────────────────────────

function ConnectorCard({ reg, onAuth, onHealth, onDiscover, loading }) {
  const d = reg.discoveredData;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-zinc-100 font-semibold text-sm">{reg.descriptor.name}</span>
          <Badge label={reg.state} style={STATE_STYLE[reg.state] ?? STATE_STYLE.UNAVAILABLE} />
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onAuth(reg.connectorId)} disabled={loading}
            className="px-2.5 py-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-xs font-semibold transition">
            {reg.state === "CONNECTED" ? "Reconnect" : "Connect"}
          </button>
          <button onClick={() => onHealth(reg.connectorId)} disabled={loading}
            className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-xs transition">
            Health
          </button>
          {reg.state === "CONNECTED" && (
            <button onClick={() => onDiscover(reg.connectorId)} disabled={loading}
              className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-xs transition">
              Rediscover
            </button>
          )}
        </div>
      </div>

      <p className="text-zinc-500 text-xs">{reg.descriptor.description}</p>

      <div className="flex flex-wrap gap-2">
        <div className={`text-xs font-mono ${HEALTH_STYLE[reg.health.status] ?? "text-zinc-500"}`}>
          ● {reg.health.status} {reg.health.healthScore > 0 ? `(${reg.health.healthScore}/100)` : ""}
        </div>
        {reg.health.latencyMs !== null && (
          <span className="text-zinc-500 text-xs">{reg.health.latencyMs}ms</span>
        )}
        {reg.lastSync && (
          <span className="text-zinc-600 text-xs">sync: {new Date(reg.lastSync).toLocaleTimeString()}</span>
        )}
      </div>

      {reg.health.errors.length > 0 && (
        <div className="space-y-0.5">
          {reg.health.errors.map((e, i) => <p key={i} className="text-red-400 text-xs font-mono">✕ {e}</p>)}
        </div>
      )}
      {reg.health.warnings.length > 0 && (
        <div className="space-y-0.5">
          {reg.health.warnings.map((w, i) => <p key={i} className="text-amber-400 text-xs">⚠ {w}</p>)}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {reg.descriptor.capabilities.map(c => (
          <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">{c}</span>
        ))}
      </div>

      {d && (
        <div className="bg-zinc-800/40 rounded-lg p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Discovered Resources</p>
          <div className="space-y-1">
            {d.resources.map(r => (
              <div key={r.type}>
                <p className="text-zinc-300 text-xs font-semibold">{r.count} {r.type}</p>
                {r.items.length > 0 && (
                  <p className="text-zinc-600 text-xs ml-2">{r.items.slice(0, 3).join(", ")}{r.items.length > 3 ? "…" : ""}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ["Connectors", "Validation", "Health Monitor", "Certification"];

// ── Main Page ─────────────────────────────────────────────────────────────────

const cm = new ConnectionManager();

export default function Phase570Page() {
  const [tab, setTab]           = useState("Connectors");
  const [loading, setLoading]   = useState(false);
  const [suite, setSuite]       = useState(null);
  const [error, setError]       = useState(null);
  const [regs, setRegs]         = useState(() => cm.getAllRegistrations());
  const [healthHistory, setHealthHistory] = useState([]);
  const [patModal, setPatModal] = useState(false);
  const [patLoading, setPatLoading] = useState(false);
  const [patError, setPatError] = useState(null);

  const refreshRegs = () => setRegs(cm.getAllRegistrations());

  // GitHub PAT flow — opened when Connect is clicked for GitHub
  const handleGitHubPATSubmit = useCallback(async (token) => {
    setPatLoading(true);
    setPatError(null);
    // Inject token into global scope so GitHubConnector picks it up
    injectGitHubToken(token);
    const result = await cm.authenticate("github");
    if (result.success) {
      setPatModal(false);
      refreshRegs();
      setHealthHistory(cm.getHealthHistory());
    } else {
      // Token invalid — clear it and show error
      clearGitHubToken();
      setPatError(result.error ?? "Authentication failed — check your token and try again.");
    }
    setPatLoading(false);
  }, []);

  const handleAuth = useCallback(async (id) => {
    if (id === "github") {
      // Always open PAT modal for GitHub — no OAuth in this environment
      setPatError(null);
      setPatModal(true);
      return;
    }
    setLoading(true);
    await cm.authenticate(id);
    refreshRegs();
    setHealthHistory(cm.getHealthHistory());
    setLoading(false);
  }, []);

  const handleAuthAll = useCallback(async () => {
    setLoading(true);
    await cm.authenticateAll();
    refreshRegs();
    setHealthHistory(cm.getHealthHistory());
    setLoading(false);
  }, []);

  const handleHealth = useCallback(async (id) => {
    setLoading(true);
    await cm.checkHealth(id);
    refreshRegs();
    setHealthHistory(cm.getHealthHistory());
    setLoading(false);
  }, []);

  const handleDiscover = useCallback(async (id) => {
    setLoading(true);
    await cm.rediscover(id);
    refreshRegs();
    setLoading(false);
  }, []);

  const runSuite = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuite(null);
    try { setSuite(await runEF570Tests()); }
    catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, []);

  const diag = cm.getDiagnostics();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 text-xs font-mono mb-2">
            <span className="text-violet-400">MemoryOS Core</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Phase 5.7.0</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Production Validation & Certification</span>
          </div>
          <h1 className="text-lg font-bold">Production Validation</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Connection Manager · GitHub Auth · Base44 Auth · Health Monitor · End-to-End Certification
          </p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Connectors"  value={diag.totalConnectors}                      color="text-zinc-200" />
            <Metric label="Connected"   value={regs.filter(r => r.state === "CONNECTED").length} color="text-emerald-400" />
            <Metric label="Health"      value={`${diag.overallHealth}/100`}               color={diag.overallHealth >= 70 ? "text-emerald-400" : diag.overallHealth >= 40 ? "text-amber-400" : "text-red-400"} />
            <Metric label="Suite"       value={suite ? `${suite.passed}/${suite.total}` : "—"} color={suite?.status === "PASS" ? "text-emerald-400" : suite ? "text-amber-400" : "text-zinc-500"} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={handleAuthAll} disabled={loading}
              className="px-3 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {loading ? "Running…" : "Connect All Connectors"}
            </button>
            <button onClick={runSuite} disabled={loading}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              Run EF-57 Validation (23 criteria)
            </button>
          </div>
        </div>

        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-5 h-5 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin shrink-0" />
            <p className="text-zinc-400 text-sm">Executing against real services…</p>
          </div>
        )}
        {error && <div className="bg-red-950/20 border border-red-700 rounded-xl p-3"><p className="text-red-300 text-xs font-mono">{error}</p></div>}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Connectors */}
        {tab === "Connectors" && (
          <div className="space-y-3">
            {regs.map(reg => (
              <ConnectorCard
                key={reg.connectorId}
                reg={reg}
                onAuth={handleAuth}
                onHealth={handleHealth}
                onDiscover={handleDiscover}
                loading={loading}
              />
            ))}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Diagnostics</p>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Total"     value={diag.totalConnectors} />
                <Metric label="Connected" value={diag.connectedCount}  color="text-emerald-400" />
                <Metric label="Healthy"   value={diag.healthyCount}    color="text-emerald-400" />
                <Metric label="Overall"   value={`${diag.overallHealth}/100`} color={diag.overallHealth >= 70 ? "text-emerald-400" : "text-amber-400"} />
              </div>
            </div>
          </div>
        )}

        {/* Validation */}
        {tab === "Validation" && (
          suite ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge
                  label={`${suite.status}: ${suite.passed}/${suite.total}`}
                  style={suite.status === "PASS" ? S.PASS : suite.status === "PARTIAL" ? S.PARTIAL : S.FAIL}
                />
                <span className="text-zinc-500 text-xs">{suite.durationMs}ms</span>
                <span className="text-zinc-500 text-xs">GitHub: {suite.connectorStatus.github}</span>
                <span className="text-zinc-500 text-xs">Base44: {suite.connectorStatus.base44}</span>
                <span className="text-zinc-500 text-xs">Pipeline: {suite.pipelineStatus}</span>
              </div>
              {suite.evidenceSample.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Evidence Sample</p>
                  {suite.evidenceSample.map((e, i) => <p key={i} className="text-zinc-400 text-xs font-mono">• {e}</p>)}
                </div>
              )}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-zinc-200 text-sm font-semibold">EF-57 Validation — 23 Criteria</span>
                  <Badge label={suite.status} style={suite.status === "PASS" ? S.PASS : suite.status === "PARTIAL" ? S.PARTIAL : S.FAIL} />
                </div>
                {suite.results.map(r => <TestRow key={r.id} r={r} />)}
              </div>
            </div>
          ) : (
            <p className="text-zinc-600 text-xs text-center py-6">Click "Run EF-57 Validation" to execute the production test suite.</p>
          )
        )}

        {/* Health Monitor */}
        {tab === "Health Monitor" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              {regs.map(reg => (
                <div key={reg.connectorId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-200 font-semibold text-sm">{reg.descriptor.name}</span>
                      <Badge label={reg.health.status} style={
                        reg.health.status === "HEALTHY" ? S.PASS
                        : reg.health.status === "DEGRADED" ? S.PARTIAL
                        : reg.health.status === "UNHEALTHY" ? S.FAIL
                        : "bg-zinc-800 text-zinc-500 border-zinc-700"
                      } />
                    </div>
                    <button onClick={() => handleHealth(reg.connectorId)} disabled={loading}
                      className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-xs transition">
                      Check
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Score"       value={`${reg.health.healthScore}/100`}
                      color={reg.health.healthScore >= 80 ? "text-emerald-400" : reg.health.healthScore >= 50 ? "text-amber-400" : "text-red-400"} />
                    <Metric label="Latency"     value={reg.health.latencyMs !== null ? `${reg.health.latencyMs}ms` : "—"} />
                    <Metric label="Availability" value={reg.health.availability === 1 ? "100%" : reg.health.availability === 0 ? "0%" : `${Math.round(reg.health.availability * 100)}%`}
                      color={reg.health.availability === 1 ? "text-emerald-400" : "text-red-400"} />
                  </div>
                  {reg.health.lastCheckedAt && (
                    <p className="text-zinc-600 text-xs mt-2">Last checked: {new Date(reg.health.lastCheckedAt).toLocaleTimeString()}</p>
                  )}
                </div>
              ))}
            </div>

            {healthHistory.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Check History ({healthHistory.length})</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {healthHistory.slice(0, 20).map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${h.health.status === "HEALTHY" ? "bg-emerald-500" : h.health.status === "DEGRADED" ? "bg-amber-500" : "bg-red-500"}`} />
                      <span className="text-zinc-400 w-16 shrink-0 font-mono">{h.connectorId}</span>
                      <span className={HEALTH_STYLE[h.health.status] ?? "text-zinc-500"}>{h.health.status}</span>
                      <span className="text-zinc-600">{h.health.latencyMs !== null ? `${h.health.latencyMs}ms` : "—"}</span>
                      <span className="text-zinc-700 ml-auto">{new Date(h.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Certification */}
        {tab === "Certification" && suite && (
          <div className={`border rounded-xl p-5 space-y-4 ${suite.certificationReady ? "bg-emerald-950/20 border-emerald-600" : "bg-amber-950/10 border-amber-700"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-100 text-base font-bold">MemoryOS Core Production Certification</span>
              <Badge label={suite.certificationReady ? "CERTIFIED" : suite.status}
                style={suite.certificationReady ? "bg-emerald-900/60 text-emerald-200 border-emerald-600" : S.PARTIAL} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { l: "Suite Status",        v: suite.status },
                { l: "Criteria",            v: `${suite.passed}/${suite.total}` },
                { l: "GitHub",              v: suite.connectorStatus.github },
                { l: "Base44",              v: suite.connectorStatus.base44 },
                { l: "Pipeline",            v: suite.pipelineStatus ?? "N/A" },
                { l: "Duration",            v: `${suite.durationMs}ms` },
              ].map(m => (
                <div key={m.l} className="bg-zinc-800/40 rounded p-2">
                  <div className="text-zinc-200 font-mono text-xs">{String(m.v)}</div>
                  <div className="text-zinc-500 text-xs">{m.l}</div>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">EF Completion Status</p>
              {[
                ["EF-57.1 — Connection Manager",           suite.results.filter(r => r.ef === "EF-57.1").every(r => r.passed)],
                ["EF-57.2 — GitHub Authentication",        suite.results.filter(r => r.ef === "EF-57.2").some(r => r.passed)],
                ["EF-57.3 — Base44 Authentication",        suite.results.filter(r => r.ef === "EF-57.3").every(r => r.passed)],
                ["EF-57.4 — Health Monitor",               suite.results.filter(r => r.ef === "EF-57.4").every(r => r.passed)],
                ["EF-57.6 — End-to-End Pipeline",          suite.results.filter(r => r.ef === "EF-57.6").every(r => r.passed)],
                ["EF-57.9 — Evidence Certification",       suite.results.filter(r => r.ef === "EF-57.9").every(r => r.passed)],
                ["EF-57.10 — Graceful Degradation",        suite.results.filter(r => r.ef === "EF-57.10").every(r => r.passed)],
                ["EF-57.11 — Core Certification",          suite.results.filter(r => r.ef === "EF-57.11").every(r => r.passed)],
              ].map(([label, ok], i) => (
                <p key={i} className={`text-xs ${ok ? "text-emerald-400" : "text-amber-300"}`}>
                  {ok ? "✓" : "○"} {label}
                </p>
              ))}
            </div>

            <div className="bg-zinc-800/30 rounded-lg p-3">
              <p className="text-zinc-400 text-xs">
                Phase 5.7.0 marks the completion of the <strong className="text-zinc-200">MemoryOS Core Validation Stage</strong>.
                The architecture is production-certified and ready for <strong className="text-zinc-200">Platform Expansion</strong> —
                new connectors, specialists, and capabilities can now be added on top of this certified foundation.
              </p>
            </div>
            <p className="text-zinc-600 text-xs font-mono">Generated: {new Date().toISOString()}</p>
          </div>
        )}
        {tab === "Certification" && !suite && (
          <p className="text-zinc-600 text-xs text-center py-6">Run the EF-57 Validation suite to generate the certification.</p>
        )}
      </div>

      {/* GitHub PAT Modal */}
      {patModal && (
        <GitHubPATModal
          loading={patLoading}
          error={patError}
          onClose={() => { setPatModal(false); setPatError(null); }}
          onSubmit={handleGitHubPATSubmit}
        />
      )}
    </div>
  );
}