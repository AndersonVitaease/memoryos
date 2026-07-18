import React from "react";
import { Panel } from "./Panel.jsx";

export default function CoveragePanel({ coverage }) {
  const pct   = coverage.coveragePct;
  const color = pct === 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <Panel title="A — Execution Coverage (all declared phases)" accent={color}>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: "bold", color }}>{pct}%</div>
          <div style={{ fontSize: 11, color: "#71717a" }}>{coverage.executed.length} of {coverage.total} phases executed</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#52525b", marginBottom: 4 }}>EXECUTED ({coverage.executed.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {coverage.executed.map(k => <span key={k} style={{ fontSize: 9, background: "#052e16", color: "#22c55e", border: "1px solid #166534", borderRadius: 4, padding: "1px 6px" }}>{k}</span>)}
          </div>
        </div>
        {coverage.notExecuted.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#52525b", marginBottom: 4 }}>NOT EXECUTED ({coverage.notExecuted.length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {coverage.notExecuted.map(k => <span key={k} style={{ fontSize: 9, background: "#422006", color: "#f59e0b", border: "1px solid #92400e", borderRadius: 4, padding: "1px 6px" }}>{k}</span>)}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}