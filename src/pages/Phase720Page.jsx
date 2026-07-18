/**
 * Phase720Page — Sprint EF-7.2.4
 * Runtime Abstraction Completion Dashboard
 */

import React, { useState, useEffect } from "react";

async function runTests() {
  await import("@/lib/official-library/OfficialLibraryRuntime");
  const { runOfficialLibraryTests }    = await import("@/lib/official-library/OfficialLibraryTests");
  const { runOfficialLibraryTests724 } = await import("@/lib/official-library/OfficialLibraryTests724");
  const [r1, r2] = await Promise.all([runOfficialLibraryTests(), runOfficialLibraryTests724()]);
  const results = [...r1.results, ...r2.results];
  const passed  = results.filter(r => r.passed).length;
  return { results, total: results.length, passed, failed: results.length - passed, certified: results.every(r => r.passed) };
}

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const SUITE_COLORS = {
  "43 — IRuntimeProvider":                      "border-violet-700 text-violet-300",
  "44 — RuntimeRegistry":                       "border-blue-700 text-blue-300",
  "45 — RuntimeScore":                          "border-cyan-700 text-cyan-300",
  "46 — RuntimeReason":                         "border-yellow-700 text-yellow-300",
  "47 — OfficialLibraryRuntimeProvider":        "border-emerald-700 text-emerald-300",
  "48 — Bootstrap decoupled":                   "border-teal-700 text-teal-300",
  "49 — Runtime Selection":                     "border-orange-700 text-orange-300",
  "50 — Environment Detection":                 "border-pink-700 text-pink-300",
  "51 — Fallback Runtime":                      "border-indigo-700 text-indigo-300",
  "52 — Priority Resolution":                   "border-amber-700 text-amber-300",
  "53 — Provider Registration":                 "border-lime-700 text-lime-300",
  "54 — Runtime Refresh":                       "border-sky-700 text-sky-300",
  "55 — Provider Replacement":                  "border-rose-700 text-rose-300",
  "56 — Registry Reuse":                        "border-purple-700 text-purple-300",
  "57 — Zero Concrete Imports in Bootstrap":    "border-zinc-500 text-zinc-300",
  "58 — Backward Compatibility":                "border-emerald-600 text-emerald-200",
};

export default function Phase720Page() {
  const [report, setReport]       = useState(null);
  const [running, setRunning]     = useState(false);
  const [err, setErr]             = useState(null);
  const [runtimeInfo, setRuntimeInfo] = useState(null);
  const [loading, setLoading]     = useState(false);

  async function loadRuntimeInfo() {
    setLoading(true);
    try {
      await import("@/lib/official-library/OfficialLibraryRuntime");
      const { OfficialLibraryRuntimeProvider } = await import("@/lib/official-library/OfficialLibraryRuntimeProvider");
      const { RuntimeRegistry }                = await import("@/lib/official-library/RuntimeRegistry");
      const { RuntimeScore }                   = await import("@/lib/official-library/RuntimeScore");

      const runtime   = OfficialLibraryRuntimeProvider.runtime();
      const score     = OfficialLibraryRuntimeProvider.getScore();
      const reason    = OfficialLibraryRuntimeProvider.getReason();
      const allScores = RuntimeScore.scoreAll(RuntimeRegistry.list());
      const allReason = OfficialLibraryRuntimeProvider.getAllReasons();

      setRuntimeInfo({
        runtimeId:    runtime.runtimeId,
        runtimeName:  runtime.runtimeName,
        priority:     runtime.priority,
        isAvailable:  runtime.isAvailable,
        providerReason: runtime.reason,
        discoveryId:  runtime.discovery().runtimeId,
        loaderId:     runtime.loader().loaderId,
        score,
        reason,
        allScores,
        allReason,
        registrySize: RuntimeRegistry.size,
      });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  useEffect(() => { loadRuntimeInfo(); }, []);

  // Group suites — EF-7.2.4 new suites first, then legacy
  const suites724 = report
    ? [...new Set(report.results.map(r => r.suite))]
        .filter(s => /^\d{2,} —/.test(s) && parseInt(s) >= 43)
        .map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  const suitesLegacy = report
    ? [...new Set(report.results.map(r => r.suite))]
        .filter(s => parseInt(s) < 43 || !/^\d/.test(s))
        .map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">SPRINT EF-7.2.4 — RUNTIME ABSTRACTION COMPLETION</div>
          <h1 className="text-3xl font-bold">Official Library — Runtime Abstraction</h1>
          <p className="text-zinc-400 text-sm mt-1">IRuntimeProvider · RuntimeRegistry · RuntimeScore · RuntimeReason · Bootstrap fully decoupled</p>
        </div>

        {/* Architecture pipeline */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-3">PIPELINE EF-7.2.4</div>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {[
              "OfficialLibraryRuntime",
              "RuntimeRegistry.register()",
              "RuntimeRegistry.getActive()",
              "RuntimeScore.selectBestAvailable()",
              "IRuntimeProvider",
              "discovery() + loader()",
              "Bootstrap",
            ].map((step, i, arr) => (
              <React.Fragment key={step}>
                <span className={`border rounded px-2 py-1 ${i === 0 ? "border-violet-700 text-violet-300" : i === arr.length - 1 ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}>{step}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {[
              ["IRuntimeProvider",   "Encapsulates discovery+loader — one interface per environment"],
              ["RuntimeRegistry",    "Generic — no if/else/switch — pure score-based selection"],
              ["RuntimeScore",       "Pure functions — priority+availability+environment → score"],
              ["RuntimeReason",      "Explains every selection decision — full audit trail"],
              ["Bootstrap",          "Knows only OfficialLibraryRuntimeProvider — zero concrete imports"],
              ["Future-ready",       "GitHub=80, Drive=80, S3=70: just new class + register()"],
            ].map(([k, v]) => (
              <div key={k} className="border border-zinc-800 rounded p-2">
                <div className="text-violet-300 font-bold text-xs">{k}</div>
                <div className="text-zinc-500 text-xs">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Runtime info card */}
        {runtimeInfo && (
          <div className="border border-violet-700 rounded-lg p-4 bg-violet-950/10 text-xs space-y-3">
            <div className="text-violet-400 tracking-widest">ACTIVE RUNTIME PROVIDER</div>

            {/* Score + Reason */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["Runtime",      runtimeInfo.runtimeId,   "text-violet-300"],
                ["Priority",     runtimeInfo.priority,    "text-blue-300"],
                ["Score",        `${(runtimeInfo.score.confidence * 100).toFixed(0)}%`, "text-emerald-400"],
                ["Available",    runtimeInfo.isAvailable ? "✓ YES" : "✗ NO", runtimeInfo.isAvailable ? "text-emerald-400" : "text-red-400"],
              ].map(([label, value, cls]) => (
                <div key={label} className="border border-zinc-700 rounded p-2 bg-zinc-900 text-center">
                  <div className="text-zinc-500 text-xs">{label}</div>
                  <div className={`font-bold ${cls}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Score breakdown */}
            <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
              <div className="text-zinc-500 mb-1">Score Breakdown</div>
              <div className="flex gap-4">
                <span>Priority: <span className="text-violet-300">{runtimeInfo.score.priorityScore.toFixed(3)}</span></span>
                <span>Available: <span className="text-emerald-300">{runtimeInfo.score.availabilityScore.toFixed(3)}</span></span>
                <span>Env: <span className="text-blue-300">{runtimeInfo.score.environmentScore.toFixed(3)}</span></span>
                <span className="font-bold">Total: <span className="text-white">{runtimeInfo.score.totalScore.toFixed(3)}</span></span>
              </div>
            </div>

            {/* Reason */}
            <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
              <div className="text-zinc-500 mb-1">Selection Reason</div>
              <div className="text-zinc-300 text-xs">{runtimeInfo.reason.summary}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {runtimeInfo.reason.reasons.map((r, i) => (
                  <span key={i} className="border border-zinc-700 text-zinc-400 rounded px-1.5 py-0.5 text-xs">{r}</span>
                ))}
              </div>
            </div>

            {/* Infra */}
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
                <div className="text-zinc-500">Discovery</div>
                <div className="text-cyan-300 font-bold">{runtimeInfo.discoveryId}</div>
              </div>
              <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
                <div className="text-zinc-500">Loader</div>
                <div className="text-blue-300 font-bold">{runtimeInfo.loaderId}</div>
              </div>
              <div className="border border-zinc-700 rounded p-2 bg-zinc-900">
                <div className="text-zinc-500">Registered</div>
                <div className="text-zinc-300 font-bold">{runtimeInfo.registrySize} providers</div>
              </div>
            </div>

            {/* All providers */}
            <div className="border border-zinc-800 rounded overflow-hidden">
              <div className="bg-zinc-900 px-3 py-1 text-zinc-500 text-xs">ALL PROVIDERS (by score)</div>
              {runtimeInfo.allScores.map((s, i) => {
                const reason = runtimeInfo.allReason.find(r => r.runtimeId === s.runtimeId);
                return (
                  <div key={s.runtimeId} className={`flex items-center justify-between px-3 py-1.5 text-xs ${i === 0 ? "bg-violet-950/20" : ""} border-t border-zinc-800`}>
                    <span className={i === 0 ? "text-violet-300 font-bold" : "text-zinc-400"}>{s.runtimeId} {i === 0 ? "← selected" : ""}</span>
                    <span className="text-zinc-500">p={s.priority} · avail={s.isAvailable ? "✓" : "✗"} · score={s.totalScore.toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={run} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm">
            {running ? "Running…" : "▶  Run All Suites (1–58)"}
          </button>
          <button onClick={loadRuntimeInfo} disabled={loading}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            🔄 Refresh
          </button>
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-4 text-red-300 text-sm">Error: {err}</div>}

        {/* Summary */}
        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ EF-7.2.4 CERTIFIED" : "✗ TEST SUITE FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
          </div>
        )}

        {/* EF-7.2.4 suites */}
        {suites724.length > 0 && (
          <div className="space-y-1">
            <div className="text-violet-400 text-xs tracking-widest px-1">EF-7.2.4 — NEW SUITES (43–58)</div>
            {suites724.map(({ suite, rows }) => {
              const sp  = rows.filter(r => r.passed).length;
              const cls = SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300";
              return (
                <div key={suite} className="space-y-0.5">
                  <div className={`border rounded-lg px-4 py-2 flex justify-between bg-zinc-900 ${cls}`}>
                    <span className="font-bold text-sm">{suite}</span>
                    <span className="text-xs font-mono">{sp}/{rows.length}</span>
                  </div>
                  <div className="border border-zinc-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-zinc-800/60">
                        {rows.map((r, i) => (
                          <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                            <td className="p-2 pl-3 text-zinc-300 w-96">{r.name}</td>
                            <td className="p-2 text-zinc-500 truncate max-w-xs" title={r.detail}>{r.detail}</td>
                            <td className="p-2 pr-3 text-center"><Badge ok={r.passed} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.filter(r => !r.passed).map((r, i) => (
                      <div key={i} className="border-t border-red-800 bg-red-950/10 px-3 py-1.5 text-red-300 text-xs">
                        ✗ [{r.name}] {r.error}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legacy suites (1–28) */}
        {suitesLegacy.length > 0 && (
          <details className="group">
            <summary className="text-zinc-500 text-xs tracking-widest cursor-pointer px-1 py-2">
              LEGACY SUITES (1–28) — {suitesLegacy.reduce((a, { rows }) => a + rows.filter(r => r.passed).length, 0)}/{suitesLegacy.reduce((a, { rows }) => a + rows.length, 0)} passed
            </summary>
            <div className="space-y-0.5 mt-1">
              {suitesLegacy.map(({ suite, rows }) => {
                const sp = rows.filter(r => r.passed).length;
                return (
                  <div key={suite} className="space-y-0.5">
                    <div className="border border-zinc-800 rounded px-3 py-1.5 flex justify-between bg-zinc-900 text-zinc-500 text-xs">
                      <span>{suite}</span>
                      <span>{sp}/{rows.length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-1.5">
          <div className="text-zinc-400 tracking-widest mb-2">CRITÉRIOS DE ACEITE — EF-7.2.4</div>
          {[
            "Bootstrap conhece apenas OfficialLibraryRuntimeProvider",
            "RuntimeRegistry é completamente genérico — zero conhecimento de Vite/Node/Base44",
            "IRuntimeProvider abstrai discovery() e loader() em uma interface",
            "OfficialLibraryRuntime apenas registra Providers — zero lógica de seleção",
            "RuntimeScore centraliza toda lógica de seleção — pure functions",
            "RuntimeReason explica toda decisão de seleção",
            "Nenhum if/else/switch para seleção de Runtime no Registry",
            "Nenhum import concreto no Bootstrap (sem Vite/Node/Base44/Discovery/Loader diretos)",
            "Zero breaking changes — suites 1–28 preservadas",
            "Suites 43–58 aprovadas",
            "Arquitetura preparada: GitHub=80, Drive=80, S3=70 — apenas nova classe + register()",
          ].map((item, i) => (
            <div key={i} className="text-zinc-300 py-0.5">✓ {item}</div>
          ))}
        </div>

      </div>
    </div>
  );
}