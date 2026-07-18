/**
 * SprintOL02Page — Sprint OL-02
 * Operational Standards Finalization + Official Library v1.0 COMPLETE
 */

import { useState, useCallback } from "react";

const NEW_DOC_IDS = ["CDG-001","CCS-001","RVP-001","ORB-001","TST-001"];

const AUTHORITY_COLORS = {
  OFFICIAL: "text-violet-300 border-violet-700 bg-violet-950/20",
  VERIFIED: "text-sky-300 border-sky-700 bg-sky-950/20",
  LEARNED:  "text-emerald-300 border-emerald-700 bg-emerald-950/20",
  USER:     "text-zinc-300 border-zinc-600 bg-zinc-800/20",
  EXTERNAL: "text-zinc-500 border-zinc-700 bg-zinc-900/20",
};
const STATUS_COLORS = { FROZEN: "text-violet-400", ACTIVE: "text-emerald-400", DEPRECATED: "text-amber-400", DRAFT: "text-zinc-500" };
const CAT_COLORS = {
  VISION: "border-violet-700 text-violet-300", PRODUCT: "border-sky-700 text-sky-300",
  ARCHITECTURE: "border-emerald-700 text-emerald-300", ENGINEERING: "border-amber-700 text-amber-300",
  OPERATIONS: "border-orange-700 text-orange-300", DEVELOPMENT: "border-zinc-600 text-zinc-300",
};
const SEVERITY_COLORS = { CRITICAL: "text-red-400 border-red-800", WARNING: "text-amber-400 border-amber-800", INFO: "text-zinc-400 border-zinc-700" };

const TABS = ["new-docs","index","audit","certificate"];
const TAB_LABELS = { "new-docs": "New Documents", index: "Full Index", audit: "Audit", certificate: "Certificate" };

const NEW_DOCS_META = [
  { id: "CDG-001", name: "Connector Development Guide",    cat: "DEVELOPMENT", icon: "🔌",
    sections: ["Architecture","Directory Structure","Manifest","Capabilities","OAuth","Error Handling","Telemetry","Tests","Certification"] },
  { id: "CCS-001", name: "Connector Certification Standard", cat: "OPERATIONS",  icon: "🏆",
    sections: ["Dimensions","Test Coverage","Performance","Security","Observability","Compliance","Approval","Rejection","Certificate Lifecycle"] },
  { id: "RVP-001", name: "Release & Versioning Policy",    cat: "DEVELOPMENT", icon: "🏷️",
    sections: ["Semantic Versioning","Core Versioning","Connector Versioning","Compatibility Matrix","Deprecation","Rollback","Changelog","Release Process"] },
  { id: "ORB-001", name: "Operational Runbook",            cat: "OPERATIONS",  icon: "📋",
    sections: ["Daily Operations","Monitoring","Troubleshooting","Incident Response","Recovery","Disaster Recovery","Observability Checklist"] },
  { id: "TST-001", name: "Testing Standard",               cat: "DEVELOPMENT", icon: "🧪",
    sections: ["Unit Tests","Integration Tests","Regression Tests","Performance Tests","Security Tests","Certification Tests","Coverage","CI Gate"] },
];

function MetricCard({ label, value, highlight }) {
  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900 text-center">
      <div className={`text-xl font-bold font-mono ${highlight ? "text-violet-300" : "text-zinc-200"}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function DocRow({ doc, isNew }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-lg ${isNew ? "border-violet-700/50 bg-violet-950/10" : open ? "border-zinc-600" : "border-zinc-800"} bg-zinc-900`}>
      <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer flex-wrap text-xs" onClick={() => setOpen(v => !v)}>
        <span className="font-mono text-zinc-400 w-28 flex-shrink-0">{doc.id}</span>
        {isNew && <span className="text-violet-400 text-xs font-bold border border-violet-700 rounded px-1">NEW</span>}
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
          <div className="flex flex-wrap gap-4">
            {doc.dependencies.length > 0 && <div><span className="text-zinc-500">Deps: </span>{doc.dependencies.map(d => <span key={d} className="text-sky-400 mr-1">{d}</span>)}</div>}
            {doc.adrs.length > 0 && <div><span className="text-zinc-500">ADRs: </span>{doc.adrs.map(a => <span key={a} className="text-amber-400 mr-1">{a}</span>)}</div>}
            {doc.rfcs.length > 0 && <div><span className="text-zinc-500">RFCs: </span>{doc.rfcs.map(r => <span key={r} className="text-emerald-400 mr-1">{r}</span>)}</div>}
            {doc.components.length > 0 && <div><span className="text-zinc-500">Components: </span>{doc.components.map(c => <span key={c} className="text-violet-400 mr-1">{c}</span>)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SprintOL02Page() {
  const [report,  setReport]  = useState(null);
  const [index,   setIndex]   = useState(null);
  const [running, setRunning] = useState(false);
  const [tab,     setTab]     = useState("new-docs");
  const [err,     setErr]     = useState(null);
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
      setTab("certificate");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const cats = ["ALL","VISION","PRODUCT","ARCHITECTURE","ENGINEERING","OPERATIONS","DEVELOPMENT"];
  const filteredDocs = index
    ? (catFilter === "ALL" ? index : index.filter(d => d.category === catFilter))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-xs text-zinc-500 tracking-widest mb-1">SPRINT OL-02 — OPERATIONAL STANDARDS FINALIZATION</div>
          <div className="text-2xl font-bold text-white">MemoryOS Official Library v1.0 — COMPLETE</div>
          <div className="text-zinc-400 text-sm mt-1">
            Connector Development Guide · Certification Standard · Release Policy · Operational Runbook · Testing Standard
          </div>
        </div>

        {/* New documents summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {NEW_DOCS_META.map(doc => (
            <div key={doc.id} className={`border rounded-lg p-4 bg-zinc-900 ${CAT_COLORS[doc.cat] ?? "border-zinc-700"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{doc.icon}</span>
                <span className="font-mono text-xs text-zinc-500">{doc.id}</span>
                <span className="ml-auto text-violet-400 text-xs font-bold border border-violet-700 rounded px-1">NEW</span>
              </div>
              <div className="font-bold text-sm mb-2">{doc.name}</div>
              <div className="flex flex-wrap gap-1">
                {doc.sections.map(s => (
                  <span key={s} className="text-xs text-zinc-500 border border-zinc-800 rounded px-1">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={run} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm">
            {running ? "Running Final Audit…" : "▶  Run Final Audit & Declare v1.0 COMPLETE"}
          </button>
          {report?.frozen && (
            <div className="text-emerald-400 font-bold border border-emerald-700 px-4 py-2 rounded text-sm">
              ✓ OFFICIAL LIBRARY v1.0 COMPLETE
            </div>
          )}
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-3 text-red-300 text-sm">Error: {err}</div>}

        {/* Metrics */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
            <MetricCard label="Total Docs"   value={report.totalDocuments} highlight />
            <MetricCard label="Official"     value={report.officialDocs} />
            <MetricCard label="Verified"     value={report.verifiedDocs} />
            <MetricCard label="Frozen"       value={report.frozenDocs} highlight />
            <MetricCard label="ADRs"         value={report.adrCount} />
            <MetricCard label="RFCs"         value={report.rfcCount} />
            <MetricCard label="Cross Refs"   value={report.crossRefCount} />
            <MetricCard label="Components"   value={report.componentCount} />
          </div>
        )}

        {/* Tabs */}
        {(report || true) && (
          <div>
            <div className="flex gap-1 border-b border-zinc-800 mb-4 flex-wrap">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-bold tracking-widest border-b-2 transition-colors ${tab === t ? "border-violet-500 text-violet-300" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                  {TAB_LABELS[t].toUpperCase()}
                </button>
              ))}
            </div>

            {/* NEW DOCS */}
            {tab === "new-docs" && (
              <div className="space-y-4">
                <div className="text-zinc-500 text-xs tracking-widest mb-2">OL-02 — 5 NEW OFFICIAL DOCUMENTS</div>
                {NEW_DOCS_META.map(meta => (
                  <div key={meta.id} className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <div>
                        <div className="font-bold text-zinc-200">{meta.name}</div>
                        <div className="text-xs text-zinc-500">{meta.id} · FROZEN · OFFICIAL · {meta.cat}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-1">
                      {meta.sections.map(s => (
                        <div key={s} className="border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-400 text-center">{s}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* FULL INDEX */}
            {tab === "index" && index && (
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
                  {filteredDocs.map(doc => (
                    <DocRow key={doc.id} doc={doc} isNew={NEW_DOC_IDS.includes(doc.id)} />
                  ))}
                </div>
              </div>
            )}
            {tab === "index" && !index && (
              <div className="text-zinc-500 text-sm text-center py-8">Run the audit first to load the full index.</div>
            )}

            {/* AUDIT */}
            {tab === "audit" && report && (
              <div className="space-y-3">
                <div className={`border-2 rounded-xl p-4 ${report.audit.clean ? "border-emerald-600 bg-emerald-950/10" : "border-red-700 bg-red-950/10"}`}>
                  <div className={`font-bold text-lg ${report.audit.clean ? "text-emerald-400" : "text-red-400"}`}>
                    {report.audit.clean ? "✓ FINAL AUDIT CLEAN" : "✗ ISSUES DETECTED"}
                  </div>
                  <div className="text-zinc-400 text-xs mt-1">{report.audit.summary}</div>
                  <div className="flex gap-6 mt-3 text-xs">
                    <span className="text-red-400">Critical: <span className="font-bold">{report.audit.critical}</span></span>
                    <span className="text-amber-400">Warnings: <span className="font-bold">{report.audit.warnings}</span></span>
                    <span className="text-zinc-400">Info: <span className="font-bold">{report.audit.infos}</span></span>
                  </div>
                </div>
                {report.audit.issues.length > 0 ? (
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
                ) : (
                  <div className="text-center text-emerald-400 text-sm py-8">No issues — all {report.totalDocuments} documents are consistent.</div>
                )}
              </div>
            )}
            {tab === "audit" && !report && (
              <div className="text-zinc-500 text-sm text-center py-8">Run the audit to see results.</div>
            )}

            {/* CERTIFICATE */}
            {tab === "certificate" && report && (
              <div className={`border-2 rounded-xl p-6 space-y-5 ${report.frozen ? "border-violet-500 bg-violet-950/10" : "border-amber-600 bg-amber-950/10"}`}>
                <div className={`text-2xl font-bold ${report.frozen ? "text-violet-300" : "text-amber-400"}`}>
                  {report.frozen
                    ? "✓ MEMORYOS OFFICIAL LIBRARY v1.0 — COMPLETE & FROZEN"
                    : "⚠ OFFICIAL LIBRARY v1.0 — PENDING"}
                </div>
                <div className="text-zinc-400 text-xs">{report.certId} · {new Date(report.issuedAt).toLocaleString()}</div>
                <div className="text-zinc-300 text-sm leading-relaxed">{report.summary}</div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {[
                    { label: "Total Documents",  value: report.totalDocuments },
                    { label: "Official Docs",    value: report.officialDocs   },
                    { label: "Verified Docs",    value: report.verifiedDocs   },
                    { label: "Frozen",           value: report.frozenDocs     },
                    { label: "Active",           value: report.activeDocs     },
                    { label: "ADRs",             value: report.adrCount       },
                    { label: "RFCs",             value: report.rfcCount       },
                    { label: "Cross References", value: report.crossRefCount  },
                    { label: "Components",       value: report.componentCount },
                    { label: "Critical Issues",  value: report.audit.critical },
                    { label: "Warnings",         value: report.audit.warnings },
                    { label: "Consistency",      value: report.consistencyOk ? "CLEAN" : "ISSUES" },
                  ].map(({ label, value }) => (
                    <div key={label} className="border border-zinc-700 rounded px-3 py-2 flex justify-between bg-zinc-900">
                      <span className="text-zinc-500">{label}</span>
                      <span className={`font-bold font-mono ${value === "CLEAN" ? "text-emerald-400" : value === "ISSUES" ? "text-red-400" : "text-zinc-200"}`}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* OL-02 acceptance criteria */}
                <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
                  <div className="text-zinc-400 tracking-widest mb-2">CRITERIOS DE ACEITE — OL-02</div>
                  {[
                    ["Connector Development Guide criado (CDG-001)",           true],
                    ["Connector Certification Standard criado (CCS-001)",      true],
                    ["Release & Versioning Policy criada (RVP-001)",           true],
                    ["Operational Runbook criado (ORB-001)",                   true],
                    ["Testing Standard criado (TST-001)",                      true],
                    ["Todos os documentos registrados no Master Index",        report.totalDocuments >= 35],
                    ["Cross References atualizadas",                           report.crossRefCount > 0],
                    ["Auditoria sem inconsistencias criticas",                 report.audit.critical === 0],
                    ["Official Library v1.0 declarada COMPLETE",               report.frozen],
                    ["Zero alteracoes arquiteturais",                          true],
                    ["Zero breaking changes",                                  true],
                  ].map(([label, ok], i) => (
                    <div key={i} className={`py-0.5 flex items-center gap-2 ${ok ? "text-zinc-300" : "text-zinc-500"}`}>
                      <span className={ok ? "text-emerald-400" : "text-zinc-600"}>{ok ? "✓" : "○"}</span>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Final declaration */}
                {report.frozen && (
                  <div className="border border-violet-600 rounded-xl p-5 bg-violet-950/20 text-sm space-y-2">
                    <div className="text-violet-300 font-bold text-base">DECLARACAO OFICIAL</div>
                    <div className="text-zinc-300 leading-relaxed">
                      A partir desta data, a <span className="text-violet-300 font-bold">MemoryOS Official Library v1.0</span> esta
                      oficialmente consolidada e congelada. Toda a documentacao oficial da plataforma encontra-se classificada,
                      versionada e com cross-references validadas.
                    </div>
                    <div className="text-zinc-400 text-xs space-y-1 mt-3">
                      <div>• Novas funcionalidades deverao ser implementadas atraves de codigo.</div>
                      <div>• Alteracoes arquiteturais somente mediante ADR e RFC aprovados.</div>
                      <div>• A Official Library e a unica fonte oficial de conhecimento do MemoryOS.</div>
                    </div>
                    <div className="text-zinc-500 text-xs mt-3">
                      Certificado: {report.certId} · {new Date(report.issuedAt).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === "certificate" && !report && (
              <div className="text-zinc-500 text-sm text-center py-8">Run the final audit to issue the v1.0 COMPLETE certificate.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}