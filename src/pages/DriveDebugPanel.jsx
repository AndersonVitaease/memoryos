import React, { useState, useEffect, useCallback } from "react";
import { driveDebugStore, installConsoleInterceptor } from "@/lib/debug/DriveDebugStore";

// Install interceptor as soon as this page is loaded
installConsoleInterceptor();

const SOURCE_COLORS = {
  Planner:              "bg-violet-600",
  DriveContextBuilder:  "bg-blue-600",
  ConversationStore:    "bg-amber-600",
  DriveDownloadExecutor:"bg-emerald-600",
};

const SOURCE_LABELS = {
  Planner:              "Planner",
  DriveContextBuilder:  "Context Builder",
  ConversationStore:    "Store",
  DriveDownloadExecutor:"Executor",
};

function JsonView({ data }) {
  if (!data || Object.keys(data).length === 0) return <span className="text-zinc-500 text-xs italic">sem dados</span>;
  return (
    <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function EventRow({ event, idx }) {
  const [open, setOpen] = useState(false);
  const color = SOURCE_COLORS[event.source] || "bg-zinc-600";
  const label = SOURCE_LABELS[event.source] || event.source;
  const ts = new Date(event.ts);
  const timeStr = `${ts.getHours().toString().padStart(2,"0")}:${ts.getMinutes().toString().padStart(2,"0")}:${ts.getSeconds().toString().padStart(2,"0")}.${ts.getMilliseconds().toString().padStart(3,"0")}`;

  // Highlight critical fields
  const highlights = [];
  if (event.data?.mergedParams) {
    const mp = event.data.mergedParams;
    if (mp.fileName) highlights.push(`fileName: "${mp.fileName}"`);
    if (mp.fileId)   highlights.push(`fileId: "${mp.fileId}"`);
    if (mp.query)    highlights.push(`query: "${mp.query}"`);
  }
  if (event.data?.selectedFileId)   highlights.push(`selectedFileId: "${event.data.selectedFileId}"`);
  if (event.data?.selectedFileName) highlights.push(`selectedFileName: "${event.data.selectedFileName}"`);
  if (event.data?.strategy)         highlights.push(`strategy: "${event.data.strategy}"`);
  if (event.data?.found !== undefined) highlights.push(`found: ${event.data.found}`);

  const hasBug =
    (event.data?.mergedParams?.fileName && typeof event.data.mergedParams.fileName === "string" &&
     event.data.mergedParams.fileName.toLowerCase().includes("download")) ||
    (event.data?.strategy === "search by name" &&
     typeof event.data?.fileName === "string" &&
     event.data.fileName.toLowerCase().includes("download"));

  return (
    <div className={`border-l-2 pl-3 py-2 ${hasBug ? "border-red-500 bg-red-950/20" : "border-zinc-700"}`}>
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <span className="text-zinc-600 text-xs w-5 text-right">{idx + 1}.</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${color}`}>{label}</span>
        <span className="text-zinc-300 text-xs flex-1 truncate">{event.label}</span>
        <span className="text-zinc-600 text-[10px] shrink-0">{timeStr}</span>
        {hasBug && <span className="text-red-400 text-[10px] font-bold">⚠ BUG?</span>}
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </div>

      {highlights.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-7">
          {highlights.map((h, i) => (
            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${hasBug && h.includes("download") ? "bg-red-800 text-red-200" : "bg-zinc-800 text-zinc-300"}`}>
              {h}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-2 pl-7 bg-zinc-900 rounded p-2">
          <JsonView data={event.data} />
        </div>
      )}
    </div>
  );
}

function RunCard({ run, isLatest }) {
  const [open, setOpen] = useState(isLatest);
  const elapsed = run.closed
    ? ((run.events[run.events.length - 1]?.ts ?? run.startedAt) - run.startedAt) + "ms"
    : "em andamento…";

  const startTime = new Date(run.startedAt);
  const startStr = `${startTime.getHours().toString().padStart(2,"0")}:${startTime.getMinutes().toString().padStart(2,"0")}:${startTime.getSeconds().toString().padStart(2,"0")}`;

  const hasBug = run.events.some(e =>
    (e.data?.mergedParams?.fileName && typeof e.data.mergedParams.fileName === "string" &&
     e.data.mergedParams.fileName.toLowerCase().includes("download")) ||
    (e.data?.strategy === "search by name" &&
     typeof e.data?.fileName === "string" &&
     e.data.fileName?.toLowerCase().includes("download"))
  );

  return (
    <div className={`rounded-lg border mb-3 overflow-hidden ${hasBug ? "border-red-700" : isLatest ? "border-violet-600" : "border-zinc-800"}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${hasBug ? "bg-red-950/30" : isLatest ? "bg-violet-950/30" : "bg-zinc-900"}`}
        onClick={() => setOpen(!open)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${run.closed ? "bg-zinc-500" : "bg-green-400 animate-pulse"}`} />
        <span className="text-zinc-300 text-sm font-mono flex-1">{run.id}</span>
        <span className="text-zinc-500 text-xs">{startStr}</span>
        <span className="text-zinc-500 text-xs">{elapsed}</span>
        <span className="text-zinc-500 text-xs">{run.events.length} eventos</span>
        {hasBug && <span className="text-red-400 text-xs font-bold">⚠ ANOMALIA</span>}
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="px-4 py-3 bg-zinc-950 space-y-1">
          {run.events.length === 0 ? (
            <p className="text-zinc-600 text-xs italic">Nenhum evento capturado ainda.</p>
          ) : (
            run.events.map((ev, i) => <EventRow key={i} event={ev} idx={i} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function DriveDebugPanel() {
  const [runs, setRuns] = useState(() => driveDebugStore.getRuns());
  const [newRunId, setNewRunId] = useState(null);

  useEffect(() => {
    const unsub = driveDebugStore.subscribe(() => {
      setRuns(driveDebugStore.getRuns());
    });
    return unsub;
  }, []);

  const handleStartRun = useCallback(() => {
    const id = driveDebugStore.startRun();
    setNewRunId(id);
  }, []);

  const handleClear = useCallback(() => {
    driveDebugStore.clear();
    setNewRunId(null);
  }, []);

  const handleCloseLatest = useCallback(() => {
    const open = runs.find(r => !r.closed);
    if (open) driveDebugStore.closeRun(open.id);
  }, [runs]);

  const openRun = runs.find(r => !r.closed);

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
            Captura todos os eventos [DIAG] do fluxo Google Drive em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openRun && (
            <button
              onClick={handleCloseLatest}
              className="px-3 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
            >
              Fechar execução
            </button>
          )}
          <button
            onClick={handleStartRun}
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
          <li>Volte aqui — os eventos aparecerão automaticamente</li>
          <li>Eventos com <span className="text-red-400">⚠ ANOMALIA</span> indicam onde o bug ocorreu</li>
        </ol>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 mb-4 text-xs text-zinc-500">
        <span>{runs.length} execuções capturadas</span>
        {openRun && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Capturando eventos…
          </span>
        )}
        <span className="ml-auto font-mono text-zinc-700">
          window.__MEMORY_DEBUG__.drive — {runs.reduce((acc, r) => acc + r.events.length, 0)} eventos totais
        </span>
      </div>

      {/* Runs */}
      {runs.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">Nenhuma execução ainda.</p>
          <p className="text-xs mt-1">Clique em "+ Nova execução" e depois execute o fluxo no chat.</p>
        </div>
      ) : (
        runs.map((run, i) => (
          <RunCard key={run.id} run={run} isLatest={i === 0} />
        ))
      )}
    </div>
  );
}