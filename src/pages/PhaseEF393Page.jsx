/**
 * PhaseEF393Page.jsx — Sprint EF-39.6
 * Modular Architectural Certification Dashboard
 * Route: /ef393-certification
 *
 * This page only orchestrates + renders.
 * All logic lives in: CertificationReportBuilder, ArchitectureScoreEngine, CertificationRules, AuditorRegistry.
 */
import React, { useState, useCallback } from "react";
import CertificationHeader    from "@/components/certification/CertificationHeader";
import CertificationSummary   from "@/components/certification/CertificationSummary";
import CertificationMetrics   from "@/components/certification/CertificationMetrics";
import CertificationTabs, { TAB_IDS } from "@/components/certification/CertificationTabs";
import TestsTab               from "@/components/certification/TestsTab";
import ArchitectureTab        from "@/components/certification/ArchitectureTab";
import ASTTab                 from "@/components/certification/ASTTab";
import SourceTab              from "@/components/certification/SourceTab";
import SolidTab               from "@/components/certification/SolidTab";
import PerformanceTab         from "@/components/certification/PerformanceTab";
import IntegrityTab           from "@/components/certification/IntegrityTab";
import ImmutabilityTab        from "@/components/certification/ImmutabilityTab";
import DependenciesTab        from "@/components/certification/DependenciesTab";
import CodeSmellsTab          from "@/components/certification/CodeSmellsTab";
import EvidenceTab            from "@/components/certification/EvidenceTab";
import FailuresTab            from "@/components/certification/FailuresTab";
import TimingTab              from "@/components/certification/TimingTab";

export default function PhaseEF393Page() {
  const [phase, setPhase]       = useState("idle");
  const [report, setReport]     = useState(null);
  const [runLog, setRunLog]     = useState([]);
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

      log("Importing engines…");
      const [
        { runMemoryStoreTests },
        { runFullAudit },
        sourceAuditMod,
        { runASTAudit },
        { CertificationReportBuilder },
      ] = await Promise.all([
        import("@/lib/knowledge-store/memory/MemoryStoreTests"),
        import("@/lib/knowledge-store/auditor/ArchitecturalAuditor"),
        import("@/lib/knowledge-store/auditor/SourceAudit"),
        import("@/lib/knowledge-store/auditor/ASTAuditor"),
        import("@/lib/knowledge-store/certification/CertificationReportBuilder"),
      ]);
      const { runSourceAudit, runStructuralAudit } = sourceAuditMod;

      log("Running all auditors in parallel…");
      const [testResult, auditReport, structuralReport] = await Promise.all([
        runMemoryStoreTests(),
        runFullAudit(),
        runStructuralAudit(),
      ]);

      log("Running source + AST analysis…");
      const sourceReport = runSourceAudit();
      const astReport    = runASTAudit();

      const totalMs = Math.round(performance.now() - t0);

      log("Building certification report…");
      const built = CertificationReportBuilder.build({
        testResult, auditReport, structuralReport, sourceReport, astReport, totalMs,
      });

      log(built.certified
        ? `✓ CERTIFIED — Score ${built.archScore.score}/100 (${built.archScore.grade})`
        : `✗ FAILED — Score ${built.archScore.score}/100`
      );

      setReport(built);
      setPhase("done");
      setActiveTab(built.failures.length > 0 ? "failures" : "summary");

    } catch (err) {
      log(`FATAL: ${err?.message ?? String(err)}`);
      setPhase("error");
      setReport({ fatalError: err?.message ?? String(err), stack: err?.stack ?? "" });
    }
  }, [log]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        <CertificationHeader />

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runCertification} disabled={phase === "running"}
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold text-sm">
            {phase === "running" ? "⏳ Running…" : "▶  Execute Full Certification"}
          </button>
          {phase === "done" && report && !report.fatalError && (
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
              report.certified
                ? "border-emerald-600 bg-emerald-950/40 text-emerald-400"
                : "border-red-700 bg-red-950/30 text-red-400"
            }`}>
              {report.certified
                ? `✓ CERTIFIED (${report.archScore?.score}/100)`
                : `✗ FAILED (${report.archScore?.score}/100)`}
            </span>
          )}
          {phase === "error" && (
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border border-red-700 bg-red-950/30 text-red-400">FATAL ERROR</span>
          )}
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
            <CertificationSummary report={report} />
            <CertificationMetrics report={report} />
            <CertificationTabs
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              failureCount={report.failures.length}
            />

            {activeTab === "summary"       && <CertificationSummary report={report} />}
            {activeTab === "tests"         && <TestsTab report={report} />}
            {activeTab === "architecture"  && <ArchitectureTab report={report} />}
            {activeTab === "ast"           && <ASTTab report={report} />}
            {activeTab === "source"        && <SourceTab report={report} />}
            {activeTab === "solid"         && <SolidTab report={report} />}
            {activeTab === "performance"   && <PerformanceTab report={report} />}
            {activeTab === "integrity"     && <IntegrityTab report={report} />}
            {activeTab === "immutability"  && <ImmutabilityTab report={report} />}
            {activeTab === "deps"          && <DependenciesTab report={report} />}
            {activeTab === "smells"        && <CodeSmellsTab report={report} />}
            {activeTab === "evidence"      && <EvidenceTab report={report} />}
            {activeTab === "failures"      && <FailuresTab report={report} />}
            {activeTab === "timing"        && <TimingTab report={report} />}
          </>
        )}
      </div>
    </div>
  );
}