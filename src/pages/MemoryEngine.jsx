import React, { useState } from "react";
import { Brain, Play, CheckCircle2, XCircle, Loader2, Cpu, FileText, Layers } from "lucide-react";
import { runClassifierTests, TEST_BATTERY } from "@/lib/memory-engine";

export default function MemoryEngine() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runClassifierTests((p) => {
        setProgress((prev) => ({ ...prev, [p.id]: p }));
      });
      setResults(res);
    } finally {
      setRunning(false);
    }
  };

  const summary = results?.summary;

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8 lg:py-12 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-zinc-900">Memory Engine</h1>
          <p className="text-sm text-zinc-500">Fase 2 · Sprint 1: Memory Classifier Estabilizado</p>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6 space-y-3">
        <div className="flex items-start gap-3">
          <Cpu className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">Pipeline de Decisão — 3 níveis</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Cada mensagem passa por <strong>Fast Path</strong> → <strong>Rule Engine</strong> → <strong>LLM</strong>.
              Cada nível só é acionado quando o anterior não decide com segurança.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Layers className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">Responsabilidade única</h2>
            <p className="text-sm text-zinc-500 mt-1">
              O Classifier apenas decide se uma informação deve se tornar memória permanente.
              Não grava, não consulta banco, não faz busca — apenas classifica.
            </p>
          </div>
        </div>
      </div>

      {/* Distribution Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">{summary.accuracy}</p>
            <p className="text-xs text-zinc-500 mt-1">Taxa de acerto</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-violet-600">{summary.distribution?.fast_path || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Fast Path</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-indigo-600">{summary.distribution?.rule_engine || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Rule Engine</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{summary.distribution?.llm || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">LLM</p>
          </div>
        </div>
      )}

      {/* Test Runner */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({TEST_BATTERY.length} mensagens)
          </h2>
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

        <div className="space-y-2 mb-4 max-h-[500px] overflow-y-auto">
          {TEST_BATTERY.map((tc) => {
            const p = progress[tc.id];
            const isRunning = running && p?.status === "running";
            const passed = p?.status === "passed";
            const failed = p?.status === "failed";
            const done = results?.results?.find((r) => r.id === tc.id);
            const sourceBadge = done?.got?.decisionSource || done?.got?.error;
            return (
              <div key={tc.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
                passed ? "border-emerald-200 bg-emerald-50/50" :
                failed ? "border-red-200 bg-red-50/50" :
                "border-zinc-200"
              }`}>
                <div className="w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-violet-500" /> :
                   passed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                   failed ? <XCircle className="w-5 h-5 text-red-500" /> :
                   <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-zinc-400">#{tc.id}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{tc.category}</span>
                    {done?.got?.decisionSource && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        done.got.decisionSource === "fast_path" ? "bg-violet-100 text-violet-700" :
                        done.got.decisionSource === "rule_engine" ? "bg-indigo-100 text-indigo-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {done.got.decisionSource}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-zinc-700 mt-0.5">"{tc.msg}"</p>
                  {done && !done.passed && (
                    <p className="text-xs text-red-500 mt-1">
                      Esperado: shouldRemember={String(tc.expect)}
                      {tc.expectedType ? `, type="${tc.expectedType}"` : ""}
                      {tc.expectedSource ? `, source="${tc.expectedSource}"` : ""}
                      {done.got?.shouldRemember !== undefined && (
                        <>{" | "}Obtido: shouldRemember={String(done.got.shouldRemember)},
                        source="{done.got.decisionSource}",
                        type="{done.got.memoryType}"</>
                      )}
                      {done.got?.error ? `, erro: ${done.got.error}` : ""}
                    </p>
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
          {running ? "Executando..." : "Executar Bateria de Testes"}
        </button>
      </div>

      {/* Recommendations */}
      {results?.recommendations && results.recommendations.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Recomendações</h2>
          <ul className="space-y-2">
            {results.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-zinc-600 flex items-start gap-2">
                <span className="text-violet-500 mt-0.5">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Contrato de Saída</h2>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  shouldRemember: boolean,
  decisionSource: "fast_path" | "rule_engine" | "llm",
  memoryType: string,
  reasonCode: string,
  confidence: "low" | "medium" | "high",
  importance: "low" | "medium" | "high",
  reason: string,
  suggestedTitle: string,
  tags: string[]
}`}
        </pre>
      </div>
    </div>
  );
}