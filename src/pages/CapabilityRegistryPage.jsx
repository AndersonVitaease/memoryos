// CapabilityRegistryPage.jsx
// Foundation v1.0 · Engineering First · Sprint EF-14

import React, { useState, useCallback } from "react";
import { runCapabilityRegistryTests } from "@/lib/capability-registry/capabilityRegistryTests";

function Badge({ label, style }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  const isHardening = r.name.startsWith("[Hardening]");
  const hasExtra    = r.detail || r.error;
  const passBadge   = r.passed
    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
    : "bg-red-900/50 text-red-300 border-red-700";
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2.5 px-3 text-left">
        <Badge label={r.passed ? "PASS" : "FAIL"} style={passBadge} />
        <span className="text-zinc-500 font-mono text-xs w-5 shrink-0 mt-0.5">C{r.criterion}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${r.passed ? "text-zinc-200" : "text-red-300"}`}>{r.name}</p>
          {isHardening && <span className="text-xs text-violet-400 font-mono">hardening</span>}
        </div>
        <span className="text-zinc-600 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700 space-y-1">
          {r.detail && r.detail !== "OK" && <p className="text-xs text-zinc-400">{r.detail}</p>}
          {r.error  && <p className="text-xs text-red-400 font-mono">error: {r.error}</p>}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "results",    label: "Criterios"   },
  { id: "statistics", label: "Estatisticas"},
  { id: "health",     label: "Health"      },
  { id: "metrics",    label: "Metricas"    },
  { id: "catalog",    label: "Catalogo"    },
  { id: "arch",       label: "Arquitetura" },
];

const CATEGORIES = ["SYSTEM","MEMORY","KNOWLEDGE","LEARNING","COMMUNICATION","FILE","CONNECTOR","SPECIALIST","UTILITY"];

const ARCH_NODES = [
  ["Goal Runtime v0.1",          "bg-blue-900/60 text-blue-300 border-blue-700"],
  ["Decision Engine v1.0",       "bg-indigo-900/60 text-indigo-300 border-indigo-700"],
  ["Planning Engine v1.0",       "bg-violet-900/60 text-violet-300 border-violet-700"],
  ["Capability Registry v1.0",   "bg-amber-900/60 text-amber-300 border-amber-600 ring-2 ring-amber-500"],
  ["Capability Runtime",         "bg-zinc-800 text-zinc-300 border-zinc-600"],
  ["Capability",                 "bg-zinc-800 text-zinc-400 border-zinc-700"],
  ["ExecutionResult",            "bg-zinc-800 text-zinc-400 border-zinc-700"],
  ["Reflection Engine v1.0",     "bg-purple-900/60 text-purple-300 border-purple-700"],
  ["Self Evaluation v1.0",       "bg-fuchsia-900/60 text-fuchsia-300 border-fuchsia-700"],
  ["Knowledge Engine v1.0",      "bg-pink-900/60 text-pink-300 border-pink-700"],
  ["Learning Engine v1.0",       "bg-rose-900/60 text-rose-300 border-rose-700"],
  ["Memory Engine v1.0",         "bg-orange-900/60 text-orange-300 border-orange-700"],
  ["Retrieval Engine v1.0",      "bg-emerald-900/60 text-emerald-300 border-emerald-700"],
];

const NEXT_SPRINTS = [
  { id: "EF-15", label: "Capability Runtime v2.0",        color: "text-amber-400" },
  { id: "EF-16", label: "Connector Runtime v1.0",         color: "text-cyan-400"  },
  { id: "EF-17", label: "Connector SDK v1.0",             color: "text-sky-400"   },
  { id: "EF-18", label: "Primeiros Connectors Oficiais",  color: "text-violet-400"},
];

export default function CapabilityRegistryPage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [error, setError]         = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runCapabilityRegistryTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setRunning(false); }
  }, []);

  const allPass    = data && data.passed === data.total;
  const failedOnly = data?.results.filter(r => !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-950/60 to-yellow-950/60 border border-amber-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-amber-400">Capability Registry v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">Sprint EF-14</span>
              </div>
              <h1 className="text-lg font-bold text-white">Capability Catalog & Discovery</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                register · resolve · validate · list · statistics · metrics · health
              </p>
              <p className="text-zinc-500 text-xs mt-1">18 criterios + 10 hardening = 28 cenarios</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? "Executando..." : "Executar Registry v1.0"}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Pass"  value={data.passed}                    color="text-emerald-400" />
              <Metric label="Fail"  value={data.total - data.passed}       color={data.total - data.passed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total" value={data.total}                     color="text-zinc-200" />
              <Metric label="Tempo" value={`${data.durationMs}ms`}        color="text-amber-400" />
            </div>
          )}
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-amber-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">register → resolve → validate → list → categories → versions → tags → health...</p>
            <p className="text-zinc-600 text-xs mt-1">18 criterios + 10 hardening</p>
          </div>
        )}

        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro durante execucao</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {data && !running && (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border-2 p-3 ${allPass ? "bg-emerald-950/30 border-emerald-700" : "bg-red-950/30 border-red-800"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  label={allPass ? "CAPABILITY REGISTRY v1.0 — PASS" : "CAPABILITY REGISTRY v1.0 — FAIL"}
                  style={allPass
                    ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    : "bg-red-900/60 text-red-300 border-red-700"}
                />
                <p className={`text-sm font-bold ${allPass ? "text-emerald-300" : "text-red-300"}`}>
                  {allPass ? "Registry certificado." : `${data.total - data.passed} criterio(s) reprovado(s).`}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge label={data.health.status}
                  style={data.health.status === "SUCCESS"
                    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                    : "bg-red-900/50 text-red-300 border-red-700"} />
                <span className="text-xs text-zinc-500 font-mono">{data.health.details}</span>
              </div>
              {!allPass && failedOnly.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {failedOnly.map(r => (
                    <p key={r.criterion} className="text-xs text-red-400 font-mono pl-2">C{r.criterion}: {r.name}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === t.id ? "bg-amber-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Criterios */}
            {activeTab === "results" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">28 Cenarios (18 aceitacao + 10 hardening)</span>
                  <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                    {data.passed}/{data.total}
                  </span>
                </div>
                {data.results.map(r => <TestRow key={r.criterion} r={r} />)}
              </div>
            )}

            {/* Estatisticas */}
            {activeTab === "statistics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Total"       value={data.statistics.totalCapabilities}   color="text-amber-400" />
                  <Metric label="Ativos"      value={data.statistics.activeCapabilities}  color="text-emerald-400" />
                  <Metric label="Inativos"    value={data.statistics.inactiveCapabilities} color="text-zinc-400" />
                  <Metric label="Versoes"     value={data.statistics.versions}            color="text-sky-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Registros"  value={data.statistics.registrations} color="text-zinc-200" />
                  <Metric label="Updates"    value={data.statistics.updates}       color="text-zinc-200" />
                  <Metric label="Removidos"  value={data.statistics.removals}      color="text-zinc-200" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Por Categoria</p>
                  {CATEGORIES.map(cat => {
                    const count = data.statistics.categories[cat] ?? 0;
                    return (
                      <div key={cat} className="flex items-center gap-3 text-xs mb-1.5">
                        <span className="font-mono w-24 shrink-0 text-amber-300">{cat}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-600 rounded-full"
                            style={{ width: data.statistics.totalCapabilities > 0
                              ? `${(count / data.statistics.totalCapabilities) * 100}%` : "0%" }} />
                        </div>
                        <span className="text-zinc-400 w-5 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Health */}
            {activeTab === "health" && (
              <div className="space-y-3">
                <div className={`rounded-xl border p-4 ${data.health.status === "SUCCESS" ? "bg-emerald-950/20 border-emerald-800" : "bg-red-950/20 border-red-800"}`}>
                  <Badge label={`HEALTH: ${data.health.status}`}
                    style={data.health.status === "SUCCESS"
                      ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                      : "bg-red-900/60 text-red-300 border-red-700"} />
                  <p className="text-xs text-zinc-400 font-mono mt-2">{data.health.details}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Health Checks</p>
                  {Object.entries(data.health.checks).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-xs">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${v === true ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="text-zinc-300 font-mono flex-1">{k}</span>
                      <span className={`font-bold ${v === true ? "text-emerald-400" : "text-red-400"}`}>
                        {typeof v === "boolean" ? (v ? "OK" : "FAIL") : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metricas */}
            {activeTab === "metrics" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Register"   value={data.metrics.registerTotal}   color="text-amber-400" />
                  <Metric label="Resolve"    value={data.metrics.resolveTotal}    color="text-sky-400" />
                  <Metric label="Validate"   value={data.metrics.validationTotal} color="text-violet-400" />
                  <Metric label="Erros"      value={data.metrics.errorTotal}      color="text-red-400" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric label="Unregister" value={data.metrics.unregisterTotal}   color="text-zinc-300" />
                  <Metric label="Update"     value={data.metrics.updateTotal}        color="text-zinc-300" />
                  <Metric label="Avg Resolve" value={`${data.metrics.avgResolveTime}ms`} color="text-zinc-300" />
                  <Metric label="Avg Valid"  value={`${data.metrics.avgValidationTime}ms`} color="text-zinc-300" />
                </div>
              </div>
            )}

            {/* Catalogo */}
            {activeTab === "catalog" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Categorias Suportadas</p>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map(cat => (
                      <div key={cat} className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center">
                        <span className="text-amber-300 text-xs font-mono font-bold">{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">CapabilityDescriptor — Campos Obrigatorios</p>
                  {["id","name","version","category","description","inputSchema","outputSchema","permissions","status","tags","owner","scope","visibility","createdAt","updatedAt"].map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-amber-300 font-mono">{f}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Proximas Sprints</p>
                  {NEXT_SPRINTS.map(s => (
                    <div key={s.id} className="flex items-center gap-3 text-xs mb-2">
                      <span className="text-zinc-600 font-mono w-12 shrink-0">{s.id}</span>
                      <span className={`font-medium ${s.color}`}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Arquitetura */}
            {activeTab === "arch" && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline Cognitivo Completo</p>
                  <div className="flex flex-col items-center gap-0">
                    {ARCH_NODES.map(([label, cls], i, arr) => (
                      <React.Fragment key={label}>
                        <div className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border w-56 text-center ${cls}`}>
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="text-zinc-700 text-base leading-none my-0.5">↓</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Fluxo de Resolucao</p>
                  {[
                    ["ExecutionPlan",        "requisita Capability pelo nome/id"],
                    ["Capability Runtime",   "chama registry.resolve()"],
                    ["Capability Registry",  "retorna CapabilityDescriptor"],
                    ["Capability Runtime",   "instancia e executa a Capability"],
                  ].map(([comp, desc], i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <span className={`font-mono w-36 shrink-0 ${comp === "Capability Registry" ? "text-amber-300" : "text-zinc-400"}`}>{comp}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="text-zinc-400">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Responsabilidade Unica</p>
                  {[
                    { ok: true,  txt: "Registrar, resolver, validar, catalogar Capabilities" },
                    { ok: false, txt: "Executar Capabilities" },
                    { ok: false, txt: "Criar Goals ou Plans" },
                    { ok: false, txt: "Modificar Memory, Learning, Knowledge" },
                    { ok: false, txt: "Conhecer Connectors" },
                    { ok: false, txt: "Acessar banco de dados" },
                    { ok: false, txt: "Utilizar IA" },
                  ].map(({ ok, txt }, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <span className={`shrink-0 ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
                      {txt}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Capability Registry v1.0 — Catalog & Discovery</p>
            <p className="text-zinc-600 text-xs">register · resolve · validate · list · categories · versions · tags</p>
            <p className="text-zinc-700 text-xs mt-1">Sprint EF-14 · Foundation v1.0 · Engineering First</p>
          </div>
        )}
      </div>
    </div>
  );
}