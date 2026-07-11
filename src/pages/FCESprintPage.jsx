// Foundation Compliance Engine — Sprint Validation Page
// FCE Sprint-1 · Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runFCETests } from "@/lib/fce/fceTests";

// ── UI Primitives ─────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  COMPLIANT: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  VIOLATION: "bg-red-900/50 text-red-300 border-red-700",
  PARTIAL:   "bg-amber-900/50 text-amber-300 border-amber-700",
  UNKNOWN:   "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const SEV_STYLE = {
  CRITICAL: "bg-red-900/60 text-red-200 border-red-700",
  ERROR:    "bg-orange-900/50 text-orange-300 border-orange-700",
  WARNING:  "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  INFO:     "bg-sky-900/40 text-sky-300 border-sky-700",
};

function Badge({ label, style }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200", sub }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
      {sub && <div className="text-zinc-600 text-[10px] mt-0.5">{sub}</div>}
    </div>
  );
}

function ScoreBar({ label, value }) {
  const color = value >= 90 ? "bg-emerald-500" : value >= 70 ? "bg-yellow-500" : "bg-red-500";
  const text  = value >= 90 ? "text-emerald-400" : value >= 70 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={`font-mono font-bold ${text}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Test Row ──────────────────────────────────────────────────────────────────

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  const isHardening = r.name.startsWith("[Hardening]");
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => (r.detail || r.observation || r.error) && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2.5 px-3 text-left">
        <Badge label={r.passed ? "PASS" : "FAIL"} style={r.passed ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"} />
        <span className="text-zinc-500 font-mono text-xs w-5 shrink-0 mt-0.5">C{r.criterion}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${r.passed ? "text-zinc-200" : "text-red-300"}`}>{r.name}</p>
          {isHardening && <span className="text-xs text-violet-400 font-mono">hardening</span>}
        </div>
        <span className="text-zinc-600 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700 space-y-1">
          {r.detail      && <p className="text-xs text-zinc-400">{r.detail}</p>}
          {r.observation && <p className="text-xs text-yellow-400/80 italic">obs: {r.observation}</p>}
          {r.error       && <p className="text-xs text-red-400 font-mono">error: {r.error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Evidence Card ─────────────────────────────────────────────────────────────

function EvidenceCard({ ev }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${ev.status === "VIOLATION" ? "bg-red-950/10" : ev.status === "PARTIAL" ? "bg-amber-950/10" : ""}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start gap-2 py-2 px-3 text-left">
        <Badge label={ev.status}   style={STATUS_STYLE[ev.status] ?? STATUS_STYLE.UNKNOWN} />
        <Badge label={ev.severity} style={SEV_STYLE[ev.severity] ?? SEV_STYLE.INFO} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-200 truncate">{ev.description}</p>
          <p className="text-xs text-zinc-500 font-mono">{ev.ruleId} · {ev.sourceDocument} / {ev.sourceSection}</p>
        </div>
        <span className="text-zinc-600 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 ml-10 border-l-2 border-zinc-700 space-y-2">
          <div className="bg-zinc-800/50 rounded px-3 py-2 space-y-1 text-xs">
            <p className="text-zinc-400 font-semibold mb-1">Rastreabilidade</p>
            {Object.entries(ev.traceability).map(([k, v]) => v ? (
              <div key={k} className="flex gap-2">
                <span className="text-zinc-600 w-24 shrink-0 capitalize">{k}</span>
                <span className="text-zinc-300 break-all">{String(v)}</span>
              </div>
            ) : null)}
          </div>
          {ev.relatedFiles.length > 0 && (
            <div className="text-xs text-zinc-500">
              <span className="text-zinc-600">Arquivos: </span>
              {ev.relatedFiles.map(f => f.split("/src/lib/")[1] ?? f.split("/").pop()).join(", ")}
            </div>
          )}
          <div className="text-xs text-zinc-600 font-mono">{ev.evidenceId} · confidence={ev.confidence}%</div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "results",   label: "Criterios" },
  { id: "score",     label: "Score" },
  { id: "evidences", label: "Evidencias" },
  { id: "logs",      label: "Logs" },
  { id: "scope",     label: "Escopo" },
];

export default function FCESprintPage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [elapsed, setElapsed]     = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [evFilter, setEvFilter]   = useState("ALL");

  const runSuite = useCallback(async () => {
    setRunning(true);
    setData(null);
    const start = Date.now();
    try {
      const result = await runFCETests();
      setElapsed(Date.now() - start);
      setData(result);
    } catch (e) {
      console.error("FCE Sprint error:", e);
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.passed === data.total;
  const report  = data?.report;

  const filteredEvidences = report?.evidences.filter(ev =>
    evFilter === "ALL" || ev.status === evFilter
  ) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-violet-950/60 border border-indigo-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-indigo-400">FCE Sprint-3 — FKM</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Foundation Compliance Engine</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                OfficialLibraryManager → Parser → KnowledgeModel → RuleLoader → Evaluator
              </p>
            </div>
            <button onClick={runSuite} disabled={running}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "▶ Executar FCE"}
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-2">
              <Metric label="Criterios"  value={`${data.passed}/${data.total}`}       color={allPass ? "text-emerald-400" : "text-red-400"} />
              <Metric label="Regras"     value={report.rulesTotal}                     color="text-indigo-400" />
              <Metric label="Aprovadas"  value={report.rulesApproved}                  color="text-emerald-400" />
              <Metric label="Violadas"   value={report.rulesViolated}                  color={report.rulesViolated > 0 ? "text-red-400" : "text-zinc-400"} />
              <Metric label="Parciais"   value={report.rulesPartial}                   color={report.rulesPartial > 0 ? "text-amber-400" : "text-zinc-400"} />
              <Metric label="Overall"    value={`${report.score.overallCompliance}%`}  color={report.score.overallCompliance >= 80 ? "text-emerald-400" : "text-yellow-400"} />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-8 h-8 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">OfficialLibraryManager → Parser → Foundation → Evidencias...</p>
            <p className="text-zinc-600 text-xs mt-1">SSOT: Biblioteca Oficial → RuleLoader → ABV → ComplianceEvaluator</p>
          </div>
        )}

        {/* Verdict */}
        {data && !running && (
          <div className={`rounded-xl border-2 p-4 ${allPass
            ? "bg-emerald-950/30 border-emerald-700"
            : "bg-amber-950/30 border-amber-700"}`}>
            <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-amber-300"}`}>
              {allPass ? `Sprint FCE-1 Concluida — ${data.passed}/${data.total} criterios` : `${data.total - data.passed} criterio(s) falharam`}
            </p>
            <p className="text-xs text-zinc-400 mt-1">{report.conclusion}</p>
            <p className="text-xs text-zinc-600 mt-1 font-mono">{report.executionId} · {report.durationMs}ms · {new Date(report.runAt).toISOString().slice(0, 19)}</p>
          </div>
        )}

        {/* Tabs */}
        {data && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === t.id ? "bg-indigo-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Criterios ── */}
        {activeTab === "results" && data && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <span className="text-sm font-semibold text-zinc-200">15 Criterios — FKM: Parser · KnowledgeModel · RuleLoader · SSOT</span>
              <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>{data.passed}/{data.total}</span>
            </div>
            {data.results.map(r => <TestRow key={r.criterion} r={r} />)}
          </div>
        )}

        {/* ── Score ── */}
        {activeTab === "score" && data && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-zinc-400 text-xs uppercase tracking-wider">FCE Compliance Score</p>
                <span className={`text-2xl font-bold font-mono ${report.score.overallCompliance >= 90 ? "text-emerald-400" : report.score.overallCompliance >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                  {report.score.overallCompliance}%
                </span>
              </div>
              <ScoreBar label="Foundation Compliance"   value={report.score.foundationCompliance} />
              <ScoreBar label="Architecture Compliance" value={report.score.architectureCompliance} />
              <ScoreBar label="Runtime Compliance"      value={report.score.runtimeCompliance} />
              <ScoreBar label="Boundary Compliance"     value={report.score.boundaryCompliance} />
              <ScoreBar label="Contract Compliance"     value={report.score.contractCompliance} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="ABV Files"    value={report.abvFilesAnalyzed}           color="text-sky-400" />
              <Metric label="ABV Boundary" value={`${report.abvBoundaryCompliance}%`} color="text-violet-400" />
              <Metric label="ABV Circular" value={report.abvCircularDeps}             color={report.abvCircularDeps > 0 ? "text-red-400" : "text-zinc-400"} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Docs Avaliados" value={report.documentsEvaluated}  color="text-indigo-400" sub={report.documentsLoaded.join(", ")} />
              <Metric label="Duracao Total"  value={`${report.durationMs}ms`}   color="text-violet-400" />
            </div>
          </div>
        )}

        {/* ── Evidences ── */}
        {activeTab === "evidences" && data && (
          <div className="space-y-2">
            <div className="flex gap-1 flex-wrap">
              {["ALL", "COMPLIANT", "VIOLATION", "PARTIAL", "UNKNOWN"].map(f => {
                const count = f === "ALL" ? report.evidences.length : report.evidences.filter(e => e.status === f).length;
                return (
                  <button key={f} onClick={() => setEvFilter(f)}
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold border transition-colors ${evFilter === f
                      ? (STATUS_STYLE[f] ?? "bg-zinc-700 text-zinc-200 border-zinc-600")
                      : "bg-zinc-800 text-zinc-500 border-zinc-700"}`}>
                    {f} ({count})
                  </button>
                );
              })}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {filteredEvidences.length === 0
                ? <p className="text-zinc-600 text-xs p-4 text-center italic">Nenhuma evidencia com status {evFilter}.</p>
                : filteredEvidences.map(ev => <EvidenceCard key={ev.evidenceId} ev={ev} />)
              }
            </div>
          </div>
        )}

        {/* ── Logs ── */}
        {activeTab === "logs" && data && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-200">FCE Execution Logs ({report.logs.length})</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {report.logs.map((log, i) => (
                <div key={i} className="border-b border-zinc-800 last:border-0 px-3 py-1.5 flex items-center gap-2 text-xs">
                  <Badge label={log.status}   style={STATUS_STYLE[log.status] ?? STATUS_STYLE.UNKNOWN} />
                  <Badge label={log.severity} style={SEV_STYLE[log.severity] ?? SEV_STYLE.INFO} />
                  <span className="text-zinc-400 font-mono shrink-0">{log.ruleId}</span>
                  <span className="text-zinc-600 shrink-0">{log.document}</span>
                  <span className="text-zinc-500 flex-1 truncate">{log.result}</span>
                  <span className="text-zinc-700 font-mono shrink-0">{log.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scope ── */}
        {activeTab === "scope" && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Cadeia de Rastreabilidade</p>
              {["Foundation v1.0", "Documento Oficial", "Secao / Principio", "Arquitetura", "Codigo", "ABV Evidence", "FCE Evidence", "Engineering Review"].map((step, i, arr) => (
                <div key={step} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${i === 0 ? "bg-violet-500" : i === arr.length - 1 ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  <span className="text-xs text-zinc-300">{step}</span>
                  {i < arr.length - 1 && <span className="text-zinc-700 text-xs ml-auto">↓</span>}
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Documentos Avaliados</p>
              {["MV", "MPS", "MAS", "MES", "Transition Declaration"].map(doc => (
                <div key={doc} className="flex items-center justify-between bg-zinc-800/40 rounded px-3 py-1.5">
                  <span className="text-violet-300 font-mono text-xs font-bold">{doc}</span>
                  {data ? (
                    <Badge label={report.documentsLoaded.includes(doc) ? "LOADED" : "MISSING"}
                      style={report.documentsLoaded.includes(doc) ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"} />
                  ) : <span className="text-zinc-600 text-xs">—</span>}
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Invariantes — Foundation v1.0</p>
              {[
                "OfficialLibraryManager e a unica fonte de verdade (SSOT)",
                "FoundationDocumentParser: responsabilidade unica de parsing",
                "FoundationKnowledgeModel: representa estrutura do conhecimento",
                "FoundationRuleLoader: KnowledgeAtoms → FoundationRules apenas",
                "FCE reutiliza ABV — zero duplicacao",
                "Toda conclusao possui evidencia correspondente",
                "Toda evidencia possui rastreabilidade completa",
                "Nenhuma excecao interrompe a auditoria",
                "Score calculado deterministicamente",
                "Compativel com Engineering First",
              ].map((inv, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-emerald-400 shrink-0">→</span>{inv}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pre-run state */}
        {!data && !running && activeTab !== "scope" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-indigo-900/30 border border-indigo-800/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📋</span>
            </div>
            <p className="text-zinc-300 text-sm font-semibold mb-1">Foundation Compliance Engine</p>
            <p className="text-zinc-500 text-xs">OfficialLibraryManager → Parser → FoundationRule → ABV → ComplianceEvidence</p>
          </div>
        )}

      </div>
    </div>
  );
}