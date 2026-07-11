import React, { useState, useCallback } from "react";
import { runConnectorRuntimeTests } from "@/lib/connector-runtime";
import { CheckCircle, XCircle, Play, RotateCcw, Plug, AlertTriangle, Info } from "lucide-react";

const STATUS_COLOR = {
  SUCCESS:   "bg-green-900/40 text-green-300 border-green-700",
  FAILED:    "bg-red-900/40 text-red-300 border-red-700",
  DENIED:    "bg-orange-900/40 text-orange-300 border-orange-700",
  TIMEOUT:   "bg-yellow-900/40 text-yellow-300 border-yellow-700",
  CANCELLED: "bg-zinc-800 text-zinc-400 border-zinc-600",
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${STATUS_COLOR[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
      {status}
    </span>
  );
}

export default function ConnectorRuntimePage() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);
    const r = await runConnectorRuntimeTests();
    setResults(r);
    setRunning(false);
  }, []);

  const passed   = results?.filter(r => r.passed).length ?? 0;
  const total    = results?.length ?? 0;
  const allPass  = results && passed === total;
  const hasObs   = results?.some(r => r.observation);
  const totalMs  = results?.reduce((a, r) => a + r.durationMs, 0) ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shrink-0">
              <Plug size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Connector Runtime</h1>
              <p className="text-zinc-500 text-xs">Engineering First · Foundation v1.0 · 7 Cenarios de Validacao</p>
            </div>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            {running
              ? <><RotateCcw size={14} className="animate-spin" />Executando...</>
              : <><Play size={14} />Executar Validacao</>}
          </button>
        </div>

        {/* Components */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {["ConnectorRuntime","ConnectorRegistry","ConnectorLoader","ConnectorExecutor","Base44Connector","GitHubConnector"].map(c => (
            <div key={c} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-400">{c}</div>
          ))}
        </div>

        {/* Empty / running state */}
        {!running && !results && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <Plug size={28} className="text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm font-medium">7 cenarios de validacao arquitetural</p>
            <p className="text-zinc-600 text-xs mt-1">SUCCESS · FAILED · DENIED · TIMEOUT · CANCELLED</p>
          </div>
        )}

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <RotateCcw size={28} className="text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando cenarios de validacao...</p>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${allPass ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
              {allPass
                ? <CheckCircle size={22} className="text-green-400 shrink-0" />
                : <XCircle size={22} className="text-red-400 shrink-0" />}
              <div className="flex-1">
                <p className={`font-bold text-sm ${allPass ? "text-green-300" : "text-red-300"}`}>
                  {allPass ? "Todos os cenarios validados com sucesso" : `${total - passed} cenario(s) falharam`}
                </p>
                <p className="text-zinc-400 text-xs mt-0.5">{passed}/{total} passou · {totalMs}ms total</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold font-mono text-white">{Math.round((passed / total) * 100)}%</div>
                <div className="text-xs text-zinc-500">pass rate</div>
              </div>
            </div>

            {/* Metrics strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-green-400">{passed}</div>
                <div className="text-xs text-zinc-500">Passou</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-red-400">{total - passed}</div>
                <div className="text-xs text-zinc-500">Falhou</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-zinc-300">{totalMs}ms</div>
                <div className="text-xs text-zinc-500">Duracao</div>
              </div>
            </div>

            {/* Scenario cards */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-300">Cenarios de Validacao</span>
              </div>
              {results.map((r, i) => (
                <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-3 space-y-1.5">
                  <div className="flex items-start gap-3">
                    {r.passed
                      ? <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
                      : <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 font-medium">{r.name}</p>
                      {r.detail && <p className="text-xs text-zinc-500 mt-0.5">{r.detail}</p>}
                      {r.error && <p className="text-xs text-red-400 mt-0.5 font-mono">{r.error}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.expectedStatus && r.actualStatus && (
                        <div className="flex items-center gap-1 text-xs text-zinc-600">
                          <span className="text-zinc-600">esperado</span>
                          <StatusBadge status={r.expectedStatus} />
                          <span className="text-zinc-600">obtido</span>
                          <StatusBadge status={r.actualStatus} />
                        </div>
                      )}
                      <span className="text-xs text-zinc-600 font-mono">{r.durationMs}ms</span>
                    </div>
                  </div>
                  {r.observation && (
                    <div className="ml-5 bg-yellow-950/20 border border-yellow-800/40 rounded-lg px-3 py-2 flex gap-2">
                      <AlertTriangle size={12} className="text-yellow-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-300">{r.observation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Engineering Review observation */}
            {hasObs && (
              <div className="bg-zinc-900 border border-yellow-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-300">Observacao para Engineering Review</span>
                </div>
                {results.filter(r => r.observation).map((r, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className="text-xs font-medium text-zinc-300">{r.scenario} — {r.name}</p>
                    <p className="text-xs text-zinc-400">{r.observation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Final verdict */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Info size={14} className="text-blue-400" />
                <span className="text-xs font-semibold text-zinc-200">Criterio Final — Engineering First</span>
              </div>
              {[
                { q: "1. O Connector Runtime esta funcional?",                  a: allPass ? "SIM" : "NAO",  ok: allPass },
                { q: "2. A arquitetura suportou todos os testes?",              a: allPass ? "SIM" : "NAO",  ok: allPass },
                { q: "3. Foi identificada alguma limitacao arquitetural?",       a: hasObs  ? "SIM" : "NAO",  ok: !hasObs },
              ].map(({ q, a, ok }) => (
                <div key={q} className="flex items-start justify-between gap-3 border-b border-zinc-800/40 last:border-0 pb-2 last:pb-0">
                  <p className="text-xs text-zinc-300">{q}</p>
                  <span className={`text-xs font-bold font-mono shrink-0 ${ok ? "text-green-400" : "text-yellow-400"}`}>{a}</span>
                </div>
              ))}
              {hasObs && (
                <div className="pt-1">
                  <p className="text-xs text-zinc-500">
                    <span className="text-yellow-400 font-semibold">4. Evidencia: </span>
                    O runtime nao possui mecanismo de cancelamento em voo. O status CANCELLED e produzido
                    apenas via buildCancelledResult() antes da chamada — nao e possivel interromper uma operacao
                    ja em andamento. Evidencia registrada para futura Engineering Review conforme Engineering First.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}