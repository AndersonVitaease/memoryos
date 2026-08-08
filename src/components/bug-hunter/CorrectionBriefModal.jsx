/**
 * CorrectionBriefModal — Gera um Brief de Correção unificado.
 *
 * Combina BugFindings (externos, do Bug Hunter) + dados do motor OIE
 * (HealthMonitor snapshot + ExecutionObservation recentes) num relatório
 * estruturado (causa-raiz, areas afetadas, mudancas sugeridas por prioridade)
 * que o dono do MemoryOS copia e encaminha a qualquer IA para executar a correcao.
 *
 * O brief e gerado por LLM (Claude Sonnet) com todo o contexto injetado no
 * prompt — saida em markdown puro para maxima portabilidade entre IAs.
 */
import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { HealthMonitor } from "@/lib/operational-intelligence";
import {
  Loader2, Copy, Check, FileText, X, Wrench,
} from "lucide-react";

export default function CorrectionBriefModal({ findings, onClose }) {
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setBrief(null);
    try {
      // 1. OIE Health Snapshot — saude interna do MemoryOS (top erros, behavior signatures, worst connectors)
      let healthSnap = null;
      try {
        healthSnap = await HealthMonitor.snapshot(500);
      } catch (e) {
        // OIE pode nao estar inicializado — continua sem ele
      }

      // 2. ExecutionObservation recentes — anomalias de execucao internas
      let recentObs = [];
      try {
        recentObs = await base44.entities.ExecutionObservation.list("-created_date", 30);
      } catch (e) {
        // silencioso
      }
      // Filtra so falhas/anomalias (nao success/completed)
      const anomalies = (recentObs || []).filter(
        (o) => o.status === "failed" || o.status === "timeout" || o.behavior_signature
      );

      // 3. Constroi o contexto estruturado
      const bugsCtx = findings.map((f, i) => {
        return [
          `BUG ${i + 1}: ${f.title}`,
          `  Categoria: ${f.category} | Severidade: ${f.severity} | Status: ${f.status}`,
          f.description ? `  Descricao: ${f.description}` : "",
          f.actual ? `  Comportamento real: ${f.actual}` : "",
          f.expected ? `  Esperado: ${f.expected}` : "",
          f.console_errors ? `  Console: ${f.console_errors.slice(0, 300)}` : "",
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const healthCtx = healthSnap ? [
        `OBSERVACOES TOTAIS: ${healthSnap.total}`,
        `TAXA DE SUCESSO: ${(healthSnap.successRate * 100).toFixed(1)}%`,
        healthSnap.topErrorSignatures?.length
          ? `TOP ERROS: ${healthSnap.topErrorSignatures.slice(0, 5).map((s) => `${s.signature} (${s.count}x)`).join(", ")}`
          : "",
        healthSnap.topBehaviorSignatures?.length
          ? `FALHAS SILENCIOSAS (behavior signatures): ${healthSnap.topBehaviorSignatures.slice(0, 5).map((s) => `${s.signature} (${s.count}x)`).join(", ")}`
          : "",
        healthSnap.worstConnectors?.length
          ? `CONNECTORS COM MAIOR FALHA: ${healthSnap.worstConnectors.slice(0, 5).map((c) => `${c.connector} (${(c.failureRate * 100).toFixed(0)}%)`).join(", ")}`
          : "",
      ].filter(Boolean).join("\n") : "(OIE nao disponivel)";

      const anomaliesCtx = anomalies.length > 0
        ? anomalies.slice(0, 15).map((o) =>
            `- ${o.connector}.${o.capability} → ${o.status}${o.error_signature ? ` [${o.error_signature}]` : ""}${o.behavior_signature ? ` (behavior: ${o.behavior_signature})` : ""}${o.error_message ? ` "${o.error_message.slice(0, 120)}"` : ""}`
          ).join("\n")
        : "(nenhuma anomalia recente)";

      // 4. Prompt estruturado para o LLM gerar o brief
      const prompt = [
        "Voce e o Gerador de Brief de Correcao do MemoryOS.",
        "Sua tarefa: unir os bugs externos (Bug Hunter) com a saude interna (OIE) e produzir um BRIEF DE CORRECAO estruturado em markdown, pronto para ser encaminhado a qualquer IA de desenvolvimento para executar as correcoes.",
        "",
        "Responda em portugues (pt-BR). Seja direto, tecnico e acao-orientado.",
        "",
        "=== BUGS EXTERNOS (encontrados pelo Bug Hunter no app publicado) ===",
        bugsCtx || "(nenhum bug selecionado)",
        "=== FIM DOS BUGS ===",
        "",
        "=== SAUDE INTERNA (OIE — Operational Intelligence Engine) ===",
        healthCtx,
        "=== FIM DA SAUDE ===",
        "",
        "=== ANOMALIAS DE EXECUCAO RECENTES (ExecutionObservation internas) ===",
        anomaliesCtx,
        "=== FIM DAS ANOMALIAS ===",
        "",
        "Gere o brief EXATAMENTE nesta estrutura markdown:",
        "",
        "# Brief de Correcao — MemoryOS",
        "",
        "## Resumo Executivo",
        "(2-3 frases conectando bugs externos a causas-raiz internas)",
        "",
        "## Causas-Raiz Identificadas",
        "(liste cada causa-raiz como bullet, conectando o sintoma externo a falha interna)",
        "",
        "## Areas Afetadas",
        "(para cada area: nome, arquivos/componentes provaveis, severidade)",
        "",
        "## Mudancas Sugeridas (por prioridade)",
        "(liste em ordem de prioridade: cada item com titulo, descricao tecnica da mudanca, e hint de arquivo/componente a alterar)",
        "",
        "## Plano de Encaminhamento para IA",
        "(instrucao curta de como repassar este brief a uma IA de desenvolvimento — ex: 'Cole este brief no chat do Base44 e peça para corrigir os itens em ordem de prioridade.')",
        "",
        "Seja conciso mas completo. Nao invente arquivos que nao facam sentido na arquitetura MemoryOS (React + Tailwind frontend, backend functions em base44/functions, entidades em base44/entities, lib em src/lib).",
      ].join("\n");

      // 5. Invoca LLM — modelo de qualidade para analise profunda
      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
      });

      setBrief(typeof res === "string" ? res : JSON.stringify(res, null, 2));
    } catch (e) {
      setError(e.message || "Falha ao gerar brief");
    } finally {
      setGenerating(false);
    }
  }, [findings]);

  useEffect(() => {
    if (findings.length > 0) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(brief || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-zinc-100">Brief de Correcao</h2>
            <p className="text-[11px] text-zinc-500">
              {findings.length} bug(s) + OIE → brief estruturado pronto para encaminhar a qualquer IA
            </p>
          </div>
          {brief && !generating && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500 text-white hover:bg-violet-400 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado!" : "Copiar brief"}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {generating && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              <p className="text-sm text-zinc-400">Coletando dados do OIE e gerando brief...</p>
              <p className="text-xs text-zinc-600">Unindo bugs externos + saude interna + anomalias de execucao</p>
            </div>
          )}

          {error && !generating && (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <p className="text-sm text-red-400">Erro: {error}</p>
              <button
                onClick={generate}
                className="mt-2 px-4 py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {brief && !generating && !error && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
                <FileText className="w-3.5 h-3.5" />
                <span>Brief gerado — copie e cole no chat da IA de desenvolvimento (ex: Base44 builder)</span>
              </div>
              <pre className="text-sm text-zinc-200 whitespace-pre-wrap break-words font-mono leading-relaxed bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
{brief}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        {brief && !generating && (
          <div className="shrink-0 px-5 py-3 border-t border-zinc-800 bg-zinc-900/50">
            <p className="text-[11px] text-zinc-500 text-center">
              Brief pronto. Copie e encaminhe ao Base44 (ou qualquer IA de dev) solicitando a correcao em ordem de prioridade.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}