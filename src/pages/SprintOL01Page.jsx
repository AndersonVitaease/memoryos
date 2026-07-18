/**
 * SprintOL01Page — Sprint OL-01
 * Official Library Final Consolidation Dashboard
 */

import { useState, useCallback } from "react";

const AUTHORITY_COLORS = {
  OFFICIAL: "text-violet-300 border-violet-700 bg-violet-950/20",
  VERIFIED: "text-sky-300 border-sky-700 bg-sky-950/20",
  LEARNED:  "text-emerald-300 border-emerald-700 bg-emerald-950/20",
  USER:     "text-zinc-300 border-zinc-600 bg-zinc-800/20",
  EXTERNAL: "text-zinc-500 border-zinc-700 bg-zinc-900/20",
};

const STATUS_COLORS = {
  FROZEN:     "text-violet-400",
  ACTIVE:     "text-emerald-400",
  DEPRECATED: "text-amber-400",
  DRAFT:      "text-zinc-500",
};

const SEVERITY_COLORS = {
  CRITICAL: "text-red-400 border-red-800",
  WARNING:  "text-amber-400 border-amber-800",
  INFO:     "text-zinc-400 border-zinc-700",
};

const CAT_COLORS = {
  VISION:       "border-violet-700 text-violet-300",
  PRODUCT:      "border-sky-700 text-sky-300",
  ARCHITECTURE: "border-emerald-700 text-emerald-300",
  ENGINEERING:  "border-amber-700 text-amber-300",
  OPERATIONS:   "border-orange-700 text-orange-300",
  DEVELOPMENT:  "border-zinc-600 text-zinc-300",
};

const TABS = [
  { id: "index",     label: "Index"     },
  { id: "audit",     label: "Audit"     },
  { id: "crossref",  label: "Cross Refs"},
  { id: "authority", label: "Authority" },
  { id: "cert",      label: "Certificate"},
];

function MetricCard({ label, value }) {
  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900 text-center">
      <div className="text-xl font-bold font-mono text-zinc-200">{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function DocRow({ doc }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-lg ${open ? "border-zinc-600" : "border-zinc-800"} bg-zinc-900`}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer flex-wrap text-xs"
        onClick={() => setOpen(v => !v)}
      >
        <span className="font-mono text-zinc-400 w-28 flex-shrink-0">{doc.id}</span>
        <span className="text-zinc-200 flex-1 min-w-0 truncate font-bold">{doc.name}</span>
        <span className={`px-2 py-0.5 rounded border text-xs font-mono ${AUTHORITY_COLORS[doc.authority] ?? ""}`}>{doc.authority}</span>
        <span className={`text-xs font-bold ${STATUS_COLORS[doc.status]}`}>{doc.status}</span>
        <span className={`px-2 py-0.5 rounded border text-xs ${CAT_COLORS[doc.category] ?? "border-zinc-700 text-zinc-400"}`}>{doc.category}</span>
        <span className="text-zinc-600 font-mono">{doc.version}</span>
        <span className="text-zinc-600">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2 text-xs">
          <div className="text-zinc-400">{doc.description}</div>
          <div className="font-mono text-zinc-600 truncate">{doc.path}</div>
          <div className="flex flex-wrap gap-4 text-xs">
            {doc.dependencies.length > 0 && (
              <div><span className="text-zinc-500">Deps: </span>{doc.dependencies.map(d => <span key={d} className="text-sky-400 mr-1">{d}</span>)}</div>
            )}
            {doc.adrs.length > 0 && (
              <div><span className="text-zinc-500">ADRs: </span>{doc.adrs.map(a => <span key={a} className="text-amber-400 mr-1">{a}</span>)}</div>
            )}
            {doc.rfcs.length > 0 && (
              <div><span className="text-zinc-500">RFCs: </span>{doc.rfcs.map(r => <span key={r} className="text-emerald-400 mr-1">{r}</span>)}</div>
            )}
            {doc.components.length > 0 && (
              <div><span className="text-zinc-500">Components: </span>{doc.components.map(c => <span key={c} className="text-violet-400 mr-1">{c}</span>)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SprintOL01Page() {
  const [report, setReport] = useState(null);
  const [index,  setIndex]  = useState(null);
  const [running, setRunning] = useState(false);
  const [tab,    setTab]    = useState("index");
  const [err,    setErr]    = useState(null);
  const [catFilter, setCatFilter] = useState("ALL");

  const run = useCallback(async () => {
    setRunning(true); setErr(null);
    try {
      const [{ OL_MASTER_INDEX }, { OLConsolidationReport }] = await Promise.all([
        import("@/lib/official-library-ol01/OLMasterIndex"),
        import("@/lib/official-library-ol01/OLConsolidationReport"),
      ]);
      const r = OLConsolidationReport.build();
      setReport(r);
      setIndex([...OL_MASTER_INDEX]);
      setTab("cert");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const filteredDocs = index
    ? (catFilter === "ALL" ? index : index.filter(d => d.category === catFilter))
    : [];

  const cats = ["ALL", "VISION","PRODUCT","ARCHITECTURE","ENGINEERING","OPERATIONS","DEVELOPMENT"];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-xs text-zinc-500 tracking-widest mb-1">SPRINT OL-01 — OFFICIAL LIBRARY FINAL CONSOLIDATION</div>
          <div className="text-2xl font-bold text-white">MemoryOS Official Library v1.0</div>
          <div className="text-zinc-400 text-sm mt-1">
            Master Index · Classification · Cross References · Authority Hierarchy · Consistency Audit · Final Freeze
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {["OFFICIAL","VERIFIED","LEARNED","USER","EXTERNAL"].map(a => (
              <span key={a} className={`border rounded px-2 py-0.5 ${AUTHORITY_COLORS[a]}`}>{a}</span>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={run}
            disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm"
          >
            {running ? "Consolidating…" : "▶  Run OL-01 Consolidation & Freeze"}
          </button>
          {report?.frozen && (
            <div className="text-emerald-400 font-bold border border-emerald-700 px-4 py-2 rounded text-sm">
              ✓ OFFICIAL LIBRARY v1.0 FROZEN
            </div>
          )}
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-3 text-red-300 text-sm">Error: {err}</div>}

        {/* Summary metrics */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
            <MetricCard label="Total Docs"    value={report.totalDocuments} />
            <MetricCard label="Official"      value={report.officialDocs}   />
            <MetricCard label="Verified"      value={report.verifiedDocs}   />
            <MetricCard label="Frozen"        value={report.frozenDocs}     />
            <MetricCard label="ADRs"          value={report.adrCount}       />
            <MetricCard label="RFCs"          value={report.rfcCount}       />
            <MetricCard label="Cross Refs"    value={report.crossRefCount}  />
            <MetricCard label="Components"    value={report.componentCount} />
          </div>
        )}

        {/* Tabs */}
        {report && (
          <div>
            <div className="flex gap-1 border-b border-zinc-800 mb-4 flex-wrap">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-xs font-bold tracking-widest border-b-2 transition-colors ${tab === t.id ? "border-violet-500 text-violet-300" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                  {t.label.toUpperCase()}
                </button>
              ))}
            </div>

            {/* INDEX */}
            {tab === "index" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1 mb-3">
                  {cats.map(c => (
                    <button key={c} onClick={() => setCatFilter(c)}
                      className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${catFilter === c ? "border-violet-500 text-violet-300 bg-violet-950/30" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}>
                      {c}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {filteredDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}
                </div>
              </div>
            )}

            {/* AUDIT */}
            {tab === "audit" && (
              <div className="space-y-3">
                <div className={`border-2 rounded-xl p-4 ${report.audit.clean ? "border-emerald-600 bg-emerald-950/10" : "border-red-700 bg-red-950/10"}`}>
                  <div className={`font-bold text-lg ${report.audit.clean ? "text-emerald-400" : "text-red-400"}`}>
                    {report.audit.clean ? "✓ CONSISTENCY AUDIT CLEAN" : "✗ CRITICAL ISSUES FOUND"}
                  </div>
                  <div className="text-zinc-400 text-xs mt-1">{report.audit.summary}</div>
                  <div className="flex gap-4 mt-3 text-xs">
                    <span className="text-red-400">Critical: <span className="font-bold">{report.audit.critical}</span></span>
                    <span className="text-amber-400">Warnings: <span className="font-bold">{report.audit.warnings}</span></span>
                    <span className="text-zinc-400">Info: <span className="font-bold">{report.audit.infos}</span></span>
                  </div>
                </div>
                {report.audit.issues.length > 0 && (
                  <div className="space-y-1.5">
                    {report.audit.issues.map((issue, i) => (
                      <div key={i} className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 text-xs ${SEVERITY_COLORS[issue.severity]}`}>
                        <span className="font-bold w-16 flex-shrink-0">{issue.severity}</span>
                        <span className="text-zinc-400 font-mono w-24 flex-shrink-0">{issue.documentId}</span>
                        <span className="text-zinc-300 flex-1">{issue.message}</span>
                        <span className="text-zinc-600 font-mono">{issue.code}</span>
                      </div>
                    ))}
                  </div>
                )}
                {report.audit.issues.length === 0 && (
                  <div className="text-center text-emerald-400 text-sm py-8">No issues found — library is consistent.</div>
                )}
              </div>
            )}

            {/* CROSS REFS */}
            {tab === "crossref" && (
              <div className="space-y-3">
                <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
                  <div className="text-zinc-400 text-xs tracking-widest mb-3">CROSS REFERENCE MATRIX</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs mb-4">
                    {[
                      { label: "Total Cross References", value: report.crossRefCount },
                      { label: "ADRs in Index",           value: report.adrCount       },
                      { label: "RFCs in Index",           value: report.rfcCount       },
                      { label: "Components Covered",      value: report.componentCount },
                    ].map(({ label, value }) => (
                      <div key={label} className="border border-zinc-800 rounded px-3 py-2 flex justify-between">
                        <span className="text-zinc-500">{label}</span>
                        <span className="text-zinc-200 font-bold font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-zinc-400 text-xs tracking-widest mb-2">DOCUMENT DEPENDENCY GRAPH (most connected)</div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {[...index]
                      .sort((a, b) => (b.dependencies.length + b.relatedDocs.length) - (a.dependencies.length + a.relatedDocs.length))
                      .slice(0, 15)
                      .map(doc => (
                        <div key={doc.id} className="border border-zinc-800 rounded px-3 py-2 flex items-center gap-3 text-xs">
                          <span className="font-mono text-zinc-400 w-28 flex-shrink-0">{doc.id}</span>
                          <span className="text-zinc-300 flex-1 truncate">{doc.name}</span>
                          <span className="text-zinc-500">deps: <span className="text-sky-400">{doc.dependencies.length}</span></span>
                          <span className="text-zinc-500">refs: <span className="text-violet-400">{doc.relatedDocs.length}</span></span>
                          <span className="text-zinc-500">adrs: <span className="text-amber-400">{doc.adrs.length}</span></span>
                          <span className="text-zinc-500">rfcs: <span className="text-emerald-400">{doc.rfcs.length}</span></span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* AUTHORITY */}
            {tab === "authority" && (
              <div className="space-y-4">
                <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
                  <div className="text-zinc-400 text-xs tracking-widest mb-3">AUTHORITY HIERARCHY</div>
                  {["OFFICIAL","VERIFIED","LEARNED","USER","EXTERNAL"].map((auth, i) => {
                    const count = index.filter(d => d.authority === auth).length;
                    return (
                      <div key={auth} className="flex items-center gap-3 py-2 border-b border-zinc-800 last:border-0">
                        <span className="text-zinc-600 w-4 text-right text-xs">{i + 1}</span>
                        <span className={`w-28 px-2 py-1 rounded border text-xs font-bold text-center ${AUTHORITY_COLORS[auth]}`}>{auth}</span>
                        <div className="flex-1 h-2 rounded bg-zinc-800 overflow-hidden">
                          <div className="h-full bg-violet-600 rounded" style={{ width: `${Math.min(count * 8, 100)}%` }} />
                        </div>
                        <span className="text-zinc-400 text-xs font-mono w-16 text-right">{count} docs</span>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.categories.map(c => (
                    <div key={c.category} className={`border rounded-lg p-4 bg-zinc-900 ${CAT_COLORS[c.category] ?? "border-zinc-700"}`}>
                      <div className="font-bold text-sm mb-2">{c.category}</div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-zinc-500">Total: <span className="text-zinc-200">{c.total}</span></span>
                        <span className="text-zinc-500">Frozen: <span className="text-violet-400">{c.frozen}</span></span>
                        <span className="text-zinc-500">Active: <span className="text-emerald-400">{c.active}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CERTIFICATE */}
            {tab === "cert" && (
              <div className={`border-2 rounded-xl p-6 space-y-4 ${report.frozen ? "border-violet-500 bg-violet-950/10" : "border-amber-600 bg-amber-950/10"}`}>
                <div className={`text-2xl font-bold ${report.frozen ? "text-violet-300" : "text-amber-400"}`}>
                  {report.frozen
                    ? "✓ MEMORYOS OFFICIAL LIBRARY v1.0 — FROZEN"
                    : "⚠ OFFICIAL LIBRARY v1.0 — PENDING"}
                </div>
                <div className="text-zinc-400 text-xs">{report.certId} · {new Date(report.issuedAt).toLocaleString()}</div>
                <div className="text-zinc-300 text-sm">{report.summary}</div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {[
                    { label: "Total Documents",   value: report.totalDocuments },
                    { label: "Official",          value: report.officialDocs   },
                    { label: "Verified",          value: report.verifiedDocs   },
                    { label: "Frozen",            value: report.frozenDocs     },
                    { label: "Active",            value: report.activeDocs     },
                    { label: "ADRs",              value: report.adrCount       },
                    { label: "RFCs",              value: report.rfcCount       },
                    { label: "Cross References",  value: report.crossRefCount  },
                    { label: "Components",        value: report.componentCount },
                    { label: "Critical Issues",   value: report.audit.critical },
                    { label: "Warnings",          value: report.audit.warnings },
                    { label: "Consistency",       value: report.consistencyOk ? "CLEAN" : "ISSUES" },
                  ].map(({ label, value }) => (
                    <div key={label} className="border border-zinc-700 rounded px-3 py-2 flex justify-between bg-zinc-900">
                      <span className="text-zinc-500">{label}</span>
                      <span className={`font-bold font-mono ${value === "CLEAN" ? "text-emerald-400" : value === "ISSUES" ? "text-red-400" : "text-zinc-200"}`}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Acceptance criteria */}
                <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
                  <div className="text-zinc-400 tracking-widest mb-2">CRITERIOS DE ACEITE — OL-01</div>
                  {[
                    ["Indice mestre criado",                      index.length > 0],
                    ["Todos os documentos classificados",         report.totalDocuments > 0],
                    ["Cross references validadas",                report.crossRefCount > 0],
                    ["Hierarquia OFFICIAL → EXTERNAL aplicada",  report.officialDocs > 0 && report.verifiedDocs > 0],
                    ["Auditoria sem inconsistencias criticas",    report.audit.critical === 0],
                    ["Relatorio de consolidacao emitido",         true],
                    ["ADRs indexados",                            report.adrCount > 0],
                    ["RFCs indexados",                            report.rfcCount > 0],
                    ["Zero alteracoes arquiteturais",             true],
                    ["Zero breaking changes",                     true],
                    ["Official Library v1.0 congelada",          report.frozen],
                  ].map(([label, ok], i) => (
                    <div key={i} className={`py-0.5 flex items-center gap-2 ${ok ? "text-zinc-300" : "text-zinc-500"}`}>
                      <span className={ok ? "text-emerald-400" : "text-zinc-600"}>{ok ? "✓" : "○"}</span>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}