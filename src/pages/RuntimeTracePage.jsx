import React, { useState, useEffect } from "react";
import { runtimeTraceStore } from "@/lib/runtime-trace/RuntimeTraceStore";
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, RefreshCw, AlertCircle } from "lucide-react";

// ── JSON Viewer ────────────────────────────────────────────────────────────────

function JsonNode({ value, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null || value === undefined) {
    return <span className="text-zinc-400 font-mono text-xs">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className={`font-mono text-xs ${value ? "text-emerald-400" : "text-rose-400"}`}>{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-sky-400 font-mono text-xs">{value}</span>;
  }
  if (typeof value === "string") {
    if (value.length > 500) {
      return (
        <span className="font-mono text-xs text-amber-300">
          &quot;{value.slice(0, 500)}<span className="text-zinc-500">…+{value.length - 500} chars</span>&quot;
        </span>
      );
    }
    return <span className="font-mono text-xs text-amber-300">&quot;{value}&quot;</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="font-mono text-xs text-zinc-400">[]</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center text-zinc-300 hover:text-white">
          {open ? <ChevronDown className="w-3 h-3 mr-0.5" /> : <ChevronRight className="w-3 h-3 mr-0.5" />}
          <span className="font-mono text-xs text-zinc-400">[{value.length}]</span>
        </button>
        {open && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-zinc-700 pl-3">
            {value.map((v, i) => (
              <div key={i} className="flex gap-1">
                <span className="font-mono text-xs text-zinc-500 shrink-0">{i}:</span>
                <JsonNode value={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return <span className="font-mono text-xs text-zinc-400">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center text-zinc-300 hover:text-white">
          {open ? <ChevronDown className="w-3 h-3 mr-0.5" /> : <ChevronRight className="w-3 h-3 mr-0.5" />}
          <span className="font-mono text-xs text-zinc-400">{"{"}…{"}"}</span>
        </button>
        {open && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-zinc-700 pl-3">
            {keys.map((k) => (
              <div key={k} className="flex gap-1 flex-wrap">
                <span className="font-mono text-xs text-violet-300 shrink-0">{k}:</span>
                <JsonNode value={value[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span className="font-mono text-xs text-zinc-300">{String(value)}</span>;
}

// ── Step Card ──────────────────────────────────────────────────────────────────

function StepCard({ step }) {
  const [open, setOpen] = useState(false);

  const statusIcon = {
    executed: <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />,
    skipped:  <XCircle    className="w-5 h-5 text-zinc-600 shrink-0" />,
    error:    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
  }[step.status];

  const statusBg = {
    executed: "border-emerald-800/60 bg-emerald-950/30",
    skipped:  "border-zinc-800 bg-zinc-900/20",
    error:    "border-rose-800/60 bg-rose-950/20",
  }[step.status];

  const hasData = step.data !== null && step.data !== undefined;

  return (
    <div className={`rounded-xl border ${statusBg} overflow-hidden`}>
      <button
        onClick={() => hasData && setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${hasData ? "cursor-pointer hover:bg-white/5" : "cursor-default"} transition`}
      >
        {statusIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${step.status === "skipped" ? "text-zinc-500" : "text-zinc-100"}`}>
              {step.label}
            </span>
            {step.status === "skipped" && (
              <span className="text-xs text-zinc-600 font-mono uppercase tracking-wide">Não executada</span>
            )}
            {step.status === "executed" && (
              <span className="text-xs text-emerald-500 font-mono uppercase tracking-wide">Executada</span>
            )}
            {step.status === "error" && (
              <span className="text-xs text-rose-400 font-mono uppercase tracking-wide">Erro</span>
            )}
          </div>
          {step.durationMs !== null && (
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span className="text-xs text-zinc-500 font-mono">{step.durationMs}ms</span>
            </div>
          )}
          {step.error && (
            <div className="text-xs text-rose-400 mt-0.5 font-mono">{step.error}</div>
          )}
        </div>
        {hasData && (
          open
            ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
        )}
      </button>

      {open && hasData && (
        <div className="px-4 pb-4 border-t border-zinc-800/60">
          <div className="mt-3 rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto max-h-96 overflow-y-auto">
            <JsonNode value={step.data} depth={0} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RuntimeTracePage() {
  const [trace, setTrace] = useState(() => runtimeTraceStore.trace);

  useEffect(() => {
    const unsub = runtimeTraceStore.subscribe(() => {
      setTrace(runtimeTraceStore.trace);
    });
    return unsub;
  }, []);

  const executed  = trace?.steps.filter((s) => s.status === "executed").length ?? 0;
  const skipped   = trace?.steps.filter((s) => s.status === "skipped").length ?? 0;
  const errored   = trace?.steps.filter((s) => s.status === "error").length ?? 0;
  const totalMs   = trace?.finishedAt && trace?.startedAt ? trace.finishedAt - trace.startedAt : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Runtime Trace</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Execução completa do último request — do usuário até a resposta final
            </p>
          </div>
          {trace && (
            <button
              onClick={() => setTrace(runtimeTraceStore.trace)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          )}
        </div>

        {/* No trace yet */}
        {!trace && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Nenhum request executado ainda.</p>
            <p className="text-zinc-600 text-xs mt-1">Envie uma mensagem no Chat para ver o trace completo aqui.</p>
          </div>
        )}

        {trace && (
          <>
            {/* Summary bar */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 flex flex-wrap gap-6">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Mensagem</div>
                <div className="text-sm text-zinc-200 font-medium max-w-sm truncate">
                  &ldquo;{trace.userMessage}&rdquo;
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Execution ID</div>
                <div className="text-xs font-mono text-zinc-400">{trace.executionId}</div>
              </div>
              <div className="flex gap-4 items-end">
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-400">{executed}</div>
                  <div className="text-xs text-zinc-500">Executadas</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-zinc-600">{skipped}</div>
                  <div className="text-xs text-zinc-500">Não exec.</div>
                </div>
                {errored > 0 && (
                  <div className="text-center">
                    <div className="text-xl font-bold text-rose-400">{errored}</div>
                    <div className="text-xs text-zinc-500">Erros</div>
                  </div>
                )}
                {totalMs !== null && (
                  <div className="text-center">
                    <div className="text-xl font-bold text-sky-400">{totalMs}ms</div>
                    <div className="text-xs text-zinc-500">Total</div>
                  </div>
                )}
              </div>
            </div>

            {/* First skipped step indicator */}
            {(() => {
              const firstSkipped = trace.steps.find((s) => s.status === "skipped");
              if (!firstSkipped) return null;
              const firstExecuted = [...trace.steps].reverse().find((s) => s.status === "executed");
              if (!firstExecuted) return null;
              return (
                <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-3 flex gap-3 items-start">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-amber-300">Fluxo interrompido</div>
                    <div className="text-xs text-amber-500 mt-0.5">
                      Última etapa executada: <span className="font-mono text-amber-300">{firstExecuted.label}</span>
                      {" — "}
                      Primeira não-executada: <span className="font-mono text-amber-300">{firstSkipped.label}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Steps */}
            <div className="space-y-2">
              {trace.steps.map((step) => (
                <StepCard key={step.id} step={step} />
              ))}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-zinc-700 font-mono text-right">
              Iniciado: {new Date(trace.startedAt).toLocaleTimeString("pt-BR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })}
              {trace.finishedAt && (
                <> · Finalizado: {new Date(trace.finishedAt).toLocaleTimeString("pt-BR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })}</>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}