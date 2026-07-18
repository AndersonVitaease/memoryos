/**
 * PhaseEV4Page.jsx — Sprint EV-4 Dashboard
 * Live Connector Validation — Real APIs, Real OAuth, No Mocks
 * Route: /ev4
 */

import React, { useState, useCallback, useEffect } from "react";
import { TestRunner }  from "@/testing/TestRunner";
import { TestEngine }  from "@/testing/TestEngine";
import {
  getConnection, isConnected, getMetrics, listConnections,
} from "@/lib/google-auth/GoogleAuthSession";
import { registerAllLiveConnectorTests, LIVE_SUITES } from "@/tests/connector/LiveConnectorValidationSuite";

const STATUS_STYLES = {
  PASS:    "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:    "bg-red-900/40 text-red-300 border-red-700",
  ERROR:   "bg-orange-900/40 text-orange-300 border-orange-700",
  SKIPPED: "bg-zinc-800 text-zinc-400 border-zinc-600",
  PENDING: "bg-zinc-800 text-zinc-400 border-zinc-600",
};

const SUITE_COLORS = {
  "OAuth State [LIVE]":        "border-blue-700 text-blue-300",
  "Token Lifecycle [LIVE]":    "border-violet-700 text-violet-300",
  "Backend Functions [LIVE]":  "border-amber-700 text-amber-300",
  "Connector Runtime [LIVE]":  "border-emerald-700 text-emerald-300",
  "Error Handling [LIVE]":     "border-red-700 text-red-300",
  "Parameter Builder [LIVE]":  "border-cyan-700 text-cyan-300",
  "Connector SDK [LIVE]":      "border-zinc-500 text-zinc-300",
};

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-1.5 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>{label}</span>;
}

function Metric({ label, value, color, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={"text-xl font-bold font-mono " + (color || "text-violet-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
      {sub && <div className="text-zinc-600 text-xs">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, total, color = "bg-emerald-600" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={color + " h-full transition-all"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-xs text-zinc-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

function ConnectionStatus({ conn, metrics }) {
  if (!conn) {
    return (
      <div className="border border-red-800 rounded-xl bg-red-950/20 p-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <div>
            <div className="text-red-400 text-sm font-bold">Google Workspace NOT Connected</div>
            <div className="text-zinc-500 text-xs mt-0.5">
              EV-4 requires a real OAuth connection. Go to <span className="text-sky-400">/connections</span> and connect Google Workspace first.
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="border border-emerald-700 rounded-xl bg-emerald-950/20 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <div className="flex-1">
          <div className="text-emerald-400 text-sm font-bold">Google Workspace Connected</div>
          <div className="text-zinc-400 text-xs mt-0.5">{conn.email} · {conn.workspaceId}</div>
        </div>
        <Badge label="LIVE" style="border-emerald-700 text-emerald-300 bg-emerald-900/30" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-900/60 rounded p-2 text-center">
          <div className="text-emerald-400 text-sm font-bold">{metrics?.connected ?? 0}</div>
          <div className="text-zinc-600 text-xs">Connected</div>
        </div>
        <div className="bg-zinc-900/60 rounded p-2 text-center">
          <div className="text-blue-400 text-sm font-bold">{metrics?.real ?? 0}</div>
          <div className="text-zinc-600 text-xs">Real OAuth</div>
        </div>
        <div className="bg-zinc-900/60 rounded p-2 text-center">
          <div className={metrics?.expired > 0 ? "text-red-400" : "text-zinc-400"} style={{ fontSize: "0.875rem", fontWeight: "bold" }}>
            {metrics?.expired ?? 0}
          </div>
          <div className="text-zinc-600 text-xs">Expired</div>
        </div>
      </div>
    </div>
  );
}

export default function PhaseEV4Page() {
  const [conn,     setConn]     = useState(null);
  const [metrics,  setMetrics]  = useState(null);
  const [report,   setReport]   = useState(null);
  const [running,  setRunning]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [tab,      setTab]      = useState("overview");
  const [expanded, setExpanded] = useState({});

  function refreshConnectionState() {
    setConn(getConnection("default"));
    setMetrics(getMetrics());
  }

  useEffect(() => {
    refreshConnectionState();
    const interval = setInterval(refreshConnectionState, 3000);
    return () => clearInterval(interval);
  }, []);

  const runTests = useCallback(async () => {
    setRunning(true);
    setErr(null);
    setReport(null);
    try {
      TestEngine.clear();
      registerAllLiveConnectorTests();
      const r = await TestRunner.runAll();
      setReport(r);
      setTab("overview");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  function toggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const connected = conn && conn.state === "CONNECTED";
  const failedSuites = report?.suites?.filter(s => s.failed + s.errors > 0) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EV-4 — LIVE CONNECTOR VALIDATION</div>
              <div className="text-xl font-bold text-white">Real APIs · Real OAuth · No Mocks</div>
              <div className="text-zinc-400 text-sm mt-1">
                OAuth · Token Lifecycle · Backend Functions · Connector Runtime · Error Handling · Parameter Builder · SDK
              </div>
            </div>
            <Badge label="LIVE" style="border-red-600 text-red-300 bg-red-900/20 text-sm px-3 py-1" />
          </div>
        </div>

        {/* Validation flow */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 overflow-x-auto">
          <div className="flex items-center gap-1 text-xs min-w-max">
            {["OAuth Init","Code Exchange","Token Store","Access Token","Refresh Token","Connector Runtime","Parameter Builder","Request Builder","API Response","Error Handling","Failover","Retry"].map((n, i, arr) => (
              <React.Fragment key={n}>
                <span className={"border rounded px-1.5 py-0.5 " + (i === 0 ? "border-blue-700 text-blue-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{n}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Connection status */}
        <ConnectionStatus conn={conn} metrics={metrics} />

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runTests} disabled={running || !connected}
            className={"px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 text-white " + (connected ? "bg-red-700 hover:bg-red-600" : "bg-zinc-700 cursor-not-allowed")}>
            {running ? "Running live tests..." : "▶  Run EV-4 Live Validation"}
          </button>
          {!connected && <span className="text-zinc-500 text-xs">Connect Google Workspace to enable live tests</span>}
          {report && (
            <div className="text-zinc-400 text-sm">{report.reportId} · {report.totalTests} tests · {report.durationMs}ms</div>
          )}
        </div>

        {err && (
          <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">
            <div className="font-bold mb-1">Error</div>{err}
          </div>
        )}

        {/* Certification banner */}
        {report && (
          <div className={"border-2 rounded-xl p-5 text-center " + (report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-2xl font-bold " + (report.certified ? "text-emerald-400" : "text-red-400")}>
              {report.certified ? "✓ EV-4 CERTIFIED — LIVE CONNECTORS VALIDATED" : "✗ LIVE CONNECTOR FAILURES DETECTED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              {report.totalPassed}/{report.totalTests} passed · {report.totalFailed} failed · {report.passRate}% pass rate
            </div>
          </div>
        )}

        {/* Top metrics */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Total Tests"  value={report.totalTests} />
            <Metric label="Passed"       value={report.totalPassed}  color="text-emerald-400" />
            <Metric label="Failed/Error" value={report.totalFailed + report.totalErrors} color={report.totalFailed + report.totalErrors > 0 ? "text-red-400" : "text-zinc-500"} />
            <Metric label="Pass Rate"    value={report.passRate + "%"} color={report.passRate === 100 ? "text-emerald-400" : report.passRate >= 80 ? "text-yellow-400" : "text-red-400"} />
          </div>
        )}

        {/* Tabs */}
        {report && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {["overview","suites","failures","all"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t ? "bg-red-700 text-white" : "text-zinc-400 hover:text-white")}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Overview */}
        {report && tab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.suites.map(suite => {
              const color = SUITE_COLORS[suite.suiteName] ?? "border-zinc-700 text-zinc-400";
              const ok    = suite.failed + suite.errors === 0;
              return (
                <div key={suite.suiteName} className={"border rounded-xl p-4 bg-zinc-900 " + (ok ? "border-zinc-700" : "border-red-800")}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={"text-xs font-bold " + color}>{suite.suiteName}</span>
                    <span className={"text-xs font-mono font-bold " + (ok ? "text-emerald-400" : "text-red-400")}>{suite.passed}/{suite.total}</span>
                  </div>
                  <ProgressBar value={suite.passed} total={suite.total} color={ok ? "bg-emerald-600" : "bg-red-600"} />
                  <div className="text-zinc-600 text-xs mt-1">{suite.durationMs}ms</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Suites */}
        {report && tab === "suites" && (
          <div className="space-y-3">
            {report.suites.map(suite => (
              <div key={suite.suiteName} className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800">
                  <span className="text-zinc-200 text-sm font-bold flex-1">{suite.suiteName}</span>
                  <span className={suite.failed + suite.errors > 0 ? "text-red-400 text-xs font-bold" : "text-emerald-400 text-xs font-bold"}>
                    {suite.passed}/{suite.total}
                  </span>
                  <span className="text-zinc-600 text-xs">{suite.durationMs}ms</span>
                </div>
                {suite.results.map(r => (
                  <div key={r.id}>
                    <button onClick={() => toggle(r.id)}
                      className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                      <Badge label={r.status} style={STATUS_STYLES[r.status]} />
                      <span className="text-zinc-300 text-sm flex-1">{r.testName}</span>
                      <span className="text-zinc-600 text-xs">{r.durationMs}ms</span>
                      {r.error && <span className="text-zinc-500 text-xs">{expanded[r.id] ? "▲" : "▼"}</span>}
                    </button>
                    {expanded[r.id] && r.error && (
                      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 space-y-2">
                        <div className="text-red-300 text-xs font-mono bg-red-950/20 rounded p-2">{r.error}</div>
                        {r.stackTrace && (
                          <details>
                            <summary className="text-zinc-500 text-xs cursor-pointer">Stack trace</summary>
                            <pre className="text-zinc-500 text-xs mt-1 overflow-x-auto whitespace-pre-wrap">{r.stackTrace}</pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Failures */}
        {report && tab === "failures" && (
          <div className="space-y-3">
            {failedSuites.length === 0 ? (
              <div className="border border-emerald-700 rounded-xl bg-emerald-950/20 p-8 text-center text-emerald-400 font-bold">
                ✓ No failures — all live connectors validated
              </div>
            ) : failedSuites.map(suite => (
              <div key={suite.suiteName} className="border border-red-800 rounded-xl bg-zinc-900">
                <div className="px-4 py-2 border-b border-red-900/50 text-red-400 text-sm font-bold">{suite.suiteName}</div>
                {suite.results.filter(r => r.status !== "PASS" && r.status !== "SKIPPED").map(r => (
                  <div key={r.id} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge label={r.status} style={STATUS_STYLES[r.status]} />
                      <span className="text-zinc-200 text-sm">{r.testName}</span>
                    </div>
                    {r.error && <div className="text-red-300 text-xs font-mono mt-1 bg-red-950/20 rounded p-2">{r.error}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* All */}
        {report && tab === "all" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              ALL RESULTS — {report.totalTests}
            </div>
            {report.suites.flatMap(s => s.results).map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30 transition-colors">
                <Badge label={r.status} style={STATUS_STYLES[r.status]} />
                <span className="text-zinc-300 text-sm flex-1 truncate">{r.testName}</span>
                <span className="text-zinc-600 text-xs hidden sm:block truncate max-w-36">{r.suiteName}</span>
                <span className="text-zinc-600 text-xs w-10 text-right">{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        )}

        {!report && !running && (
          <div className="border border-zinc-700 rounded-xl p-10 text-center bg-zinc-900 space-y-2">
            <div className="text-zinc-400 text-sm">EV-4 validates live connectors against real Google APIs.</div>
            <div className="text-zinc-600 text-xs">Requires active Google Workspace OAuth connection.</div>
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EV-4</div>
          {[
            "OAuth: getConnection() returns valid CONNECTED state",
            "OAuth: isConnected() returns true for active workspace",
            "OAuth: isReal === true (not a simulated session)",
            "Token: getAccessToken() returns non-null token from memory",
            "Token: ensureValidToken() resolves without throwing",
            "Backend: googleOAuthRefresh() returns a valid access token",
            "Backend: consecutive refresh calls both succeed",
            "Connector Runtime: ConnectorKnowledgePipeline executes with live-derived request",
            "Connector Runtime: AUTH, REFRESH_TOKEN, FAILOVER, RETRY — all produce valid results",
            "Error Handling: unknown workspace gracefully returns null (never throws)",
            "Parameter Builder: real connection parameters flow correctly into context",
            "SDK: all GoogleAuthSession public methods are callable and typed correctly",
          ].map((c, i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}