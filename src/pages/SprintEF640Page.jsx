/**
 * SprintEF640Page — Engineering Sprint EF-6.4.0
 * Universal Connector Runtime — Certification
 */

import React, { useState } from "react";

async function runTests() {
  const { runUCRTests } = await import("@/lib/ucr/UCRTests");
  return runUCRTests();
}

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const SUITE_COLORS = {
  "1 — Registry (Plugin Model)":   "border-violet-700 text-violet-300",
  "2 — Rate Limiter":              "border-yellow-700 text-yellow-300",
  "3 — Circuit Breaker":           "border-rose-700 text-rose-300",
  "4 — Metrics Store":             "border-blue-700 text-blue-300",
  "5 — GoogleDriveAdapter (buildRequest)": "border-emerald-700 text-emerald-300",
  "6 — UCRRuntime lifecycle":      "border-teal-700 text-teal-300",
  "7 — Architecture Validation":   "border-orange-700 text-orange-300",
  "8 — Reuse Report":              "border-pink-700 text-pink-300",
};

export default function SprintEF640Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState(null);

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  const suites = report
    ? [...new Set(report.results.map(r => r.suite))].map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">ENGINEERING SPRINT EF-6.4.0</div>
          <h1 className="text-3xl font-bold">Universal Connector Runtime</h1>
          <p className="text-zinc-400 text-sm mt-1">Plugin Model · Pipeline · Circuit Breaker · Rate Limiter · Retry · Metrics · Registry · Google Drive as Adapter</p>
        </div>

        {/* Architecture diagram */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-3">
          <div className="text-zinc-400 tracking-widest mb-1">ARQUITETURA UCR v1.0</div>
          <div className="flex gap-10 flex-wrap">
            <div className="space-y-0.5">
              <div className="text-zinc-400 text-xs mb-2">Fluxo completo</div>
              {[
                ["Conversation",               "text-zinc-300"],
                ["↓", "text-zinc-600"],
                ["Planner",                    "text-zinc-300"],
                ["↓", "text-zinc-600"],
                ["GoalCapabilityRegistry",     "text-violet-300"],
                ["↓", "text-zinc-600"],
                ["Capability Executor",        "text-blue-300"],
                ["↓", "text-zinc-600"],
                ["UCRRuntime.execute()",        "text-emerald-400"],
                ["↓", "text-zinc-600"],
                ["──── UCR Pipeline ────",     "text-zinc-500"],
                ["  Auth Middleware",           "text-teal-300"],
                ["  Rate Limiter",              "text-yellow-300"],
                ["  Retry Policy",              "text-orange-300"],
                ["  HTTP Executor",             "text-zinc-300"],
                ["  Response Validator",        "text-zinc-300"],
                ["  Audit Logger",              "text-zinc-300"],
                ["  Metrics Collector",         "text-zinc-300"],
                ["↓", "text-zinc-600"],
                ["ConnectorAdapter.buildRequest()", "text-blue-300"],
                ["↓", "text-zinc-600"],
                ["External API",               "text-zinc-500"],
              ].map(([label, cls], i) => (
                <div key={i} className={`${cls} text-xs ${label.startsWith("  ") ? "pl-4" : ""}`}>{label}</div>
              ))}
            </div>
            <div className="space-y-2 max-w-xs">
              <div className="text-zinc-400 text-xs mb-2">Módulos UCR</div>
              {[
                ["UCRTypes.ts",        "Contratos: ConnectorAdapter, UCRRequest/Response/Error/Audit/Metrics", "text-violet-300"],
                ["UCRRuntime.ts",      "Entry point. execute() + register() + metrics() + lifecycle()", "text-emerald-300"],
                ["UCRPipeline.ts",     "Pipeline único: rate limit → circuit → retry → HTTP → audit → metrics", "text-yellow-300"],
                ["UCRCircuitBreaker.ts","Per-connector: closed/open/half-open. Threshold configurável.", "text-rose-300"],
                ["UCRRateLimiter.ts",  "Sliding window per-connector. Max requests / window.", "text-orange-300"],
                ["UCRMetricsStore.ts", "Agregação in-memory: total, success, failures, avg latency.", "text-blue-300"],
                ["UCRRegistry.ts",     "Plugin model: register() → disponível. Open/Closed.", "text-teal-300"],
                ["GoogleDriveAdapter", "Único adapter registrado. Sabe apenas endpoints + payloads.", "text-zinc-300"],
              ].map(([comp, desc, cls]) => (
                <div key={comp}>
                  <span className={`font-bold ${cls}`}>{comp}: </span>
                  <span className="text-zinc-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pipeline stages */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-2">PIPELINE COMPLETO (UCRPipeline.ts)</div>
          <div className="flex gap-2 flex-wrap">
            {["Circuit Breaker Check", "Rate Limiter", "HTTP Fetch (with timeout)", "Retry Loop (max 2)", "Response Parse", "Circuit Breaker Feedback", "Audit Record", "Metrics Record"].map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <span className="text-zinc-600">→</span>}
                <span className="border border-zinc-600 rounded px-2 py-0.5 text-zinc-300">{s}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={run} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors">
          {running ? "Running UCR Certification…" : "▶  Run Full Certification (8 Suites)"}
        </button>

        {err && <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">Runtime Error: {err}</div>}

        {/* Summary */}
        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ UCR v1.0 CERTIFIED" : "✗ CERTIFICATION FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
          </div>
        )}

        {/* Suite tables */}
        {suites.map(({ suite, rows }) => {
          const sp = rows.filter(r => r.passed).length;
          const colorCls = SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300";
          return (
            <div key={suite} className="space-y-1">
              <div className={`border rounded-lg px-4 py-2 flex justify-between bg-zinc-900 ${colorCls}`}>
                <span className="font-bold text-sm">{suite}</span>
                <span className="text-xs font-mono">{sp}/{rows.length}</span>
              </div>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-500">
                    <tr>
                      <th className="text-left p-2 pl-3 w-72">Test</th>
                      <th className="text-left p-2">Expected</th>
                      <th className="text-left p-2">Actual</th>
                      <th className="text-center p-2 pr-3 w-14">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                        <td className="p-2 pl-3 text-zinc-300">{r.name}</td>
                        <td className="p-2 font-mono text-zinc-500 truncate max-w-xs">{r.expected}</td>
                        <td className="p-2 font-mono text-zinc-400 truncate max-w-xs">{r.actual}</td>
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

        {/* Acceptance criteria */}
        {report && (
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-1.5">
            <div className="text-xs text-zinc-400 tracking-widest mb-2">CRITÉRIOS DE ACEITE EF-6.4.0</div>
            {[
              ["UCR implementado (7 módulos)",                  report.results.filter(r => r.suite.includes("lifecycle")).every(r => r.passed)],
              ["Google Drive usando UCR (adapter registrado)",  report.results.filter(r => r.suite.includes("Registry")).every(r => r.passed)],
              ["Pipeline único para todos os conectores",       report.results.filter(r => r.suite.includes("Architecture")).every(r => r.passed)],
              ["Registry funcionando (plugin model)",           report.results.filter(r => r.suite.includes("Registry")).every(r => r.passed)],
              ["Circuit Breaker funcionando",                   report.results.filter(r => r.suite.includes("Circuit")).every(r => r.passed)],
              ["Rate Limiter funcionando",                      report.results.filter(r => r.suite.includes("Rate")).every(r => r.passed)],
              ["Metrics Store funcionando",                     report.results.filter(r => r.suite.includes("Metrics")).every(r => r.passed)],
              ["GoogleDriveAdapter só conhece endpoints",       report.results.filter(r => r.suite.includes("buildRequest")).every(r => r.passed)],
              ["Nenhuma infra duplicada nos adapters",          report.results.filter(r => r.suite.includes("Architecture")).every(r => r.passed)],
              ["Reutilização >= 85%",                           report.results.filter(r => r.suite.includes("Reuse")).every(r => r.passed)],
              ["Runtime pronto para Gmail/Calendar/OneDrive/Dropbox/GitHub", report.results.filter(r => r.suite.includes("Reuse")).every(r => r.passed)],
              ["Nenhuma regressão — todas suites verdes",       report.certified],
            ].map(([label, ok], i) => (
              <div key={i} className={`flex items-start gap-2 text-sm ${ok ? "text-zinc-300" : "text-red-400"}`}>
                <span className={ok ? "text-emerald-500" : "text-red-500"}>{ok ? "✓" : "✗"}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Reference declaration */}
        <div className="border border-emerald-800 rounded-lg p-4 bg-emerald-950/10 text-xs space-y-2">
          <div className="text-emerald-400 font-bold tracking-widest mb-1">DECLARAÇÃO UCR v1.0</div>
          <p className="text-zinc-300">O <span className="text-emerald-300 font-bold">Google Drive</span> é agora apenas um <span className="text-blue-300 font-bold">Adapter</span> executando sobre o <span className="text-emerald-300 font-bold">Universal Connector Runtime</span>.</p>
          <div className="mt-2 space-y-1 text-zinc-400">
            <div>✓ Adapter implementa apenas: buildRequest() + parseResponse()</div>
            <div>✓ Runtime fornece: auth, retry, circuit breaker, rate limit, metrics, audit, registry</div>
            <div>✓ Novo conector = novo Adapter + UCRRuntime.register() → disponível automaticamente</div>
          </div>
          <p className="text-zinc-500 mt-2 text-xs">Próximos adapters: GmailAdapter · CalendarAdapter · OneDriveAdapter · DropboxAdapter · GitHubAdapter · WhatsAppAdapter</p>
        </div>
      </div>
    </div>
  );
}