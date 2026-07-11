import React, { useState, useCallback } from "react";
import { runConnectorRuntimeTests } from "@/lib/connector-runtime";
import { runBase44ConnectorTests } from "@/lib/connector-runtime";
import { CheckCircle, XCircle, Play, RotateCcw, Plug, AlertTriangle, Info, Activity } from "lucide-react";

// ── Shared primitives ─────────────────────────────────────────────────────────

const STATUS_COLOR = {
  SUCCESS:   "bg-green-900/40 text-green-300 border-green-700",
  FAILED:    "bg-red-900/40 text-red-300 border-red-700",
  DENIED:    "bg-orange-900/40 text-orange-300 border-orange-700",
  TIMEOUT:   "bg-yellow-900/40 text-yellow-300 border-yellow-700",
  CANCELLED: "bg-zinc-800 text-zinc-400 border-zinc-600",
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${STATUS_COLOR[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
      {status}
    </span>
  );
}

function RunButton({ onClick, running, label = "Executar" }) {
  return (
    <button
      onClick={onClick}
      disabled={running}
      className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
    >
      {running
        ? <><RotateCcw size={14} className="animate-spin" />Executando...</>
        : <><Play size={14} />{label}</>}
    </button>
  );
}

function SummaryBanner({ passed, total, totalMs }) {
  const allPass = passed === total;
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${allPass ? "bg-green-950/20 border-green-800" : "bg-red-950/20 border-red-800"}`}>
      {allPass ? <CheckCircle size={22} className="text-green-400 shrink-0" /> : <XCircle size={22} className="text-red-400 shrink-0" />}
      <div className="flex-1">
        <p className={`font-bold text-sm ${allPass ? "text-green-300" : "text-red-300"}`}>
          {allPass ? "Todos os testes passaram" : `${total - passed} teste(s) falharam`}
        </p>
        <p className="text-zinc-400 text-xs mt-0.5">{passed}/{total} passou · {totalMs}ms total</p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-2xl font-bold font-mono text-white">{Math.round((passed / total) * 100)}%</div>
        <div className="text-xs text-zinc-500">pass rate</div>
      </div>
    </div>
  );
}

function MetricsStrip({ passed, total }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
        <div className="text-xl font-bold text-green-400">{passed}</div>
        <div className="text-xs text-zinc-500">Passou</div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
        <div className="text-xl font-bold text-red-400">{total - passed}</div>
        <div className="text-xs text-zinc-500">Falhou</div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
        <div className="text-xl font-bold text-zinc-300">{total}</div>
        <div className="text-xs text-zinc-500">Total</div>
      </div>
    </div>
  );
}

function ObservationBox({ results }) {
  const obs = results.filter(r => r.observation);
  if (!obs.length) return null;
  return (
    <div className="bg-zinc-900 border border-yellow-800/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-yellow-400" />
        <span className="text-xs font-semibold text-yellow-300">Observacoes para Engineering Review</span>
      </div>
      {obs.map((r, i) => (
        <div key={i} className="mt-1.5">
          <p className="text-xs font-medium text-zinc-300">{r.scenario ?? `Criterio ${r.criterion}`} — {r.name}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{r.observation}</p>
        </div>
      ))}
    </div>
  );
}

// ── Tab 1: Runtime Validation (7 cenarios) ────────────────────────────────────

function RuntimeValidationTab() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true); setResults(null);
    const r = await runConnectorRuntimeTests();
    setResults(r); setRunning(false);
  }, []);

  const passed  = results?.filter(r => r.passed).length ?? 0;
  const total   = results?.length ?? 0;
  const totalMs = results?.reduce((a, r) => a + r.durationMs, 0) ?? 0;
  const hasObs  = results?.some(r => r.observation);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">7 cenarios — SUCCESS · FAILED · DENIED · TIMEOUT · CANCELLED</p>
        <RunButton onClick={run} running={running} label="Executar 7 Cenarios" />
      </div>

      {!running && !results && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <Plug size={28} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">Validacao arquitetural do Connector Runtime</p>
        </div>
      )}

      {running && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <RotateCcw size={28} className="text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Executando cenarios de validacao...</p>
        </div>
      )}

      {results && (
        <>
          <SummaryBanner passed={passed} total={total} totalMs={totalMs} />
          <MetricsStrip passed={passed} total={total} />

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-300">Cenarios de Validacao</span>
            </div>
            {results.map((r, i) => (
              <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-3 space-y-1.5">
                <div className="flex items-start gap-3">
                  {r.passed
                    ? <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
                    : <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200 font-medium">{r.name}</p>
                    {r.detail && <p className="text-xs text-zinc-500 mt-0.5">{r.detail}</p>}
                    {r.error && <p className="text-xs text-red-400 mt-0.5 font-mono">{r.error}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.expectedStatus && r.actualStatus && (
                      <div className="flex items-center gap-1 text-xs text-zinc-600">
                        <span>esp.</span>
                        <StatusBadge status={r.expectedStatus} />
                        <span>obt.</span>
                        <StatusBadge status={r.actualStatus} />
                      </div>
                    )}
                    <span className="text-xs text-zinc-600 font-mono">{r.durationMs}ms</span>
                  </div>
                </div>
                {r.observation && (
                  <div className="ml-5 bg-yellow-950/20 border border-yellow-800/40 rounded-lg px-3 py-2 flex gap-2">
                    <AlertTriangle size={12} className="text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">{r.observation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {hasObs && <ObservationBox results={results} />}

          {/* Criterio Final */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Info size={14} className="text-blue-400" />
              <span className="text-xs font-semibold text-zinc-200">Criterio Final — Engineering First</span>
            </div>
            {[
              { q: "1. O Connector Runtime esta funcional?",             a: passed === total ? "SIM" : "NAO",  ok: passed === total },
              { q: "2. A arquitetura suportou todos os testes?",         a: passed === total ? "SIM" : "NAO",  ok: passed === total },
              { q: "3. Foi identificada alguma limitacao arquitetural?",  a: hasObs           ? "SIM" : "NAO",  ok: !hasObs },
            ].map(({ q, a, ok }) => (
              <div key={q} className="flex items-start justify-between gap-3 border-b border-zinc-800/40 last:border-0 pb-2 last:pb-0">
                <p className="text-xs text-zinc-300">{q}</p>
                <span className={`text-xs font-bold font-mono shrink-0 ${ok ? "text-green-400" : "text-yellow-400"}`}>{a}</span>
              </div>
            ))}
            {hasObs && (
              <p className="text-xs text-zinc-500 pt-1">
                <span className="text-yellow-400 font-semibold">4. Evidencia: </span>
                O runtime nao possui mecanismo de cancelamento em voo. CANCELLED e produzido apenas via buildCancelledResult() antes da chamada. Registrado para Engineering Review.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 2: Base44 Connector Sprint (8 criterios reais) ────────────────────────

function Base44SprintTab() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true); setResults(null);
    const r = await runBase44ConnectorTests();
    setResults(r); setRunning(false);
  }, []);

  const passed  = results?.filter(r => r.passed).length ?? 0;
  const total   = results?.length ?? 0;
  const totalMs = results?.reduce((a, r) => a + r.durationMs, 0) ?? 0;
  const allPass = results && passed === total;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-zinc-300 font-semibold">Base44 Connector — Primeira Implementacao Real</p>
          <p className="text-xs text-zinc-500 mt-0.5">8 criterios · auth · conectividade · dados · health · logs · metricas</p>
        </div>
        <RunButton onClick={run} running={running} label="Executar Sprint" />
      </div>

      {/* Connector info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Connector", value: "base44" },
          { label: "Versao", value: "0.2.0" },
          { label: "Criterios", value: "8" },
          { label: "Tipo", value: "Read-only" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className="text-sm font-bold text-white font-mono">{value}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Operations */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-2">Operacoes Implementadas</p>
        <div className="flex flex-wrap gap-1.5">
          {["auth.me","auth.validate","app.info","projects.list","sessions.list","connectivity.ping"].map(op => (
            <span key={op} className="text-xs font-mono bg-cyan-900/30 text-cyan-300 border border-cyan-800/50 px-2 py-0.5 rounded">{op}</span>
          ))}
        </div>
      </div>

      {!running && !results && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <Activity size={28} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">Pronto para executar integracao real com o Base44</p>
          <p className="text-zinc-600 text-xs mt-1">Dados reais — usuarios, projetos e sessoes do ambiente</p>
        </div>
      )}

      {running && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <RotateCcw size={28} className="text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Conectando ao Base44 e executando operacoes reais...</p>
        </div>
      )}

      {results && (
        <>
          <SummaryBanner passed={passed} total={total} totalMs={totalMs} />

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
              <span className="text-xs font-semibold text-zinc-300">Criterios de Aceitacao</span>
              <span className="text-xs text-zinc-500">{passed}/{total}</span>
            </div>
            {results.map((r) => (
              <div key={r.criterion} className="border-b border-zinc-800/40 last:border-0 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">
                    {r.criterion}
                  </div>
                  {r.passed
                    ? <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
                    : <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200 font-medium">{r.name}</p>
                    {r.detail && <p className="text-xs text-zinc-500 mt-0.5">{r.detail}</p>}
                    {r.error && <p className="text-xs text-red-400 mt-0.5 font-mono break-all">{r.error}</p>}
                    {r.observation && (
                      <div className="mt-1.5 bg-yellow-950/20 border border-yellow-800/40 rounded-lg px-3 py-2 flex gap-2">
                        <AlertTriangle size={12} className="text-yellow-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-300">{r.observation}</p>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600 font-mono shrink-0">{r.durationMs}ms</span>
                </div>

                {/* Data preview */}
                {r.passed && r.data && (
                  <div className="ml-9 mt-1.5 bg-zinc-800/40 rounded-lg px-3 py-2">
                    <pre className="text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(r.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sprint verdict */}
          <div className={`rounded-2xl border-2 p-6 text-center ${allPass ? "bg-gradient-to-br from-green-950 to-emerald-950 border-green-700" : "bg-gradient-to-br from-red-950 to-zinc-950 border-red-700"}`}>
            {allPass ? <CheckCircle size={36} className="text-green-400 mx-auto mb-3" /> : <XCircle size={36} className="text-red-400 mx-auto mb-3" />}
            <p className={`font-black text-lg mb-2 ${allPass ? "text-green-300" : "text-red-300"}`}>
              {allPass ? "Sprint Concluida com Sucesso" : "Sprint Requer Atencao"}
            </p>
            {allPass && (
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Primeira evidencia confirmada: a Foundation v1.0 e capaz de integrar sistemas reais
                utilizando o Connector Runtime. Base44Connector v0.2.0 operacional em ambiente real.
              </p>
            )}
            {!allPass && (
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                {total - passed} criterio(s) nao atendido(s). Revisar erros acima. Limitacoes devem ser
                registradas como evidencias para Engineering Review conforme Engineering First.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "runtime",  label: "Runtime — 7 Cenarios" },
  { id: "sprint",   label: "Base44 Sprint — Real" },
];

export default function ConnectorRuntimePage() {
  const [tab, setTab] = useState("sprint");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shrink-0">
            <Plug size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">Connector Runtime</h1>
            <p className="text-zinc-500 text-xs">Engineering First · Foundation v1.0 · Validacao Arquitetural</p>
          </div>
        </div>

        {/* Components badge strip */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
          {["ConnectorRuntime","ConnectorRegistry","ConnectorLoader","ConnectorExecutor","PolicyEngine","Base44Connector"].map(c => (
            <div key={c} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-500 text-center truncate">{c}</div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-cyan-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "runtime" && <RuntimeValidationTab />}
        {tab === "sprint"  && <Base44SprintTab />}

      </div>
    </div>
  );
}