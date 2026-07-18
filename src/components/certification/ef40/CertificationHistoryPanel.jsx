import React from "react";
import { Panel } from "./Panel.jsx";
import { CERT_CONFIG } from "@/lib/certification/CertificationConstants.js";
import { runRegressionEngine } from "@/lib/certification-history/RegressionEngine";

export default function CertificationHistoryPanel({ history, currentId }) {
  if (!history || history.length === 0) {
    return (
      <Panel title="Certification History">
        <div style={{ fontSize: 10, color: "#52525b" }}>No previous certifications found. This is the first run.</div>
      </Panel>
    );
  }
  const cols    = "140px 155px 70px 70px 155px 80px 80px";
  const headers = ["EXECUTION ID", "TIMESTAMP", "COVERAGE", "SCORE", "STATUS", "RUNTIME", "TREND"];
  const sorted  = [...history].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return (
    <Panel title={`Certification History — ${history.length} run(s)`}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: "2px 10px", minWidth: 900 }}>
          {headers.map(h => (
            <div key={h} style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, borderBottom: "1px solid #27272a", paddingBottom: 3, marginBottom: 3 }}>{h}</div>
          ))}
          {sorted.map((rec, i) => {
            const cfg       = CERT_CONFIG[rec.certificationStatus] ?? { color: "#71717a" };
            const isCurrent = rec.executionId === currentId;
            const prev      = i > 0 ? sorted[i - 1] : null;
            const reg       = prev ? runRegressionEngine(rec, prev) : null;
            const trend     = !reg ? "—" : reg.summary === "IMPROVED" ? "↑ IMPROVED" : reg.summary === "REGRESSED" ? "↓ REGRESSED" : reg.summary === "MIXED" ? "~ MIXED" : "= NO CHANGE";
            const trendClr  = !reg ? "#52525b" : reg.summary === "IMPROVED" ? "#22c55e" : reg.summary === "REGRESSED" ? "#ef4444" : "#f59e0b";
            return (
              <React.Fragment key={rec.executionId}>
                <div style={{ fontSize: 9, color: isCurrent ? "#a78bfa" : "#71717a", fontWeight: isCurrent ? "bold" : "normal" }}>{rec.executionId.slice(0, 8)}…{isCurrent ? " ◀ current" : ""}</div>
                <div style={{ fontSize: 9, color: "#52525b" }}>{new Date(rec.timestamp).toLocaleString()}</div>
                <div style={{ fontSize: 9, color: rec.coveragePct === 100 ? "#22c55e" : "#f59e0b" }}>{rec.coveragePct}%</div>
                <div style={{ fontSize: 9, color: rec.score >= 95 ? "#22c55e" : "#ef4444" }}>{rec.score}/100 {rec.grade}</div>
                <div style={{ fontSize: 9, color: cfg.color }}>{cfg.icon ?? ""} {rec.certificationStatus}</div>
                <div style={{ fontSize: 9, color: "#71717a" }}>{rec.totalRuntimeMs}ms</div>
                <div style={{ fontSize: 9, color: trendClr, fontWeight: "bold" }}>{trend}</div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}