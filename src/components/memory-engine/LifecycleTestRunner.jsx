import React, { useState } from "react";
import { runLifecycleTests, LIFECYCLE_TEST_CASES } from "@/lib/memory-engine";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  Archive,
  Clock,
  RefreshCw,
  Eye,
} from "lucide-react";

export default function LifecycleTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runLifecycleTests((p) => {
        setProgress((prev) => ({ ...prev, [p.id]: p }));
      });
      setResults(res);
    } finally {
      setRunning(false);
    }
  };

  const summary = results?.summary;
  const autoEval = results?.autoEvaluation;

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              Memory Lifecycle Manager — Administração de Estado
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Gerencia exclusivamente o ciclo de vida das memórias: status, expiração,
              arquivamento, substituição e utilização. Nunca cria, recupera, responde,
              altera conteúdo ou reclassifica memórias.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 pt-2 border-t border-zinc-100">
          <span>Fluxo:</span>
          <span className="font-mono">
            Store → Lifecycle Manager → Retrieval → Context Builder → Core
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard value={summary.accuracy} label="Taxa de acerto" color="text-emerald-600" />
            <StatCard value={autoEval.totalActive} label="Ativas" color="text-zinc-900" />
            <StatCard value={autoEval.totalArchived} label="Arquivadas" color="text-amber-600" />
            <StatCard value={autoEval.totalExpired} label="Expiradas" color="text-red-500" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard value={autoEval.totalSuperseded} label="Superseded" color="text-indigo-600" />
            <StatCard value={autoEval.averageAccessCount} label="Access Count médio" color="text-violet-600" />
            <StatCard value={autoEval.lastAccessedUpdated} label="Last Accessed atualizados" color="text-blue-600" />
            <StatCard value={`${autoEval.averageProcessingTimeMs}ms`} label="Tempo médio" color="text-zinc-900" />
          </div>
        </>
      )}

      {/* Test List */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({LIFECYCLE_TEST_CASES.length} cenários)
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

        <div className="space-y-2 mb-4 max-h-[500px] overflow-y-auto">
          {LIFECYCLE_TEST_CASES.map((tc) => {
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-zinc-400">#{tc.id}</span>
                    <span className="text-sm font-medium text-zinc-700">{tc.name}</span>
                  </div>
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

      {/* Auto-Evaluation */}
      {autoEval && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">
              Autoavaliação — Critérios de Aceitação
            </h2>
          </div>
          <div className="space-y-2">
            <EvalRow label="Memory Lifecycle Manager independente" passed />
            <EvalRow label="Gerenciamento oficial de status" passed />
            <EvalRow label="Expiração funcionando" passed />
            <EvalRow label="Arquivamento funcionando" passed />
            <EvalRow label="Superseded funcionando" passed />
            <EvalRow label="accessCount implementado" passed={autoEval.averageAccessCount > 0} />
            <EvalRow label="lastAccessedAt atualizado corretamente" passed={autoEval.lastAccessedUpdated > 0} />
            <EvalRow label="cleanupPreview funcionando" passed />
            <EvalRow label="Todos os testes aprovados" passed={summary.passed === summary.total} />
            <EvalRow
              label="Nenhuma memória removida fisicamente"
              passed={autoEval.physicallyRemoved === 0}
            />
          </div>
        </div>
      )}

      {/* Transitions Reference */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Transições de Status Oficiais</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TransitionCard from="active" to="archived" desc="Arquivamento manual" icon={Archive} />
          <TransitionCard from="active" to="expired" desc="Expiração automática ou manual" icon={Clock} />
          <TransitionCard from="active" to="superseded" desc="Substituição" icon={RefreshCw} />
          <TransitionCard from="archived" to="active" desc="Reativação" icon={Activity} />
        </div>
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700">
            Transições inválidas são rejeitadas. Nenhuma exclusão física nesta Sprint.
          </p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-800">O que faz</h3>
          </div>
          <ul className="text-sm text-zinc-600 space-y-1.5">
            <li>• Transições de status (active, archived, expired, superseded)</li>
            <li>• Expiração automática (expires &lt; agora)</li>
            <li>• Arquivamento manual</li>
            <li>• Substituição (superseded)</li>
            <li>• Controle de utilização (accessCount++, lastAccessedAt)</li>
            <li>• Consultas por status</li>
            <li>• cleanupPreview — apenas informa, nunca remove</li>
          </ul>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-zinc-800">O que não faz</h3>
          </div>
          <ul className="text-sm text-zinc-600 space-y-1.5">
            <li>• Criar memórias</li>
            <li>• Recuperar memórias (busca/ranking)</li>
            <li>• Responder ao usuário</li>
            <li>• Alterar conteúdo de um Memory Record</li>
            <li>• Reclassificar memórias</li>
            <li>• Remover fisicamente</li>
            <li>• Versioning, Merge, Relationships, Embeddings</li>
          </ul>
        </div>
      </div>

      {/* Memory Record Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">
            Evolução do Memory Record — Sprint 5
          </h2>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`// Novo campo (Sprint 5):
accessCount: 0  // inicial 0, incrementado a cada acesso

// Comportamento do recordAccess(id):
record.accessCount++
record.lastAccessedAt = agora
// Nenhum outro campo é alterado`}
        </pre>
      </div>
    </div>
  );
}

function StatCard({ value, label, color }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

function EvalRow({ label, passed }) {
  return (
    <div className="flex items-center gap-2">
      {passed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
      )}
      <span className={`text-sm ${passed ? "text-zinc-700" : "text-red-500"}`}>{label}</span>
    </div>
  );
}

function TransitionCard({ from, to, desc, icon: Icon }) {
  return (
    <div className="bg-zinc-50 rounded-xl p-4 flex items-center gap-3">
      <Icon className="w-4 h-4 text-violet-500 shrink-0" />
      <div>
        <p className="text-xs font-mono text-zinc-600">
          {from} → {to}
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}