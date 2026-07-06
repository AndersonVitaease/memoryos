import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  FileText,
  Shield,
  Layers,
} from "lucide-react";
import { runMemoryEngineTests, MEMORY_ENGINE_TEST_CASES } from "@/lib/memory-engine/memoryTests";

export default function MemoryEngineTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runMemoryEngineTests((p) => {
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
          <Database className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Fase 3 · Memory Engine</h2>
          <p className="text-sm text-zinc-500">Persistência determinística de memória</p>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <Layers className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Persistir Memória</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Memory Engine recebe uma Memory Update Proposal da Sprint 21 e decide, de forma
              determinística, como essa proposta será persistida. Valida, aplica políticas, detecta
              duplicidades e conflitos, resolve o que for possível, e produz um Memory Update Result.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Faz</p>
            <ul className="text-xs text-emerald-600 space-y-0.5">
              <li>• Validar proposta recebida</li>
              <li>• Validar contrato</li>
              <li>• Aplicar políticas de memória</li>
              <li>• Identificar duplicidades</li>
              <li>• Identificar conflitos</li>
              <li>• Resolver conflitos (determinístico)</li>
              <li>• Decidir CREATE / UPDATE / MERGE / IGNORE</li>
              <li>• Persistir resultado</li>
              <li>• Registrar auditoria</li>
              <li>• Gerar estatísticas</li>
              <li>• Produzir Memory Update Result</li>
            </ul>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Nunca faz</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              <li>• Modificar camadas anteriores</li>
              <li>• Chamar LLM</li>
              <li>• Executar HTTP</li>
              <li>• Acessar APIs externas</li>
              <li>• Executar Retry</li>
              <li>• Reflexão automática</li>
              <li>• Alterar a Memory Update Proposal</li>
              <li>• Usar Math.random() ou UUIDs aleatórios</li>
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
{`Learning → Memory Integration → Memory Engine
                                    ↓
                              Validate Proposal
                                    ↓
                              Apply Policies
                                    ↓
                              Resolve Conflicts
                                    ↓
                              Detect Duplicates
                                    ↓
                              Decide Action
                              (CREATE/UPDATE/MERGE/IGNORE)
                                    ↓
                              Persist to Storage
                                    ↓
                              Register Audit
                                    ↓
                              Memory Update Result`}
        </pre>
      </div>

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-cyan-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Memory Update Result — Contrato</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  resultId: string,
  proposalId: string,
  action: "CREATE" | "UPDATE" | "MERGE" | "IGNORE",
  status: "PERSISTED" | "SKIPPED" | "REJECTED" | "DEFERRED",
  persistedMemories: [{ memoryId, memoryType, content, tags, confidence, source }],
  duplicatesFound: number,
  conflictsResolved: number,
  conflictsUnresolved: number,
  policyDecisions: [{ policy, applied, reason }],
  auditTrail: [{ auditId, step, action, detail, timestamp }],
  confidence: "LOW" | "MEDIUM" | "HIGH",
  requiresReview: boolean,
  createdAt: datetime
}`}
        </pre>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Taxa de acerto" value={summary.accuracy} color="text-zinc-900" />
          <StatCard label="Aprovados" value={`${summary.passed}/${summary.total}`} color="text-emerald-600" />
          <StatCard label="Memórias persistidas" value={auto?.memoriesPersisted || 0} color="text-cyan-600" />
          <StatCard label="Tempo total" value={`${summary.totalRunTimeMs}ms`} color="text-blue-600" />
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({MEMORY_ENGINE_TEST_CASES.length} cenários)
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
          {MEMORY_ENGINE_TEST_CASES.map((tc) => {
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
          {running ? "Executando..." : "Executar Bateria de Testes"}
        </button>
      </div>

      {/* Auto-evaluation */}
      {auto && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <StatRow label="Propostas processadas" value={auto.proposalsProcessed} />
            <StatRow label="Memórias persistidas" value={auto.memoriesPersisted} />
            <StatRow label="Duplicidades detectadas" value={auto.duplicatesDetected} />
            <StatRow label="Conflitos resolvidos" value={auto.conflictsResolved} />
            <StatRow label="Conflitos adiados" value={auto.conflictsDeferred} />
            <StatRow label="Nenhuma camada anterior alterada" value={auto.noPreviousLayerModified ? "✓" : "✗"} />
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptance && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Critérios de Aceitação</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <AcceptRow label="Memory Engine independente" ok={acceptance.memoryEngineIndependent} />
            <AcceptRow label="Contrato Memory Update Result existe" ok={acceptance.memoryUpdateResultContractExists} />
            <AcceptRow label="Validação de proposta funciona" ok={acceptance.proposalValidationWorks} />
            <AcceptRow label="Validação de contrato funciona" ok={acceptance.contractValidationWorks} />
            <AcceptRow label="Policy Engine funciona" ok={acceptance.policyEngineWorks} />
            <AcceptRow label="Deduplicação funciona" ok={acceptance.deduplicationWorks} />
            <AcceptRow label="Resolução de conflitos funciona" ok={acceptance.conflictResolutionWorks} />
            <AcceptRow label="Consistência determinística" ok={acceptance.deterministicConsistency} />
            <AcceptRow label="Estatísticas e auditoria funcionam" ok={acceptance.statsAndAuditWork} />
            <AcceptRow label="Sprint 22.1: memoryRecordId funciona" ok={acceptance.memoryRecordIdWorks} />
            <AcceptRow label="Sprint 22.1: storagePolicy funciona" ok={acceptance.storagePolicyWorks} />
            <AcceptRow label="Sprint 22.1: retentionPolicy funciona" ok={acceptance.retentionPolicyWorks} />
            <AcceptRow label="Sprint 22.1: importanceScore funciona" ok={acceptance.importanceScoreWorks} />
            <AcceptRow label="Sprint 22.1: storageHints funciona" ok={acceptance.storageHintsWork} />
            <AcceptRow label="Sprint 22.1: qualityMetrics funciona" ok={acceptance.qualityMetricsWork} />
            <AcceptRow label="Sprint 22.1: contrato persistedMemory validado" ok={acceptance.persistedMemoryContractValidated} />
            <AcceptRow label="Sprint 22.1: nenhuma camada anterior modificada" ok={acceptance.noPreviousLayerModifiedS22_1} />
            <AcceptRow label="Nenhum LLM chamado" ok={acceptance.noLlmCalled} />
            <AcceptRow label="Nenhum HTTP executado" ok={acceptance.noHttpExecuted} />
            <AcceptRow label="Nenhuma API externa acessada" ok={acceptance.noExternalApiAccessed} />
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