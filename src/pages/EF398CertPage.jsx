/**
 * EF-40.3 — CERTIFICATION UI DECOMPOSITION
 * Thin Orchestrator: no business logic, no computation, no state.
 * All logic lives in useCertificationRuntime().
 * All rendering lives in src/components/certification/ef40/.
 */
import React from "react";
import { useCertificationRuntime }    from "@/hooks/useCertificationRuntime";
import { CertificationHistoryStore }  from "@/lib/certification-history/CertificationHistoryStore";
import { STATUS_LABEL, STATUS_COLOR, STATUS_ICON, TOTAL_PHASES } from "@/lib/certification/CertificationConstants";

import ProjectHealthBadge         from "@/components/certification/ef40/ProjectHealthBadge";
import ExportButton               from "@/components/certification/ef40/ExportButton";
import CoveragePanel              from "@/components/certification/ef40/CoveragePanel";
import ScorePanel                 from "@/components/certification/ef40/ScorePanel";
import CertStatusPanel            from "@/components/certification/ef40/CertStatusPanel";
import AuditSummaryPanel          from "@/components/certification/ef40/AuditSummaryPanel";
import ExecutionMatrix            from "@/components/certification/ef40/ExecutionMatrix";
import CertificationDecisionPanel from "@/components/certification/ef40/CertificationDecisionPanel";
import PlatformLimitationsPanel   from "@/components/certification/ef40/PlatformLimitationsPanel";
import AuditTrailPanel            from "@/components/certification/ef40/AuditTrailPanel";
import DetailSections             from "@/components/certification/ef40/DetailSections";
import TimelinePanel              from "@/components/certification/ef40/TimelinePanel";
import RegressionReportPanel      from "@/components/certification/ef40/RegressionReportPanel";
import CertificationHistoryPanel  from "@/components/certification/ef40/CertificationHistoryPanel";
import FinalBanner                from "@/components/certification/ef40/FinalBanner";
import ArchitectureMetrics        from "@/components/certification/ef40/ArchitectureMetrics";

export default function EF398CertPage() {
  const {
    runStatus, phases, coverage, scoreInfo, certStatus,
    log, trail, totalMs, execAt, execId,
    history, regression, exportPayload,
    clearHistory,
  } = useCertificationRuntime();

  const ready = !!(coverage && scoreInfo && certStatus);

  return (
    <div style={{ background: "#09090b", color: "#e4e4e7", minHeight: "100vh", fontFamily: "monospace", padding: 24 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ fontSize: 17, fontWeight: "bold", color: "#a78bfa", marginBottom: 3 }}>
          EF-40.3 — CERTIFICATION HISTORY & REGRESSION ENGINE
        </div>
        <div style={{ fontSize: 10, color: "#52525b", marginBottom: 4 }}>
          Coverage = all {TOTAL_PHASES} declared phases · Score = executed phases only · Status = CERTIFIED / PARTIALLY CERTIFIED / NOT CERTIFIED
        </div>
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: execId ? 4 : 16 }}>
          Run status:{" "}
          <span style={{ color: runStatus === "done" ? "#22c55e" : runStatus === "error" ? "#ef4444" : "#facc15", fontWeight: "bold" }}>
            {runStatus.toUpperCase()}
          </span>
          {execAt && <span style={{ color: "#3f3f46", marginLeft: 12 }}>{execAt}</span>}
        </div>
        {execId && (
          <div style={{ fontSize: 10, color: "#52525b", marginBottom: 16 }}>
            Execution ID: <span style={{ color: "#a78bfa" }}>{execId}</span>
          </div>
        )}

        {/* Execution log */}
        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 160, overflowY: "auto" }}>
          <div style={{ fontSize: 9, color: "#3f3f46", marginBottom: 6, letterSpacing: 1 }}>EXECUTION LOG</div>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 10, marginBottom: 1 }}>
              <span style={{ color: "#27272a" }}>[{l.t}ms] </span>
              <span style={{ color: l.msg.includes("FAIL") || l.msg.includes("ERROR") ? "#ef4444" : l.msg.includes("COMPLETE") || l.msg.includes("OK") ? "#22c55e" : l.msg.includes("NOT_EXECUTED") ? "#f59e0b" : "#71717a" }}>
                {l.msg}
              </span>
            </div>
          ))}
          {runStatus === "running" && <div style={{ color: "#facc15", fontSize: 10 }}>⏳ Running…</div>}
        </div>

        {ready && (
          <>
            {/* Legend */}
            <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
              {Object.entries(STATUS_LABEL).map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                  <span style={{ color: STATUS_COLOR[k], fontWeight: "bold" }}>{STATUS_ICON[k]}</span>
                  <span style={{ color: STATUS_COLOR[k] }}>{label}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <span style={{ color: "#22c55e", fontWeight: "bold" }}>R</span>
                <span style={{ color: "#22c55e" }}>RUNTIME VERIFIED</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <span style={{ color: "#f59e0b", fontWeight: "bold" }}>L</span>
                <span style={{ color: "#f59e0b" }}>DOCUMENTED LIMITATION</span>
              </div>
            </div>

            {/* Action bar */}
            <ProjectHealthBadge history={history} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {exportPayload && <ExportButton payload={exportPayload} />}
              {regression && (
                <button onClick={() => document.getElementById("regression-report")?.scrollIntoView({ behavior: "smooth" })} style={{
                  background: regression.regressions > 0 ? "#450a0a" : "#052e16",
                  color: regression.regressions > 0 ? "#ef4444" : "#22c55e",
                  border: `1px solid ${regression.regressions > 0 ? "#ef4444" : "#22c55e"}`,
                  borderRadius: 6, padding: "8px 16px", fontSize: 11, fontFamily: "monospace", cursor: "pointer", fontWeight: "bold",
                }}>
                  ⇅ COMPARE WITH PREVIOUS {regression.regressions > 0 ? `— ${regression.regressions} REGRESSION(S)` : `— ${regression.improvements} IMPROVEMENT(S)`}
                </button>
              )}
              <button onClick={clearHistory} style={{
                background: "#18181b", color: "#71717a", border: "1px solid #27272a",
                borderRadius: 6, padding: "8px 14px", fontSize: 11, fontFamily: "monospace", cursor: "pointer",
              }}>
                ✕ Clear History
              </button>
            </div>

            <CoveragePanel coverage={coverage} />
            <ScorePanel scoreInfo={scoreInfo} />
            <CertStatusPanel certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} />
            <AuditSummaryPanel execId={execId} execAt={execAt} totalMs={totalMs} coverage={coverage} scoreInfo={scoreInfo} certStatus={certStatus} />
            <ExecutionMatrix phases={phases} />
            <CertificationDecisionPanel certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} />
            <PlatformLimitationsPanel coverage={coverage} />
            <AuditTrailPanel trail={trail} execAt={execAt} totalMs={totalMs} />
            <DetailSections phases={phases} />
            <TimelinePanel history={history} currentId={execId} />
            <div id="regression-report">
              <RegressionReportPanel regression={regression} />
            </div>
            <CertificationHistoryPanel history={history} currentId={execId} />
            <ArchitectureMetrics />
            <FinalBanner certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} execAt={execAt} totalMs={totalMs} />
          </>
        )}
      </div>
    </div>
  );
}