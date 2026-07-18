/**
 * PhaseEV1Page.jsx — Sprint EV-1 Dashboard
 * Engineering Validation Platform — Unit Test Foundation
 * Route: /ev1
 */

import React, { useState, useCallback } from "react";
import { TestRunner }    from "@/testing/TestRunner";
import { TestEngine }    from "@/testing/TestEngine";

// ── Test suite registrations ───────────────────────────────────────────────────
import { registerAssertionEngineTests }          from "@/tests/unit/AssertionEngineTests";
import { registerKnowledgeQueryCacheTests }       from "@/tests/unit/KnowledgeQueryCacheTests";
import { registerGovernancePolicyRegistryTests }  from "@/tests/unit/GovernancePolicyRegistryTests";
import { registerConnectorKnowledgePipelineTests }from "@/tests/unit/ConnectorKnowledgePipelineTests";
import { registerEngineeringKnowledgePipelineTests } from "@/tests/unit/EngineeringKnowledgePipelineTests";
import { registerKnowledgeQueryFacadeTests }      from "@/tests/unit/KnowledgeQueryFacadeTests";
import { registerRegressionTests }               from "@/tests/regression/RegressionSuite";

const STATUS_STYLES = {
  PASS:    "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:    "bg-red-900/40 text-red-300 border-red-700",
  ERROR:   "bg-orange-900/40 text-orange-300 border-orange-700",
  SKIPPED: "bg-zinc-800 text-zinc-400 border-zinc-600",
  PENDING: "bg-zinc-800 text-zinc-400 border-zinc-600",
};

const SUITE_TABS = ["All", "AssertionEngine", "KnowledgeQueryFacade", "KnowledgeQueryCache", "GovernancePolicyRegistry", "ConnectorKnowledgePipeline", "EngineeringKnowledgePipeline", "Regression"];

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-1.5 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-700")}>{label}</span>;
}

function Metric({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className={"text-2xl font-bold font-mono " + (color || "text-violet-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-1">{label}</div>
    </div>
  );
}

function ProgressBar({ value, total, color = "bg-emerald-600" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={color + " h-full transition-all"} style={{ width: pct + "%" }} />
      </div>
      <span className="text-xs text-zinc-500 w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function PhaseEV1Page() {
  const [report,   setReport]   = useState(null);
  const [running,  setRunning]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [tab,      setTab]      = useState("All");
  const [expanded, setExpanded] = useState({});

  const runTests = useCallback(async () => {
    setRunning(true);
    setErr(null);
    setReport(null);
    try {
      // Clear registry and re-register all suites
      TestEngine.clear();
      registerAssertionEngineTests();
      registerKnowledgeQueryCacheTests();
      registerGovernancePolicyRegistryTests();
      registerConnectorKnowledgePipelineTests();
      registerEngineeringKnowledgePipelineTests();
      registerKnowledgeQueryFacadeTests();
      registerRegressionTests();

      const r = await TestRunner.runAll();
      setReport(r);
      setTab("All");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  function toggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const visibleResults = report
    ? (tab === "All"
        ? report.suites.flatMap(s => s.results)
        : (report.suites.find(s => s.suiteName === tab)?.results ?? []))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EV-1 — ENGINEERING VALIDATION PLATFORM</div>
          <div className="text-xl font-bold text-white">Unit Test Foundation</div>
          <div className="text-zinc-400 text-sm mt-1">
            TestEngine · AssertionEngine · TestRunner · TestReportGenerator · CoverageAnalyzer · RegressionDetector
          </div>
        </div>

        {/* Pipeline */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["TestScenarioBuilder","TestEngine","AssertionEngine","TestRunner","CoverageAnalyzer","RegressionDetector","TestReportGenerator","Dashboard"].map((n, i, arr) => (
              <React.Fragment key={n}>
                <span className={"border rounded px-2 py-1 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{n}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Run button */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runTests} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running tests..." : "▶  Run All Tests (EV-1)"}
          </button>
          {report && (
            <div className="text-zinc-400 text-sm">
              Report: <span className="text-violet-300">{report.reportId}</span>
              {" · "}{report.durationMs}ms
            </div>
          )}
        </div>

        {err && (
          <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">
            Error: {err}
          </div>
        )}

        {/* Certification banner */}
        {report && (
          <div className={"border-2 rounded-xl p-5 text-center " + (report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-2xl font-bold " + (report.certified ? "text-emerald-400" : "text-red-400")}>
              {report.certified ? "✓ EV-1 CERTIFIED — ALL TESTS PASS" : "✗ TEST SUITE FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              {report.totalPassed}/{report.totalTests} passed · {report.totalFailed} failed · {report.totalErrors} errors · {report.totalSkipped} skipped
            </div>
          </div>
        )}

        {/* Metrics */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Total Tests"    value={report.totalTests} />
            <Metric label="Passed"         value={report.totalPassed}  color="text-emerald-400" />
            <Metric label="Failed / Errors"value={report.totalFailed + report.totalErrors} color={report.totalFailed + report.totalErrors > 0 ? "text-red-400" : "text-zinc-500"} />
            <Metric label="Pass Rate"      value={report.passRate + "%"} color={report.passRate === 100 ? "text-emerald-400" : report.passRate >= 80 ? "text-yellow-400" : "text-red-400"} />
          </div>
        )}

        {/* Coverage */}
        {report && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-zinc-400 tracking-widest">MODULE COVERAGE</div>
              <div className="text-sm font-bold text-sky-400">{report.coverage.coverageRate}%</div>
            </div>
            <ProgressBar value={report.coverage.testedModules} total={report.coverage.totalModules} />
            <div className="text-zinc-500 text-xs mt-1">{report.coverage.testedModules}/{report.coverage.totalModules} modules covered</div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-40 overflow-y-auto">
              {report.coverage.modules.map(m => (
                <div key={m.module} className={"flex items-center gap-1.5 text-xs px-2 py-1 rounded " + (m.tested ? "text-emerald-400" : "text-zinc-600")}>
                  <span>{m.tested ? "✓" : "○"}</span>
                  <span className="truncate">{m.module}</span>
                  {m.testCount > 0 && <span className="text-zinc-600 shrink-0">×{m.testCount}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Regressions */}
        {report && report.regressions.length > 0 && (
          <div className="border border-red-800 rounded-xl bg-red-950/20 p-4">
            <div className="text-red-400 text-xs tracking-widest mb-2">REGRESSIONS DETECTED — {report.regressions.length}</div>
            {report.regressions.map(r => (
              <div key={r.id} className="flex items-center gap-3 py-1.5 border-b border-red-900/40 last:border-0 text-sm">
                <span className="text-zinc-500 text-xs w-16 shrink-0">{r.id}</span>
                <span className="text-red-300 flex-1">{r.suiteName} → {r.testName}</span>
                <span className="text-zinc-500 text-xs">{r.previousRun} → {r.currentRun}</span>
              </div>
            ))}
          </div>
        )}

        {/* Suite tabs */}
        {report && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {SUITE_TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
                {t === "All" ? `All (${report.totalTests})` : t.replace("KnowledgeQuery","KQ").replace("GovernancePolicy","GovPolicy").replace("KnowledgePipeline","Pipeline")}
              </button>
            ))}
          </div>
        )}

        {/* Suite summary bars */}
        {report && tab === "All" && (
          <div className="space-y-2">
            {report.suites.map(suite => (
              <div key={suite.suiteName} className="border border-zinc-800 rounded-lg bg-zinc-900 px-4 py-3">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-zinc-300 text-sm flex-1">{suite.suiteName}</span>
                  <Badge label={suite.category} />
                  <span className="text-zinc-500 text-xs">{suite.durationMs}ms</span>
                  <span className={suite.failed + suite.errors > 0 ? "text-red-400 text-xs font-bold" : "text-emerald-400 text-xs font-bold"}>
                    {suite.passed}/{suite.total}
                  </span>
                </div>
                <ProgressBar value={suite.passed} total={suite.total} />
              </div>
            ))}
          </div>
        )}

        {/* Test results list */}
        {report && visibleResults.length > 0 && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              TEST RESULTS — {visibleResults.length}
            </div>
            {visibleResults.map(r => (
              <div key={r.id}>
                <button onClick={() => toggle(r.id)}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                  <Badge label={r.status} style={STATUS_STYLES[r.status]} />
                  <span className="text-zinc-300 text-sm flex-1">{r.testName}</span>
                  <span className="text-zinc-600 text-xs">{r.suiteName}</span>
                  <span className="text-zinc-600 text-xs w-12 text-right">{r.durationMs}ms</span>
                  {(r.error || r.evidence?.length > 0) && (
                    <span className="text-zinc-500 text-xs">{expanded[r.id] ? "▲" : "▼"}</span>
                  )}
                </button>
                {expanded[r.id] && (r.error || r.evidence?.length > 0) && (
                  <div className="px-4 pb-3 pt-2 border-b border-zinc-800 bg-zinc-900/60 space-y-2">
                    {r.error && (
                      <div>
                        <div className="text-xs text-red-400 tracking-widest mb-1">ERROR</div>
                        <div className="text-red-300 text-xs font-mono bg-red-950/20 rounded p-2">{r.error}</div>
                      </div>
                    )}
                    {r.evidence?.length > 0 && (
                      <div>
                        <div className="text-xs text-zinc-400 tracking-widest mb-1">EVIDENCE</div>
                        {r.evidence.map((ev, i) => (
                          <div key={i} className="text-xs font-mono text-zinc-400 py-0.5">
                            <span className="text-zinc-500">{ev.key}:</span>{" "}
                            expected <span className="text-sky-400">{JSON.stringify(ev.expected)}</span>{" "}
                            got <span className="text-orange-400">{JSON.stringify(ev.actual)}</span>
                            {ev.note && <span className="text-zinc-500"> — {ev.note}</span>}
                          </div>
                        ))}
                      </div>
                    )}
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
        )}

        {!report && !running && (
          <div className="border border-zinc-700 rounded-lg p-10 text-center text-zinc-500 text-sm bg-zinc-900">
            Press "Run All Tests" to execute the EV-1 test suite.
          </div>
        )}

      </div>
    </div>
  );
}