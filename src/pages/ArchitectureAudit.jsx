import React, { useState } from "react";
import {
  ShieldCheck,
  Loader2,
  FileSearch,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  BookOpen,
  FileCode2,
  FolderTree,
  GitPullRequest,
  Building2,
  CheckCircle2,
  ListChecks,
  Clock,
  Layers,
} from "lucide-react";
import { SpecialistRegistry } from "@/lib/specialists/registry";
import AuditReportV4 from "@/components/audit/AuditReportV4";

// O Planner e as páginas NÃO conhecem Specialists diretamente.
// Todo acesso ocorre através do Specialist Registry (MAS §4.3).
const _auditorEntry = SpecialistRegistry.get("audit_architecture");
const _auditor = _auditorEntry?.specialist;
const auditAnalyze = _auditor?.analyze;
const AUDIT_LEVELS = _auditor?.AUDIT_LEVELS || ["file", "module", "project", "pr"];

const STAGE_LABELS = {
  idle: "Pronto",
  "reading-project": "Lendo código-fonte do projeto...",
  "reading-library": "Carregando Biblioteca Oficial...",
  "detecting-modes": "Detectando modos de auditoria disponíveis...",
  "specification-audit": "Auditando documentos oficiais (Specification Audit)...",
  "behavioral-audit": "Auditando comportamento observado (Behavioral Audit)...",
  analyzing: "Analisando código-fonte (Code Audit)...",
  "runtime-audit": "Auditando runtime e telemetria (Runtime Audit)...",
  "building-report": "Construindo MACR v4.0...",
  done: "Auditoria concluída",
};

const AUDIT_LEVEL_OPTIONS = [
  { level: "file", label: "Arquivo", icon: FileCode2, hint: "Um arquivo específico" },
  { level: "module", label: "Pasta/Módulo", icon: FolderTree, hint: "Uma pasta ou módulo" },
  { level: "project", label: "Projeto Completo", icon: Building2, hint: "Todo o projeto" },
  { level: "pr", label: "Pull Request", icon: GitPullRequest, hint: "Arquivos alterados" },
];

function statusColor(status) {
  if (status === "CONFORME") return "text-emerald-600 bg-emerald-50";
  if (status === "PARCIALMENTE CONFORME") return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

function statusDotColor(status) {
  if (status === "CONFORME") return "bg-emerald-500";
  if (status === "PARCIALMENTE CONFORME") return "bg-amber-500";
  return "bg-red-500";
}

function priorityColor(p) {
  const s = (p || "").toLowerCase();
  if (s.includes("crít") || s.includes("crit")) return "bg-red-100 text-red-700 border-red-200";
  if (s.includes("alta")) return "bg-orange-100 text-orange-700 border-orange-200";
  if (s.includes("méd") || s.includes("med")) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

export default function ArchitectureAudit() {
  console.log('[RENDER] ArchitectureAudit');
  const [stage, setStage] = useState("idle");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [auditLevel, setAuditLevel] = useState("project");

  const handleRun = async () => {
    setStage("reading-project");
    setError(null);
    setReport(null);
    try {
      const result = await auditAnalyze({
        scope: { level: auditLevel },
        onStage: setStage,
      });
      setReport(result);
      setStage("done");
    } catch (err) {
      setError(err.message || "Erro ao executar auditoria");
      setStage("idle");
    }
  };

  // === IDLE ===
  if (stage === "idle" && !report) {
    console.log('[RETURN] ArchitectureAudit → idle UI');
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 lg:py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading text-zinc-900">Architecture Auditor</h1>
            <p className="text-sm text-zinc-500">Especialista Oficial do MemoryOS · v4.0 Estável</p>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 lg:p-8 space-y-4 mb-6">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">Biblioteca Oficial como referência</h2>
              <p className="text-sm text-zinc-500 mt-1">
                A auditoria compara a implementação atual contra os documentos oficiais (MV, MPS, MAS, MES),
                identificando divergências entre o código e a documentação.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Layers className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">Quatro modos oficiais de auditoria</h2>
              <p className="text-sm text-zinc-500 mt-1">
                <strong>Specification Audit</strong> (documentos vs documentos), <strong>Behavioral Audit</strong>
                (biblioteca vs comportamento observado), <strong>Code Audit</strong> (biblioteca vs código-fonte) e
                <strong> Runtime Audit</strong> (arquitetura vs runtime/logs/eventos). A seleção é automática.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileSearch className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">Seleção automática e transparência</h2>
              <p className="text-sm text-zinc-500 mt-1">
                O Auditor identifica quais informações estão realmente disponíveis e executa apenas os modos viáveis.
                Modos indisponíveis são declarados explicitamente com motivo. Toda conclusão informa sua origem.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">Apenas recomendações</h2>
              <p className="text-sm text-zinc-500 mt-1">
                O Architecture Auditor nunca altera código automaticamente. Ele apenas analisa e produz recomendações.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
            Nível de Auditoria
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {AUDIT_LEVEL_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = auditLevel === opt.level;
              return (
                <button
                  key={opt.level}
                  onClick={() => setAuditLevel(opt.level)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition ${
                    active
                      ? "border-violet-400 bg-violet-50 text-violet-700"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleRun}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition"
        >
          <ShieldCheck className="w-5 h-5" />
          Executar Auditoria
        </button>
      </div>
    );
  }

  // === LOADING ===
  if (stage !== "done") {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 lg:py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-violet-500 mb-4" />
          <p className="text-sm font-medium text-zinc-700">
            {STAGE_LABELS[stage] || "Processando..."}
          </p>
          <p className="text-xs text-zinc-400 mt-1">Análise módulo por módulo — pode levar alguns instantes</p>
        </div>
      </div>
    );
  }

  // === ERROR ===
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 lg:py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
          <p className="text-sm font-medium text-zinc-700">Erro ao executar auditoria</p>
          <p className="text-xs text-zinc-400 mt-1">{error}</p>
          <button
            onClick={handleRun}
            className="mt-4 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // === REPORT (v4.0 — novo formato MACR) ===
  const { macr, metadata } = report;
  const cabecalho = macr?.cabecalho || {};

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 lg:py-8 pb-20">
      {/* Cabeçalho do MACR */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">{cabecalho.titulo || "MACR"}</h1>
            <p className="text-xs text-zinc-500">Architecture Compliance Report · v4.0</p>
          </div>
        </div>
        <button
          onClick={handleRun}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition"
        >
          <RotateCcw className="w-4 h-4" />
          Nova Auditoria
        </button>
      </div>

      <AuditReportV4 macr={macr} metadata={metadata} />
    </div>
  );
}