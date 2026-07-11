import React, { useState, useCallback } from "react";
import { runConnectorRuntimeTests } from "@/lib/connector-runtime";
import { CheckCircle, XCircle, Play, RotateCcw, Plug, Activity } from "lucide-react";

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

  const passed  = results?.filter(r => r.passed).length ?? 0;
  const total   = results?.length ?? 0;
  const allPass = results && passed === total;

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
              <p className="text-zinc-500 text-xs">Engineering First · Foundation v1.0 · Validation</p>
            </div>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            {running
              ? <><RotateCcw size={14} className="animate-spin" />Executando...</>
              : <><Play size={14} />Executar Testes</>}
          </button>
        </div>

        {/* Components */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {["ConnectorRuntime","ConnectorRegistry","ConnectorLoader","ConnectorExecutor","Base44Connector","GitHubConnector"].map(c => (
            <div key={c} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-400">{c}</div>
          ))}
        </div>

        {/* Empty state */}
        {!running && !results && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <Activity size={28} className="text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm font-medium">Runtime aguardando execucao</p>
            <p className="text-zinc-600 text-xs mt-1">13 criterios de aceitacao serao validados</p>
          </div>
        )}

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <RotateCcw size={28} className="text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando Connector Runtime...</p>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-3">
            {/* Summary */}
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${allPass ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
              {allPass
                ? <CheckCircle size={22} className="text-green-400 shrink-0" />
                : <XCircle size={22} className="text-red-400 shrink-0" />}
              <div>
                <p className={`font-bold text-sm ${allPass ? "text-green-300" : "text-red-300"}`}>
                  {allPass ? "Connector Runtime validado com sucesso" : `${total - passed} teste(s) falharam`}
                </p>
                <p className="text-zinc-400 text-xs mt-0.5">{passed}/{total} testes passaram</p>
              </div>
              <div className="ml-auto text-right">
                <div className="text-2xl font-bold font-mono text-white">{Math.round((passed / total) * 100)}%</div>
                <div className="text-xs text-zinc-500">pass rate</div>
              </div>
            </div>

            {/* Metrics */}
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
                <div className="text-xl font-bold text-zinc-300">{results.reduce((a, r) => a + r.durationMs, 0)}ms</div>
                <div className="text-xs text-zinc-500">Total</div>
              </div>
            </div>

            {/* Test list */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
                <span className="text-xs font-semibold text-zinc-300">Resultados Individuais</span>
                <span className="text-xs text-zinc-500">{passed}/{total}</span>
              </div>
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-zinc-800/40 last:border-0">
                  {r.passed
                    ? <CheckCircle size={13} className="text-green-400 shrink-0 mt-0.5" />
                    : <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200">{r.name}</p>
                    {r.error && <p className="text-xs text-red-400 mt-0.5 font-mono truncate">{r.error}</p>}
                  </div>
                  <span className="text-xs text-zinc-600 font-mono shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>

            {allPass && (
              <div className="bg-cyan-950/20 border border-cyan-800 rounded-xl p-4 text-center">
                <p className="text-cyan-300 font-bold text-sm">Connector Runtime — Engineering First</p>
                <p className="text-zinc-400 text-xs mt-1">
                  Arquitetura Foundation v1.0 validada por codigo executavel.
                  Base44Connector e GitHubConnector registrados, carregados, executados e monitorados com sucesso.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}