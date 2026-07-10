import React, { useState, useRef } from "react";
import {
  Shield, Zap, GitBranch, Award, FileCheck, Play, Loader2,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Star
} from "lucide-react";
import { PIPELINE_STAGES, CERTIFICATION_LEVELS, runCertificationPipeline } from "@/lib/mqccs/certificationPipeline";
import { runFullComplianceValidation }  from "@/lib/mqccs/complianceValidator";
import { runPerformanceBenchmarks }     from "@/lib/mqccs/performanceBenchmarks";

const STAGE_ICONS = { FileCheck, Shield, Zap, GitBranch, Award };

const STATUS_COLOR = {
  idle:    "text-zinc-500",
  running: "text-yellow-400",
  passed:  "text-green-400",
  failed:  "text-red-400",
};

const CERT_COLORS = {
  zinc:   "border-zinc-500 text-zinc-300",
  blue:   "border-blue-500 text-blue-300",
  violet: "border-violet-500 text-violet-300",
  yellow: "border-yellow-500 text-yellow-300",
};

// ─── Sub-panels ──────────────────────────────────────────────────────────────

function CompliancePanel({ report }) {
  const [open, setOpen] = useState(false);
  if (!report) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mt-2">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
        <span className="font-mono">{report.type}: {report.id}</span>
        <span className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${report.status === "APROVADO" ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}>{report.status}</span>
          <span className="text-zinc-500 text-xs">{report.score}%</span>
          {open ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800">
          {report.checks.map(c => (
            <div key={c.id} className="flex items-center gap-2 px-4 py-2">
              {c.passed ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
              <span className="text-xs text-zinc-400 font-mono">{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerfRow({ name, result }) {
  if (!result) return null;
  const cols = ["p50", "p95", "p99", "max"];
  return (
    <tr className="border-b border-zinc-800">
      <td className="py-2 px-3 text-xs text-zinc-300 font-mono whitespace-nowrap">{name}</td>
      {cols.map(k => (
        <td key={k} className={`py-2 px-3 text-xs text-center font-mono ${result[k]?.passed ? "text-green-400" : "text-red-400"}`}>
          {result[k]?.value}ms
          <span className="text-zinc-600 ml-1">/ {result[k]?.target}ms</span>
        </td>
      ))}
      <td className="py-2 px-3 text-center">
        {result.passed ? <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto" />}
      </td>
    </tr>
  );
}

function StageCard({ stage, status, result }) {
  const Icon     = STAGE_ICONS[stage.icon] ?? FileCheck;
  const [open, setOpen] = useState(false);
  const isRunning = status === "running";
  const isIdle    = status === "idle";

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${status === "passed" ? "border-green-800" : status === "failed" ? "border-red-800" : "border-zinc-800"}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {isRunning
            ? <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            : status === "passed" ? <CheckCircle className="w-4 h-4 text-green-400" />
            : status === "failed" ? <XCircle className="w-4 h-4 text-red-400" />
            : <Icon className="w-4 h-4 text-zinc-600" />
          }
          <div>
            <p className="text-sm font-semibold text-zinc-200">{stage.label}</p>
            <p className="text-xs text-zinc-500">{stage.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {result?.score !== undefined && (
            <span className={`text-sm font-bold ${result.passed ? "text-green-400" : "text-red-400"}`}>{result.score}%</span>
          )}
          {result && !isIdle && (
            <button onClick={() => setOpen(o => !o)} className="text-zinc-600 hover:text-zinc-400">
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {open && result && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
          {/* Contract stage */}
          {stage.id === "contract" && result.detail?.reports?.map((r, i) => (
            <CompliancePanel key={i} report={r} />
          ))}

          {/* Security stage */}
          {stage.id === "security" && result.checks?.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              {c.passed ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
              <span className="text-xs text-zinc-400 font-mono">{c.label}</span>
            </div>
          ))}

          {/* Performance stage */}
          {stage.id === "performance" && result.detail?.results && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="py-1 px-3 text-left text-zinc-500 font-normal">Componente</th>
                    {["P50","P95","P99","Max"].map(h => <th key={h} className="py-1 px-3 text-center text-zinc-500 font-normal">{h}</th>)}
                    <th className="py-1 px-3 text-center text-zinc-500 font-normal">Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.detail.results).map(([name, r]) => (
                    <PerfRow key={name} name={name} result={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Architecture stage */}
          {stage.id === "architecture" && result.detail?.results && (
            <div className="space-y-1">
              {result.detail.results.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  {t.passed ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  <span className="text-xs text-zinc-400 font-mono">{t.name}</span>
                  <span className="text-zinc-600 text-xs ml-auto">{t.durationMs}ms</span>
                </div>
              ))}
            </div>
          )}

          {/* Certification stage */}
          {stage.id === "certification" && result.checklist && (
            <div className="space-y-1">
              {result.checklist.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  {c.passed ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  <span className="text-xs text-zinc-400">{c.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Certification Badge ──────────────────────────────────────────────────────

function CertBadge({ certLevel, globalScore, issuedAt }) {
  if (!certLevel) return (
    <div className="border border-zinc-700 rounded-xl p-6 text-center">
      <XCircle className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
      <p className="text-zinc-400 text-sm">Score insuficiente para certificação</p>
    </div>
  );

  return (
    <div className={`border-2 rounded-xl p-6 text-center ${CERT_COLORS[certLevel.color]}`}>
      <div className="text-4xl mb-2">{certLevel.badge}</div>
      <div className="text-2xl font-bold mb-1">{certLevel.level}</div>
      <div className="text-sm opacity-70 mb-3">Score global: {globalScore}%</div>
      <div className="text-xs opacity-50">Emitido em {new Date(issuedAt).toLocaleString("pt-BR")}</div>
      <div className="mt-4 space-y-1">
        {certLevel.requirements.map((r, i) => (
          <div key={i} className="text-xs opacity-60 flex items-center justify-center gap-1">
            <CheckCircle className="w-3 h-3" />{r}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MqccsValidation() {
  const [running, setRunning]     = useState(false);
  const [stageStatus, setStageStatus] = useState({});
  const [stageResults, setStageResults] = useState({});
  const [finalResult, setFinalResult]   = useState(null);

  async function run() {
    setRunning(true);
    setStageStatus({});
    setStageResults({});
    setFinalResult(null);

    const result = await runCertificationPipeline(({ stage, status, result: r }) => {
      setStageStatus(prev => ({ ...prev, [stage]: status }));
      if (r) setStageResults(prev => ({ ...prev, [stage]: r }));
    }).catch(e => ({ error: e.message }));

    setFinalResult(result);
    setRunning(false);
  }

  const globalScore = finalResult?.globalScore;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-yellow-600 flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">MQCCS — Certification Pipeline</h1>
              <p className="text-zinc-400 text-sm">Quality, Compliance & Certification Specification v1.0</p>
            </div>
          </div>

          {/* Certification levels legend */}
          <div className="mt-4 flex flex-wrap gap-2">
            {CERTIFICATION_LEVELS.map(l => (
              <span key={l.level} className={`text-xs border rounded-full px-3 py-1 ${CERT_COLORS[l.color]}`}>
                {l.badge} {l.level} ≥{l.minScore}%
              </span>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="mb-8 flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Executando pipeline...</>
            : <><Play className="w-4 h-4" /> Executar Certification Pipeline</>
          }
        </button>

        {/* Global score */}
        {globalScore !== undefined && (
          <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-zinc-300 text-sm font-medium">Score Global</span>
              <span className={`text-lg font-bold ${globalScore >= 95 ? "text-yellow-400" : globalScore >= 80 ? "text-violet-400" : globalScore >= 70 ? "text-blue-400" : "text-red-400"}`}>
                {globalScore}%
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${globalScore >= 95 ? "bg-yellow-500" : globalScore >= 80 ? "bg-violet-500" : globalScore >= 70 ? "bg-blue-500" : "bg-red-500"}`}
                style={{ width: `${globalScore}%` }}
              />
            </div>
            {/* Threshold markers */}
            <div className="relative mt-1 h-3">
              {CERTIFICATION_LEVELS.map(l => (
                <span key={l.level} className="absolute -translate-x-1/2 text-zinc-600 text-xs" style={{ left: `${l.minScore}%` }}>|</span>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline stages */}
        <div className="space-y-3 mb-8">
          {PIPELINE_STAGES.map(stage => (
            <StageCard
              key={stage.id}
              stage={stage}
              status={stageStatus[stage.id] ?? "idle"}
              result={stageResults[stage.id]}
            />
          ))}
        </div>

        {/* Certification badge */}
        {finalResult && (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-zinc-200 mb-4">Resultado da Certificação</h2>
            <CertBadge
              certLevel={finalResult.certLevel}
              globalScore={finalResult.globalScore}
              issuedAt={stageResults.certification?.issuedAt ?? new Date().toISOString()}
            />
          </div>
        )}

        {/* Idle state */}
        {!finalResult && !running && (
          <div className="text-center py-16 text-zinc-600">
            <Award className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Clique em "Executar Certification Pipeline" para certificar a implementação</p>
          </div>
        )}
      </div>
    </div>
  );
}