/**
 * SprintEF555Page.jsx — Sprint EF-55 · System Certification Dashboard
 */

import React, { useState, useCallback, useRef } from "react";
import { SystemCertificationEngine } from "@/lib/system-certification/SystemCertificationEngine";
import { CertificationHistory }      from "@/lib/system-certification/CertificationHistory";

// ── UI Atoms ──────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:    "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:    "bg-amber-950/60  text-amber-300  border-amber-700",
    red:      "bg-red-950/60    text-red-300    border-red-800",
    critical: "bg-red-950/80    text-red-200    border-red-700",
    violet:   "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:      "bg-sky-950/60    text-sky-300    border-sky-700",
    blue:     "bg-blue-950/60   text-blue-300   border-blue-700",
    zinc:     "bg-zinc-800/60   text-zinc-400   border-zinc-600",
    gold:     "bg-yellow-950/60 text-yellow-300 border-yellow-700",
    teal:     "bg-teal-950/60   text-teal-300   border-teal-700",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function Gauge({ label, value, certified }) {
  const color = value >= 95 ? "text-emerald-400" : value >= 80 ? "text-amber-400" : "text-red-400";
  const barColor = value >= 95 ? "bg-emerald-600" : value >= 80 ? "bg-amber-600" : "bg-red-600";
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-zinc-500 text-xs truncate">{label}</span>
        <span className={`text-sm font-bold font-mono ${color}`}>{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function statusBadge(s) {
  if (s === "pass") return <Badge label="PASS" color="green" />;
  if (s === "fail") return <Badge label="FAIL" color="red" />;
  if (s === "warn") return <Badge label="WARN" color="amber" />;
  return <Badge label="SKIP" color="zinc" />;
}

const TABS = [
  { id: "overview",       label: "Overview" },
  { id: "pipeline",       label: "Pipeline Trace" },
  { id: "auditors",       label: "Auditors" },
  { id: "checks",         label: "All Checks" },
  { id: "failures",       label: "Failures" },
  { id: "metrics",        label: "Metrics" },
  { id: "history",        label: "History" },
];

const AUDITOR_ORDER = [
  "IntegrationAuditor", "PipelineAuditor", "ContractAuditor", "DependencyAuditor",
  "IsolationAuditor", "PerformanceAuditor", "ObservabilityAuditor",
  "ExplainabilityAuditor", "DeterminismAuditor", "ArchitecturalComplianceAuditor",
];

export default function SprintEF555Page() {
  const [tab,      setTab]      = useState("overview");
  const [report,   setReport]   = useState(null);
  const [running,  setRunning]  = useState(false);
  const [logs,     setLogs]     = useState([]);
  const logRef = useRef([]);

  const handleCertify = useCallback(() => {
    setRunning(true);
    setLogs([]);
    logRef.current = [];

    const onProgress = (msg) => {
      logRef.current = [...logRef.current, msg];
      setLogs([...logRef.current]);
    };

    SystemCertificationEngine.certify(onProgress).then(result => {
      setReport(result);
      setRunning(false);
    }).catch(e => {
      setLogs(prev => [...prev, `ERROR: ${e?.message ?? e}`]);
      setRunning(false);
    });
  }, []);

  const r    = report;
  const hist = CertificationHistory.getLast(10);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className={`border rounded-xl p-5 ${r?.certified ? "bg-emerald-950/20 border-emerald-700/40" : r ? "bg-red-950/15 border-red-700/40" : "bg-gradient-to-r from-zinc-900 to-zinc-950 border-zinc-800"}`}>
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-55" color="gold" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">System Certification Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">EF-43 → EF-54 · 10 Auditors · 12 Test Suites</span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {r?.certified ? "✓ ARCHITECTURE CERTIFIED" : r ? "✗ CERTIFICATION FAILED" : "System Certification"}
          </h1>
          {r && (
            <div className="flex gap-3 mt-2 flex-wrap">
              <Badge label={`score=${r.metrics.overallCertificationScore.toFixed(1)}/100`} color={r.certified ? "green" : "red"} />
              <Badge label={`${r.auditResults.filter(a => a.status === "pass").length}/${r.auditResults.length} auditors passed`} color="sky" />
              <Badge label={`${r.durationMs}ms`} color="zinc" />
            </div>
          )}
        </div>

        {/* Controls + progress log */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={handleCertify} disabled={running}
              className="px-5 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
              {running ? "Certificando..." : "▶ Executar Certificação Completa"}
            </button>
            {r && <Badge label={r.certified ? "CERTIFIED" : "NOT CERTIFIED"} color={r.certified ? "green" : "red"} />}
          </div>
          {(running || logs.length > 0) && (
            <div className="bg-zinc-950 rounded-lg p-3 space-y-0.5 max-h-40 overflow-y-auto">
              {logs.map((log, i) => (
                <p key={i} className={`text-xs font-mono ${log.includes("ERROR") ? "text-red-400" : log.includes("✓") ? "text-emerald-400" : log.includes("✗") ? "text-red-400" : "text-zinc-400"}`}>
                  [{i + 1}] {log}
                </p>
              ))}
              {running && <p className="text-zinc-600 text-xs animate-pulse">running...</p>}
            </div>
          )}
        </div>

        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Infraestrutura de Certificação Oficial — EF-55</p>
            <p className="text-zinc-600 text-xs">Valida: Integration · Pipeline · Contracts · Dependencies · Isolation · Performance · Observability · Explainability · Determinism · Architecture</p>
          </div>
        )}

        {r && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto flex-wrap">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-w-fit px-2
                    ${tab === t.id ? "bg-yellow-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* OVERVIEW */}
            {tab === "overview" && (
              <div className="space-y-4">
                <div className={`border rounded-xl p-4 ${r.certified ? "bg-emerald-950/20 border-emerald-700/30" : "bg-red-950/15 border-red-800/30"}`}>
                  <p className={`text-lg font-black ${r.certified ? "text-emerald-300" : "text-red-300"}`}>
                    {r.certified ? "✓ ARCHITECTURE CERTIFIED — Safe to proceed to EF-56" : "✗ CERTIFICATION FAILED — Issues must be resolved before EF-56"}
                  </p>
                  <p className="text-zinc-400 text-xs mt-1">{r.summary}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Gauge label="Architecture"    value={r.metrics.architectureScore} />
                  <Gauge label="Pipeline Health" value={r.metrics.pipelineHealth} />
                  <Gauge label="Contracts"       value={r.metrics.contractHealth} />
                  <Gauge label="Performance"     value={r.metrics.performanceScore} />
                  <Gauge label="Dependencies"    value={r.metrics.dependencyScore} />
                  <Gauge label="Explainability"  value={r.metrics.explainabilityScore} />
                  <Gauge label="Observability"   value={r.metrics.observabilityScore} />
                  <Gauge label="Isolation"       value={r.metrics.isolationScore} />
                  <Gauge label="Determinism"     value={r.metrics.deterministmScore} />
                  <div className={`col-span-2 md:col-span-3 border rounded-xl p-4 flex items-center justify-between ${r.certified ? "bg-emerald-950/20 border-emerald-700/30" : "bg-red-950/15 border-red-800/30"}`}>
                    <span className="text-zinc-400 text-sm">Overall Certification Score</span>
                    <span className={`text-3xl font-black ${r.certified ? "text-emerald-300" : "text-red-300"}`}>{r.metrics.overallCertificationScore.toFixed(1)}<span className="text-base text-zinc-500">/100</span></span>
                  </div>
                </div>
              </div>
            )}

            {/* PIPELINE TRACE */}
            {tab === "pipeline" && (
              <div className="space-y-2">
                <div className="flex gap-2 items-center text-xs">
                  <Badge label={`trace_id=${r.pipelineTrace.id.slice(-12)}`} color="zinc" />
                  <Badge label={`allTraceable=${r.pipelineTrace.allIdsTraceable}`} color={r.pipelineTrace.allIdsTraceable ? "green" : "red"} />
                  <Badge label={`${r.pipelineTrace.totalDurationMs}ms total`} color="zinc" />
                </div>
                {r.pipelineTrace.steps.map((step, i) => (
                  <div key={step.id} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${step.status === "pass" ? "border-emerald-600 bg-emerald-950/50 text-emerald-300" : "border-red-600 bg-red-950/50 text-red-300"}`}>{i + 1}</div>
                      {i < r.pipelineTrace.steps.length - 1 && <div className="w-px h-4 bg-zinc-800 mt-1" />}
                    </div>
                    <div className="flex-1 bg-zinc-900/60 border border-zinc-800/40 rounded-xl px-4 py-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(step.status)}
                        <Badge label={step.stage} color="zinc" />
                        <span className="text-zinc-300 text-xs flex-1 font-bold">{step.inputSummary} → {step.outputSummary}</span>
                        <span className="text-zinc-600 text-xs">{step.durationMs.toFixed(0)}ms</span>
                      </div>
                      <div className="text-xs text-zinc-600 mt-0.5">{step.trace.slice(0, 2).join(" · ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AUDITORS */}
            {tab === "auditors" && (
              <div className="space-y-2">
                {AUDITOR_ORDER.map(name => {
                  const auditor = r.auditResults.find(a => a.auditor === name);
                  if (!auditor) return null;
                  return (
                    <div key={name} className={`bg-zinc-900 border rounded-xl p-4 ${auditor.status === "fail" ? "border-red-800/40" : "border-zinc-800"}`}>
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {statusBadge(auditor.status)}
                        <span className="text-zinc-200 text-sm font-bold flex-1">{auditor.auditor.replace("Auditor", " Auditor")}</span>
                        <span className={`text-sm font-bold font-mono ${auditor.score >= 90 ? "text-emerald-400" : auditor.score >= 70 ? "text-amber-400" : "text-red-400"}`}>{auditor.score.toFixed(0)}/100</span>
                        <span className="text-zinc-600 text-xs">{auditor.durationMs}ms</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full ${auditor.score >= 90 ? "bg-emerald-600" : auditor.score >= 70 ? "bg-amber-600" : "bg-red-600"}`} style={{ width: `${auditor.score}%` }} />
                      </div>
                      <p className="text-zinc-500 text-xs">{auditor.passed}P / {auditor.failed}F / {auditor.warned}W — {auditor.summary}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ALL CHECKS */}
            {tab === "checks" && (
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {r.auditResults.flatMap(ar => ar.checks.map(c => ({ ...c, _auditor: ar.auditor }))).map(c => (
                  <div key={c.id} className={`flex items-start gap-2 px-3 py-1.5 rounded-lg border text-xs ${c.status === "fail" ? "bg-red-950/10 border-red-900/30" : c.status === "warn" ? "bg-amber-950/10 border-amber-900/30" : "bg-zinc-900/50 border-zinc-800/30"}`}>
                    {statusBadge(c.status)}
                    <span className="text-zinc-500 shrink-0">[{c._auditor?.replace("Auditor", "")}]</span>
                    <span className="text-zinc-300 flex-1">{c.name}</span>
                    <span className={`font-mono shrink-0 ${c.score >= 90 ? "text-emerald-400" : c.score >= 50 ? "text-amber-400" : "text-red-400"}`}>{c.score}</span>
                  </div>
                ))}
              </div>
            )}

            {/* FAILURES */}
            {tab === "failures" && (
              <div className="space-y-3">
                {r.failures.length === 0 && r.warnings.length === 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-6 text-center">
                    <p className="text-emerald-400 font-bold text-sm">Zero failures, zero warnings. Architecture fully certified.</p>
                  </div>
                ) : null}
                {r.failures.map((f, i) => (
                  <div key={i} className="bg-red-950/15 border border-red-800/30 rounded-xl p-3 text-xs text-red-300">⚠ {f}</div>
                ))}
                {r.warnings.map((w, i) => (
                  <div key={i} className="bg-amber-950/15 border border-amber-800/30 rounded-xl p-3 text-xs text-amber-300">⚡ {w}</div>
                ))}
                {/* Failed checks */}
                {r.auditResults.flatMap(ar => ar.checks.filter(c => c.status === "fail").map(c => ({ ...c, _auditor: ar.auditor }))).map(c => (
                  <div key={c.id} className="bg-red-950/10 border border-red-900/20 rounded-xl p-3 space-y-1">
                    <div className="flex gap-2 items-center">
                      <Badge label="FAIL" color="red" />
                      <span className="text-zinc-400 text-xs">[{c._auditor}]</span>
                      <span className="text-red-300 text-xs font-bold">{c.name}</span>
                    </div>
                    {c.issues.map((iss, j) => <p key={j} className="text-red-400 text-xs pl-2">• {iss}</p>)}
                  </div>
                ))}
              </div>
            )}

            {/* METRICS */}
            {tab === "metrics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(r.metrics).filter(([k]) => typeof r.metrics[k] === "number").map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs bg-zinc-900/60 border border-zinc-800/40 rounded-lg px-3 py-2">
                      <span className="text-zinc-500 flex-1">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                      <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${v >= 90 ? "bg-emerald-600" : v >= 70 ? "bg-amber-600" : "bg-red-600"}`} style={{ width: `${Math.min(Number(v), 100)}%` }} />
                      </div>
                      <span className={`font-mono w-10 text-right ${Number(v) >= 90 ? "text-emerald-400" : Number(v) >= 70 ? "text-amber-400" : typeof v === "boolean" ? (v ? "text-emerald-400" : "text-red-400") : "text-red-400"}`}>
                        {typeof v === "boolean" ? (v ? "YES" : "NO") : Number(v).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HISTORY */}
            {tab === "history" && (
              <div className="space-y-2">
                <p className="text-zinc-500 text-xs">{hist.length} certification run(s) recorded.</p>
                {[...hist].reverse().map(entry => (
                  <div key={entry.id} className={`bg-zinc-900 border rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap text-xs ${entry.certified ? "border-emerald-700/30" : "border-red-700/30"}`}>
                    <Badge label={entry.certified ? "CERTIFIED" : "FAILED"} color={entry.certified ? "green" : "red"} />
                    <span className="text-zinc-300 font-mono">{entry.overallScore.toFixed(1)}/100</span>
                    <span className="text-zinc-600 flex-1">{new Date(entry.runAt).toLocaleTimeString()}</span>
                    <span className="text-zinc-500 text-xs">{Object.entries(entry.auditorResults).map(([k, v]) => `${k.replace("Auditor", "")}=${v.toFixed(0)}`).join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}