import React from "react";
import { Panel } from "./Panel.jsx";

export default function ScorePanel({ scoreInfo }) {
  const color = scoreInfo.score >= 95 ? "#22c55e" : scoreInfo.score >= 80 ? "#60a5fa" : "#ef4444";
  return (
    <Panel title="B — Certification Score (executed phases only)" accent={color}>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: "bold", color }}>{scoreInfo.score}/100</div>
          <div style={{ fontSize: 20, fontWeight: "bold", color }}>{scoreInfo.grade}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#52525b", marginBottom: 2 }}>BASIS</div>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>{scoreInfo.executedCount} phases executed</div>
          <div style={{ fontSize: 11, color: "#22c55e" }}>{scoreInfo.passedCount} passed</div>
          {scoreInfo.failedCount > 0 && <div style={{ fontSize: 11, color: "#ef4444" }}>{scoreInfo.failedCount} failed</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#52525b", marginBottom: 2 }}>FORMULA</div>
          <div style={{ fontSize: 10, color: "#71717a" }}>{scoreInfo.passedCount} / {scoreInfo.executedCount} × 100 = {scoreInfo.score}</div>
          <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>NOT_EXECUTED phases excluded from numerator and denominator.</div>
        </div>
      </div>
    </Panel>
  );
}