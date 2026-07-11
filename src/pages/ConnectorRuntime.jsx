import { useState, useCallback } from "react";
import {
  runConnectorRuntimeTests,
  runBase44ConnectorTests,
  runBase44HardeningTests,
  summarizeHardeningMetrics,
  runGitHubConnectorTests,
  runGitHubHardeningTests,
} from "@/lib/connector-runtime";
import {
  CheckCircle, XCircle, Play, RotateCcw, Plug, AlertTriangle,
  Info, Activity, ShieldCheck, Github, Wifi,
} from "lucide-react";

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

// ── Tab 1: Runtime Validation ─────────────────────────────────────────────────

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
                        <span>esp.</span><StatusBadge status={r.expectedStatus} />
                        <span>obt.</span><StatusBadge status={r.actualStatus} />
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

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Info size={14} className="text-blue-400" />
              <span className="text-xs font-semibold text-zinc-200">Criterio Final — Engineering First</span>
            </div>
            {[
              { q: "1. O Connector Runtime esta funcional?",             ok: passed === total },
              { q: "2. A arquitetura suportou todos os testes?",         ok: passed === total },
              { q: "3. Foi identificada alguma limitacao arquitetural?",  ok: !hasObs },
            ].map(({ q, ok }) => (
              <div key={q} className="flex items-start justify-between gap-3 border-b border-zinc-800/40 last:border-0 pb-2 last:pb-0">
                <p className="text-xs text-zinc-300">{q}</p>
                <span className={`text-xs font-bold font-mono shrink-0 ${ok ? "text-green-400" : "text-yellow-400"}`}>{ok ? "SIM" : "NAO"}</span>
              </div>
            ))}
            {hasObs && (
              <p className="text-xs text-zinc-500 pt-1">
                <span className="text-yellow-400 font-semibold">Evidencia: </span>
                O runtime nao possui mecanismo de cancelamento em voo. CANCELLED e produzido apenas via buildCancelledResult() antes da chamada. Registrado para Engineering Review.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 2: Base44 Sprint ──────────────────────────────────────────────────────

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
          <p className="text-xs text-zinc-300 font-semibold">Base44 Connector — Implementacao de Referencia</p>
          <p className="text-xs text-zinc-500 mt-0.5">8 criterios · auth · conectividade · dados · health · logs · metricas</p>
        </div>
        <RunButton onClick={run} running={running} label="Executar Sprint" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Connector", value: "base44" },
          { label: "Versao", value: "0.3.0" },
          { label: "Criterios", value: "8" },
          { label: "Tipo", value: "Read-only" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className="text-sm font-bold text-white font-mono">{value}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-2">Operacoes</p>
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
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">{r.criterion}</div>
                  {r.passed ? <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
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
                {r.passed && r.data && (
                  <div className="ml-9 mt-1.5 bg-zinc-800/40 rounded-lg px-3 py-2">
                    <pre className="text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(r.data, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={`rounded-2xl border-2 p-6 text-center ${allPass ? "bg-gradient-to-br from-green-950 to-emerald-950 border-green-700" : "bg-gradient-to-br from-red-950 to-zinc-950 border-red-700"}`}>
            {allPass ? <CheckCircle size={36} className="text-green-400 mx-auto mb-3" /> : <XCircle size={36} className="text-red-400 mx-auto mb-3" />}
            <p className={`font-black text-lg mb-2 ${allPass ? "text-green-300" : "text-red-300"}`}>
              {allPass ? "Sprint Concluida com Sucesso" : "Sprint Requer Atencao"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 3: Hardening Base44 ───────────────────────────────────────────────────

const CATEGORY_COLOR = {
  validation: "text-yellow-400", auth: "text-orange-400",
  external: "text-red-400", internal: "text-red-500", success: "text-green-400",
};
const CATEGORY_BADGE = {
  validation: "bg-yellow-900/30 text-yellow-300 border-yellow-800/50",
  auth: "bg-orange-900/30 text-orange-300 border-orange-800/50",
  external: "bg-red-900/30 text-red-300 border-red-800/50",
  internal: "bg-red-900/40 text-red-300 border-red-700",
  success: "bg-green-900/30 text-green-300 border-green-800/50",
};

function HardeningTab() {
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true); setResults(null); setSummary(null);
    const r = await runBase44HardeningTests();
    setResults(r);
    setSummary(summarizeHardeningMetrics(r));
    setRunning(false);
  }, []);

  const passed  = results?.filter(r => r.passed).length ?? 0;
  const total   = results?.length ?? 0;
  const allPass = results && passed === total;
  const escaped = summary?.exceptionsEscaped ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-zinc-300 font-semibold">Base44 Connector — Hardening v0.3.0</p>
          <p className="text-xs text-zinc-500 mt-0.5">8 cenarios · null · incompleto · tipo inesperado · timeout · auth · API error · valido</p>
        </div>
        <RunButton onClick={run} running={running} label="Executar Hardening" />
      </div>

      {!running && !results && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <ShieldCheck size={28} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">Validacao de resiliencia do Base44 Connector</p>
        </div>
      )}
      {running && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <RotateCcw size={28} className="text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Injetando falhas e validando respostas...</p>
        </div>
      )}

      {results && (
        <>
          {escaped > 0 && (
            <div className="bg-red-950/30 border-2 border-red-700 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-bold text-sm">{escaped} excecao(oes) escaparam</p>
                <p className="text-red-400 text-xs mt-0.5">Criterio critico de hardening FALHOU.</p>
              </div>
            </div>
          )}
          <SummaryBanner passed={passed} total={total} totalMs={results.reduce((a, r) => a + r.durationMs, 0)} />
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {Object.entries(summary.byCategory).map(([cat, count]) => (
                <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className={`text-lg font-bold ${CATEGORY_COLOR[cat] ?? "text-zinc-300"}`}>{count}</div>
                  <div className="text-xs text-zinc-500 capitalize">{cat}</div>
                </div>
              ))}
            </div>
          )}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
              <span className="text-xs font-semibold text-zinc-300">Cenarios de Hardening</span>
              <span className="text-xs text-zinc-500">{passed}/{total}</span>
            </div>
            {results.map((r) => (
              <div key={r.scenario} className="border-b border-zinc-800/40 last:border-0 px-4 py-3 space-y-1.5">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">{r.scenario}</div>
                  {r.passed ? <CheckCircle size={13} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-zinc-200 font-medium">{r.name}</p>
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[r.category] ?? ""}`}>{r.category}</span>
                    </div>
                    {r.detail && <p className="text-xs text-zinc-500 mt-0.5 font-mono">{r.detail}</p>}
                    {r.error && <p className="text-xs text-red-400 mt-0.5">{r.error}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={r.expectedStatus} />
                    <StatusBadge status={r.actualStatus} />
                    <span className="text-xs text-zinc-600 font-mono ml-1">{r.durationMs}ms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 4: GitHub Connector Sprint ────────────────────────────────────────────

function GitHubSprintTab() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true); setResults(null);
    const r = await runGitHubConnectorTests();
    setResults(r); setRunning(false);
  }, []);

  const passed  = results?.filter(r => r.passed).length ?? 0;
  const total   = results?.length ?? 0;
  const totalMs = results?.reduce((a, r) => a + r.durationMs, 0) ?? 0;
  const allPass = results && passed === total;
  const hasObs  = results?.some(r => r.observation);

  const criteriaFlow = [
    "Registro correto",
    "Runtime localiza",
    "Policy autoriza",
    "Conecta ao GitHub",
    "auth.user",
    "repos.list",
    "ConnectorResult",
    "Logs + Metricas",
    "Health Check",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-zinc-300 font-semibold">GitHub Connector — Primeira Implementacao Real</p>
          <p className="text-xs text-zinc-500 mt-0.5">9 criterios · auth · repos · branches · health · logs · metricas</p>
        </div>
        <RunButton onClick={run} running={running} label="Executar Sprint" />
      </div>

      {/* Info strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Connector", value: "github" },
          { label: "Versao", value: "1.0.0" },
          { label: "Criterios", value: "9" },
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
          {["connectivity.ping","auth.user","auth.validate","repos.list","repos.get","repos.branches"].map(op => (
            <span key={op} className="text-xs font-mono bg-violet-900/30 text-violet-300 border border-violet-800/50 px-2 py-0.5 rounded">{op}</span>
          ))}
        </div>
      </div>

      {/* Criteria flow */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">Criterios de Aceitacao</p>
        <div className="flex flex-wrap gap-1.5">
          {criteriaFlow.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`text-xs px-2 py-1 rounded-lg border font-mono ${
                !results ? "bg-zinc-800 border-zinc-700 text-zinc-500"
                : results[i]?.passed ? "bg-green-900/30 border-green-700 text-green-300"
                : "bg-red-900/30 border-red-700 text-red-300"
              }`}>
                {i + 1}. {label}
              </span>
              {i < criteriaFlow.length - 1 && <span className="text-zinc-700 text-xs">→</span>}
            </div>
          ))}
        </div>
      </div>

      {!running && !results && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <Github size={28} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">GitHub Connector — Primeira implementacao real</p>
          <p className="text-zinc-600 text-xs mt-1">Valida que o Connector Runtime e genericamente reutilizavel</p>
          <div className="mt-4 bg-yellow-950/20 border border-yellow-800/40 rounded-lg px-4 py-2 inline-block">
            <p className="text-xs text-yellow-300">Configure o secret GITHUB_TOKEN para operacoes autenticadas</p>
          </div>
        </div>
      )}

      {running && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <RotateCcw size={28} className="text-violet-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Executando 9 criterios de aceitacao...</p>
        </div>
      )}

      {results && (
        <>
          <SummaryBanner passed={passed} total={total} totalMs={totalMs} />

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
              <span className="text-xs font-semibold text-zinc-300">Criterios de Aceitacao — GitHub Connector</span>
              <span className="text-xs text-zinc-500">{passed}/{total}</span>
            </div>
            {results.map((r) => (
              <div key={r.criterion} className="border-b border-zinc-800/40 last:border-0 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">{r.criterion}</div>
                  {r.passed ? <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
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
                {r.passed && r.data && (
                  <div className="ml-9 mt-1.5 bg-zinc-800/40 rounded-lg px-3 py-2">
                    <pre className="text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(r.data, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          {hasObs && <ObservationBox results={results} />}

          {/* Sprint verdict */}
          <div className={`rounded-2xl border-2 p-6 text-center ${allPass ? "bg-gradient-to-br from-violet-950 to-indigo-950 border-violet-700" : "bg-gradient-to-br from-red-950 to-zinc-950 border-red-700"}`}>
            {allPass ? <Github size={36} className="text-violet-400 mx-auto mb-3" /> : <XCircle size={36} className="text-red-400 mx-auto mb-3" />}
            <p className={`font-black text-lg mb-2 ${allPass ? "text-violet-300" : "text-red-300"}`}>
              {allPass ? "Sprint GitHub Connector — Concluida" : "Sprint Requer Atencao"}
            </p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              {allPass
                ? "Evidencia confirmada: o Connector Runtime Foundation v1.0 e genericamente reutilizavel. Segundo Connector real integrado sem alteracoes arquiteturais."
                : `${total - passed} criterio(s) nao atendido(s). Limitacoes devem ser registradas como evidencias para Engineering Review conforme Engineering First.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 5: GitHub Hardening ───────────────────────────────────────────────────

function GitHubHardeningTab() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true); setResults(null);
    const r = await runGitHubHardeningTests();
    setResults(r); setRunning(false);
  }, []);

  const passed  = results?.filter(r => r.passed).length ?? 0;
  const total   = results?.length ?? 0;
  const escaped = results?.filter(r => !r.passed && r.actualStatus === "EXCEPTION_ESCAPED").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-zinc-300 font-semibold">GitHub Connector — Hardening v1.0.0</p>
          <p className="text-xs text-zinc-500 mt-0.5">8 cenarios · sem token · token invalido · resposta nula · campo ausente · tipo inesperado · erro externo · timeout · sucesso</p>
        </div>
        <RunButton onClick={run} running={running} label="Executar Hardening" />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-2">Criterios de Hardening</p>
        <div className="space-y-1">
          {[
            "Nenhuma excecao escapa do Connector",
            "Todas as respostas validadas antes do retorno",
            "Token ausente retorna FAILED[auth]",
            "Token invalido capturado via resposta HTTP 401",
            "Resposta nula retorna FAILED[validation]",
            "Campo obrigatorio ausente retorna FAILED[validation]",
            "Timeout capturado e retornado como FAILED",
          ].map(item => (
            <div key={item} className="flex items-start gap-2 text-xs text-zinc-400">
              <ShieldCheck size={11} className="text-violet-400 mt-0.5 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {!running && !results && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <ShieldCheck size={28} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">Validacao de resiliencia do GitHub Connector</p>
          <p className="text-zinc-600 text-xs mt-1">Injeta falhas controladas — nenhuma excecao pode escapar</p>
        </div>
      )}
      {running && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <RotateCcw size={28} className="text-violet-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Injetando falhas no GitHub Connector...</p>
        </div>
      )}

      {results && (
        <>
          {escaped > 0 && (
            <div className="bg-red-950/30 border-2 border-red-700 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-bold text-sm">{escaped} excecao(oes) escaparam</p>
                <p className="text-red-400 text-xs mt-0.5">Criterio critico FALHOU — registrar para Engineering Review.</p>
              </div>
            </div>
          )}

          <SummaryBanner passed={passed} total={total} totalMs={results.reduce((a, r) => a + r.durationMs, 0)} />

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between">
              <span className="text-xs font-semibold text-zinc-300">Cenarios de Hardening — GitHub</span>
              <span className="text-xs text-zinc-500">{passed}/{total} — {escaped === 0 ? "nenhuma excecao escapou" : `${escaped} escapou`}</span>
            </div>
            {results.map((r) => (
              <div key={r.scenario} className="border-b border-zinc-800/40 last:border-0 px-4 py-3 space-y-1.5">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">{r.scenario}</div>
                  {r.passed ? <CheckCircle size={13} className="text-green-400 shrink-0 mt-0.5" /> : <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-zinc-200 font-medium">{r.name}</p>
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[r.category] ?? ""}`}>{r.category}</span>
                    </div>
                    {r.detail && <p className="text-xs text-zinc-500 mt-0.5 font-mono">{r.detail}</p>}
                    {r.error && <p className="text-xs text-red-400 mt-0.5">{r.error}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-zinc-600">esp.</span>
                    <StatusBadge status={r.expectedStatus} />
                    <span className="text-xs text-zinc-600">obt.</span>
                    <StatusBadge status={r.actualStatus} />
                    <span className="text-xs text-zinc-600 font-mono ml-1">{r.durationMs}ms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={14} className="text-violet-400" />
              <span className="text-xs font-semibold text-zinc-200">Hardening Verdict — GitHub Connector</span>
            </div>
            {[
              { q: "Nenhuma excecao escapou?",                             ok: escaped === 0 },
              { q: "Todas as respostas validadas antes do retorno?",        ok: passed === total },
              { q: "Token ausente retorna FAILED[auth]?",                  ok: results[0]?.passed },
              { q: "GitHub Connector pronto para producao?",               ok: passed === total && escaped === 0 },
            ].map(({ q, ok }) => (
              <div key={q} className="flex items-start justify-between gap-3 border-b border-zinc-800/40 last:border-0 pb-1.5 last:pb-0">
                <p className="text-xs text-zinc-300">{q}</p>
                <span className={`text-xs font-bold font-mono shrink-0 ${ok ? "text-green-400" : "text-red-400"}`}>{ok ? "SIM" : "NAO"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "runtime",          label: "Runtime" },
  { id: "base44-sprint",    label: "Base44 Sprint" },
  { id: "hardening",        label: "Base44 Hardening" },
  { id: "github-sprint",    label: "GitHub Sprint" },
  { id: "github-hardening", label: "GitHub Hardening" },
];

export default function ConnectorRuntimePage() {
  const [tab, setTab] = useState("github-sprint");

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
            <p className="text-zinc-500 text-xs">Engineering First · Foundation v1.0 · Base44 + GitHub</p>
          </div>
        </div>

        {/* Components */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
          {["ConnectorRuntime","ConnectorRegistry","ConnectorLoader","ConnectorExecutor","PolicyEngine","GitHubConnector"].map(c => (
            <div key={c} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-500 text-center truncate">{c}</div>
          ))}
        </div>

        {/* Tabs — scrollable on mobile */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${tab === t.id
                ? t.id.startsWith("github") ? "bg-violet-700 text-white" : "bg-cyan-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "runtime"          && <RuntimeValidationTab />}
        {tab === "base44-sprint"    && <Base44SprintTab />}
        {tab === "hardening"        && <HardeningTab />}
        {tab === "github-sprint"    && <GitHubSprintTab />}
        {tab === "github-hardening" && <GitHubHardeningTab />}

      </div>
    </div>
  );
}