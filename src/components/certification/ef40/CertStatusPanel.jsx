import React from "react";
import { Panel } from "./Panel.jsx";
import { CERT_CONFIG } from "@/lib/certification/CertificationConstants.js";

const MIN_SCORE = 95;

export default function CertStatusPanel({ certStatus, coverage, scoreInfo }) {
  const cfg = CERT_CONFIG[certStatus];
  const rules = {
    CERTIFIED:           `All ${coverage.total} phases executed. Score ${scoreInfo.score} >= ${MIN_SCORE} minimum. No failures.`,
    PARTIALLY_CERTIFIED: `${coverage.notExecuted.length} phase(s) NOT_EXECUTED: ${coverage.notExecuted.join(", ")}. Certification score is based only on executed phases. Execution coverage remains incomplete.`,
    NOT_CERTIFIED:       `${scoreInfo.failedCount} phase(s) failed: ${scoreInfo.failed.join(", ")}. All executed phases must pass.`,
  };
  return (
    <Panel title="C — Certification Status" accent={cfg.color}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ background: cfg.bg, border: `2px solid ${cfg.color}`, borderRadius: 8, padding: "8px 20px" }}>
          <div style={{ fontSize: 24, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>
        </div>
        <div style={{ fontSize: 10, color: "#a1a1aa", maxWidth: 480, lineHeight: 1.6 }}>{rules[certStatus]}</div>
      </div>
    </Panel>
  );
}