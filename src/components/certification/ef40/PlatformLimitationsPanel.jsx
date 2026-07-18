import React from "react";
import { Panel } from "./Panel.jsx";

export default function PlatformLimitationsPanel({ coverage }) {
  return (
    <Panel title="Platform Limitations" accent="#f59e0b">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: "bold", marginBottom: 4 }}>Vite ?raw Module Evaluation Collision</div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "3px 12px" }}>
          {[
            ["Impact",          "SOURCE AUDIT, AST AUDIT"],
            ["Affected Phases", coverage.notExecuted.join(", ") || "None"],
            ["Severity",        "Medium"],
            ["Root Cause",      "Static top-level ?raw imports (e.g. MemoryStore.ts?raw) share module IDs with normal chunks loaded by ArchitecturalAuditor. Vite cannot resolve both variants in the same JS context. Error fires at ES module link phase — uncatchable by try/catch."],
            ["Workaround",      "Implemented — both auditors execute correctly at /ef393-certification (isolated lazy route without ArchitecturalAuditor)."],
            ["Mitigation",      "Isolated execution at /ef393-certification"],
            ["Status",          "Known limitation, documented as project dead-end. No fix path identified without restructuring Vite config."],
          ].map(([k, v]) => (
            <React.Fragment key={k}>
              <div style={{ fontSize: 9, color: "#52525b" }}>{k}</div>
              <div style={{ fontSize: 10, color: "#a1a1aa" }}>{v}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </Panel>
  );
}