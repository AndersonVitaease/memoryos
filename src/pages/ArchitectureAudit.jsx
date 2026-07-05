import React, { useState } from "react";
import {
  ShieldCheck,
  Loader2,
  FileSearch,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  CheckCircle2,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import { runAudit } from "@/lib/specialists/architectureAuditor";

const STAGE_LABELS = {
  loading: "Carregando Biblioteca Oficial...",
  collecting: "Coletando código-fonte do projeto...",
  analyzing: "Analisando conformidade arquitetural...",
  done: "Auditoria concluída",
};

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

function severityColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s.includes("crít") || s.includes("crit")) return "bg-red-100 text-red-700 border-red-200";
  if (s.includes("alta")) return "bg-orange-100 text-orange-700 border-orange-200";
  if (s.includes("méd") || s.includes("med")) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

export default function ArchitectureAudit() {
  const [stage, setStage] = useState("idle");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const handleRun = async () => {
    setStage("loading");
    setError(null);
    setReport(null);
    try {
      const result = await runAudit(setStage);
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

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 lg:p-8 space-y-4">
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
              <h2 className="text-sm font-semibold text-zinc-800">Análise automatizada</h2>
              <p className="text-sm text-zinc-500 mt-1">
                O especialista lê automaticamente os documentos oficiais e o código-fonte do projeto,
                gerando um MemoryOS Architecture Compliance Report (MACR).
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

        <button
          onClick={handleRun}
          className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition"
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
          <p className="text-xs text-zinc-400 mt-1">Isso pode levar alguns segundos</p>
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
        <span>{metadata?.sourceFilesAnalyzed || 0} arquivos analisados</span>
        <span>•</span>
        <span>{metadata?.docsLoaded || 0} documentos oficiais</span>
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
          <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
            {macr.resultado_geral}
          </p>
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
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor(item.pontuacao)}`}
                  >
                    {item.pontuacao}/10
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scoreBarColor(item.pontuacao)}`}
                    style={{ width: `${item.pontuacao * 10}%` }}
                  />
                </div>
                {item.comentario && (
                  <p className="text-xs text-zinc-400 mt-1">{item.comentario}</p>
                )}
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
            <h2 className="text-sm font-semibold text-zinc-800">
              Violações Encontradas ({macr.violacoes.length})
            </h2>
          </div>
          <div className="space-y-3">
            {macr.violacoes.map((v, i) => (
              <div key={i} className="border border-zinc-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${severityColor(
                        v.severidade
                      )}`}
                    >
                      {(v.severidade || "baixa").toUpperCase()}
                    </span>
                    <span className="text-xs font-medium text-zinc-500">
                      {v.documento || "—"} · {v.secao || "—"}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-zinc-700 mb-2">{v.descricao}</p>
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

      {/* Dívida Técnica */}
      {macr?.divida_tecnica?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Dívida Técnica</h2>
          </div>
          <ul className="space-y-2">
            {macr.divida_tecnica.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-orange-400 mt-2 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Melhorias Sugeridas */}
      {macr?.melhorias_sugeridas?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Melhorias Sugeridas</h2>
          </div>
          <ul className="space-y-2">
            {macr.melhorias_sugeridas.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-violet-400 mt-2 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conclusão Final */}
      {macr?.conclusao_final && (
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-5 lg:p-6 mb-4">
          <h2 className="text-sm font-semibold text-violet-800 mb-2">Conclusão Final</h2>
          <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
            {macr.conclusao_final}
          </p>
        </div>
      )}
    </div>
  );
}