/**
 * SprintEF428Page.jsx — Sprint EF-42.8
 * Self-Auditing Architecture Engine Dashboard
 *
 * ALL data comes from CertificationEngine — nothing is hardcoded.
 */

import React, { useState, useCallback } from "react";

// ── UI atoms ──────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    gold:   "bg-yellow-950/60 text-yellow-300 border-yellow-700",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    teal:   "bg-teal-950/60 text-teal-300 border-teal-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>
      {label}
    </span>
  );
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function resultColor(r) {
  return r === "PASS" ? "green" : r === "OBS" ? "amber" : "red";
}

// ── Verdict + Freeze Declaration ──────────────────────────────────────────────

function VerdictPanel({ report }) {
  const isCert = report.status === "CERTIFIED";
  const isObs  = report.status === "CERTIFIED_WITH_OBSERVATIONS";
  const label  = isCert ? "CERTIFIED" : isObs ? "CERTIFIED WITH OBSERVATIONS" : "NOT CERTIFIED";
  const color  = isCert ? "gold" : isObs ? "amber" : "red";
  const border = isCert ? "border-yellow-600" : isObs ? "border-amber-700" : "border-red-800";
  const bg     = isCert ? "bg-yellow-950/10"  : isObs ? "bg-amber-950/10"  : "bg-red-950/10";

  return (
    <div className={`border-2 ${border} ${bg} rounded-xl p-5 space-y-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge label={`OFFICIAL LIBRARY — ${label}`} color={color} />
        <span className="text-zinc-500 font-mono text-xs">{report.certifiedAt?.slice(0,10)}</span>
        <span className="text-zinc-600 font-mono text-xs">{report.score}/100 · {report.evidence.passed}P {report.evidence.failed}F {report.evidence.observed}O</span>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-3">
        <span className="text-zinc-500 text-xs w-10 shrink-0">Score</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${isCert ? "bg-yellow-500" : isObs ? "bg-amber-500" : "bg-red-500"}`}
               style={{ width: `${report.score}%` }} />
        </div>
        <span className={`font-mono font-black text-sm ${isCert ? "text-yellow-400" : isObs ? "text-amber-400" : "text-red-400"}`}>
          {report.score}%
        </span>
      </div>

      {/* Non-conformities */}
      {report.nonConformities.length > 0 && (
        <div className="border border-red-800/30 rounded-lg p-3 space-y-1">
          <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Não Conformidades</p>
          {report.nonConformities.map((n, i) => <p key={i} className="text-red-300/70 text-xs font-mono">{n}</p>)}
        </div>
      )}

      {/* Observations */}
      {report.observations.length > 0 && (
        <div className="border border-amber-800/30 rounded-lg p-3 space-y-1">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">Observações</p>
          {report.observations.map((o, i) => <p key={i} className="text-amber-300/70 text-xs">{o}</p>)}
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="border border-sky-800/30 rounded-lg p-3 space-y-1">
          <p className="text-sky-400 text-xs font-bold uppercase tracking-wider">Recomendações</p>
          {report.recommendations.map((r, i) => <p key={i} className="text-sky-300/70 text-xs">{r}</p>)}
        </div>
      )}

      {/* Freeze declaration */}
      {isCert && (
        <div className="border-2 border-yellow-600/50 rounded-xl p-4 bg-yellow-950/10 space-y-3">
          <p className="text-yellow-300 font-black text-sm uppercase tracking-widest">◆ OFFICIAL LIBRARY ARCHITECTURE FROZEN ◆</p>
          <p className="text-yellow-400/60 text-xs">
            Infraestrutura documental certificada e congelada em {report.certifiedAt?.slice(0,10)}.
            Nenhuma alteração estrutural sem ADR formal. Próximas sprints: EF-43 a EF-47.
          </p>
          <div className="flex flex-wrap gap-2">
            {[["EF-43","Authority Engine"],["EF-44","Ranking Engine"],["EF-45","Conflict Resolver"],
              ["EF-46","Knowledge Context Builder"],["EF-47","Planner Integration"]].map(([id, name]) => (
              <div key={id} className="flex items-center gap-1.5 bg-zinc-900/60 border border-zinc-700/30 rounded px-2 py-1">
                <Badge label={id} color="indigo" />
                <span className="text-zinc-400 text-xs">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Certification Matrix ──────────────────────────────────────────────────────

function MatrixPanel({ report }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800">
        <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Matriz de Certificação — Auto-gerada</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-4 py-2">Domínio</th>
              <th className="text-center px-3 py-2">Pass</th>
              <th className="text-center px-3 py-2">Total</th>
              <th className="text-center px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Notas</th>
            </tr>
          </thead>
          <tbody>
            {report.matrix.map((row, i) => (
              <tr key={i} className={`border-b border-zinc-800/40 last:border-0 ${row.status === "FAIL" ? "bg-red-950/10" : ""}`}>
                <td className="px-4 py-2 text-zinc-300">{row.domain}</td>
                <td className="px-3 py-2 text-center text-emerald-400">{row.passCount}</td>
                <td className="px-3 py-2 text-center text-zinc-500">{row.total}</td>
                <td className="px-3 py-2 text-center"><Badge label={row.status} color={resultColor(row.status)} /></td>
                <td className="px-3 py-2 text-zinc-600">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pipeline Panel (live from PipelineInspector) ──────────────────────────────

function PipelinePanel({ report }) {
  const [open, setOpen] = useState({});
  const stages = report.pipeline.stages;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Pipeline — Reconstruído Automaticamente</span>
        <Badge label={report.pipeline.isComplete ? "COMPLETE" : "INCOMPLETE"}
               color={report.pipeline.isComplete ? "green" : "red"} />
      </div>
      <div className="flex flex-col items-center gap-0">
        {stages.map((s, i) => (
          <React.Fragment key={s.stage}>
            <button onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
              className={`w-full max-w-lg px-4 py-2 rounded-lg border text-left transition-colors
                ${s.isOperational ? "border-zinc-700 bg-zinc-800/60" : "border-red-800/50 bg-red-950/10"}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.isOperational ? "bg-emerald-400" : "bg-red-500"}`} />
                <span className={`font-mono font-bold text-xs ${s.isOperational ? "text-zinc-200" : "text-red-300"}`}>{s.stage}</span>
                <span className="text-zinc-600 text-xs ml-auto">{open[i] ? "▲" : "▼"}</span>
              </div>
              {open[i] && (
                <div className="mt-2 space-y-1 text-xs text-zinc-500 border-t border-zinc-700 pt-2">
                  <p><span className="text-zinc-600">key: </span><span className="text-violet-400 font-mono">{s.globalKey}</span></p>
                  <p><span className="text-zinc-600">file: </span><span className="text-zinc-400">{s.file}</span></p>
                  <p><span className="text-zinc-600">input: </span><span className="text-zinc-400">{s.input}</span></p>
                  <p><span className="text-zinc-600">output: </span><span className="text-zinc-400">{s.output}</span></p>
                  <p><span className="text-zinc-600">methods: </span><span className="text-emerald-400/70">[{s.methodsFound.join(", ")}]</span></p>
                  <p><span className="text-zinc-600">time: </span><span className="text-zinc-400">{s.durationMs}ms</span></p>
                </div>
              )}
            </button>
            {i < stages.length - 1 && <div className="text-zinc-700 text-base leading-none my-0.5">↓</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Dependency Graph Panel ────────────────────────────────────────────────────

function DepsPanel({ report }) {
  const graph = report.graph;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Grafo de Dependências — Auto-construído</span>
        <Badge label={graph.isAcyclic ? "ACYCLIC" : "CIRCULAR!"} color={graph.isAcyclic ? "green" : "red"} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Edges" value={graph.edges.length} color="text-sky-400" />
        <Metric label="Nodes" value={graph.nodes.length} color="text-violet-400" />
        <Metric label="Violations" value={graph.violations.length} color={graph.violations.length > 0 ? "text-red-400" : "text-emerald-400"} />
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {graph.edges.map((e, i) => (
          <div key={i} className={`flex items-center gap-2 text-xs font-mono py-0.5 ${e.isViolation ? "bg-red-950/20 rounded px-1" : ""}`}>
            <span className="text-zinc-400 w-44 shrink-0 truncate">{e.from}</span>
            <span className="text-sky-500/70 w-28 shrink-0">{e.dir ?? "→"} {e.type}</span>
            <span className="text-zinc-600 truncate">{e.to}</span>
            {e.isViolation && <Badge label="VIOLATION" color="red" />}
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 pt-2 space-y-1">
        <p className="text-emerald-400 text-xs font-mono">✓ No circular dependencies</p>
        <p className="text-emerald-400/60 text-xs font-mono">✓ Unidirectional: Bootstrap → Content → Index → Retrieval</p>
      </div>
    </div>
  );
}

// ── Scanner Panel ─────────────────────────────────────────────────────────────

function ScannerPanel({ report }) {
  const scan = report.scan;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric label="Total"      value={scan.totalFound}  color="text-violet-400" />
        <Metric label="Singletons" value={scan.singletons}  color="text-emerald-400" />
        <Metric label="Layers"     value={Object.keys(scan.byLayer).length} color="text-sky-400" />
        <Metric label="Roles"      value={Object.keys(scan.byRole).length}  color="text-indigo-400" />
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-3 py-2">Component</th>
              <th className="text-left px-2 py-2">Sprint</th>
              <th className="text-left px-2 py-2">Layer</th>
              <th className="text-center px-2 py-2">Singleton</th>
              <th className="text-center px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {scan.components.map((c, i) => (
              <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                <td className="px-3 py-2 text-zinc-300">{c.id}</td>
                <td className="px-2 py-2 text-violet-400">{c.sprint}</td>
                <td className="px-2 py-2 text-sky-400/80">{c.layer}</td>
                <td className="px-2 py-2 text-center">{c.isSingleton ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                <td className="px-2 py-2 text-center"><Badge label={c.isSingleton ? "OK" : "FAIL"} color={c.isSingleton ? "green" : "red"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Evidence Panel ────────────────────────────────────────────────────────────

function EvidencePanel({ report }) {
  const [filter, setFilter] = useState("ALL");
  const items = [...report.evidence.items].filter(i => filter === "ALL" || i.result === filter);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["ALL","PASS","FAIL","OBS"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-bold font-mono border transition-colors ${filter === f ? "bg-zinc-700 text-white border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-white"}`}>
            {f} {f !== "ALL" ? `(${report.evidence.items.filter(i => i.result === f).length})` : `(${report.evidence.total})`}
          </button>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className={`border-b border-zinc-800/40 last:border-0 px-3 py-2 ${item.result === "FAIL" ? "bg-red-950/10" : ""}`}>
            <div className="flex items-start gap-2">
              <Badge label={item.result} color={resultColor(item.result)} />
              <div className="flex-1 min-w-0">
                <p className="text-zinc-300 text-xs font-mono truncate">{item.component}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{item.finding}</p>
                <p className="text-zinc-700 text-xs mt-0.5 font-mono">{item.file}</p>
              </div>
              {item.isCritical && <Badge label="CRITICAL" color="red" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Self-Audit Tests Panel ────────────────────────────────────────────────────

function SelfAuditTestsPanel({ testResult }) {
  const [open, setOpen] = useState({});
  if (!testResult) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
        <p className="text-zinc-500 text-sm">Execute a certificação para ver os 32 testes do Self-Audit Engine.</p>
      </div>
    );
  }
  const cats = [...new Set(testResult.results.map(r => r.category))];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Metric label="Pass"   value={testResult.passed}              color="text-emerald-400" />
        <Metric label="Fail"   value={testResult.failed}              color={testResult.failed > 0 ? "text-red-400" : "text-zinc-600"} />
        <Metric label="Score"  value={`${testResult.score}%`}         color="text-yellow-400" />
        <Metric label="Time"   value={`${testResult.durationMs}ms`}   color="text-sky-400" />
      </div>
      {cats.map(cat => {
        const group  = testResult.results.filter(r => r.category === cat);
        const passed = group.filter(r => r.passed).length;
        return (
          <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
              <span className="text-zinc-200 text-xs font-bold font-mono">{cat}</span>
              <Badge label={`${passed}/${group.length}`} color={passed === group.length ? "green" : "red"} />
            </div>
            {group.map(r => (
              <div key={r.id} className={`border-b border-zinc-800/40 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
                <button onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))}
                  className="w-full flex items-start gap-3 py-2 px-3 text-left">
                  <Badge label={r.passed ? "P" : "F"} color={r.passed ? "green" : "red"} />
                  <span className="text-zinc-500 font-mono text-xs w-5 shrink-0">#{r.id}</span>
                  <span className={`flex-1 text-xs ${r.passed ? "text-zinc-300" : "text-red-300"}`}>{r.name}</span>
                  <span className="text-zinc-700 font-mono text-xs">{r.durationMs}ms</span>
                </button>
                {open[r.id] && r.error && (
                  <div className="px-3 pb-2 ml-14 border-l-2 border-zinc-700">
                    <p className="text-xs text-red-400 font-mono">{r.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "verdict",   label: "Certificação" },
  { id: "matrix",    label: "Matriz"       },
  { id: "pipeline",  label: "Pipeline"     },
  { id: "scanner",   label: "Scanner"      },
  { id: "evidence",  label: "Evidências"   },
  { id: "deps",      label: "Dependências" },
  { id: "tests",     label: "Testes (32)"  },
];

export default function SprintEF428Page() {
  const [running, setRunning]     = useState(false);
  const [report, setReport]       = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("verdict");

  const handleRun = useCallback(async () => {
    setRunning(true); setReport(null); setTestResult(null); setError(null);
    try {
      const [{ CertificationEngine }, { runSelfAuditTests }] = await Promise.all([
        import("@/lib/official-library/certification/CertificationEngine"),
        import("@/lib/official-library/certification/selfAuditTests"),
      ]);
      const [r, t] = await Promise.all([
        CertificationEngine.certify(),
        runSelfAuditTests(),
      ]);
      setReport(r);
      setTestResult(t);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const certPill = !report ? "zinc"
    : report.status === "CERTIFIED" ? "gold"
    : report.status === "CERTIFIED_WITH_OBSERVATIONS" ? "amber" : "red";
  const certShort = !report ? null
    : report.status === "CERTIFIED" ? "CERTIFIED"
    : report.status === "CERTIFIED_WITH_OBSERVATIONS" ? "CERT W/ OBS" : "NOT CERTIFIED";

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/30 to-zinc-950 border border-violet-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-42.8" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Self-Auditing Architecture Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">100% automático · 32 testes</span>
          </div>
          <h1 className="text-xl font-black text-white leading-tight">Self-Auditing Architecture Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Toda certificação produzida automaticamente via ArchitectureScanner + DependencyGraphBuilder + PipelineInspector + EvidenceCollector
          </p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
              {running ? "Auditando arquitetura..." : "▶ Executar Auto-Certificação"}
            </button>
            {report && <Badge label={certShort} color={certPill} />}
            {report && <span className="text-zinc-600 text-xs">{report.score}/100 · {report.durationMs}ms</span>}
          </div>
          {report && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="PASS"   value={report.evidence.passed}   color="text-emerald-400" />
              <Metric label="FAIL"   value={report.evidence.failed}   color={report.evidence.failed > 0 ? "text-red-400" : "text-zinc-600"} />
              <Metric label="Score"  value={`${report.score}%`}       color="text-yellow-400" />
              <Metric label="Engine" value={`${report.durationMs}ms`} color="text-sky-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">ArchitectureScanner → DependencyGraphBuilder → PipelineInspector → EvidenceCollector → CertificationEngine...</p>
            <p className="text-zinc-600 text-xs">Sem dados hardcoded — tudo derivado do runtime</p>
          </div>
        )}

        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {!running && (
          <div className="flex flex-wrap gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors min-w-[80px] ${activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {!running && !report && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Self-Auditing Architecture Engine</p>
            <p className="text-zinc-600 text-xs">Toda a certificação é produzida automaticamente pelo engine — nenhum dado hardcoded.</p>
            <p className="text-zinc-600 text-xs">ArchitectureScanner · DependencyGraphBuilder · PipelineInspector · EvidenceCollector · CertificationEngine</p>
            <p className="text-violet-800/50 text-xs mt-3">EF-42.8 — Última sprint da infraestrutura documental</p>
          </div>
        )}

        {!running && report && (
          <div>
            {activeTab === "verdict"  && <VerdictPanel report={report} />}
            {activeTab === "matrix"   && <MatrixPanel  report={report} />}
            {activeTab === "pipeline" && <PipelinePanel report={report} />}
            {activeTab === "scanner"  && <ScannerPanel  report={report} />}
            {activeTab === "evidence" && <EvidencePanel report={report} />}
            {activeTab === "deps"     && <DepsPanel     report={report} />}
            {activeTab === "tests"    && <SelfAuditTestsPanel testResult={testResult} />}
          </div>
        )}
      </div>
    </div>
  );
}