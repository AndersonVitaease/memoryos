import React, { useState } from "react";
import {
  Search,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  TrendingUp,
  Filter,
  ShieldCheck,
} from "lucide-react";
import { runRetrievalTests, RETRIEVAL_TEST_CASES } from "@/lib/memory-engine";

export default function RetrievalTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    try {
      const res = await runRetrievalTests((p) => {
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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-200">
          <Search className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 3 · Memory Retrieval</h2>
          <p className="text-sm text-zinc-500">Recuperação + Ranking + Filtros + Evolução do Memory Record</p>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Responsabilidade única: Recuperar</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O Retrieval apenas localiza, ordena e retorna memórias. Nunca interpreta, nunca responde
              ao usuário, nunca altera ou reclassifica Memory Records.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Ranking inicial</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Ordena por <strong>importance</strong> (alta → baixa), <strong>confidence</strong> (alta → baixa)
              e <strong>createdAt</strong> (mais recente primeiro).
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Filter className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Filtros suportados</h3>
            <p className="text-sm text-zinc-500 mt-1">
              memoryType · memoryIntent · tags · status · source
            </p>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-zinc-900">{summary.accuracy}</p>
            <p className="text-xs text-zinc-500 mt-1">Taxa de acerto</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-blue-600">{auto?.totalFound || 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Registros encontrados</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-violet-600">{auto?.averageRetrievalTimeMs || 0}ms</p>
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
            Bateria de Testes ({RETRIEVAL_TEST_CASES.length} cenários)
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
          {RETRIEVAL_TEST_CASES.map((tc) => {
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
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> :
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
          {running ? "Executando..." : "Executar Bateria do Retrieval"}
        </button>
      </div>

      {/* Distributions */}
      {auto && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DistributionCard title="Distribuição por Tipo" data={auto.distributionByType} color="violet" />
          <DistributionCard title="Distribuição por Intent" data={auto.distributionByIntent} color="indigo" />
          <DistributionCard title="Distribuição por Source" data={auto.distributionBySource} color="blue" />
          <DistributionCard title="Distribuição por Status" data={auto.distributionByStatus} color="emerald" />
        </div>
      )}

      {/* Auto-Evaluation */}
      {auto && conf && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Autoavaliação</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Row label="Total de memórias pesquisadas" value={auto.totalSearched} />
              <Row label="Total encontrado" value={auto.totalFound} />
              <Row label="Tempo médio de recuperação" value={`${auto.averageRetrievalTimeMs}ms`} />
              <Row label="Casos não encontrados" value={auto.notFoundCases} />
            </div>
            <div className="space-y-2">
              <CheckRow label="Memory Record evoluído sem quebrar compatibilidade" ok={conf.memoryRecordEvolved} />
              <CheckRow label="status implementado" ok={conf.statusImplemented} />
              <CheckRow label="revision implementado" ok={conf.revisionImplemented} />
              <CheckRow label="relations implementado" ok={conf.relationsImplemented} />
              <CheckRow label="source implementado" ok={conf.sourceImplemented} />
              <CheckRow label="Retrieval independente criado" ok={conf.retrievalIndependent} />
              <CheckRow label="Retrieval nunca interpreta memórias" ok={conf.retrievalNeverInterprets} />
              <CheckRow label="Ranking funcionando" ok={conf.rankingWorking} />
              <CheckRow label="Store sem reclassificar" ok={auto.storeUntouched} />
              <CheckRow label="Fase 1 intacta" ok={conf.phase1Untouched} />
            </div>
          </div>
        </div>
      )}

      {/* Contract */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Memory Record — Campos Sprint 3</h3>
        </div>
        <pre className="text-xs bg-zinc-50 rounded-xl p-4 overflow-x-auto text-zinc-600 font-mono">
{`// === Sprint 3 (novos campos, retrocompatíveis) ===
status: "active" | "archived" | "superseded" | "expired" | "deleted",
revision: number,        // inicial: 1
relations: array,        // inicial: []
source: "conversation" | "future_gmail" | "future_document" | "future_web" | "future_whatsapp"

// === API do Retrieval ===
findById(id)
findByTag(tag, options?)
findByType(memoryType, options?)
findByIntent(memoryIntent, options?)
search(query, options?)  // texto + filtros + ranking`}
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

function DistributionCard({ title, data, color }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return null;
  const colorMap = {
    violet: "bg-violet-100 text-violet-700",
    indigo: "bg-indigo-100 text-indigo-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
  };
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">{title}</p>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, count]) => (
          <span key={key} className={`text-xs px-2 py-1 rounded-md font-medium ${colorMap[color] || "bg-zinc-100 text-zinc-600"}`}>
            {key}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}