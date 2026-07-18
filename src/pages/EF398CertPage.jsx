/**
 * EF-40.0 — CERTIFICATION CONSISTENCY
 *
 * Three independent concepts — no shared panels, no ambiguity:
 *
 * A) EXECUTION COVERAGE
 *    Denominator = ALL 8 declared phases (including NOT_EXECUTED).
 *    Coverage % = executed / total.
 *
 * B) CERTIFICATION SCORE
 *    Denominator = only the phases actually executed.
 *    Score = passed_executed / executed * 100.
 *    Grade derived from score.
 *    NOT_EXECUTED phases never inflate or deflate the score.
 *
 * C) CERTIFICATION STATUS
 *    CERTIFIED         — all phases executed AND score >= minimum.
 *    PARTIALLY CERTIFIED — any phase NOT_EXECUTED (even if score = 100).
 *    NOT CERTIFIED     — any FAIL in an executed phase.
 */
import React, { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const STATUS = { PASS: "PASS", FAIL: "FAIL", NOT_EXECUTED: "NOT_EXECUTED" };

const ALL_PHASES = ["TESTS","ARCHITECTURE","SOLID","IMMUTABILITY","PERFORMANCE","STRUCTURAL","SOURCE","AST"];
const TOTAL_PHASES = ALL_PHASES.length; // always 8

const MIN_SCORE = 95;

const STATUS_COLOR  = { PASS: "#22c55e", FAIL: "#ef4444", NOT_EXECUTED: "#f59e0b" };
const STATUS_BG     = { PASS: "#052e16", FAIL: "#450a0a", NOT_EXECUTED: "#422006" };
const STATUS_LABEL  = { PASS: "PASS",    FAIL: "FAIL",    NOT_EXECUTED: "NOT EXECUTED" };
const STATUS_ICON   = { PASS: "✓",       FAIL: "✗",       NOT_EXECUTED: "⊘" };

const CERT_STATUS = {
  CERTIFIED:           "CERTIFIED",
  PARTIALLY_CERTIFIED: "PARTIALLY_CERTIFIED",
  NOT_CERTIFIED:       "NOT_CERTIFIED",
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure computation — no side effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A) EXECUTION COVERAGE — always uses TOTAL_PHASES as denominator.
 */
function computeCoverage(phases) {
  const executed    = ALL_PHASES.filter(k => phases[k]?.status !== STATUS.NOT_EXECUTED);
  const notExecuted = ALL_PHASES.filter(k => phases[k]?.status === STATUS.NOT_EXECUTED);
  const coveragePct = Math.round((executed.length / TOTAL_PHASES) * 100);
  return { executed, notExecuted, total: TOTAL_PHASES, coveragePct };
}

/**
 * B) CERTIFICATION SCORE — only over executed phases.
 * Each executed phase contributes equally (1 unit).
 */
function computeScore(phases) {
  const SCOREABLE = ["TESTS","ARCHITECTURE","SOLID","IMMUTABILITY","PERFORMANCE","STRUCTURAL","SOURCE","AST"];
  const executed  = SCOREABLE.filter(k => phases[k]?.status !== STATUS.NOT_EXECUTED);
  const passed    = executed.filter(k => phases[k]?.status === STATUS.PASS);
  const failed    = executed.filter(k => phases[k]?.status === STATUS.FAIL);

  const score = executed.length > 0 ? Math.round((passed.length / executed.length) * 100) : 0;
  const grade = score >= 97 ? "A+" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  return { score, grade, executedCount: executed.length, passedCount: passed.length, failedCount: failed.length, passed, failed, executed };
}

/**
 * C) CERTIFICATION STATUS — derived from coverage + score.
 * CERTIFIED:            all phases executed AND score >= MIN_SCORE AND no FAIL.
 * PARTIALLY CERTIFIED:  any NOT_EXECUTED (even if score = 100 on executed ones).
 * NOT CERTIFIED:        any FAIL in an executed phase.
 */
function computeCertStatus(coverage, scoreInfo) {
  const hasNotExecuted = coverage.notExecuted.length > 0;
  const hasFail        = scoreInfo.failedCount > 0;

  if (hasFail)        return CERT_STATUS.NOT_CERTIFIED;
  if (hasNotExecuted) return CERT_STATUS.PARTIALLY_CERTIFIED;
  if (scoreInfo.score >= MIN_SCORE) return CERT_STATUS.CERTIFIED;
  return CERT_STATUS.NOT_CERTIFIED;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Audit Orchestrator — each phase is independent
// ─────────────────────────────────────────────────────────────────────────────

async function runPhaseTests(addLog) {
  addLog("TESTS — Running MemoryStoreTests…");
  const t0 = performance.now();
  try {
    const { runMemoryStoreTests } = await import("@/lib/knowledge-store/memory/MemoryStoreTests");
    const r = await runMemoryStoreTests();
    const ms = Math.round(performance.now() - t0);
    addLog(`TESTS DONE — ${r.passed}/${r.total} passed (${ms}ms)`);
    return { status: r.certified ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.certified ? null : `${r.failed} test(s) failed`, durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addLog(`TESTS FAIL — ${err?.message}`);
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

async function runPhaseArchitecture(addLog) {
  addLog("ARCHITECTURE — Running ArchitecturalAuditor…");
  const t0 = performance.now();
  try {
    const { runFullAudit } = await import("@/lib/knowledge-store/auditor/ArchitecturalAuditor");
    const r = await runFullAudit();
    const ms = Math.round(performance.now() - t0);
    addLog(`ARCHITECTURE DONE — integrity:${r.integrity.passed}/${r.integrity.passed+r.integrity.failed} immutability:${r.immutability.passed}/${r.immutability.passed+r.immutability.failed} solid:${r.solid.ok} (${ms}ms)`);
    return { status: r.allPassed ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.allPassed ? null : "One or more architectural checks failed", durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addLog(`ARCHITECTURE FAIL — ${err?.message}`);
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

async function runPhaseStructural(addLog) {
  addLog("STRUCTURAL — Running StructuralAudit…");
  const t0 = performance.now();
  try {
    const { runStructuralAudit } = await import("@/lib/knowledge-store/auditor/SourceAuditStructural");
    const r = await runStructuralAudit();
    const ms = Math.round(performance.now() - t0);
    addLog(`STRUCTURAL DONE — ${r.passed}/${r.passed+r.failed} (${ms}ms)`);
    return { status: r.ok ? STATUS.PASS : STATUS.FAIL, data: r, reason: r.ok ? null : `${r.failed} check(s) failed`, durationMs: ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    addLog(`STRUCTURAL FAIL — ${err?.message}`);
    return { status: STATUS.FAIL, data: null, reason: err?.message, durationMs: ms };
  }
}

// SOURCE — NOT_EXECUTED: static ?raw imports collide with ArchitecturalAuditor's normal chunks.
// Error fires at ES module link phase — uncatchable by try/catch. Documented project dead-end.
// Runs correctly at /ef393-certification (isolated lazy route).
function runPhaseSource(addLog) {
  addLog("SOURCE — NOT_EXECUTED: Vite ?raw collision with ArchitecturalAuditor chunks (documented dead-end)");
  return {
    status: STATUS.NOT_EXECUTED,
    data: null,
    reason: "Static top-level ?raw imports (MemoryStore.ts?raw, etc.) collide with normal chunks already loaded by ArchitecturalAuditor. The ES module link error fires before any try/catch. See project dead-ends. Executes correctly at /ef393-certification.",
    durationMs: 0,
  };
}

// AST — same root cause as SOURCE.
function runPhaseAST(addLog) {
  addLog("AST — NOT_EXECUTED: same Vite ?raw collision as SOURCE");
  return {
    status: STATUS.NOT_EXECUTED,
    data: null,
    reason: "Same root cause as SOURCE AUDIT — static top-level ?raw imports. Runs correctly at /ef393-certification.",
    durationMs: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
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

function CoveragePanel({ coverage }) {
  const pct = coverage.coveragePct;
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
            {coverage.executed.map(k => (
              <span key={k} style={{ fontSize: 9, background: "#052e16", color: "#22c55e", border: "1px solid #166534", borderRadius: 4, padding: "1px 6px" }}>{k}</span>
            ))}
          </div>
        </div>
        {coverage.notExecuted.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#52525b", marginBottom: 4 }}>NOT EXECUTED ({coverage.notExecuted.length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {coverage.notExecuted.map(k => (
                <span key={k} style={{ fontSize: 9, background: "#422006", color: "#f59e0b", border: "1px solid #92400e", borderRadius: 4, padding: "1px 6px" }}>{k}</span>
              ))}
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
          <div style={{ fontSize: 10, color: "#71717a" }}>
            {scoreInfo.passedCount} / {scoreInfo.executedCount} × 100 = {scoreInfo.score}
          </div>
          <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>
            NOT_EXECUTED phases are excluded from numerator and denominator.
          </div>
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
        <div style={{ background: cfg.bg, border: `2px solid ${cfg.color}`, borderRadius: 8, padding: "8px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>
        </div>
        <div style={{ fontSize: 10, color: "#a1a1aa", maxWidth: 480, lineHeight: 1.6 }}>{rules[certStatus]}</div>
      </div>
    </Panel>
  );
}

function ExecutionMatrix({ phases, coverage, scoreInfo }) {
  return (
    <Panel title="Execution Matrix — all declared phases">
      <div style={{ display: "grid", gridTemplateColumns: "140px 110px 80px 1fr", gap: "2px 12px", alignItems: "center" }}>
        {/* Header */}
        {["PHASE","STATUS","TIME","RESULT / OBSERVATION"].map(h => (
          <div key={h} style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, borderBottom: "1px solid #27272a", paddingBottom: 4, marginBottom: 4 }}>{h}</div>
        ))}
        {ALL_PHASES.map(name => {
          const phase = phases[name];
          const s     = phase?.status ?? STATUS.NOT_EXECUTED;
          const color = STATUS_COLOR[s];
          const note  = matrixNote(name, phase);
          return (
            <React.Fragment key={name}>
              <div style={{ fontSize: 10, color: "#e4e4e7", fontWeight: "bold" }}>{name}</div>
              <div style={{ fontSize: 10, color, fontWeight: "bold" }}>{STATUS_ICON[s]} {STATUS_LABEL[s]}</div>
              <div style={{ fontSize: 9, color: "#71717a" }}>{phase?.durationMs > 0 ? `${phase.durationMs}ms` : "—"}</div>
              <div style={{ fontSize: 9, color: s === STATUS.NOT_EXECUTED ? "#f59e0b" : s === STATUS.FAIL ? "#ef4444" : "#a1a1aa" }}>{note}</div>
            </React.Fragment>
          );
        })}
      </div>
    </Panel>
  );
}

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

function FinalBanner({ certStatus, coverage, scoreInfo, execAt, totalMs }) {
  const cfg = CERT_CONFIG[certStatus];
  return (
    <div style={{ border: `2px solid ${cfg.color}`, borderRadius: 12, padding: 24, textAlign: "center", background: cfg.bg, marginTop: 8 }}>
      <div style={{ fontSize: 26, fontWeight: "bold", color: cfg.color }}>{cfg.icon} {cfg.label}</div>

      {certStatus === CERT_STATUS.PARTIALLY_CERTIFIED && (
        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, maxWidth: 500, margin: "8px auto 0" }}>
          Certification score is based only on executed phases.<br />
          Execution coverage remains incomplete.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 16, flexWrap: "wrap" }}>
        <Stat label="Coverage"  value={`${coverage.coveragePct}%`}        sub={`${coverage.executed.length}/${coverage.total} phases`} color={coverage.coveragePct === 100 ? "#22c55e" : "#f59e0b"} />
        <Stat label="Score"     value={`${scoreInfo.score}/100`}           sub={`Grade ${scoreInfo.grade}`}                             color={scoreInfo.score >= 95 ? "#22c55e" : "#ef4444"} />
        <Stat label="Executed"  value={`${scoreInfo.executedCount}/${TOTAL_PHASES}`} sub="phases"                                   color="#a1a1aa" />
        <Stat label="Passed"    value={scoreInfo.passedCount}              sub="phases"                                               color="#22c55e" />
        {scoreInfo.failedCount > 0 && <Stat label="Failed" value={scoreInfo.failedCount} sub="phases" color="#ef4444" />}
        {coverage.notExecuted.length > 0 && <Stat label="Not Executed" value={coverage.notExecuted.length} sub="phases" color="#f59e0b" />}
        <Stat label="Total Time" value={`${totalMs}ms`}                    sub={execAt?.split("T")[1]?.split(".")[0] ?? ""}            color="#71717a" />
      </div>
    </div>
  );
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
// Detail sections
// ─────────────────────────────────────────────────────────────────────────────

function DetailSections({ phases }) {
  return (
    <>
      {phases.TESTS?.data && (
        <Panel title={`Tests — ${phases.TESTS.data.passed}/${phases.TESTS.data.total} passed`}>
          {phases.TESTS.data.results?.filter(r => !r.passed).length === 0
            ? <Row color="#22c55e">✓ All {phases.TESTS.data.total} tests passed</Row>
            : phases.TESTS.data.results?.filter(r => !r.passed).map((r, i) => (
                <Row key={i} color="#ef4444">✗ [{r.suite}] {r.name}: {r.error}</Row>
              ))
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
          {phases.ARCHITECTURE.data.integrity.checks.filter(c => !c.ok).map((c, i) => (
            <Row key={i} color="#ef4444">✗ {c.check}: {c.detail}</Row>
          ))}
          {phases.ARCHITECTURE.data.integrity.failed === 0 && (
            <Row color="#22c55e">✓ All {phases.ARCHITECTURE.data.integrity.passed} integrity checks passed</Row>
          )}
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
          {phases.STRUCTURAL.data.checks?.filter(c => !c.ok).map((c, i) => (
            <Row key={i} color="#ef4444">✗ {c.check}: {c.detail}</Row>
          ))}
          {phases.STRUCTURAL.data.failed === 0 && (
            <Row color="#22c55e">✓ All {phases.STRUCTURAL.data.passed} structural checks passed</Row>
          )}
        </Panel>
      )}

      {(phases.SOURCE?.status === STATUS.NOT_EXECUTED || phases.AST?.status === STATUS.NOT_EXECUTED) && (
        <Panel title="Not Executed — Technical Explanation" accent="#f59e0b">
          <Row color="#f59e0b">⊘ SOURCE AUDIT and AST AUDIT were not executed in this runtime context.</Row>
          <div style={{ fontSize: 10, color: "#a1a1aa", marginTop: 6, lineHeight: 1.6 }}>
            Both auditors use static top-level Vite <code style={{ color: "#c084fc" }}>?raw</code> imports (e.g.{" "}
            <code style={{ color: "#c084fc" }}>MemoryStore.ts?raw</code>). When ArchitecturalAuditor loads first,
            it pulls the same files as normal JS chunks. Vite cannot then resolve the <code style={{ color: "#c084fc" }}>?raw</code> variant
            of those module IDs — the error fires at the ES module link phase, before any try/catch can intercept it.
          </div>
          <div style={{ fontSize: 10, color: "#a1a1aa", marginTop: 6, lineHeight: 1.6 }}>
            These auditors produce real results at <span style={{ color: "#818cf8" }}>/ef393-certification</span> (isolated lazy route
            without ArchitecturalAuditor). This is a documented dead-end in the project.
          </div>
          <div style={{ fontSize: 9, color: "#52525b", marginTop: 4 }}>
            These phases are excluded from the Certification Score denominator. Execution Coverage counts them as not executed.
          </div>
        </Panel>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function EF398CertPage() {
  const [runStatus, setRunStatus] = useState("idle");
  const [phases,    setPhases]    = useState({});
  const [coverage,  setCoverage]  = useState(null);
  const [scoreInfo, setScoreInfo] = useState(null);
  const [certStatus,setCertStatus]= useState(null);
  const [log,       setLog]       = useState([]);
  const [totalMs,   setTotalMs]   = useState(null);
  const [execAt,    setExecAt]    = useState(null);
  const startedRef = useRef(false);

  function addLog(msg) {
    setLog(prev => [...prev, { t: performance.now().toFixed(1), msg }]);
  }

  async function run() {
    if (startedRef.current) return;
    startedRef.current = true;
    setRunStatus("running");
    setLog([]);
    setPhases({});
    setCoverage(null);
    setScoreInfo(null);
    setCertStatus(null);

    const wallStart = performance.now();
    setExecAt(new Date().toISOString());

    try {
      const { KnowledgeStoreMetrics } = await import("@/lib/knowledge-store/KnowledgeStoreMetrics");
      KnowledgeStoreMetrics.reset();
      const { KnowledgeStoreEventBus } = await import("@/lib/knowledge-store/KnowledgeStoreEvents");
      KnowledgeStoreEventBus.clear();
      addLog("Singletons reset OK");
    } catch (e) {
      addLog(`Singleton reset warning: ${e?.message}`);
    }

    const [testsPhase, archPhase] = await Promise.all([
      runPhaseTests(addLog),
      runPhaseArchitecture(addLog),
    ]);

    const structuralPhase = await runPhaseStructural(addLog);
    const sourcePhase     = runPhaseSource(addLog);
    const astPhase        = runPhaseAST(addLog);

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

    const allPhases = {
      TESTS:        testsPhase,
      ARCHITECTURE: archPhase,
      SOLID:        solidPhase,
      IMMUTABILITY: immutabilityPhase,
      PERFORMANCE:  perfPhase,
      STRUCTURAL:   structuralPhase,
      SOURCE:       sourcePhase,
      AST:          astPhase,
    };

    const cov  = computeCoverage(allPhases);
    const sc   = computeScore(allPhases);
    const cert = computeCertStatus(cov, sc);
    const ms   = Math.round(performance.now() - wallStart);

    setPhases(allPhases);
    setCoverage(cov);
    setScoreInfo(sc);
    setCertStatus(cert);
    setTotalMs(ms);
    setRunStatus("done");

    addLog(`COMPLETE — coverage:${cov.coveragePct}% (${cov.executed.length}/${cov.total}) score:${sc.score}/100 ${sc.grade} status:${cert} — ${ms}ms`);
  }

  useEffect(() => { run(); }, []);

  return (
    <div style={{ background: "#09090b", color: "#e4e4e7", minHeight: "100vh", fontFamily: "monospace", padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ fontSize: 17, fontWeight: "bold", color: "#a78bfa", marginBottom: 3 }}>
          EF-40.0 — CERTIFICATION CONSISTENCY
        </div>
        <div style={{ fontSize: 10, color: "#52525b", marginBottom: 4 }}>
          Coverage = all {TOTAL_PHASES} declared phases · Score = executed phases only · Status = CERTIFIED / PARTIALLY CERTIFIED / NOT CERTIFIED
        </div>
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: 16 }}>
          Run status:{" "}
          <span style={{ color: runStatus === "done" ? "#22c55e" : runStatus === "error" ? "#ef4444" : "#facc15", fontWeight: "bold" }}>
            {runStatus.toUpperCase()}
          </span>
          {execAt && <span style={{ color: "#3f3f46", marginLeft: 12 }}>{execAt}</span>}
        </div>

        {/* Log */}
        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 180, overflowY: "auto" }}>
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
            </div>

            {/* Three independent concept panels */}
            <CoveragePanel coverage={coverage} />
            <ScorePanel scoreInfo={scoreInfo} />
            <CertStatusPanel certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} />

            {/* Execution Matrix */}
            <ExecutionMatrix phases={phases} coverage={coverage} scoreInfo={scoreInfo} />

            {/* Detail sections */}
            <DetailSections phases={phases} />

            {/* Final banner */}
            <FinalBanner certStatus={certStatus} coverage={coverage} scoreInfo={scoreInfo} execAt={execAt} totalMs={totalMs} />
          </>
        )}
      </div>
    </div>
  );
}