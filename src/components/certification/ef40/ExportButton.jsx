import React from "react";

export default function ExportButton({ payload }) {
  function handleExport() {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `audit-report-${payload.executionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button onClick={handleExport} style={{
      background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6,
      padding: "8px 20px", fontSize: 11, fontFamily: "monospace", cursor: "pointer",
      fontWeight: "bold", letterSpacing: 0.5,
    }}>
      ↓ EXPORT AUDIT REPORT (JSON)
    </button>
  );
}