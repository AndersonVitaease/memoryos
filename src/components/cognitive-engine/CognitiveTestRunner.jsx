import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Network,
  FileText,
  Layers,
  Workflow,
} from "lucide-react";
import { runCognitiveTests, COGNITIVE_TEST_CASES } from "@/lib/cognitive-engine";

export default function CognitiveTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runCognitiveTests((p) => {
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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg shadow-fuchsia-200">
          <Network className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Fase 3 · Cognitive Orchestrator</h2>
          <p className="text-sm text-zinc-500">Coordenação cognitiva — decide quem participa, nunca executa</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <Workflow className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Coordenar</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Cognitive Orchestrator recebe a mensagem do usuário e decide quais componentes
              devem participar do processamento. Constrói um Cognitive Plan explícito com etapas
              ordenadas e prioridades. Nunca executa componentes diretamente.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• createPlan() — cria Cognitive Plan</li>
              <li>• validatePlan() — valida plano</li>
              <li>• routePlan() — descreve ordem de execução</li>
              <li>• cancelPlan() — cancela plano</li>
              <li>• describePlan() — texto legível</li>
              <li>• Classificação determinística de complexidade</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Executar regras de negócio</li>
              <li>• Responder ao usuário diretamente</li>
              <li>• Chamar APIs externas diretamente</li>
              <li>• Substituir o Planner</li>
              <li>• Executar qualquer componente diretamente</li>
              <li>• Planejamento com IA / Reflection / Auto Recovery</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-fuchsia-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Arquitetura</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`Usuário
  ↓
Cognitive Orchestrator
  ↓
Goal Detector → Memory Engine → Capability Layer →
Service Layer → Specialist Layer → Policy Engine →
Planner → LLM → Resposta`}
        </pre>
      </div>

      {/* Complexity */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-fuchsia-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Classificação de Complexidade (determinística)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ComplexityCard level="LOW" desc="1 participante" color="text-emerald-600" bg="bg-emerald-50" />
          <ComplexityCard level="MEDIUM" desc="2 participantes" color="text-amber-600" bg="bg-amber-50" />
          <ComplexityCard level="HIGH" desc="3-4 participantes" color="text-orange-600" bg="bg-orange-50" />
          <ComplexityCard level="CRITICAL" desc="5+ participantes" color="text-red-600" bg="bg-red-50" />
        </div>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-fuchsia-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Cognitive Plan — Contrato</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  planId: UUID,
  goal: string,
  steps: [{ order, participant, action, priority }],
  participants: string[],
  priority: "low" | "normal" | "high" | "critical",
  requiresMemory: boolean,
  requiresCapabilities: boolean,
  requiresServices: boolean,
  requiresSpecialists: boolean,
  requiresPolicy: boolean,
  requiresLLM: boolean,
  estimatedComplexity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  createdAt: datetime
}`}
        </pre>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Planos criados" value={auto?.totalPlansCreated || 0} color="text-fuchsia-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({COGNITIVE_TEST_CASES.length} cenários)
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
          {COGNITIVE_TEST_CASES.map((tc) => {
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
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-fuchsia-500" /> :
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
            <FileText className="w-4 h-4 text-fuchsia-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <StatRow label="Total de planos criados" value={auto.totalPlansCreated} />
            <StatRow label="Complexidade média" value={auto.averageComplexity} />
            <StatRow label="Tempo médio (ms)" value={auto.averageProcessingTimeMs} />
            <StatRow label="Planos inválidos rejeitados" value={auto.invalidPlansRejected} />
            <StatRow label="Planos cancelados" value={auto.plansCancelled} />
            <StatRow label="Nenhum componente executado" value={auto.noComponentExecutedDirectly ? "✓" : "✗"} />
          </div>
          {auto.participantsUsed && Object.values(auto.participantsUsed).some((v) => v > 0) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Participantes Utilizados</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(auto.participantsUsed)
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([participant, count]) => (
                    <span key={participant} className="text-xs px-2 py-1 rounded-md bg-fuchsia-50 text-fuchsia-700 font-medium">
                      {participant}: {count}
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
            <CheckCircle2 className="w-4 h-4 text-fuchsia-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Critérios de Aceitação</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <AcceptRow label="Cognitive Orchestrator independente" ok={acceptance.cognitiveOrchestratorIndependent} />
            <AcceptRow label="Contrato oficial Cognitive Plan existe" ok={acceptance.cognitivePlanContractExists} />
            <AcceptRow label="Criação de planos funciona" ok={acceptance.planCreationWorks} />
            <AcceptRow label="Validação funciona" ok={acceptance.validationWorks} />
            <AcceptRow label="Roteamento funciona" ok={acceptance.routingWorks} />
            <AcceptRow label="Classificação de complexidade funciona" ok={acceptance.complexityClassificationWorks} />
            <AcceptRow label="Nenhuma camada anterior alterada" ok={acceptance.noPreviousLayerAltered} />
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

function ComplexityCard({ level, desc, color, bg }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${bg} text-center`}>
      <p className={`text-sm font-bold ${color}`}>{level}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
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