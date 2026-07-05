import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Lightbulb,
  FileText,
  Eye,
} from "lucide-react";
import { runLearningTests, LEARNING_TEST_CASES } from "@/lib/memory-engine";

export default function LearningTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runLearningTests((p) => {
        setProgress((prev) => ({ ...prev, [p.id]: p }));
      });
      setResults(res);
    } finally {
      setRunning(false);
    }
  };

  const summary = results?.summary;
  const auto = results?.autoEvaluation;
  const acceptance = results?.acceptance;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200">
          <Lightbulb className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 13 · Memory Learning Manager</h2>
          <p className="text-sm text-zinc-500">Observação de padrões → Learning Insights</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <Eye className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Observar e Aprender</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Learning Manager observa o comportamento do sistema (acessos, lifecycle, retrieval,
              consolidation, version history) e produz Learning Insights. Nunca modifica memórias,
              rankings, lifecycle, embeddings ou relationships.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• generateInsights() — detecta padrões</li>
              <li>• listInsights() — lista com filtros</li>
              <li>• getInsights(memoryId) — por memória</li>
              <li>• dismissInsight(id) — descarta</li>
              <li>• countInsights() — contagem</li>
              <li>• Persiste apenas Insights</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Modificar Memory Records</li>
              <li>• Alterar Ranking / Retrieval</li>
              <li>• Alterar Lifecycle / Version History</li>
              <li>• Alterar Embeddings / Relationships</li>
              <li>• Responder ao usuário</li>
              <li>• Aprendizado automático / LLM</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Insight Types */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Tipos de Insight</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {["FREQUENTLY_ACCESSED", "RARELY_ACCESSED", "POSSIBLE_ARCHIVE", "POSSIBLE_UPDATE", "POSSIBLE_RELATIONSHIP", "POPULAR_TOPIC", "UNUSED_MEMORY"].map((t) => (
            <span key={t} className="text-xs px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-medium text-center">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Learning Insight — Contrato</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  insightId: UUID,
  type: "FREQUENTLY_ACCESSED" | "RARELY_ACCESSED" | "POSSIBLE_ARCHIVE" |
        "POSSIBLE_UPDATE" | "POSSIBLE_RELATIONSHIP" | "POPULAR_TOPIC" | "UNUSED_MEMORY",
  memoryId: string,
  confidence: "low" | "medium" | "high",
  reason: string,
  createdAt: datetime,
  status: "active" | "dismissed"
}`}
        </pre>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Insights criados" value={auto?.totalInsightsCreated || 0} color="text-amber-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({LEARNING_TEST_CASES.length} cenários)
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

        <div className="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
          {LEARNING_TEST_CASES.map((tc) => {
            const p = progress[tc.id];
            const isRunning = running && p?.status === "running";
            const passed = p?.status === "passed";
            const failed = p?.status === "failed";
            const done = results?.results?.find((r) => r.id === tc.id);
            return (
              <div key={tc.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
                passed ? "border-emerald-200 bg-emerald-50/50" :
                failed ? "border-red-200 bg-red-50/50" :
                "border-zinc-200"
              }`}>
                <div className="w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> :
                   passed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                   failed ? <XCircle className="w-5 h-5 text-red-500" /> :
                   <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-zinc-400">#{tc.id}</span>
                  <p className="text-sm font-medium text-zinc-700">{tc.name}</p>
                  {done && !done.passed && done.error && (
                    <p className="text-xs text-red-500 mt-1">{done.error}</p>
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

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <StatRow label="Total de Insights criados" value={auto.totalInsightsCreated} />
            <StatRow label="Eventos analisados" value={auto.eventsAnalyzed} />
            <StatRow label="Duplicidades evitadas" value={auto.duplicatesAvoided} />
            <StatRow label="Tempo médio (ms)" value={auto.averageProcessingTimeMs} />
            <StatRow label="Nenhuma memória modificada" value={auto.noMemoryModified ? "✓" : "✗"} />
          </div>
          {auto.insightTypeDistribution && Object.values(auto.insightTypeDistribution).some((v) => v > 0) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Distribuição por Tipo</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(auto.insightTypeDistribution)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <span key={type} className="text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-medium">
                      {type}: {count}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptance && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Critérios de Aceitação</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <AcceptRow label="Memory Learning Manager independente" ok={acceptance.learningManagerIndependent} />
            <AcceptRow label="Contrato Learning Insight existe" ok={acceptance.learningInsightContractExists} />
            <AcceptRow label="Geração de Insights funciona" ok={acceptance.insightGenerationWorks} />
            <AcceptRow label="Nenhuma memória alterada" ok={acceptance.noMemoryModified} />
            <AcceptRow label="Todos os testes aprovados" ok={acceptance.allTestsPassed} />
            <AcceptRow label="Nenhuma Sprint anterior modificada" ok={acceptance.previousSprintsUntouched} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-800">{value}</span>
    </div>
  );
}

function AcceptRow({ label, ok }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      <span className={ok ? "text-zinc-700" : "text-red-600"}>{label}</span>
    </div>
  );
}