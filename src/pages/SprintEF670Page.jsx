/**
 * SprintEF670Page — Engineering Sprint EF-6.7.0
 * Architecture Baseline Engine (ABE)
 */

import React, { useState } from "react";

async function runTests() {
  const { runABETests } = await import("@/lib/abe/ABETests");
  return runABETests();
}

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const SUITE_COLORS = {
  "1 — Baseline Generation":                         "border-violet-700 text-violet-300",
  "2 — Serialization & Persistence":                 "border-blue-700 text-blue-300",
  "3 — Diff Engine":                                 "border-cyan-700 text-cyan-300",
  "4 — Certification Engine":                        "border-emerald-700 text-emerald-300",
  "5 — EF-6.5.0 vs EF-6.6.0 Live Certification":   "border-yellow-700 text-yellow-300",
  "6 — ABE Compliance (no hardcoded lists)":         "border-rose-700 text-rose-300",
};

export default function SprintEF670Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState(null);
  const [activeDemo, setActiveDemo] = useState(null);

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  async function runDemo(type) {
    setActiveDemo(null);
    try {
      const { ArchitectureBaselineEngine } = await import("@/lib/abe/ArchitectureBaselineEngine");
      const { UCRRuntime }        = await import("@/lib/ucr/UCRRuntime");
      const { UCRRegistry }       = await import("@/lib/ucr/UCRRegistry");
      const { UCRCircuitBreaker } = await import("@/lib/ucr/UCRCircuitBreaker");
      const { UCRRateLimiter }    = await import("@/lib/ucr/UCRRateLimiter");
      const { UCRMetricsStore }   = await import("@/lib/ucr/UCRMetricsStore");
      const { TransportRegistry } = await import("@/lib/utl/TransportRegistry");
      const { TransportFactory }  = await import("@/lib/utl/TransportFactory");
      await import("@/lib/ucr/adapters/GmailAdapter");
      const { GmailAdapter }      = await import("@/lib/ucr/adapters/GmailAdapter");
      const { GoogleDriveAdapter }= await import("@/lib/ucr/adapters/GoogleDriveAdapter");

      const infraModules = [
        { id: "UCRRuntime",        path: "@/lib/ucr/UCRRuntime",        obj: UCRRuntime,        sprint: "EF-6.4.0", deps: ["UCRRegistry","UCRPipeline","UCRMetricsStore","UCRCircuitBreaker","UCRRateLimiter"] },
        { id: "UCRRegistry",       path: "@/lib/ucr/UCRRegistry",       obj: UCRRegistry,       sprint: "EF-6.4.0", deps: ["UCRTypes"] },
        { id: "UCRCircuitBreaker", path: "@/lib/ucr/UCRCircuitBreaker", obj: UCRCircuitBreaker, sprint: "EF-6.4.0", deps: [] },
        { id: "UCRRateLimiter",    path: "@/lib/ucr/UCRRateLimiter",    obj: UCRRateLimiter,    sprint: "EF-6.4.0", deps: [] },
        { id: "UCRMetricsStore",   path: "@/lib/ucr/UCRMetricsStore",   obj: UCRMetricsStore,   sprint: "EF-6.4.0", deps: ["UCRCircuitBreaker"] },
        { id: "TransportRegistry", path: "@/lib/utl/TransportRegistry", obj: TransportRegistry, sprint: "EF-6.5.0", deps: [] },
        { id: "TransportFactory",  path: "@/lib/utl/TransportFactory",  obj: TransportFactory,  sprint: "EF-6.5.0", deps: ["TransportRegistry"] },
      ];

      if (type === "baseline") {
        const b = ArchitectureBaselineEngine.capture("EF-6.5.0-demo", "UCR + UTL", infraModules);
        ArchitectureBaselineEngine.save(b);
        setActiveDemo({ type, data: b });
      } else if (type === "certify") {
        const baseline = ArchitectureBaselineEngine.capture("EF-6.5.0-cert", "UCR + UTL", infraModules);
        const withGmail = [
          ...infraModules,
          { id: "GmailAdapter",     path: "@/lib/ucr/adapters/GmailAdapter",     obj: GmailAdapter,       sprint: "EF-6.6.0", deps: ["UCRRuntime"] },
          { id: "GoogleDriveAdapter", path: "@/lib/ucr/adapters/GoogleDriveAdapter", obj: GoogleDriveAdapter, sprint: "EF-6.4.0", deps: ["UCRRuntime"] },
        ];
        const current = ArchitectureBaselineEngine.capture("EF-6.6.0-cert", "UCR+UTL+Gmail", withGmail);
        const cert    = ArchitectureBaselineEngine.certify(baseline, current);
        setActiveDemo({ type, data: cert });
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  const suites = report
    ? [...new Set(report.results.map(r => r.suite))].map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-teal-400 tracking-widest mb-1">ENGINEERING SPRINT EF-6.7.0</div>
          <h1 className="text-3xl font-bold">Architecture Baseline Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Baselines automáticas · Zero listas manuais · Certificação por evidência pura
          </p>
        </div>

        {/* Architecture diagram */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-3">ARQUITETURA DO ABE</div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            {[
              ["BaselineSnapshot",     "Object.entries(module)\n→ exports automáticos\n→ hash por módulo",           "border-violet-700 text-violet-300"],
              ["BaselineSerializer",   "JSON serialize/deserialize\n→ persist: localStorage\n→ load by sprint id",    "border-blue-700 text-blue-300"],
              ["BaselineDiffEngine",   "baseline A vs B\n→ structural diff\n→ auto-classify category",               "border-cyan-700 text-cyan-300"],
              ["CertificationEngine",  "diff → rules → violations\n→ R01-R05 puras\n→ 🟢/🔴 seal",                 "border-emerald-700 text-emerald-300"],
              ["ABETypes",             "ABEBaseline\nABEDiffResult\nABECertificationResult",                         "border-zinc-600 text-zinc-400"],
              ["ArchitectureBaselineEngine","Facade\ncapture → save → diff → certify\n→ única API pública",          "border-teal-700 text-teal-300"],
            ].map(([name, desc, cls]) => (
              <div key={name} className={`border rounded p-3 ${cls}`}>
                <div className="font-bold mb-1">{name}</div>
                <div className="text-zinc-500 whitespace-pre-line text-xs">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance callouts */}
        <div className="border border-teal-800 rounded-lg p-4 bg-teal-950/20 text-xs space-y-1">
          <div className="text-teal-400 font-bold tracking-widest mb-2">CRITÉRIOS DE ACEITE — EVIDÊNCIAS</div>
          {[
            "Nenhuma lista manual — BaselineSnapshot usa Object.entries(obj), nunca arrays fixos",
            "Nenhum expected API — checkAPISurface foi ELIMINADO; agora o hash é gerado automaticamente",
            "Nenhum expected import — grafo de dependências passado pelo caller (runtime) ou omitido",
            "Nenhum expected hash — hashes calculados no momento da captura, nunca hardcoded",
            "Nenhum expected line count — contagem de linhas não faz parte da baseline ABE",
            "Toda baseline gerada automaticamente via captureBaseline(id, label, modules[])",
            "Toda certificação via regras R01-R05 aplicadas ao diff — nenhuma regra cita módulo por nome",
            "ABE pronto para certificar qualquer sprint futura sem modificação",
          ].map((item, i) => (
            <div key={i} className="text-zinc-300">✓ {item}</div>
          ))}
        </div>

        {/* Demo buttons */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={run} disabled={running}
            className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            {running ? "Running ABE Tests…" : "▶  Run Full ABE Test Suite (6 Suites)"}
          </button>
          <button onClick={() => runDemo("baseline")}
            className="bg-violet-700 hover:bg-violet-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            📸 Capture Live Baseline
          </button>
          <button onClick={() => runDemo("certify")}
            className="bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            🏆 Certify EF-6.5.0 → EF-6.6.0
          </button>
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-4 text-red-300 text-sm">Error: {err}</div>}

        {/* Live demo output */}
        {activeDemo && (
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
            {activeDemo.type === "baseline" && (
              <>
                <div className="text-violet-400 font-bold mb-2">📸 BASELINE CAPTURADA — {activeDemo.data.id}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-zinc-500">Módulos</span><span className="text-zinc-300">{activeDemo.data.summary.totalModules}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Exports</span><span className="text-zinc-300">{activeDemo.data.summary.totalExports}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Edges</span><span className="text-zinc-300">{activeDemo.data.summary.totalEdges}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Hash</span><span className="text-emerald-400">{activeDemo.data.summary.baselineHash}</span></div>
                  </div>
                  <div className="space-y-1">
                    {activeDemo.data.modules.map(m => (
                      <div key={m.id} className="flex justify-between">
                        <span className="text-zinc-400">{m.id}</span>
                        <span className="text-zinc-600 font-mono">{m.hash} · {m.exports.length} exports</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {activeDemo.type === "certify" && (
              <>
                <div className={`font-bold mb-3 text-xl ${activeDemo.data.certified ? "text-emerald-400" : "text-red-400"}`}>
                  {activeDemo.data.seal}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-zinc-500">Módulos adicionados</span><span className="text-emerald-400">{activeDemo.data.diff.summary.modulesAdded}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Módulos removidos</span><span className="text-red-400">{activeDemo.data.diff.summary.modulesRemoved}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Hash changes infra</span><span className="text-emerald-400">{activeDemo.data.diff.changes.filter(c => c.kind === "hash_changed" && c.category === "Infraestrutura").length}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Violations</span><span className={activeDemo.data.violations.length === 0 ? "text-emerald-400" : "text-red-400"}>{activeDemo.data.violations.length}</span></div>
                  </div>
                  <div className="space-y-1">
                    {activeDemo.data.diff.changes.map((c, i) => (
                      <div key={i} className={`text-xs ${c.category === "Infraestrutura" ? "text-yellow-400" : "text-zinc-500"}`}>
                        [{c.kind}] {c.module} ({c.category})
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Test summary */}
        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ ABE CERTIFIED — EF-6.7.0" : "✗ TEST SUITE FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
          </div>
        )}

        {/* Suite tables */}
        {suites.map(({ suite, rows }) => {
          const sp = rows.filter(r => r.passed).length;
          const cls = SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300";
          return (
            <div key={suite} className="space-y-1">
              <div className={`border rounded-lg px-4 py-2 flex justify-between bg-zinc-900 ${cls}`}>
                <span className="font-bold text-sm">{suite}</span>
                <span className="text-xs font-mono">{sp}/{rows.length}</span>
              </div>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-500">
                    <tr>
                      <th className="text-left p-2 pl-3 w-96">Test</th>
                      <th className="text-left p-2">Detail</th>
                      <th className="text-center p-2 pr-3 w-14">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                        <td className="p-2 pl-3 text-zinc-300">{r.name}</td>
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

        {/* Rules reference */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-2">REGRAS DE CERTIFICAÇÃO (R01–R05)</div>
          <div className="space-y-2">
            {[
              ["R01", "critical", "Nenhum export de infraestrutura pode ser removido"],
              ["R02", "critical", "Nenhum módulo de infraestrutura pode ser removido"],
              ["R03", "warning",  "Hash changes em infraestrutura devem ser revisados"],
              ["R04", "critical", "Módulos de infraestrutura não podem ganhar novas dependências"],
              ["R05", "critical", "Assinaturas de exports de infraestrutura não podem mudar"],
            ].map(([id, sev, desc]) => (
              <div key={id} className="flex gap-3 items-start">
                <span className={`font-bold ${sev === "critical" ? "text-red-400" : "text-yellow-400"}`}>{id}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${sev === "critical" ? "border-red-800 text-red-400 bg-red-950/30" : "border-yellow-800 text-yellow-400 bg-yellow-950/20"}`}>{sev}</span>
                <span className="text-zinc-400">{desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-zinc-600 text-xs">
            As regras são funções puras que operam sobre diff.changes[].category — nenhuma regra cita um módulo por nome.
          </div>
        </div>

      </div>
    </div>
  );
}