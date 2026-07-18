import React from "react";
import { Panel } from "./Panel.jsx";

export default function AuditTrailPanel({ trail, execAt, totalMs }) {
  return (
    <Panel title="Audit Trail — chronological execution record">
      <div style={{ display: "grid", gridTemplateColumns: "160px 80px 110px 1fr", gap: "2px 10px" }}>
        {["TIMESTAMP", "ELAPSED", "STATUS", "EVENT"].map(h => (
          <div key={h} style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, borderBottom: "1px solid #27272a", paddingBottom: 3, marginBottom: 3 }}>{h}</div>
        ))}
        {trail.map((item, i) => {
          const color = item.status === "PASS" ? "#22c55e" : item.status === "FAIL" ? "#ef4444" : item.status === "NOT_EXECUTED" ? "#f59e0b" : "#71717a";
          return (
            <React.Fragment key={i}>
              <div style={{ fontSize: 9, color: "#52525b" }}>{new Date(item.ts).toISOString().split("T")[1].split(".")[0]}.{String(new Date(item.ts).getMilliseconds()).padStart(3,"0")}</div>
              <div style={{ fontSize: 9, color: "#52525b" }}>{item.elapsed > 0 ? `+${item.elapsed}ms` : "—"}</div>
              <div style={{ fontSize: 9, color, fontWeight: "bold" }}>{item.status}</div>
              <div style={{ fontSize: 9, color: "#a1a1aa" }}>{item.event}{item.detail ? ` — ${item.detail}` : ""}</div>
            </React.Fragment>
          );
        })}
        <div style={{ fontSize: 9, color: "#52525b" }}>{new Date(new Date(execAt).getTime() + totalMs).toISOString().split("T")[1].split(".")[0]}</div>
        <div style={{ fontSize: 9, color: "#52525b" }}>+{totalMs}ms</div>
        <div style={{ fontSize: 9, color: "#22c55e", fontWeight: "bold" }}>COMPLETE</div>
        <div style={{ fontSize: 9, color: "#a1a1aa" }}>Audit completed — total runtime {totalMs}ms</div>
      </div>
    </Panel>
  );
}