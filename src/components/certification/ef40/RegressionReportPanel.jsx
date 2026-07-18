import React from "react";
import { Panel } from "./Panel.jsx";
import { CHANGE_COLOR, CHANGE_ICON } from "@/lib/certification/CertificationConstants.js";

export default function RegressionReportPanel({ regression }) {
  if (!regression) {
    return (
      <Panel title="Regression Report — Compare With Previous">
        <div style={{ fontSize: 10, color: "#52525b" }}>No previous execution to compare against.</div>
      </Panel>
    );
  }
  const summaryColor = regression.summary === "IMPROVED" ? "#22c55e" : regression.summary === "REGRESSED" ? "#ef4444" : regression.summary === "MIXED" ? "#f59e0b" : "#52525b";
  return (
    <Panel title={`Regression Report — vs execution ${regression.previousId?.slice(0, 8)}…`} accent={summaryColor}>
      <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: "bold", color: summaryColor }}>{regression.summary}</div>
        <div style={{ fontSize: 10, color: "#22c55e" }}>↑ {regression.improvements} improvement(s)</div>
        <div style={{ fontSize: 10, color: "#ef4444" }}>↓ {regression.regressions} regression(s)</div>
        <div style={{ fontSize: 10, color: "#52525b" }}>= {regression.noChanges} no change</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "180px 110px 110px 100px 110px", gap: "2px 10px" }}>
        {["DIMENSION", "PREVIOUS", "CURRENT", "DELTA", "CHANGE"].map(h => (
          <div key={h} style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, borderBottom: "1px solid #27272a", paddingBottom: 3, marginBottom: 3 }}>{h}</div>
        ))}
        {regression.dimensions.map((d, i) => (
          <React.Fragment key={i}>
            <div style={{ fontSize: 10, color: "#e4e4e7" }}>{d.name}</div>
            <div style={{ fontSize: 10, color: "#71717a" }}>{d.previous}</div>
            <div style={{ fontSize: 10, color: "#a1a1aa" }}>{d.current}</div>
            <div style={{ fontSize: 10, color: CHANGE_COLOR[d.change] ?? "#71717a" }}>{d.delta}</div>
            <div style={{ fontSize: 10, color: CHANGE_COLOR[d.change] ?? "#71717a", fontWeight: "bold" }}>{CHANGE_ICON[d.change]} {d.change}</div>
          </React.Fragment>
        ))}
      </div>
    </Panel>
  );
}