import React, { useState } from "react";
import { CheckCircle, XCircle, Play, Cpu, Loader2, Shield, Database, Zap, Route, GitBranch } from "lucide-react";

const CATEGORIES = {
  "WorkingMemory":      { icon: Database,  color: "violet" },
  "EventBus":           { icon: Zap,       color: "yellow" },
  "AuditTrail":         { icon: Shield,    color: "blue"   },
  "SecurityGate":       { icon: Shield,    color: "red"    },
  "JourneyManager":     { icon: Route,     color: "green"  },
  "MockEmailConnector": { icon: Cpu,       color: "pink"   },
  "MockGovConnector":   { icon: Cpu,       color: "orange" },
  "HttpConnector":      { icon: Cpu,       color: "teal"   },
  "GeneralSpecialist":  { icon: GitBranch, color: "purple" },
  "GovernmentSpecialist":{ icon: GitBranch,color: "indigo" },
  "ExecutionEngine":    { icon: Zap,       color: "cyan"   },
  "ConsultaGovJourney": { icon: Route,     color: "emerald"},
};

function getCategory(name) {
  return Object.keys(CATEGORIES).find(k => name.startsWith(k)) ?? "Other";
}

export default function MriValidation() {
  const [running, setRunning]     = useState(false);
  const [results, setResults]     = useState(null);
  const [error, setError]         = useState(null);

  async function runTests() {
    setRunning(true);
    setResults(null);
    setError(null);
    try {
      const { runMriTests } = await import("@/lib/mri/index");
      const output = await runMriTests();
      setResults(output);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  // Group results by category
  const grouped = results?.results.reduce((acc, r) => {
    const cat = getCategory(r.name);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {}) ?? {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">MRI — Reference Implementation</h1>
              <p className="text-zinc-400 text-sm">Fase 2 — Validação oficial da arquitetura MemoryOS</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {["MCS", "MRS", "MDIS", "MDPS"].map(doc => (
              <div key={doc} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-center">
                <span className="text-violet-400 font-mono font-bold">{doc}</span>
                <span className="text-zinc-500 ml-1">validado</span>
              </div>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={runTests}
          disabled={running}
          className="mb-8 flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Executando testes...</>
            : <><Play className="w-4 h-4" /> Executar MRI Test Suite</>
          }
        </button>

        {error && (
          <div className="mb-6 bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm font-mono">
            {error}
          </div>
        )}

        {/* Summary */}
        {results && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-white">{results.results.length}</div>
                <div className="text-zinc-400 text-sm mt-1">Total</div>
              </div>
              <div className="bg-zinc-900 border border-green-900 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-400">{results.passed}</div>
                <div className="text-zinc-400 text-sm mt-1">Passou</div>
              </div>
              <div className="bg-zinc-900 border border-red-900 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-red-400">{results.failed}</div>
                <div className="text-zinc-400 text-sm mt-1">Falhou</div>
              </div>
            </div>

            {/* Accuracy bar */}
            <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-zinc-300 text-sm font-medium">Precisão da Implementação</span>
                <span className={`text-lg font-bold ${results.accuracy >= 90 ? "text-green-400" : results.accuracy >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                  {results.accuracy}%
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${results.accuracy >= 90 ? "bg-green-500" : results.accuracy >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${results.accuracy}%` }}
                />
              </div>
              {results.accuracy === 100 && (
                <p className="text-green-400 text-xs mt-2 font-medium">✓ MRI v1.0 APROVADO — Todos os critérios de aceitação atendidos</p>
              )}
            </div>

            {/* Results by category */}
            <div className="space-y-4">
              {Object.entries(grouped).map(([category, tests]) => {
                const catPassed = tests.filter(t => t.passed).length;
                const Icon = CATEGORIES[category]?.icon ?? Cpu;
                return (
                  <div key={category} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-violet-400" />
                        <span className="font-mono text-sm font-semibold text-zinc-200">{category}</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${catPassed === tests.length ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}>
                        {catPassed}/{tests.length}
                      </span>
                    </div>
                    <div className="divide-y divide-zinc-800">
                      {tests.map((t, i) => (
                        <div key={i} className="flex items-start gap-3 px-4 py-3">
                          {t.passed
                            ? <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                            : <XCircle    className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-300 font-mono leading-snug">
                              {t.name.replace(`${category}: `, "")}
                            </p>
                            {t.error && (
                              <p className="text-xs text-red-400 mt-0.5 font-mono">{t.error}</p>
                            )}
                          </div>
                          <span className="text-xs text-zinc-600 shrink-0">{t.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!results && !running && (
          <div className="text-center py-20 text-zinc-600">
            <Cpu className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Clique em "Executar MRI Test Suite" para validar a arquitetura</p>
          </div>
        )}
      </div>
    </div>
  );
}