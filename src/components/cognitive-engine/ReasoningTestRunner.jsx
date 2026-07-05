import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Layers,
  Brain,
  ShieldCheck,
  Gauge,
} from "lucide-react";
import { runReasoningTests, REASONING_TEST_CASES } from "@/lib/cognitive-engine";

export default function ReasoningTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runReasoningTests((p) => {
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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-200">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 16 · Reasoning Engine</h2>
          <p className="text-sm text-zinc-500">Transforma resultados em raciocínio — nunca executa, nunca decide</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Raciocinar</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Reasoning Engine recebe Pipeline Execution e contexto, extrai premissas, agrupa
              evidências, detecta conflitos, gera hipóteses, produz conclusões e calcula confiança.
              Nunca executa componentes, nunca chama APIs, nunca responde ao usuário, nunca altera o Pipeline.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• buildReasoning() — constrói raciocínio</li>
              <li>• extractPremises() — extrai premissas</li>
              <li>• collectEvidence() — agrupa evidências</li>
              <li>• detectConflicts() — detecta conflitos</li>
              <li>• generateHypotheses() — gera hipóteses</li>
              <li>• generateConclusions() — produz conclusões</li>
              <li>• calculateConfidence() — confiança determinística</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Executar componentes</li>
              <li>• Chamar APIs</li>
              <li>• Responder ao usuário</li>
              <li>• Modificar Memory Records</li>
              <li>• Alterar o Pipeline</li>
              <li>• Tomar decisões</li>
              <li>• Reflection / Self Evaluation / LLM</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-cyan-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Arquitetura</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`Cognitive Pipeline
  ↓
Reasoning Engine
  ↓
Decision Engine (Sprint futura)`}
        </pre>
      </div>

      {/* Confidence */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-cyan-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Confiança (determinística)</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg px-3 py-2 bg-emerald-50 text-center">
            <p className="text-sm font-bold text-emerald-600">HIGH</p>
            <p className="text-xs text-zinc-500 mt-0.5">Sem conflitos, maioria peso alto</p>
          </div>
          <div className="rounded-lg px-3 py-2 bg-amber-50 text-center">
            <p className="text-sm font-bold text-amber-600">MEDIUM</p>
            <p className="text-xs text-zinc-500 mt-0.5">Sem conflitos, peso médio</p>
          </div>
          <div className="rounded-lg px-3 py-2 bg-red-50 text-center">
            <p className="text-sm font-bold text-red-600">LOW</p>
            <p className="text-xs text-zinc-500 mt-0.5">Conflitos ou poucas evidências</p>
          </div>
        </div>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-cyan-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Reasoning Graph — Contrato</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  reasoningId: UUID,
  premises: [{ id, source, statement, confidence }],
  evidence: [{ id, participant, value, weight, tags }],
  conflicts: [{ id, participant, evidenceA, evidenceB, reason }],
  hypotheses: [{ id, type, statement, basedOn, confidence }],
  conclusions: [{ id, statement, confidence, basedOn }],
  confidence: "LOW" | "MEDIUM" | "HIGH",
  createdAt: datetime
}`}
        </pre>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Reasonings" value={auto?.totalReasonings || 0} color="text-cyan-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({REASONING_TEST_CASES.length} cenários)
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
          {REASONING_TEST_CASES.map((tc) => {
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
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-cyan-500" /> :
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
          {running ? "Executando..." : "Executar Bateria do Reasoning"}
        </button>
      </div>

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatRow label="Total de Reasonings" value={auto.totalReasonings} />
            <StatRow label="Premissas extraídas" value={auto.totalPremises} />
            <StatRow label="Evidências coletadas" value={auto.totalEvidence} />
            <StatRow label="Conflitos detectados" value={auto.totalConflicts} />
            <StatRow label="Hipóteses geradas" value={auto.totalHypotheses} />
            <StatRow label="Confidence média" value={auto.averageConfidence} />
            <StatRow label="Tempo médio" value={`${auto.averageProcessingTimeMs}ms`} />
            <StatRow label="Pipeline nunca alterado" value={auto.pipelineNeverAltered ? "✓" : "✗"} />
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptance && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Critérios de Aceitação</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <AcceptRow label="Reasoning Engine independente" ok={acceptance.reasoningEngineIndependent} />
            <AcceptRow label="Contrato Reasoning Graph existe" ok={acceptance.reasoningGraphContractExists} />
            <AcceptRow label="Premissas funcionam" ok={acceptance.premisesWork} />
            <AcceptRow label="Evidências funcionam" ok={acceptance.evidenceWorks} />
            <AcceptRow label="Hipóteses funcionam" ok={acceptance.hypothesesWork} />
            <AcceptRow label="Conclusões funcionam" ok={acceptance.conclusionsWork} />
            <AcceptRow label="Confidence funciona" ok={acceptance.confidenceWorks} />
            <AcceptRow label="Nenhum Pipeline alterado" ok={acceptance.noPipelineAltered} />
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