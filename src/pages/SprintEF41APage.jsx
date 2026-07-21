/**
 * SprintEF41APage.jsx — Sprint EF-41A
 * Official Library Index Engine — Architectural Refinement Dashboard
 */

import React, { useState, useCallback } from "react";

function Pill({ color, children }) {
  const c = {
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    blue:   "bg-blue-950/60 text-blue-300 border-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${c[color] ?? c.zinc}`}>
      {children}
    </span>
  );
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
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => r.error && setOpen(o => !o)} className="w-full flex items-start gap-3 py-2.5 px-3 text-left">
        <Pill color={r.passed ? "green" : "red"}>{r.passed ? "PASS" : "FAIL"}</Pill>
        <span className="text-zinc-400 font-mono text-xs w-5 shrink-0">{r.id}</span>
        <span className={`flex-1 text-sm ${r.passed ? "text-zinc-200" : "text-red-300"}`}>{r.name}</span>
        <span className="text-zinc-600 font-mono text-xs">{r.durationMs}ms</span>
      </button>
      {open && r.error && (
        <div className="px-3 pb-2 ml-14 border-l-2 border-zinc-700">
          <p className="text-xs text-red-400 font-mono">error: {r.error}</p>
        </div>
      )}
    </div>
  );
}

const REFINEMENTS = [
  {
    id: "R1",
    title: "Eliminate Indexer naming ambiguity",
    before: "OfficialLibraryIndexer.ts (index/) vs OfficialLibraryIndexer.ts (official-library/)",
    after:  "OfficialLibraryIndexOrchestrator.ts — explicit name, distinct role",
    detail: "The EF-7.x chunk indexer (official-library/) remains untouched. The EF-41 lifecycle orchestrator is renamed. OfficialLibraryIndexerEF41 alias preserved for zero test changes.",
    files: ["OfficialLibraryIndexOrchestrator.ts (new, replaces OfficialLibraryIndexer.ts in index/)"],
  },
  {
    id: "R2",
    title: "Decouple Registry from Index singleton",
    before: "Registry.rebuild() calls OfficialLibraryIndex.getAll() internally",
    after:  "Registry.rebuild(docs) receives documents explicitly from Orchestrator",
    detail: "The Orchestrator is the sole entity that reads from Index and passes to Registry. Registry has zero imports from OfficialLibraryIndex.",
    files: ["OfficialLibraryRegistry.ts (rebuild signature changed)", "OfficialLibraryIndexOrchestrator.ts (passes docs explicitly)"],
  },
  {
    id: "R3",
    title: "Extract MetadataBuilder from Scanner",
    before: "OfficialDocumentScanner performed: validate + derive category + derive type + compute checksum + extract keywords + extract relationships + build metadata",
    after:  "Scanner: validate + delegate to Builder. OfficialMetadataBuilder: all derivation and construction.",
    detail: "Scanner now has one responsibility: validate raw inputs and emit ScanResult. MetadataBuilder has one responsibility: build OfficialDocumentMetadata from validated raw inputs.",
    files: ["OfficialMetadataBuilder.ts (new)", "OfficialDocumentScanner.ts (simplified)"],
  },
  {
    id: "R4",
    title: "Replace heuristic if-chains with strategies",
    before: "deriveCategory() and deriveDocumentType() — long sequential if/else chains in OfficialDocumentMetadata.ts",
    after:  "CategoryStrategy.derive() and DocumentTypeStrategy.derive() — rule arrays evaluated by firstMatch()",
    detail: "Adding a new classification rule requires adding one entry to a rules array. No existing rules change. Same behavior, extensible design.",
    files: ["ClassificationStrategies.ts (new)", "OfficialDocumentMetadata.ts (deprecated helpers)", "OfficialMetadataBuilder.ts (uses strategies)"],
  },
  {
    id: "R5",
    title: "Introduce OfficialLibraryAdapter",
    before: "Scanner imported OfficialDocumentMeta and OfficialChunk directly from OfficialLibraryTypes",
    after:  "Scanner and MetadataBuilder use RawDocumentInput / RawChunkInput via OfficialLibraryAdapter",
    detail: "The Adapter isolates the Index Engine from Official Library internal model changes. Future Retrieval Engine depends on adapter contracts, not internal storage types.",
    files: ["OfficialLibraryAdapter.ts (new)", "OfficialDocumentScanner.ts (uses adapter)", "OfficialMetadataBuilder.ts (uses adapter types)"],
  },
  {
    id: "R6",
    title: "Synchronize checksum documentation",
    before: 'Comment said "SHA-256 of title+version+path+tags" — implementation uses FNV-1a 32-bit polynomial hash',
    after:  "Comment accurately describes FNV-1a algorithm (seed, prime, per-byte operation, output format) and explains why SHA-256 was not used (sync requirement). Upgrade path documented.",
    files: ["OfficialDocumentMetadata.ts (computeChecksum JSDoc updated)", "OfficialDocumentMetadata interface (checksum field comment updated)"],
  },
];

const NEW_PIPELINE = [
  { label: "OfficialLibraryBootstrap",        color: "bg-zinc-700 text-zinc-300 border-zinc-600",        note: "Existing — untouched" },
  { label: "OfficialLibraryAdapter",          color: "bg-indigo-900/60 text-indigo-300 border-indigo-700", note: "R5 — adapt OfficialDocumentMeta/Chunk → Raw*" },
  { label: "OfficialDocumentScanner",         color: "bg-violet-900/60 text-violet-300 border-violet-700", note: "R3 — validate only" },
  { label: "OfficialMetadataBuilder",         color: "bg-blue-900/60 text-blue-300 border-blue-700",       note: "R3 + R4 — build metadata via strategies" },
  { label: "ClassificationStrategies",        color: "bg-sky-900/60 text-sky-300 border-sky-700",          note: "R4 — CategoryStrategy + DocumentTypeStrategy" },
  { label: "OfficialLibraryIndexOrchestrator",color: "bg-emerald-900/60 text-emerald-300 border-emerald-700", note: "R1 — lifecycle: rebuildFull / updateIncremental" },
  { label: "OfficialLibraryIndex",            color: "bg-teal-900/60 text-teal-300 border-teal-700",        note: "Unchanged — flat in-memory store" },
  { label: "OfficialLibraryRegistry",         color: "bg-cyan-900/60 text-cyan-300 border-cyan-700",        note: "R2 — receives docs explicitly, no Index coupling" },
  { label: "Retrieval Engine (EF-42+)",        color: "bg-zinc-800 text-zinc-500 border-zinc-700",          note: "Future — depends on Adapter, not internal types" },
];

export default function SprintEF41APage() {
  const [running, setRunning]     = useState(false);
  const [results, setResults]     = useState(null);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("refinements");

  const handleRun = useCallback(async () => {
    setRunning(true); setResults(null); setError(null);
    try {
      const { runOfficialLibraryIndexTests } = await import("@/lib/official-library/index/officialLibraryIndexTests");
      setResults(await runOfficialLibraryIndexTests());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const TABS = ["refinements", "pipeline", "tests"];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-violet-950/40 border border-indigo-800/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <Pill color="violet">SPRINT EF-41A</Pill>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Architectural Refinement</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">Zero behavior change · 6 refinements · 8 tests preserved</span>
          </div>
          <h1 className="text-xl font-black text-white">Official Library Index Engine — Architectural Refinement</h1>
          <p className="text-zinc-400 text-sm mt-1">Lower coupling · Better SRP · Clear responsibilities · No API regressions</p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors">
              {running ? "Executando..." : "Verificar Regressão (EF-41 Tests)"}
            </button>
            {results && (
              <Pill color={results.allPassed ? "green" : "red"}>
                {results.allPassed ? `✓ ${results.passed}/${results.total} PASS — SEM REGRESSÃO` : `✗ ${results.failed} REGRESSÃO DETECTADA`}
              </Pill>
            )}
          </div>
          {results && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passou"   value={results.passed}  color="text-emerald-400" />
              <Metric label="Falhou"   value={results.failed}  color={results.failed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total"    value={results.total}   />
              <Metric label="Tempo"    value={`${results.durationMs}ms`} color="text-violet-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Verificando ausência de regressões nos 8 testes EF-41...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Erro</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {!running && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {TABS.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                  activeTab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"
                }`}>
                {t === "refinements" ? "6 Refinements" : t === "pipeline" ? "New Pipeline" : "Test Regression"}
              </button>
            ))}
          </div>
        )}

        {/* Tab: Refinements */}
        {activeTab === "refinements" && !running && (
          <div className="space-y-3">
            {REFINEMENTS.map(r => (
              <div key={r.id} className="bg-zinc-900 border border-zinc-700/60 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                  <Pill color="violet">{r.id}</Pill>
                  <span className="text-white font-bold text-sm">{r.title}</span>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="border border-red-800/30 bg-red-950/10 rounded p-2">
                      <div className="text-red-400 font-bold mb-1">ANTES</div>
                      <p className="text-zinc-400">{r.before}</p>
                    </div>
                    <div className="border border-emerald-800/30 bg-emerald-950/10 rounded p-2">
                      <div className="text-emerald-400 font-bold mb-1">DEPOIS</div>
                      <p className="text-zinc-300">{r.after}</p>
                    </div>
                  </div>
                  <p className="text-zinc-500 text-xs">{r.detail}</p>
                  <div className="flex flex-wrap gap-1">
                    {r.files.map(f => (
                      <span key={f} className="text-xs bg-zinc-800 text-violet-400 px-2 py-0.5 rounded border border-zinc-700">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Pipeline */}
        {activeTab === "pipeline" && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline refinado — EF-41A</p>
            <div className="flex flex-col items-center gap-0">
              {NEW_PIPELINE.map((node, i, arr) => (
                <React.Fragment key={node.label}>
                  <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-96 max-w-full ${node.color}`}>
                    <div>{node.label}</div>
                    <div className="text-xs font-normal opacity-60 mt-0.5">{node.note}</div>
                  </div>
                  {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                </React.Fragment>
              ))}
            </div>

            <div className="mt-6 border border-zinc-700/40 rounded p-4 text-xs space-y-2">
              <div className="text-zinc-300 font-bold mb-2">Ficheiros adicionados / alterados em EF-41A</div>
              {[
                ["NEW",     "OfficialLibraryAdapter.ts",         "Adapter layer — RawDocumentInput / RawChunkInput"],
                ["NEW",     "ClassificationStrategies.ts",       "CategoryStrategy + DocumentTypeStrategy (rule arrays)"],
                ["NEW",     "OfficialMetadataBuilder.ts",        "Metadata construction (split from Scanner)"],
                ["NEW",     "OfficialLibraryIndexOrchestrator.ts","Renamed from OfficialLibraryIndexer.ts in index/"],
                ["CHANGED", "OfficialDocumentScanner.ts",        "Validate only — delegates to Adapter + Builder"],
                ["CHANGED", "OfficialLibraryRegistry.ts",        "rebuild(docs) — no Index singleton coupling"],
                ["CHANGED", "OfficialDocumentMetadata.ts",       "Checksum comment fixed (FNV-1a, not SHA-256); helpers @deprecated"],
                ["CHANGED", "index.ts",                          "Exports all new components"],
                ["KEPT",    "OfficialLibraryIndex.ts",           "Unchanged"],
                ["KEPT",    "officialLibraryIndexTests.ts",       "Unchanged — zero test modifications"],
              ].map(([status, file, desc]) => (
                <div key={file} className="flex items-start gap-2">
                  <Pill color={status === "NEW" ? "green" : status === "CHANGED" ? "amber" : "zinc"}>{status}</Pill>
                  <span className="text-violet-400 font-mono shrink-0">{file}</span>
                  <span className="text-zinc-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Tests */}
        {activeTab === "tests" && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">EF-41 Tests — verificação de regressão</span>
              {results && <Pill color={results.allPassed ? "green" : "red"}>{results.allPassed ? "ZERO REGRESSÕES" : `${results.failed} REGRESSÃO(ÕES)`}</Pill>}
            </div>
            {results ? (
              results.results.map(r => <TestRow key={r.id} r={r} />)
            ) : (
              <div className="p-8 text-center text-zinc-500 text-sm">
                Pressione "Verificar Regressão" para confirmar que os 8 testes EF-41 continuam passando.
              </div>
            )}
          </div>
        )}

        {/* Final summary */}
        {!running && (
          <div className="border border-emerald-800/40 rounded-xl p-4 bg-emerald-950/10">
            <div className="text-emerald-400 font-bold text-xs mb-2 uppercase tracking-wider">Critérios de sucesso — EF-41A</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {[
                ["Menor acoplamento",             "Registry não depende de Index. Scanner não depende de OfficialLibraryTypes diretamente."],
                ["Melhor SRP",                    "Scanner valida. Builder constrói. Orchestrator orquestra. Registry organiza."],
                ["Responsabilidades explícitas",  "OfficialLibraryIndexOrchestrator vs OfficialLibraryIndexer — sem ambiguidade."],
                ["Sem duplicação conceitual",     "Um indexer de chunks (EF-7.x). Um orquestrador de metadados (EF-41)."],
                ["Integração com EF-42 facilitada","Retrieval Engine depende de OfficialLibraryAdapter — não de OfficialDocumentMeta."],
                ["Zero mudança de comportamento", "8 testes EF-41 passam sem modificação. API pública inalterada."],
              ].map(([title, desc]) => (
                <div key={title} className="border border-emerald-800/20 rounded p-2">
                  <div className="text-emerald-300 font-bold">{title}</div>
                  <div className="text-zinc-500">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}