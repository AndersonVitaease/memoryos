// ABV v4 — Architectural Boundary Validation
// Foundation v1.0 · Engineering First · Baseline & Change Detection

import React, { useState, useCallback } from "react";
import { runABVTests } from "@/lib/abv/abvTests";

// ── UI primitives ─────────────────────────────────────────────────────────────

const SEV_COLORS = {
  CRITICAL: "bg-red-900/60 text-red-200 border-red-600/60",
  ERROR:    "bg-orange-900/50 text-orange-300 border-orange-700/50",
  WARNING:  "bg-yellow-900/50 text-yellow-300 border-yellow-700/50",
  INFO:     "bg-sky-900/40 text-sky-300 border-sky-700/40",
  PASS:     "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
  FAIL:     "bg-red-900/50 text-red-300 border-red-700/50",
  WARN:     "bg-yellow-900/50 text-yellow-300 border-yellow-700/50",
};

function Tag({ label }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${SEV_COLORS[label] ?? SEV_COLORS.INFO}`}>{label}</span>;
}

function Pill({ label, color = "zinc" }) {
  const c = {
    green:  "bg-emerald-900/30 border-emerald-800/40 text-emerald-400",
    red:    "bg-red-900/30 border-red-800/40 text-red-400",
    blue:   "bg-sky-900/30 border-sky-800/40 text-sky-400",
    violet: "bg-violet-900/30 border-violet-800/40 text-violet-400",
    zinc:   "bg-zinc-800 border-zinc-700 text-zinc-400",
  }[color] ?? "bg-zinc-800 border-zinc-700 text-zinc-400";
  return <span className={`px-1.5 py-0.5 rounded text-xs font-mono border ${c}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200", sub }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
      {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Compliance Score Gauge ────────────────────────────────────────────────────

function ScoreBar({ label, value }) {
  const color = value >= 90 ? "bg-emerald-500" : value >= 70 ? "bg-yellow-500" : "bg-red-500";
  const textColor = value >= 90 ? "text-emerald-400" : value >= 70 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={`font-mono font-bold ${textColor}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function CompliancePanel({ compliance }) {
  if (!compliance) return null;
  const overall = compliance.overallCompliance;
  const overallColor = overall >= 90 ? "text-emerald-400" : overall >= 70 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-zinc-400 text-xs uppercase tracking-wider">Architectural Compliance Score</p>
        <span className={`text-2xl font-bold font-mono ${overallColor}`}>{overall}%</span>
      </div>
      <ScoreBar label="Boundary Compliance"       value={compliance.boundaryCompliance} />
      <ScoreBar label="Dependency Compliance"     value={compliance.dependencyCompliance} />
      <ScoreBar label="API Compliance"            value={compliance.apiCompliance} />
      <ScoreBar label="Circular Dep. Score"       value={compliance.circularDependencyScore} />
      <ScoreBar label="Import Compliance"         value={compliance.importCompliance} />
    </div>
  );
}

// ── Evidence Table ─────────────────────────────────────────────────────────────

function EvidenceTable({ evidences, maxRows = 50 }) {
  const [filter, setFilter] = useState("ALL");
  const [expanded, setExpanded] = useState(null);

  const SEV_FILTERS = ["ALL", "CRITICAL", "ERROR", "WARNING", "INFO"];
  const filtered = filter === "ALL" ? evidences : evidences.filter(e => e.severity === filter);
  const shown = filtered.slice(0, maxRows);

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {SEV_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-xs font-mono font-bold border transition-colors ${filter === f ? (SEV_COLORS[f] ?? SEV_COLORS.INFO) : "bg-zinc-800 text-zinc-500 border-zinc-700"}`}
          >
            {f} ({f === "ALL" ? evidences.length : evidences.filter(e => e.severity === f).length})
          </button>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {shown.length === 0 && (
          <p className="text-zinc-600 text-xs p-4 text-center italic">Nenhuma evidencia {filter !== "ALL" ? `com severidade ${filter}` : ""}.</p>
        )}
        {shown.map(ev => (
          <div key={ev.evidenceId} className={`border-b border-zinc-800 last:border-0 ${ev.severity === "CRITICAL" ? "bg-red-950/10" : ev.severity === "ERROR" ? "bg-orange-950/10" : ""}`}>
            <button
              className="w-full flex items-start gap-2 py-2 px-3 text-left"
              onClick={() => setExpanded(expanded === ev.evidenceId ? null : ev.evidenceId)}
            >
              <Tag label={ev.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-200 truncate">{ev.description}</p>
                <p className="text-xs text-zinc-600 font-mono truncate">{ev.file.split("/src/lib/")[1] ?? ev.file}{ev.line ? `:${ev.line}` : ""}</p>
              </div>
              <span className="text-zinc-600 text-xs shrink-0">{ev.evidenceId}</span>
            </button>
            {expanded === ev.evidenceId && (
              <div className="px-3 pb-2 ml-2 border-l-2 border-zinc-700 space-y-1 text-xs">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {[
                    ["Rule",        ev.ruleId],
                    ["Module",      (ev.module || "").split("/src/lib/")[1] ?? ev.module],
                    ["File",        (ev.file || "").split("/src/lib/")[1] ?? ev.file],
                    ["Line",        ev.line ?? "—"],
                    ["Layer From",  ev.layerFrom ?? "—"],
                    ["Layer To",    ev.layerTo ?? "—"],
                    ["Boundary",    ev.boundaryViolated ?? "—"],
                    ["Dep Type",    ev.dependencyType ?? "—"],
                    ["Confidence",  `${ev.confidence}%`],
                    ["Status",      ev.status],
                  ].map(([k, v]) => (
                    <React.Fragment key={k}>
                      <span className="text-zinc-500">{k}</span>
                      <span className="text-zinc-300 font-mono truncate">{String(v)}</span>
                    </React.Fragment>
                  ))}
                </div>
                {ev.rawEvidence && (
                  <div className="mt-1 bg-zinc-800 rounded px-2 py-1">
                    <p className="text-zinc-500 text-xs mb-0.5">Raw Evidence</p>
                    <p className="text-zinc-300 font-mono text-xs break-all">{ev.rawEvidence}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length > maxRows && (
          <p className="text-zinc-600 text-xs p-2 text-center italic">
            Exibindo {maxRows} de {filtered.length} evidencias.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Layer Card ────────────────────────────────────────────────────────────────

function LayerCard({ layer }) {
  const [open, setOpen] = useState(false);
  const criticals = layer.boundaryEvidences.filter(e => e.severity === "CRITICAL");
  const errors    = [...layer.boundaryEvidences, ...layer.apiEvidences].filter(e => e.severity === "ERROR");

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Tag label={layer.status} />
          <span className="font-semibold text-sm text-white">{layer.label}</span>
          <span className="text-zinc-500 text-xs">({layer.filesAnalyzed} files)</span>
          {criticals.length > 0 && <span className="text-xs text-red-400 font-mono">{criticals.length} CRITICAL</span>}
          {errors.length > 0    && <span className="text-xs text-orange-400 font-mono">{errors.length} ERROR</span>}
        </div>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Deps permitidas</p>
              <div className="flex flex-wrap gap-1">
                {layer.allowedDeps.map(d => <Pill key={d} label={d} color="green" />)}
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Deps proibidas</p>
              <div className="flex flex-wrap gap-1">
                {layer.forbiddenDeps.map(d => <Pill key={d} label={d} color="red" />)}
              </div>
            </div>
          </div>
          {layer.detectedDeps.length > 0 && (
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Camadas detectadas no codigo</p>
              <div className="flex flex-wrap gap-1">
                {layer.detectedDeps.map(d => (
                  <Pill key={d} label={d} color={layer.forbiddenDeps.includes(d) ? "red" : "green"} />
                ))}
              </div>
            </div>
          )}
          {layer.publicApi.length > 0 && (
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Exports ({layer.publicApi.length})</p>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {layer.publicApi.map((m, i) => <Pill key={i} label={m} color="violet" />)}
              </div>
            </div>
          )}
          {layer.boundaryEvidences.length > 0 && (
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">Evidencias de Boundary ({layer.boundaryEvidences.length})</p>
              {layer.boundaryEvidences.slice(0, 5).map(e => (
                <div key={e.evidenceId} className="flex gap-2 items-start bg-zinc-800/50 rounded px-2 py-1">
                  <Tag label={e.severity} />
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-200 truncate">{e.description}</p>
                    <p className="text-xs text-zinc-500 font-mono">{e.file.split("/src/lib/")[1] ?? e.file}{e.line ? `:${e.line}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Criteria Tests ────────────────────────────────────────────────────────────

function TestRow({ n, name, passed, duration, detail, observation, error }) {
  const [open, setOpen] = useState(false);
  const hasExtra = detail || observation || error;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)} className="w-full flex items-center justify-between py-2 px-3 gap-2 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <Tag label={passed ? "PASS" : "FAIL"} />
          <span className="text-xs text-zinc-500 font-mono w-5 shrink-0">C{n}</span>
          <span className={`text-sm truncate ${passed ? "text-zinc-200" : "text-red-300"}`}>{name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500 font-mono">{duration}ms</span>
          {hasExtra && <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>}
        </div>
      </button>
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-10 border-l-2 border-zinc-700 mb-1 space-y-1">
          {detail && <p className="text-xs text-zinc-400">{detail}</p>}
          {observation && <p className="text-xs text-yellow-400/80 italic">obs: {observation}</p>}
          {error && <p className="text-xs text-red-400 font-mono">error: {error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Source Analysis Tab ───────────────────────────────────────────────────────

function SourceTab({ analysis }) {
  const [selected, setSelected] = useState(null);
  if (!analysis) return null;
  const layerEntries = Object.entries(analysis.layerMap).sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric label="Arquivos"  value={analysis.filesAnalyzed} />
        <Metric label="Imports"   value={analysis.importsFound}  color="text-sky-400" />
        <Metric label="Exports"   value={analysis.exportsFound}  color="text-violet-400" />
        <Metric label="Ciclos"    value={analysis.circularDependencies.length} color={analysis.circularDependencies.length > 0 ? "text-red-400" : "text-zinc-400"} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Arquivos por camada</p>
          {layerEntries.map(([layer, mods]) => (
            <div key={layer}
              className={`flex justify-between px-2 py-1 rounded cursor-pointer transition-colors ${selected === layer ? "bg-violet-900/30" : "hover:bg-zinc-800"}`}
              onClick={() => setSelected(selected === layer ? null : layer)}
            >
              <span className="text-xs font-mono text-zinc-300">{layer}</span>
              <span className="text-xs text-zinc-500">{mods.length}</span>
            </div>
          ))}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">
            {selected ? `Arquivos — ${selected}` : "Selecione uma camada"}
          </p>
          {selected && (
            <div className="max-h-56 overflow-y-auto space-y-1">
              {(analysis.layerMap[selected] ?? []).map(mod => (
                <div key={mod.path} className="px-2 py-1 hover:bg-zinc-800 rounded">
                  <p className="text-xs font-mono text-zinc-300 truncate">{mod.path.split("/src/lib/")[1] ?? mod.path}</p>
                  <p className="text-xs text-zinc-600">{mod.imports.length} imports · {mod.exports.length} exports</p>
                </div>
              ))}
            </div>
          )}
          {!selected && <p className="text-zinc-600 text-xs italic">Clique em uma camada</p>}
        </div>
      </div>
      {analysis.circularDependencies.length === 0 && (
        <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-3">
          <p className="text-emerald-400 text-xs">Nenhuma dependencia circular detectada.</p>
        </div>
      )}
      {analysis.circularDependencies.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-3 space-y-1">
          <p className="text-red-400 text-xs font-semibold mb-1">Dependencias Circulares ({analysis.circularDependencies.length})</p>
          {analysis.circularDependencies.map((c, i) => (
            <p key={i} className="text-xs font-mono text-red-300">{c.map(p => p.split("/src/lib/")[1] ?? p).join(" -> ")}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ABVPage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [elapsed, setElapsed]     = useState(null);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setData(null);
    const start = Date.now();
    try {
      const result = await runABVTests();
      setElapsed(Date.now() - start);
      setData(result);
      setActiveTab("results");
    } catch (e) {
      console.error("ABV audit error:", e);
    } finally {
      setRunning(false);
    }
  }, []);

  const summary = data ? (() => {
    const passed = data.results.filter(r => r.passed).length;
    return { passed, total: data.results.length, failed: data.results.length - passed };
  })() : null;

  const TABS = [
    { id: "overview",    label: "Visao Geral" },
    { id: "results",     label: data ? `Criterios (${summary.passed}/${summary.total})` : "Criterios" },
    { id: "compliance",  label: "Compliance Score" },
    { id: "baseline",    label: "Baseline" },
    { id: "changes",     label: data?.changeReport ? `Mudancas (${data.changeReport.totalChanges})` : "Mudancas" },
    { id: "timeline",    label: "Timeline" },
    { id: "graph",       label: "Dep. Graph" },
    { id: "evidences",   label: data ? `Evidencias (${data.report.allEvidences.length})` : "Evidencias" },
    { id: "source",      label: "Source Analysis" },
    { id: "report",      label: "Relatorio" },
  ];

  const report       = data?.report;
  const analysis     = data?.analysis;
  const changeReport = data?.changeReport;
  const timeline     = data?.timeline ?? [];
  const baseline     = data?.baseline;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-violet-400 text-xs font-mono uppercase tracking-widest">Engineering First</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400 text-xs font-mono">Foundation v1.0</span>
              <span className="text-zinc-600">·</span>
              <span className="text-emerald-400 text-xs font-mono">ABV v4 — Baseline & Change Detection</span>
            </div>
            <h1 className="text-xl font-bold">ABV — Architectural Boundary Validation</h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              Evidencias raštreaveis · Compliance Score · Read Only · 100% automatico
            </p>
          </div>
          <button
            onClick={runAudit}
            disabled={running}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            {running ? "Analisando..." : "▶ Executar Auditoria"}
          </button>
        </div>

        {summary && report && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric label="Criterios" value={`${summary.passed}/${summary.total}`} color={summary.failed === 0 ? "text-emerald-400" : "text-red-400"} />
            <Metric label="Evidencias" value={report.allEvidences.length} color="text-sky-400" sub={`${report.criticalEvidences.length} CRITICAL`} />
            <Metric label="Compliance" value={`${report.compliance.overallCompliance}%`} color={report.compliance.overallCompliance >= 90 ? "text-emerald-400" : "text-yellow-400"} />
            <Metric label="Regressoes" value={changeReport?.regressions ?? 0} color={changeReport?.regressions > 0 ? "text-red-400" : "text-zinc-400"} sub={`${changeReport?.totalChanges ?? 0} mudancas`} />
            <Metric label="Duracao" value={`${elapsed}ms`} color="text-violet-400" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${activeTab === t.id ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Baseline ── */}
      {activeTab === "baseline" && (
        <div>
          {!baseline && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {baseline && (
            <div className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-zinc-400 text-xs uppercase tracking-wider">Architectural Baseline</p>
                    <p className="text-white font-semibold">{baseline.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-violet-400 font-mono text-sm font-bold">{baseline.version}</p>
                    <p className="text-zinc-500 text-xs font-mono">{baseline.baselineId}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Arquivos"    value={baseline.filesAnalyzed} />
                  <Metric label="Imports"     value={baseline.importsAnalyzed} color="text-sky-400" />
                  <Metric label="Exports"     value={baseline.exportsAnalyzed} color="text-violet-400" />
                  <Metric label="Compliance"  value={`${baseline.compliance.overallCompliance}%`} color={baseline.compliance.overallCompliance >= 90 ? "text-emerald-400" : "text-yellow-400"} />
                  <Metric label="Boundaries OK"  value={baseline.boundariesApproved} color="text-emerald-400" />
                  <Metric label="Violacoes"      value={baseline.boundaryViolations ?? baseline.boundariesViolated} color={(baseline.boundaryViolations ?? baseline.boundariesViolated) > 0 ? "text-red-400" : "text-zinc-400"} />
                  <Metric label="Circulares"     value={baseline.circularDependencies} color={baseline.circularDependencies > 0 ? "text-red-400" : "text-zinc-400"} />
                  <Metric label="CRITICAL"       value={baseline.criticalCount} color={baseline.criticalCount > 0 ? "text-red-400" : "text-zinc-400"} />
                </div>
                <div className="flex gap-2 text-xs text-zinc-500 flex-wrap">
                  <span>Hash: <span className="font-mono text-zinc-400">{baseline.auditHash}</span></span>
                  <span>·</span>
                  <span>Timestamp: {new Date(baseline.timestamp).toISOString()}</span>
                  <span>·</span>
                  <span>Imutavel: sim</span>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Camadas no Baseline</p>
                {baseline.layers.map(l => (
                  <div key={l.id} className="bg-zinc-800/50 rounded px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className={`text-xs font-mono font-bold mr-2 ${l.status === "PASS" ? "text-emerald-400" : "text-red-400"}`}>[{l.status}]</span>
                      <span className="text-sm text-zinc-200">{l.label}</span>
                      <span className="text-zinc-500 text-xs ml-2">({l.filesAnalyzed} files)</span>
                    </div>
                    <div className="flex gap-2 text-xs text-zinc-500">
                      <span>Exports: {l.publicApi.length}</span>
                      <span>Deps: {l.detectedDeps.length}</span>
                      <span>Violations: {l.boundaryViolations}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Changes ── */}
      {activeTab === "changes" && (
        <div>
          {!changeReport && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {changeReport && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Metric label="Total mudancas"  value={changeReport.totalChanges} />
                <Metric label="Regressoes"      value={changeReport.regressions}  color={changeReport.regressions > 0 ? "text-red-400" : "text-zinc-400"} />
                <Metric label="Melhorias"       value={changeReport.improvements} color={changeReport.improvements > 0 ? "text-emerald-400" : "text-zinc-400"} />
                <Metric label="Trend"           value={changeReport.overallTrend} color={changeReport.overallTrend === "IMPROVED" ? "text-emerald-400" : changeReport.overallTrend === "REGRESSED" ? "text-red-400" : "text-zinc-400"} />
              </div>
              <div className={`rounded-lg px-3 py-2 text-xs border ${changeReport.regressions === 0 ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300" : "bg-amber-950/30 border-amber-800/40 text-amber-300"}`}>
                <strong>Conclusao:</strong> {changeReport.conclusion}
              </div>
              {/* Compliance deltas */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Evolucao do Compliance</p>
                {changeReport.complianceDeltas.map(d => (
                  <div key={d.metric} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 w-40 truncate">{d.metric}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-mono">{d.before}%</span>
                      <span className="text-zinc-600">→</span>
                      <span className={`font-mono font-bold ${d.trend === "IMPROVED" ? "text-emerald-400" : d.trend === "REGRESSED" ? "text-red-400" : "text-zinc-400"}`}>{d.after}%</span>
                      <span className={`font-mono text-xs ${d.delta > 0 ? "text-emerald-400" : d.delta < 0 ? "text-red-400" : "text-zinc-500"}`}>
                        ({d.delta >= 0 ? "+" : ""}{d.delta}%)
                      </span>
                      <span className={`text-xs ${d.trend === "IMPROVED" ? "text-emerald-500" : d.trend === "REGRESSED" ? "text-red-500" : "text-zinc-600"}`}>[{d.trend}]</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Change list */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800">
                  <p className="text-zinc-300 text-sm font-semibold">Mudancas Detectadas ({changeReport.changes.length})</p>
                </div>
                {changeReport.changes.length === 0 && (
                  <p className="text-zinc-600 text-xs p-4 italic">Nenhuma mudanca detectada — arquitetura identica.</p>
                )}
                {changeReport.changes.map((c, i) => (
                  <div key={i} className={`flex items-start gap-2 px-3 py-2 border-b border-zinc-800 last:border-0 ${c.changeType === "REGRESSION" ? "bg-red-950/10" : c.changeType === "IMPROVEMENT" ? "bg-emerald-950/10" : ""}`}>
                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
                      c.changeType === "REGRESSION"  ? "bg-red-900/50 text-red-300 border-red-700" :
                      c.changeType === "IMPROVEMENT" ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" :
                      c.changeType === "ADDED"       ? "bg-sky-900/40 text-sky-300 border-sky-700" :
                      c.changeType === "REMOVED"     ? "bg-yellow-900/40 text-yellow-300 border-yellow-700" :
                      "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}>{c.changeType}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-zinc-200">{c.description}</p>
                      <p className="text-xs text-zinc-600 font-mono">[{c.category}]{c.layer ? ` · ${c.layer}` : ""}</p>
                    </div>
                    <span className="text-zinc-600 text-xs shrink-0 font-mono">{c.evidence?.evidenceId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Timeline ── */}
      {activeTab === "timeline" && (
        <div>
          {!timeline.length && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {timeline.length > 0 && (
            <div className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800">
                  <p className="text-zinc-300 text-sm font-semibold">Evolution Timeline ({timeline.length} entrada{timeline.length !== 1 ? "s" : ""})</p>
                </div>
                {timeline.map((entry, i) => (
                  <div key={entry.baselineId} className="border-b border-zinc-800 last:border-0">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-3 h-3 rounded-full mt-0.5 ${entry.regressions > 0 ? "bg-red-500" : entry.improvements > 0 ? "bg-emerald-500" : "bg-zinc-600"}`} />
                        {i < timeline.length - 1 && <div className="w-px flex-1 bg-zinc-800 mt-1" style={{ minHeight: "20px" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <span className="text-violet-400 font-mono text-xs font-bold mr-2">{entry.version}</span>
                            <span className="text-zinc-200 text-sm">{entry.label}</span>
                          </div>
                          <span className={`text-sm font-bold font-mono ${entry.compliance >= 90 ? "text-emerald-400" : entry.compliance >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                            {entry.compliance}%
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 flex-wrap text-xs text-zinc-500">
                          <span>{new Date(entry.timestamp).toISOString().slice(0, 16)}</span>
                          <span>{entry.totalChanges} mudancas</span>
                          {entry.regressions > 0 && <span className="text-red-400">{entry.regressions} regressao(oes)</span>}
                          {entry.improvements > 0 && <span className="text-emerald-400">{entry.improvements} melhoria(s)</span>}
                          {entry.comparedToId && <span className="font-mono">vs {entry.comparedToId.slice(-6)}</span>}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 italic">{entry.conclusion}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            <p className="text-zinc-400 text-xs uppercase tracking-wider">ABV v4 — Baseline & Change Detection</p>
            {[
              "Source Code Analyzer — import.meta.glob, zero listas manuais",
              "EvidenceCollector — file+line+evidenceId em cada evidencia",
              "ComplianceScore — 5 indicadores 0-100 calculados automaticamente",
              "ArchitecturalBaseline — snapshot imutavel de cada auditoria",
              "BaselineRegistry — registro, dedup e historico de baselines",
              "ChangeDetectionEngine — diff automatico entre dois baselines",
              "RegressionDetector — ADDED/REMOVED/REGRESSION/IMPROVEMENT",
              "Evolution Timeline — linha do tempo da arquitetura",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="text-violet-400 shrink-0">→</span>{item}
              </div>
            ))}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            <p className="text-zinc-400 text-xs uppercase tracking-wider">Principios — Foundation v1.0</p>
            {[
              ["READ ONLY",  "O ABV nunca modifica codigo — apenas observa"],
              ["EVIDENCIAS", "Toda conclusao deve possuir evidencia correspondente"],
              ["RASTREAVEL", "Toda evidencia possui file, line, ruleId, evidenceId"],
              ["AUTOMATICO", "Zero listas manuais — toda info do codigo-fonte"],
              ["NEUTRAL",    "O ABV nunca interpreta — apenas registra fatos"],
            ].map(([k, v]) => (
              <div key={k} className="bg-zinc-800/50 rounded px-3 py-1.5">
                <span className="text-violet-400 text-xs font-mono font-bold mr-2">{k}</span>
                <span className="text-zinc-400 text-xs">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Criteria ── */}
      {activeTab === "results" && (
        <div>
          {!data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <p className="text-zinc-400 text-sm mb-3">Execute a auditoria para ver os criterios.</p>
              <button onClick={runAudit} disabled={running} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-semibold">
                {running ? "Analisando..." : "▶ Executar"}
              </button>
            </div>
          )}
          {data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200">ABV v4 — 12 Criterios de Aceitacao</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold ${summary.failed === 0 ? "text-emerald-400" : "text-red-400"}`}>{summary.passed}/{summary.total}</span>
                  <Tag label={summary.failed === 0 ? "PASS" : "FAIL"} />
                </div>
              </div>
              {data.results.map(r => <TestRow key={r.criterion} {...r} n={r.criterion} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Compliance Score ── */}
      {activeTab === "compliance" && (
        <div>
          {!report && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {report && (
            <div className="space-y-4">
              <CompliancePanel compliance={report.compliance} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Metric label="Boundaries aprovados" value={report.boundariesApproved} color="text-emerald-400" />
                <Metric label="Boundaries violados"  value={report.boundariesViolated} color={report.boundariesViolated > 0 ? "text-red-400" : "text-zinc-400"} />
                <Metric label="Deps proibidas"       value={report.forbiddenDeps}       color={report.forbiddenDeps > 0 ? "text-red-400" : "text-zinc-400"} />
                <Metric label="Circulares"           value={report.circularDependencies} color={report.circularDependencies > 0 ? "text-red-400" : "text-zinc-400"} />
                <Metric label="Modulos isolados"     value={report.isolatedModules.length} />
                <Metric label="Arquivos nao parsed"  value={report.unparsedFiles.length} color={report.unparsedFiles.length > 0 ? "text-yellow-400" : "text-zinc-400"} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dep Graph ── */}
      {activeTab === "graph" && (
        <div>
          {!report && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {report && <div className="space-y-3">{report.layers.map(l => <LayerCard key={l.layer} layer={l} />)}</div>}
        </div>
      )}

      {/* ── Evidences ── */}
      {activeTab === "evidences" && (
        <div>
          {!report && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {report && <EvidenceTable evidences={report.allEvidences} maxRows={100} />}
        </div>
      )}

      {/* ── Source Analysis ── */}
      {activeTab === "source" && (
        <div>
          {!analysis && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {analysis && <SourceTab analysis={analysis} />}
        </div>
      )}

      {/* ── Report ── */}
      {activeTab === "report" && (
        <div>
          {!report && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {report && (
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Resumo Executivo</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Arquivos analisados" value={report.filesAnalyzed} />
                  <Metric label="Imports analisados"  value={report.importsAnalyzed}  color="text-sky-400" />
                  <Metric label="Exports analisados"  value={report.exportsAnalyzed}  color="text-violet-400" />
                  <Metric label="Evidencias totais"   value={report.allEvidences.length} color="text-sky-400" />
                  <Metric label="CRITICAL"            value={report.criticalEvidences.length} color={report.criticalEvidences.length > 0 ? "text-red-400" : "text-zinc-400"} />
                  <Metric label="ERROR"               value={report.errorEvidences.length}    color={report.errorEvidences.length > 0 ? "text-orange-400" : "text-zinc-400"} />
                  <Metric label="Compliance Overall"  value={`${report.compliance.overallCompliance}%`} color={report.compliance.overallCompliance >= 90 ? "text-emerald-400" : "text-yellow-400"} />
                  <Metric label="Duracao"             value={`${report.durationMs}ms`} color="text-violet-400" />
                </div>
                <div className={`rounded px-3 py-2 text-xs border ${report.criticalEvidences.length === 0 && report.errorEvidences.length === 0 ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300" : "bg-amber-950/30 border-amber-800/40 text-amber-300"}`}>
                  <strong>Conclusao:</strong> {report.conclusion}
                </div>
                <div className="flex gap-2 flex-wrap text-xs text-zinc-500">
                  <span>Executado: {new Date(report.runAt).toISOString()}</span>
                  <span>·</span>
                  <span>Export: JSON ✓ · Markdown ready ✓ · HTML ready ✓</span>
                </div>
              </div>
              <CompliancePanel compliance={report.compliance} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}