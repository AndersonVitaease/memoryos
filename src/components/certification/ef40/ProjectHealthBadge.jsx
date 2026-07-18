import React from "react";
import { computeProjectHealth } from "@/lib/certification-history/RegressionEngine";

const LABELS = {
  EXCELLENT: "All metrics healthy, no regressions.",
  GOOD:      "Score healthy, no recent regressions.",
  WARNING:   "Recent regressions or incomplete coverage.",
  CRITICAL:  "Failures or severe regressions detected.",
  UNKNOWN:   "No history available yet.",
};

export default function ProjectHealthBadge({ history }) {
  const health = computeProjectHealth(history);
  return (
    <div style={{ background: "#18181b", border: `2px solid ${health.color}`, borderRadius: 8, padding: "10px 18px", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 14 }}>
      <div>
        <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 1.5 }}>PROJECT HEALTH</div>
        <div style={{ fontSize: 20, fontWeight: "bold", color: health.color }}>{health.label}</div>
      </div>
      <div style={{ fontSize: 10, color: "#71717a", maxWidth: 300 }}>{LABELS[health.label]}</div>
    </div>
  );
}