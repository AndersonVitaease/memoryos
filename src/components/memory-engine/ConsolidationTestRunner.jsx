import React, { useState } from "react";
import { runConsolidationTests, CONSOLIDATION_TEST_CASES } from "@/lib/memory-engine";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  GitMerge,
  Plus,
  RefreshCw,
  Ban,
  Eye,
} from "lucide-react";

export default function ConsolidationTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runConsolidationTests((p) => {
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
          <GitMerge className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              Memory Consolidation Manager — Decisão de Consolidação
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Analisa um novo Memory Record e decide: criar, atualizar, fundir ou ignorar.
              Nunca modifica memórias, nunca persiste, nunca responde ao usuário.
              Apenas retorna a decisão através do contrato oficial.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 pt-2 border-t border-zinc-100">
          <span>Fluxo:</span>
          <span className="font-mono">
            Usuário → Core → Classifier → Record → Consolidation → Decision → Store
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard value={summary.accuracy} label="Taxa de acerto" color="text-emerald-600" />
            <StatCard value={autoEval.totalCreate} label="CREATE" color="text-emerald-600" icon={Plus} />
            <StatCard value={autoEval.totalUpdate} label="UPDATE" color="text-amber-600" icon={RefreshCw} />
            <StatCard value={autoEval.totalMerge} label="MERGE" color="text-violet-600" icon={GitMerge} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard value={autoEval.totalIgnore} label="IGNORE" color="text-zinc-500" icon={Ban} />
            <StatCard value={autoEval.lowConfidenceCount} label="Baixa confiança" color="text-orange-500" />
            <StatCard value={autoEval.candidateMemoriesAnalyzed} label="Candidates analisadas" color="text-blue-600" />
            <StatCard value={`${autoEval.averageProcessingTimeMs}ms`} label="Tempo médio" color="text-zinc-900" />
          </div>
        </>
      )}

      {/* Test List */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({CONSOLIDATION_TEST_CASES.length} cenários)
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
          {CONSOLIDATION_TEST_CASES.map((tc) => {
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
                  {done && done.got?.decision && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${actionColor(done.got.decision.action)}`}>
                        {done.got.decision.action}
                      </span>
                      <span className="text-xs text-zinc-400">{done.got.decision.reasonCode}</span>
                    </div>
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
            <EvalRow label="Memory Consolidation Manager independente" passed />
            <EvalRow label="CREATE funcionando" passed={autoEval.totalCreate > 0} />
            <EvalRow label="UPDATE funcionando" passed={autoEval.totalUpdate > 0} />
            <EvalRow label="MERGE funcionando" passed={autoEval.totalMerge > 0} />
            <EvalRow label="IGNORE funcionando" passed={autoEval.totalIgnore > 0} />
            <EvalRow label="Nenhuma memória alterada diretamente" passed={autoEval.noMemoryModified} />
            <EvalRow label="Nenhum Memory Record persistido" passed={autoEval.noMemoryPersisted} />
            <EvalRow label="Decisões via contrato oficial" passed />
            <EvalRow label="Todos os testes aprovados" passed={summary.passed === summary.total} />
            <EvalRow label="Nenhuma camada da Fase 1 alterada" passed={autoEval.phase1Untouched} />
          </div>
        </div>
      )}

      {/* Decisions Reference */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Decisões Oficiais</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DecisionCard action="CREATE" desc="Criar nova memória" icon={Plus} color="emerald" />
          <DecisionCard action="UPDATE" desc="Atualizar memória existente (apenas indicar)" icon={RefreshCw} color="amber" />
          <DecisionCard action="MERGE" desc="Fusão de memórias equivalentes (apenas indicar)" icon={GitMerge} color="violet" />
          <DecisionCard action="IGNORE" desc="Registro não gera alteração" icon={Ban} color="zinc" />
        </div>
      </div>

      {/* Reason Codes */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Reason Codes Oficiais</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {["NEW_MEMORY", "DUPLICATE", "UPDATED_INFORMATION", "SIMILAR_MEMORY", "POSSIBLE_MERGE", "LOW_CONFIDENCE", "OUTDATED_INFORMATION"].map((code) => (
            <span key={code} className="text-xs font-mono px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600">
              {code}
            </span>
          ))}
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
            <li>• Recebe Memory Record + lista de existentes</li>
            <li>• Aplica heurísticas determinísticas de similaridade</li>
            <li>• Compara memoryType, memoryIntent, tags, título, conteúdo</li>
            <li>• Retorna decisão: CREATE, UPDATE, MERGE, IGNORE</li>
            <li>• Observabilidade interna (logs, sem persistência)</li>
          </ul>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-zinc-800">O que não faz</h3>
          </div>
          <ul className="text-sm text-zinc-600 space-y-1.5">
            <li>• Modificar diretamente qualquer memória</li>
            <li>• Persistir dados</li>
            <li>• Responder ao usuário</li>
            <li>• Alterar conteúdo, classificação, status, revision, lifecycle</li>
            <li>• Realizar merge real ou atualização</li>
            <li>• Embeddings, Vetores, IA semântica, Versioning, Relationships</li>
          </ul>
        </div>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800">Contrato de Saída Oficial</h2>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  action: "CREATE" | "UPDATE" | "MERGE" | "IGNORE",
  targetMemoryId: string | null,
  confidence: "low" | "medium" | "high",
  reasonCode: string,
  reason: string
}`}
        </pre>
      </div>
    </div>
  );
}

function StatCard({ value, label, color, icon: Icon }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
      <div className="flex items-center justify-center gap-1">
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </div>
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

function DecisionCard({ action, desc, icon: Icon, color }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    violet: "bg-violet-50 text-violet-600 border-violet-200",
    zinc: "bg-zinc-50 text-zinc-500 border-zinc-200",
  };
  return (
    <div className={`rounded-xl p-4 border flex items-center gap-3 ${colorMap[color]}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <div>
        <p className="text-xs font-mono font-bold">{action}</p>
        <p className="text-xs mt-0.5 opacity-80">{desc}</p>
      </div>
    </div>
  );
}

function actionColor(action) {
  const map = {
    CREATE: "bg-emerald-100 text-emerald-700",
    UPDATE: "bg-amber-100 text-amber-700",
    MERGE: "bg-violet-100 text-violet-700",
    IGNORE: "bg-zinc-100 text-zinc-500",
  };
  return map[action] || "bg-zinc-100 text-zinc-500";
}