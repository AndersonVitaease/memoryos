/**
 * PhaseEF393Page.jsx — Sprint EF-39.5
 * Independent Architectural Certification Engine
 * Route: /ef393-certification
 *
 * CERTIFIED only when:
 *   ✓ All tests pass
 *   ✓ All audits pass
 *   ✓ Source is clean (0 critical/errors)
 *   ✓ No circular dependencies
 *   ✓ Architecture Score >= 95
 */
import React, { useState, useCallback } from "react";

// ── UI primitives ──────────────────────────────────────────────────────────────
function Badge({ label, ok }) {
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
      ok === true  ? "border-emerald-600 bg-emerald-950/40 text-emerald-400" :
      ok === false ? "border-red-700 bg-red-950/30 text-red-400" :
                     "border-zinc-700 bg-zinc-800 text-zinc-400"
    }`}>{label}</span>
  );
}

function SevBadge({ sev }) {
  const cls =
    sev === "critical" ? "border-red-700 bg-red-950/40 text-red-400" :
    sev === "error"    ? "border-orange-700 bg-orange-950/30 text-orange-400" :
    sev === "warning"  ? "border-amber-700 bg-amber-950/20 text-amber-400" :
                         "border-zinc-700 bg-zinc-800 text-zinc-400";
  return <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${cls}`}>{sev}</span>;
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
      {detail && <span className="text-zinc-600 text-xs shrink-0 ml-2 max-w-xs truncate font-mono" title={detail}>{detail}</span>}
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
              {!r.passed && <span className="text-red-300 text-xs max-w-xs truncate">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GradeTag({ grade }) {
  const cls =
    grade === "A+" ? "text-emerald-300 border-emerald-500" :
    grade === "A"  ? "text-emerald-400 border-emerald-600" :
    grade === "B"  ? "text-sky-400 border-sky-600" :
    grade === "C"  ? "text-amber-400 border-amber-600" :
    grade === "D"  ? "text-orange-400 border-orange-600" :
                     "text-red-400 border-red-600";
  return <span className={`text-4xl font-bold font-mono border-2 px-4 py-1 rounded-xl ${cls}`}>{grade}</span>;
}

const TABS = ["summary","tests","architecture","ast","source","solid","performance","integrity","immutability","deps","smells","evidence","failures","timing"];

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
    const t0 = performance.now();

    try {
      log("Resetting metrics and event bus…");
      const { KnowledgeStoreMetrics } = await import("@/lib/knowledge-store/KnowledgeStoreMetrics");
      const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
      KnowledgeStoreMetrics.reset();
      KnowledgeStoreEventBus.clear();

      log("Importing all engines…");
      const [
        { runMemoryStoreTests },
        { runFullAudit, computeArchitectureScore },
        sourceAuditMod,
        { runASTAudit },
      ] = await Promise.all([
        import("@/lib/knowledge-store/memory/MemoryStoreTests"),
        import("@/lib/knowledge-store/auditor/ArchitecturalAuditor"),
        import("@/lib/knowledge-store/auditor/SourceAudit"),
        import("@/lib/knowledge-store/auditor/ASTAuditor"),
      ]);
      const { runSourceAudit, runStructuralAudit } = sourceAuditMod;

      log("Running test suite + audits in parallel…");
      const [testResult, auditReport, structuralReport] = await Promise.all([
        runMemoryStoreTests(),
        runFullAudit(),
        runStructuralAudit(),
      ]);

      log("Running AST + source analysis…");
      const sourceReport = runSourceAudit();
      const astReport    = runASTAudit();

      const elapsed = Math.round(performance.now() - t0);

      log(`Tests: ${testResult.passed}/${testResult.total}`);
      log(`Source: ${sourceReport.critical} critical, ${sourceReport.errors} errors, ${sourceReport.warnings} warnings`);
      log(`AST: ${astReport.codeSmells.length} code smells, circular=${astReport.dependencies.hasCircular}`);
      log(`Integrity: ${auditReport.integrity.passed}/${auditReport.integrity.passed+auditReport.integrity.failed}`);
      log(`Immutability: ${auditReport.immutability.passed}/${auditReport.immutability.passed+auditReport.immutability.failed}`);
      log(`SOLID: ${auditReport.solid.checks.filter(c=>c.verdict==="PASS").length}/${auditReport.solid.checks.length}`);

      // Per-suite map
      const suiteMap = {};
      testResult.results.forEach(r => {
        if (!suiteMap[r.suite]) suiteMap[r.suite] = [];
        suiteMap[r.suite].push(r);
      });

      const durations = testResult.results.map(r => r.durationMs);
      const avgMs  = Math.round(durations.reduce((a,b)=>a+b,0)/durations.length);
      const maxMs  = Math.max(...durations);
      const minMs  = Math.min(...durations);
      const maxTest = testResult.results.find(r=>r.durationMs===maxMs);
      const minTest = testResult.results.find(r=>r.durationMs===minMs);
      const failures = testResult.results.filter(r=>!r.passed);

      // Architecture Score
      const avgBenchMs = auditReport.performance.benchmarks.reduce((a,b)=>a+b.avgMs,0) / auditReport.performance.benchmarks.length;
      const archScore = computeArchitectureScore({
        testsPassed:        testResult.passed,
        testsTotal:         testResult.total,
        solidPassed:        auditReport.solid.checks.filter(c=>c.verdict==="PASS").length,
        solidTotal:         auditReport.solid.checks.length,
        immutabilityPassed: auditReport.immutability.passed,
        immutabilityTotal:  auditReport.immutability.passed + auditReport.immutability.failed,
        integrityPassed:    auditReport.integrity.passed,
        integrityTotal:     auditReport.integrity.passed + auditReport.integrity.failed,
        codeSmellCount:     astReport.codeSmells.length,
        sourceFindings:     sourceReport.critical + sourceReport.errors,
        avgBenchmarkMs:     avgBenchMs,
        hasCircularDeps:    astReport.dependencies.hasCircular,
      });

      // CERTIFIED gate
      const certified =
        testResult.certified &&
        auditReport.integrity.ok &&
        auditReport.immutability.ok &&
        auditReport.solid.ok &&
        structuralReport.ok &&
        !astReport.dependencies.hasCircular &&
        sourceReport.critical === 0 &&
        sourceReport.errors === 0 &&
        archScore.score >= 95;

      log(certified ? `✓ CERTIFIED — Score ${archScore.score}/100 (${archScore.grade})` : `✗ FAILED — Score ${archScore.score}/100, gates: ${archScore.failedGates.join("; ")}`);

      setReport({
        testResult, suiteMap, auditReport, structuralReport, sourceReport, astReport,
        archScore, totalMs: elapsed, avgMs, maxMs, minMs, maxTest, minTest,
        failures, certified, executedAt: new Date().toISOString(),
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
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-39.5 — INDEPENDENT ARCHITECTURAL CERTIFICATION ENGINE</div>
          <div className="text-xl font-bold">MemoryStore — Full Certification Run</div>
          <div className="text-zinc-400 text-sm mt-1">
            Real source analysis (Vite ?raw) · Token-level AST · performance.now() · p95/p99 · Architecture Score · Zero mocks
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runCertification} disabled={phase === "running"}
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold text-sm">
            {phase === "running" ? "⏳ Running…" : "▶  Execute Full Certification"}
          </button>
          {phase === "done" && report && !report.fatalError && (
            <Badge label={report.certified ? `✓ CERTIFIED (${report.archScore?.score}/100)` : `✗ FAILED (${report.archScore?.score}/100)`} ok={report.certified} />
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
            <div className="text-red-400 font-bold mb-2">FATAL ERROR</div>
            <pre className="text-red-300 text-xs whitespace-pre-wrap">{report.fatalError}</pre>
            {report.stack && <pre className="text-zinc-600 text-xs mt-2 whitespace-pre-wrap">{report.stack}</pre>}
          </div>
        )}

        {phase === "done" && report && !report.fatalError && (
          <>
            {/* Certification banner + score */}
            <div className={`border-2 rounded-xl p-6 ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className={`text-2xl font-bold mb-1 ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                    {report.certified ? "✓ CERTIFIED — EF-39 / EF-39.1 / EF-39.2 / EF-39.4 / EF-39.5" : "✗ CERTIFICATION FAILED"}
                  </div>
                  <div className="text-zinc-400 text-sm">{report.executedAt} · {report.totalMs}ms</div>
                  {!report.certified && report.archScore?.failedGates.map((g, i) => (
                    <div key={i} className="text-red-400 text-xs mt-0.5">✗ {g}</div>
                  ))}
                </div>
                <div className="text-center">
                  <GradeTag grade={report.archScore?.grade} />
                  <div className="text-zinc-500 text-xs mt-1">Architecture Score: {report.archScore?.score}/100</div>
                </div>
              </div>
            </div>

            {/* Score breakdown */}
            {report.archScore && (
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {Object.entries(report.archScore.breakdown).map(([k, v]) => (
                  <MetCard key={k} label={k} value={v + "%"} color={v === 100 ? "text-emerald-400" : v >= 80 ? "text-sky-400" : v >= 60 ? "text-amber-400" : "text-red-400"} />
                ))}
              </div>
            )}

            {/* Top metrics */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <MetCard label="Tests"      value={`${report.testResult.passed}/${report.testResult.total}`} color={report.testResult.certified?"text-emerald-400":"text-red-400"} />
              <MetCard label="Integrity"  value={`${report.auditReport.integrity.passed}/${report.auditReport.integrity.passed+report.auditReport.integrity.failed}`} color={report.auditReport.integrity.ok?"text-emerald-400":"text-red-400"} />
              <MetCard label="Immutable"  value={`${report.auditReport.immutability.passed}/${report.auditReport.immutability.passed+report.auditReport.immutability.failed}`} color={report.auditReport.immutability.ok?"text-emerald-400":"text-red-400"} />
              <MetCard label="Source"     value={`${report.sourceReport.critical}c ${report.sourceReport.errors}e ${report.sourceReport.warnings}w`} color={report.sourceReport.ok?"text-emerald-400":"text-red-400"} sub={`${report.sourceReport.totalLines} lines`} />
              <MetCard label="Smells"     value={report.astReport.codeSmells.length} color={report.astReport.codeSmells.length===0?"text-emerald-400":"text-amber-400"} />
              <MetCard label="Circular"   value={report.astReport.dependencies.hasCircular?"YES":"NONE"} color={report.astReport.dependencies.hasCircular?"text-red-400":"text-emerald-400"} />
            </div>

            {/* Tab bar */}
            <div className="flex gap-0.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap capitalize min-w-[60px] ${activeTab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t}{t==="failures"&&report.failures.length>0?` (${report.failures.length})`:""}
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
                    ["Architecture Score", `${report.archScore?.score}/100 (${report.archScore?.grade})`],
                    ["Tests",              `${report.testResult.passed}/${report.testResult.total}`],
                    ["Integrity checks",   `${report.auditReport.integrity.passed}/${report.auditReport.integrity.passed+report.auditReport.integrity.failed}`],
                    ["Immutability checks",`${report.auditReport.immutability.passed}/${report.auditReport.immutability.passed+report.auditReport.immutability.failed}`],
                    ["SOLID checks",       `${report.auditReport.solid.checks.filter(c=>c.verdict==="PASS").length}/${report.auditReport.solid.checks.length}`],
                    ["Structural checks",  `${report.structuralReport.passed}/${report.structuralReport.passed+report.structuralReport.failed}`],
                    ["Source files",       String(report.sourceReport.files)],
                    ["Total lines",        String(report.sourceReport.totalLines)],
                    ["Source critical",    String(report.sourceReport.critical)],
                    ["Source errors",      String(report.sourceReport.errors)],
                    ["Source warnings",    String(report.sourceReport.warnings)],
                    ["Code smells",        String(report.astReport.codeSmells.length)],
                    ["Circular deps",      String(report.astReport.dependencies.hasCircular)],
                    ["Performance benches",String(report.auditReport.performance.benchmarks.length)],
                    ["Total elapsed",      report.totalMs + "ms"],
                    ["Verdict",            report.certified ? "CERTIFIED" : "CERTIFICATION FAILED"],
                  ].map(([k,v]) => (
                    <div key={k} className="flex gap-3">
                      <span className="text-zinc-500 w-44 shrink-0">{k}</span>
                      <span className={k==="Verdict"?(report.certified?"text-emerald-400 font-bold":"text-red-400 font-bold"):"text-zinc-300"}>{v}</span>
                    </div>
                  ))}
                </div>
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
                  <div className="text-zinc-500 tracking-widest mb-3">SUITES OVERVIEW</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(report.suiteMap).map(([suite, rows]) => {
                      const p = rows.filter(r=>r.passed).length;
                      return (
                        <div key={suite} className="border border-zinc-800 rounded p-2 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${p===rows.length?"bg-emerald-500":"bg-red-500"}`} />
                          <span className="text-zinc-300 text-xs flex-1">{suite}</span>
                          <span className={`text-xs font-mono font-bold ${p===rows.length?"text-emerald-400":"text-red-400"}`}>{p}/{rows.length}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── TESTS ── */}
            {activeTab === "tests" && (
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
                  <div className="text-zinc-500 tracking-widest mb-3">CERTIFICATION GATES</div>
                  {[
                    ["Test suite",           report.testResult.certified,          `${report.testResult.passed}/${report.testResult.total} tests`],
                    ["Integrity audit",      report.auditReport.integrity.ok,      `${report.auditReport.integrity.passed} checks`],
                    ["Immutability audit",   report.auditReport.immutability.ok,   `${report.auditReport.immutability.passed} checks`],
                    ["SOLID audit",          report.auditReport.solid.ok,          `${report.auditReport.solid.checks.length} principles`],
                    ["Structural audit",     report.structuralReport.ok,           `${report.structuralReport.passed} checks`],
                    ["Source clean",         report.sourceReport.ok,               `${report.sourceReport.critical} critical, ${report.sourceReport.errors} errors`],
                    ["No circular deps",     !report.astReport.dependencies.hasCircular, `${report.astReport.dependencies.circularPairs.length} pairs`],
                    ["Architecture Score ≥95",report.archScore?.score >= 95,       `${report.archScore?.score}/100`],
                  ].map(([label, ok, ev]) => (
                    <div key={label} className={`flex items-center gap-3 py-1.5 border-b border-zinc-800/40 last:border-0 ${!ok?"bg-red-950/10":""} px-2 rounded`}>
                      <span className={`font-bold text-sm ${ok?"text-emerald-400":"text-red-400"}`}>{ok?"✓":"✗"}</span>
                      <span className="text-zinc-300 flex-1">{label}</span>
                      <span className="text-zinc-500 text-xs">{ev}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── AST ── */}
            {activeTab === "ast" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                    AST ANALYSIS — {report.astReport.files.length} files · {report.astReport.durationMs}ms
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          {["File","Lines","Classes","Methods","Imports","Fan-Out"].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-zinc-500 font-normal">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.astReport.files.map((f, i) => (
                          <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                            <td className="px-3 py-2 text-violet-400">{f.file}</td>
                            <td className="px-3 py-2 text-zinc-300">{f.lineCount}</td>
                            <td className="px-3 py-2 text-sky-400">{f.classes.length}</td>
                            <td className="px-3 py-2 text-emerald-400">{f.functions.length}</td>
                            <td className="px-3 py-2 text-zinc-400">{f.imports.length}</td>
                            <td className="px-3 py-2 text-amber-400">{f.fanOut}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
                  <div className="text-zinc-500 tracking-widest mb-3">TOP COMPLEX METHODS (Cyclomatic Complexity)</div>
                  {report.astReport.topComplex.map((fn, i) => (
                    <div key={i} className="flex gap-2 py-1 border-b border-zinc-800/30 last:border-0">
                      <span className={`w-6 text-right font-mono font-bold ${fn.cyclomaticScore>10?"text-red-400":fn.cyclomaticScore>5?"text-amber-400":"text-emerald-400"}`}>{fn.cyclomaticScore}</span>
                      <span className="text-violet-400 w-40 shrink-0">{fn.name}</span>
                      <span className="text-zinc-500 flex-1">{fn.file}</span>
                      <span className="text-zinc-600">L{fn.line} · {fn.linesOfCode}loc · {fn.paramCount}p</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SOURCE ── */}
            {activeTab === "source" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                    REAL SOURCE ANALYSIS (Vite ?raw) — {report.sourceReport.files} files · {report.sourceReport.totalLines} lines · {report.sourceReport.durationMs}ms
                  </div>
                  {report.sourceReport.findings.length === 0
                    ? <div className="p-6 text-center text-emerald-400 font-bold">✓ Zero findings — Source is clean</div>
                    : report.sourceReport.findings.map((f, i) => (
                      <div key={i} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                        <div className="flex items-center gap-2 mb-1">
                          <SevBadge sev={f.severity} />
                          <Badge label={f.rule} ok={undefined} />
                          <span className="text-zinc-400 text-xs">{f.file}:{f.line}:{f.column}</span>
                        </div>
                        <div className="text-zinc-400 text-xs mb-1">{f.description}</div>
                        <pre className="text-zinc-500 text-xs bg-zinc-800 rounded px-2 py-1 overflow-x-auto">{f.snippet}</pre>
                      </div>
                    ))
                  }
                </div>
                <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">FILE METRICS</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          {["File","Total","Code","Comments","Blank","Functions","Classes"].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-zinc-500 font-normal">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.sourceReport.fileMetrics.map((m, i) => (
                          <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                            <td className="px-3 py-2 text-violet-400">{m.file}</td>
                            <td className="px-3 py-2 text-zinc-300">{m.lines}</td>
                            <td className="px-3 py-2 text-sky-400">{m.codeLines}</td>
                            <td className="px-3 py-2 text-zinc-500">{m.commentLines}</td>
                            <td className="px-3 py-2 text-zinc-600">{m.blankLines}</td>
                            <td className="px-3 py-2 text-emerald-400">{m.functions}</td>
                            <td className="px-3 py-2 text-amber-400">{m.classes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── SOLID ── */}
            {activeTab === "solid" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  SOLID AUDIT — Evidence-derived, not declared · {report.auditReport.solid.durationMs}ms
                </div>
                {report.auditReport.solid.checks.map((c, i) => (
                  <div key={i} className={`px-4 py-3 border-b border-zinc-800/40 last:border-0 ${c.verdict==="FAIL"?"bg-red-950/10":c.verdict==="WARNING"?"bg-amber-950/10":""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${c.verdict==="PASS"?"text-emerald-400":c.verdict==="WARNING"?"text-amber-400":"text-red-400"}`}>{c.verdict}</span>
                      <span className="text-zinc-300 text-xs font-bold">{c.principle}</span>
                    </div>
                    <div className="text-zinc-400 text-xs mb-1">{c.rationale}</div>
                    <div className="text-zinc-600 text-xs font-mono">{c.evidence}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── PERFORMANCE ── */}
            {activeTab === "performance" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  PERFORMANCE — {report.auditReport.performance.benchmarks[0]?.iterations} iterations · performance.now() · {report.auditReport.performance.durationMs}ms
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Operation","Avg","Min","Max","Median","p95","p99","StdDev","Ops/s"].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-zinc-500 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.auditReport.performance.benchmarks.map((b, i) => (
                        <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                          <td className="px-3 py-2 text-violet-400 font-bold">{b.operation}</td>
                          <td className="px-3 py-2 text-sky-400">{b.avgMs}</td>
                          <td className="px-3 py-2 text-emerald-400">{b.minMs}</td>
                          <td className="px-3 py-2 text-amber-400">{b.maxMs}</td>
                          <td className="px-3 py-2 text-zinc-300">{b.medianMs}</td>
                          <td className="px-3 py-2 text-orange-400">{b.p95Ms}</td>
                          <td className="px-3 py-2 text-red-400">{b.p99Ms}</td>
                          <td className="px-3 py-2 text-zinc-500">{b.stdDev}</td>
                          <td className="px-3 py-2 text-zinc-300">{b.opsPerSec.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── INTEGRITY ── */}
            {activeTab === "integrity" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  INTEGRITY AUDIT — {report.auditReport.integrity.passed}/{report.auditReport.integrity.passed+report.auditReport.integrity.failed} · {report.auditReport.integrity.durationMs}ms
                </div>
                {report.auditReport.integrity.checks.map((c, i) => <CheckRow key={i} ok={c.ok} label={c.check} detail={c.detail} />)}
              </div>
            )}

            {/* ── IMMUTABILITY ── */}
            {activeTab === "immutability" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  IMMUTABILITY — Object.isFrozen() on all public types · {report.auditReport.immutability.passed}/{report.auditReport.immutability.passed+report.auditReport.immutability.failed} · {report.auditReport.immutability.durationMs}ms
                </div>
                {report.auditReport.immutability.checks.map((c, i) => <CheckRow key={i} ok={c.ok} label={c.check} detail={c.detail} />)}
              </div>
            )}

            {/* ── DEPS ── */}
            {activeTab === "deps" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
                  <div className="text-zinc-500 tracking-widest mb-3">DEPENDENCY ANALYSIS</div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <MetCard label="Total edges" value={report.astReport.dependencies.edges.length} color="text-zinc-300" />
                    <MetCard label="Circular pairs" value={report.astReport.dependencies.circularPairs.length} color={report.astReport.dependencies.hasCircular?"text-red-400":"text-emerald-400"} />
                    <MetCard label="High coupling" value={report.astReport.dependencies.highCouplingFiles.length} color={report.astReport.dependencies.highCouplingFiles.length>0?"text-amber-400":"text-emerald-400"} />
                  </div>
                  {report.astReport.dependencies.circularPairs.length > 0 && (
                    <div className="border border-red-700 rounded bg-red-950/20 p-3 mb-3">
                      <div className="text-red-400 font-bold mb-1">CIRCULAR DEPENDENCIES DETECTED</div>
                      {report.astReport.dependencies.circularPairs.map((p, i) => (
                        <div key={i} className="text-red-300 text-xs">{p}</div>
                      ))}
                    </div>
                  )}
                  <div className="text-zinc-500 mb-2">Fan-In (times imported)</div>
                  {Object.entries(report.astReport.dependencies.fanInMap)
                    .sort(([,a],[,b]) => b-a)
                    .map(([mod, count]) => (
                    <div key={mod} className="flex gap-2 py-0.5">
                      <span className="text-sky-400 w-8 text-right font-mono">{count}</span>
                      <span className="text-zinc-400">{mod}</span>
                    </div>
                  ))}
                </div>
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
                  <div className="text-zinc-500 tracking-widest mb-2">DEPENDENCY EDGES (internal only)</div>
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {report.astReport.dependencies.edges.map((e, i) => (
                      <div key={i} className="flex gap-2 text-xs text-zinc-500">
                        <span className="text-violet-400">{e.from}</span>
                        <span>→</span>
                        <span className="text-sky-400">{e.to}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── SMELLS ── */}
            {activeTab === "smells" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  CODE SMELLS — {report.astReport.codeSmells.length} detected
                </div>
                {report.astReport.codeSmells.length === 0
                  ? <div className="p-6 text-center text-emerald-400 font-bold">✓ Zero code smells detected</div>
                  : report.astReport.codeSmells.map((s, i) => (
                    <div key={i} className="px-4 py-2 border-b border-zinc-800/40 last:border-0 flex gap-2 text-xs">
                      <span className="text-amber-400 shrink-0">⚠</span>
                      <span className="text-zinc-300">{s}</span>
                    </div>
                  ))
                }
              </div>
            )}

            {/* ── EVIDENCE ── */}
            {activeTab === "evidence" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1.5">
                  <div className="text-zinc-500 tracking-widest mb-2">EVIDENCE CHAIN — ALL FROM REAL EXECUTION</div>
                  {buildEvidenceChain(report).map((e, i) => (
                    <div key={i} className={`flex gap-2 py-0.5 ${e.ok?"text-zinc-300":"text-red-400"}`}>
                      <span className="shrink-0">{e.ok?"✓":"✗"}</span>
                      <span className="flex-1">{e.label}</span>
                      <span className="text-zinc-600 ml-auto shrink-0 max-w-xs truncate font-mono text-xs">{e.evidence}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FAILURES ── */}
            {activeTab === "failures" && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">FAILURES — {report.failures.length}</div>
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
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">ALL TESTS — sorted by duration desc</div>
                <div className="max-h-[600px] overflow-y-auto">
                  {[...report.testResult.results].sort((a,b)=>b.durationMs-a.durationMs).map(r => (
                    <div key={r.id} className={`flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0 ${!r.passed?"bg-red-950/10":""}`}>
                      <span className={`text-xs font-mono w-14 shrink-0 text-right ${r.durationMs>1000?"text-amber-400":r.durationMs>100?"text-sky-400":"text-zinc-500"}`}>{r.durationMs}ms</span>
                      <span className="text-zinc-500 text-xs w-24 shrink-0">{r.suite}</span>
                      <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                      <span className={`text-xs font-bold ${r.passed?"text-emerald-400":"text-red-400"}`}>{r.passed?"PASS":"FAIL"}</span>
                    </div>
                  ))}
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
  const { testResult, auditReport, structuralReport, sourceReport, astReport, archScore } = report;
  const ic = (keyword) => auditReport.immutability.checks.find(c=>c.check.includes(keyword));
  const ig = (keyword) => auditReport.integrity.checks.find(c=>c.check.includes(keyword));
  const sc = (keyword) => structuralReport.checks.find(c=>c.check.includes(keyword));
  const so = (keyword) => auditReport.solid.checks.find(c=>c.principle.includes(keyword));

  return [
    { label:"All tests passed",                                   ok: testResult.certified,                  evidence: `${testResult.passed}/${testResult.total}` },
    { label:"StoreResult is frozen (Object.isFrozen)",            ok: ic("StoreResult frozen")?.ok??false,   evidence: ic("StoreResult frozen")?.detail??"n/a" },
    { label:"QueryResult + records[] frozen",                     ok: ic("QueryResult frozen")?.ok??false,   evidence: ic("QueryResult frozen")?.detail??"n/a" },
    { label:"SearchResult + scores[] frozen",                     ok: ic("SearchResult frozen")?.ok??false,  evidence: ic("SearchResult frozen")?.detail??"n/a" },
    { label:"Snapshot fully frozen",                              ok: ic("Snapshot frozen")?.ok??false,      evidence: ic("Snapshot frozen")?.detail??"n/a" },
    { label:"No empty Sets in index after delete",                ok: ig("no empty sets")?.ok??false,        evidence: ig("no empty sets")?.detail??"n/a" },
    { label:"Statistics consistent across lifecycle",             ok: ig("Statistics consistent")?.ok??false,evidence: ig("Statistics consistent")?.detail??"n/a" },
    { label:"No orphan references after delete",                  ok: ig("No orphan")?.ok??false,            evidence: ig("No orphan")?.detail??"n/a" },
    { label:"Query deterministic",                                ok: ig("deterministic")?.ok??false,        evidence: ig("deterministic")?.detail??"n/a" },
    { label:"Query pagination no overlap",                        ok: sc("overlap")?.ok??false,              evidence: sc("overlap")?.detail??"n/a" },
    { label:"Source: 0 critical findings (real file scan)",       ok: sourceReport.critical===0,             evidence: `${sourceReport.critical} critical in ${sourceReport.totalLines} lines` },
    { label:"Source: 0 error findings",                          ok: sourceReport.errors===0,               evidence: `${sourceReport.errors} errors` },
    { label:"No circular dependencies (AST-derived)",            ok: !astReport.dependencies.hasCircular,   evidence: `${astReport.dependencies.circularPairs.length} circular pairs` },
    { label:"SOLID — SRP (measured by export count)",            ok: so("SRP")?.verdict==="PASS",           evidence: so("SRP")?.evidence??"n/a" },
    { label:"SOLID — LSP (all 11 methods present)",              ok: so("LSP")?.verdict==="PASS",           evidence: so("LSP")?.evidence??"n/a" },
    { label:"SOLID — DIP (depends on abstractions)",             ok: so("DIP")?.verdict==="PASS",           evidence: so("DIP")?.evidence??"n/a" },
    { label:"Architecture Score >= 95",                          ok: archScore?.score>=95,                  evidence: `${archScore?.score}/100` },
    { label:"Final verdict",                                     ok: report.certified,                      evidence: archScore?.verdict??"n/a" },
  ];
}