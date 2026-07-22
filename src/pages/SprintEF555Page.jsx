/**
 * SprintEF555Page.jsx — Sprint EF-55.1 · Official Certification Dashboard
 */

import React, { useState, useCallback, useRef } from "react";
import { SystemCertificationEngine } from "@/lib/system-certification/SystemCertificationEngine";
import { CertificationHistory }      from "@/lib/system-certification/CertificationHistory";

// ── UI Atoms ──────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:  "bg-amber-950/60  text-amber-300  border-amber-700",
    red:    "bg-red-950/60    text-red-300    border-red-800",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:    "bg-sky-950/60    text-sky-300    border-sky-700",
    zinc:   "bg-zinc-800/60   text-zinc-400   border-zinc-600",
    gold:   "bg-yellow-950/60 text-yellow-300 border-yellow-700",
    teal:   "bg-teal-950/60   text-teal-300   border-teal-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function Gauge({ label, value }) {
  const color    = value >= 90 ? "text-emerald-400" : value >= 75 ? "text-amber-400" : "text-red-400";
  const barColor = value >= 90 ? "bg-emerald-600"   : value >= 75 ? "bg-amber-600"   : "bg-red-600";
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

function ConfBar({ label, value }) {
  const pct = Math.round(value * 100);
  const col = pct >= 90 ? "bg-emerald-600" : pct >= 70 ? "bg-amber-600" : "bg-red-600";
  const tc  = pct >= 90 ? "text-emerald-400" : pct >= 70 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${col}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono w-8 text-right ${tc}`}>{pct}%</span>
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
  { id: "overview",    label: "Overview" },
  { id: "scenarios",  label: "Golden Scenarios" },
  { id: "pipeline",   label: "Pipeline Trace" },
  { id: "auditors",   label: "Auditors" },
  { id: "checks",     label: "All Checks" },
  { id: "failures",   label: "Failures" },
  { id: "metrics",    label: "Metrics" },
  { id: "history",    label: "History" },
];

const AUDITOR_ORDER = [
  "GoldenScenarioAuditor", "IntegrationAuditor", "PipelineAuditor", "ContractAuditor",
  "DependencyAuditor", "IsolationAuditor", "PerformanceAuditor", "ObservabilityAuditor",
  "ExplainabilityAuditor", "DeterminismAuditor", "ArchitecturalComplianceAuditor",
];

export default function SprintEF555Page() {
  const [tab,     setTab]     = useState("overview");
  const [report,  setReport]  = useState(null);
  const [golden,  setGolden]  = useState(null);
  const [running, setRunning] = useState(false);
  const [logs,    setLogs]    = useState([]);
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
      setGolden(SystemCertificationEngine.getLastGoldenSummary());
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
        <div className={`border rounded-xl p-5 ${r?.certified ? "bg-emerald-950/20 border-emerald-700/40" : r ? "bg-red-950/15 border-red-700/40" : "bg-zinc-900 border-zinc-800"}`}>
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-55.1" color="gold" />
            <Badge label="OFFICIAL CERTIFICATION" color="indigo" />
            <span className="text-zinc-500">Real Runtime Evidence Only · Zero Synthetic Data</span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {r?.certified ? "✓ ARCHITECTURE CERTIFIED" : r ? "✗ CERTIFICATION FAILED" : "Official System Certification"}
          </h1>
          <p className="text-zinc-500 text-xs mt-1">8 Golden Scenarios · 11 Auditors · RuntimeTraceCollector · EF-43→EF-54</p>
          {r && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge label={`score=${r.metrics.overallCertificationScore.toFixed(1)}/100`} color={r.certified ? "green" : "red"} />
              <Badge label={`${r.auditResults.filter(a => a.status === "pass").length}/${r.auditResults.length} auditors`} color="sky" />
              <Badge label={`${r.durationMs}ms`} color="zinc" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleCertify} disabled={running}
              className="px-5 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
              {running ? "Certificando..." : "▶ Executar Certificação Oficial"}
            </button>
            {r && <Badge label={r.certified ? "CERTIFIED" : "NOT CERTIFIED"} color={r.certified ? "green" : "red"} />}
            {golden && <Badge label={`${golden.passed}/${golden.totalScenarios} scenarios`} color={golden.failed === 0 ? "green" : "amber"} />}
          </div>
          {(running || logs.length > 0) && (
            <div className="bg-zinc-950 rounded-lg p-3 space-y-0.5 max-h-48 overflow-y-auto">
              {logs.map((log, i) => (
                <p key={i} className={`text-xs font-mono ${log.includes("ERROR") ? "text-red-400" : log.includes("CERTIFIED") || log.includes("pass") || log.includes("PASS") ? "text-emerald-400" : log.includes("FAIL") || log.includes("fail") ? "text-red-400" : "text-zinc-400"}`}>
                  [{String(i + 1).padStart(2, "0")}] {log}
                </p>
              ))}
              {running && <p className="text-zinc-600 text-xs animate-pulse">running...</p>}
            </div>
          )}
        </div>

        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Certificação Oficial EF-55.1</p>
            <p className="text-zinc-600 text-xs">Toda evidência é capturada pelo Runtime — zero dados sintéticos.</p>
            <p className="text-zinc-600 text-xs">8 Golden Scenarios · Pipeline Integrity · Connector Validation · Evidence Validation</p>
          </div>
        )}

        {r && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto flex-wrap">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-w-fit px-2 ${tab === t.id ? "bg-yellow-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* OVERVIEW */}
            {tab === "overview" && (
              <div className="space-y-4">
                <div className={`border rounded-xl p-4 ${r.certified ? "bg-emerald-950/20 border-emerald-700/30" : "bg-red-950/15 border-red-800/30"}`}>
                  <p className={`text-lg font-black ${r.certified ? "text-emerald-300" : "text-red-300"}`}>
                    {r.certified ? "✓ CERTIFIED — EF-56 autorizada" : "✗ NOT CERTIFIED — resolver issues antes da EF-56"}
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">{r.summary}</p>
                </div>
                {golden && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs font-bold mb-2">Golden Scenarios — Runtime Evidence</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      <div className="bg-zinc-800/60 rounded-lg p-2 text-center"><div className="text-emerald-400 text-lg font-black">{golden.passed}</div><div className="text-zinc-500 text-xs">Passed</div></div>
                      <div className="bg-zinc-800/60 rounded-lg p-2 text-center"><div className="text-red-400 text-lg font-black">{golden.failed}</div><div className="text-zinc-500 text-xs">Failed</div></div>
                      <div className="bg-zinc-800/60 rounded-lg p-2 text-center"><div className="text-amber-400 text-lg font-black">{(golden.overallConf * 100).toFixed(0)}%</div><div className="text-zinc-500 text-xs">Confidence</div></div>
                      <div className="bg-zinc-800/60 rounded-lg p-2 text-center"><div className="text-sky-400 text-lg font-black">{golden.overallScore.toFixed(0)}</div><div className="text-zinc-500 text-xs">Score</div></div>
                    </div>
                  </div>
                )}
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

            {/* GOLDEN SCENARIOS */}
            {tab === "scenarios" && golden && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <Badge label="RUNTIME EVIDENCE" color="indigo" />
                  <span className="text-zinc-500">Nenhum dado sintético · Todos os IDs vêm do Runtime</span>
                </div>
                {golden.results.map(sc => (
                  <div key={sc.scenarioId} className={`bg-zinc-900 border rounded-xl p-4 space-y-3 ${sc.status === "fail" ? "border-red-800/40" : sc.status === "warn" ? "border-amber-700/30" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(sc.status)}
                      <Badge label={sc.scenarioId} color="sky" />
                      <span className="text-zinc-200 text-sm font-bold flex-1">{sc.scenarioName}</span>
                      <span className={`font-mono text-sm ${sc.score >= 90 ? "text-emerald-400" : sc.score >= 70 ? "text-amber-400" : "text-red-400"}`}>{sc.score}/100</span>
                      <span className="text-zinc-600 text-xs">{sc.durationMs}ms</span>
                    </div>
                    {/* Certification Confidence */}
                    <div className="space-y-1 pl-1">
                      <p className="text-zinc-500 text-xs mb-1">Certification Confidence</p>
                      <ConfBar label="Structural"  value={sc.confidence.structural} />
                      <ConfBar label="Behavior"    value={sc.confidence.behavior} />
                      <ConfBar label="Evidence"    value={sc.confidence.evidence} />
                      <ConfBar label="Runtime"     value={sc.confidence.runtime} />
                      <ConfBar label="Overall"     value={sc.confidence.overall} />
                    </div>
                    {/* Evidence */}
                    {sc.evidence.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {sc.evidence.slice(0, 6).map((ev, i) => <Badge key={i} label={ev} color="teal" />)}
                        {sc.evidence.length > 6 && <Badge label={`+${sc.evidence.length - 6} more`} color="zinc" />}
                      </div>
                    )}
                    {sc.issues.length > 0 && sc.issues.map((iss, i) => (
                      <p key={i} className="text-red-400 text-xs">• {iss}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* PIPELINE TRACE */}
            {tab === "pipeline" && (
              <div className="space-y-2">
                <div className="flex gap-2 items-center text-xs flex-wrap">
                  <Badge label={`trace_id=${r.pipelineTrace.id.slice(-12)}`} color="zinc" />
                  <Badge label={`allTraceable=${r.pipelineTrace.allIdsTraceable}`} color={r.pipelineTrace.allIdsTraceable ? "green" : "red"} />
                  <Badge label="REAL IDs" color="indigo" />
                  <Badge label={`${r.pipelineTrace.totalDurationMs}ms`} color="zinc" />
                </div>
                {r.pipelineTrace.steps.length === 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 text-sm">Nenhuma etapa capturada — execute a certificação para ver o trace real.</div>
                )}
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
                        <span className="text-zinc-300 text-xs font-bold flex-1">{step.inputSummary} → {step.outputSummary}</span>
                        <span className="text-zinc-600 text-xs">{step.durationMs}ms</span>
                      </div>
                      <div className="text-xs text-zinc-600 mt-0.5 font-mono">{step.id.slice(0, 40)}</div>
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
                  const isGolden = name === "GoldenScenarioAuditor";
                  return (
                    <div key={name} className={`bg-zinc-900 border rounded-xl p-4 ${isGolden ? "border-yellow-700/40" : auditor.status === "fail" ? "border-red-800/40" : "border-zinc-800"}`}>
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {statusBadge(auditor.status)}
                        {isGolden && <Badge label="REAL RUNTIME" color="gold" />}
                        <span className="text-zinc-200 text-sm font-bold flex-1">{auditor.auditor}</span>
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
              <div className="space-y-2">
                {r.failures.length === 0 && r.warnings.length === 0 && r.auditResults.every(a => a.checks.every(c => c.status !== "fail")) ? (
                  <div className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-6 text-center">
                    <p className="text-emerald-400 font-bold">Zero failures · Zero warnings · Architecture fully certified.</p>
                  </div>
                ) : null}
                {r.failures.map((f, i) => <div key={i} className="bg-red-950/15 border border-red-800/30 rounded-xl p-3 text-xs text-red-300">⚠ {f}</div>)}
                {r.warnings.map((w, i) => <div key={i} className="bg-amber-950/15 border border-amber-800/30 rounded-xl p-3 text-xs text-amber-300">⚡ {w}</div>)}
                {r.auditResults.flatMap(ar => ar.checks.filter(c => c.status === "fail").map(c => ({ ...c, _auditor: ar.auditor }))).map(c => (
                  <div key={c.id} className="bg-red-950/10 border border-red-900/20 rounded-xl p-3 space-y-1">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge label="FAIL" color="red" />
                      <span className="text-zinc-400 text-xs">[{c._auditor}]</span>
                      <span className="text-red-300 text-xs font-bold">{c.name}</span>
                    </div>
                    {c.issues.map((iss, j) => <p key={j} className="text-red-400 text-xs pl-2">• {iss}</p>)}
                    {c.evidence.slice(0, 3).map((ev, j) => <p key={j} className="text-zinc-600 text-xs pl-2 font-mono">{ev}</p>)}
                  </div>
                ))}
              </div>
            )}

            {/* METRICS */}
            {tab === "metrics" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(r.metrics).filter(([, v]) => typeof v === "number").map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 text-xs bg-zinc-900/60 border border-zinc-800/40 rounded-lg px-3 py-2">
                    <span className="text-zinc-500 flex-1">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                    <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${Number(v) >= 90 ? "bg-emerald-600" : Number(v) >= 70 ? "bg-amber-600" : "bg-red-600"}`} style={{ width: `${Math.min(Number(v), 100)}%` }} />
                    </div>
                    <span className={`font-mono w-10 text-right ${Number(v) >= 90 ? "text-emerald-400" : Number(v) >= 70 ? "text-amber-400" : "text-red-400"}`}>{Number(v).toFixed(1)}</span>
                  </div>
                ))}
                <div className="md:col-span-2 bg-zinc-900/60 border border-zinc-800/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Certified</span>
                  <Badge label={r.metrics.certified ? "YES" : "NO"} color={r.metrics.certified ? "green" : "red"} />
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
                    <span className="text-zinc-500 text-xs">{Object.entries(entry.auditorResults).map(([k, v]) => `${k.replace("Auditor", "")}=${Number(v).toFixed(0)}`).join(" · ")}</span>
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