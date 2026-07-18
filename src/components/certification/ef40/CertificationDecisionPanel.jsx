import React from "react";
import { Panel, Row } from "./Panel.jsx";
import { CERT_CONFIG, TOTAL_PHASES, MIN_SCORE } from "@/lib/certification/CertificationConstants.js";

export default function CertificationDecisionPanel({ certStatus, coverage, scoreInfo }) {
  const cfg   = CERT_CONFIG[certStatus];
  const lines = {
    CERTIFIED: [
      `All ${TOTAL_PHASES} declared phases were executed.`,
      `No phase failed.`,
      `Certification Score: ${scoreInfo.score}/100 (>= ${MIN_SCORE} minimum required).`,
      `Execution Coverage: 100%.`,
      `Decision: CERTIFIED.`,
    ],
    PARTIALLY_CERTIFIED: [
      `${scoreInfo.executedCount} of ${TOTAL_PHASES} phases were executed successfully.`,
      `${coverage.notExecuted.length} phase(s) could not be executed: ${coverage.notExecuted.join(", ")}.`,
      `Reason for non-execution: documented platform limitation (Vite ?raw module collision).`,
      `No executed phase failed.`,
      `Certification Score (executed phases only): ${scoreInfo.score}/100 — Grade ${scoreInfo.grade}.`,
      `Execution Coverage: ${coverage.coveragePct}% — incomplete.`,
      `Decision: PARTIALLY CERTIFIED — certification score reflects executed phases only; coverage remains incomplete.`,
    ],
    NOT_CERTIFIED: [
      `${scoreInfo.failedCount} executed phase(s) failed: ${scoreInfo.failed.join(", ")}.`,
      `A certification requires all executed phases to pass.`,
      `Decision: NOT CERTIFIED.`,
    ],
  };
  return (
    <Panel title="Certification Decision" accent={cfg.color}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div style={{ background: cfg.bg, border: `2px solid ${cfg.color}`, borderRadius: 6, padding: "4px 14px" }}>
          <div style={{ fontSize: 16, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>
        </div>
      </div>
      {lines[certStatus]?.map((line, i) => (
        <Row key={i} color={i === lines[certStatus].length - 1 ? cfg.color : "#a1a1aa"}>{line}</Row>
      ))}
    </Panel>
  );
}