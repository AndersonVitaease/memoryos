import React, { useState } from "react";
import { runDriveActionResolverTests } from "@/lib/google-drive/DriveActionResolverTests";

function Badge({ ok }) {
  return (
    <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${
      ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
         : "bg-red-900/50 text-red-300 border-red-700"
    }`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const CASES = [
  { id: "C1", label: "1 arquivo encontrado",     expect: "abre corretamente — fileId propagado" },
  { id: "C2", label: "2 arquivos encontrados",   expect: "requiresSelection — API não é chamada" },
  { id: "C3", label: "0 arquivos",               expect: "NOT_FOUND" },
  { id: "C4", label: 'fileId vazio / null',      expect: "NO_FILE_SELECTED (nunca ValidationError)" },
  { id: "C5", label: "fileId válido",            expect: "Connector recebe exatamente esse fileId" },
  { id: "C6", label: "fileId vazio → sem chamada", expect: "API nunca chamada com fileId inválido" },
];

export default function SprintP012Page() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResults(null);
    await new Promise(r => setTimeout(r, 30));
    try {
      setResults(runDriveActionResolverTests());
    } finally {
      setRunning(false);
    }
  }

  const passed  = results?.filter(r => r.passed).length ?? 0;
  const total   = results?.length ?? 0;
  const allPass = total > 0 && passed === total;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">SPRINT P-01.2</div>
          <h1 className="text-2xl font-bold">Drive FileId Propagation — Bug Fix Validation</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Root cause fixed: fileId lost between search and connector call. 6 unit tests verify the fix.
          </p>
        </div>

        {/* Root cause */}
        <div className="border border-zinc-800 rounded-lg p-4 space-y-2 text-sm">
          <div className="text-white font-bold">Root Cause</div>
          <div className="text-zinc-400">
            <code className="text-red-400">executeDriveCapability("drive.readFile", {"{ fileId: parameters.fileId ?? \"\" }"})</code>
            <br />
            → quando <code className="text-red-400">parameters.fileId</code> é undefined, passou <code className="text-red-400">""</code> para a API do Drive → <code className="text-red-400">ValidationError: fileId is required</code>
          </div>
          <div className="text-white font-bold mt-2">Correção</div>
          <div className="text-zinc-400">
            <code className="text-emerald-400">DriveActionResolver.resolveFromSearchResult()</code> — 1 resultado: fileId propagado automaticamente. 2+: <code className="text-emerald-400">requiresSelection</code>. Guard: <code className="text-emerald-400">assertFileId()</code> bloqueia toda chamada com fileId inválido.
          </div>
        </div>

        {/* Flow before/after */}
        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
          <div className="border border-red-800 rounded-lg p-3 bg-red-950/10">
            <div className="text-red-400 font-bold mb-2">ANTES</div>
            {["Intent", "Search → fileId perdido", 'drive.readFile(fileId: "")', "→ ValidationError"].map((s, i) => (
              <div key={i} className="text-zinc-400">{i > 0 ? "↓ " : ""}{s}</div>
            ))}
          </div>
          <div className="border border-emerald-800 rounded-lg p-3 bg-emerald-950/10">
            <div className="text-emerald-400 font-bold mb-2">DEPOIS</div>
            {["Intent", "Search(query)", "resolveFromSearchResult()", "1 resultado → fileId propagado", "assertFileId(id) ✓", "drive.readFile(id)", "Parser → Resposta"].map((s, i) => (
              <div key={i} className="text-zinc-400">{i > 0 ? "↓ " : ""}{s}</div>
            ))}
          </div>
        </div>

        {/* Test cases legend */}
        <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
          <div className="text-white font-bold text-sm mb-3">6 Casos de Teste (Spec)</div>
          {CASES.map(c => {
            const r = results?.find(x => x.id === c.id);
            return (
              <div key={c.id} className="flex items-start gap-3">
                <span className="text-violet-400 w-6 shrink-0">{c.id}</span>
                <span className="text-zinc-300 flex-1">{c.label}</span>
                <span className="text-zinc-500 flex-1">{c.expect}</span>
                {r ? <Badge ok={r.passed} /> : <span className="text-zinc-600 text-xs">—</span>}
              </div>
            );
          })}
        </div>

        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors"
        >
          {running ? "Running…" : "▶  Run 6 Tests"}
        </button>

        {results && (
          <>
            <div className={`border rounded-lg p-4 flex items-center justify-between ${
              allPass ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"
            }`}>
              <div>
                <div className="text-xs text-zinc-400">Resultado</div>
                <div className={`text-3xl font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                  {passed}/{total}
                </div>
              </div>
              <div className={`text-xl font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                {allPass ? "✓ TODOS APROVADOS" : `✗ ${total - passed} FALHOU`}
              </div>
            </div>

            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className={`border rounded-lg px-4 py-3 flex items-start gap-3 ${
                  r.passed ? "border-zinc-800" : "border-red-800 bg-red-950/10"
                }`}>
                  <Badge ok={r.passed} />
                  <div className="flex-1">
                    <div className="text-sm text-white">{r.name}</div>
                    {!r.passed && <div className="text-xs text-red-400 mt-1 whitespace-pre-wrap">{r.message}</div>}
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>

            {allPass && (
              <div className="border border-emerald-700 rounded-lg p-4 bg-emerald-950/10 space-y-1 text-xs font-mono text-zinc-400">
                <div className="text-emerald-400 font-bold mb-2">Confirmação — Nenhuma decisão arquitetural alterada</div>
                {[
                  "Runtime — não alterado",
                  "Planner — não alterado",
                  "Connector Runtime — não alterado",
                  "Identity Layer — não alterado",
                  "OAuth — não alterado",
                  "Execution Chain — não alterado",
                  "SDK / Registry / Pipeline — não alterados",
                  "Apenas GoogleDriveCapabilityExecutor.ts e DriveActionResolver.ts (novo)",
                ].map(s => (
                  <div key={s} className="flex gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}