/**
 * SprintEF429Page.jsx — Sprint EF-42.9
 * Official Architecture Certification
 *
 * Sole data source: CertificationEngine (EF-42.8) + ArchitectureBaselineBuilder + OfficialCertificationRecord
 * Zero hardcoded information — all derived from runtime.
 */

import React, { useState, useCallback } from "react";

// ── Atoms ─────────────────────────────────────────────────────────────────────

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

function Metric({ label, value, sub, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-xl px-3 py-2.5 text-center">
      <div className={`text-sm font-black font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
      {sub && <div className="text-zinc-700 text-xs font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function resultColor(r) {
  return r === "PASS" ? "green" : r === "OBS" ? "amber" : "red";
}

function download(content, filename, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Freeze Certificate ────────────────────────────────────────────────────────

function FreezeCertificate({ report, baseline, artifacts }) {
  const isCert = report.status === "CERTIFIED";
  const isObs  = report.status === "CERTIFIED_WITH_OBSERVATIONS";
  const label  = isCert ? "CERTIFIED" : isObs ? "CERTIFIED WITH OBSERVATIONS" : "NOT CERTIFIED";
  const color  = isCert ? "gold" : isObs ? "amber" : "red";
  const border = isCert ? "border-yellow-500" : isObs ? "border-amber-700" : "border-red-800";
  const bg     = isCert ? "bg-yellow-950/10" : isObs ? "bg-amber-950/10" : "bg-red-950/10";

  return (
    <div className={`border-2 ${border} ${bg} rounded-xl p-5 space-y-5`}>

      {/* Status line */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge label={`OFFICIAL LIBRARY — ${label}`} color={color} />
        <span className="text-zinc-500 font-mono text-xs">v{baseline.version}</span>
        <span className="text-zinc-600 font-mono text-xs">{report.score}/100</span>
      </div>

      {/* Baseline identity card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        {[
          ["Architecture Version", `v${baseline.version}`],
          ["Certification ID",     baseline.certificationId],
          ["Structural Hash",      baseline.structuralHash],
          ["Frozen Since",         baseline.frozenAt?.slice(0,19).replace("T"," ")],
          ["Architecture Score",   `${baseline.score}/100`],
          ["ADR Reference",        baseline.adrReference],
          ["Pipeline",             `${baseline.pipelineStages} stages (${baseline.pipelineComplete ? "complete" : "incomplete"})`],
          ["Graph",                `${baseline.graphEdges} edges · acyclic: ${baseline.graphIsAcyclic}`],
          ["Evidence",             `${baseline.evidencePassed}/${baseline.evidenceTotal} passed`],
          ["Certification Status", report.status],
        ].map(([k, v]) => (
          <div key={k} className={`rounded-lg border px-3 py-2 ${isCert ? "border-yellow-800/30 bg-yellow-950/10" : "border-zinc-700/30 bg-zinc-900/40"}`}>
            <span className="text-zinc-600">{k}: </span>
            <span className={isCert ? "text-yellow-300 font-bold" : "text-zinc-300"}>{v}</span>
          </div>
        ))}
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-3">
        <span className="text-zinc-600 text-xs w-14 shrink-0">Score</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isCert ? "bg-yellow-500" : isObs ? "bg-amber-500" : "bg-red-500"}`}
               style={{ width: `${report.score}%` }} />
        </div>
        <span className={`font-mono font-black text-sm ${isCert ? "text-yellow-400" : isObs ? "text-amber-400" : "text-red-400"}`}>
          {report.score}%
        </span>
      </div>

      {/* Non-conformities */}
      {report.nonConformities.length > 0 && (
        <div className="border border-red-800/30 rounded-lg p-3 space-y-1">
          <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Não Conformidades ({report.nonConformities.length})</p>
          {report.nonConformities.map((n, i) => <p key={i} className="text-red-300/70 text-xs font-mono">{n}</p>)}
        </div>
      )}

      {/* Observations */}
      {report.observations.length > 0 && (
        <div className="border border-amber-800/30 rounded-lg p-3 space-y-1">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">Observações ({report.observations.length})</p>
          {report.observations.map((o, i) => <p key={i} className="text-amber-300/70 text-xs">{o}</p>)}
        </div>
      )}

      {/* Risks */}
      {report.risks.length > 0 && (
        <div className="border border-zinc-700/30 rounded-lg p-3 space-y-1">
          <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Riscos</p>
          {report.risks.map((r, i) => <p key={i} className="text-zinc-500 text-xs">{r}</p>)}
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="border border-sky-800/30 rounded-lg p-3 space-y-1">
          <p className="text-sky-400 text-xs font-bold uppercase tracking-wider">Recomendações</p>
          {report.recommendations.map((r, i) => <p key={i} className="text-sky-300/70 text-xs">{r}</p>)}
        </div>
      )}

      {/* FREEZE DECLARATION */}
      {isCert && (
        <div className="border-2 border-yellow-500/70 rounded-xl p-5 bg-yellow-950/10 space-y-4">
          <div className="space-y-1">
            <p className="text-yellow-300 font-black text-base uppercase tracking-widest font-mono">
              ◆ OFFICIAL LIBRARY ARCHITECTURE v{baseline.version} — FROZEN ◆
            </p>
            <p className="text-yellow-400/50 text-xs font-mono">
              ARCHITECTURE FREEZE ENABLED · {baseline.frozenAt?.slice(0,10)} · ID: {baseline.certificationId}
            </p>
          </div>
          <p className="text-yellow-400/60 text-xs">
            A infraestrutura documental do MemoryOS está certificada e congelada.
            Nenhuma alteração estrutural poderá ocorrer sem aprovação formal via ADR ({baseline.adrReference}).
            A camada cognitiva está autorizada a partir desta certificação.
          </p>
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Próximas Sprints Autorizadas</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[["EF-43","Authority Engine"],["EF-44","Ranking Engine"],["EF-45","Conflict Resolver"],
                ["EF-46","Knowledge Context Builder"],["EF-47","Planner Integration"]].map(([id, name]) => (
                <div key={id} className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-700/30 rounded px-3 py-1.5">
                  <Badge label={id} color="indigo" />
                  <span className="text-zinc-300 text-xs">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Download artifacts */}
      {artifacts && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
          <button onClick={() => download(artifacts.adr, "ADR-Official-Library-Freeze.md")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 border border-zinc-700 transition-colors">
            ↓ ADR-Official-Library-Freeze.md
          </button>
          <button onClick={() => download(artifacts.report, "OfficialArchitectureCertificationReport.md")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 border border-zinc-700 transition-colors">
            ↓ OfficialArchitectureCertificationReport.md
          </button>
          <button onClick={() => download(JSON.stringify(baseline, null, 2), "ArchitectureBaseline.json", "application/json")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 border border-zinc-700 transition-colors">
            ↓ ArchitectureBaseline.json
          </button>
        </div>
      )}
    </div>
  );
}

// ── Matrix Panel ──────────────────────────────────────────────────────────────

function MatrixPanel({ report }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Matriz de Certificação</span>
        <span className="text-zinc-600 text-xs font-mono">auto-gerada · CertificationEngine</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-4 py-2 w-36">Domínio</th>
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
      <div className="px-4 py-3 border-t border-zinc-800 grid grid-cols-4 gap-2">
        <Metric label="Domínios" value={report.matrix.length} color="text-violet-400" />
        <Metric label="All PASS" value={report.matrix.filter(r => r.status === "PASS").length} color="text-emerald-400" />
        <Metric label="OBS"      value={report.matrix.filter(r => r.status === "OBS").length}  color="text-amber-400" />
        <Metric label="FAIL"     value={report.matrix.filter(r => r.status === "FAIL").length} color={report.matrix.filter(r => r.status === "FAIL").length > 0 ? "text-red-400" : "text-zinc-600"} />
      </div>
    </div>
  );
}

// ── Baseline Panel ────────────────────────────────────────────────────────────

function BaselinePanel({ baseline, artifacts }) {
  const [showJson, setShowJson] = useState(false);
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">ArchitectureBaseline v{baseline.version}</span>
          <Badge label={baseline.status} color={baseline.status === "CERTIFIED" ? "gold" : baseline.status === "CERTIFIED_WITH_OBSERVATIONS" ? "amber" : "red"} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="Componentes" value={baseline.totalComponents}  color="text-violet-400" />
          <Metric label="Singletons"  value={baseline.totalSingletons}  color="text-emerald-400" />
          <Metric label="Edges"       value={baseline.graphEdges}        color="text-sky-400" />
          <Metric label="Score"       value={`${baseline.score}%`}       color="text-yellow-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-xs">
          <div className="bg-zinc-800/40 rounded-lg px-3 py-2">
            <span className="text-zinc-600">certificationId: </span>
            <span className="text-yellow-300 text-xs">{baseline.certificationId}</span>
          </div>
          <div className="bg-zinc-800/40 rounded-lg px-3 py-2">
            <span className="text-zinc-600">structuralHash: </span>
            <span className="text-sky-300 text-xs font-mono break-all">{baseline.structuralHash}</span>
          </div>
          <div className="bg-zinc-800/40 rounded-lg px-3 py-2">
            <span className="text-zinc-600">frozenAt: </span>
            <span className="text-zinc-300">{baseline.frozenAt?.slice(0,19).replace("T"," ")}</span>
          </div>
          <div className="bg-zinc-800/40 rounded-lg px-3 py-2">
            <span className="text-zinc-600">adrReference: </span>
            <span className="text-indigo-300">{baseline.adrReference}</span>
          </div>
        </div>
        <button onClick={() => setShowJson(s => !s)}
          className="text-xs text-zinc-500 hover:text-zinc-300 font-mono underline">
          {showJson ? "hide JSON" : "view ArchitectureBaseline.json"}
        </button>
        {showJson && (
          <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-emerald-400/80 overflow-x-auto max-h-64 font-mono">
            {JSON.stringify(baseline, null, 2)}
          </pre>
        )}
      </div>

      {/* ADR preview */}
      {artifacts && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">ADR-Official-Library-Freeze.md</span>
            <button onClick={() => download(artifacts.adr, "ADR-Official-Library-Freeze.md")}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono">↓ download</button>
          </div>
          <pre className="p-4 text-xs text-zinc-400 font-mono overflow-x-auto max-h-64 whitespace-pre-wrap">
            {artifacts.adr.slice(0, 1800)}{artifacts.adr.length > 1800 ? "\n…(truncated)" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Evidence Panel ────────────────────────────────────────────────────────────

function EvidencePanel({ report }) {
  const [filter, setFilter] = useState("ALL");
  const all   = report.evidence.items;
  const items = filter === "ALL" ? all : all.filter(i => i.result === filter);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {["ALL","PASS","FAIL","OBS"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-bold font-mono border transition-colors
              ${filter === f ? "bg-zinc-700 text-white border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-white"}`}>
            {f} ({f === "ALL" ? all.length : all.filter(i => i.result === f).length})
          </button>
        ))}
        <span className="text-zinc-700 text-xs font-mono self-center ml-auto">
          {report.evidence.passed}P · {report.evidence.failed}F · {report.evidence.observed}O / {report.evidence.total}
        </span>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden max-h-[520px] overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className={`border-b border-zinc-800/40 last:border-0 px-3 py-2.5 ${item.result === "FAIL" ? "bg-red-950/10" : ""}`}>
            <div className="flex items-start gap-2">
              <Badge label={item.result} color={resultColor(item.result)} />
              <span className="text-zinc-600 text-xs font-mono w-5 shrink-0">#{item.id}</span>
              <div className="flex-1 min-w-0">
                <p className="text-zinc-300 text-xs font-mono truncate">{item.component}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{item.finding}</p>
                <p className="text-zinc-700 text-xs font-mono mt-0.5">{item.file}</p>
              </div>
              {item.isCritical && <Badge label="CRITICAL" color="red" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pipeline Panel ────────────────────────────────────────────────────────────

function PipelinePanel({ report }) {
  const [open, setOpen] = useState({});
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Pipeline — {report.pipeline.operationalStages}/{report.pipeline.totalStages} operacional</span>
        <Badge label={report.pipeline.isComplete ? "COMPLETE" : "INCOMPLETE"} color={report.pipeline.isComplete ? "green" : "red"} />
      </div>
      <div className="flex flex-col items-center gap-0">
        {report.pipeline.stages.map((s, i, arr) => (
          <React.Fragment key={s.stage}>
            <button onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
              className={`w-full max-w-lg px-4 py-2 rounded-lg border text-left transition-colors
                ${s.isOperational ? "border-zinc-700 bg-zinc-800/60 hover:border-zinc-600" : "border-red-800/40 bg-red-950/10"}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.isOperational ? "bg-emerald-400" : "bg-red-500"}`} />
                <span className={`font-mono font-bold text-xs ${s.isOperational ? "text-zinc-200" : "text-red-300"}`}>{s.stage}</span>
                <span className="text-zinc-700 text-xs ml-auto">{s.durationMs}ms {open[i] ? "▲" : "▼"}</span>
              </div>
              {open[i] && (
                <div className="mt-2 space-y-1 text-xs border-t border-zinc-700 pt-2">
                  <p><span className="text-zinc-600">globalKey: </span><span className="text-violet-400 font-mono">{s.globalKey}</span></p>
                  <p><span className="text-zinc-600">file: </span><span className="text-zinc-400">{s.file}</span></p>
                  <p><span className="text-zinc-600">input → output: </span><span className="text-zinc-400">{s.input} → {s.output}</span></p>
                  <p><span className="text-zinc-600">methods: </span><span className="text-emerald-400/70">[{s.methodsFound.join(", ")}]</span></p>
                </div>
              )}
            </button>
            {i < arr.length - 1 && <div className="text-zinc-700 text-sm leading-none my-0.5">↓</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Report Preview ────────────────────────────────────────────────────────────

function ReportPreview({ artifacts }) {
  if (!artifacts) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">OfficialArchitectureCertificationReport.md</span>
        <button onClick={() => download(artifacts.report, "OfficialArchitectureCertificationReport.md")}
          className="text-xs text-zinc-500 hover:text-zinc-300 font-mono">↓ download</button>
      </div>
      <pre className="p-4 text-xs text-zinc-400 font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">
        {artifacts.report.slice(0, 3000)}{artifacts.report.length > 3000 ? "\n…(see download for full report)" : ""}
      </pre>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "certificate", label: "Certificação"   },
  { id: "matrix",      label: "Matriz"         },
  { id: "pipeline",    label: "Pipeline"       },
  { id: "baseline",    label: "Baseline + ADR" },
  { id: "evidence",    label: "Evidências"     },
  { id: "report",      label: "Relatório"      },
];

export default function SprintEF429Page() {
  const [running, setRunning]       = useState(false);
  const [report, setReport]         = useState(null);
  const [baseline, setBaseline]     = useState(null);
  const [artifacts, setArtifacts]   = useState(null);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState("certificate");

  const handleRun = useCallback(async () => {
    setRunning(true);
    setReport(null); setBaseline(null); setArtifacts(null); setError(null);
    try {
      const [
        { CertificationEngine },
        { ArchitectureBaselineBuilder },
        { OfficialCertificationRecord },
      ] = await Promise.all([
        import("@/lib/official-library/certification/CertificationEngine"),
        import("@/lib/official-library/certification/ArchitectureBaselineBuilder"),
        import("@/lib/official-library/certification/OfficialCertificationRecord"),
      ]);

      const r  = await CertificationEngine.certify();
      const b  = ArchitectureBaselineBuilder.build(r);
      const ar = OfficialCertificationRecord.generate(r, b);

      setReport(r);
      setBaseline(b);
      setArtifacts(ar);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const certPill  = !report ? "zinc" : report.status === "CERTIFIED" ? "gold" : report.status === "CERTIFIED_WITH_OBSERVATIONS" ? "amber" : "red";
  const certShort = !report ? null   : report.status === "CERTIFIED" ? "CERTIFIED" : report.status === "CERTIFIED_WITH_OBSERVATIONS" ? "CERT W/ OBS" : "NOT CERTIFIED";

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-950/25 to-zinc-950 border border-yellow-700/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-42.9" color="gold" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Architecture Certification</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Encerramento da fase de infraestrutura documental</span>
          </div>
          <h1 className="text-xl font-black text-white leading-tight">Official Library Certification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Powered by CertificationEngine (EF-42.8) · Baseline · ADR · Relatório Executivo
          </p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
              {running ? "Certificando..." : "▶ Emitir Certificação Oficial"}
            </button>
            {report && <Badge label={certShort} color={certPill} />}
            {baseline && <span className="text-zinc-600 text-xs font-mono">{baseline.certificationId}</span>}
          </div>
          {report && baseline && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Score"      value={`${baseline.score}%`}      color="text-yellow-400" />
              <Metric label="Evidências" value={`${report.evidence.passed}/${report.evidence.total}`} color="text-emerald-400" />
              <Metric label="Hash"       value={baseline.structuralHash.slice(0,12)+"…"} color="text-sky-400" />
              <Metric label="Tempo"      value={`${report.durationMs}ms`}  color="text-violet-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-yellow-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">CertificationEngine → ArchitectureBaselineBuilder → OfficialCertificationRecord...</p>
            <p className="text-zinc-600 text-xs">Gerando Baseline · ADR · Relatório Executivo</p>
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
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors min-w-[80px]
                  ${activeTab === t.id ? "bg-yellow-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {!running && !report && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">EF-42.9 — Certificação Oficial da Infraestrutura Documental</p>
            <p className="text-zinc-600 text-xs">Emite: Certificação · Baseline · ADR · Relatório Executivo</p>
            <p className="text-zinc-600 text-xs">Fonte única: CertificationEngine (EF-42.8) — zero dados hardcoded</p>
            <p className="text-yellow-900/50 text-xs mt-3">Pressione "Emitir Certificação Oficial" para encerrar a fase de infraestrutura</p>
          </div>
        )}

        {!running && report && baseline && (
          <div>
            {activeTab === "certificate" && <FreezeCertificate report={report} baseline={baseline} artifacts={artifacts} />}
            {activeTab === "matrix"      && <MatrixPanel  report={report} />}
            {activeTab === "pipeline"    && <PipelinePanel report={report} />}
            {activeTab === "baseline"    && <BaselinePanel baseline={baseline} artifacts={artifacts} />}
            {activeTab === "evidence"    && <EvidencePanel report={report} />}
            {activeTab === "report"      && <ReportPreview artifacts={artifacts} />}
          </div>
        )}
      </div>
    </div>
  );
}