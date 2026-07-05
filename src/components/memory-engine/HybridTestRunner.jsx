import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  GitMerge,
  FileText,
  Layers,
} from "lucide-react";
import { runHybridTests, HYBRID_TEST_CASES } from "@/lib/memory-engine";

export default function HybridTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runHybridTests((p) => {
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
      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <GitMerge className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              Hybrid Retrieval Manager — Fusão e Ranking Híbrido
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Combina resultados de Memory Retrieval, Semantic Retrieval e Vector Index.
              Elimina duplicidades, descarta expiradas e revisões antigas, calcula
              score híbrido ponderado e ordena. Não modifica Memory Records, Embeddings
              ou Version History.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• hybridSearch() — busca híbrida completa</li>
              <li>• mergeResults() — fusão de fontes</li>
              <li>• calculateHybridScore() — score ponderado</li>
              <li>• rankHybridResults() — ordenação por score</li>
              <li>• Pesos configuráveis (50% / 30% / 20%)</li>
              <li>• Pipeline: receber → dedup → unificar → score → ordenar</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Modificar Memory Records</li>
              <li>• Gerar embeddings</li>
              <li>• Indexar vetores</li>
              <li>• Alterar Version History / Lifecycle</li>
              <li>• LLM Ranking / Reranking IA</li>
              <li>• Aprendizado / Feedback / Auto-ajuste</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Arquitetura</h2>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`Retrieval + Semantic + Vector Index
  ↓
Hybrid Retrieval (fusão → dedup → score → ranking)
  ↓
Memory Context Builder → Core`}
        </pre>
      </div>

      {/* Score table */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Tabela de Pesos</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <WeightRow label="Determinístico (Retrieval)" value="50%" color="text-violet-600" />
          <WeightRow label="Semântico (Semantic)" value="30%" color="text-indigo-600" />
          <WeightRow label="Vetorial (Vector)" value="20%" color="text-blue-600" />
        </div>
        <p className="text-xs text-zinc-400 mt-2">Pesos configuráveis via setWeights()</p>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard
            label="Aprovados"
            value={`${summary.passed}/${summary.total}`}
            color="text-emerald-600"
          />
          <StatCard
            label="Buscas híbridas"
            value={auto?.totalHybridSearches || 0}
            color="text-violet-600"
          />
          <StatCard
            label="Tempo total"
            value={`${summary.totalRunTimeMs}ms`}
            color="text-blue-600"
          />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({HYBRID_TEST_CASES.length} cenários)
          </h2>
          {summary && (
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full ${
                summary.passed === summary.total
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {summary.passed}/{summary.total} aprovados
            </span>
          )}
        </div>

        <div className="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
          {HYBRID_TEST_CASES.map((tc) => {
            const p = progress[tc.id];
            const isRunning = running && p?.status === "running";
            const passed = p?.status === "passed";
            const failed = p?.status === "failed";
            const done = results?.results?.find((r) => r.id === tc.id);
            return (
              <div
                key={tc.id}
                className={`flex items-start gap-3 p-3 rounded-xl border ${
                  passed
                    ? "border-emerald-200 bg-emerald-50/50"
                    : failed
                    ? "border-red-200 bg-red-50/50"
                    : "border-zinc-200"
                }`}
              >
                <div className="w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                  ) : passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : failed ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-zinc-300" />
                  )}
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
          {running ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Play className="w-5 h-5" />
          )}
          {running ? "Executando..." : "Executar Bateria de Testes"}
        </button>
      </div>

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Autoavaliação</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatRow label="Total de buscas híbridas" value={auto.totalHybridSearches} />
            <StatRow label="Total de fontes utilizadas" value={auto.totalSourcesUsed} />
            <StatRow label="Duplicidades removidas" value={auto.duplicatesRemoved} />
            <StatRow label="Ranking médio" value={auto.averageRankingScore} />
            <StatRow label="Tempo médio (ms)" value={auto.averageProcessingTimeMs} />
            <StatRow label="Expiradas descartadas" value={auto.expiredDiscarded} />
            <StatRow label="Revisões antigas descartadas" value={auto.oldRevisionsDiscarded} />
            <StatRow
              label="Distribuição: Retrieval"
              value={`${Math.round((auto.weightDistribution?.retrieval || 0) * 100)}%`}
            />
            <StatRow
              label="Distribuição: Semantic"
              value={`${Math.round((auto.weightDistribution?.semantic || 0) * 100)}%`}
            />
            <StatRow
              label="Distribuição: Vector"
              value={`${Math.round((auto.weightDistribution?.vector || 0) * 100)}%`}
            />
            <StatRow
              label="Nenhum componente alterado"
              value={auto.noComponentsModified ? "✓ Confirmado" : "✗ Falhou"}
            />
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptance && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">
              Critérios de Aceitação
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <AcceptRow label="Hybrid Retrieval Manager independente" ok={acceptance.hybridRetrievalManagerIndependent} />
            <AcceptRow label="Fusão funcionando" ok={acceptance.mergeWorking} />
            <AcceptRow label="Ranking híbrido funcionando" ok={acceptance.hybridRankingWorking} />
            <AcceptRow label="Pesos configuráveis existem" ok={acceptance.configurableWeightsExist} />
            <AcceptRow label="Duplicidades removidas" ok={acceptance.duplicatesRemoved} />
            <AcceptRow label="Revisões antigas descartadas" ok={acceptance.oldRevisionsDiscarded} />
            <AcceptRow label="Nenhum componente anterior alterado" ok={acceptance.noComponentsModified} />
            <AcceptRow label="Todos os testes aprovados" ok={acceptance.allTestsPassed} />
            <AcceptRow label="Nenhuma camada da Fase 1 alterada" ok={acceptance.phase1Untouched} />
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

function WeightRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

function AcceptRow({ label, ok }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
      )}
      <span className={ok ? "text-zinc-700" : "text-red-600"}>{label}</span>
    </div>
  );
}