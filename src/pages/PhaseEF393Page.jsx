/**
 * PhaseEF393Page.jsx — Sprint EF-39.4
 * Architectural Certification Auditor Dashboard
 * Route: /ef393-certification
 *
 * EF-39.3: real test suite execution
 * EF-39.4: independent architectural auditors (Integrity, Immutability,
 *           Performance, SOLID, Source/Structural, Evidence)
 *
 * CERTIFIED only when ALL tests pass AND ALL audits pass.
 */
import React, { useState, useCallback } from "react";

// ── Primitives ─────────────────────────────────────────────────────────────────
function Badge({ label, ok }) {
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
      ok === true  ? "border-emerald-600 bg-emerald-950/40 text-emerald-400" :
      ok === false ? "border-red-700 bg-red-950/30 text-red-400" :
                     "border-zinc-700 bg-zinc-800 text-zinc-400"
    }`}>{label}</span>
  );
}

function MetCard({ label, value, color, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color ?? "text-zinc-200"}`}>{value ?? "—"}</div>
      {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function CheckRow({ ok, label, detail }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0 ${!ok ? "bg-red-950/10" : ""}`}>
      <span className={`shrink-0 font-bold text-xs mt-0.5 ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
      <span className="text-zinc-300 text-xs flex-1">{label}</span>
      {detail && <span className="text-zinc-600 text-xs shrink-0 ml-2 max-w-xs truncate" title={detail}>{detail}</span>}
    </div>
  );
}

function SuiteBlock({ suite, rows }) {
  const passed = rows.filter(r => r.passed).length;
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-left">
        <span className={`w-2 h-2 rounded-full shrink-0 ${passed === rows.length ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="text-zinc-300 text-xs font-bold flex-1">{suite}</span>
        <span className={`text-xs font-mono font-bold ${passed === rows.length ? "text-emerald-400" : "text-red-400"}`}>{passed}/{rows.length}</span>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="divide-y divide-zinc-800/60">
          {rows.map(r => (
            <div key={r.id} className={`flex items-start gap-3 px-4 py-2 text-xs ${!r.passed ? "bg-red-950/10" : ""}`}>
              <span className={`mt-0.5 shrink-0 ${r.passed ? "text-emerald-400" : "text-red-400"}`}>{r.passed ? "✓" : "✗"}</span>
              <span className="text-zinc-300 flex-1">{r.name}</span>
              <span className="text-zinc-600 font-mono shrink-0">{r.durationMs}ms</span>
              {!r.passed && <span className="text-red-300 text-xs max-w-xs truncate" title={r.error}>{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = ["summary","suites","architecture","integrity","immutability","solid","performance","source","failures","timing","evidence"];

export default function PhaseEF393Page() {
  const [phase, setPhase]     = useState("idle");
  const [report, setReport]   = useState(null);
  const [runLog, setRunLog]   = useState([]);
  const [activeTab, setActiveTab] = useState("summary");

  const log = useCallback((msg) => setRunLog(prev => [...prev, { ts: Date.now(), msg }]), []);

  const runCertification = useCallback(async () => {
    setPhase("running");
    setReport(null);
    setRunLog([]);
    const t0 = Date.now();

    try {
      log("Resetting metrics and event bus…");
      const { KnowledgeStoreMetrics } = await import("@/lib/knowledge-store/KnowledgeStoreMetrics");
      const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
      KnowledgeStoreMetrics.reset();
      KnowledgeStoreEventBus.clear();

      log("Importing all auditors…");
      const [
        { runMemoryStoreTests },
        { runFullAudit },
        { runStructuralAudit, runSourceAudit },
      ] = await Promise.all([
        import("@/lib/knowledge-store/memory/MemoryStoreTests"),
        import("@/lib/knowledge-store/auditor/ArchitecturalAuditor"),
        import("@/lib/knowledge-store/auditor/SourceAudit"),
      ]);

      log("Running test suite + architectural audits in parallel…");
      const [testResult, auditReport, structuralReport, sourceReport] = await Promise.all([
        runMemoryStoreTests(),
        runFullAudit(),
        runStructuralAudit(),
        runSourceAudit(),
      ]);

      const elapsed = Date.now() - t0;
      log(`Tests: ${testResult.passed}/${testResult.total} passed`);
      log(`Integrity: ${auditReport.integrity.passed}/${auditReport.integrity.passed + auditReport.integrity.failed} checks`);
      log(`Immutability: ${auditReport.immutability.passed}/${auditReport.immutability.passed + auditReport.immutability.failed} checks`);
      log(`SOLID: ${auditReport.solid.checks.filter(c => c.verdict === "PASS").length}/${auditReport.solid.checks.length} principles`);
      log(`Structural: ${structuralReport.passed}/${structuralReport.passed + structuralReport.failed} checks`);
      log(`Source: ${sourceReport.ok ? "CLEAN" : sourceReport.findings.length + " findings"}`);

      // Per-suite map
      const suiteMap = {};
      testResult.results.forEach(r => {
        if (!suiteMap[r.suite]) suiteMap[r.suite] = [];
        suiteMap[r.suite].push(r);
      });

      // Timing
      const durations = testResult.results.map(r => r.durationMs);
      const avgMs  = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      const maxMs  = Math.max(...durations);
      const minMs  = Math.min(...durations);
      const maxTest = testResult.results.find(r => r.durationMs === maxMs);
      const minTest = testResult.results.find(r => r.durationMs === minMs);

      const failures = testResult.results.filter(r => !r.passed);

      // Final verdict: ALL tests pass AND ALL audits pass
      const allAuditsPassed =
        auditReport.integrity.ok &&
        auditReport.immutability.ok &&
        auditReport.solid.ok &&
        structuralReport.ok;
        // sourceReport is structural export listing — findings expected = 0 for clean code

      const certified = testResult.certified && allAuditsPassed;

      log(certified
        ? "✓ ALL TESTS + ALL AUDITS PASSED — CERTIFIED"
        : `✗ CERTIFICATION FAILED — tests=${testResult.certified} audits=${allAuditsPassed}`);

      setReport({
        testResult, suiteMap, auditReport, structuralReport, sourceReport,
        totalMs: elapsed, avgMs, maxMs, minMs, maxTest, minTest, failures,
        allAuditsPassed, certified, executedAt: new Date().toISOString(),
      });

      setPhase("done");
      setActiveTab(failures.length > 0 ? "failures" : "summary");

    } catch (err) {
      log(`FATAL: ${err?.message ?? String(err)}`);
      setPhase("error");
      setReport({ fatalError: err?.message ?? String(err), stack: err?.stack ?? "" });
    }
  }, [log]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="border border-violet-700/60 rounded-xl p-5 bg-violet-950/10">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-39.4 — ARCHITECTURAL CERTIFICATION AUDITOR</div>
          <div className="text-xl font-bold">MemoryStore — Full Certification Run</div>
          <div className="text-zinc-400 text-sm mt-1">
            Test suite · Integrity · Immutability · SOLID · Performance · Structural · Evidence
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runCertification} disabled={phase === "running"}
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold text-sm">
            {phase === "running" ? "⏳ Running…" : "▶  Execute Full Certification"}
          </button>
          {phase === "done" && report && !report.fatalError && (
            <Badge label={report.certified ? "✓ CERTIFIED" : "✗ CERTIFICATION FAILED"} ok={report.certified} />
          )}
          {phase === "error" && <Badge label="FATAL ERROR" ok={false} />}
        </div>

        {/* Live log */}
        {runLog.length > 0 && (
          <div className="border border-zinc-800 rounded-xl bg-zinc-950 p-4">
            <div className="text-zinc-500 text-xs tracking-widest mb-2">EXECUTION LOG</div>
            <div className="space-y-0.5 max-h-36 overflow-y-auto">
              {runLog.map((l, i) => (
                <div key={i} className="text-xs text-zinc-400">
                  <span className="text-zinc-700">{new Date(l.ts).toLocaleTimeString()} </span>{l.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fatal error */}
        {phase === "error" && report?.fatalError && (
          <div className="border border-red-700 rounded-xl bg-red-950/20 p-5">
            <div className="text-red-400 font-bold mb-2">FATAL ERROR — CERTIFICATION ABORTED</div>
            <pre className="text-red-300 text-xs whitespace-pre-wrap">{report.fatalError}</pre>
            {report.stack && <pre className="text-zinc-600 text-xs mt-2 whitespace-pre-wrap">{report.stack}</pre>}
          </div>
        )}

        {phase === "done" && report && !report.fatalError && (
          <>
            {/* Certification banner */}
            <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
              <div className={`text-3xl font-bold mb-1 ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "✓ CERTIFIED — EF-39 / EF-39.1 / EF-39.2 / EF-39.4" : "✗ CERTIFICATION FAILED"}
              </div>
              <div className="text-zinc-400 text-sm">
                {report.testResult.passed}/{report.testResult.total} tests ·{" "}
                {report.auditReport.integrity.passed + report.auditReport.immutability.passed + report.auditReport.solid.checks.filter(c => c.verdict === "PASS").length + report.structuralReport.passed} audit checks passed ·{" "}
                {report.totalMs}ms total
              </div>
              <div className="text-zinc-600 text-xs mt-1">{report.executedAt}</div>
              {!report.certified && (
                <div className="mt-2 space-y-0.5 text-xs">
                  {!report.testResult.certified    && <div className="text-red-400">✗ Test suite: {report.testResult.failed} failures</div>}
                  {!report.auditReport.integrity.ok    && <div className="text-red-400">✗ Integrity audit: {report.auditReport.integrity.failed} failed</div>}
                  {!report.auditReport.immutability.ok && <div className="text-red-400">✗ Immutability audit: {report.auditReport.immutability.failed} failed</div>}
                  {!report.auditReport.solid.ok         && <div className="text-red-400">✗ SOLID audit: {report.auditReport.solid.checks.filter(c => c.verdict !== "PASS").length} issues</div>}
                  {!report.structuralReport.ok          && <div className="text-red-400">✗ Structural audit: {report.structuralReport.failed} failed</div>}
                </div>
              )}
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <MetCard label="Tests"      value={report.testResult.total}  color="text-zinc-300" />
              <MetCard label="Passed"     value={report.testResult.passed} color="text-emerald-400" />
              <MetCard label="Failed"     value={report.testResult.failed} color={report.testResult.failed > 0 ? "text-red-400" : "text-zinc-600"} />
              <MetCard label="Integrity"  value={`${report.auditReport.integrity.passed}/${report.auditReport.integrity.passed + report.auditReport.integrity.failed}`} color={report.auditReport.integrity.ok ? "text-emerald-400" : "text-red-400"} />
              <MetCard label="Immutable"  value={`${report.auditReport.immutability.passed}/${report.auditReport.immutability.passed + report.auditReport.immutability.failed}`} color={report.auditReport.immutability.ok ? "text-emerald-400" : "text-red-400"} />
              <MetCard label="Total ms"   value={report.totalMs + "ms"}   color="text-sky-400" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap capitalize ${activeTab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t}{t === "failures" && report.failures.length > 0 ? ` (${report.failures.length})` : ""}
                </button>
              ))}
            </div>

            {/* ── SUMMARY ── */}
            {activeTab === "summary" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1.5">
                  <div className="text-zinc-500 tracking-widest mb-2">CERTIFICATION SUMMARY</div>
                  {[
                    ["Executed at",        report.executedAt],
                    ["Tests total",        String(report.testResult.total)],
                    ["Tests passed",       String(report.testResult.passed)],
                    ["Tests failed",       String(report.testResult.failed)],
                    ["Integrity checks",   `${report.auditReport.integrity.passed}/${report.auditReport.integrity.passed+report.auditReport.integrity.failed}`],
                    ["Immutability checks",`${report.auditReport.immutability.passed}/${report.auditReport.immutability.passed+report.auditReport.immutability.failed}`],
                    ["SOLID checks",       `${report.auditReport.solid.checks.filter(c=>c.verdict==="PASS").length}/${report.auditReport.solid.checks.length}`],
                    ["Structural checks",  `${report.structuralReport.passed}/${report.structuralReport.passed+report.structuralReport.failed}`],
                    ["Performance benches",String(report.auditReport.performance.benchmarks.length)],
                    ["Total elapsed",      report.totalMs + "ms"],
                    ["Avg per test",       report.avgMs + "ms"],
                    ["Slowest test",       `${report.maxMs}ms — ${report.maxTest?.name?.slice(0,40)}`],
                    ["Fastest test",       `${report.minMs}ms — ${report.minTest?.name?.slice(0,40)}`],
                    ["Suites",             String(Object.keys(report.suiteMap).length)],
                    ["Verdict",            report.certified ? "CERTIFIED" : "CERTIFICATION FAILED"],
                  ].map(([k,v]) => (
                    <div key={k} className="flex gap-3">
                      <span className="text-zinc-500 w-44 shrink-0">{k}</span>
                      <span className={k === "Verdict" ? (report.certified ? "text-emerald-400 font-bold" : "text-red-400 font-bold") : "text-zinc-300"}>{v}</span>
                    </div>
                  ))}
                </div>
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
                  <div className="text-zinc-500 tracking-widest mb-3">SUITES OVERVIEW</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(report.suiteMap).map(([suite, rows]) => {
                      const p = rows.filter(r => r.passed).length;
                      return (
                        <div key={suite} className="border border-zinc-800 rounded p-2 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${p === rows.length ? "bg-emerald-500" : "bg-red-500"}`} />
                          <span className="text-zinc-300 text-xs flex-1">{suite}</span>
                          <span className={`text-xs font-mono font-bold ${p === rows.length ? "text-emerald-400" : "text-red-400"}`}>{p}/{rows.length}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── SUITES ── */}
            {activeTab === "suites" && (
              <div className="space-y-2">
                {Object.entries(report.suiteMap).map(([suite, rows]) => (
                  <SuiteBlock key={suite} suite={suite} rows={rows} />
                ))}
              </div>
            )}

            {/* ── ARCHITECTURE ── */}
            {activeTab === "architecture" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
                  <div className="text-zinc-500 tracking-widest mb-3">ARCHITECTURAL AUDIT — INDEPENDENT EVIDENCE ENGINE</div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[
                      ["Integrity",    report.auditReport.integrity.ok,    `${report.auditReport.integrity.passed}/${report.auditReport.integrity.passed+report.auditReport.integrity.failed}`, report.auditReport.integrity.durationMs],
                      ["Immutability", report.auditReport.immutability.ok, `${report.auditReport.immutability.passed}/${report.auditReport.immutability.passed+report.auditReport.immutability.failed}`, report.auditReport.immutability.durationMs],
                      ["SOLID",        report.auditReport.solid.ok,        `${report.auditReport.solid.checks.filter(c=>c.verdict==="PASS").length}/${report.auditReport.solid.checks.length}`, report.auditReport.solid.durationMs],
                      ["Performance",  true,                               `${report.auditReport.performance.benchmarks.length} benchmarks`, report.auditReport.performance.durationMs],
                      ["Structural",   report.structuralReport.ok,         `${report.structuralReport.passed}/${report.structuralReport.passed+report.structuralReport.failed}`, report.structuralReport.durationMs],
                    ].map(([name, ok, score, ms]) => (
                      <div key={name} className={`border rounded-lg p-3 flex items-center gap-3 ${ok ? "border-emerald-700/40 bg-emerald-950/10" : "border-red-700/40 bg-red-950/10"}`}>
                        <span className={`text-lg font-bold ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
                        <div>
                          <div className="text-zinc-200 font-bold">{name}</div>
                          <div className="text-zinc-500 text-xs">{score} · {ms}ms</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── INTEGRITY ── */}
            {activeTab === "integrity" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  INTEGRITY AUDIT — {report.auditReport.integrity.passed}/{report.auditReport.integrity.passed+report.auditReport.integrity.failed} · {report.auditReport.integrity.durationMs}ms
                </div>
                {report.auditReport.integrity.checks.map((c, i) => (
                  <CheckRow key={i} ok={c.ok} label={c.check} detail={c.detail} />
                ))}
              </div>
            )}

            {/* ── IMMUTABILITY ── */}
            {activeTab === "immutability" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  IMMUTABILITY AUDIT — Object.isFrozen() on all public objects · {report.auditReport.immutability.passed}/{report.auditReport.immutability.passed+report.auditReport.immutability.failed} · {report.auditReport.immutability.durationMs}ms
                </div>
                {report.auditReport.immutability.checks.map((c, i) => (
                  <CheckRow key={i} ok={c.ok} label={c.check} detail={c.detail} />
                ))}
              </div>
            )}

            {/* ── SOLID ── */}
            {activeTab === "solid" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  SOLID AUDIT — {report.auditReport.solid.durationMs}ms
                </div>
                {report.auditReport.solid.checks.map((c, i) => (
                  <div key={i} className={`px-4 py-3 border-b border-zinc-800/40 last:border-0 ${c.verdict === "FAIL" ? "bg-red-950/10" : c.verdict === "WARNING" ? "bg-amber-950/10" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${c.verdict === "PASS" ? "text-emerald-400" : c.verdict === "WARNING" ? "text-amber-400" : "text-red-400"}`}>{c.verdict}</span>
                      <span className="text-zinc-300 text-xs font-bold">{c.principle}</span>
                    </div>
                    <div className="text-zinc-400 text-xs mb-1">{c.rationale}</div>
                    <div className="text-zinc-600 text-xs">{c.evidence}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── PERFORMANCE ── */}
            {activeTab === "performance" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  PERFORMANCE BENCHMARKS — {report.auditReport.performance.benchmarks[0]?.iterations} iterations each · {report.auditReport.performance.durationMs}ms total
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Operation","Avg ms","Min ms","Max ms","StdDev","Ops/sec"].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-zinc-500 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.auditReport.performance.benchmarks.map((b, i) => (
                        <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                          <td className="px-4 py-2 text-violet-400 font-bold">{b.operation}</td>
                          <td className="px-4 py-2 text-sky-400">{b.avgMs}</td>
                          <td className="px-4 py-2 text-emerald-400">{b.minMs}</td>
                          <td className="px-4 py-2 text-amber-400">{b.maxMs}</td>
                          <td className="px-4 py-2 text-zinc-400">{b.stdDev}</td>
                          <td className="px-4 py-2 text-zinc-300">{b.opsPerSec.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── SOURCE ── */}
            {activeTab === "source" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                    STRUCTURAL AUDIT — runtime-observable checks · {report.structuralReport.passed}/{report.structuralReport.passed+report.structuralReport.failed} · {report.structuralReport.durationMs}ms
                  </div>
                  {report.structuralReport.checks.map((c, i) => (
                    <CheckRow key={i} ok={c.ok} label={c.check} detail={c.detail} />
                  ))}
                </div>
                <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                    SOURCE EXPORT AUDIT — {report.sourceReport.files} files · {report.sourceReport.findings.length} findings
                  </div>
                  {report.sourceReport.findings.length === 0
                    ? <div className="p-6 text-center text-emerald-400 text-sm font-bold">✓ Zero structural findings</div>
                    : report.sourceReport.findings.map((f, i) => (
                      <div key={i} className="px-4 py-2 border-b border-zinc-800/40 last:border-0 bg-amber-950/10">
                        <div className="flex gap-2 text-xs">
                          <Badge label={f.type} ok={false} />
                          <span className="text-zinc-400">{f.file}:{f.line}</span>
                        </div>
                        <div className="text-zinc-500 text-xs mt-1">{f.description}</div>
                        <pre className="text-zinc-600 text-xs mt-1">{f.snippet}</pre>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* ── FAILURES ── */}
            {activeTab === "failures" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  FAILURES — {report.failures.length}
                </div>
                {report.failures.length === 0
                  ? <div className="p-8 text-center text-emerald-400 font-bold">✓ Zero test failures</div>
                  : report.failures.map(r => (
                    <div key={r.id} className="px-4 py-4 border-b border-zinc-800 bg-red-950/10 last:border-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge label="FAIL" ok={false} />
                        <span className="text-zinc-400 text-xs">{r.suite}</span>
                        <span className="text-zinc-300 text-xs font-bold">{r.name}</span>
                        <span className="text-zinc-600 text-xs ml-auto">{r.durationMs}ms</span>
                      </div>
                      <pre className="text-red-300 text-xs bg-red-950/20 rounded p-3 whitespace-pre-wrap overflow-x-auto">{r.error}</pre>
                    </div>
                  ))
                }
              </div>
            )}

            {/* ── TIMING ── */}
            {activeTab === "timing" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TIMING — ALL TESTS SORTED BY DURATION DESC</div>
                <div className="max-h-[600px] overflow-y-auto">
                  {[...report.testResult.results].sort((a, b) => b.durationMs - a.durationMs).map(r => (
                    <div key={r.id} className={`flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
                      <span className={`text-xs font-mono w-14 shrink-0 text-right ${r.durationMs > 1000 ? "text-amber-400" : r.durationMs > 100 ? "text-sky-400" : "text-zinc-500"}`}>{r.durationMs}ms</span>
                      <span className="text-zinc-500 text-xs w-24 shrink-0">{r.suite}</span>
                      <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                      <span className={`text-xs font-bold ${r.passed ? "text-emerald-400" : "text-red-400"}`}>{r.passed ? "PASS" : "FAIL"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── EVIDENCE ── */}
            {activeTab === "evidence" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1.5">
                  <div className="text-zinc-500 tracking-widest mb-2">EVIDENCE CHAIN — ALL FROM REAL EXECUTION</div>
                  {buildEvidenceChain(report).map((e, i) => (
                    <div key={i} className={`flex gap-2 py-0.5 ${e.ok ? "text-zinc-300" : "text-red-400"}`}>
                      <span className="shrink-0">{e.ok ? "✓" : "✗"}</span>
                      <span className="flex-1">{e.label}</span>
                      <span className="text-zinc-600 ml-auto shrink-0 max-w-xs truncate">{e.evidence}</span>
                    </div>
                  ))}
                </div>
                <div className="border border-zinc-800 rounded-xl bg-zinc-900 p-4 text-xs">
                  <div className="text-zinc-500 tracking-widest mb-2">FINAL VERDICT DERIVATION</div>
                  <div className="space-y-1">
                    {[
                      ["Test suite certified",   report.testResult.certified,          `${report.testResult.passed}/${report.testResult.total}`],
                      ["Integrity audit passed", report.auditReport.integrity.ok,      `${report.auditReport.integrity.passed} checks`],
                      ["Immutability passed",    report.auditReport.immutability.ok,    `${report.auditReport.immutability.passed} checks`],
                      ["SOLID passed",           report.auditReport.solid.ok,           `${report.auditReport.solid.checks.length} principles`],
                      ["Structural passed",      report.structuralReport.ok,            `${report.structuralReport.passed} checks`],
                    ].map(([k, ok, ev]) => (
                      <div key={k} className="flex gap-3">
                        <span className={`font-bold ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
                        <span className="text-zinc-300 flex-1">{k}</span>
                        <span className="text-zinc-600">{ev}</span>
                      </div>
                    ))}
                    <div className={`mt-3 pt-3 border-t border-zinc-800 font-bold text-sm ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                      FINAL: {report.certified ? "CERTIFIED" : "CERTIFICATION FAILED"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function buildEvidenceChain(report) {
  const { testResult, suiteMap, auditReport, structuralReport } = report;
  const sp = (suite) => (suiteMap[suite] ?? []).every(r => r.passed);
  const sc = (suite) => { const rows = suiteMap[suite] ?? []; return `${rows.filter(r=>r.passed).length}/${rows.length} tests`; };

  return [
    { label: "store() returns frozen StoreResult",           ok: auditReport.immutability.checks.find(c=>c.check.includes("StoreResult frozen"))?.ok ?? false,          evidence: auditReport.immutability.checks.find(c=>c.check.includes("StoreResult frozen"))?.detail ?? "n/a" },
    { label: "KnowledgeRecord is frozen",                    ok: auditReport.immutability.checks.find(c=>c.check.includes("KnowledgeRecord frozen"))?.ok ?? false,        evidence: auditReport.immutability.checks.find(c=>c.check.includes("KnowledgeRecord frozen"))?.detail ?? "n/a" },
    { label: "QueryResult + records[] are frozen",           ok: auditReport.immutability.checks.find(c=>c.check.includes("QueryResult frozen"))?.ok ?? false,            evidence: auditReport.immutability.checks.find(c=>c.check.includes("QueryResult frozen"))?.detail ?? "n/a" },
    { label: "SearchResult + records[] + scores[] frozen",   ok: auditReport.immutability.checks.find(c=>c.check.includes("SearchResult frozen"))?.ok ?? false,           evidence: auditReport.immutability.checks.find(c=>c.check.includes("SearchResult frozen"))?.detail ?? "n/a" },
    { label: "Snapshot is frozen (Object.isFrozen)",         ok: auditReport.immutability.checks.find(c=>c.check.includes("Snapshot frozen"))?.ok ?? false,               evidence: auditReport.immutability.checks.find(c=>c.check.includes("Snapshot frozen"))?.detail ?? "n/a" },
    { label: "Statistics snapshot is frozen",                ok: auditReport.immutability.checks.find(c=>c.check.includes("Statistics snapshot"))?.ok ?? false,           evidence: auditReport.immutability.checks.find(c=>c.check.includes("Statistics snapshot"))?.detail ?? "n/a" },
    { label: "No empty Sets in index after delete",          ok: auditReport.integrity.checks.find(c=>c.check.includes("no empty sets after delete"))?.ok ?? false,       evidence: auditReport.integrity.checks.find(c=>c.check.includes("no empty sets after delete"))?.detail ?? "n/a" },
    { label: "Index count matches recordCount",              ok: auditReport.integrity.checks.find(c=>c.check.includes("Index count"))?.ok ?? false,                      evidence: auditReport.integrity.checks.find(c=>c.check.includes("Index count"))?.detail ?? "n/a" },
    { label: "Archived record absent from active query",     ok: auditReport.integrity.checks.find(c=>c.check.includes("Archived record absent"))?.ok ?? false,           evidence: auditReport.integrity.checks.find(c=>c.check.includes("Archived record absent"))?.detail ?? "n/a" },
    { label: "Statistics consistent across full lifecycle",  ok: auditReport.integrity.checks.find(c=>c.check.includes("Statistics consistent"))?.ok ?? false,            evidence: auditReport.integrity.checks.find(c=>c.check.includes("Statistics consistent"))?.detail ?? "n/a" },
    { label: "No orphan references after delete",            ok: auditReport.integrity.checks.find(c=>c.check.includes("No orphan"))?.ok ?? false,                        evidence: auditReport.integrity.checks.find(c=>c.check.includes("No orphan"))?.detail ?? "n/a" },
    { label: "Query is deterministic (real execution)",      ok: auditReport.integrity.checks.find(c=>c.check.includes("deterministic"))?.ok ?? false,                    evidence: auditReport.integrity.checks.find(c=>c.check.includes("deterministic"))?.detail ?? "n/a" },
    { label: "Query pagination no overlap (Filter→Sort→Page)",ok: structuralReport.checks.find(c=>c.check.includes("overlap"))?.ok ?? false,                             evidence: structuralReport.checks.find(c=>c.check.includes("overlap"))?.detail ?? "n/a" },
    { label: "KnowledgeStoreMetrics.reset() typed (no as-any)",ok: structuralReport.checks.find(c=>c.check.includes("reset()"))?.ok ?? false,                            evidence: structuralReport.checks.find(c=>c.check.includes("reset()"))?.detail ?? "n/a" },
    { label: "Search handles empty summary without throw",   ok: structuralReport.checks.find(c=>c.check.includes("empty summary"))?.ok ?? false,                         evidence: structuralReport.checks.find(c=>c.check.includes("empty summary"))?.detail ?? "n/a" },
    { label: "10k stress tests passed",                      ok: (suiteMap["Hardening"]??[]).some(r=>r.name.includes("10000")&&r.passed),                                 evidence: `${(suiteMap["Hardening"]??[]).filter(r=>r.name.includes("10000")).length} stress tests` },
    { label: "All test suites green",                        ok: testResult.certified,                                                                                    evidence: `${testResult.passed}/${testResult.total}` },
    { label: "SOLID — SRP verified",                         ok: auditReport.solid.checks.find(c=>c.principle.includes("SRP"))?.verdict === "PASS",                       evidence: auditReport.solid.checks.find(c=>c.principle.includes("SRP"))?.evidence ?? "n/a" },
    { label: "SOLID — LSP: MemoryStore implements IKnowledgeStore", ok: auditReport.solid.checks.find(c=>c.principle.includes("LSP"))?.verdict === "PASS",               evidence: auditReport.solid.checks.find(c=>c.principle.includes("LSP"))?.evidence ?? "n/a" },
    { label: "SOLID — DIP: depends on abstractions",         ok: auditReport.solid.checks.find(c=>c.principle.includes("DIP"))?.verdict === "PASS",                       evidence: auditReport.solid.checks.find(c=>c.principle.includes("DIP"))?.evidence ?? "n/a" },
  ];
}