/**
 * EF-40.2 — CERTIFICATION HISTORY & REGRESSION ENGINE
 * Adds: CertificationHistoryStore, RegressionEngine, History panel,
 *       Regression Report, Timeline, Compare With Previous, Project Health.
 *
 * EF-40.0 / EF-40.1 rules are UNCHANGED.
 */
import React, { useState, useEffect, useRef } from "react";
import { CertificationHistoryStore } from "@/lib/certification-history/CertificationHistoryStore";
import { runRegressionEngine, computeProjectHealth } from "@/lib/certification-history/RegressionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (EF-40.0 — UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
const STATUS = { PASS: "PASS", FAIL: "FAIL", NOT_EXECUTED: "NOT_EXECUTED" };
const ALL_PHASES = ["TESTS","ARCHITECTURE","SOLID","IMMUTABILITY","PERFORMANCE","STRUCTURAL","SOURCE","AST"];
const TOTAL_PHASES = ALL_PHASES.length;
const MIN_SCORE = 95;
const STATUS_COLOR = { PASS: "#22c55e", FAIL: "#ef4444", NOT_EXECUTED: "#f59e0b" };
const STATUS_BG    = { PASS: "#052e16", FAIL: "#450a0a", NOT_EXECUTED: "#422006" };
const STATUS_LABEL = { PASS: "PASS",    FAIL: "FAIL",    NOT_EXECUTED: "NOT EXECUTED" };
const STATUS_ICON  = { PASS: "✓",       FAIL: "✗",       NOT_EXECUTED: "⊘" };
const CERT_STATUS  = { CERTIFIED: "CERTIFIED", PARTIALLY_CERTIFIED: "PARTIALLY_CERTIFIED", NOT_CERTIFIED: "NOT_CERTIFIED" };

// ── EF-40.1 additions ─────────────────────────────────────────────────────────
const EVIDENCE_LABEL = {
  PASS:         "RUNTIME VERIFIED",
  FAIL:         "FAILED",
  NOT_EXECUTED: "DOCUMENTED LIMITATION",
};
const EVIDENCE_COLOR = {
  PASS:         "#22c55e",
  FAIL:         "#ef4444",
  NOT_EXECUTED: "#f59e0b",
};

const SOURCE_OF_TRUTH = {
  TESTS:        "MemoryStoreTests",
  ARCHITECTURE: "ArchitecturalAuditor",
  SOLID:        "ArchitecturalAuditor / SOLIDAuditor",
  IMMUTABILITY: "ArchitecturalAuditor / ImmutabilityAuditor",
  PERFORMANCE:  "ArchitecturalAuditor / PerformanceBenchmarkEngine",
  STRUCTURAL:   "SourceAuditStructural",
  SOURCE:       "SourceAudit (isolated at /ef393-certification)",
  AST:          "ASTAuditor (isolated at /ef393-certification)",
};

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure computation (EF-40.0 — UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
function computeCoverage(phases) {
  const executed    = ALL_PHASES.filter(k => phases[k]?.status !== STATUS.NOT_EXECUTED);
  const notExecuted = ALL_PHASES.filter(k => phases[k]?.status === STATUS.NOT_EXECUTED);
  const coveragePct = Math.round((executed.length / TOTAL_PHASES) * 100);
  return { executed, notExecuted, total: TOTAL_PHASES, coveragePct };
}

function computeScore(phases) {
  const executed = ALL_PHASES.filter(k => phases[k]?.status !== STATUS.NOT_EXECUTED);
  const passed   = executed.filter(k => phases[k]?.status === STATUS.PASS);
  const failed   = executed.filter(k => phases[k]?.status === STATUS.FAIL);
  const score    = executed.length > 0 ? Math.round((passed.length / executed.length) * 100) : 0;
  const grade    = score >= 97 ? "A+" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade, executedCount: executed.length, passedCount: passed.length, failedCount: failed.length, passed, failed, executed };
}

function computeCertStatus(coverage, scoreInfo) {
  const hasNotExecuted = coverage.notExecuted.length > 0;
  const hasFail        = scoreInfo.failedCount > 0;
  if (hasFail)                         return CERT_STATUS.NOT_CERTIFIED;
  if (hasNotExecuted)                  return CERT_STATUS.PARTIALLY_CERTIFIED;
  if (scoreInfo.score >= MIN_SCORE)    return CERT_STATUS.CERTIFIED;
  return CERT_STATUS.NOT_CERTIFIED;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Audit Orchestrator (EF-40.0 — UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
async function runPhaseTests(addTrail) {
  const ts = Date.now();
  addTrail({ event: "TESTS start", ts, elapsed: 0, status: "running" });
  const t0 = performance.now();
  try {
    const { runMemoryStoreTests } = await import("@/lib/knowledge-store/memory/MemoryStoreTests");
    const r  = await runMemoryStoreTests();
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "TESTS end", ts: Date.now(), elapsed: ms, status: r.certified ? "PASS" : "FAIL", detail: `${r.passed}/${r.total} passed` });
    return { status: r.certified ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.certified ? null : `${r.failed} test(s) failed`, durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "TESTS error", ts: Date.now(), elapsed: ms, status: "FAIL", detail: err?.message });
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

async function runPhaseArchitecture(addTrail) {
  addTrail({ event: "ARCHITECTURE start", ts: Date.now(), elapsed: 0, status: "running" });
  const t0 = performance.now();
  try {
    const { runFullAudit } = await import("@/lib/knowledge-store/auditor/ArchitecturalAuditor");
    const r  = await runFullAudit();
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "ARCHITECTURE end", ts: Date.now(), elapsed: ms, status: r.allPassed ? "PASS" : "FAIL", detail: `integrity:${r.integrity.passed}/${r.integrity.passed+r.integrity.failed}` });
    return { status: r.allPassed ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.allPassed ? null : "One or more architectural checks failed", durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "ARCHITECTURE error", ts: Date.now(), elapsed: ms, status: "FAIL", detail: err?.message });
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

async function runPhaseStructural(addTrail) {
  addTrail({ event: "STRUCTURAL start", ts: Date.now(), elapsed: 0, status: "running" });
  const t0 = performance.now();
  try {
    const { runStructuralAudit } = await import("@/lib/knowledge-store/auditor/SourceAuditStructural");
    const r  = await runStructuralAudit();
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "STRUCTURAL end", ts: Date.now(), elapsed: ms, status: r.ok ? "PASS" : "FAIL", detail: `${r.passed}/${r.passed+r.failed}` });
    return { status: r.ok ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.ok ? null : `${r.failed} check(s) failed`, durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addTrail({ event: "STRUCTURAL error", ts: Date.now(), elapsed: ms, status: "FAIL", detail: err?.message });
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

function runPhaseSource(addTrail) {
  addTrail({ event: "SOURCE", ts: Date.now(), elapsed: 0, status: "NOT_EXECUTED", detail: "Vite ?raw collision — documented limitation" });
  return { status: STATUS.NOT_EXECUTED, data: null, reason: "Static top-level ?raw imports collide with ArchitecturalAuditor normal chunks. ES module link error — uncatchable. Runs correctly at /ef393-certification.", durationMs: 0 };
}

function runPhaseAST(addTrail) {
  addTrail({ event: "AST", ts: Date.now(), elapsed: 0, status: "NOT_EXECUTED", detail: "Same root cause as SOURCE" });
  return { status: STATUS.NOT_EXECUTED, data: null, reason: "Same root cause as SOURCE AUDIT. Runs correctly at /ef393-certification.", durationMs: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────────────
function Panel({ title, children, accent = "#27272a" }) {
  return (
    <div style={{ background: "#18181b", border: `1px solid ${accent}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: "#52525b", letterSpacing: 1.5, marginBottom: 10, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children, color = "#a1a1aa" }) {
  return <div style={{ fontSize: 10, color, marginBottom: 3, lineHeight: 1.5 }}>{children}</div>;
}
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: "bold", color }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#52525b" }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EF-40.0 panels (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
function CoveragePanel({ coverage }) {
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

function ScorePanel({ scoreInfo }) {
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

const CERT_CONFIG = {
  CERTIFIED:           { color: "#22c55e", bg: "#052e16", icon: "✓", label: "CERTIFIED" },
  PARTIALLY_CERTIFIED: { color: "#f59e0b", bg: "#422006", icon: "⊘", label: "PARTIALLY CERTIFIED" },
  NOT_CERTIFIED:       { color: "#ef4444", bg: "#450a0a", icon: "✗", label: "NOT CERTIFIED" },
};

function CertStatusPanel({ certStatus, coverage, scoreInfo }) {
  const cfg = CERT_CONFIG[certStatus];
  const rules = {
    CERTIFIED:           `All ${coverage.total} phases executed. Score ${scoreInfo.score} >= ${MIN_SCORE} minimum. No failures.`,
    PARTIALLY_CERTIFIED: `${coverage.notExecuted.length} phase(s) NOT_EXECUTED: ${coverage.notExecuted.join(", ")}. Certification score is based only on executed phases. Execution coverage remains incomplete.`,
    NOT_CERTIFIED:       `${scoreInfo.failedCount} phase(s) failed: ${scoreInfo.failed.join(", ")}. All executed phases must pass.`,
  };
  return (
    <Panel title="C — Certification Status" accent={cfg.color}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ background: cfg.bg, border: `2px solid ${cfg.color}`, borderRadius: 8, padding: "8px 20px" }}>
          <div style={{ fontSize: 24, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>
        </div>
        <div style={{ fontSize: 10, color: "#a1a1aa", maxWidth: 480, lineHeight: 1.6 }}>{rules[certStatus]}</div>
      </div>
    </Panel>
  );
}

// ── EF-40.1: Enhanced Execution Matrix with Evidence + Source of Truth ────────
function matrixNote(name, phase) {
  if (!phase) return "Phase not registered";
  const s = phase.status;
  if (s === STATUS.NOT_EXECUTED) return phase.reason?.split(".")[0] ?? "Not executed";
  if (s === STATUS.FAIL)         return phase.reason ?? "Failed";
  const d = phase.data;
  if (!d) return "Passed";
  if (name === "TESTS")        return `${d.passed}/${d.total} tests passed`;
  if (name === "ARCHITECTURE") return `integrity:${d.integrity.passed}/${d.integrity.passed+d.integrity.failed} immutability:${d.immutability.passed}/${d.immutability.passed+d.immutability.failed} solid:${d.solid.ok}`;
  if (name === "SOLID")        return d.checks?.map(c => `${c.principle}:${c.verdict}`).join(" · ") ?? "Passed";
  if (name === "IMMUTABILITY") return `${d.passed}/${d.passed+d.failed} checks`;
  if (name === "PERFORMANCE")  return `${d.benchmarks?.length}/8 benchmarks`;
  if (name === "STRUCTURAL")   return `${d.passed}/${d.passed+d.failed} checks`;
  return "Passed";
}

function ExecutionMatrix({ phases }) {
  const headers = ["PHASE", "STATUS", "TIME", "EVIDENCE", "SOURCE OF TRUTH", "RESULT"];
  const cols = "120px 105px 60px 140px 220px 1fr";
  return (
    <Panel title="Execution Matrix — all declared phases (EF-40.1 enhanced)">
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: "2px 10px", alignItems: "start", overflowX: "auto" }}>
        {headers.map(h => (
          <div key={h} style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, borderBottom: "1px solid #27272a", paddingBottom: 4, marginBottom: 4 }}>{h}</div>
        ))}
        {ALL_PHASES.map(name => {
          const phase   = phases[name];
          const s       = phase?.status ?? STATUS.NOT_EXECUTED;
          const sColor  = STATUS_COLOR[s];
          const evColor = EVIDENCE_COLOR[s] ?? "#71717a";
          const evLabel = EVIDENCE_LABEL[s] ?? "UNKNOWN";
          return (
            <React.Fragment key={name}>
              <div style={{ fontSize: 10, color: "#e4e4e7", fontWeight: "bold", paddingTop: 4 }}>{name}</div>
              <div style={{ fontSize: 10, color: sColor, fontWeight: "bold", paddingTop: 4 }}>{STATUS_ICON[s]} {STATUS_LABEL[s]}</div>
              <div style={{ fontSize: 9, color: "#71717a", paddingTop: 5 }}>{phase?.durationMs > 0 ? `${phase.durationMs}ms` : "—"}</div>
              <div style={{ fontSize: 9, color: evColor, fontWeight: "bold", paddingTop: 5 }}>{evLabel}</div>
              <div style={{ fontSize: 9, color: "#818cf8", paddingTop: 5 }}>{SOURCE_OF_TRUTH[name] ?? "—"}</div>
              <div style={{ fontSize: 9, color: s === STATUS.NOT_EXECUTED ? "#f59e0b" : s === STATUS.FAIL ? "#ef4444" : "#a1a1aa", paddingTop: 5 }}>{matrixNote(name, phase)}</div>
            </React.Fragment>
          );
        })}
      </div>
    </Panel>
  );
}

// ── EF-40.1: Audit Summary ────────────────────────────────────────────────────
function AuditSummaryPanel({ execId, execAt, totalMs, coverage, scoreInfo, certStatus }) {
  const cfg = CERT_CONFIG[certStatus];
  const rows = [
    ["Execution ID",       execId,                                          "#a78bfa"],
    ["Timestamp",          execAt,                                          "#71717a"],
    ["Total Runtime",      `${totalMs}ms`,                                  "#71717a"],
    ["Coverage",           `${coverage.coveragePct}% (${coverage.executed.length}/${coverage.total})`, coverage.coveragePct === 100 ? "#22c55e" : "#f59e0b"],
    ["Certification Score",`${scoreInfo.score}/100 — Grade ${scoreInfo.grade}`, scoreInfo.score >= 95 ? "#22c55e" : "#ef4444"],
    ["Certification Status",`${CERT_CONFIG[certStatus]?.icon} ${CERT_CONFIG[certStatus]?.label}`, cfg.color],
    ["Executed Phases",    `${coverage.executed.join(", ")}`,               "#22c55e"],
    ["Not Executed Phases", coverage.notExecuted.length > 0 ? coverage.notExecuted.join(", ") : "None", coverage.notExecuted.length > 0 ? "#f59e0b" : "#22c55e"],
    ["Platform Limitations","Vite ?raw module collision (SOURCE, AST)",     "#f59e0b"],
  ];
  return (
    <Panel title="Audit Summary">
      {rows.map(([label, value, color]) => (
        <div key={label} style={{ display: "flex", gap: 16, marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: "#52525b", minWidth: 160 }}>{label}</div>
          <div style={{ fontSize: 10, color: color ?? "#a1a1aa", fontFamily: "monospace", wordBreak: "break-all" }}>{value}</div>
        </div>
      ))}
    </Panel>
  );
}

// ── EF-40.1: Platform Limitations ────────────────────────────────────────────
function PlatformLimitationsPanel({ coverage }) {
  return (
    <Panel title="Platform Limitations" accent="#f59e0b">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: "bold", marginBottom: 4 }}>Vite ?raw Module Evaluation Collision</div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "3px 12px" }}>
          {[
            ["Impact",       "SOURCE AUDIT, AST AUDIT"],
            ["Affected Phases", coverage.notExecuted.join(", ") || "None"],
            ["Severity",     "Medium"],
            ["Root Cause",   "Static top-level ?raw imports (e.g. MemoryStore.ts?raw) share module IDs with normal chunks loaded by ArchitecturalAuditor. Vite cannot resolve both variants in the same JS context. Error fires at ES module link phase — uncatchable by try/catch."],
            ["Workaround",   "Implemented — both auditors execute correctly at /ef393-certification (isolated lazy route without ArchitecturalAuditor)."],
            ["Mitigation",   "Isolated execution at /ef393-certification"],
            ["Status",       "Known limitation, documented as project dead-end. No fix path identified without restructuring Vite config."],
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

// ── EF-40.1: Certification Decision ──────────────────────────────────────────
function CertificationDecisionPanel({ certStatus, coverage, scoreInfo }) {
  const cfg = CERT_CONFIG[certStatus];
  const lines = {
    CERTIFIED: [
      `All ${TOTAL_PHASES} declared phases were executed.`,
      `No phase failed.`,
      `Certification Score: ${scoreInfo.score}/100 (>= ${MIN_SCORE} minimum required).`,
      `Execution Coverage: 100%.`,
      `Decision: CERTIFIED.`,
    ],
    PARTIALLY_CERTIFIED: [
      `${scoreInfo.executedCount} of ${TOTAL_PHASES} phases were executed successfully.`,
      `${coverage.notExecuted.length} phase(s) could not be executed: ${coverage.notExecuted.join(", ")}.`,
      `Reason for non-execution: documented platform limitation (Vite ?raw module collision).`,
      `No executed phase failed.`,
      `Certification Score (executed phases only): ${scoreInfo.score}/100 — Grade ${scoreInfo.grade}.`,
      `Execution Coverage: ${coverage.coveragePct}% — incomplete.`,
      `Decision: PARTIALLY CERTIFIED — certification score reflects executed phases only; coverage remains incomplete.`,
    ],
    NOT_CERTIFIED: [
      `${scoreInfo.failedCount} executed phase(s) failed: ${scoreInfo.failed.join(", ")}.`,
      `A certification requires all executed phases to pass.`,
      `Decision: NOT CERTIFIED.`,
    ],
  };
  return (
    <Panel title="Certification Decision" accent={cfg.color}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div style={{ background: cfg.bg, border: `2px solid ${cfg.color}`, borderRadius: 6, padding: "4px 14px" }}>
          <div style={{ fontSize: 16, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>
        </div>
      </div>
      {lines[certStatus]?.map((line, i) => (
        <Row key={i} color={i === lines[certStatus].length - 1 ? cfg.color : "#a1a1aa"}>{line}</Row>
      ))}
    </Panel>
  );
}

// ── EF-40.1: Audit Trail ─────────────────────────────────────────────────────
function AuditTrailPanel({ trail, execAt, totalMs }) {
  const t0 = new Date(execAt).getTime();
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

// ── EF-40.1: Detail sections (EF-40.0 UNCHANGED) ─────────────────────────────
function DetailSections({ phases }) {
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

// ── EF-40.0 Final banner (UNCHANGED) ─────────────────────────────────────────
function FinalBanner({ certStatus, coverage, scoreInfo, execAt, totalMs }) {
  const cfg = CERT_CONFIG[certStatus];
  return (
    <div style={{ border: `2px solid ${cfg.color}`, borderRadius: 12, padding: 24, textAlign: "center", background: cfg.bg, marginTop: 8 }}>
      <div style={{ fontSize: 26, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>
      {certStatus === CERT_STATUS.PARTIALLY_CERTIFIED && (
        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8 }}>
          Certification score is based only on executed phases.<br />Execution coverage remains incomplete.
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 16, flexWrap: "wrap" }}>
        <Stat label="Coverage"    value={`${coverage.coveragePct}%`}              sub={`${coverage.executed.length}/${coverage.total} phases`} color={coverage.coveragePct === 100 ? "#22c55e" : "#f59e0b"} />
        <Stat label="Score"       value={`${scoreInfo.score}/100`}                sub={`Grade ${scoreInfo.grade}`}                            color={scoreInfo.score >= 95 ? "#22c55e" : "#ef4444"} />
        <Stat label="Executed"    value={`${scoreInfo.executedCount}/${TOTAL_PHASES}`} sub="phases"                                         color="#a1a1aa" />
        <Stat label="Passed"      value={scoreInfo.passedCount}                   sub="phases"                                               color="#22c55e" />
        {scoreInfo.failedCount > 0 && <Stat label="Failed" value={scoreInfo.failedCount} sub="phases" color="#ef4444" />}
        {coverage.notExecuted.length > 0 && <Stat label="Not Executed" value={coverage.notExecuted.length} sub="phases" color="#f59e0b" />}
        <Stat label="Total Time"  value={`${totalMs}ms`}                          sub={execAt?.split("T")[1]?.split(".")[0] ?? ""}            color="#71717a" />
      </div>
    </div>
  );
}

// ── EF-40.2: Project Health indicator ────────────────────────────────────────
function ProjectHealthBadge({ history }) {
  const health = computeProjectHealth(history);
  const labels = {
    EXCELLENT: "All metrics healthy, no regressions.",
    GOOD:      "Score healthy, no recent regressions.",
    WARNING:   "Recent regressions or incomplete coverage.",
    CRITICAL:  "Failures or severe regressions detected.",
    UNKNOWN:   "No history available yet.",
  };
  return (
    <div style={{ background: "#18181b", border: `2px solid ${health.color}`, borderRadius: 8, padding: "10px 18px", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 14 }}>
      <div>
        <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 1.5 }}>PROJECT HEALTH</div>
        <div style={{ fontSize: 20, fontWeight: "bold", color: health.color }}>{health.label}</div>
      </div>
      <div style={{ fontSize: 10, color: "#71717a", maxWidth: 300 }}>{labels[health.label]}</div>
    </div>
  );
}

// ── EF-40.2: Certification History panel ──────────────────────────────────────
function CertificationHistoryPanel({ history, currentId }) {
  if (!history || history.length === 0) {
    return (
      <Panel title="Certification History">
        <div style={{ fontSize: 10, color: "#52525b" }}>No previous certifications found. This is the first run.</div>
      </Panel>
    );
  }
  const cols = "140px 155px 70px 70px 155px 80px 80px";
  const headers = ["EXECUTION ID", "TIMESTAMP", "COVERAGE", "SCORE", "STATUS", "RUNTIME", "TREND"];
  // compute trends
  const sorted = [...history].sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
  return (
    <Panel title={`Certification History — ${history.length} run(s)`}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: "2px 10px", minWidth: 900 }}>
          {headers.map(h => (
            <div key={h} style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, borderBottom: "1px solid #27272a", paddingBottom: 3, marginBottom: 3 }}>{h}</div>
          ))}
          {sorted.map((rec, i) => {
            const cfg      = CERT_CONFIG[rec.certificationStatus] ?? { color: "#71717a" };
            const isCurrent= rec.executionId === currentId;
            const prev     = i > 0 ? sorted[i - 1] : null;
            const reg      = prev ? runRegressionEngine(rec, prev) : null;
            const trend    = !reg ? "—" : reg.summary === "IMPROVED" ? "↑ IMPROVED" : reg.summary === "REGRESSED" ? "↓ REGRESSED" : reg.summary === "MIXED" ? "~ MIXED" : "= NO CHANGE";
            const trendClr = !reg ? "#52525b" : reg.summary === "IMPROVED" ? "#22c55e" : reg.summary === "REGRESSED" ? "#ef4444" : "#f59e0b";
            return (
              <React.Fragment key={rec.executionId}>
                <div style={{ fontSize: 9, color: isCurrent ? "#a78bfa" : "#71717a", fontWeight: isCurrent ? "bold" : "normal" }}>{rec.executionId.slice(0,8)}…{isCurrent ? " ◀ current" : ""}</div>
                <div style={{ fontSize: 9, color: "#52525b" }}>{new Date(rec.timestamp).toLocaleString()}</div>
                <div style={{ fontSize: 9, color: rec.coveragePct === 100 ? "#22c55e" : "#f59e0b" }}>{rec.coveragePct}%</div>
                <div style={{ fontSize: 9, color: rec.score >= 95 ? "#22c55e" : "#ef4444" }}>{rec.score}/100 {rec.grade}</div>
                <div style={{ fontSize: 9, color: cfg.color }}>{cfg.icon ?? ""} {rec.certificationStatus}</div>
                <div style={{ fontSize: 9, color: "#71717a" }}>{rec.totalRuntimeMs}ms</div>
                <div style={{ fontSize: 9, color: trendClr, fontWeight: "bold" }}>{trend}</div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ── EF-40.2: Regression Report panel ─────────────────────────────────────────
const CHANGE_COLOR = { IMPROVEMENT: "#22c55e", REGRESSION: "#ef4444", NO_CHANGE: "#52525b" };
const CHANGE_ICON  = { IMPROVEMENT: "↑", REGRESSION: "↓", NO_CHANGE: "=" };

function RegressionReportPanel({ regression }) {
  if (!regression) {
    return (
      <Panel title="Regression Report — Compare With Previous">
        <div style={{ fontSize: 10, color: "#52525b" }}>No previous execution to compare against.</div>
      </Panel>
    );
  }
  const summaryColor = regression.summary === "IMPROVED" ? "#22c55e" : regression.summary === "REGRESSED" ? "#ef4444" : regression.summary === "MIXED" ? "#f59e0b" : "#52525b";
  return (
    <Panel title={`Regression Report — vs execution ${regression.previousId?.slice(0,8)}…`} accent={summaryColor}>
      <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: "bold", color: summaryColor }}>{regression.summary}</div>
        <div style={{ fontSize: 10, color: "#22c55e" }}>↑ {regression.improvements} improvement(s)</div>
        <div style={{ fontSize: 10, color: "#ef4444" }}>↓ {regression.regressions} regression(s)</div>
        <div style={{ fontSize: 10, color: "#52525b" }}>= {regression.noChanges} no change</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "180px 110px 110px 100px 110px", gap: "2px 10px" }}>
        {["DIMENSION","PREVIOUS","CURRENT","DELTA","CHANGE"].map(h => (
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

// ── EF-40.2: Timeline ─────────────────────────────────────────────────────────
function TimelinePanel({ history, currentId }) {
  const sorted = [...(history ?? [])].sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
  if (sorted.length === 0) return null;
  return (
    <Panel title="Certification Timeline">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto", paddingBottom: 8 }}>
        {sorted.map((rec, i) => {
          const cfg       = CERT_CONFIG[rec.certificationStatus] ?? { color: "#52525b", icon: "?" };
          const isCurrent = rec.executionId === currentId;
          return (
            <div key={rec.executionId} style={{ display: "flex", alignItems: "flex-start" }}>
              {/* Node */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 100 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isCurrent ? cfg.color : "#27272a",
                  border: `2px solid ${cfg.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: isCurrent ? "#09090b" : cfg.color, fontWeight: "bold",
                }}>{cfg.icon}</div>
                <div style={{ fontSize: 9, color: isCurrent ? "#a78bfa" : "#52525b", marginTop: 4, textAlign: "center", maxWidth: 90, wordBreak: "break-all" }}>
                  {rec.executionId.slice(0,6)}…
                </div>
                <div style={{ fontSize: 9, color: cfg.color, textAlign: "center" }}>{rec.certificationStatus.replace("_","_\n")}</div>
                <div style={{ fontSize: 9, color: "#71717a", textAlign: "center" }}>Cov: {rec.coveragePct}%</div>
                <div style={{ fontSize: 9, color: rec.score >= 95 ? "#22c55e" : "#ef4444", textAlign: "center" }}>{rec.score}/100</div>
                <div style={{ fontSize: 9, color: "#52525b", textAlign: "center" }}>{rec.totalRuntimeMs}ms</div>
              </div>
              {/* Connector */}
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

// ── EF-40.1: Export button (EF-40.2: extended payload) ───────────────────────
function buildExportPayload({ execId, execAt, totalMs, coverage, scoreInfo, certStatus, phases, trail, regression, history }) {
  const matrix = ALL_PHASES.map(name => {
    const phase = phases[name];
    const s     = phase?.status ?? STATUS.NOT_EXECUTED;
    return {
      phase,
      status:        s,
      evidence:      EVIDENCE_LABEL[s] ?? "UNKNOWN",
      sourceOfTruth: SOURCE_OF_TRUTH[name],
      durationMs:    phase?.durationMs ?? 0,
      result:        matrixNote(name, phase),
    };
  });

  return {
    executionId:   execId,
    timestamp:     execAt,
    totalRuntimeMs: totalMs,
    coverage: {
      total:        coverage.total,
      executed:     coverage.executed.length,
      notExecuted:  coverage.notExecuted.length,
      coveragePct:  coverage.coveragePct,
      executedPhases:    coverage.executed,
      notExecutedPhases: coverage.notExecuted,
    },
    certificationScore: {
      score:         scoreInfo.score,
      grade:         scoreInfo.grade,
      executedCount: scoreInfo.executedCount,
      passedCount:   scoreInfo.passedCount,
      failedCount:   scoreInfo.failedCount,
      formula:       `${scoreInfo.passedCount} / ${scoreInfo.executedCount} × 100 = ${scoreInfo.score}`,
    },
    certificationStatus: certStatus,
    executionMatrix: matrix,
    auditTrail: trail,
    platformLimitations: [{
      id:        "VITE_RAW_COLLISION",
      title:     "Vite ?raw Module Evaluation Collision",
      impact:    ["SOURCE","AST"],
      severity:  "Medium",
      workaround:"Implemented — isolated execution at /ef393-certification",
      resolved:  false,
    }],
    certificationDecision: {
      status: certStatus,
      minScoreRequired: MIN_SCORE,
      scoreAchieved:    scoreInfo.score,
      coverageAchieved: coverage.coveragePct,
      notExecutedReason: coverage.notExecuted.length > 0 ? "Documented platform limitation: Vite ?raw module collision" : null,
    },
    // EF-40.2 additions
    previousExecution: regression ? { executionId: regression.previousId } : null,
    regressionReport:  regression ?? null,
    historyIndex:      history ? history.findIndex(h => h.executionId === execId) : -1,
    trend:             regression ? regression.summary : "NO_HISTORY",
  };
}

function ExportButton({ payload }) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function EF398CertPage() {
  const [runStatus,  setRunStatus]  = useState("idle");
  const [phases,     setPhases]     = useState({});
  const [coverage,   setCoverage]   = useState(null);
  const [scoreInfo,  setScoreInfo]  = useState(null);
  const [certStatus, setCertStatus] = useState(null);
  const [log,        setLog]        = useState([]);
  const [trail,      setTrail]      = useState([]);
  const [totalMs,    setTotalMs]    = useState(null);
  const [execAt,     setExecAt]     = useState(null);
  const [execId,     setExecId]     = useState(null);
  // EF-40.2
  const [history,    setHistory]    = useState([]);
  const [regression, setRegression] = useState(null);
  const startedRef = useRef(false);
  const trailRef   = useRef([]);

  function addLog(msg) {
    setLog(prev => [...prev, { t: performance.now().toFixed(1), msg }]);
  }
  function addTrail(item) {
    trailRef.current = [...trailRef.current, item];
    setTrail([...trailRef.current]);
  }

  async function run() {
    if (startedRef.current) return;
    startedRef.current = true;
    const id  = generateUUID();
    const now = new Date().toISOString();
    setExecId(id);
    setExecAt(now);
    setHistory(CertificationHistoryStore.getAll()); // load existing history on start
    setRunStatus("running");
    setLog([]);
    trailRef.current = [];
    setTrail([]);

    addTrail({ event: "Audit start", ts: Date.now(), elapsed: 0, status: "running", detail: `Execution ID: ${id}` });

    const wallStart = performance.now();

    try {
      addTrail({ event: "Singleton reset", ts: Date.now(), elapsed: 0, status: "running" });
      const { KnowledgeStoreMetrics }  = await import("@/lib/knowledge-store/KnowledgeStoreMetrics");
      KnowledgeStoreMetrics.reset();
      const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
      KnowledgeStoreEventBus.clear();
      addLog("Singletons reset OK");
      addTrail({ event: "Singleton reset", ts: Date.now(), elapsed: Math.round(performance.now() - wallStart), status: "PASS", detail: "KnowledgeStoreMetrics + KnowledgeStoreEventBus cleared" });
    } catch (e) {
      addLog(`Singleton reset warning: ${e?.message}`);
      addTrail({ event: "Singleton reset", ts: Date.now(), elapsed: 0, status: "FAIL", detail: e?.message });
    }

    const [testsPhase, archPhase] = await Promise.all([
      runPhaseTests(addTrail),
      runPhaseArchitecture(addTrail),
    ]);

    const structuralPhase = await runPhaseStructural(addTrail);
    const sourcePhase     = runPhaseSource(addTrail);
    const astPhase        = runPhaseAST(addTrail);

    const archData = archPhase.data;
    const solidPhase = archData
      ? { status: archData.solid.ok ? STATUS.PASS : STATUS.FAIL, data: archData.solid, reason: null, durationMs: Math.round(archData.solid.durationMs) }
      : { status: STATUS.FAIL, data: null, reason: "ArchitecturalAuditor failed", durationMs: 0 };
    const immutabilityPhase = archData
      ? { status: archData.immutability.ok ? STATUS.PASS : STATUS.FAIL, data: archData.immutability, reason: null, durationMs: Math.round(archData.immutability.durationMs) }
      : { status: STATUS.FAIL, data: null, reason: "ArchitecturalAuditor failed", durationMs: 0 };
    const perfPhase = archData
      ? { status: archData.performance.benchmarks.length === 8 ? STATUS.PASS : STATUS.FAIL, data: archData.performance, reason: null, durationMs: Math.round(archData.performance.durationMs) }
      : { status: STATUS.FAIL, data: null, reason: "ArchitecturalAuditor failed", durationMs: 0 };

    const allPhases = { TESTS: testsPhase, ARCHITECTURE: archPhase, SOLID: solidPhase, IMMUTABILITY: immutabilityPhase, PERFORMANCE: perfPhase, STRUCTURAL: structuralPhase, SOURCE: sourcePhase, AST: astPhase };

    const cov  = computeCoverage(allPhases);
    const sc   = computeScore(allPhases);
    const cert = computeCertStatus(cov, sc);
    const ms   = Math.round(performance.now() - wallStart);

    addTrail({ event: "Coverage computed",      ts: Date.now(), elapsed: ms, status: "PASS", detail: `${cov.coveragePct}% (${cov.executed.length}/${cov.total})` });
    addTrail({ event: "Score computed",         ts: Date.now(), elapsed: ms, status: "PASS", detail: `${sc.score}/100 ${sc.grade}` });
    addTrail({ event: "Certification decision", ts: Date.now(), elapsed: ms, status: cert,   detail: cert });
    addTrail({ event: "Audit end",              ts: Date.now(), elapsed: ms, status: "PASS", detail: `Total runtime: ${ms}ms` });

    setPhases(allPhases);
    setCoverage(cov);
    setScoreInfo(sc);
    setCertStatus(cert);
    setTotalMs(ms);
    setRunStatus("done");
    addLog(`COMPLETE — coverage:${cov.coveragePct}% score:${sc.score}/100 ${sc.grade} status:${cert} — ${ms}ms`);

    // EF-40.2: persist to history and compute regression
    const payload402 = buildExportPayload({ execId: id, execAt: now, totalMs: ms, coverage: cov, scoreInfo: sc, certStatus: cert, phases: allPhases, trail: trailRef.current, regression: null, history: [] });
    CertificationHistoryStore.save(payload402);
    const allHistory  = CertificationHistoryStore.getAll();
    const prevRecord  = CertificationHistoryStore.getPrevious(id);
    const currentRecord = CertificationHistoryStore.getByExecutionId(id);
    const reg = (currentRecord && prevRecord) ? runRegressionEngine(currentRecord, prevRecord) : null;
    setHistory(allHistory);
    setRegression(reg);
  }

  useEffect(() => { run(); }, []);

  const exportPayload = (coverage && scoreInfo && certStatus && execId)
    ? buildExportPayload({ execId, execAt, totalMs, coverage, scoreInfo, certStatus, phases, trail, regression, history })
    : null;

  return (
    <div style={{ background: "#09090b", color: "#e4e4e7", minHeight: "100vh", fontFamily: "monospace", padding: 24 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ fontSize: 17, fontWeight: "bold", color: "#a78bfa", marginBottom: 3 }}>
          EF-40.2 — CERTIFICATION HISTORY & REGRESSION ENGINE
        </div>
        <div style={{ fontSize: 10, color: "#52525b", marginBottom: 4 }}>
          Coverage = all {TOTAL_PHASES} declared phases · Score = executed phases only · Status = CERTIFIED / PARTIALLY CERTIFIED / NOT CERTIFIED
        </div>
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: execId ? 4 : 16 }}>
          Run status:{" "}
          <span style={{ color: runStatus === "done" ? "#22c55e" : runStatus === "error" ? "#ef4444" : "#facc15", fontWeight: "bold" }}>
            {runStatus.toUpperCase()}
          </span>
          {execAt && <span style={{ color: "#3f3f46", marginLeft: 12 }}>{execAt}</span>}
        </div>
        {execId && (
          <div style={{ fontSize: 10, color: "#52525b", marginBottom: 16 }}>
            Execution ID: <span style={{ color: "#a78bfa" }}>{execId}</span>
          </div>
        )}

        {/* Log */}
        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 160, overflowY: "auto" }}>
          <div style={{ fontSize: 9, color: "#3f3f46", marginBottom: 6, letterSpacing: 1 }}>EXECUTION LOG</div>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 10, marginBottom: 1 }}>
              <span style={{ color: "#27272a" }}>[{l.t}ms] </span>
              <span style={{ color: l.msg.includes("FAIL") || l.msg.includes("ERROR") ? "#ef4444" : l.msg.includes("DONE") || l.msg.includes("COMPLETE") || l.msg.includes("OK") ? "#22c55e" : l.msg.includes("NOT_EXECUTED") ? "#f59e0b" : "#71717a" }}>
                {l.msg}
              </span>
            </div>
          ))}
          {runStatus === "running" && <div style={{ color: "#facc15", fontSize: 10 }}>⏳ Running…</div>}
        </div>

        {coverage && scoreInfo && certStatus && (
          <>
            {/* Legend */}
            <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
              {Object.entries(STATUS_LABEL).map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                  <span style={{ color: STATUS_COLOR[k], fontWeight: "bold" }}>{STATUS_ICON[k]}</span>
                  <span style={{ color: STATUS_COLOR[k] }}>{label}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <span style={{ color: "#22c55e", fontWeight: "bold" }}>R</span>
                <span style={{ color: "#22c55e" }}>RUNTIME VERIFIED</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <span style={{ color: "#f59e0b", fontWeight: "bold" }}>L</span>
                <span style={{ color: "#f59e0b" }}>DOCUMENTED LIMITATION</span>
              </div>
            </div>

            {/* EF-40.2: Project Health + action buttons */}
            <ProjectHealthBadge history={history} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {exportPayload && <ExportButton payload={exportPayload} />}
              {regression && (
                <button onClick={() => document.getElementById("regression-report")?.scrollIntoView({ behavior: "smooth" })} style={{
                  background: regression.regressions > 0 ? "#450a0a" : "#052e16",
                  color: regression.regressions > 0 ? "#ef4444" : "#22c55e",
                  border: `1px solid ${regression.regressions > 0 ? "#ef4444" : "#22c55e"}`,
                  borderRadius: 6, padding: "8px 16px", fontSize: 11, fontFamily: "monospace", cursor: "pointer", fontWeight: "bold",
                }}>
                  ⇅ COMPARE WITH PREVIOUS {regression.regressions > 0 ? `— ${regression.regressions} REGRESSION(S)` : `— ${regression.improvements} IMPROVEMENT(S)`}
                </button>
              )}
              <button onClick={() => { CertificationHistoryStore.clear(); setHistory([]); setRegression(null); }} style={{
                background: "#18181b", color: "#71717a", border: "1px solid #27272a",
                borderRadius: 6, padding: "8px 14px", fontSize: 11, fontFamily: "monospace", cursor: "pointer",
              }}>
                ✕ Clear History
              </button>
            </div>

            {/* EF-40.0 panels — UNCHANGED */}
            <CoveragePanel coverage={coverage} />
            <ScorePanel scoreInfo={scoreInfo} />
            <CertStatusPanel certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} />

            {/* EF-40.1 new sections */}
            <AuditSummaryPanel execId={execId} execAt={execAt} totalMs={totalMs} coverage={coverage} scoreInfo={scoreInfo} certStatus={certStatus} />
            <ExecutionMatrix phases={phases} />
            <CertificationDecisionPanel certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} />
            <PlatformLimitationsPanel coverage={coverage} />
            <AuditTrailPanel trail={trail} execAt={execAt} totalMs={totalMs} />

            {/* Detail sections */}
            <DetailSections phases={phases} />

            {/* EF-40.2: History, Regression, Timeline */}
            <TimelinePanel history={history} currentId={execId} />
            <div id="regression-report">
              <RegressionReportPanel regression={regression} />
            </div>
            <CertificationHistoryPanel history={history} currentId={execId} />

            {/* Final banner — UNCHANGED */}
            <FinalBanner certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} execAt={execAt} totalMs={totalMs} />
          </>
        )}
      </div>
    </div>
  );
}