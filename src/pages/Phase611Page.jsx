import React, { useState } from "react";
import { EngineeringRegressionSuite } from "@/lib/engineering-regression/EngineeringRegressionSuite";

const suite = new EngineeringRegressionSuite();

const CAT_COLOR = {
  KG: "blue", PIPELINE: "purple", ROUTING: "violet", CONNECTOR: "yellow",
  GRAPH: "teal", WORKFLOW: "orange", BASELINE: "red", MEMORY: "green", UCP: "violet", SHR: "orange", EAF: "violet", AEL: "orange",
};

const HEALTH_COLOR = { HEALTHY: "green", DEGRADED: "yellow", NOT_READY: "red", PASS: "green", PARTIAL: "yellow", FAIL: "red", BLOCKED: "red" };

function Badge({ label, color = "gray" }) {
  const c = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    purple: "bg-purple-900/40 text-purple-300 border border-purple-700/40",
    violet: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    teal:   "bg-teal-900/40 text-teal-300 border border-teal-700/40",
    orange: "bg-orange-900/40 text-orange-300 border border-orange-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  return <span className={`text-xs font-mono px-2 py-0.5 rounded ${c[color] ?? c.gray}`}>{label}</span>;
}

function StatCard({ label, value, sub, color = "gray" }) {
  const c = { green: "text-green-300", yellow: "text-yellow-300", red: "text-red-400", blue: "text-blue-300", gray: "text-white" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
      <div className="text-xs font-mono text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold ${c[color] ?? c.gray}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function ResultRow({ r }) {
  const [open, setOpen] = useState(false);
  const icon = r.skipped ? "⏭" : r.passed ? "✅" : "❌";
  const border = r.skipped ? "border-zinc-800" : r.passed ? "border-zinc-800" : "border-red-800/50";
  return (
    <div className={`rounded border ${border} bg-zinc-900`}>
      <button className="w-full flex items-center gap-3 px-3 py-2 text-left" onClick={() => setOpen(o => !o)}>
        <span className="text-xs w-5">{icon}</span>
        <Badge label={r.category} color={CAT_COLOR[r.category] ?? "gray"} />
        <span className="text-sm text-zinc-300 flex-1">{r.testName}</span>
        <span className="text-xs text-zinc-600 font-mono">{r.durationMs}ms</span>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1 border-t border-zinc-800 pt-2">
          <p className="text-xs text-zinc-400">{r.detail}</p>
          {r.rca && <p className="text-xs text-red-400 font-mono">RCA: {r.rca}</p>}
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ["KG", "PIPELINE", "ROUTING", "CONNECTOR", "GRAPH", "WORKFLOW", "BASELINE", "MEMORY", "UCP", "SHR", "EAF", "AEL"];

export default function Phase611Page() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]  = useState("ALL");

  async function runSuite() {
    setLoading(true);
    try {
      const r = await suite.run();
      setReport(r);
    } finally {
      setLoading(false);
    }
  }

  const results = report?.results ?? [];
  const visible = filter === "ALL" ? results : filter === "FAIL" ? results.filter(r => !r.passed) : results.filter(r => r.category === filter);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.1.1</span>
          <Badge label="ENGINEERING REGRESSION SHIELD" color="red" />
        </div>
        <h1 className="text-2xl font-bold">Regression Center</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Permanent regression protection · No implementation may complete without passing this shield
        </p>
      </div>

      {/* Run button */}
      <div className="flex items-center gap-4">
        <button
          onClick={runSuite}
          disabled={loading}
          className="px-5 py-2.5 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40 text-sm font-semibold transition-colors"
        >
          {loading ? "Running Regression Suite…" : "▶ Run Regression Shield"}
        </button>
        {report && (
          <div className="flex items-center gap-3">
            <Badge label={`Shield: ${report.shield}`} color={HEALTH_COLOR[report.shield]} />
            <Badge label={`${report.passed}/${report.total} passed`} color={report.failed === 0 ? "green" : "red"} />
            <span className="text-xs text-zinc-500 font-mono">{report.durationMs}ms</span>
          </div>
        )}
      </div>

      {/* Dashboard */}
      {report && (
        <>
          {/* Health grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="OVERALL SCORE" value={`${Math.round(report.score * 100)}%`}
              color={report.score === 1 ? "green" : report.score > 0.8 ? "yellow" : "red"} />
            <StatCard label="ACCEPTANCE SCORE" value={`${report.acceptanceScore}/5`}
              color={report.acceptanceScore === 5 ? "green" : "red"} sub="KG routing queries" />
            <StatCard label="PASSED" value={report.passed} color="green" />
            <StatCard label="FAILED" value={report.failed} color={report.failed === 0 ? "gray" : "red"} />
            {report.skipped > 0 && <StatCard label="SKIPPED" value={report.skipped} color="gray" sub="KG not built yet" />}
          </div>

          {/* Health status row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "KG Health",           val: report.kgHealth },
              { label: "Pipeline Health",     val: report.pipelineHealth },
              { label: "Connector Health",    val: report.connectorHealth },
              { label: "Workflow Health",     val: report.workflowHealth },
              { label: "Architecture Health", val: report.architectureHealth },
            ].map(({ label, val }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs font-mono text-zinc-500 mb-1">{label}</div>
                <Badge label={val} color={HEALTH_COLOR[val] ?? "gray"} />
              </div>
            ))}
          </div>

          {/* Category breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CATEGORIES.map(cat => {
              const s = report.categories[cat];
              const tot = s.passed + s.failed;
              return (
                <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge label={cat} color={CAT_COLOR[cat] ?? "gray"} />
                  </div>
                  <div className="text-xs text-zinc-400">
                    <span className="text-green-400 font-mono">{s.passed}</span>
                    <span className="text-zinc-600"> / </span>
                    <span className="font-mono">{tot}</span>
                    {s.failed > 0 && <span className="text-red-400 ml-1">({s.failed} failed)</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* RCA & Repair Plan */}
          {report.rcaSummary.length > 0 && (
            <div className="border border-red-800/40 rounded-lg p-4 bg-red-950/10 space-y-3">
              <h3 className="text-sm font-semibold text-red-400">Root Cause Analysis</h3>
              {report.rcaSummary.map((r, i) => <p key={i} className="text-xs text-red-300 font-mono">{r}</p>)}
              <h3 className="text-sm font-semibold text-yellow-400 mt-2">Repair Plan</h3>
              {[...new Set(report.repairPlan)].map((r, i) => <p key={i} className="text-xs text-yellow-300">• {r}</p>)}
            </div>
          )}

          {/* Test results */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {["ALL", "FAIL", ...CATEGORIES].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-mono transition-colors ${filter === f ? "bg-violet-700 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>
                  {f} {f === "ALL" ? `(${results.length})` : f === "FAIL" ? `(${results.filter(r => !r.passed).length})` : `(${results.filter(r => r.category === f).length})`}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {visible.map(r => <ResultRow key={r.testId} r={r} />)}
              {visible.length === 0 && <p className="text-zinc-500 text-sm">No tests match filter.</p>}
            </div>
          </div>

          {/* History */}
          {suite.history().length > 1 && (
            <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Regression History</h3>
              {suite.history().map((h, i) => (
                <div key={h.id} className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
                  <span className="text-zinc-600">#{i + 1}</span>
                  <Badge label={h.shield} color={HEALTH_COLOR[h.shield]} />
                  <span>{h.passed}/{h.total}</span>
                  <span>Acc={h.acceptanceScore}/5</span>
                  <span className="text-zinc-600">{new Date(h.runAt).toISOString().slice(11, 19)}</span>
                  <span>{h.durationMs}ms</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!report && !loading && (
        <div className="text-center py-16 text-zinc-600 space-y-2">
          <p className="text-4xl">🛡</p>
          <p className="text-sm">Regression Shield is idle. Run the suite to validate the system.</p>
          <p className="text-xs">Tests: KG integrity · Pipeline flow · Routing (5/5) · Connectors · Graph consistency · Workflow stages · Baseline protection</p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-600 font-mono">
          Regression Shield is mandatory before any COMPLETE status · Sprint 6.1.1 · MemoryOS Engineering Operating System
        </p>
      </div>
    </div>
  );
}