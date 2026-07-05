import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Layers,
  ListChecks,
  ShieldCheck,
  Clock,
  Coins,
} from "lucide-react";
import { runPlanningTests, PLANNING_TEST_CASES } from "@/lib/cognitive-engine";

export default function PlanningTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runPlanningTests((p) => {
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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
          <ListChecks className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 18 · Planning Engine</h2>
          <p className="text-sm text-zinc-500">Transforma decisão em plano estruturado — nunca executa</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Planear</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Planning Engine recebe um Decision Result e gera o melhor plano possível:
              decompõe o objetivo em etapas, ordena, detecta dependências, estima custo e tempo,
              gera fallback e otimiza. Planejamento totalmente determinístico — sem IA, sem
              aleatoriedade, sem chamadas externas.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• createPlan() — cria plano a partir da decisão</li>
              <li>• decomposeGoal() — divide objetivo em etapas</li>
              <li>• orderSteps() — ordena deterministicamente</li>
              <li>• detectDependencies() — detecta dependências</li>
              <li>• estimateCost() — calcula custo estimado</li>
              <li>• estimateTime() — calcula tempo estimado</li>
              <li>• generateFallback() — plano alternativo</li>
              <li>• optimizePlan() — remove redundâncias</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Executar ações</li>
              <li>• Aprender</li>
              <li>• Consultar memória</li>
              <li>• Chamar LLM</li>
              <li>• Alterar o Decision Engine</li>
              <li>• Reflection / Self Evaluation</li>
              <li>• Retry automático</li>
              <li>• Chamadas HTTP</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Arquitetura</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`Input → Perception → Attention → Reasoning → Decision
  ↓
Planning
  ↓
Execution (futuro) → Learning (futuro)`}
        </pre>
      </div>

      {/* Contracts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Plan Result</h3>
          </div>
          <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  planId, decisionId, goal,
  selectedDecision, steps,
  dependencies, estimatedCost,
  estimatedTime, priority,
  expectedOutcome, fallbackPlan,
  confidence, createdAt
}`}
          </pre>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Step Contract</h3>
          </div>
          <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  id: string,
  description: string,
  order: number,
  required: boolean,
  estimatedTime: number,
  estimatedCost: number
}`}
          </pre>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Planos criados" value={auto?.totalPlans || 0} color="text-teal-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({PLANNING_TEST_CASES.length} cenários)
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
          {PLANNING_TEST_CASES.map((tc) => {
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
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> :
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
          {running ? "Executando..." : "Executar Bateria do Planning"}
        </button>
      </div>

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatRow icon={ListChecks} label="Total de planos" value={auto.totalPlans} />
            <StatRow icon={Layers} label="Etapas geradas" value={auto.totalSteps} />
            <StatRow icon={Coins} label="Custo médio" value={auto.averageCost} />
            <StatRow icon={Clock} label="Tempo médio" value={`${auto.averageTime}ms`} />
            <StatRow icon={ListChecks} label="Dependências" value={auto.totalDependencies} />
            <StatRow icon={ListChecks} label="Fallbacks" value={auto.totalFallbacks} />
            <StatRow icon={Clock} label="Tempo proc. médio" value={`${auto.averageProcessingTimeMs}ms`} />
            <StatRow icon={ShieldCheck} label="Decision não alterado" value={auto.decisionNeverAltered ? "✓" : "✗"} />
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptance && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Critérios de Aceitação</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <AcceptRow label="Planning Engine independente" ok={acceptance.planningEngineIndependent} />
            <AcceptRow label="Contrato Plan Result existe" ok={acceptance.planResultContractExists} />
            <AcceptRow label="Criação de plano funciona" ok={acceptance.planCreationWorks} />
            <AcceptRow label="Decomposição funciona" ok={acceptance.decompositionWorks} />
            <AcceptRow label="Ordenação funciona" ok={acceptance.orderingWorks} />
            <AcceptRow label="Dependências funcionam" ok={acceptance.dependenciesWork} />
            <AcceptRow label="Estimativa de custo funciona" ok={acceptance.costEstimationWorks} />
            <AcceptRow label="Estimativa de tempo funciona" ok={acceptance.timeEstimationWorks} />
            <AcceptRow label="Fallback funciona" ok={acceptance.fallbackWorks} />
            <AcceptRow label="Otimização funciona" ok={acceptance.optimizationWorks} />
            <AcceptRow label="Descrição funciona" ok={acceptance.descriptionWorks} />
            <AcceptRow label="Consistência do contrato" ok={acceptance.contractConsistency} />
            <AcceptRow label="Nenhum Decision Engine alterado" ok={acceptance.noDecisionEngineAltered} />
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