import React from "react";
import { Panel } from "./Panel.jsx";
import { CERT_CONFIG } from "@/lib/certification/CertificationConstants.js";

export default function TimelinePanel({ history, currentId }) {
  const sorted = [...(history ?? [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (sorted.length === 0) return null;
  return (
    <Panel title="Certification Timeline">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto", paddingBottom: 8 }}>
        {sorted.map((rec, i) => {
          const cfg       = CERT_CONFIG[rec.certificationStatus] ?? { color: "#52525b", icon: "?" };
          const isCurrent = rec.executionId === currentId;
          return (
            <div key={rec.executionId} style={{ display: "flex", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 100 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isCurrent ? cfg.color : "#27272a",
                  border: `2px solid ${cfg.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: isCurrent ? "#09090b" : cfg.color, fontWeight: "bold",
                }}>{cfg.icon}</div>
                <div style={{ fontSize: 9, color: isCurrent ? "#a78bfa" : "#52525b", marginTop: 4, textAlign: "center", maxWidth: 90, wordBreak: "break-all" }}>
                  {rec.executionId.slice(0, 6)}…
                </div>
                <div style={{ fontSize: 9, color: cfg.color, textAlign: "center" }}>{rec.certificationStatus.replace("_", "_\n")}</div>
                <div style={{ fontSize: 9, color: "#71717a", textAlign: "center" }}>Cov: {rec.coveragePct}%</div>
                <div style={{ fontSize: 9, color: rec.score >= 95 ? "#22c55e" : "#ef4444", textAlign: "center" }}>{rec.score}/100</div>
                <div style={{ fontSize: 9, color: "#52525b", textAlign: "center" }}>{rec.totalRuntimeMs}ms</div>
              </div>
              {i < sorted.length - 1 && (
                <div style={{ display: "flex", alignItems: "center", paddingTop: 15 }}>
                  <div style={{ width: 30, height: 2, background: "#27272a" }} />
                  <div style={{ fontSize: 10, color: "#52525b" }}>▶</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}