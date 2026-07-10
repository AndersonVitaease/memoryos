import React, { useState, useCallback, useEffect } from "react";
import { globalRegistry } from "@/lib/review/registry/ReviewEngineRegistry";
import { reviewEventBus } from "@/lib/review/registry/ReviewEventBus";
import { reviewHistory  } from "@/lib/review/registry/ReviewHistoryStore";
import { runRegistryTests } from "@/lib/review/registry/registryTests";
import { bootstrapDefaultRegistry } from "@/lib/review/registry/defaultRegistry";
import {
  CheckCircle, XCircle, AlertTriangle, Play, RotateCcw,
  Layers, Clock, Shield, Activity, FlaskConical, ChevronRight
} from "lucide-react";

bootstrapDefaultRegistry();

// ─── UI Primitives ────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const cls = {
    green:  "bg-green-900/40 text-green-300 border-green-700",
    red:    "bg-red-900/40 text-red-300 border-red-700",
    yellow: "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    violet: "bg-violet-900/40 text-violet-300 border-violet-700",
    blue:   "bg-blue-900/40 text-blue-300 border-blue-700",
    zinc:   "bg-zinc-800 text-zinc-400 border-zinc-700",
    orange: "bg-orange-900/40 text-orange-300 border-orange-700",
  };
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${cls[color] ?? cls.zinc}`}>{label}</span>;
}

function Section({ title, icon: Icon, iconColor = "text-violet-400", children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Icon size={14} className={iconColor} />
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const PRIORITY_COLOR = { Critical: "red", High: "orange", Normal: "violet", Low: "zinc" };
const CATEGORY_COLOR = { Testing: "blue", Quality: "green", Architecture: "yellow", Security: "red", Performance: "orange", Custom: "zinc" };

const TABS = [
  { id: "registry",  label: "Registry" },
  { id: "events",    label: "Eventos" },
  { id: "history",   label: "Histórico" },
  { id: "tests",     label: "Testes" },
];

export default function ReviewEngineRegistryPage() {
  const [tab, setTab]         = useState("registry");
  const [entries, setEntries] = useState([]);
  const [events, setEvents]   = useState([]);
  const [history, setHistory] = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(() => {
    setEntries(globalRegistry.listAll());
    setEvents(reviewEventBus.getHistory().slice(-50).reverse());
    setHistory(reviewHistory.getAll());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = reviewEventBus.subscribe(() => refresh());
    return unsub;
  }, [refresh]);

  const runTests = async () => {
    setTesting(true);
    const r = await runRegistryTests();
    setTestResults(r);
    setTesting(false);
    refresh();
  };

  const passed = testResults?.filter(r => r.passed).length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shrink-0">
            <Layers size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base md:text-lg">Review Engine Registry</h1>
            <p className="text-zinc-500 text-xs">Engineering Infrastructure · Foundation v1.0 · Pluggable Analyzers</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["ReviewEngine","Registry","EventBus","HistoryStore","Pipeline"].map(b => (
                <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Engines", value: entries.length, sub: `${entries.filter(e => e.active).length} ativos` },
            { label: "Eventos", value: reviewEventBus.getHistory().length, sub: "publicados" },
            { label: "Reviews", value: history.length, sub: "histórico" },
            { label: "Testes",  value: testResults ? `${passed}/${testResults.length}` : "—", sub: "registry tests" },
          ].map(m => (
            <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{m.value}</div>
              <div className="text-xs text-zinc-400">{m.label}</div>
              <div className="text-xs text-zinc-600">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); refresh(); }}
              className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex-1 ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── REGISTRY ─────────────────────────────────────────────────────── */}
        {tab === "registry" && (
          <Section title="Engines Registrados" icon={Layers} iconColor="text-violet-400">
            {entries.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">Nenhum engine registrado</p>}
            <div className="space-y-2">
              {entries.map(({ engine, active, registeredAt }) => (
                <div key={engine.id} className={`border rounded-xl p-3 ${active ? "border-zinc-700 bg-zinc-800/30" : "border-zinc-800 opacity-50"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-200">{engine.name}</span>
                        <Badge label={`v${engine.version}`} color="zinc" />
                        {!active && <Badge label="DISABLED" color="zinc" />}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 font-mono">{engine.id}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge label={engine.priority} color={PRIORITY_COLOR[engine.priority] ?? "zinc"} />
                      <Badge label={engine.category} color={CATEGORY_COLOR[engine.category] ?? "zinc"} />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">
                    Registrado: {new Date(registeredAt).toLocaleTimeString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-zinc-800/30 border border-zinc-700 rounded-xl p-3">
              <p className="text-xs text-zinc-400 font-semibold mb-2">Como adicionar um novo engine:</p>
              <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap">{`import { globalRegistry } from "@/lib/review/registry/ReviewEngineRegistry";

class MyAnalyzer implements ReviewEngine {
  id = "my-analyzer";
  name = "My Analyzer";
  version = "1.0.0";
  category = "Performance";
  priority = "Normal";
  async execute(ctx) { ... }
}

globalRegistry.register(new MyAnalyzer());
// → aparece automaticamente no próximo runRegistryPipeline()`}</pre>
            </div>
          </Section>
        )}

        {/* ── EVENTS ───────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <Section title="Event Bus — Histórico de Eventos" icon={Activity} iconColor="text-blue-400">
            {events.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">Nenhum evento publicado ainda</p>}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map(e => {
                const color = e.type.includes("Completed") || e.type.includes("Approved") ? "text-green-400"
                  : e.type.includes("Failed") || e.type.includes("Rejected") ? "text-red-400"
                  : e.type.includes("Started") ? "text-blue-400"
                  : "text-zinc-400";
                return (
                  <div key={e.id} className="flex items-start gap-3 py-1.5 border-b border-zinc-800/30 last:border-0">
                    <span className={`text-xs font-mono shrink-0 w-36 ${color}`}>{e.type}</span>
                    <span className="text-xs text-zinc-400 shrink-0">{e.sprint}</span>
                    {e.engineName && <span className="text-xs text-zinc-600">{e.engineName}</span>}
                    <span className="text-xs text-zinc-700 ml-auto shrink-0">{new Date(e.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── HISTORY ──────────────────────────────────────────────────────── */}
        {tab === "history" && (
          <Section title="Histórico de Reviews" icon={Clock} iconColor="text-orange-400">
            {history.length === 0 && (
              <div className="text-center py-8">
                <Clock size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Nenhum review executado ainda</p>
                <p className="text-zinc-600 text-xs mt-1">Execute uma revisão na aba Sprint 1 Review para criar o histórico</p>
              </div>
            )}
            <div className="space-y-2">
              {history.map(e => (
                <div key={e.reviewId} className={`border rounded-xl p-3 ${e.status === "APPROVED" ? "border-green-800/50 bg-green-950/10" : "border-red-800/50 bg-red-950/10"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.status === "APPROVED"
                          ? <CheckCircle size={13} className="text-green-400" />
                          : <XCircle size={13} className="text-red-400" />}
                        <span className="text-sm font-semibold text-zinc-200">{e.sprintLabel}</span>
                      </div>
                      <p className="text-xs text-zinc-600 mt-0.5 font-mono">{e.reviewId}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap text-right">
                      <Badge label={e.status} color={e.status === "APPROVED" ? "green" : "red"} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div className="text-center">
                      <div className="text-sm font-bold text-white">{e.passRate.toFixed(0)}%</div>
                      <div className="text-xs text-zinc-500">Pass Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-white">{e.coverage.toFixed(0)}%</div>
                      <div className="text-xs text-zinc-500">Cobertura</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-white">{e.overallScore}</div>
                      <div className="text-xs text-zinc-500">MERS Score</div>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">{new Date(e.timestamp).toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── TESTS ────────────────────────────────────────────────────────── */}
        {tab === "tests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-zinc-400">Testes do Registry · Pipeline · EventBus · HistoryStore · Engine wrappers</p>
              <button onClick={runTests} disabled={testing}
                className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                {testing ? <><RotateCcw size={12} className="animate-spin" />Testando...</> : <><FlaskConical size={12} />Executar Testes</>}
              </button>
            </div>

            {testResults && (
              <>
                <div className={`rounded-xl border p-3 flex items-center gap-3 ${passed === testResults.length ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
                  {passed === testResults.length
                    ? <CheckCircle size={18} className="text-green-400 shrink-0" />
                    : <XCircle size={18} className="text-red-400 shrink-0" />}
                  <p className={`text-sm font-bold ${passed === testResults.length ? "text-green-300" : "text-red-300"}`}>
                    {passed}/{testResults.length} testes aprovados
                  </p>
                </div>

                <Section title="Resultados" icon={FlaskConical} iconColor="text-violet-400">
                  {testResults.map(r => (
                    <div key={r.name} className="flex items-start gap-2 py-1.5 border-b border-zinc-800/30 last:border-0">
                      {r.passed ? <CheckCircle size={11} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />}
                      <span className="text-xs text-zinc-300 flex-1">{r.name}</span>
                      <span className="text-xs text-zinc-600 font-mono shrink-0">{r.durationMs.toFixed(2)}ms</span>
                      {r.error && <span className="text-xs text-red-400 font-mono max-w-xs truncate">{r.error}</span>}
                    </div>
                  ))}
                </Section>
              </>
            )}

            {!testResults && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <FlaskConical size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Clique em "Executar Testes" para validar toda a infraestrutura</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}