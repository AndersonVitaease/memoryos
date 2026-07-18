import React from "react";
import { Panel } from "./Panel.jsx";
import {
  ALL_PHASES, STATUS, STATUS_COLOR, STATUS_ICON, STATUS_LABEL,
  EVIDENCE_LABEL, EVIDENCE_COLOR, SOURCE_OF_TRUTH,
} from "@/lib/certification/CertificationConstants.js";
import { matrixNote } from "@/lib/certification/CertificationExport.js";

export default function ExecutionMatrix({ phases }) {
  const headers = ["PHASE", "STATUS", "TIME", "EVIDENCE", "SOURCE OF TRUTH", "RESULT"];
  const cols    = "120px 105px 60px 140px 220px 1fr";
  return (
    <Panel title="Execution Matrix — all declared phases (EF-40.1 enhanced)">
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: "2px 10px", alignItems: "start", overflowX: "auto" }}>
        {headers.map(h => (
          <div key={h} style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, borderBottom: "1px solid #27272a", paddingBottom: 4, marginBottom: 4 }}>{h}</div>
        ))}
        {ALL_PHASES.map(name => {
          const phase   = phases[name];
          const s       = phase?.status ?? STATUS.NOT_EXECUTED;
          const sColor  = STATUS_COLOR[s];
          const evColor = EVIDENCE_COLOR[s] ?? "#71717a";
          const evLabel = EVIDENCE_LABEL[s] ?? "UNKNOWN";
          return (
            <React.Fragment key={name}>
              <div style={{ fontSize: 10, color: "#e4e4e7", fontWeight: "bold", paddingTop: 4 }}>{name}</div>
              <div style={{ fontSize: 10, color: sColor, fontWeight: "bold", paddingTop: 4 }}>{STATUS_ICON[s]} {STATUS_LABEL[s]}</div>
              <div style={{ fontSize: 9, color: "#71717a", paddingTop: 5 }}>{phase?.durationMs > 0 ? `${phase.durationMs}ms` : "—"}</div>
              <div style={{ fontSize: 9, color: evColor, fontWeight: "bold", paddingTop: 5 }}>{evLabel}</div>
              <div style={{ fontSize: 9, color: "#818cf8", paddingTop: 5 }}>{SOURCE_OF_TRUTH[name] ?? "—"}</div>
              <div style={{ fontSize: 9, color: s === STATUS.NOT_EXECUTED ? "#f59e0b" : s === STATUS.FAIL ? "#ef4444" : "#a1a1aa", paddingTop: 5 }}>{matrixNote(name, phase)}</div>
            </React.Fragment>
          );
        })}
      </div>
    </Panel>
  );
}