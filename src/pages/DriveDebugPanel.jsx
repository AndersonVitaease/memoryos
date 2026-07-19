/**
 * DriveDebugPanel — Drive Debug Runtime Panel
 *
 * Consome exclusivamente o RuntimeDebug (Event Bus oficial).
 * Sem monkey-patch, sem parsing de strings, sem console.log interception.
 * Interface visual identica a versao anterior.
 */
import React, { useState, useEffect, useCallback } from "react";
import { RuntimeDebug } from "@/lib/debug/RuntimeDebug";

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_COLORS = {
  Planner:               "bg-violet-600",
  DriveContextBuilder:   "bg-blue-600",
  ConversationStore:     "bg-amber-600",
  DriveDownloadExecutor: "bg-emerald-600",
};

const SOURCE_LABELS = {
  Planner:               "Planner",
  DriveContextBuilder:   "Context Builder",
  ConversationStore:     "Store",
  DriveDownloadExecutor: "Executor",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}.${d.getMilliseconds().toString().padStart(3,"0")}`;
}

function hasBugSignal(payload) {
  if (!payload) return false;
  const mp = payload.mergedParams;
  if (mp?.fileName && typeof mp.fileName === "string" && mp.fileName.toLowerCase().includes("download")) return true;
  if (payload.strategy === "search by name" && typeof payload.fileName === "string" && payload.fileName.toLowerCase().includes("download")) return true;
  return false;
}

function extractHighlights(payload) {
  const h = [];
  if (!payload) return h;
  const mp = payload.mergedParams;
  if (mp?.fileName) h.push(`fileName: "${mp.fileName}"`);
  if (mp?.fileId)   h.push(`fileId: "${mp.fileId}"`);
  if (mp?.query)    h.push(`query: "${mp.query}"`);
  if (payload.selectedFileId)   h.push(`selectedFileId: "${payload.selectedFileId}"`);
  if (payload.selectedFileName) h.push(`selectedFileName: "${payload.selectedFileName}"`);
  if (payload.strategy)         h.push(`strategy: "${payload.strategy}"`);
  if (payload.found !== undefined) h.push(`found: ${payload.found}`);
  if (payload["parameters.fileId"])   h.push(`recv.fileId: "${payload["parameters.fileId"]}"`);
  if (payload["parameters.fileName"]) h.push(`recv.fileName: "${payload["parameters.fileName"]}"`);
  return h;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function JsonView({ data }) {
  if (!data || Object.keys(data).length === 0)
    return <span className="text-zinc-500 text-xs italic">sem dados</span>;
  return (
    <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function EventRow({ event, idx }) {
  const [open, setOpen] = useState(false);
  const color    = SOURCE_COLORS[event.source]  || "bg-zinc-600";
  const srcLabel = SOURCE_LABELS[event.source]  || event.source;
  const bug      = hasBugSignal(event.payload);
  const highlights = extractHighlights(event.payload);

  return (
    <div className={`border-l-2 pl-3 py-2 ${bug ? "border-red-500 bg-red-950/20" : "border-zinc-700"}`}>
      <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <span className="text-zinc-600 text-xs w-5 text-right">{idx + 1}.</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${color}`}>{srcLabel}</span>
        <span className="text-zinc-300 text-xs flex-1 truncate">{event.event}</span>
        <span className="text-zinc-600 text-[10px] shrink-0">{fmtTime(event.ts)}</span>
        {bug && <span className="text-red-400 text-[10px] font-bold">⚠ BUG?</span>}
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </div>

      {highlights.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-7">
          {highlights.map((h, i) => (
            <span
              key={i}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                bug && h.toLowerCase().includes("download") ? "bg-red-800 text-red-200" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-2 pl-7 bg-zinc-900 rounded p-2">
          <div className="text-[10px] text-zinc-600 font-mono mb-1">executionId: {event.executionId}</div>
          <JsonView data={event.payload} />
        </div>
      )}
    </div>
  );
}

function ExecutionCard({ execution, isLatest }) {
  const [open, setOpen] = useState(isLatest);
  const bug     = execution.events.some(e => hasBugSignal(e.payload));
  const closed  = !!execution.endedAt;
  const elapsed = closed
    ? ((execution.endedAt ?? 0) - execution.startedAt) + "ms"
    : "em andamento…";

  return (
    <div className={`rounded-lg border mb-3 overflow-hidden ${bug ? "border-red-700" : isLatest ? "border-violet-600" : "border-zinc-800"}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${bug ? "bg-red-950/30" : isLatest ? "bg-violet-950/30" : "bg-zinc-900"}`}
        onClick={() => setOpen(!open)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${closed ? "bg-zinc-500" : "bg-green-400 animate-pulse"}`} />
        <span className="text-zinc-300 text-xs font-mono flex-1 truncate">{execution.executionId}</span>
        <span className="text-zinc-500 text-xs">{fmtTime(execution.startedAt)}</span>
        <span className="text-zinc-500 text-xs">{elapsed}</span>
        <span className="text-zinc-500 text-xs">{execution.events.length} eventos</span>
        {bug && <span className="text-red-400 text-xs font-bold">⚠ ANOMALIA</span>}
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="px-4 py-3 bg-zinc-950 space-y-1">
          {execution.events.length === 0 ? (
            <p className="text-zinc-600 text-xs italic">Nenhum evento capturado ainda.</p>
          ) : (
            execution.events.map((ev, i) => <EventRow key={ev.id} event={ev} idx={i} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DriveDebugPanel() {
  const [executions, setExecutions] = useState(() => RuntimeDebug.getExecutions("google-drive"));

  useEffect(() => {
    const unsub = RuntimeDebug.subscribe(() => {
      setExecutions(RuntimeDebug.getExecutions("google-drive"));
    });
    return unsub;
  }, []);

  const handleStart = useCallback(() => {
    RuntimeDebug.startExecution("google-drive");
  }, []);

  const handleCloseLatest = useCallback(() => {
    const open = executions.find(e => !e.endedAt);
    if (open) RuntimeDebug.closeExecution(open.executionId);
  }, [executions]);

  const handleClear = useCallback(() => {
    RuntimeDebug.clear("google-drive");
  }, []);

  const openExecution = executions.find(e => !e.endedAt);
  const totalEvents   = executions.reduce((acc, e) => acc + e.events.length, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            Drive Debug Runtime Panel
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            RuntimeDebug Event Bus — observabilidade ponta a ponta com Correlation ID.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openExecution && (
            <button
              onClick={handleCloseLatest}
              className="px-3 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
            >
              Fechar execução
            </button>
          )}
          <button
            onClick={handleStart}
            className="px-3 py-1.5 text-xs rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors font-bold"
          >
            + Nova execução
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-red-300 transition-colors"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-6">
        <p className="text-zinc-400 text-sm font-semibold mb-2">Como usar:</p>
        <ol className="text-zinc-500 text-xs space-y-1 list-decimal list-inside">
          <li>Clique em <span className="text-violet-400">+ Nova execução</span> para iniciar a captura</li>
          <li>Vá para <span className="text-zinc-300">/chat</span> e envie "CNH"</li>
          <li>Aguarde a resposta com a lista de arquivos</li>
          <li>Envie "Faça o download"</li>
          <li>Volte aqui — os eventos aparecerão com Correlation ID compartilhado</li>
          <li>Eventos com <span className="text-red-400">⚠ ANOMALIA</span> indicam onde o bug ocorreu</li>
        </ol>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 mb-4 text-xs text-zinc-500">
        <span>{executions.length} execuções</span>
        {openExecution && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Capturando — {openExecution.executionId}
          </span>
        )}
        <span className="ml-auto font-mono text-zinc-700">
          window.__MEMORY_DEBUG__.drive — {totalEvents} eventos
        </span>
      </div>

      {/* Executions */}
      {executions.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">Nenhuma execução ainda.</p>
          <p className="text-xs mt-1">Clique em "+ Nova execução" e execute o fluxo no chat.</p>
        </div>
      ) : (
        executions.map((ex, i) => (
          <ExecutionCard key={ex.executionId} execution={ex} isLatest={i === 0} />
        ))
      )}
    </div>
  );
}