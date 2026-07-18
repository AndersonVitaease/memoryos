/**
 * SprintP020Page — Sprint P-02.0 Product Validation Dashboard
 */

import { useState, useCallback } from "react";
import ValidationSummaryBar      from "@/components/validation/ValidationSummaryBar";
import ValidationScenarioTable   from "@/components/validation/ValidationScenarioTable";
import ValidationMetricsPanel    from "@/components/validation/ValidationMetricsPanel";
import ValidationHistoryPanel    from "@/components/validation/ValidationHistoryPanel";

async function loadFramework() {
  const { ValidationFramework } = await import("@/lib/validation/ValidationFramework");
  return new ValidationFramework();
}

export default function SprintP020Page() {
  const [suite,      setSuite]      = useState(null);
  const [history,    setHistory]    = useState([]);
  const [running,    setRunning]    = useState(false);
  const [progress,   setProgress]   = useState({ done: 0, total: 0 });
  const [runningId,  setRunningId]  = useState(null);
  const [regression, setRegression] = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState("results");

  const run = useCallback(async () => {
    setRunning(true); setErr(null); setRegression([]);
    setProgress({ done: 0, total: 10 });
    try {
      const fw = await loadFramework();
      let currentRunning = null;
      const result = await fw.runAll((done, total, latest) => {
        setProgress({ done, total });
        setRunningId(latest.scenarioId);
        currentRunning = latest.scenarioId;
        setSuite(prev => {
          if (!prev) return {
            suiteId: "live", runAt: Date.now(), durationMs: 0,
            total, passed: 0, failed: 0, partial: 0, successRate: 0,
            results: [latest], certified: false,
          };
          const results = [...prev.results.filter(r => r.scenarioId !== latest.scenarioId), latest];
          const passed  = results.filter(r => r.passed).length;
          return { ...prev, results, passed, failed: results.length - passed, total };
        });
      });
      setRunningId(null);
      setSuite(result);
      setHistory(fw.history());
      const regs = fw.checkRegression(result);
      setRegression(regs);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
      setRunningId(null);
    }
  }, []);

  const TABS = [
    { id: "results",  label: "Scenarios" },
    { id: "metrics",  label: "Metrics" },
    { id: "history",  label: "History" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-xs text-zinc-500 tracking-widest mb-1">SPRINT P-02.0 — PRODUCT VALIDATION</div>
          <div className="text-xl font-bold text-white">MemoryOS Core v1.0 — Validation Framework</div>
          <div className="text-zinc-400 text-sm mt-1">
            10 official scenarios · ExecutionChain · ExecutionReport · ExecutionSnapshot · Regression Guard
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {["Validation Framework", "Validation Runner", "10 Scenarios", "Metrics", "Regression Guard", "Dashboard"].map(t => (
              <span key={t} className="border border-zinc-700 rounded px-2 py-0.5 text-zinc-400">{t}</span>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={run}
            disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm"
          >
            {running
              ? `Running ${progress.done}/${progress.total}…`
              : "▶  Run All Scenarios"}
          </button>
          {suite && (
            <div className={`text-sm font-bold px-3 py-1 rounded border ${suite.certified ? "border-emerald-600 text-emerald-400" : "border-amber-600 text-amber-400"}`}>
              {suite.certified ? "✓ CERTIFIED" : `${suite.passed}/${suite.total} passed`}
            </div>
          )}
        </div>

        {err && (
          <div className="border border-red-700 bg-red-950/20 rounded p-3 text-red-300 text-sm">Error: {err}</div>
        )}

        {/* Regression alerts */}
        {regression.length > 0 && (
          <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 space-y-1">
            <div className="text-red-400 font-bold text-sm mb-2">⚠ REGRESSION DETECTED</div>
            {regression.map((r, i) => <div key={i} className="text-red-300 text-xs">{r}</div>)}
          </div>
        )}

        {/* Summary */}
        <ValidationSummaryBar suite={suite} />

        {/* Tabs */}
        {suite && (
          <div>
            <div className="flex gap-1 border-b border-zinc-800 mb-4">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-xs font-bold tracking-widest border-b-2 transition-colors ${
                    tab === t.id ? "border-violet-500 text-violet-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t.label.toUpperCase()}
                </button>
              ))}
            </div>

            {tab === "results" && (
              <ValidationScenarioTable results={suite.results} runningId={runningId} />
            )}
            {tab === "metrics" && (
              <ValidationMetricsPanel suite={suite} />
            )}
            {tab === "history" && (
              <ValidationHistoryPanel history={history} />
            )}
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">CRITERIOS DE ACEITE — P-02.0</div>
          {[
            "Validation Framework criado",
            "Validation Runner implementado",
            "10 cenarios oficiais implementados (VS-01 a VS-10)",
            "Dashboard funcional com tabs: Scenarios / Metrics / History",
            "Metricas coletadas: duracao, confidence, memory, connector, compliance, errors",
            "ExecutionReport integrado via ExecutionChain",
            "ExecutionSnapshot integrado via ExecutionSnapshotAssembler",
            "Regression Guard ativo — cenarios aprovados tornam-se permanentes",
            "Zero alteracoes arquiteturais",
            "Zero breaking changes",
            "MemoryOS Core v1.0 pronto para fase Beta",
          ].map((item, i) => (
            <div key={i} className="text-zinc-300 py-0.5">✓ {item}</div>
          ))}
        </div>

      </div>
    </div>
  );
}