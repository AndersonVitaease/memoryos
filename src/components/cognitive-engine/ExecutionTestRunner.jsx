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
  Shield,
  GitBranch,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import { runExecutionTests, executionTests } from "@/lib/execution-engine";

export default function ExecutionTestRunner() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);
  const [liveResults, setLive]  = useState([]);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    setLive([]);
    try {
      const res = await runExecutionTests((r) => {
        setLive((prev) => [...prev, r]);
      });
      setResults(res);
    } finally {
      setRunning(false);
    }
  };

  const getResult = (name) => liveResults.find((r) => r.name === name);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-200">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-heading text-zinc-900">Sprint 17 · Execution Engine</h2>
          <p className="text-sm text-zinc-500">
            Executa planos aprovados — sequencial, paralelo, rollback, retry, auditoria
          </p>
        </div>
      </div>

      {/* Architecture Flow */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Fluxo de Execução</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs font-mono text-zinc-500">
          {["Goal", "Goal Validation", "Planner", "Capability Negotiation", "Execution Engine", "Connector Interface", "Provider Adapter", "Sistema Externo"].map((step, i, arr) => (
            <React.Fragment key={step}>
              <span className={`px-2 py-1 rounded-lg ${i === 4 ? "bg-orange-100 text-orange-700 font-bold" : "bg-zinc-100"}`}>{step}</span>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-300" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Principles + Contracts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Princípios Arquiteturais</h3>
          </div>
          <div className="space-y-1.5">
            {[
              ["✓", "Executa planos aprovados", "text-emerald-600"],
              ["✓", "Coordena Connectors via Interface", "text-emerald-600"],
              ["✓", "Suporta rollback e retry", "text-emerald-600"],
              ["✓", "Registra auditoria completa", "text-emerald-600"],
              ["✓", "Emite eventos para todos os motores", "text-emerald-600"],
              ["✗", "Nunca acessa APIs diretamente", "text-red-500"],
              ["✗", "Nunca conhece sistemas específicos", "text-red-500"],
              ["✗", "Nunca interpreta objetivos", "text-red-500"],
              ["✗", "Nunca toma decisões de negócio", "text-red-500"],
            ].map(([mark, text, color]) => (
              <p key={text} className={`text-xs ${color}`}>{mark} {text}</p>
            ))}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-zinc-800">Componentes</h3>
          </div>
          <div className="space-y-1.5">
            {[
              ["ExecutionEngine", "Orquestrador central"],
              ["ConnectorInterface", "Abstração total dos sistemas externos"],
              ["SecurityGate", "Permission → Approval → Risk → SecIntel"],
              ["TransactionManager", "Rollback, retry, contexto, integridade"],
              ["ExecutionContracts", "Contratos imutáveis e IDs determinísticos"],
            ].map(([name, desc]) => (
              <div key={name} className="flex items-start gap-2">
                <span className="text-xs font-mono text-orange-600 shrink-0 mt-0.5">{name}</span>
                <span className="text-xs text-zinc-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Gate */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Security Gate — Fluxo de Autorização</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs font-mono text-zinc-500">
          {["Permission Engine", "Approval Engine", "Risk Engine", "Security Intelligence", "→ Execution"].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span className="px-2 py-1 rounded-lg bg-zinc-100">{s}</span>
              {i < arr.length - 1 && <span className="text-zinc-300">→</span>}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs text-zinc-400 mt-2">Nenhum step é executado sem passar por todas as verificações de segurança.</p>
      </div>

      {/* Rollback */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Rollback &amp; Retry</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs text-zinc-500">
          <div>
            <p className="font-semibold text-zinc-700 mb-1">Rollback</p>
            <p>Steps com supportsRollback=true são enfileirados em ordem inversa.</p>
            <p className="mt-1">Quando um step falha, o rollback executa na ordem inversa de execução.</p>
            <p className="mt-1">Se rollback não disponível → auditoria + intervenção humana.</p>
          </div>
          <div>
            <p className="font-semibold text-zinc-700 mb-1">Retry Policies</p>
            <p><span className="font-mono text-orange-600">NONE</span> — sem retry</p>
            <p><span className="font-mono text-orange-600">SIMPLE</span> — intervalo fixo</p>
            <p><span className="font-mono text-orange-600">EXPONENTIAL_BACKOFF</span> — intervalo cresce 2x por tentativa</p>
            <p><span className="font-mono text-orange-600">CONDITIONAL</span> — retry por condição</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      {results && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{results.passed}</p>
            <p className="text-xs text-zinc-500 mt-1">Aprovados</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{results.failed}</p>
            <p className="text-xs text-zinc-500 mt-1">Reprovados</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">{results.accuracy}%</p>
            <p className="text-xs text-zinc-500 mt-1">Acurácia</p>
          </div>
        </div>
      )}

      {/* Test list */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            Bateria de Testes ({executionTests.length} cenários)
          </h3>
          {results && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              results.passed === results.total ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            }`}>
              {results.passed}/{results.total} aprovados
            </span>
          )}
        </div>

        <div className="space-y-2 mb-4 max-h-[480px] overflow-y-auto pr-1">
          {executionTests.map((tc) => {
            const r = getResult(tc.name);
            const done = !!r;
            const passed = r?.status === "passed";
            const failed = r?.status === "failed";
            return (
              <div key={tc.name} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                passed ? "border-emerald-200 bg-emerald-50/40" :
                failed  ? "border-red-200 bg-red-50/40" :
                "border-zinc-200"
              }`}>
                <div className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                  {running && !done ? <Loader2 className="w-4 h-4 animate-spin text-zinc-300" /> :
                   passed           ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                   failed           ? <XCircle className="w-5 h-5 text-red-500" /> :
                   <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700 leading-snug">{tc.name}</p>
                  {r?.error && <p className="text-xs text-red-500 mt-1 font-mono">{r.error}</p>}
                </div>
                {r?.durationMs !== undefined && (
                  <span className="text-xs text-zinc-400 shrink-0">{r.durationMs}ms</span>
                )}
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
          {running ? "Executando testes..." : "Executar Sprint 17 — Execution Engine"}
        </button>
      </div>

      {/* Future Integrations */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Interfaces Futuras Reservadas</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            "Learning Engine",
            "Knowledge Engine",
            "Support Intelligence",
            "Product Evolution Engine",
            "Organizational Experience Engine",
            "Intent Verification Engine",
            "Security Intelligence Engine",
            "SDK para Connectors",
            "Marketplace de Connectors",
          ].map((name) => (
            <div key={name} className="flex items-center gap-2 text-xs text-zinc-400">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
              {name}
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-400 mt-3 italic">Interfaces definidas mas não implementadas nesta Sprint.</p>
      </div>

    </div>
  );
}