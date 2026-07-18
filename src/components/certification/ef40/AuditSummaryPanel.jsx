import React from "react";
import { Panel } from "./Panel.jsx";
import { CERT_CONFIG } from "@/lib/certification/CertificationConstants.js";

export default function AuditSummaryPanel({ execId, execAt, totalMs, coverage, scoreInfo, certStatus }) {
  const cfg = CERT_CONFIG[certStatus];
  const rows = [
    ["Execution ID",        execId,                                                                                   "#a78bfa"],
    ["Timestamp",           execAt,                                                                                   "#71717a"],
    ["Total Runtime",       `${totalMs}ms`,                                                                           "#71717a"],
    ["Coverage",            `${coverage.coveragePct}% (${coverage.executed.length}/${coverage.total})`,               coverage.coveragePct === 100 ? "#22c55e" : "#f59e0b"],
    ["Certification Score", `${scoreInfo.score}/100 — Grade ${scoreInfo.grade}`,                                      scoreInfo.score >= 95 ? "#22c55e" : "#ef4444"],
    ["Certification Status",`${CERT_CONFIG[certStatus]?.icon} ${CERT_CONFIG[certStatus]?.label}`,                     cfg.color],
    ["Executed Phases",     `${coverage.executed.join(", ")}`,                                                        "#22c55e"],
    ["Not Executed Phases", coverage.notExecuted.length > 0 ? coverage.notExecuted.join(", ") : "None",              coverage.notExecuted.length > 0 ? "#f59e0b" : "#22c55e"],
    ["Platform Limitations","Vite ?raw module collision (SOURCE, AST)",                                               "#f59e0b"],
  ];
  return (
    <Panel title="Audit Summary">
      {rows.map(([label, value, color]) => (
        <div key={label} style={{ display: "flex", gap: 16, marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: "#52525b", minWidth: 160 }}>{label}</div>
          <div style={{ fontSize: 10, color: color ?? "#a1a1aa", fontFamily: "monospace", wordBreak: "break-all" }}>{value}</div>
        </div>
      ))}
    </Panel>
  );
}