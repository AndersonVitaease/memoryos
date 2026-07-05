import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Layers,
  Zap,
  ShieldCheck,
  Clock,
  Coins,
  TrendingUp,
} from "lucide-react";
import { runExecutionTests, EXECUTION_TEST_CASES } from "@/lib/cognitive-engine";

export default function ExecutionTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runExecutionTests((p) => {
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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-200">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 19 · Execution Engine</h2>
          <p className="text-sm text-zinc-500">Executa plano aprovado — determinístico, sem efeitos externos</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Executar</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Execution Engine recebe um Plan Result e executa suas etapas de forma determinística.
              Não toma decisões, não cria planos, não aprende, não consulta memória, não chama LLM.
              Apenas executa o plano já aprovado.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• executePlan() — executa plano completo</li>
              <li>• executeStep() — executa etapa individual</li>
              <li>• validateExecutionOrder() — valida ordem</li>
              <li>• updateExecutionStatus() — atualiza estado</li>
              <li>• calculateExecutionCost() — custo real</li>
              <li>• calculateExecutionTime() — tempo total</li>
              <li>• calculateSuccessRate() — taxa de sucesso</li>
              <li>• describeExecution() — descrição legível</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Tomar decisões</li>
              <li>• Criar novos planos</li>
              <li>• Aprender</li>
              <li>• Consultar memória</li>
              <li>• Chamar LLM</li>
              <li>• Alterar o Planning Engine</li>
              <li>• Alterar o Decision Engine</li>
              <li>• Retry automático / Reflexão</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Arquitetura</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`Input → Perception → Attention → Reasoning → Decision → Planning
  ↓
Execution
  ↓
Learning (futuro)`}
        </pre>
      </div>

      {/* Contracts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Execution Result</h3>
          </div>
          <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  executionId, planId, status,
  completedSteps, skippedSteps,
  failedSteps, totalSteps,
  executionTime, executionCost,
  successRate, startedAt,
  finishedAt, logs
}`}
          </pre>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Step Result</h3>
          </div>
          <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  stepId: string,
  status: "pending"|"running"|
    "completed"|"skipped"|"failed",
  startedAt, finishedAt,
  duration, cost, message
}`}
          </pre>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Execuções" value={auto?.executionsCreated || 0} color="text-orange-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({EXECUTION_TEST_CASES.length} cenários)
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
          {EXECUTION_TEST_CASES.map((tc) => {
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
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-orange-500" /> :
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
          {running ? "Executando..." : "Executar Bateria do Execution"}
        </button>
      </div>

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatRow icon={Zap} label="Execuções realizadas" value={auto.executionsCreated} />
            <StatRow icon={Layers} label="Etapas executadas" value={auto.executedSteps} />
            <StatRow icon={CheckCircle2} label="Etapas concluídas" value={auto.completedSteps} />
            <StatRow icon={Layers} label="Etapas ignoradas" value={auto.skippedSteps} />
            <StatRow icon={XCircle} label="Etapas com falha" value={auto.failedSteps} />
            <StatRow icon={Coins} label="Custo médio" value={auto.averageExecutionCost} />
            <StatRow icon={Clock} label="Tempo médio" value={`${auto.averageExecutionTime}ms`} />
            <StatRow icon={TrendingUp} label="Taxa média de sucesso" value={`${auto.averageSuccessRate}%`} />
            <StatRow icon={Clock} label="Tempo proc. médio" value={`${auto.averageProcessingTimeMs}ms`} />
            <StatRow icon={ShieldCheck} label="Planning não alterado" value={auto.noPlanningEngineAltered ? "✓" : "✗"} />
            <StatRow icon={ShieldCheck} label="Decision não alterado" value={auto.noDecisionEngineAltered ? "✓" : "✗"} />
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptance && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Critérios de Aceitação</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <AcceptRow label="Execution Engine independente" ok={acceptance.executionEngineIndependent} />
            <AcceptRow label="Contrato Execution Result existe" ok={acceptance.executionResultContractExists} />
            <AcceptRow label="Execução de plano funciona" ok={acceptance.planExecutionWorks} />
            <AcceptRow label="Execução de etapa funciona" ok={acceptance.stepExecutionWorks} />
            <AcceptRow label="Ordem de execução funciona" ok={acceptance.executionOrderWorks} />
            <AcceptRow label="Validação de dependências funciona" ok={acceptance.dependencyValidationWorks} />
            <AcceptRow label="Cálculo de custo funciona" ok={acceptance.costCalculationWorks} />
            <AcceptRow label="Cálculo de tempo funciona" ok={acceptance.timeCalculationWorks} />
            <AcceptRow label="Taxa de sucesso funciona" ok={acceptance.successRateWorks} />
            <AcceptRow label="Descrição funciona" ok={acceptance.descriptionWorks} />
            <AcceptRow label="Validação do contrato" ok={acceptance.contractValidation} />
            <AcceptRow label="Consistência estatística" ok={acceptance.statsConsistency} />
            <AcceptRow label="Nenhum Planning Engine modificado" ok={acceptance.noPlanningEngineModified} />
            <AcceptRow label="Nenhuma camada anterior modificada" ok={acceptance.noPreviousLayerModified} />
            <AcceptRow label="Todos os testes aprovados" ok={acceptance.allTestsPassed} />
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

function StatRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
      <span className="text-xs text-zinc-500 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-400" />}
        {label}
      </span>
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