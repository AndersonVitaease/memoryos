import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Workflow,
  FileText,
  Layers,
  Clock,
  Activity,
  Pause,
} from "lucide-react";
import { runPipelineTests, PIPELINE_TEST_CASES } from "@/lib/cognitive-engine";

export default function PipelineTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runPipelineTests((p) => {
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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-200">
          <Workflow className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 15 · Cognitive Pipeline</h2>
          <p className="text-sm text-zinc-500">Executa Cognitive Plans — nunca cria, nunca altera, nunca decide</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <Workflow className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Executar</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Cognitive Pipeline recebe um Cognitive Plan válido e executa cada etapa na ordem
              definida. Registra status, tempo, resultado e erro. Nunca cria planos, nunca altera
              planos, nunca toma decisões estratégicas.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• executePlan() — executa plano completo</li>
              <li>• executeStep() — executa uma etapa</li>
              <li>• pauseExecution() — pausa execução</li>
              <li>• resumeExecution() — retoma execução</li>
              <li>• cancelExecution() — cancela execução</li>
              <li>• describeExecution() — texto legível</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Criar planos</li>
              <li>• Alterar planos</li>
              <li>• Tomar decisões estratégicas</li>
              <li>• Execução paralela</li>
              <li>• Retry automático</li>
              <li>• Reflection / Self Evaluation</li>
              <li>• Planejamento / Aprendizado</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Arquitetura</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`Cognitive Orchestrator
  ↓
Cognitive Pipeline
  ↓
Memory Engine → Capabilities → Services →
Specialists → Policy Engine → Planner → LLM
  ↓
Resposta`}
        </pre>
      </div>

      {/* Step Statuses */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Status de cada Step</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED", "CANCELLED"].map((s) => (
            <span key={s} className="text-xs px-2 py-1 rounded-md font-medium bg-amber-50 text-amber-700">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Pipeline Execution — Contrato</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  executionId: UUID,
  planId: string,
  status: "PENDING"|"RUNNING"|"COMPLETED"|"FAILED"|"CANCELLED"|"PAUSED",
  steps: [{
    order, participant, action,
    status: "PENDING"|"RUNNING"|"COMPLETED"|"FAILED"|"SKIPPED"|"CANCELLED",
    startedAt, finishedAt, duration,
    result, error
  }],
  startedAt: datetime,
  finishedAt: datetime | null,
  duration: number | null,
  errors: array,
  warnings: array
}`}
        </pre>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Execuções" value={auto?.totalExecutions || 0} color="text-amber-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({PIPELINE_TEST_CASES.length} cenários)
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
          {PIPELINE_TEST_CASES.map((tc) => {
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
          {running ? "Executando..." : "Executar Bateria do Pipeline"}
        </button>
      </div>

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatRow label="Total de execuções" value={auto.totalExecutions} />
            <StatRow label="Steps executados" value={auto.totalSteps} />
            <StatRow label="Steps concluídos" value={auto.stepsCompleted} />
            <StatRow label="Steps com erro" value={auto.stepsFailed} />
            <StatRow label="Steps cancelados" value={auto.stepsCancelled} />
            <StatRow label="Steps ignorados" value={auto.stepsSkipped} />
            <StatRow label="Tempo médio por Step" value={`${auto.averageStepTimeMs}ms`} />
            <StatRow label="Plano nunca alterado" value={auto.planNeverAltered ? "✓" : "✗"} />
          </div>
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
            <AcceptRow label="Cognitive Pipeline independente" ok={acceptance.cognitivePipelineIndependent} />
            <AcceptRow label="Contrato Pipeline Execution existe" ok={acceptance.pipelineExecutionContractExists} />
            <AcceptRow label="executePlan funciona" ok={acceptance.executePlanWorks} />
            <AcceptRow label="executeStep funciona" ok={acceptance.executeStepWorks} />
            <AcceptRow label="Pause/Resume funciona" ok={acceptance.pauseResumeWorks} />
            <AcceptRow label="Cancelamento funciona" ok={acceptance.cancellationWorks} />
            <AcceptRow label="Status funciona" ok={acceptance.statusWorks} />
            <AcceptRow label="Nenhum Cognitive Plan alterado" ok={acceptance.noPlanAltered} />
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