/**
 * SprintEF4210Page.jsx — Sprint EF-42.10
 * Architecture Stress & Resilience Certification
 *
 * Data source: StressTestEngine (synthetic) + CertificationEngine (live)
 * Zero hardcoded results — all derived from runtime execution.
 */

import React, { useState, useCallback } from "react";

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    gold:   "bg-yellow-950/60 text-yellow-300 border-yellow-700",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
    teal:   "bg-teal-950/60 text-teal-300 border-teal-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-xl px-3 py-2.5 text-center">
      <div className={`text-sm font-black font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function categoryColor(cat) {
  const map = {
    correct_architecture:   "green",
    circular_dependency:    "red",
    duplicate_component:    "amber",
    multiple_bootstraps:    "red",
    multiple_chunk_indexes: "amber",
    multiple_retrievals:    "amber",
    incomplete_pipeline:    "red",
    inverted_pipeline:      "amber",
    layer_inversion:        "red",
    orphan_components:      "amber",
    missing_singleton:      "red",
    role_duplication:       "amber",
    chaos_mutation:         "violet",
    performance:            "sky",
  };
  return map[cat] ?? "zinc";
}

// ── Final Certification Banner ────────────────────────────────────────────────

function FinalBanner({ report }) {
  const ok = report.finalVerdict === "RESILIENT";
  return (
    <div className={`border-2 ${ok ? "border-yellow-500/70 bg-yellow-950/10" : "border-red-800 bg-red-950/10"} rounded-xl p-6 space-y-5`}>

      {/* Verdict */}
      <div className="text-center space-y-2">
        <Badge label={ok ? "RESILIENT" : "FLAWED"} color={ok ? "gold" : "red"} />
        <p className={`text-lg font-black ${ok ? "text-yellow-300" : "text-red-300"} font-mono mt-2`}>
          {ok ? "Architecture Stress & Resilience Certification" : "Resilience Certification FAILED"}
        </p>
        <p className="text-zinc-500 text-xs">
          {report.totalScenarios} cenários · {report.passed}/{report.totalScenarios} aprovados · {report.detectionRate}% detecção · {report.totalDurationMs}ms
        </p>
      </div>

      {/* Core metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Metric label="Cenários"       value={report.totalScenarios}   color="text-violet-400" />
        <Metric label="Aprovados"      value={report.passed}           color="text-emerald-400" />
        <Metric label="Falsos Pos."    value={report.falsePositives}   color={report.falsePositives > 0 ? "text-red-400" : "text-zinc-600"} />
        <Metric label="Falsos Neg."    value={report.falseNegatives}   color={report.falseNegatives > 0 ? "text-red-400" : "text-zinc-600"} />
        <Metric label="Detecção"       value={`${report.detectionRate}%`} color={report.detectionRate === 100 ? "text-yellow-400" : "text-amber-400"} />
      </div>

      {/* Certifications */}
      {report.certifications.length > 0 && (
        <div className={`border ${ok ? "border-yellow-700/30 bg-yellow-950/10" : "border-zinc-700 bg-zinc-900/40"} rounded-xl p-4 space-y-2`}>
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Certificações Emitidas</p>
          <div className="space-y-1.5">
            {report.certifications.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`font-mono text-xs font-black ${ok ? "text-yellow-300" : "text-zinc-400"}`}>◆</span>
                <span className={`font-mono text-xs font-black ${ok ? "text-yellow-300" : "text-zinc-400"}`}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next phases */}
      {ok && (
        <div className="border border-indigo-800/30 rounded-xl p-4 space-y-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Próximas Sprints — Camada Cognitiva Autorizada</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[["EF-43","Authority Engine"],["EF-44","Ranking Engine"],["EF-45","Conflict Resolver"],
              ["EF-46","Knowledge Context Builder"],["EF-47","Planner Integration"]].map(([id, name]) => (
              <div key={id} className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-700/20 rounded px-3 py-1.5">
                <Badge label={id} color="indigo" />
                <span className="text-zinc-300 text-xs">{name}</span>
              </div>
            ))}
          </div>
          <p className="text-zinc-600 text-xs font-mono mt-2">
            ◆ Infraestrutura documental definitivamente encerrada · {report.generatedAt?.slice(0,19).replace("T"," ")}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Stress results table ──────────────────────────────────────────────────────

function StressTable({ report }) {
  const [filter, setFilter] = useState("ALL");
  const all    = report.stressResults;
  const items  = filter === "ALL" ? all : filter === "PASS" ? all.filter(r => r.passed) : all.filter(r => !r.passed);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {["ALL","PASS","FAIL"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-bold font-mono border transition-colors
              ${filter === f ? "bg-zinc-700 text-white border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-white"}`}>
            {f} ({f === "ALL" ? all.length : f === "PASS" ? all.filter(r => r.passed).length : all.filter(r => !r.passed).length})
          </button>
        ))}
        {report.falsePositives > 0 && <Badge label={`${report.falsePositives} FALSE POS`} color="red" />}
        {report.falseNegatives > 0 && <Badge label={`${report.falseNegatives} FALSE NEG`} color="red" />}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
              <tr className="text-zinc-500">
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-left px-3 py-2">Categoria</th>
                <th className="text-left px-3 py-2 min-w-[180px]">Descrição</th>
                <th className="text-center px-3 py-2">Esperado</th>
                <th className="text-center px-3 py-2">Obtido</th>
                <th className="text-center px-3 py-2">Score</th>
                <th className="text-center px-3 py-2">Ev.</th>
                <th className="text-center px-3 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i} className={`border-b border-zinc-800/40 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
                  <td className="px-3 py-2 text-zinc-500">{r.scenario.id}</td>
                  <td className="px-3 py-2"><Badge label={r.scenario.category.replace(/_/g," ")} color={categoryColor(r.scenario.category)} /></td>
                  <td className="px-3 py-2 text-zinc-400 max-w-[200px] truncate" title={r.scenario.description}>{r.scenario.description}</td>
                  <td className="px-3 py-2 text-center text-zinc-500">{r.scenario.expectedStatus?.replace("NOT_CERTIFIED_OR_OBS","NC/OBS")}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge label={r.actualStatus === "CERTIFIED" ? "CERT" : r.actualStatus === "CERTIFIED_WITH_OBSERVATIONS" ? "OBS" : "FAIL"}
                      color={r.actualStatus === "CERTIFIED" ? "green" : r.actualStatus === "CERTIFIED_WITH_OBSERVATIONS" ? "amber" : "red"} />
                  </td>
                  <td className="px-3 py-2 text-center text-zinc-400">{r.actualScore}%</td>
                  <td className="px-3 py-2 text-center text-zinc-600">{r.evidenceFailed}F/{r.evidenceTotal}</td>
                  <td className="px-3 py-2 text-center">
                    {r.isFalsePositive ? <Badge label="FALSE POS" color="red" />
                    : r.isFalseNegative ? <Badge label="FALSE NEG" color="red" />
                    : <Badge label={r.passed ? "PASS" : "FAIL"} color={r.passed ? "green" : "red"} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Consistency panel ─────────────────────────────────────────────────────────

function ConsistencyPanel({ cons }) {
  const ok = cons.allIdentical;
  return (
    <div className={`border ${ok ? "border-emerald-800/40 bg-emerald-950/10" : "border-red-800 bg-red-950/10"} rounded-xl p-5 space-y-4`}>
      <div className="flex items-center gap-3">
        <Badge label={ok ? "DETERMINISTIC" : "NOT DETERMINISTIC"} color={ok ? "green" : "red"} />
        <span className="text-zinc-500 text-xs font-mono">{cons.runs} execuções · {cons.durationMs}ms</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className={`text-lg font-black font-mono ${cons.uniqueScores.length === 1 ? "text-emerald-400" : "text-red-400"}`}>
            {cons.uniqueScores.length}
          </p>
          <p className="text-zinc-600 text-xs">score único</p>
          <p className="text-zinc-700 text-xs font-mono mt-0.5">{cons.uniqueScores[0]}%</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className={`text-lg font-black font-mono ${cons.uniqueStatuses.length === 1 ? "text-emerald-400" : "text-red-400"}`}>
            {cons.uniqueStatuses.length}
          </p>
          <p className="text-zinc-600 text-xs">status único</p>
          <p className="text-zinc-700 text-xs font-mono mt-0.5">{cons.uniqueStatuses[0]}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className={`text-lg font-black font-mono ${cons.uniqueHashes.length === 1 ? "text-emerald-400" : "text-red-400"}`}>
            {cons.uniqueHashes.length}
          </p>
          <p className="text-zinc-600 text-xs">hash único</p>
          <p className="text-zinc-700 text-xs font-mono mt-0.5 break-all text-[10px]">{cons.uniqueHashes[0]?.slice(0,24)}</p>
        </div>
      </div>
      <p className={`text-xs text-center font-mono ${ok ? "text-emerald-400/60" : "text-red-400/60"}`}>
        {ok ? `✓ ${cons.runs} runs · score idêntico · status idêntico · hash idêntico — engine é determinístico`
             : `✗ Resultados divergentes detectados em ${cons.runs} runs`}
      </p>
    </div>
  );
}

// ── Performance panel ─────────────────────────────────────────────────────────

function PerformancePanel({ perf }) {
  const maxDuration = Math.max(...perf.map(p => p.durationMs), 1);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Performance por Volume de Componentes</p>
      <div className="space-y-3">
        {perf.map((p, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">{p.componentCount} componentes</span>
              <span className="text-zinc-500">{p.durationMs}ms · {p.evidenceCount} evidências · score {p.scoreComputed}%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-600 rounded-full"
                  style={{ width: `${(p.durationMs / maxDuration) * 100}%` }} />
              </div>
              <span className="text-violet-400 text-xs font-mono w-12 text-right">{p.durationMs}ms</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-500">
        <p>Escalabilidade: O(n) — tempo proporcional ao número de componentes e evidências</p>
        <p className="mt-1">Sem uso de memória persistente além dos singletons HMR-safe em globalThis</p>
      </div>
    </div>
  );
}

// ── Robustness report panel ───────────────────────────────────────────────────

function RobustnessPanel({ report }) {
  const categories = [...new Set(report.stressResults.map(r => r.scenario.category))];
  const byCategory = categories.map(cat => {
    const group = report.stressResults.filter(r => r.scenario.category === cat);
    return { cat, total: group.length, passed: group.filter(r => r.passed).length };
  });
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">ArchitectureRobustnessReport</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="Total Cenários" value={report.totalScenarios}  color="text-violet-400" />
          <Metric label="Aprovados"      value={`${report.passed}/${report.totalScenarios}`} color={report.passed===report.totalScenarios?"text-emerald-400":"text-red-400"} />
          <Metric label="Taxa Detecção"  value={`${report.detectionRate}%`} color={report.detectionRate===100?"text-yellow-400":"text-amber-400"} />
          <Metric label="Tempo Total"    value={`${report.totalDurationMs}ms`} color="text-sky-400" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="Falsos Pos."  value={report.falsePositives}  color={report.falsePositives>0?"text-red-400":"text-zinc-600"} />
          <Metric label="Falsos Neg."  value={report.falseNegatives}  color={report.falseNegatives>0?"text-red-400":"text-zinc-600"} />
          <Metric label="Consistência" value={report.consistency.allIdentical ? "100%" : "FALHOU"} color={report.consistency.allIdentical?"text-emerald-400":"text-red-400"} />
          <Metric label="Veredito"     value={report.finalVerdict}    color={report.finalVerdict==="RESILIENT"?"text-yellow-400":"text-red-400"} />
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Por Categoria</p>
        <div className="space-y-2">
          {byCategory.map(({ cat, total, passed: p }) => (
            <div key={cat} className="flex items-center gap-3 text-xs">
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                <span className={`text-xs ${p===total?"text-emerald-400":"text-red-400"}`}>{p===total?"✓":"✗"}</span>
              </div>
              <Badge label={cat.replace(/_/g," ")} color={categoryColor(cat)} />
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${(p/total)*100}%` }} />
              </div>
              <span className="text-zinc-500 w-12 text-right font-mono">{p}/{total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "verdict",     label: "Veredito Final" },
  { id: "stress",      label: "Stress Tests"   },
  { id: "consistency", label: "Consistência"   },
  { id: "performance", label: "Performance"    },
  { id: "robustness",  label: "Robustez"       },
];

export default function SprintEF4210Page() {
  const [running, setRunning] = useState(false);
  const [report,  setReport]  = useState(null);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState("verdict");

  const handleRun = useCallback(async () => {
    setRunning(true); setReport(null); setError(null);
    try {
      const { StressTestEngine } = await import("@/lib/official-library/certification/StressTestEngine");
      const r = await StressTestEngine.run();
      setReport(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const isResilient = report?.finalVerdict === "RESILIENT";

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-42.10" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Architecture Stress &amp; Resilience Certification</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Encerramento definitivo da fase de infraestrutura</span>
          </div>
          <h1 className="text-xl font-black text-white">Stress &amp; Resilience Certification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            25 cenários · False Positive / False Negative · Consistência 100x · Performance · Chaos
          </p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
              {running ? "Executando..." : "▶ Executar Stress Certification"}
            </button>
            {report && <Badge label={report.finalVerdict} color={isResilient ? "gold" : "red"} />}
            {report && <span className="text-zinc-600 text-xs font-mono">{report.totalScenarios} cenários · {report.detectionRate}% detecção</span>}
          </div>
          {report && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              <Metric label="Cenários"    value={report.totalScenarios}          color="text-violet-400" />
              <Metric label="Aprovados"   value={`${report.passed}/${report.totalScenarios}`} color={isResilient?"text-emerald-400":"text-red-400"} />
              <Metric label="Falsos P/N"  value={`${report.falsePositives}/${report.falseNegatives}`} color={report.falsePositives+report.falseNegatives===0?"text-zinc-600":"text-red-400"} />
              <Metric label="Consistência" value={report.consistency.allIdentical?"100x✓":"FALHOU"} color={report.consistency.allIdentical?"text-emerald-400":"text-red-400"} />
              <Metric label="Tempo"       value={`${report.totalDurationMs}ms`} color="text-sky-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">Gerando 25 arquiteturas sintéticas · Executando stress tests · Consistência 100x · Performance...</p>
            <p className="text-zinc-600 text-xs">False positive · False negative · Chaos · Robustness</p>
          </div>
        )}

        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {!running && !report && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">EF-42.10 — Stress &amp; Resilience Certification</p>
            <p className="text-zinc-600 text-xs">25 cenários adversariais · Arquiteturas sintetizadas em-memória</p>
            <p className="text-zinc-600 text-xs">Nenhum componente de produção é alterado</p>
          </div>
        )}

        {!running && report && (
          <>
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors min-w-[90px]
                    ${tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "verdict"     && <FinalBanner     report={report} />}
            {tab === "stress"      && <StressTable     report={report} />}
            {tab === "consistency" && <ConsistencyPanel cons={report.consistency} />}
            {tab === "performance" && <PerformancePanel perf={report.performance} />}
            {tab === "robustness"  && <RobustnessPanel  report={report} />}
          </>
        )}
      </div>
    </div>
  );
}