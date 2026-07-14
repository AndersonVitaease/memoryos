import React, { useState, useCallback } from "react";
import { ReadinessEngine } from "@/lib/engineering-readiness/ReadinessEngine";

// ── Singleton engine ──────────────────────────────────────────────────────────
const engine = new ReadinessEngine();

// ── Constants ─────────────────────────────────────────────────────────────────
const CERT_CONFIG = {
  NOT_READY:              { color: "red",    label: "NOT READY",              icon: "✗" },
  PARTIALLY_READY:        { color: "yellow", label: "PARTIALLY READY",        icon: "◑" },
  READY_FOR_CONNECTORS:   { color: "green",  label: "READY FOR CONNECTORS",   icon: "✓" },
  READY_FOR_AUTOMATION:   { color: "blue",   label: "READY FOR AUTOMATION",   icon: "⚡" },
  ENTERPRISE_READY:       { color: "violet", label: "ENTERPRISE READY",       icon: "★" },
};

const DOMAIN_COLORS = {
  Infrastructure: "blue", Security: "red", Recovery: "orange", Persistence: "yellow",
  Acceptance: "violet", Regression: "green", Performance: "teal", Governance: "purple",
  Architecture: "blue", ConnectorPlatform: "green", EngineeringMemory: "violet", KnowledgeGraph: "teal",
};

const TABS = [
  "overview","infrastructure","performance","security","persistence",
  "recovery","architecture","governance","connectors","metrics","certification","history","audit",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ label, color = "gray", size = "sm" }) {
  const C = {
    green:  "bg-green-900/40 text-green-300 border border-green-700/40",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    red:    "bg-red-900/40 text-red-300 border border-red-700/40",
    blue:   "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    violet: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
    teal:   "bg-teal-900/40 text-teal-300 border border-teal-700/40",
    purple: "bg-purple-900/40 text-purple-300 border border-purple-700/40",
    orange: "bg-orange-900/40 text-orange-300 border border-orange-700/40",
    gray:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return <span className={`${sz} font-mono rounded ${C[color] ?? C.gray}`}>{label}</span>;
}

function ScoreBar({ score, color = "green" }) {
  const C = { green: "bg-green-500", yellow: "bg-yellow-500", red: "bg-red-500", blue: "bg-blue-500", violet: "bg-violet-500", teal: "bg-teal-500" };
  const barColor = score >= 90 ? "green" : score >= 70 ? "yellow" : "red";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${C[barColor]}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-400 w-8 text-right">{score}%</span>
    </div>
  );
}

function StatCard({ label, value, sub, color = "gray" }) {
  const C = { green: "text-green-300", yellow: "text-yellow-300", red: "text-red-400", blue: "text-blue-300", violet: "text-violet-300", gray: "text-white" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
      <div className="text-xs font-mono text-zinc-500">{label}</div>
      <div className={`text-xl font-bold ${C[color] ?? C.gray}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function ValidatorCard({ v }) {
  const [open, setOpen] = useState(false);
  const statusColor = { PASS: "green", FAIL: "red", WARN: "yellow", SKIP: "gray" };
  const domColor = DOMAIN_COLORS[v.domain] ?? "gray";
  return (
    <div className={`rounded-lg border ${v.status === "FAIL" ? "border-red-800/50" : v.status === "WARN" ? "border-yellow-800/40" : "border-zinc-800"} bg-zinc-900`}>
      <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen(o => !o)}>
        <span className="text-sm w-5">{v.status === "PASS" ? "✅" : v.status === "FAIL" ? "❌" : "⚠️"}</span>
        <Badge label={v.domain} color={domColor} size="xs" />
        <span className="text-sm text-zinc-300 flex-1">{v.name}</span>
        <div className="w-24 hidden md:block"><ScoreBar score={v.score} /></div>
        <span className="text-xs text-zinc-600 font-mono">{v.durationMs}ms</span>
        <span className="text-zinc-600 text-xs ml-1">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-zinc-800 pt-2 space-y-2">
          <p className="text-xs text-zinc-400">{v.detail}</p>
          {v.blockers.length > 0 && <div className="space-y-1">{v.blockers.map((b, i) => <p key={i} className="text-xs text-red-400 font-mono">BLOCKER: {b}</p>)}</div>}
          {v.warnings.length > 0 && <div className="space-y-1">{v.warnings.map((w, i) => <p key={i} className="text-xs text-yellow-400 font-mono">⚠ {w}</p>)}</div>}
          <div className="space-y-1 mt-2">
            {v.checks.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                <span>{c.status === "PASS" ? "✓" : c.status === "FAIL" ? "✗" : "⚠"}</span>
                <span className={c.status === "PASS" ? "text-zinc-400" : c.status === "FAIL" ? "text-red-400" : "text-yellow-400"}>{c.name}</span>
                <span className="text-zinc-600 ml-auto">{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Phase635Page() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ stage: "", pct: 0 });
  const [tab, setTab] = useState("overview");
  const [history, setHistory] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  const runCertification = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setReport(null);
    setProgress({ stage: "Initializing…", pct: 0 });
    engine.onProgress = (stage, pct) => setProgress({ stage, pct });
    try {
      const r = await engine.run();
      setReport(r);
      const state = engine.dashboardState();
      setHistory(state.history);
      setAuditLog(state.auditLog);
      setTab("overview");
    } finally {
      setRunning(false);
      engine.onProgress = undefined;
    }
  }, [running]);

  const cert = report?.certification;
  const certCfg = cert ? CERT_CONFIG[cert] : null;
  const scorecard = report?.scorecard;

  const domainValidators = (domain) =>
    (report?.validatorResults ?? []).filter(v => v.domain === domain);

  const allValidators = report?.validatorResults ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono text-zinc-500">SPRINT 6.3.5</span>
          <Badge label="ENGINEERING READINESS CERTIFICATION" color="violet" />
        </div>
        <h1 className="text-2xl font-bold">Engineering Readiness Certification</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Complete infrastructure certification before opening MemoryOS to external connectors. Sprints 6.0.x – 6.3.4.
        </p>
      </div>

      {/* CTA + Progress */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <button
          onClick={runCertification}
          disabled={running}
          className="px-6 py-3 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-sm font-bold transition-colors whitespace-nowrap"
        >
          {running ? "⚙ Certifying…" : "▶ Run Certification"}
        </button>
        {running && (
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-xs text-zinc-400 font-mono">
              <span>{progress.stage}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 transition-all duration-500 rounded-full" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        )}
        {report && !running && (
          <div className="flex flex-wrap items-center gap-3">
            {certCfg && <Badge label={`${certCfg.icon} ${certCfg.label}`} color={certCfg.color} />}
            <Badge label={`${scorecard.overall}% overall`} color={scorecard.overall >= 95 ? "green" : scorecard.overall >= 80 ? "yellow" : "red"} />
            <Badge label={`${report.blockers.length} blockers`} color={report.blockers.length === 0 ? "green" : "red"} />
            <span className="text-xs text-zinc-600 font-mono">{report.durationMs}ms</span>
          </div>
        )}
      </div>

      {/* Executive summary */}
      {report && (
        <div className={`rounded-lg border p-4 ${report.blockers.length === 0 ? "border-green-700/40 bg-green-950/10" : "border-yellow-700/40 bg-yellow-950/10"}`}>
          <p className="text-sm text-zinc-300">{report.executiveSummary}</p>
        </div>
      )}

      {/* Tabs */}
      {report && (
        <>
          <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-mono whitespace-nowrap transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          {tab === "overview" && (
            <div className="space-y-4">
              {/* Scorecard grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Infrastructure",     val: scorecard.infrastructure },
                  { label: "Security",           val: scorecard.security },
                  { label: "Recovery",           val: scorecard.recovery },
                  { label: "Persistence",        val: scorecard.persistence },
                  { label: "Acceptance",         val: scorecard.acceptance },
                  { label: "Regression",         val: scorecard.regression },
                  { label: "Performance",        val: scorecard.performance },
                  { label: "Governance",         val: scorecard.governance },
                  { label: "Architecture",       val: scorecard.architecture },
                  { label: "Connector Platform", val: scorecard.connectorPlatform },
                  { label: "Eng. Memory",        val: scorecard.engineeringMemory },
                  { label: "Knowledge Graph",    val: scorecard.knowledgeGraph },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-mono text-zinc-500">{label}</div>
                    <ScoreBar score={val} />
                  </div>
                ))}
              </div>
              {/* Overall + Certification */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard label="OVERALL SCORE" value={`${scorecard.overall}%`}
                  color={scorecard.overall >= 95 ? "green" : scorecard.overall >= 80 ? "yellow" : "red"} />
                <StatCard label="CERTIFICATION" value={certCfg?.icon + " " + cert} color={certCfg?.color ?? "gray"} />
                <StatCard label="VALIDATORS" value={`${allValidators.filter(v => v.status === "PASS").length}/${allValidators.length}`}
                  sub={`${report.blockers.length} blockers · ${report.pendingItems.length} pending`}
                  color={report.blockers.length === 0 ? "green" : "red"} />
              </div>
              {/* Blockers */}
              {report.blockers.length > 0 && (
                <div className="border border-red-800/40 rounded-lg p-4 bg-red-950/10 space-y-2">
                  <h3 className="text-sm font-semibold text-red-400">Blockers</h3>
                  {report.blockers.map((b, i) => <p key={i} className="text-xs text-red-300 font-mono">• {b}</p>)}
                </div>
              )}
              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-400">Recommendations</h3>
                  {report.recommendations.map((r, i) => <p key={i} className="text-xs text-zinc-400">→ {r}</p>)}
                </div>
              )}
            </div>
          )}

          {/* INFRASTRUCTURE */}
          {tab === "infrastructure" && (
            <div className="space-y-2">
              <p className="text-xs font-mono text-zinc-500">All capability and dependency validators</p>
              {allValidators.map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* PERFORMANCE */}
          {tab === "performance" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Startup", val: report.performanceBaseline.startupMs },
                  { label: "Warmup",  val: report.performanceBaseline.warmupMs },
                  { label: "Restore", val: report.performanceBaseline.restoreMs },
                  { label: "Recovery",val: report.performanceBaseline.recoveryMs },
                  { label: "Acceptance", val: report.performanceBaseline.acceptanceMs },
                  { label: "Regression", val: report.performanceBaseline.regressionMs },
                  { label: "Full Loop",  val: report.performanceBaseline.fullLoopMs },
                  { label: "Cert Total", val: report.durationMs },
                ].map(({ label, val }) => (
                  <StatCard key={label} label={label} value={`${val}ms`}
                    color={val < 2000 ? "green" : val < 10000 ? "yellow" : "red"} />
                ))}
              </div>
              {domainValidators("Performance").map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* SECURITY */}
          {tab === "security" && (
            <div className="space-y-2">
              <p className="text-xs font-mono text-zinc-500">Zero credential persistence · Governance active · Policies valid</p>
              {domainValidators("Security").map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* PERSISTENCE */}
          {tab === "persistence" && (
            <div className="space-y-2">
              {domainValidators("Persistence").map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* RECOVERY */}
          {tab === "recovery" && (
            <div className="space-y-2">
              {domainValidators("Recovery").map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* ARCHITECTURE */}
          {tab === "architecture" && (
            <div className="space-y-2">
              {domainValidators("Architecture").map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* GOVERNANCE */}
          {tab === "governance" && (
            <div className="space-y-2">
              {domainValidators("Governance").map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* CONNECTORS */}
          {tab === "connectors" && (
            <div className="space-y-2">
              {domainValidators("ConnectorPlatform").map(v => <ValidatorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* METRICS */}
          {tab === "metrics" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(report.metrics).map(([k, v]) => (
                  <StatCard key={k} label={k} value={String(v)} />
                ))}
              </div>
            </div>
          )}

          {/* CERTIFICATION */}
          {tab === "certification" && (
            <div className="space-y-4">
              <div className={`rounded-lg border p-6 text-center space-y-3 ${certCfg?.color === "green" ? "border-green-600/50 bg-green-950/20" : certCfg?.color === "yellow" ? "border-yellow-600/50 bg-yellow-950/20" : "border-red-600/50 bg-red-950/20"}`}>
                <div className="text-6xl">{certCfg?.icon}</div>
                <div className="text-2xl font-bold">{certCfg?.label}</div>
                <div className="text-zinc-400 text-sm">Overall Score: {scorecard.overall}%</div>
                <div className="text-zinc-500 text-xs font-mono">Sprint 6.3.5 · {new Date(report.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC</div>
              </div>
              {/* Checklist */}
              <div className="space-y-1">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Certification Checklist</h3>
                {report.checklist.filter(c => c.critical).slice(0, 20).map((c, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs px-2 py-1.5 rounded bg-zinc-900">
                    <span>{c.status === "PASS" ? "✓" : c.status === "FAIL" ? "✗" : "⚠"}</span>
                    <Badge label={c.domain} size="xs" color={DOMAIN_COLORS[c.domain] ?? "gray"} />
                    <span className={c.status === "PASS" ? "text-zinc-300" : c.status === "FAIL" ? "text-red-400" : "text-yellow-400"}>{c.label}</span>
                  </div>
                ))}
              </div>
              {/* Risks */}
              {report.risks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Risk Register</h3>
                  {report.risks.map(r => (
                    <div key={r.id} className={`rounded border p-3 space-y-1 ${r.level === "HIGH" || r.level === "CRITICAL" ? "border-red-800/40 bg-red-950/10" : "border-yellow-800/30 bg-yellow-950/10"}`}>
                      <div className="flex items-center gap-2">
                        <Badge label={r.level} color={r.level === "HIGH" || r.level === "CRITICAL" ? "red" : "yellow"} size="xs" />
                        <Badge label={r.area} color={DOMAIN_COLORS[r.area] ?? "gray"} size="xs" />
                      </div>
                      <p className="text-xs text-zinc-400">{r.description}</p>
                      <p className="text-xs text-zinc-500">→ {r.mitigation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORY */}
          {tab === "history" && (
            <div className="space-y-3">
              {history.length === 0 && <p className="text-zinc-500 text-sm">No history yet.</p>}
              {history.map((h, i) => (
                <div key={h.id} className="border border-zinc-800 rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-zinc-600 font-mono">#{i + 1}</span>
                    {CERT_CONFIG[h.certification] && (
                      <Badge label={CERT_CONFIG[h.certification].icon + " " + h.certification} color={CERT_CONFIG[h.certification].color} />
                    )}
                    <Badge label={`${h.scorecard.overall}%`} color={h.scorecard.overall >= 95 ? "green" : "yellow"} />
                    <Badge label={`${h.blockers.length} blockers`} color={h.blockers.length === 0 ? "green" : "red"} />
                    <span className="text-xs text-zinc-600 font-mono ml-auto">{new Date(h.generatedAt).toISOString().slice(0, 19)}</span>
                    <span className="text-xs text-zinc-600 font-mono">{h.durationMs}ms</span>
                  </div>
                  <p className="text-xs text-zinc-500">{h.executiveSummary.slice(0, 150)}…</p>
                </div>
              ))}
            </div>
          )}

          {/* AUDIT */}
          {tab === "audit" && (
            <div className="space-y-1">
              <p className="text-xs font-mono text-zinc-500">{auditLog.length} recent audit entries</p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-96 overflow-y-auto space-y-0.5">
                {auditLog.map(e => (
                  <div key={e.id} className="flex items-center gap-3 text-xs text-zinc-400 font-mono py-0.5">
                    <span className={e.result === "PASS" ? "text-green-400" : e.result === "FAIL" ? "text-red-400" : e.result === "INFO" ? "text-blue-400" : "text-yellow-400"}>
                      {e.result === "PASS" ? "✓" : e.result === "FAIL" ? "✗" : e.result === "INFO" ? "ℹ" : "⚠"}
                    </span>
                    <span className="text-zinc-600 shrink-0">{new Date(e.timestamp).toISOString().slice(11, 19)}</span>
                    <span className="text-zinc-500 w-36 shrink-0">{e.actor}</span>
                    <span className="text-zinc-400 flex-1">{e.detail}</span>
                  </div>
                ))}
                {auditLog.length === 0 && <p className="text-zinc-600">No audit entries yet.</p>}
              </div>
            </div>
          )}
        </>
      )}

      {/* Idle */}
      {!report && !running && (
        <div className="text-center py-20 text-zinc-600 space-y-3">
          <div className="text-6xl">🏆</div>
          <p className="text-sm">Run Engineering Readiness Certification to validate all infrastructure layers.</p>
          <p className="text-xs text-zinc-700">
            14 validators · 12 domains · Full scorecard · Official certification level
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {["Capability","Dependency","Security","Performance","Persistence","Recovery",
              "Runtime","Architecture","Governance","Connector","Memory","KnowledgeGraph","Acceptance","Regression"].map(v => (
              <Badge key={v} label={v} color="gray" size="xs" />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-600 font-mono">
          Sprint 6.3.5 · Engineering Readiness Certification ·
          After READY_FOR_CONNECTORS: Phase 6.4 — OAuth Framework + Google Calendar + Gmail + Drive
        </p>
      </div>
    </div>
  );
}