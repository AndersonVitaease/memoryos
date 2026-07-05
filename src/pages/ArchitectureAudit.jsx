import React, { useState } from "react";
import {
  ShieldCheck,
  Loader2,
  FileSearch,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  RotateCcw,
  BookOpen,
  FileCode2,
  FolderTree,
  GitPullRequest,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { analyze as auditAnalyze, AUDIT_LEVELS } from "@/lib/specialists/architectureAuditor";

const STAGE_LABELS = {
  idle: "Pronto",
  "reading-project": "Lendo código-fonte do projeto...",
  "reading-library": "Carregando Biblioteca Oficial...",
  analyzing: "Analisando conformidade arquitetural...",
  "building-report": "Construindo MACR...",
  done: "Auditoria concluída",
};

const AUDIT_LEVEL_OPTIONS = [
  { level: "file", label: "Arquivo", icon: FileCode2, hint: "Um arquivo específico" },
  { level: "module", label: "Pasta/Módulo", icon: FolderTree, hint: "Uma pasta ou módulo" },
  { level: "project", label: "Projeto Completo", icon: Building2, hint: "Todo o projeto" },
  { level: "pr", label: "Pull Request", icon: GitPullRequest, hint: "Arquivos alterados" },
];

function scoreColor(score) {
  if (score >= 8) return "text-emerald-600 bg-emerald-50";
  if (score >= 5) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}
function scoreBarColor(score) {
  if (score >= 8) return "bg-emerald-500";
  if (score >= 5) return "bg-amber-500";
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
  const [stage, setStage] = useState("idle");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [auditLevel, setAuditLevel] = useState("project");

  const handleRun = async () => {
    setStage("reading-project");
    setError(null);
    setReport(null);
    try {
      // Página usa APENAS a interface oficial do Specialist (Correção 8).
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
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 lg:py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading text-zinc-900">Architecture Auditor</h1>
            <p className="text-sm text-zinc-500">Primeiro Especialista Oficial do MemoryOS</p>
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
            <FileSearch className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">Pipeline modular e escalável</h2>
              <p className="text-sm text-zinc-500 mt-1">
                O Specialist orquestra Capabilities oficiais: ProjectReader → OfficialLibraryReader →
                CodeAnalyzer → ReportBuilder. Análise módulo por módulo.
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

        {/* Seleção de nível de auditoria (Correção 7) */}
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

  // === REPORT ===
  const { macr, metadata } = report;
  const currentLevelLabel = AUDIT_LEVEL_OPTIONS.find((o) => o.level === metadata?.scope?.level)?.label || "Projeto";

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 lg:py-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">MACR</h1>
            <p className="text-xs text-zinc-500">MemoryOS Architecture Compliance Report</p>
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

      {/* Metadata */}
      <div className="flex items-center gap-3 mb-6 text-xs text-zinc-400 flex-wrap">
        <span>Nível: {currentLevelLabel}</span>
        <span>•</span>
        <span>{metadata?.fileCount || 0} arquivos</span>
        <span>•</span>
        <span>{metadata?.moduleCount || 0} módulos</span>
        <span>•</span>
        <span>{metadata?.docCount || 0} documentos oficiais</span>
        <span>•</span>
        <span>Confiança: {Math.round((metadata?.confidence || 0) * 100)}%</span>
      </div>

      {/* Resultado Geral */}
      {macr?.resultado_geral && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Resultado Geral</h2>
          </div>
          <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">{macr.resultado_geral}</p>
        </div>
      )}

      {/* Resumo Executivo */}
      {macr?.resumo_executivo && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Resumo Executivo</h2>
          <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">{macr.resumo_executivo}</p>
        </div>
      )}

      {/* Pontuação por Categoria */}
      {macr?.pontuacao?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Pontuação por Categoria</h2>
          </div>
          <div className="space-y-3">
            {macr.pontuacao.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-700">{item.categoria}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor(item.pontuacao)}`}>
                    {item.pontuacao}/10
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${scoreBarColor(item.pontuacao)}`} style={{ width: `${item.pontuacao * 10}%` }} />
                </div>
                {item.comentario && <p className="text-xs text-zinc-400 mt-1">{item.comentario}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violações */}
      {macr?.violacoes?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Violações ({macr.violacoes.length})</h2>
          </div>
          <div className="space-y-3">
            {macr.violacoes.map((v, i) => (
              <div key={i} className="border border-zinc-100 rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityColor(v.prioridade)}`}>
                    {(v.prioridade || "baixa").toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-zinc-500">{v.documento || "—"} · {v.secao || "—"}</span>
                  {v.arquivo && <span className="text-[10px] text-zinc-400 font-mono">{v.arquivo}</span>}
                </div>
                {v.impacto && <p className="text-sm text-zinc-700 mb-2">{v.impacto}</p>}
                {v.correcao_recomendada && (
                  <div className="mt-2 pl-3 border-l-2 border-violet-200">
                    <p className="text-xs text-zinc-400 mb-0.5">Correção recomendada</p>
                    <p className="text-xs text-zinc-600">{v.correcao_recomendada}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Riscos Arquiteturais */}
      {macr?.riscos_arquiteturais?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Riscos Arquiteturais</h2>
          <ul className="space-y-2">
            {macr.riscos_arquiteturais.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-red-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dívida Técnica */}
      {macr?.divida_tecnica?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Dívida Técnica</h2>
          <ul className="space-y-2">
            {macr.divida_tecnica.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-orange-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Melhorias Recomendadas */}
      {macr?.melhorias_recomendadas?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Melhorias Recomendadas</h2>
          </div>
          <ul className="space-y-2">
            {macr.melhorias_recomendadas.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-violet-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documentação para Atualizar */}
      {macr?.documentacao_para_atualizar?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Documentação a Atualizar</h2>
          </div>
          <ul className="space-y-2">
            {macr.documentacao_para_atualizar.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conclusão */}
      {macr?.conclusao && (
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-5 lg:p-6 mb-4">
          <h2 className="text-sm font-semibold text-violet-800 mb-2">Conclusão</h2>
          <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{macr.conclusao}</p>
        </div>
      )}
    </div>
  );
}