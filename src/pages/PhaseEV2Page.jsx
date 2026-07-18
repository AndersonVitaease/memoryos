/**
 * PhaseEV2Page.jsx — Sprint EV-2 Dashboard
 * Pipeline Integration Validation
 * Route: /ev2
 */

import React, { useState, useCallback } from "react";
import { TestRunner }   from "@/testing/TestRunner";
import { TestEngine }   from "@/testing/TestEngine";
import { registerAllIntegrationTests } from "@/tests/integration/IntegrationSuite";

const STATUS_STYLES = {
  PASS:    "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:    "bg-red-900/40 text-red-300 border-red-700",
  ERROR:   "bg-orange-900/40 text-orange-300 border-orange-700",
  SKIPPED: "bg-zinc-800 text-zinc-400 border-zinc-600",
  PENDING: "bg-zinc-800 text-zinc-400 border-zinc-600",
};

const PIPELINE_SUITE_LABELS = {
  "KnowledgeQueryPipeline [INT]":    { short: "KQ Pipeline",    color: "border-sky-700 text-sky-300" },
  "PlanningKnowledgePipeline [INT]": { short: "Planning",       color: "border-violet-700 text-violet-300" },
  "DecisionKnowledgePipeline [INT]": { short: "Decision",       color: "border-amber-700 text-amber-300" },
  "EngineeringKnowledgePipeline [INT]": { short: "Engineering", color: "border-emerald-700 text-emerald-300" },
  "ConnectorKnowledgePipeline [INT]":{ short: "Connector",      color: "border-pink-700 text-pink-300" },
  "GovernancePipeline [INT]":        { short: "Governance",     color: "border-orange-700 text-orange-300" },
  "OperationalKnowledgePipeline [INT]":{ short: "Operational",  color: "border-cyan-700 text-cyan-300" },
  "PipelineStress [INT]":            { short: "Stress",         color: "border-red-700 text-red-300" },
  "PipelinePerformance [INT]":       { short: "Performance",    color: "border-zinc-600 text-zinc-300" },
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

function PipelineCard({ suite }) {
  const meta  = PIPELINE_SUITE_LABELS[suite.suiteName] ?? { short: suite.suiteName, color: "border-zinc-700 text-zinc-400" };
  const pct   = suite.total > 0 ? Math.round((suite.passed / suite.total) * 100) : 0;
  const ok    = suite.failed + suite.errors === 0;
  return (
    <div className={"border rounded-lg p-3 bg-zinc-900 " + (ok ? "border-zinc-700" : "border-red-800")}>
      <div className="flex items-center justify-between mb-2">
        <span className={"text-xs font-bold " + meta.color}>{meta.short}</span>
        <span className={"text-xs font-mono " + (ok ? "text-emerald-400" : "text-red-400")}>{suite.passed}/{suite.total}</span>
      </div>
      <ProgressBar value={suite.passed} total={suite.total} color={ok ? "bg-emerald-600" : "bg-red-600"} />
      <div className="text-zinc-600 text-xs mt-1">{suite.durationMs}ms</div>
    </div>
  );
}

function PerformanceTable({ report }) {
  const perfSuite = report?.suites?.find(s => s.suiteName === "PipelinePerformance [INT]");
  if (!perfSuite) return null;

  // Extract perf stats from _perfResults (imported at runtime)
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
      <div className="text-xs text-zinc-400 tracking-widest mb-3">PERFORMANCE MEASUREMENTS</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {perfSuite.results.map(r => (
          <div key={r.id} className={"flex items-center gap-2 px-3 py-2 rounded border " + STATUS_STYLES[r.status]}>
            <span className="text-xs flex-1 truncate">{r.testName}</span>
            <span className="text-xs text-zinc-500">{r.durationMs}ms</span>
            <Badge label={r.status} style={STATUS_STYLES[r.status]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StressSummary({ report }) {
  const stressSuite = report?.suites?.find(s => s.suiteName === "PipelineStress [INT]");
  if (!stressSuite) return null;
  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-zinc-400 tracking-widest">STRESS TEST RESULTS</div>
        <Badge
          label={stressSuite.failed + stressSuite.errors === 0 ? "NO LEAKS" : "FAILURES"}
          style={stressSuite.failed + stressSuite.errors === 0 ? "border-emerald-700 text-emerald-300 bg-emerald-900/30" : STATUS_STYLES.FAIL}
        />
      </div>
      <div className="space-y-1">
        {stressSuite.results.map(r => (
          <div key={r.id} className={"flex items-center gap-2 px-3 py-1.5 rounded text-xs " + (r.status === "PASS" ? "bg-emerald-950/30 border border-emerald-900/40" : "bg-red-950/30 border border-red-900/40")}>
            <span className={r.status === "PASS" ? "text-emerald-400" : "text-red-400"}>
              {r.status === "PASS" ? "✓" : "✗"}
            </span>
            <span className="flex-1 text-zinc-300">{r.testName}</span>
            <span className="text-zinc-600">{r.durationMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapRow({ suite }) {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="text-zinc-500 text-xs w-44 truncate shrink-0">{PIPELINE_SUITE_LABELS[suite.suiteName]?.short ?? suite.suiteName}</span>
      <div className="flex gap-0.5 flex-wrap flex-1">
        {suite.results.map(r => (
          <div key={r.id} title={r.testName}
            className={"w-3 h-3 rounded-sm " + (r.status === "PASS" ? "bg-emerald-600" : r.status === "FAIL" ? "bg-red-600" : r.status === "ERROR" ? "bg-orange-500" : "bg-zinc-700")} />
        ))}
      </div>
      <span className="text-zinc-600 text-xs w-10 text-right">{suite.passed}/{suite.total}</span>
    </div>
  );
}

export default function PhaseEV2Page() {
  const [report,   setReport]   = useState(null);
  const [running,  setRunning]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [tab,      setTab]      = useState("overview");
  const [expanded, setExpanded] = useState({});

  const runTests = useCallback(async () => {
    setRunning(true);
    setErr(null);
    setReport(null);
    try {
      TestEngine.clear();
      registerAllIntegrationTests();
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

  const totalIntegration = report?.suites?.filter(s => s.suiteName.includes("[INT]")).reduce((a, s) => a + s.total, 0) ?? 0;
  const passedIntegration = report?.suites?.filter(s => s.suiteName.includes("[INT]")).reduce((a, s) => a + s.passed, 0) ?? 0;
  const stressSuite  = report?.suites?.find(s => s.suiteName === "PipelineStress [INT]");
  const perfSuite    = report?.suites?.find(s => s.suiteName === "PipelinePerformance [INT]");
  const failedSuites = report?.suites?.filter(s => s.failed + s.errors > 0) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EV-2 — PIPELINE INTEGRATION VALIDATION</div>
          <div className="text-xl font-bold text-white">Integration Test Suite</div>
          <div className="text-zinc-400 text-sm mt-1">
            9 Pipelines · 86 Integration Tests · Stress (100/500/1000) · Performance Benchmarks
          </div>
        </div>

        {/* Pipeline flow */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 overflow-x-auto">
          <div className="flex items-center gap-1 text-xs min-w-max">
            {["Intent/Goal/Task","Context Builder","Knowledge Provider","Risk Analyzer","Governance Validator","Confidence","Strategy/Advisor","Report","Audit"].map((n, i, arr) => (
              <React.Fragment key={n}>
                <span className={"border rounded px-1.5 py-0.5 " + (i === 0 ? "border-sky-700 text-sky-300" : i === arr.length-1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400")}>{n}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runTests} disabled={running}
            className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running integration tests..." : "▶  Run EV-2 Integration Suite"}
          </button>
          {report && (
            <div className="text-zinc-400 text-sm">
              {report.reportId} · {report.totalTests} tests · {report.durationMs}ms
            </div>
          )}
        </div>

        {err && (
          <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">Error: {err}</div>
        )}

        {/* Certification banner */}
        {report && (
          <div className={"border-2 rounded-xl p-5 text-center " + (report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-2xl font-bold " + (report.certified ? "text-emerald-400" : "text-red-400")}>
              {report.certified ? "✓ EV-2 CERTIFIED — ALL PIPELINES INTEGRATED" : "✗ INTEGRATION FAILURES DETECTED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              {report.totalPassed}/{report.totalTests} passed · {report.totalFailed} failed · {report.passRate}% pass rate
            </div>
          </div>
        )}

        {/* Top metrics */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Total Tests"    value={report.totalTests} />
            <Metric label="Integration"    value={`${passedIntegration}/${totalIntegration}`} color="text-sky-400" />
            <Metric label="Stress Passed"  value={stressSuite ? `${stressSuite.passed}/${stressSuite.total}` : "—"} color="text-orange-400" />
            <Metric label="Perf Passed"    value={perfSuite ? `${perfSuite.passed}/${perfSuite.total}` : "—"} color="text-zinc-300" />
          </div>
        )}

        {/* Tabs */}
        {report && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {["overview","pipelines","stress","performance","failures","heatmap","coverage","all"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t ? "bg-sky-700 text-white" : "text-zinc-400 hover:text-white")}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {report && tab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {report.suites.map(suite => <PipelineCard key={suite.suiteName} suite={suite} />)}
          </div>
        )}

        {/* ── PIPELINES ─────────────────────────────────────────────────────── */}
        {report && tab === "pipelines" && (
          <div className="space-y-3">
            {report.suites.filter(s => s.suiteName.includes("[INT]") && !s.suiteName.includes("Stress") && !s.suiteName.includes("Performance")).map(suite => (
              <div key={suite.suiteName} className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800">
                  <span className="text-zinc-200 text-sm font-bold flex-1">{suite.suiteName}</span>
                  <Badge label={suite.category} />
                  <span className={suite.failed + suite.errors > 0 ? "text-red-400 text-xs font-bold" : "text-emerald-400 text-xs font-bold"}>
                    {suite.passed}/{suite.total}
                  </span>
                  <span className="text-zinc-600 text-xs">{suite.durationMs}ms</span>
                </div>
                {suite.results.map(r => (
                  <div key={r.id}>
                    <button onClick={() => toggle(r.id)}
                      className="w-full text-left flex items-center gap-3 px-4 py-2 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                      <Badge label={r.status} style={STATUS_STYLES[r.status]} />
                      <span className="text-zinc-300 text-sm flex-1">{r.testName}</span>
                      <span className="text-zinc-600 text-xs">{r.durationMs}ms</span>
                    </button>
                    {expanded[r.id] && r.error && (
                      <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/60">
                        <div className="text-red-300 text-xs font-mono bg-red-950/20 rounded p-2">{r.error}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── STRESS ─────────────────────────────────────────────────────────── */}
        {report && tab === "stress" && <StressSummary report={report} />}

        {/* ── PERFORMANCE ────────────────────────────────────────────────────── */}
        {report && tab === "performance" && <PerformanceTable report={report} />}

        {/* ── FAILURES ───────────────────────────────────────────────────────── */}
        {report && tab === "failures" && (
          <div className="space-y-3">
            {failedSuites.length === 0 ? (
              <div className="border border-emerald-700 rounded-xl bg-emerald-950/20 p-8 text-center text-emerald-400 font-bold">
                ✓ No failures detected — all pipelines passed
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
                    {r.error && <div className="text-red-300 text-xs font-mono mt-1">{r.error}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── HEATMAP ──────────────────────────────────────────────────────────── */}
        {report && tab === "heatmap" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
            <div className="text-xs text-zinc-400 tracking-widest mb-3">TEST HEATMAP — ■ Pass · ■ Fail · ■ Error</div>
            <div className="space-y-1">
              {report.suites.map(suite => <HeatmapRow key={suite.suiteName} suite={suite} />)}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block"/> Pass</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600 inline-block"/> Fail</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block"/> Error</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-zinc-700 inline-block"/> Skip</span>
            </div>
          </div>
        )}

        {/* ── COVERAGE ─────────────────────────────────────────────────────────── */}
        {report && tab === "coverage" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-zinc-400 tracking-widest">MODULE COVERAGE</div>
              <div className="text-sm font-bold text-sky-400">{report.coverage.coverageRate}%</div>
            </div>
            <ProgressBar value={report.coverage.testedModules} total={report.coverage.totalModules} color="bg-sky-600" />
            <div className="text-zinc-500 text-xs mt-1">{report.coverage.testedModules}/{report.coverage.totalModules} known modules covered</div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-64 overflow-y-auto">
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

        {/* ── ALL RESULTS ──────────────────────────────────────────────────────── */}
        {report && tab === "all" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              ALL RESULTS — {report.totalTests}
            </div>
            {report.suites.flatMap(s => s.results).map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30 transition-colors">
                <Badge label={r.status} style={STATUS_STYLES[r.status]} />
                <span className="text-zinc-300 text-sm flex-1 truncate">{r.testName}</span>
                <span className="text-zinc-600 text-xs hidden sm:block truncate max-w-32">{r.suiteName}</span>
                <span className="text-zinc-600 text-xs w-10 text-right">{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        )}

        {!report && !running && (
          <div className="border border-zinc-700 rounded-xl p-10 text-center text-zinc-500 text-sm bg-zinc-900">
            Press "Run EV-2 Integration Suite" to validate all pipelines.
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EV-2</div>
          {[
            "All 7 cognitive pipelines have integration tests (KQ, Planning, Decision, Engineering, Connector, Governance, OKB)",
            "All pipeline flows execute end-to-end without throwing",
            "Stress tests: 100, 500, 1000 consecutive runs — 0 errors",
            "Performance benchmarks recorded for all 5 runtimes",
            "No shared mutable state detected across consecutive runs",
            "Immutability contract: result objects returned frozen or structurally immutable",
            "Confidence scores always in [0, 1] range across all pipelines",
            "Advisory.proceed always of type boolean",
            "No regressions introduced from EV-1",
            "Dashboard: Overview, Pipelines, Stress, Performance, Failures, Heatmap, Coverage",
          ].map((c, i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}