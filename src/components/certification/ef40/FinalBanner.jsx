import React from "react";
import { Stat } from "./Panel.jsx";
import { CERT_CONFIG, CERT_STATUS, TOTAL_PHASES } from "@/lib/certification/CertificationConstants.js";

export default function FinalBanner({ certStatus, coverage, scoreInfo, execAt, totalMs }) {
  const cfg = CERT_CONFIG[certStatus];
  return (
    <div style={{ border: `2px solid ${cfg.color}`, borderRadius: 12, padding: 24, textAlign: "center", background: cfg.bg, marginTop: 8 }}>
      <div style={{ fontSize: 26, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>
      {certStatus === CERT_STATUS.PARTIALLY_CERTIFIED && (
        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8 }}>
          Certification score is based only on executed phases.<br />Execution coverage remains incomplete.
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 16, flexWrap: "wrap" }}>
        <Stat label="Coverage"    value={`${coverage.coveragePct}%`}                  sub={`${coverage.executed.length}/${coverage.total} phases`} color={coverage.coveragePct === 100 ? "#22c55e" : "#f59e0b"} />
        <Stat label="Score"       value={`${scoreInfo.score}/100`}                    sub={`Grade ${scoreInfo.grade}`}                            color={scoreInfo.score >= 95 ? "#22c55e" : "#ef4444"} />
        <Stat label="Executed"    value={`${scoreInfo.executedCount}/${TOTAL_PHASES}`} sub="phases"                                               color="#a1a1aa" />
        <Stat label="Passed"      value={scoreInfo.passedCount}                       sub="phases"                                               color="#22c55e" />
        {scoreInfo.failedCount > 0 && <Stat label="Failed" value={scoreInfo.failedCount} sub="phases" color="#ef4444" />}
        {coverage.notExecuted.length > 0 && <Stat label="Not Executed" value={coverage.notExecuted.length} sub="phases" color="#f59e0b" />}
        <Stat label="Total Time"  value={`${totalMs}ms`}                              sub={execAt?.split("T")[1]?.split(".")[0] ?? ""}            color="#71717a" />
      </div>
    </div>
  );
}