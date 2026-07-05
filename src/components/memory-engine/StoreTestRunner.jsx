import React, { useState } from "react";
import {
  Database,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Clock,
  HardDrive,
  ShieldCheck,
} from "lucide-react";
import { runStoreTests, STORE_TEST_CASES } from "@/lib/memory-engine";

export default function StoreTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runStoreTests((p) => {
        setProgress((prev) => ({ ...prev, [p.id]: p }));
      });
      setResults(res);
    } finally {
      setRunning(false);
    }
  };

  const summary = results?.summary;
  const auto = results?.autoEvaluation;
  const conf = results?.confirmation;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
          <Database className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 2 · Memory Store</h2>
          <p className="text-sm text-zinc-500">Memory Record + Memory Intent + Persistência</p>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Persistir</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Memory Store apenas grava. Nunca interpreta mensagens, nunca reclassifica,
              nunca altera a decisão do Classifier. Recebe apenas Memory Records.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Contrato Memory Record</h3>
            <p className="text-sm text-zinc-500 mt-1">
              19 campos oficiais incluindo <code className="text-xs bg-zinc-100 px-1 rounded">memoryIntent</code> e{" "}
              <code className="text-xs bg-zinc-100 px-1 rounded">expires</code> para memórias temporárias.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-zinc-900">{summary.accuracy}</p>
            <p className="text-xs text-zinc-500 mt-1">Taxa de acerto</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-emerald-600">{auto?.recordsCreated || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Criados</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-red-600">{auto?.recordsRejected || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Rejeitados</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-violet-600">{auto?.averageProcessingTimeMs || 0}ms</p>
            <p className="text-xs text-zinc-500 mt-1">Tempo médio</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-indigo-600">{summary.total}</p>
            <p className="text-xs text-zinc-500 mt-1">Testes</p>
          </div>
        </div>
      )}

      {/* Test Runner */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({STORE_TEST_CASES.length} cenários)
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

        <div className="space-y-2 mb-4">
          {STORE_TEST_CASES.map((tc) => {
            const p = progress[tc.id];
            const isRunning = running && p?.status === "running";
            const passed = p?.status === "passed";
            const failed = p?.status === "failed";
            const done = results?.results?.find((r) => r.id === tc.id);
            return (
              <div key={tc.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                passed ? "border-emerald-200 bg-emerald-50/50" :
                failed ? "border-red-200 bg-red-50/50" :
                "border-zinc-200"
              }`}>
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> :
                   passed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                   failed ? <XCircle className="w-5 h-5 text-red-500" /> :
                   <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700">
                    <span className="text-xs font-mono text-zinc-400">#{tc.id}</span> {tc.name}
                  </p>
                  {done && !done.passed && (
                    <p className="text-xs text-red-500 mt-0.5">{done.error || done.detail}</p>
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
          {running ? "Executando..." : "Executar Bateria do Memory Store"}
        </button>
      </div>

      {/* Auto-Evaluation */}
      {auto && conf && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Row label="Memory Records criados" value={auto.recordsCreated} />
              <Row label="Total persistido" value={auto.recordsPersisted} />
              <Row label="Total rejeitado" value={auto.recordsRejected} />
              <Row label="Tempo médio de persistência" value={`${auto.averageProcessingTimeMs}ms`} />
              <Row label="Casos inválidos testados" value={auto.invalidCases} />
            </div>
            <div className="space-y-2">
              <CheckRow label="Contrato Memory Record existe" ok={conf.contractExists} />
              <CheckRow label="Classifier gera Memory Records" ok={conf.classifierProducesRecords} />
              <CheckRow label="Store aceita apenas Memory Records" ok={conf.storeAcceptsOnlyRecords} />
              <CheckRow label="Nenhuma mensagem do usuário chega ao Store" ok={conf.noUserMessagesToStore} />
              <CheckRow label="Memory Intent existe" ok={conf.memoryIntentExists} />
              <CheckRow label="Suporte a expires" ok={conf.expiresSupported} />
              <CheckRow label="create/getById/list/count funcionam" ok={conf.create_getById_list_count_Working} />
              <CheckRow label="Store nunca reclassificou" ok={auto.storeNeverReclassified} />
              <CheckRow label="Fase 1 intacta" ok={conf.phase1Untouched} />
            </div>
          </div>
        </div>
      )}

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Memory Record — Contrato Oficial</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`{
  id: UUID,
  userId: string,
  conversationId: string,
  shouldRemember: true,
  memoryType: string,
  memoryIntent: string,       // ← NOVO (Sprint 2)
  importance: "low"|"medium"|"high",
  confidence: "low"|"medium"|"high",
  decisionSource: "fast_path"|"rule_engine"|"llm",
  reasonCode: string,
  reason: string,
  suggestedTitle: string,
  tags: string[],
  originalMessage: string,
  normalizedContent: string,
  expires: string | null,     // ← NOVO (Sprint 2)
  createdAt: datetime,
  updatedAt: datetime,
  metadata: {}
}`}
        </pre>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 last:border-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-800">{value}</span>
    </div>
  );
}

function CheckRow({ label, ok }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
      <span className="text-sm text-zinc-600">{label}</span>
    </div>
  );
}