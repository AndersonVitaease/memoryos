import React, { useState } from "react";
import { Play, CheckCircle, XCircle, Loader2, BarChart2, Shield, Zap, Database, Clock, AlertTriangle } from "lucide-react";

const SECTION_ICONS = {
  "store":       Database,
  "get":         Database,
  "remove":      Database,
  "findByKey":   Database,
  "touch":       Clock,
  "promote":     Zap,
  "runEviction": Zap,
  "clearContext":Zap,
  "isolation":   Shield,
  "eviction":    AlertTriangle,
  "ttl":         Clock,
  "auto-promote":Zap,
  "performance": BarChart2,
  "concurrency": Zap,
  "validation":  Shield,
  "audit":       Shield,
  "stats":       BarChart2,
};

function getSection(name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(SECTION_ICONS)) {
    if (lower.startsWith(key)) return key;
  }
  return "other";
}

export default function Sprint1Validation() {
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [expanded, setExpanded] = useState(null);

  async function run() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const { runSprint1Tests } = await import("@/lib/sprint1/tests/WorkingMemoryEngine.test");
      const output = await runSprint1Tests();
      setResult(output);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  // Group by section
  const grouped = result?.results.reduce((acc, r) => {
    const sec = getSection(r.name);
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(r);
    return acc;
  }, {}) ?? {};

  const mqccsScore = result ? Math.round((result.passed / result.results.length) * 100) : null;
  const mriApproved = mqccsScore !== null && mqccsScore === 100;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-violet-700 flex items-center justify-center shrink-0">
              <Database size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">Sprint 1 — Working Memory Engine</h1>
              <p className="text-zinc-500 text-xs">MRI Validation · MQCCS · Foundation v1.0</p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {["IMemoryProvider","IWorkingMemoryEngine","WorkingMemoryItem","TTL","IdentityContext","Eviction","AuditTrail","Events"].map(b => (
              <span key={b} className="bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <button
          onClick={run}
          disabled={running}
          className="mb-6 flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
        >
          {running
            ? <><Loader2 size={16} className="animate-spin" /> Executando testes...</>
            : <><Play size={16} /> Executar MRI Test Suite — Sprint 1</>
          }
        </button>

        {error && (
          <div className="mb-6 bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm font-mono">{error}</div>
        )}

        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{result.results.length}</div>
                <div className="text-zinc-500 text-xs mt-1">Total de Testes</div>
              </div>
              <div className="bg-zinc-900 border border-green-900 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{result.passed}</div>
                <div className="text-zinc-500 text-xs mt-1">Passou</div>
              </div>
              <div className={`bg-zinc-900 border rounded-xl p-4 text-center ${result.failed > 0 ? "border-red-900" : "border-zinc-800"}`}>
                <div className={`text-2xl font-bold ${result.failed > 0 ? "text-red-400" : "text-zinc-500"}`}>{result.failed}</div>
                <div className="text-zinc-500 text-xs mt-1">Falhou</div>
              </div>
              <div className={`bg-zinc-900 border rounded-xl p-4 text-center ${mqccsScore >= 85 ? "border-green-900" : "border-red-900"}`}>
                <div className={`text-2xl font-bold ${mqccsScore === 100 ? "text-green-400" : mqccsScore >= 85 ? "text-yellow-400" : "text-red-400"}`}>
                  {mqccsScore}%
                </div>
                <div className="text-zinc-500 text-xs mt-1">MQCCS Score</div>
              </div>
            </div>

            {/* Progress */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-300 font-medium">Accuracy</span>
                <div className="flex items-center gap-2">
                  {mriApproved
                    ? <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded font-bold">MRI APROVADO</span>
                    : <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded">MRI REPROVADO</span>
                  }
                  <span className={`text-lg font-bold ${mqccsScore === 100 ? "text-green-400" : mqccsScore >= 85 ? "text-yellow-400" : "text-red-400"}`}>
                    {result.accuracy}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${result.accuracy === 100 ? "bg-green-500" : result.accuracy >= 85 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${result.accuracy}%` }}
                />
              </div>
            </div>

            {/* Performance */}
            {Object.keys(result.performanceSummary).length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <BarChart2 size={14} className="text-violet-400" /> Performance (p95) — target: &lt;10ms
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(result.performanceSummary).map(([k, v]) => (
                    <div key={k} className={`border rounded-lg px-3 py-2 text-center ${v < 10 ? "border-green-800 bg-green-900/20" : "border-red-800 bg-red-900/20"}`}>
                      <div className={`text-lg font-bold ${v < 10 ? "text-green-400" : "text-red-400"}`}>{v}ms</div>
                      <div className="text-zinc-500 text-xs">{k}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results by section */}
            <div className="space-y-3">
              {Object.entries(grouped).map(([section, tests]) => {
                const Icon = SECTION_ICONS[section] ?? Database;
                const sectionPassed = tests.filter(t => t.passed).length;
                const isExpanded = expanded === section;
                return (
                  <div key={section} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : section)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={14} className="text-violet-400" />
                        <span className="font-mono text-sm font-semibold text-zinc-200 capitalize">{section}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sectionPassed === tests.length ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
                          {sectionPassed}/{tests.length}
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
                        {tests.map((t, i) => (
                          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                            {t.passed
                              ? <CheckCircle size={14} className="text-green-400 mt-0.5 shrink-0" />
                              : <XCircle    size={14} className="text-red-400 mt-0.5 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-300 font-mono leading-snug">{t.name}</p>
                              {t.error && <p className="text-xs text-red-400 mt-0.5 font-mono">{t.error}</p>}
                            </div>
                            <span className="text-xs text-zinc-600 shrink-0">{t.durationMs}ms</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Deliverables */}
            <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Entregáveis do Sprint 1</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-zinc-400 font-mono">
                {[
                  "src/lib/sprint1/interfaces/IMemoryProvider.ts",
                  "src/lib/sprint1/interfaces/IWorkingMemoryEngine.ts",
                  "src/lib/sprint1/types/IdentityContext.ts",
                  "src/lib/sprint1/types/MemoryPriority.ts",
                  "src/lib/sprint1/types/WorkingMemoryItem.ts",
                  "src/lib/sprint1/types/MemoryRecord.ts",
                  "src/lib/sprint1/types/MemoryFilter.ts",
                  "src/lib/sprint1/types/MemoryPromotionResult.ts",
                  "src/lib/sprint1/types/AuditRecord.ts",
                  "src/lib/sprint1/types/MemoryEvent.ts",
                  "src/lib/sprint1/utils/uuid.ts",
                  "src/lib/sprint1/utils/validators.ts",
                  "src/lib/sprint1/core/WorkingMemoryStore.ts",
                  "src/lib/sprint1/core/MemoryAuditLogger.ts",
                  "src/lib/sprint1/core/MemoryEventEmitter.ts",
                  "src/lib/sprint1/WorkingMemoryEngine.ts",
                  "src/lib/sprint1/index.ts",
                  "src/lib/sprint1/tests/WorkingMemoryEngine.test.ts",
                ].map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <CheckCircle size={10} className="text-green-500 shrink-0" />
                    <span className="truncate">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!result && !running && (
          <div className="text-center py-20 text-zinc-600">
            <Database size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">Clique em "Executar MRI Test Suite" para validar o Sprint 1</p>
          </div>
        )}
      </div>
    </div>
  );
}