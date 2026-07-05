import React, { useState } from "react";
import {
  Layers,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  SlidersHorizontal,
  GitMerge,
  Clock,
} from "lucide-react";
import { runContextBuilderTests, CONTEXT_TEST_CASES } from "@/lib/memory-engine";

export default function ContextTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runContextBuilderTests((p) => {
        setProgress((prev) => ({ ...prev, [p.id]: p }));
      });
      setResults(res);
    } finally {
      setRunning(false);
    }
  };

  const summary = results?.summary;
  const auto = results?.autoEvaluation;
  const conf = results?.confirmation;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 4 · Memory Context Builder</h2>
          <p className="text-sm text-zinc-500">Seleção · Deduplicação · Organização · Limites · lastAccessedAt</p>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <Layers className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Preparar contexto</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Retrieval encontra memórias. O Context Builder decide quais chegam ao Core.
              O Core nunca recebe o resultado bruto do Retrieval.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <GitMerge className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Deduplicação e organização</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Remove duplicatas por normalizedContent. Organiza por prioridade:
              Projeto → Objetivos → Decisões → Preferências → Tarefas → Conhecimento → Outros.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Limites configuráveis</h3>
            <p className="text-sm text-zinc-500 mt-1">
              maxMemories · maxCharacters · maxEstimatedTokens (estimativa simples, sem tokenizer real).
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">lastAccessedAt</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Atualiza apenas <code className="text-xs bg-zinc-100 px-1 rounded">lastAccessedAt</code> nas
              memórias selecionadas. Nenhum outro campo é alterado.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-zinc-900">{summary.accuracy}</p>
            <p className="text-xs text-zinc-500 mt-1">Taxa de acerto</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-emerald-600">{auto?.totalSelected || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Selecionadas</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-amber-600">{auto?.duplicatesRemoved || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Duplicatas removidas</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-violet-600">{auto?.averageProcessingTimeMs || 0}ms</p>
            <p className="text-xs text-zinc-500 mt-1">Tempo médio</p>
          </div>
        </div>
      )}

      {/* Test Runner */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({CONTEXT_TEST_CASES.length} cenários)
          </h3>
          {summary && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              summary.passed === summary.total
                ? "bg-emerald-50 text-emerald-600"
                : "bg-amber-50 text-amber-600"
            }`}>
              {summary.passed}/{summary.total} aprovados
            </span>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {CONTEXT_TEST_CASES.map((tc) => {
            const p = progress[tc.id];
            const isRunning = running && p?.status === "running";
            const passed = p?.status === "passed";
            const failed = p?.status === "failed";
            const done = results?.results?.find((r) => r.id === tc.id);
            return (
              <div key={tc.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                passed ? "border-emerald-200 bg-emerald-50/50" :
                failed ? "border-red-200 bg-red-50/50" :
                "border-zinc-200"
              }`}>
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> :
                   passed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                   failed ? <XCircle className="w-5 h-5 text-red-500" /> :
                   <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700">
                    <span className="text-xs font-mono text-zinc-400">#{tc.id}</span> {tc.name}
                  </p>
                  {done && !done.passed && (
                    <p className="text-xs text-red-500 mt-0.5">{done.error || done.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleRun}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition disabled:opacity-50"
        >
          {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
          {running ? "Executando..." : "Executar Bateria do Context Builder"}
        </button>
      </div>

      {/* Auto-Evaluation */}
      {auto && conf && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Row label="Total recuperadas" value={auto.totalRetrieved} />
              <Row label="Total selecionadas" value={auto.totalSelected} />
              <Row label="Total descartadas" value={auto.totalDiscarded} />
              <Row label="Duplicidades removidas" value={auto.duplicatesRemoved} />
              <Row label="Tempo médio de processamento" value={`${auto.averageProcessingTimeMs}ms`} />
              <Row label="Tokens estimados (total)" value={auto.estimatedTokens} />
              <Row label="lastAccessedAt atualizados" value={auto.lastAccessedUpdated} />
            </div>
            <div className="space-y-2">
              <CheckRow label="Context Builder independente" ok={conf.contextBuilderIndependent} />
              <CheckRow label="Retrieval responsável apenas pela busca" ok={conf.retrievalStillSearchOnly} />
              <CheckRow label="Core nunca recebe resultado bruto" ok={conf.coreNeverReceivesRawRetrieval} />
              <CheckRow label="Duplicidades removidas" ok={conf.duplicatesRemoved} />
              <CheckRow label="Contexto organizado corretamente" ok={conf.contextOrganized} />
              <CheckRow label="Limites configuráveis existem" ok={conf.configurableLimits} />
              <CheckRow label="lastAccessedAt implementado" ok={conf.lastAccessedAtImplemented} />
              <CheckRow label="Builder nunca reclassifica memórias" ok={auto.contextBuilderNeverReclassified} />
              <CheckRow label="Fase 1 intacta" ok={conf.phase1Untouched} />
            </div>
          </div>
        </div>
      )}

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Memory Context — Saída</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  memories: [],           // selecionadas e organizadas
  totalRetrieved: number, // recebidas do Retrieval
  totalSelected: number,  // enviadas ao Core
  discarded: number,      // descartadas (status, expiradas, duplicatas, limites)
  contextSize: number,    // caracteres
  estimatedTokens: number  // estimativa simples (~4 chars/token)
}

// === Novo campo no Memory Record (Sprint 4) ===
lastAccessedAt: string | null  // null inicial, atualizado ao ser utilizado`}
        </pre>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 last:border-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-800">{value}</span>
    </div>
  );
}

function CheckRow({ label, ok }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
      <span className="text-sm text-zinc-600">{label}</span>
    </div>
  );
}