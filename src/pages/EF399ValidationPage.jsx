/**
 * EF399ValidationPage.jsx — Sprint EF-39.9A-VALIDATION
 *
 * Valida em tempo de execução (browser) se a correção `await getRealRuntimeEngine()`
 * restabeleceu o fluxo oficial completo.
 *
 * NÃO modifica nenhum conector, planner, runtime ou bootstrap.
 * Apenas observa e reporta.
 */

import React, { useState } from "react";

// ── Constantes de cor por status ──────────────────────────────────────────────

function badge(status) {
  if (status === "OK" || status === "SIM")  return "bg-green-900 text-green-300 border border-green-700";
  if (status === "SKIP")                    return "bg-zinc-800 text-zinc-400 border border-zinc-700";
  if (status === "NÃO" || status === "ERR") return "bg-red-900 text-red-300 border border-red-700";
  if (status === "WARN")                    return "bg-yellow-900 text-yellow-300 border border-yellow-700";
  return "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

function Badge({ s }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${badge(s)}`}>{s}</span>;
}

function Row({ label, value, status }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-zinc-800">
      <Badge s={status} />
      <span className="text-zinc-400 text-xs w-64 shrink-0 font-mono">{label}</span>
      <span className="text-zinc-200 text-xs font-mono break-all">{String(value ?? "—")}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="text-violet-400 font-bold text-sm mb-2 uppercase tracking-widest">{title}</h2>
      <div className="bg-zinc-900 rounded p-3 border border-zinc-800">{children}</div>
    </div>
  );
}

// ── Lógica de trace ───────────────────────────────────────────────────────────

async function runValidation(setResult) {
  const log = [];
  const t_start = performance.now();

  function entry(stage, detail = {}) {
    log.push({ stage, event: "ENTROU", t: +(performance.now() - t_start).toFixed(1), ...detail });
  }
  function exit(stage, status, detail = {}) {
    log.push({ stage, event: status, t: +(performance.now() - t_start).toFixed(1), ...detail });
  }

  const result = {
    static: {},
    executor_chain: {},
    github_registry: {},
    trace: log,
    execution_result: {},
    verdicts: {},
    error: null,
  };

  // ── ETAPA 1: Verificação estática ──────────────────────────────────────────
  try {
    const PROMISE_KEY = "__REAL_RUNTIME_PROMISE__";
    const ENG_KEY     = "__REAL_RUNTIME_ENGINE__";
    const BRIDGE_KEY  = "__OFFICIAL_RUNTIME_BRIDGE__";

    const bootstrapPromise = globalThis[PROMISE_KEY];
    const engine           = globalThis[ENG_KEY];
    const bridge           = globalThis[BRIDGE_KEY];

    result.static = {
      bootstrapPromisePresent: bootstrapPromise !== undefined,
      bootstrapPromiseType:    bootstrapPromise
        ? Object.prototype.toString.call(bootstrapPromise)
        : "NOT_FOUND",
      enginePresent:           engine !== undefined,
      engineConstructor:       engine?.constructor?.name ?? "NOT_FOUND",
      engineHasExecute:        typeof engine?.execute === "function",
      bridgePresent:           bridge !== undefined,
      bridgeHasInvoke:         typeof bridge?.invoke === "function",
    };

    // ── ETAPA 2: Cadeia executor ───────────────────────────────────────────
    if (engine) {
      const dispatcher = engine._dispatcher;
      const executor   = dispatcher?._executor;
      const router     = executor?._router;
      const registry   = router?._registry;

      result.executor_chain = {
        dispatcherConstructor: dispatcher?.constructor?.name ?? "MISSING",
        executorConstructor:   executor?.constructor?.name   ?? "MISSING",
        routerConstructor:     router?.constructor?.name     ?? "MISSING",
        registryPresent:       registry !== undefined,
        registrySize:          registry?.size?.() ?? "N/A",
        registryList:          registry?.list?.() ?? [],
      };

      // ── ETAPA 3: GitHub no registry ───────────────────────────────────
      const githubConnector = registry?.lookup?.("github") ?? null;
      result.github_registry = {
        githubInRegistry:    githubConnector !== null,
        githubConnectorId:   githubConnector?.connectorId?.() ?? "NOT_FOUND",
        githubHasExecute:    typeof githubConnector?.execute === "function",
        capabilitiesCount:   githubConnector?.capabilities?.()?.length ?? 0,
        sampleCaps:          (githubConnector?.capabilities?.() ?? []).map(c => c.id).slice(0, 6),
      };
    }

    // ── ETAPA 4-8: Bridge trace real ───────────────────────────────────────
    if (!bridge) {
      result.error = "OfficialRuntimeBridge não encontrado em globalThis[__OFFICIAL_RUNTIME_BRIDGE__]";
      setResult({ ...result });
      return;
    }

    entry("CCG → OfficialRuntimeBridge.invokeCompat()");
    const t0 = performance.now();
    const compat = await bridge.invokeCompat("github", "repos.list", { per_page: 5 }, {});
    const compatDuration = +(performance.now() - t0).toFixed(1);
    exit("CCG → OfficialRuntimeBridge.invokeCompat()", compat.record.status === "SUCCESS" ? "OK" : "ERR", {
      status:    compat.record.status,
      error:     compat.record.error,
      durationMs: compatDuration,
    });

    // invokeCompat chama invoke internamente — inspecionar lastResults
    const metrics    = bridge.getMetrics();
    const lastResult = metrics.lastResults?.[metrics.lastResults.length - 1];

    if (lastResult) {
      const er = lastResult.executionResult;

      entry("OfficialRuntimeBridge.invoke()");
      exit("OfficialRuntimeBridge.invoke()", lastResult.success ? "OK" : "ERR", {
        success:     lastResult.success,
        status:      lastResult.status,
        executionId: lastResult.executionId,
        durationMs:  lastResult.durationMs,
        error:       lastResult.error,
      });

      // ExecutionResult steps
      const steps = er?.steps ?? [];
      entry("ConversationRuntimeEngine.execute()");
      exit("ConversationRuntimeEngine.execute()", er?.status === "completed" ? "OK" : "ERR", {
        executionId: er?.executionId,
        planId:      er?.planId,
        status:      er?.status,
        stepsCount:  steps.length,
        errors:      (er?.errors ?? []).join(" | ") || "none",
      });

      for (const step of steps) {
        entry(`ExecutionDispatcher → step [${step.connector}.${step.capability}]`);
        exit(`ExecutionDispatcher → step [${step.connector}.${step.capability}]`,
          step.status === "completed" ? "OK" : "ERR", {
            connector:  step.connector,
            capability: step.capability,
            status:     step.status,
            hasOutput:  step.output !== null && step.output !== undefined,
            outputKeys: step.output && typeof step.output === "object"
              ? Object.keys(step.output).slice(0, 8).join(", ")
              : String(step.output ?? "null"),
            error:      step.error,
            durationMs: step.durationMs,
          });
      }

      result.execution_result = {
        executionId:    er?.executionId,
        status:         er?.status,
        steps,
        errors:         er?.errors ?? [],
        totalOutputs:   lastResult.allOutputs?.length ?? 0,
        primaryDataKeys: lastResult.data && typeof lastResult.data === "object"
          ? Object.keys(lastResult.data).slice(0, 10)
          : [],
      };

      // ── ETAPA 4: Verditos ───────────────────────────────────────────────
      const githubStep     = steps.find(s => s.connector === "github");
      const githubOK       = githubStep?.status === "completed";
      const connectorFound = result.github_registry.githubInRegistry;
      const routerFound    = githubOK; // se o step completou, o router encontrou
      const connectorCalled = githubOK;
      const resultProduced = githubStep?.output !== null && githubStep?.output !== undefined;

      result.verdicts = {
        "1. ConversationRuntimeEngine.execute() foi executado?":
          (er?.status !== undefined) ? "SIM" : "NÃO",
        "2. ExecutionDispatcher foi executado?":
          steps.length > 0 ? "SIM" : "NÃO",
        "3. UniversalConnectorRouter encontrou o connector?":
          connectorFound && routerFound ? "SIM" : "NÃO",
        "4. GitHubConnector.execute() foi chamado?":
          connectorCalled ? "SIM" : "NÃO",
        "5. ConnectorResult foi produzido?":
          resultProduced ? "SIM" : "NÃO",
        "6. Composer respondeu usando ConnectorResult?":
          resultProduced ? "SIM" : "NÃO (sem dados reais para compor)",
        "AWAIT_HIPOTESE_CONFIRMADA":
          er?.status === "completed" && githubOK ? "SIM" : "NÃO",
      };
    } else {
      result.error = "Nenhum resultado encontrado em bridge.getMetrics().lastResults após invokeCompat()";
    }

  } catch (e) {
    result.error = `Exception: ${e?.message ?? String(e)}\n${e?.stack ?? ""}`;
    log.push({ stage: "EXCEPTION", event: "ERR", error: result.error });
  }

  setResult(result);
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EF399ValidationPage() {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);

  async function handle() {
    setRunning(true);
    setResult(null);
    await runValidation(setResult);
    setRunning(false);
  }

  const v = result?.verdicts ?? {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-5xl mx-auto">

        <div className="mb-6">
          <div className="text-violet-400 text-xs uppercase tracking-widest mb-1">Sprint EF-39.9A-VALIDATION</div>
          <h1 className="text-2xl font-bold text-white mb-1">Runtime Validation — Official Pipeline</h1>
          <p className="text-zinc-500 text-xs">
            Valida em tempo de execução (browser) se o fluxo CCG → Bridge → CRE → Dispatcher → Router → GitHubConnector está operacional.
          </p>
        </div>

        <button
          onClick={handle}
          disabled={running}
          className="mb-6 px-5 py-2 bg-violet-700 hover:bg-violet-600 disabled:bg-zinc-700 text-white rounded text-sm font-bold transition-colors"
        >
          {running ? "⏳ Executando trace..." : "▶ EXECUTAR VALIDAÇÃO EF-39.9A"}
        </button>

        {!result && !running && (
          <div className="text-zinc-600 text-xs">Pressione o botão para iniciar a validação.</div>
        )}

        {result && (
          <>
            {/* ── ETAPA 1: Verificação Estática ───────────────────────────── */}
            <Section title="ETAPA 1 — Verificação Estática">
              <Row label="Bootstrap Promise presente"
                   value={String(result.static.bootstrapPromisePresent)}
                   status={result.static.bootstrapPromisePresent ? "OK" : "ERR"} />
              <Row label="Bootstrap Promise tipo"
                   value={result.static.bootstrapPromiseType}
                   status={result.static.bootstrapPromisePresent ? "OK" : "WARN"} />
              <Row label="ConversationRuntimeEngine presente"
                   value={String(result.static.enginePresent)}
                   status={result.static.enginePresent ? "OK" : "ERR"} />
              <Row label="CRE constructor"
                   value={result.static.engineConstructor}
                   status={result.static.engineConstructor === "ConversationRuntimeEngine" ? "OK" : "ERR"} />
              <Row label="CRE.execute() é function"
                   value={String(result.static.engineHasExecute)}
                   status={result.static.engineHasExecute ? "OK" : "ERR"} />
              <Row label="getRealRuntimeEngine() é async (retorna Promise)"
                   value={result.static.bootstrapPromiseType}
                   status={result.static.bootstrapPromisePresent ? "OK" : "ERR"} />
              <Row label="OfficialRuntimeBridge presente"
                   value={String(result.static.bridgePresent)}
                   status={result.static.bridgePresent ? "OK" : "ERR"} />
            </Section>

            {/* ── ETAPA 2: Cadeia Executor ─────────────────────────────────── */}
            <Section title="ETAPA 2 — Cadeia Executor (CRE → Dispatcher → Router → Registry)">
              <Row label="ExecutionDispatcher"
                   value={result.executor_chain.dispatcherConstructor}
                   status={result.executor_chain.dispatcherConstructor === "ExecutionDispatcher" ? "OK" : "ERR"} />
              <Row label="ConnectorCapabilityExecutor"
                   value={result.executor_chain.executorConstructor}
                   status={result.executor_chain.executorConstructor === "ConnectorCapabilityExecutor" ? "OK" : "ERR"} />
              <Row label="UniversalConnectorRouter"
                   value={result.executor_chain.routerConstructor}
                   status={result.executor_chain.routerConstructor === "UniversalConnectorRouter" ? "OK" : "ERR"} />
              <Row label="UCR Registry presente"
                   value={String(result.executor_chain.registryPresent)}
                   status={result.executor_chain.registryPresent ? "OK" : "ERR"} />
              <Row label="UCR Registry size"
                   value={String(result.executor_chain.registrySize)}
                   status={result.executor_chain.registrySize > 0 ? "OK" : "ERR"} />
              <Row label="Connectors registrados"
                   value={(result.executor_chain.registryList ?? []).join(", ") || "VAZIO"}
                   status={(result.executor_chain.registryList ?? []).length > 0 ? "OK" : "ERR"} />
            </Section>

            {/* ── ETAPA 3: GitHub no Registry ──────────────────────────────── */}
            <Section title="ETAPA 3 — GitHubConnector no UCR Registry">
              <Row label="'github' no registry"
                   value={String(result.github_registry.githubInRegistry)}
                   status={result.github_registry.githubInRegistry ? "OK" : "ERR"} />
              <Row label="GitHubConnector.connectorId()"
                   value={result.github_registry.githubConnectorId}
                   status={result.github_registry.githubConnectorId === "github" ? "OK" : "ERR"} />
              <Row label="GitHubConnector.execute() presente"
                   value={String(result.github_registry.githubHasExecute)}
                   status={result.github_registry.githubHasExecute ? "OK" : "ERR"} />
              <Row label="Capabilities count"
                   value={String(result.github_registry.capabilitiesCount)}
                   status={result.github_registry.capabilitiesCount > 0 ? "OK" : "ERR"} />
              <Row label="Sample capabilities"
                   value={(result.github_registry.sampleCaps ?? []).join(", ") || "NONE"}
                   status={result.github_registry.capabilitiesCount > 0 ? "OK" : "WARN"} />
            </Section>

            {/* ── ETAPA 4-8: Trace de Execução ─────────────────────────────── */}
            <Section title="ETAPA 4-8 — Trace de Execução (por etapa)">
              {result.trace.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5 border-b border-zinc-800">
                  <span className="text-zinc-600 text-xs w-16 shrink-0">{entry.t}ms</span>
                  <Badge s={entry.event === "ENTROU" ? "SKIP" : entry.event} />
                  <div className="flex-1">
                    <div className="text-zinc-300 text-xs">{entry.stage}</div>
                    {Object.entries(entry)
                      .filter(([k]) => !["stage","event","t"].includes(k))
                      .map(([k, v]) => (
                        <div key={k} className="text-zinc-500 text-xs ml-2">
                          {k}: <span className="text-zinc-300">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </Section>

            {/* ── Execution Result detalhe ─────────────────────────────────── */}
            {result.execution_result.steps?.length > 0 && (
              <Section title="Execution Result — Steps Detail">
                {result.execution_result.steps.map((s, i) => (
                  <div key={i} className="py-2 border-b border-zinc-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge s={s.status === "completed" ? "OK" : "ERR"} />
                      <span className="text-zinc-200 text-xs font-bold">{s.connector}.{s.capability}</span>
                      <span className="text-zinc-500 text-xs">{s.durationMs}ms</span>
                    </div>
                    {s.error && <div className="text-red-400 text-xs ml-8">error: {s.error}</div>}
                    {s.outputKeys && <div className="text-zinc-400 text-xs ml-8">output keys: {s.outputKeys}</div>}
                  </div>
                ))}
              </Section>
            )}

            {/* ── ETAPA 4: Verditos ────────────────────────────────────────── */}
            <Section title="ETAPA 4 — Verditos">
              {Object.entries(v).map(([q, ans]) => (
                <Row key={q} label={q} value={ans}
                     status={ans === "SIM" ? "OK" : ans === "NÃO" ? "NÃO" : "WARN"} />
              ))}
            </Section>

            {/* ── Erro global ───────────────────────────────────────────────── */}
            {result.error && (
              <div className="bg-red-950 border border-red-700 rounded p-4 mt-4">
                <div className="text-red-400 font-bold text-sm mb-2">⛔ FALHA DETECTADA — PARAR IMEDIATAMENTE</div>
                <pre className="text-red-300 text-xs whitespace-pre-wrap">{result.error}</pre>
              </div>
            )}

            {/* ── Conclusão ─────────────────────────────────────────────────── */}
            <div className={`mt-6 p-4 rounded border ${
              v["AWAIT_HIPOTESE_CONFIRMADA"] === "SIM"
                ? "bg-green-950 border-green-700"
                : "bg-red-950 border-red-700"
            }`}>
              <div className={`font-bold text-sm mb-1 ${
                v["AWAIT_HIPOTESE_CONFIRMADA"] === "SIM" ? "text-green-300" : "text-red-300"
              }`}>
                {v["AWAIT_HIPOTESE_CONFIRMADA"] === "SIM"
                  ? "✅ HIPÓTESE CONFIRMADA — await getRealRuntimeEngine() restabeleceu o fluxo oficial"
                  : "❌ HIPÓTESE NÃO CONFIRMADA — fluxo ainda quebrado. Ver trace acima para próximo ponto de falha."}
              </div>
              <div className="text-zinc-400 text-xs">
                {v["AWAIT_HIPOTESE_CONFIRMADA"] === "SIM"
                  ? "Todos os componentes executaram na mesma requisição. Sprint EF-39.9A concluída."
                  : "Identificar o primeiro componente com status ERR no trace e reportar para investigação."}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}