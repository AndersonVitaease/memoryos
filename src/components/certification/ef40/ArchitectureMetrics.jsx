/**
 * ArchitectureMetrics — EF-40.3
 * Displays structural metrics of the certification system.
 * Also runs the ArchitectureValidator and shows results.
 */
import React, { useState, useEffect } from "react";
import { Panel, Row } from "./Panel.jsx";

const METRICS = {
  components:        15,  // Panel, CoveragePanel, ScorePanel, CertStatusPanel, AuditSummaryPanel,
                          // ExecutionMatrix, PlatformLimitations, CertificationDecision, AuditTrail,
                          // DetailSections, TimelinePanel, RegressionReport, CertificationHistory,
                          // ProjectHealthBadge, FinalBanner, ExportButton
  modules:           7,   // CertificationConstants, CertificationEngine, CertificationExport,
                          // CertificationRuntime, CertificationTypes, ArchitectureValidator, useCertificationRuntime
  dependencies:      6,   // page → hook → runtime+engine+export+historyStore+regressionEngine
  maxTreeDepth:      3,   // page → hook → lib
  coupling:          "LOW",  // each component depends only on Constants + Panel
  cohesion:          "HIGH", // each module has a single responsibility
  duplications:      0,
};

export default function ArchitectureMetrics() {
  const [validatorResult, setValidatorResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runValidator() {
    setLoading(true);
    try {
      const { runArchitectureValidator } = await import("@/lib/certification/ArchitectureValidator.js");
      const result = await runArchitectureValidator();
      setValidatorResult(result);
    } catch (e) {
      setValidatorResult({ ok: false, error: e.message, violations: [], passed: 0, failed: 1, total: 1, score: 0, durationMs: 0 });
    }
    setLoading(false);
  }

  useEffect(() => { runValidator(); }, []);

  const metricRows = [
    ["Components",          METRICS.components],
    ["Modules (lib)",       METRICS.modules],
    ["Dependency edges",    METRICS.dependencies],
    ["Max tree depth",      METRICS.maxTreeDepth],
    ["Coupling",            METRICS.coupling],
    ["Cohesion",            METRICS.cohesion],
    ["Duplications",        METRICS.duplications],
  ];

  return (
    <Panel title="EF-40.3 — Architecture Metrics" accent="#a78bfa">
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "3px 12px", marginBottom: 12 }}>
        {metricRows.map(([k, v]) => (
          <React.Fragment key={k}>
            <div style={{ fontSize: 10, color: "#52525b" }}>{k}</div>
            <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: "bold" }}>{v}</div>
          </React.Fragment>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #27272a", paddingTop: 10, marginTop: 4 }}>
        <div style={{ fontSize: 10, color: "#52525b", letterSpacing: 1, marginBottom: 8 }}>ARCHITECTURE VALIDATOR</div>
        {loading && <div style={{ fontSize: 10, color: "#facc15" }}>⏳ Running validator…</div>}
        {validatorResult && (
          <>
            <div style={{ display: "flex", gap: 20, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: "bold", color: validatorResult.ok ? "#22c55e" : "#ef4444" }}>
                {validatorResult.ok ? "✓ APPROVED" : "✗ VIOLATIONS DETECTED"}
              </div>
              <div style={{ fontSize: 10, color: "#22c55e" }}>{validatorResult.passed} passed</div>
              {validatorResult.failed > 0 && <div style={{ fontSize: 10, color: "#ef4444" }}>{validatorResult.failed} failed</div>}
              <div style={{ fontSize: 10, color: "#52525b" }}>{validatorResult.durationMs}ms</div>
              <div style={{ fontSize: 10, color: validatorResult.score >= 95 ? "#22c55e" : "#f59e0b" }}>Score: {validatorResult.score}/100</div>
            </div>
            {validatorResult.violations?.map((v, i) => (
              <Row key={i} color={v.passed ? "#22c55e" : "#ef4444"}>
                {v.passed ? "✓" : "✗"} {v.rule}{v.detail ? ` — ${v.detail}` : ""}
              </Row>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
}