/**
 * SprintP021Page — Sprint P-02.1
 * Validation Integration & Certification Dashboard
 */

import { useState, useCallback } from "react";
import ValidationSummaryBar       from "@/components/validation/ValidationSummaryBar";
import ValidationScenarioTable    from "@/components/validation/ValidationScenarioTable";
import ValidationMetricsPanel     from "@/components/validation/ValidationMetricsPanel";
import ValidationHistoryPanel     from "@/components/validation/ValidationHistoryPanel";
import CertificatePanel           from "@/components/validation/CertificatePanel";
import RegressionRegistryPanel    from "@/components/validation/RegressionRegistryPanel";

async function loadFramework() {
  const { ValidationFramework } = await import("@/lib/validation/ValidationFramework");
  return new ValidationFramework();
}

const TABS = [
  { id: "scenarios",   label: "Scenarios"   },
  { id: "certificate", label: "Certificate" },
  { id: "regression",  label: "Regression"  },
  { id: "metrics",     label: "Metrics"     },
  { id: "history",     label: "History"     },
];

export default function SprintP021Page() {
  const [suite,        setSuite]        = useState(null);
  const [history,      setHistory]      = useState([]);
  const [cert,         setCert]         = useState(null);
  const [regEntries,   setRegEntries]   = useState([]);
  const [permanent,    setPermanent]    = useState([]);
  const [regressions,  setRegressions]  = useState([]);
  const [running,      setRunning]      = useState(false);
  const [progress,     setProgress]     = useState({ done: 0, total: 0 });
  const [runningId,    setRunningId]    = useState(null);
  const [tab,          setTab]          = useState("scenarios");
  const [err,          setErr]          = useState(null);

  const run = useCallback(async () => {
    setRunning(true); setErr(null); setRegressions([]);
    setProgress({ done: 0, total: 10 });
    try {
      const fw = await loadFramework();

      const result = await fw.runAll((done, total, latest) => {
        setProgress({ done, total });
        setRunningId(latest.scenarioId);
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

      // Regression check
      const regs = fw.checkRegression(result);
      setRegressions(regs);

      // Certify
      const certificate = fw.certify(result);
      setCert(certificate);
      setRegEntries([...certificate.regressionEntries]);
      setPermanent([...certificate.permanentSuite]);

      // Switch to certificate tab on completion
      setTab("certificate");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
      setRunningId(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-xs text-zinc-500 tracking-widest mb-1">SPRINT P-02.1 — VALIDATION INTEGRATION & CERTIFICATION</div>
          <div className="text-xl font-bold text-white">MemoryOS Core v1.0 — Product Validation Certification</div>
          <div className="text-zinc-400 text-sm mt-1">
            Integration Audit · Scenario Verification · Regression Guard · Metrics Consistency · Final Certificate
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {["ExecutionChain (official)", "ExecutionReport", "ExecutionSnapshot", "MetricsConsistencyAuditor", "RegressionStore", "CertificationReport"].map(t => (
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
              ? `Validating ${progress.done}/${progress.total}…`
              : "▶  Run & Certify (VS-01 → VS-10)"}
          </button>
          {cert && (
            <div className={`text-sm font-bold px-3 py-1.5 rounded border ${cert.certified ? "border-emerald-600 text-emerald-400" : "border-amber-600 text-amber-400"}`}>
              {cert.certified ? "✓ P-02.1 CERTIFIED" : `${suite?.passed ?? 0}/${suite?.total ?? 0} passed`}
            </div>
          )}
        </div>

        {err && (
          <div className="border border-red-700 bg-red-950/20 rounded p-3 text-red-300 text-sm">Error: {err}</div>
        )}

        {regressions.length > 0 && (
          <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 space-y-1">
            <div className="text-red-400 font-bold text-sm mb-1">⚠ REGRESSION DETECTED</div>
            {regressions.map((r, i) => <div key={i} className="text-red-300 text-xs">{r}</div>)}
          </div>
        )}

        <ValidationSummaryBar suite={suite} />

        {/* Tabs */}
        {(suite || cert) && (
          <div>
            <div className="flex gap-1 border-b border-zinc-800 mb-4 flex-wrap">
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

            {tab === "scenarios" && (
              <ValidationScenarioTable results={suite?.results ?? []} runningId={runningId} />
            )}
            {tab === "certificate" && (
              <CertificatePanel cert={cert} />
            )}
            {tab === "regression" && (
              <RegressionRegistryPanel entries={regEntries} permanent={permanent} />
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
          <div className="text-zinc-400 tracking-widest mb-2">CRITERIOS DE ACEITE — P-02.1</div>
          {[
            "ValidationRunner integrado ao Core oficial (ExecutionChain)",
            "Todos os cenarios VS-01 a VS-10 executados",
            "Metricas consistentes: Report / Snapshot / ValidationMetrics",
            "MetricsConsistencyAuditor valida status, stages, duration, sessionId",
            "RegressionStore permanente — first approval + historico de sucesso",
            "Regression Guard ativo — detecta regressoes automaticamente",
            "CertificationReport consolidado com cobertura por categoria",
            "Dashboard desacoplado — apenas dados publicos do Validation Framework",
            "Zero breaking changes",
            "Zero regressions",
            "MemoryOS Core v1.0 oficialmente aprovado para fase Beta",
          ].map((item, i) => (
            <div key={i} className="text-zinc-300 py-0.5">✓ {item}</div>
          ))}
        </div>

      </div>
    </div>
  );
}