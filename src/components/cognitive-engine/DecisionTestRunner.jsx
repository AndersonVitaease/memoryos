import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Layers,
  GitBranch,
  ShieldCheck,
  Gauge,
} from "lucide-react";
import { runDecisionTests, DECISION_TEST_CASES } from "@/lib/cognitive-engine";

export default function DecisionTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runDecisionTests((p) => {
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
          <GitBranch className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 17 · Decision Engine</h2>
          <p className="text-sm text-zinc-500">Seleciona a melhor decisão — nunca executa, nunca responde</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Decidir</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Decision Engine recebe um Reasoning Graph, avalia as conclusões como alternativas,
              seleciona a melhor, calcula risco e confiança, e produz uma justificativa.
              Nunca executa componentes, nunca chama APIs, nunca responde ao usuário,
              nunca modifica Memory Records ou o Reasoning Graph.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• makeDecision() — constrói decisão</li>
              <li>• evaluateAlternatives() — avalia conclusões</li>
              <li>• selectConclusion() — seleciona melhor</li>
              <li>• calculateRisk() — risco determinístico</li>
              <li>• calculateConfidence() — confiança</li>
              <li>• justifyDecision() — justificativa</li>
              <li>• describeDecision() — texto legível</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Executar componentes</li>
              <li>• Chamar APIs</li>
              <li>• Responder ao usuário</li>
              <li>• Modificar Memory Records</li>
              <li>• Modificar o Reasoning Graph</li>
              <li>• Gerar novas hipóteses</li>
              <li>• Reflection / Self Eval / Planning / LLM</li>
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
{`Reasoning Engine
  ↓
Decision Engine
  ↓
Planner`}
        </pre>
      </div>

      {/* Risk levels */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Risco (determinístico)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-lg px-3 py-2 bg-emerald-50 text-center">
            <p className="text-sm font-bold text-emerald-600">LOW</p>
            <p className="text-xs text-zinc-500 mt-0.5">Sem conflitos, HIGH conf</p>
          </div>
          <div className="rounded-lg px-3 py-2 bg-amber-50 text-center">
            <p className="text-sm font-bold text-amber-600">MEDIUM</p>
            <p className="text-xs text-zinc-500 mt-0.5">Sem conflitos, MEDIUM</p>
          </div>
          <div className="rounded-lg px-3 py-2 bg-orange-50 text-center">
            <p className="text-sm font-bold text-orange-600">HIGH</p>
            <p className="text-xs text-zinc-500 mt-0.5">Conflitos ou sem evidências</p>
          </div>
          <div className="rounded-lg px-3 py-2 bg-red-50 text-center">
            <p className="text-sm font-bold text-red-600">CRITICAL</p>
            <p className="text-xs text-zinc-500 mt-0.5">Conflitos + confiança LOW</p>
          </div>
        </div>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Decision Result — Contrato</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  decisionId: UUID,
  reasoningId: string,
  selectedConclusion: { id, statement, confidence, score },
  alternatives: [{ id, statement, confidence, score, basedOn }],
  confidence: "LOW" | "MEDIUM" | "HIGH",
  justification: string,
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  createdAt: datetime
}`}
        </pre>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Decisões" value={auto?.totalDecisions || 0} color="text-amber-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({DECISION_TEST_CASES.length} cenários)
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
          {DECISION_TEST_CASES.map((tc) => {
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
          {running ? "Executando..." : "Executar Bateria do Decision"}
        </button>
      </div>

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatRow label="Total de decisões" value={auto.totalDecisions} />
            <StatRow label="Alternativas avaliadas" value={auto.alternativesEvaluated} />
            <StatRow label="Risco médio" value={auto.averageRisk} />
            <StatRow label="Confidence média" value={auto.averageConfidence} />
            <StatRow label="Tempo médio" value={`${auto.averageProcessingTimeMs}ms`} />
            <StatRow label="Conflitos resolvidos" value={auto.conflictsResolved} />
            <StatRow label="Reasoning nunca alterado" value={auto.reasoningGraphNeverAltered ? "✓" : "✗"} />
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
            <AcceptRow label="Decision Engine independente" ok={acceptance.decisionEngineIndependent} />
            <AcceptRow label="Contrato Decision Result existe" ok={acceptance.decisionResultContractExists} />
            <AcceptRow label="Seleção funciona" ok={acceptance.selectionWorks} />
            <AcceptRow label="Justificativa funciona" ok={acceptance.justificationWorks} />
            <AcceptRow label="Risco funciona" ok={acceptance.riskWorks} />
            <AcceptRow label="Confidence funciona" ok={acceptance.confidenceWorks} />
            <AcceptRow label="Nenhum Reasoning Graph alterado" ok={acceptance.noReasoningGraphAltered} />
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