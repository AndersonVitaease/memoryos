import React, { useState } from "react";
import { Brain, Play, CheckCircle2, XCircle, Loader2, Cpu, FileText } from "lucide-react";
import { runClassifierTests, CLASSIFIER_TEST_CASES } from "@/lib/memory-engine";

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

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8 lg:py-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-zinc-900">Memory Engine</h1>
          <p className="text-sm text-zinc-500">Fase 2 · Módulo 1: Memory Classifier</p>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6 space-y-3">
        <div className="flex items-start gap-3">
          <Cpu className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">Responsabilidade única</h2>
            <p className="text-sm text-zinc-500 mt-1">
              O Memory Classifier apenas decide se uma informação deve se tornar memória permanente.
              Ele não grava, não consulta banco, não faz busca — apenas classifica.
            </p>
          </div>
        </div>
      </div>

      {/* Test Runner */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-800">Testes Automáticos</h2>
          {results && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              results.allPassed ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            }`}>
              {results.passed}/{results.total} aprovados
            </span>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {CLASSIFIER_TEST_CASES.map((tc) => {
            const p = progress[tc.id];
            const isRunning = running && p?.status === "running";
            const passed = p?.status === "passed";
            const failed = p?.status === "failed";
            const done = results?.results.find((r) => r.id === tc.id);
            return (
              <div key={tc.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                passed ? "border-emerald-200 bg-emerald-50/50" :
                failed ? "border-red-200 bg-red-50/50" :
                "border-zinc-200"
              }`}>
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-violet-500" /> :
                   passed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                   failed ? <XCircle className="w-5 h-5 text-red-500" /> :
                   <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700">
                    Teste {tc.id}: <span className="text-zinc-500">"{tc.input.userMessage}"</span>
                  </p>
                  <p className="text-xs text-zinc-400">{tc.description}</p>
                  {done && !done.passed && (
                    <p className="text-xs text-red-500 mt-1">
                      Esperado: shouldRemember={String(tc.expect.shouldRemember)}
                      {tc.expect.memoryType ? `, memoryType="${tc.expect.memoryType}"` : ""}
                      {" | "}Obtido: shouldRemember={String(done.result?.shouldRemember)}
                      {done.result ? `, memoryType="${done.result.memoryType}"` : ""}
                      {done.error ? `, erro: ${done.error}` : ""}
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
          {running ? "Executando..." : "Executar Testes"}
        </button>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Contrato de Saída</h2>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  shouldRemember: boolean,
  memoryType: string,
  confidence: "low" | "medium" | "high",
  reason: string,
  suggestedTitle: string,
  tags: string[],
  importance: "low" | "medium" | "high"
}`}
        </pre>
      </div>
    </div>
  );
}