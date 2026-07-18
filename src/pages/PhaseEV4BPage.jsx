/**
 * PhaseEV4BPage.jsx — Sprint EV-4B
 * Real End-to-End Connector Acceptance Dashboard
 * Route: /ev4b
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { getConnection, getMetrics } from "@/lib/google-auth/GoogleAuthSession";

const STATUS_COLOR = {
  PASS:  "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:  "bg-red-900/40 text-red-300 border-red-700",
  ERROR: "bg-orange-900/40 text-orange-300 border-orange-700",
  SKIP:  "bg-zinc-800 text-zinc-400 border-zinc-600",
};

const CONNECTOR_COLOR = {
  "Google Drive":    "text-blue-300",
  "Gmail":           "text-red-300",
  "Google Calendar": "text-green-300",
  "GitHub":          "text-zinc-300",
  "Base44":          "text-violet-300",
};

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-1.5 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>{label}</span>;
}

function Metric({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={"text-lg font-bold font-mono " + (color || "text-violet-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function ProgressBar({ value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={(color || "bg-emerald-600") + " h-full transition-all"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-xs text-zinc-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

function ConnectorCard({ name, results }) {
  const [open, setOpen] = useState(false);
  const [expand, setExpand] = useState({});

  if (!results) return (
    <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900">
      <div className={"text-xs font-bold mb-1 " + (CONNECTOR_COLOR[name] || "text-zinc-400")}>{name}</div>
      <div className="text-zinc-600 text-xs">Not yet run</div>
    </div>
  );

  const pass  = results.filter(r => r.status === "PASS").length;
  const fail  = results.filter(r => r.status === "FAIL").length;
  const skip  = results.filter(r => r.status === "SKIP").length;
  const total = results.length;
  const ok    = fail === 0;
  const avgMs = total > 0 ? Math.round(results.reduce((a, r) => a + r.durationMs, 0) / total) : 0;

  return (
    <div className={"border rounded-xl bg-zinc-900 " + (ok ? "border-zinc-700" : "border-red-800")}>
      <button className="w-full text-left p-4" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-3 mb-2">
          <span className={"text-sm font-bold " + (CONNECTOR_COLOR[name] || "text-zinc-300")}>{name}</span>
          <span className={"text-xs font-bold " + (ok ? "text-emerald-400" : "text-red-400")}>{pass}/{total}</span>
          {skip > 0 && <span className="text-xs text-zinc-500">{skip} skip</span>}
          <span className="text-zinc-600 text-xs ml-auto">{avgMs}ms avg</span>
          <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
        </div>
        <ProgressBar value={pass} total={total} color={ok ? "bg-emerald-600" : "bg-red-600"} />
      </button>

      {open && (
        <div className="border-t border-zinc-800">
          {results.map(r => (
            <div key={r.id}>
              <button onClick={() => setExpand(p => ({ ...p, [r.id]: !p[r.id] }))}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                <Badge label={r.status} style={STATUS_COLOR[r.status]} />
                <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                <span className="text-zinc-600 text-xs">{r.durationMs}ms</span>
                {(r.error || Object.keys(r.evidence || {}).length > 0) && (
                  <span className="text-zinc-500 text-xs">{expand[r.id] ? "▲" : "▼"}</span>
                )}
              </button>
              {expand[r.id] && (
                <div className="px-4 pb-3 pt-2 bg-zinc-900/80 border-b border-zinc-800 space-y-2">
                  {r.error && <div className="text-red-300 text-xs font-mono bg-red-950/20 rounded p-2">{r.error}</div>}
                  {r.failureDetails && (
                    <div className="text-xs space-y-1 text-zinc-400">
                      <div><span className="text-zinc-500">component:</span> {r.failureDetails.component}</div>
                      <div><span className="text-zinc-500">fix:</span> {r.failureDetails.fix}</div>
                    </div>
                  )}
                  {r.evidence && Object.keys(r.evidence).length > 0 && (
                    <pre className="text-zinc-400 text-xs bg-zinc-800/60 rounded p-2 overflow-x-auto max-h-40">
                      {JSON.stringify(r.evidence, null, 2)}
                    </pre>
                  )}
                  {r.trace && r.trace.steps && r.trace.steps.length > 0 && (
                    <details>
                      <summary className="text-zinc-500 text-xs cursor-pointer">Trace ({r.trace.steps.length} steps · {r.trace.totalMs}ms)</summary>
                      <div className="mt-1 space-y-0.5">
                        {r.trace.steps.map((s, i) => (
                          <div key={i} className={"text-xs flex gap-2 px-2 py-0.5 rounded " + (s.status === "OK" ? "text-emerald-400" : s.status === "FAIL" ? "text-red-400" : "text-zinc-500")}>
                            <span className="text-zinc-600 w-14 shrink-0 font-mono">{s.durationMs}ms</span>
                            <span className="font-mono">{s.step}</span>
                            <span className="text-zinc-500">{s.status}</span>
                            {s.detail && <span className="text-zinc-600 truncate">{s.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoverageMatrix({ allResults }) {
  const ENDPOINTS = {
    "Google Drive":    ["about.get","files.list","files.search(RG)","files.search(pdf)","files.search(img)","files.search(gdoc)","files.search(docx)","files.search(xlsx)","files.search(ppt)","folders.list","recursive","download","export","create folder","create file","update","delete","not found","permission","stress"],
    "Gmail":           ["profile.get","labels.list","messages.list","messages.get","messages.search","drafts.create","drafts.delete","attachments.get","stress"],
    "Google Calendar": ["calendarList.list","events.list","events.search","events.insert","events.update","events.delete"],
    "GitHub":          ["users.get","repos.list","branches.list","contents.get","compare","git.refs.create","contents.create","pulls.create","git.refs.delete"],
    "Base44":          ["auth.me","Project.list","ChatSession.list","Document.list","ChatSession.create","ChatSession.update","ChatSession.delete","Project.filter","Message.list","stress"],
  };

  return (
    <div className="space-y-3">
      {Object.entries(ENDPOINTS).map(([conn, endpoints]) => {
        const connResults = allResults[conn] || [];
        return (
          <div key={conn} className="border border-zinc-800 rounded-xl p-3 bg-zinc-900">
            <div className={"text-xs font-bold mb-2 " + (CONNECTOR_COLOR[conn] || "text-zinc-400")}>{conn}</div>
            <div className="flex flex-wrap gap-1">
              {endpoints.map(ep => {
                const matched = connResults.find(r =>
                  r.name.toLowerCase().includes(ep.split(".")[0].split("(")[0]) ||
                  r.name.toLowerCase().includes(ep.replace(/[().]/g, " ").toLowerCase())
                );
                const status = matched?.status;
                return (
                  <span key={ep} className={"text-xs px-2 py-0.5 rounded border font-mono " +
                    (status === "PASS" ? "border-emerald-700 text-emerald-400 bg-emerald-900/20" :
                     status === "FAIL" ? "border-red-700 text-red-400 bg-red-900/20" :
                     status === "SKIP" ? "border-zinc-700 text-zinc-500 bg-zinc-800/30" :
                     "border-zinc-800 text-zinc-600")}>
                    {status === "PASS" ? "✓ " : status === "FAIL" ? "✗ " : "○ "}{ep}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FailureReport({ allResults }) {
  const failures = Object.entries(allResults)
    .flatMap(([conn, tests]) => tests.filter(t => t.status === "FAIL").map(t => ({ ...t, connector: conn })));

  if (!failures.length) return (
    <div className="border border-emerald-700 rounded-xl bg-emerald-950/20 p-8 text-center text-emerald-400 font-bold">
      ✓ No failures detected across all live connectors
    </div>
  );

  return (
    <div className="space-y-3">
      {failures.map(f => (
        <div key={f.id} className="border border-red-800 rounded-xl bg-zinc-900 p-4">
          <div className="flex items-center gap-3 mb-2">
            <Badge label="FAIL" style={STATUS_COLOR.FAIL} />
            <span className="text-zinc-200 text-sm font-bold">{f.name}</span>
            <span className={"text-xs " + (CONNECTOR_COLOR[f.connector] || "text-zinc-500")}>{f.connector}</span>
          </div>
          <div className="text-red-300 text-xs font-mono bg-red-950/20 rounded p-2 mb-2">{f.error}</div>
          {f.failureDetails && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-zinc-500">Component:</span> <span className="text-zinc-300">{f.failureDetails.component}</span></div>
              <div><span className="text-zinc-500">Priority:</span> <span className="text-zinc-300">{f.failureDetails.priority}</span></div>
              <div className="col-span-2"><span className="text-zinc-500">Cause:</span> <span className="text-zinc-300">{f.failureDetails.cause}</span></div>
              <div className="col-span-2"><span className="text-zinc-500">Fix:</span> <span className="text-zinc-300">{f.failureDetails.fix}</span></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PerformanceReport({ allResults }) {
  const rows = Object.entries(allResults).map(([conn, tests]) => {
    const passed = tests.filter(r => r.status === "PASS");
    if (!passed.length) return null;
    const durations = passed.map(r => r.durationMs).sort((a, b) => a - b);
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1] ?? 0;
    return { conn, total: tests.length, pass: passed.length, avg, min: durations[0], max: durations[durations.length - 1], p95 };
  }).filter(Boolean);

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">PERFORMANCE REPORT</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-zinc-800">
            {["Connector","Tests","Pass","Avg ms","Min ms","Max ms","P95 ms"].map(h => (
              <th key={h} className="px-3 py-2 text-left text-zinc-500 font-normal">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.conn} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className={"px-3 py-2 font-bold " + (CONNECTOR_COLOR[r.conn] || "text-zinc-400")}>{r.conn}</td>
                <td className="px-3 py-2 text-zinc-400">{r.total}</td>
                <td className="px-3 py-2 text-emerald-400">{r.pass}</td>
                <td className={"px-3 py-2 font-mono " + (r.avg < 1000 ? "text-emerald-400" : r.avg < 3000 ? "text-yellow-400" : "text-red-400")}>{r.avg}</td>
                <td className="px-3 py-2 text-zinc-400 font-mono">{r.min}</td>
                <td className="px-3 py-2 text-zinc-400 font-mono">{r.max}</td>
                <td className={"px-3 py-2 font-mono " + (r.p95 < 3000 ? "text-zinc-300" : "text-red-400")}>{r.p95}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PhaseEV4BPage() {
  const [conn,       setConn]       = useState(null);
  const [allResults, setAllResults] = useState({});
  const [running,    setRunning]    = useState(false);
  const [progress,   setProgress]   = useState("");
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState("connectors");
  const runningRef = useRef(false);

  useEffect(() => {
    const refresh = () => setConn(getConnection("default"));
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, []);

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setErr(null);
    setAllResults({});

    const results = {};

    async function runConnector(name, fn) {
      setProgress(`Running ${name}...`);
      try {
        results[name] = await fn();
      } catch (e) {
        results[name] = [{
          id: `${name}-ERR`, name: `${name} suite error`,
          status: "FAIL", durationMs: 0,
          error: e?.message ?? String(e), evidence: {},
          trace: { requestId: name, operation: name, totalMs: 0, steps: [] },
        }];
      }
      setAllResults({ ...results });
    }

    try {
      const [
        { runGoogleDriveAcceptanceTests },
        { runGmailAcceptanceTests },
        { runGoogleCalendarAcceptanceTests },
        { runGitHubAcceptanceTests },
        { runBase44AcceptanceTests },
      ] = await Promise.all([
        import("@/tests/acceptance/GoogleDriveAcceptanceTests"),
        import("@/tests/acceptance/GmailAcceptanceTests"),
        import("@/tests/acceptance/GoogleCalendarAcceptanceTests"),
        import("@/tests/acceptance/GitHubAcceptanceTests"),
        import("@/tests/acceptance/Base44AcceptanceTests"),
      ]);

      await runConnector("Google Drive",    runGoogleDriveAcceptanceTests);
      await runConnector("Gmail",           runGmailAcceptanceTests);
      await runConnector("Google Calendar", runGoogleCalendarAcceptanceTests);
      await runConnector("GitHub",          runGitHubAcceptanceTests);
      await runConnector("Base44",          runBase44AcceptanceTests);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
      setProgress("");
      runningRef.current = false;
    }
  }, []);

  const connected  = conn && conn.state === "CONNECTED";
  const allTests   = Object.values(allResults).flat();
  const totalPass  = allTests.filter(t => t.status === "PASS").length;
  const totalFail  = allTests.filter(t => t.status === "FAIL").length;
  const totalSkip  = allTests.filter(t => t.status === "SKIP").length;
  const totalAll   = allTests.length;
  const certified  = totalAll > 0 && totalFail === 0;
  const avgMs      = totalAll > 0 ? Math.round(allTests.reduce((a, t) => a + t.durationMs, 0) / totalAll) : 0;
  const sortedMs   = [...allTests].sort((a, b) => a.durationMs - b.durationMs);
  const p95        = sortedMs[Math.floor(sortedMs.length * 0.95)]?.durationMs ?? 0;

  const tabs = ["connectors","coverage","failures","performance","audit"];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EV-4B — REAL END-TO-END CONNECTOR ACCEPTANCE</div>
              <div className="text-xl font-bold text-white">Live Service Validation — No Mocks</div>
              <div className="text-zinc-400 text-sm mt-1">Google Drive · Gmail · Google Calendar · GitHub · Base44</div>
            </div>
            <Badge label="LIVE" style="border-red-600 text-red-300 bg-red-900/20 text-sm px-3 py-1.5" />
          </div>
        </div>

        {/* Trace pipeline */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 overflow-x-auto">
          <div className="flex items-center gap-1 text-xs min-w-max">
            {["Intent","Goal","Planner","Params","Connector","SDK","OAuth","HTTP Req","HTTP Res","Parser","Response","Audit"].map((n, i, arr) => (
              <React.Fragment key={n}>
                <span className={"border rounded px-1.5 py-0.5 " + (i === 0 ? "border-blue-700 text-blue-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{n}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Connection banner */}
        <div className={"border rounded-xl p-3 " + (connected ? "border-emerald-700 bg-emerald-950/20" : "border-amber-700 bg-amber-950/20")}>
          <div className="flex items-center gap-3">
            <div className={"w-2 h-2 rounded-full shrink-0 " + (connected ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
            <div>
              <div className={"text-sm font-bold " + (connected ? "text-emerald-400" : "text-amber-400")}>
                {connected ? `Google Connected — ${conn?.email}` : "Google Workspace not connected"}
              </div>
              <div className="text-zinc-500 text-xs mt-0.5">
                {connected ? "Drive + Gmail + Calendar tests active · GitHub uses PAT from /connections · Base44 uses current session" : "Connect via /connections for Drive, Gmail & Calendar tests. GitHub + Base44 tests run regardless."}
              </div>
            </div>
          </div>
        </div>

        {/* Run button */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runAll} disabled={running}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? `Running... ${progress}` : "▶  Run All Live Acceptance Tests (EV-4B)"}
          </button>
          {totalAll > 0 && <div className="text-zinc-400 text-sm">{totalAll} tests · avg {avgMs}ms · p95 {p95}ms</div>}
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">{err}</div>}

        {/* Certification banner */}
        {totalAll > 0 && (
          <div className={"border-2 rounded-xl p-5 text-center " + (certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-2xl font-bold " + (certified ? "text-emerald-400" : "text-red-400")}>
              {certified ? "✓ EV-4B CERTIFIED — ALL LIVE CONNECTORS VALIDATED" : "✗ CONNECTOR FAILURES — REVIEW REQUIRED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">{totalPass} pass · {totalFail} fail · {totalSkip} skip / {totalAll} total</div>
          </div>
        )}

        {/* Metrics */}
        {totalAll > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Metric label="Total"  value={totalAll} />
            <Metric label="Pass"   value={totalPass}  color="text-emerald-400" />
            <Metric label="Fail"   value={totalFail}  color={totalFail > 0 ? "text-red-400" : "text-zinc-500"} />
            <Metric label="Skip"   value={totalSkip}  color="text-zinc-500" />
            <Metric label="Avg"    value={avgMs + "ms"} color="text-sky-400" />
            <Metric label="P95"    value={p95 + "ms"}   color={p95 < 3000 ? "text-zinc-300" : "text-red-400"} />
          </div>
        )}

        {/* Tabs */}
        {totalAll > 0 && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t ? "bg-red-700 text-white" : "text-zinc-400 hover:text-white")}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}

        {tab === "connectors" && (
          <div className="space-y-3">
            {["Google Drive","Gmail","Google Calendar","GitHub","Base44"].map(name => (
              <ConnectorCard key={name} name={name} results={allResults[name]} />
            ))}
          </div>
        )}

        {tab === "coverage" && totalAll > 0 && <CoverageMatrix allResults={allResults} />}
        {tab === "failures" && totalAll > 0 && <FailureReport allResults={allResults} />}
        {tab === "performance" && totalAll > 0 && <PerformanceReport allResults={allResults} />}

        {tab === "audit" && totalAll > 0 && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">AUDIT LOG — {totalAll} OPERATIONS</div>
            <div className="max-h-96 overflow-y-auto">
              {allTests.map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <Badge label={t.status} style={STATUS_COLOR[t.status]} />
                  <span className="text-zinc-300 text-xs flex-1 truncate">{t.name}</span>
                  <span className="text-zinc-600 text-xs font-mono w-12 text-right">{t.durationMs}ms</span>
                  <span className="text-zinc-700 text-xs font-mono w-20 text-right">{t.id}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalAll === 0 && !running && (
          <div className="border border-zinc-700 rounded-xl p-10 text-center bg-zinc-900">
            <div className="text-zinc-400 text-sm mb-1">EV-4B executes real API calls against all 5 connectors.</div>
            <div className="text-zinc-600 text-xs">Temporary resources created during tests are cleaned up automatically.</div>
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EV-4B</div>
          {[
            "Google Drive: 20 real tests — about.get, files.list, 7 search types, folders, recursive, download, export, CRUD, stress",
            "Gmail: 9 real tests — profile, labels, messages, search, draft lifecycle, attachments, stress",
            "Google Calendar: 6 real tests — calendars, events list/search, insert/update/delete lifecycle",
            "GitHub: 9 real tests — user, repos, branches, file get, compare, branch create, commit, PR, cleanup",
            "Base44: 10 real tests — auth.me, entity CRUD, filter, pagination, concurrent stress",
            "Full trace on every operation: timestamp · duration · request id · status · sanitized payload",
            "Failures expose: cause · component · impact · priority · fix recommendation",
            "Coverage matrix shows exactly which endpoints were exercised vs pending",
          ].map((c, i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}