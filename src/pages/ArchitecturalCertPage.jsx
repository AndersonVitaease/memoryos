/**
 * ArchitecturalCertPage.jsx — Sprint EF-55.1 · Official Architectural Certification Report
 */

import React, { useState, useCallback } from "react";
import { ArchitecturalCertificationEngine } from "@/lib/system-certification/certification/ArchitecturalCertificationEngine";
import { REMEDIATION_REPORT } from "@/lib/system-certification/certification/RemediationReport";

// ── UI Atoms ──────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:  "bg-amber-950/60  text-amber-300  border-amber-700",
    red:    "bg-red-950/60    text-red-300    border-red-800",
    zinc:   "bg-zinc-800/60   text-zinc-400   border-zinc-600",
    gold:   "bg-yellow-950/60 text-yellow-300 border-yellow-700",
    sky:    "bg-sky-950/60    text-sky-300    border-sky-700",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    teal:   "bg-teal-950/60   text-teal-300   border-teal-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
    orange: "bg-orange-950/60 text-orange-300 border-orange-700",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function ScoreBar({ label, value, weight }) {
  const col = value >= 90 ? "bg-emerald-600" : value >= 75 ? "bg-amber-600" : value >= 60 ? "bg-orange-600" : "bg-red-600";
  const tc  = value >= 90 ? "text-emerald-400" : value >= 75 ? "text-amber-400" : value >= 60 ? "text-orange-400" : "text-red-400";
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-400 w-44 shrink-0">{label}</span>
      {weight && <span className="text-zinc-600 w-12 shrink-0 text-right">{weight}</span>}
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${col}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`font-mono w-12 text-right font-bold ${tc}`}>{value.toFixed(0)}/100</span>
    </div>
  );
}

function statusColor(s) {
  if (s === "IMPLEMENTED") return "green";
  if (s === "PARTIAL")     return "amber";
  return "red";
}
function ncColor(c) {
  if (c === "critical")    return "red";
  if (c === "major")       return "orange";
  if (c === "minor")       return "amber";
  return "zinc";
}
function riskColor(l) {
  if (l === "critical")    return "red";
  if (l === "high")        return "orange";
  if (l === "medium")      return "amber";
  return "zinc";
}
function verdictColor(v) {
  if (v === "REAL")        return "green";
  if (v === "SYNTHETIC")   return "red";
  if (v === "MIXED")       return "amber";
  return "zinc";
}
function gradeColor(g) {
  if (g === "A+" || g === "A") return "green";
  if (g === "A-" || g === "B+") return "teal";
  if (g === "B" || g === "B-")  return "amber";
  return "red";
}
function decisionColor(d) {
  if (d === "CERTIFIED")              return "green";
  if (d === "CERTIFIED_WITH_CAVEATS") return "amber";
  return "red";
}

const TABS = [
  { id: "executive",      label: "Resumo Executivo" },
  { id: "remediation",    label: "Remediação EF-55.2" },
  { id: "implementation", label: "Implementação" },
  { id: "compliance",     label: "Conformidade" },
  { id: "solid",          label: "SOLID" },
  { id: "quality",        label: "Qualidade" },
  { id: "evidence",       label: "Evidências" },
  { id: "pipeline",       label: "Pipeline" },
  { id: "risks",          label: "Riscos" },
  { id: "nc",             label: "Não Conformidades" },
  { id: "decision",       label: "Decisão + Nota" },
];

export default function ArchitecturalCertPage() {
  const [tab,     setTab]     = useState("executive");
  const [report,  setReport]  = useState(null);
  const [running, setRunning] = useState(false);

  const handleCertify = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        const r = ArchitecturalCertificationEngine.certify();
        setReport(r);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, []);

  const r = report;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className={`border rounded-xl p-5 ${r?.decision === "CERTIFIED" ? "bg-emerald-950/20 border-emerald-700/40" : r?.decision === "CERTIFIED_WITH_CAVEATS" ? "bg-amber-950/15 border-amber-700/40" : r ? "bg-red-950/15 border-red-700/40" : "bg-zinc-900 border-zinc-800"}`}>
          <div className="flex flex-wrap gap-2 mb-2 items-center">
            <Badge label="EF-55.1" color="gold" />
            <Badge label="CERTIFICAÇÃO ARQUITETURAL OFICIAL" color="indigo" />
            <span className="text-zinc-500 text-xs">Baseada exclusivamente em evidências da implementação</span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {r ? `Parecer Técnico Oficial — Nota ${r.grade}` : "Certificação Arquitetural EF-55.1"}
          </h1>
          {r && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge label={r.decision.replace(/_/g, " ")} color={decisionColor(r.decision)} />
              <Badge label={`Nota ${r.grade}`} color={gradeColor(r.grade)} />
              <Badge label={`Score ${r.overallScore.toFixed(1)}/100`} color={r.overallScore >= 80 ? "green" : "amber"} />
              <Badge label={`${r.nonConformities.length} NCs`} color={r.nonConformities.filter(n => n.class === "critical" || n.class === "major").length > 0 ? "orange" : "zinc"} />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <button onClick={handleCertify} disabled={running}
            className="px-5 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
            {running ? "Auditando..." : "▶ Executar Auditoria Arquitetural Oficial"}
          </button>
          <span className="text-zinc-600 text-xs ml-4">Somente audita — nunca modifica código</span>
        </div>

        {!r && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">10 Fases de Auditoria · Zero modificações de código</p>
            <p className="text-zinc-600 text-xs">Implementação · Conformidade · SOLID · Qualidade · Evidência · Pipeline · Riscos · NCs · Decisão · Nota</p>
          </div>
        )}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-6 h-6 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando 10 fases de auditoria...</p>
          </div>
        )}

        {r && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto flex-wrap">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-w-fit px-2 ${tab === t.id ? "bg-indigo-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* EXECUTIVE */}
            {tab === "executive" && (
              <div className="space-y-4">
                <div className={`border rounded-xl p-5 ${decisionColor(r.decision) === "green" ? "bg-emerald-950/20 border-emerald-700/30" : decisionColor(r.decision) === "amber" ? "bg-amber-950/15 border-amber-700/30" : "bg-red-950/15 border-red-800/30"}`}>
                  <p className="text-zinc-500 text-xs mb-2">RESUMO EXECUTIVO</p>
                  <p className="text-zinc-200 text-sm leading-relaxed">{r.executiveSummary}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-500 text-xs mb-3">SCORES POR DIMENSÃO</p>
                  <ScoreBar label="Implementação (peso 20%)"      value={r.implementationScore}   weight="20%" />
                  <ScoreBar label="Conformidade Prompt (peso 25%)" value={r.promptComplianceScore} weight="25%" />
                  <ScoreBar label="Arquitetura SOLID (peso 20%)"   value={r.architecturalScore}    weight="20%" />
                  <ScoreBar label="Qualidade Código (peso 15%)"    value={r.codeQualityScore}      weight="15%" />
                  <ScoreBar label="Integridade Evidências (peso 10%)" value={r.evidenceScore}      weight="10%" />
                  <ScoreBar label="Cobertura Pipeline (peso 10%)"  value={r.pipelineScore}         weight="10%" />
                  <div className="border-t border-zinc-800 pt-2 mt-2">
                    <ScoreBar label="SCORE GERAL" value={r.overallScore} />
                  </div>
                </div>
              </div>
            )}

            {/* REMEDIATION */}
            {tab === "remediation" && (
              <div className="space-y-3">
                <div className={`border rounded-xl p-4 ${REMEDIATION_REPORT.readyForRecertification ? "bg-emerald-950/20 border-emerald-700/30" : "bg-amber-950/15 border-amber-700/30"}`}>
                  <div className="flex gap-2 flex-wrap mb-2">
                    <Badge label="EF-55.2 REMEDIATION" color="gold" />
                    <Badge label={`${REMEDIATION_REPORT.resolvedCount} RESOLVED`} color="green" />
                    <Badge label={`${REMEDIATION_REPORT.partialCount} PARTIAL`} color="amber" />
                    <Badge label={`${REMEDIATION_REPORT.deferredCount} DEFERRED`} color="zinc" />
                    {REMEDIATION_REPORT.readyForRecertification && <Badge label="PRONTO PARA RE-CERTIFICACAO" color="teal" />}
                  </div>
                  <p className="text-zinc-300 text-xs leading-relaxed">{REMEDIATION_REPORT.summary}</p>
                </div>
                {REMEDIATION_REPORT.items.map(item => (
                  <div key={item.ncId} className={`bg-zinc-900 border rounded-xl p-4 space-y-2 ${item.status === "RESOLVED" ? "border-emerald-800/30" : item.status === "PARTIAL" ? "border-amber-700/30" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={item.ncId} color="zinc" />
                      <Badge label={item.ncClass.toUpperCase()} color={item.ncClass === "major" ? "orange" : item.ncClass === "minor" ? "amber" : "zinc"} />
                      <Badge label={item.status} color={item.status === "RESOLVED" ? "green" : item.status === "PARTIAL" ? "amber" : "zinc"} />
                    </div>
                    <p className="text-zinc-300 text-xs font-bold">{item.description}</p>
                    <div className="space-y-0.5">
                      {item.changesMade.map((c, i) => <p key={i} className="text-zinc-500 text-xs font-mono pl-2">+ {c}</p>)}
                    </div>
                    {item.filesChanged.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.filesChanged.map((f, i) => <Badge key={i} label={f.split("/").pop()} color="sky" />)}
                      </div>
                    )}
                    <p className="text-emerald-400 text-xs">✓ {item.validation}</p>
                    <p className="text-zinc-600 text-xs">Risco de regressao: {item.regressionRisk}</p>
                  </div>
                ))}
              </div>
            )}

            {/* IMPLEMENTATION */}
            {tab === "implementation" && (
              <div className="space-y-1 max-h-[65vh] overflow-y-auto">
                <div className="flex gap-2 mb-2">
                  <Badge label={`${r.moduleInventory.filter(m => m.exists).length}/${r.moduleInventory.length} módulos presentes`} color="green" />
                  <Badge label={`score=${r.implementationScore}`} color={r.implementationScore >= 90 ? "green" : "amber"} />
                </div>
                {r.moduleInventory.map((m, i) => (
                  <div key={i} className={`flex items-start gap-2 px-3 py-1.5 rounded-lg border text-xs ${m.exists ? "bg-zinc-900/50 border-zinc-800/30" : "bg-red-950/10 border-red-900/30"}`}>
                    <span className={m.exists ? "text-emerald-400" : "text-red-400"}>{m.exists ? "✓" : "✗"}</span>
                    <span className="text-zinc-400 flex-1 font-mono truncate">{m.path.replace("src/lib/system-certification/", "…/")}</span>
                    <span className="text-zinc-600 shrink-0 w-10 text-right">{m.linesEst}L</span>
                  </div>
                ))}
              </div>
            )}

            {/* COMPLIANCE */}
            {tab === "compliance" && (
              <div className="space-y-2">
                <div className="flex gap-2 mb-2">
                  <Badge label={`${r.promptRequirements.filter(r => r.status === "IMPLEMENTED").length} IMPLEMENTED`} color="green" />
                  <Badge label={`${r.promptRequirements.filter(r => r.status === "PARTIAL").length} PARTIAL`} color="amber" />
                  <Badge label={`${r.promptRequirements.filter(r => r.status === "NOT_IMPLEMENTED").length} NOT_IMPLEMENTED`} color="red" />
                  <Badge label={`score=${r.promptComplianceScore}`} color={r.promptComplianceScore >= 90 ? "green" : "amber"} />
                </div>
                {r.promptRequirements.map(req => (
                  <div key={req.id} className={`bg-zinc-900 border rounded-xl p-3 space-y-1 ${req.status === "NOT_IMPLEMENTED" ? "border-red-800/40" : req.status === "PARTIAL" ? "border-amber-700/30" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={req.id} color="zinc" />
                      <Badge label={req.status} color={statusColor(req.status)} />
                      <span className="text-zinc-200 text-xs font-bold flex-1">{req.description}</span>
                    </div>
                    <p className="text-zinc-500 text-xs">{req.evidence}</p>
                    {req.note && <p className="text-zinc-600 text-xs italic">{req.note}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* SOLID */}
            {tab === "solid" && (
              <div className="space-y-2">
                <div className="flex gap-2 mb-2">
                  <Badge label={`${r.solidAnalysis.filter(a => a.compliant).length}/${r.solidAnalysis.length} compliant`} color="green" />
                  <Badge label={`score=${r.architecturalScore}`} color={r.architecturalScore >= 85 ? "green" : "amber"} />
                </div>
                {r.solidAnalysis.map((a, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-xl p-3 ${!a.compliant ? "border-red-800/40" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={a.principle} color={a.compliant ? "teal" : "red"} />
                      <span className={`text-xs font-mono ${a.compliant ? "text-emerald-400" : "text-red-400"}`}>{a.compliant ? "✓" : "✗"}</span>
                      <span className="text-zinc-200 text-xs font-bold flex-1">{a.module}</span>
                    </div>
                    <p className="text-zinc-500 text-xs mt-1">{a.evidence}</p>
                    {a.issues !== "Nenhuma" && <p className="text-amber-400 text-xs">⚠ {a.issues}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* QUALITY */}
            {tab === "quality" && (
              <div className="space-y-2">
                <div className="flex gap-2 mb-2">
                  <Badge label={`${r.codeQualityFindings.length} findings`} color={r.codeQualityFindings.filter(f => f.severity === "high").length > 0 ? "red" : "amber"} />
                  <Badge label={`score=${r.codeQualityScore}`} color={r.codeQualityScore >= 80 ? "green" : "amber"} />
                </div>
                {r.codeQualityFindings.map((f, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-xl p-3 space-y-1 ${f.severity === "high" ? "border-red-800/40" : f.severity === "medium" ? "border-amber-700/30" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={f.severity.toUpperCase()} color={f.severity === "high" ? "red" : f.severity === "medium" ? "amber" : "zinc"} />
                      <Badge label={f.category} color="sky" />
                      <span className="text-zinc-300 text-xs font-bold flex-1">{f.module}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{f.finding}</p>
                  </div>
                ))}
              </div>
            )}

            {/* EVIDENCE */}
            {tab === "evidence" && (
              <div className="space-y-2">
                <div className="flex gap-2 mb-2">
                  <Badge label={`${r.evidenceChecks.filter(c => c.verdict === "REAL").length} REAL`} color="green" />
                  <Badge label={`${r.evidenceChecks.filter(c => c.verdict === "SYNTHETIC").length} SYNTHETIC`} color="red" />
                  <Badge label={`${r.evidenceChecks.filter(c => c.verdict === "MIXED").length} MIXED`} color="amber" />
                  <Badge label={`score=${r.evidenceScore}`} color={r.evidenceScore >= 70 ? "amber" : "red"} />
                </div>
                {r.evidenceChecks.map((c, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-xl p-3 space-y-1 ${c.verdict === "SYNTHETIC" ? "border-red-800/40" : c.verdict === "MIXED" ? "border-amber-700/30" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={c.verdict} color={verdictColor(c.verdict)} />
                      <span className="text-zinc-300 text-xs font-bold flex-1 font-mono">{c.module}</span>
                    </div>
                    <p className="text-zinc-500 text-xs">{c.check}</p>
                    <p className="text-zinc-600 text-xs italic">{c.evidence}</p>
                  </div>
                ))}
              </div>
            )}

            {/* PIPELINE */}
            {tab === "pipeline" && (
              <div className="space-y-2">
                <div className="flex gap-2 mb-2">
                  <Badge label={`${r.pipelineStages.filter(s => s.hasEvidence).length}/${r.pipelineStages.length} stages with evidence`} color={r.pipelineScore >= 60 ? "amber" : "red"} />
                  <Badge label={`score=${r.pipelineScore}`} color={r.pipelineScore >= 60 ? "amber" : "red"} />
                </div>
                {r.pipelineStages.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${s.hasEvidence ? "border-emerald-600 bg-emerald-950/50 text-emerald-300" : "border-red-600 bg-red-950/50 text-red-300"}`}>{i + 1}</div>
                      {i < r.pipelineStages.length - 1 && <div className="w-px h-4 bg-zinc-800 mt-1" />}
                    </div>
                    <div className={`flex-1 rounded-xl px-4 py-2 mb-1 border ${s.hasEvidence ? "bg-emerald-950/10 border-emerald-900/20" : "bg-red-950/10 border-red-900/20"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-xs ${s.hasEvidence ? "text-emerald-300" : "text-red-300"}`}>{s.stage}</span>
                        {s.hasEvidence ? <Badge label="EVIDÊNCIA REAL" color="green" /> : <Badge label="NÃO INTEGRADO" color="red" />}
                      </div>
                      <p className="text-zinc-500 text-xs mt-0.5">{s.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* RISKS */}
            {tab === "risks" && (
              <div className="space-y-2">
                <div className="flex gap-2 mb-2">
                  {["critical","high","medium","low"].map(l => {
                    const cnt = r.risks.filter(rk => rk.level === l).length;
                    if (!cnt) return null;
                    return <Badge key={l} label={`${cnt} ${l}`} color={riskColor(l)} />;
                  })}
                </div>
                {r.risks.map(rk => (
                  <div key={rk.id} className={`bg-zinc-900 border rounded-xl p-4 space-y-2 ${rk.level === "critical" || rk.level === "high" ? "border-red-800/40" : rk.level === "medium" ? "border-amber-700/30" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={rk.id} color="zinc" />
                      <Badge label={rk.level.toUpperCase()} color={riskColor(rk.level)} />
                      <span className="text-zinc-200 text-sm font-bold flex-1">{rk.title}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{rk.description}</p>
                    <p className="text-sky-400 text-xs">→ Mitigação: {rk.mitigation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* NON CONFORMITIES */}
            {tab === "nc" && (
              <div className="space-y-2">
                <div className="flex gap-2 mb-2">
                  {["critical","major","minor","observation"].map(c => {
                    const cnt = r.nonConformities.filter(n => n.class === c).length;
                    if (!cnt) return null;
                    return <Badge key={c} label={`${cnt} ${c}`} color={ncColor(c)} />;
                  })}
                </div>
                {r.nonConformities.map(nc => (
                  <div key={nc.id} className={`bg-zinc-900 border rounded-xl p-4 space-y-2 ${nc.class === "critical" ? "border-red-700/50" : nc.class === "major" ? "border-orange-700/40" : nc.class === "minor" ? "border-amber-700/30" : "border-zinc-800"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={nc.id} color="zinc" />
                      <Badge label={nc.class.toUpperCase()} color={ncColor(nc.class)} />
                      <span className="text-zinc-300 text-xs font-bold flex-1">{nc.module}</span>
                    </div>
                    <p className="text-zinc-400 text-xs">{nc.description}</p>
                    <p className="text-zinc-600 text-xs italic">{nc.evidence}</p>
                    <p className="text-sky-400 text-xs">→ {nc.recommendation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* DECISION + GRADE */}
            {tab === "decision" && (
              <div className="space-y-4">
                <div className={`border rounded-xl p-5 ${decisionColor(r.decision) === "green" ? "bg-emerald-950/20 border-emerald-700/30" : decisionColor(r.decision) === "amber" ? "bg-amber-950/15 border-amber-700/30" : "bg-red-950/15 border-red-800/30"}`}>
                  <p className="text-zinc-500 text-xs mb-1">DECISÃO FORMAL — FASE 9</p>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge label={r.decision.replace(/_/g, " ")} color={decisionColor(r.decision)} />
                    <span className={`text-2xl font-black ${decisionColor(r.decision) === "green" ? "text-emerald-300" : decisionColor(r.decision) === "amber" ? "text-amber-300" : "text-red-300"}`}>
                      {r.decision === "CERTIFIED" ? "✓ CERTIFICADA" : r.decision === "CERTIFIED_WITH_CAVEATS" ? "⚠ CERTIFICADA COM RESSALVAS" : "✗ REPROVADA"}
                    </span>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed">{r.decisionJustification}</p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-zinc-500 text-xs mb-1">NOTA OFICIAL — FASE 10</p>
                  <div className="flex items-center gap-4">
                    <span className={`text-6xl font-black ${gradeColor(r.grade) === "green" ? "text-emerald-300" : gradeColor(r.grade) === "teal" ? "text-teal-300" : gradeColor(r.grade) === "amber" ? "text-amber-300" : "text-red-300"}`}>{r.grade}</span>
                    <div>
                      <p className="text-zinc-400 text-sm">{r.gradeJustification.split(" | ")[0]}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.gradeJustification.split(" | ").slice(1).map((part, i) => (
                          <Badge key={i} label={part} color="zinc" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500 space-y-1">
                  <p className="font-bold text-zinc-400">RECOMENDAÇÕES PARA EF-56</p>
                  <p>1. Integrar EF-43 (CognitiveOrchestrator) ao RuntimeTraceCollector para plannerId real.</p>
                  <p>2. Integrar EF-46 (StrategySelectionEngine) para strategyId real.</p>
                  <p>3. Integrar EF-48 (CapabilityReasoningEngine) para capabilityId real.</p>
                  <p>4. Integrar EF-50 (EpisodeStore real) para episodeId rastreável.</p>
                  <p>5. Implementar invocação real de conectores no ConnectorSnapshot.</p>
                  <p>6. Ajustar CERTIFICATION_THRESHOLD de 80 para 95 após integração completa.</p>
                  <p>7. Corrigir typo deterministmScore → deterministicScore.</p>
                  <p>8. Corrigir filtro de 'warning' em ScenarioValidator.status.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}