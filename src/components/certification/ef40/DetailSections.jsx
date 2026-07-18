import React from "react";
import { Panel, Row } from "./Panel.jsx";

export default function DetailSections({ phases }) {
  return (
    <>
      {phases.TESTS?.data && (
        <Panel title={`Tests — ${phases.TESTS.data.passed}/${phases.TESTS.data.total} passed`}>
          {phases.TESTS.data.results?.filter(r => !r.passed).length === 0
            ? <Row color="#22c55e">✓ All {phases.TESTS.data.total} tests passed</Row>
            : phases.TESTS.data.results?.filter(r => !r.passed).map((r, i) => <Row key={i} color="#ef4444">✗ [{r.suite}] {r.name}: {r.error}</Row>)
          }
        </Panel>
      )}
      {phases.SOLID?.data?.checks && (
        <Panel title="SOLID Audit">
          {phases.SOLID.data.checks.map((c, i) => (
            <Row key={i} color={c.verdict === "PASS" ? "#22c55e" : c.verdict === "WARNING" ? "#f59e0b" : "#ef4444"}>
              {c.verdict === "PASS" ? "✓" : c.verdict === "WARNING" ? "⚠" : "✗"} {c.principle} — {c.rationale}
            </Row>
          ))}
        </Panel>
      )}
      {phases.ARCHITECTURE?.data?.integrity?.checks && (
        <Panel title={`Integrity — ${phases.ARCHITECTURE.data.integrity.passed}/${phases.ARCHITECTURE.data.integrity.passed + phases.ARCHITECTURE.data.integrity.failed}`}>
          {phases.ARCHITECTURE.data.integrity.checks.filter(c => !c.ok).map((c, i) => <Row key={i} color="#ef4444">✗ {c.check}: {c.detail}</Row>)}
          {phases.ARCHITECTURE.data.integrity.failed === 0 && <Row color="#22c55e">✓ All {phases.ARCHITECTURE.data.integrity.passed} integrity checks passed</Row>}
        </Panel>
      )}
      {phases.PERFORMANCE?.data?.benchmarks && (
        <Panel title="Performance Benchmarks">
          {phases.PERFORMANCE.data.benchmarks.map((b, i) => (
            <div key={i} style={{ fontSize: 10, color: "#a1a1aa", marginBottom: 2 }}>
              <span style={{ color: "#e4e4e7", minWidth: 180, display: "inline-block" }}>{b.operation}</span>
              avg:{b.avgMs}ms{"  "}p95:{b.p95Ms}ms{"  "}{b.opsPerSec?.toLocaleString()}ops/s
            </div>
          ))}
        </Panel>
      )}
      {phases.STRUCTURAL?.data && (
        <Panel title={`Structural Audit — ${phases.STRUCTURAL.data.passed}/${phases.STRUCTURAL.data.passed + phases.STRUCTURAL.data.failed}`}>
          {phases.STRUCTURAL.data.checks?.filter(c => !c.ok).map((c, i) => <Row key={i} color="#ef4444">✗ {c.check}: {c.detail}</Row>)}
          {phases.STRUCTURAL.data.failed === 0 && <Row color="#22c55e">✓ All {phases.STRUCTURAL.data.passed} structural checks passed</Row>}
        </Panel>
      )}
    </>
  );
}