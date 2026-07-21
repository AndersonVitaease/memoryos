/**
 * SprintEF425Page.jsx — Sprint EF-42.5
 * Official Content Index Engine — Dashboard
 */

import React, { useState, useCallback, useEffect } from "react";

// ── UI atoms ──────────────────────────────────────────────────────────────────

function Pill({ color = "zinc", children }) {
  const c = {
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
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
        <span className="text-zinc-400 font-mono text-xs w-5 shrink-0 mt-0.5">T{r.id}</span>
        <span className={`flex-1 text-sm ${r.passed ? "text-zinc-200" : "text-red-300"}`}>{r.name}</span>
        <span className="text-zinc-600 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && r.error && (
        <div className="px-3 pb-2 ml-14 border-l-2 border-zinc-700">
          <p className="text-xs text-red-400 font-mono">{r.error}</p>
        </div>
      )}
    </div>
  );
}

// ── Sample documents for demo indexing ───────────────────────────────────────

const SAMPLE_DOCS = [
  {
    documentId: "demo-mas",
    title: "MAS — MemoryOS Architecture Specification",
    content: `# MAS — MemoryOS Architecture Specification

## Overview

The MemoryOS Architecture Specification defines the official architecture of the MemoryOS platform.
It establishes the boundaries between all components, their responsibilities, and their communication contracts.

## Memory Layer

The memory layer is the core persistence mechanism of MemoryOS.
It stores all knowledge derived from user conversations, documents, and connected services.
The memory layer is designed to be immutable at the record level, append-only, and fully auditable.

### Memory Tiers

Memory is organized into three tiers:
- Active: recent, frequently accessed knowledge
- Historical: less frequent but important knowledge
- Archived: knowledge preserved for compliance and recall

## Retrieval Engine

The Retrieval Engine is responsible for finding relevant knowledge chunks based on keyword queries.
It is deterministic, reproducible, and operates without any LLM calls.
The engine scores documents and chunks using the KeywordMatcher FNV-1a algorithm.

## Pipeline Architecture

The official pipeline follows a strict linear sequence:
1. User input arrives at the Conversation Gateway
2. The Gateway routes to the appropriate Specialist or the Planner
3. The Planner retrieves context from the Memory Layer
4. The Planner constructs a prompt and calls the LLM
5. The LLM response is synthesized and stored as a new memory record
`,
  },
  {
    documentId: "demo-mes",
    title: "MES — MemoryOS Engineering Specification",
    content: `# MES — MemoryOS Engineering Specification

## Engineering Principles

All MemoryOS components must follow Single Responsibility Principle (SRP).
Every module has one reason to change and one reason to exist.

## Immutability

All data structures are readonly. Object.freeze() is applied at construction.
No mutation after instantiation. This applies to chunks, knowledge records, and all retrieval outputs.

## HMR-Safe Singletons

All singleton services must use the globalThis pattern to survive Hot Module Replacement.
Pattern:
  const G = globalThis as typeof globalThis & { __SERVICE__?: ServiceImpl };
  if (!G.__SERVICE__) G.__SERVICE__ = new ServiceImpl();
  export const Service = G.__SERVICE__;

## Sprint Protocol

Each sprint must:
- Define a clear scope boundary
- Implement without modifying unrelated components
- Include a full test suite
- Provide an operational dashboard
- Certify before merging

## Dependency Rules

Lower layers must not depend on higher layers.
Content Layer → Index Layer → Retrieval Layer → Planner Layer.
No circular dependencies are permitted.
`,
  },
  {
    documentId: "demo-adr001",
    title: "ADR-001 — Architecture Decision: HMR-Safe Singleton",
    content: `# ADR-001 — HMR-Safe Singleton Pattern

## Status: Accepted

## Context

During development with Vite HMR (Hot Module Replacement), module-level singleton instances
are destroyed and recreated on every save. This causes state loss in services that maintain
in-memory registries, caches, or indexes.

## Decision

All singleton services in MemoryOS must use the globalThis-scoped singleton pattern.

Implementation:
  const G = globalThis as typeof globalThis & { __MY_SERVICE__?: MyServiceImpl };
  if (!G.__MY_SERVICE__) G.__MY_SERVICE__ = new MyServiceImpl();
  export const MyService = G.__MY_SERVICE__;

## Consequences

- Singletons survive HMR reloads without losing state
- Services maintain their registries and indexes across hot reloads
- Pattern is consistent and auditable across the codebase
- Testing requires explicit clear() calls between test cases
`,
  },
];

// ── Indexer Panel ─────────────────────────────────────────────────────────────

function IndexerPanel({ onIndexed }) {
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  const handleIndex = useCallback(async () => {
    setRunning(true); setResult(null); setError(null);
    try {
      const { ContentIndexer } = await import("@/lib/official-library/content/ContentIndexer");
      const res = ContentIndexer.indexAll(SAMPLE_DOCS);
      setResult(res);
      onIndexed?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [onIndexed]);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-sm">Content Indexer</p>
          <p className="text-zinc-500 text-xs">Parser → ChunkBuilder → ChunkMetadataBuilder → ChunkIndex</p>
        </div>
        <button onClick={handleIndex} disabled={running}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg text-sm font-bold transition-colors">
          {running ? "Indexando..." : `Indexar ${SAMPLE_DOCS.length} documentos`}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
      {result && (
        <div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <Metric label="Documentos"  value={result.totalDocs}    color="text-violet-400" />
            <Metric label="Chunks"      value={result.totalChunks}  color="text-emerald-400" />
            <Metric label="Tokens"      value={result.totalTokens}  color="text-sky-400" />
            <Metric label="Tempo"       value={`${result.durationMs}ms`} color="text-amber-400" />
          </div>
          <div className="space-y-1">
            {result.results.map(r => (
              <div key={r.documentId} className={`flex items-center gap-3 text-xs border rounded p-2 ${r.success ? "border-emerald-800/40 bg-emerald-950/10" : "border-red-800/40 bg-red-950/10"}`}>
                <Pill color={r.success ? "green" : "red"}>{r.success ? "OK" : "ERR"}</Pill>
                <span className="text-zinc-300 flex-1 truncate font-mono">{r.documentId}</span>
                <span className="text-zinc-400">{r.chunksCreated} chunks</span>
                <span className="text-zinc-600">{r.totalTokens} tokens</span>
                <span className="text-zinc-600">{r.durationMs}ms</span>
                {r.error && <span className="text-red-400">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chunk Browser ─────────────────────────────────────────────────────────────

function ChunkBrowser() {
  const [docs, setDocs]         = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [chunks, setChunks]     = useState([]);
  const [stats, setStats]       = useState(null);
  const [selectedChunk, setSelectedChunk] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { ChunkIndex } = await import("@/lib/official-library/content/ChunkIndex");
      const s = ChunkIndex.stats();
      setStats(s);
      setDocs([...s.documentIds]);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadChunks = useCallback(async (docId) => {
    setSelectedDoc(docId);
    setSelectedChunk(null);
    try {
      const { ChunkIndex } = await import("@/lib/official-library/content/ChunkIndex");
      setChunks(ChunkIndex.getChunks(docId));
    } catch {}
  }, []);

  if (!stats || stats.totalDocuments === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">Nenhum documento indexado. Use o Indexer acima.</p>
        <button onClick={refresh} className="mt-3 text-xs text-violet-400 underline">Atualizar</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <Metric label="Documentos"   value={stats.totalDocuments}  color="text-violet-400" />
          <Metric label="Chunks"       value={stats.totalChunks}     color="text-emerald-400" />
          <Metric label="Tokens"       value={stats.totalTokens}     color="text-sky-400" />
          <Metric label="Média/Doc"    value={stats.avgChunksPerDoc} color="text-amber-400" />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {docs.map(id => (
          <button key={id} onClick={() => loadChunks(id)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-colors ${selectedDoc === id ? "bg-violet-700 border-violet-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}>
            {id}
          </button>
        ))}
        <button onClick={refresh} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors">↻ atualizar</button>
      </div>

      {selectedDoc && chunks.length > 0 && (
        <div className="flex gap-3">
          {/* Chunk list */}
          <div className="w-48 shrink-0 space-y-1">
            {chunks.map(c => (
              <button key={c.id} onClick={() => setSelectedChunk(c)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs border transition-colors ${selectedChunk?.id === c.id ? "bg-violet-700 border-violet-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}>
                <div className="font-mono">chunk::{c.order}</div>
                <div className="truncate opacity-60">{c.title}</div>
                <div className="text-zinc-600">{c.tokenEstimate}t</div>
              </button>
            ))}
          </div>

          {/* Chunk detail */}
          {selectedChunk && (
            <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3 min-w-0">
              <div className="flex flex-wrap gap-2">
                <Pill color="violet">order:{selectedChunk.order}</Pill>
                <Pill color="sky">{selectedChunk.tokenEstimate} tokens</Pill>
                <Pill color="indigo">{selectedChunk.chapter}</Pill>
                {selectedChunk.section !== selectedChunk.chapter && (
                  <Pill color="zinc">{selectedChunk.section}</Pill>
                )}
              </div>
              <p className="text-white font-bold text-sm">{selectedChunk.title}</p>
              <p className="text-zinc-400 text-xs italic">{selectedChunk.summary}</p>
              {selectedChunk.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedChunk.tags.map(t => (
                    <span key={t} className="bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded text-xs">{t}</span>
                  ))}
                </div>
              )}
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <div className="bg-zinc-800 px-3 py-1.5 flex items-center justify-between">
                  <span className="text-zinc-400 text-xs font-mono">{selectedChunk.id}</span>
                  <span className="text-zinc-600 text-xs">{selectedChunk.content.length} chars</span>
                </div>
                <pre className="p-3 text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-auto max-h-64">
                  {selectedChunk.content}
                </pre>
              </div>
            </div>
          )}
          {!selectedChunk && (
            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
              Selecione um chunk para visualizar
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Retrieval Test ────────────────────────────────────────────────────────────

function RetrievalTestPanel() {
  const [query, setQuery]   = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setRunning(true); setResult(null);
    try {
      const { OfficialRetrievalEngine } = await import("@/lib/official-library/retrieval/OfficialRetrievalEngine");
      // Seed index metadata so retrieval can find documents
      const { OfficialLibraryIndex }    = await import("@/lib/official-library/index/OfficialLibraryIndex");
      const now = new Date().toISOString();
      if (!OfficialLibraryIndex.isBuilt) {
        OfficialLibraryIndex.replaceAll(SAMPLE_DOCS.map(d => ({
          id: d.documentId, title: d.title, version: "1.0",
          category: "specification", type: "specification", status: "active",
          path: `src/docs/${d.documentId}.md`, checksum: d.documentId,
          chunkCount: 0, tokenEstimate: 0,
          keywords: d.title.toLowerCase().split(/\s+/).filter(w => w.length > 3),
          tags: [], relatedDocuments: [], createdAt: now, updatedAt: now,
        })));
      }
      setResult(OfficialRetrievalEngine.retrieve(q));
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setRunning(false);
    }
  }, []);

  const PRESETS = ["architecture pipeline memory", "engineering immutability singleton", "decision HMR pattern", "retrieval chunks keywords"];

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
      <p className="text-zinc-400 text-xs uppercase tracking-wider">Teste de Recuperação — Chunks Reais</p>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-violet-600"
          placeholder="consulta..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch(query)}
        />
        <button onClick={() => handleSearch(query)} disabled={running || !query.trim()}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg text-sm font-bold transition-colors">
          {running ? "..." : "Buscar"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(p => (
          <button key={p} onClick={() => { setQuery(p); handleSearch(p); }}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded font-mono">
            {p}
          </button>
        ))}
      </div>

      {result?.error && <p className="text-red-400 text-xs font-mono">{result.error}</p>}

      {result && !result.error && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <Metric label="Docs"      value={result.totalDocuments} color={result.totalDocuments > 0 ? "text-emerald-400" : "text-zinc-500"} />
            <Metric label="Chunks"    value={result.totalChunks}    color={result.totalChunks > 0 ? "text-sky-400" : "text-zinc-500"} />
            <Metric label="Top Score" value={result.topScore.toFixed(3)} />
            <Metric label="Tempo"     value={`${result.durationMs}ms`} color="text-violet-400" />
          </div>
          {result.documents.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-4">Nenhum documento encontrado.</p>
          ) : result.documents.map(doc => (
            <div key={doc.documentId} className="border border-zinc-700/60 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50">
                <span className="text-white font-bold text-sm">{doc.title}</span>
                <Pill color="violet">{doc.relevanceScore.toFixed(3)}</Pill>
              </div>
              {doc.matchedChunks.length > 0 && (
                <div className="p-3 space-y-1">
                  {doc.matchedChunks.map(c => (
                    <div key={c.chunkId} className="bg-zinc-900 rounded p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-violet-400 font-mono">{c.chunkId}</span>
                        <span className="text-zinc-400 font-mono">{c.score.toFixed(3)}</span>
                      </div>
                      <p className="text-zinc-400 font-mono truncate">{c.content.slice(0, 100)}...</p>
                      {c.matchReason && <p className="text-zinc-600 mt-0.5">motivo: {c.matchReason}</p>}
                    </div>
                  ))}
                </div>
              )}
              {doc.matchedChunks.length === 0 && (
                <p className="text-zinc-600 text-xs px-3 py-2 italic">Documento encontrado mas sem chunks indexados ainda.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SprintEF425Page() {
  const [running, setRunning]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState("indexer");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRunTests = useCallback(async () => {
    setRunning(true); setTestResult(null); setError(null);
    try {
      const { runOfficialContentIndexTests } = await import("@/lib/official-library/content/officialContentIndexTests");
      setTestResult(await runOfficialContentIndexTests());
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const TABS = ["indexer", "browser", "retrieval", "tests", "architecture"];

  const PIPELINE = [
    { label: "Documento Oficial (raw content)", color: "bg-zinc-700 text-zinc-200 border-zinc-500" },
    { label: "OfficialDocumentParser",           color: "bg-blue-900/60 text-blue-300 border-blue-700",    note: "limpa, extrai linhas e wordCount" },
    { label: "ChunkBuilder",                     color: "bg-violet-900/60 text-violet-300 border-violet-700", note: "300–800 tokens, sem cortar parágrafos" },
    { label: "ChunkMetadataBuilder",             color: "bg-indigo-900/60 text-indigo-300 border-indigo-700", note: "capítulo, seção, keywords, tokenEstimate" },
    { label: "ChunkIndex",                       color: "bg-sky-900/60 text-sky-300 border-sky-700",         note: "persiste, expõe getChunks(docId)" },
    { label: "OfficialRetrievalEngine",          color: "bg-emerald-900/60 text-emerald-300 border-emerald-700", note: "usa ChunkIndex (sem syntheticChunksFrom)" },
    { label: "RetrievedKnowledge (output)",      color: "bg-teal-900/60 text-teal-300 border-teal-700",      note: "contrato imutável para o Planner EF-43+" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-violet-950/40 border border-indigo-800/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <Pill color="indigo">SPRINT EF-42.5</Pill>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Content Index Engine</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">Chunks reais substituem sintéticos</span>
          </div>
          <h1 className="text-xl font-black text-white">Content Index Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Parser · ChunkBuilder · ChunkMetadataBuilder · ChunkIndex · ContentIndexer — SRP puro
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={handleRunTests} disabled={running}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors">
              {running ? "Executando..." : "Executar 15 Testes"}
            </button>
            {testResult && (
              <Pill color={testResult.allPassed ? "green" : "red"}>
                {testResult.allPassed ? `✓ ${testResult.passed}/${testResult.total} PASS` : `✗ ${testResult.failed} FALHOU`}
              </Pill>
            )}
          </div>
          {testResult && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passou"   value={testResult.passed}                 color="text-emerald-400" />
              <Metric label="Falhou"   value={testResult.failed}                 color={testResult.failed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total"    value={testResult.total} />
              <Metric label="Tempo"    value={`${testResult.durationMs}ms`}      color="text-indigo-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando 15 testes do Content Index Engine...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {!running && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {TABS.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors whitespace-nowrap px-2 ${activeTab === t ? "bg-indigo-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t === "indexer" ? "Indexer" : t === "browser" ? "Visualizador" : t === "retrieval" ? "Recuperação" : t === "tests" ? "Testes" : "Arquitetura"}
              </button>
            ))}
          </div>
        )}

        {/* Tab: Indexer */}
        {activeTab === "indexer" && !running && (
          <IndexerPanel onIndexed={() => setRefreshKey(k => k + 1)} />
        )}

        {/* Tab: Browser */}
        {activeTab === "browser" && !running && (
          <div key={refreshKey}>
            <ChunkBrowser />
          </div>
        )}

        {/* Tab: Retrieval */}
        {activeTab === "retrieval" && !running && <RetrievalTestPanel />}

        {/* Tab: Tests */}
        {activeTab === "tests" && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">15 Testes — EF-42.5</span>
              {testResult && <Pill color={testResult.allPassed ? "green" : "red"}>{testResult.allPassed ? "CERTIFICADO" : "COM FALHAS"}</Pill>}
            </div>
            {testResult ? (
              testResult.results.map(r => <TestRow key={r.id} r={r} />)
            ) : (
              <div className="p-8 text-center text-zinc-500 text-sm">
                Pressione "Executar 15 Testes" para certificar o Content Index Engine.
              </div>
            )}
          </div>
        )}

        {/* Tab: Architecture */}
        {activeTab === "architecture" && !running && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline EF-42.5</p>
              <div className="flex flex-col items-center gap-0">
                {PIPELINE.map((node, i, arr) => (
                  <React.Fragment key={node.label}>
                    <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-full max-w-md ${node.color}`}>
                      <div>{node.label}</div>
                      {node.note && <div className="font-normal opacity-60 mt-0.5">{node.note}</div>}
                    </div>
                    {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Componentes criados — EF-42.5</p>
              {[
                ["OfficialDocumentParser.ts",       "Limpa e extrai linhas/wordCount. SRP: apenas parsing."],
                ["ChunkMetadataBuilder.ts",          "Extrai capítulo, seção, hierarquia, keywords, tokenEstimate, profundidade."],
                ["ChunkBuilder.ts",                  "300–800 tokens por chunk. Nunca corta parágrafos. Preserva hierarquia."],
                ["ChunkIndex.ts",                    "Persiste chunks. API: store/get/getAll/count/clear/exists/stats. HMR-safe."],
                ["ContentIndexer.ts",               "Orquestra Parser→Builder→Index. Sem consultas, sem Planner."],
                ["officialContentIndexTests.ts",     "15 testes: parser, builder, capítulos, seções, ordem, tokens, vazio, extenso, ID, determinismo, imutabilidade, incremental, remoção, stats."],
                ["OfficialRetrievalEngine (mod)",   "Substituído syntheticChunksFrom() por ChunkIndex.getChunks(). Somente essa alteração."],
              ].map(([file, desc]) => (
                <div key={file} className="flex items-start gap-2 mb-2 text-xs">
                  <span className="text-indigo-400 font-mono shrink-0 w-60">{file}</span>
                  <span className="text-zinc-500">{desc}</span>
                </div>
              ))}
            </div>

            <div className="border border-emerald-800/30 rounded-xl p-4 bg-emerald-950/10">
              <p className="text-emerald-400 font-bold text-xs uppercase tracking-wider mb-2">Critérios de certificação EF-42.5</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {[
                  ["Chunks reais persistidos",       "ChunkIndex.count() > 0 após ContentIndexer.indexAll()"],
                  ["syntheticChunksFrom removido",   "OfficialRetrievalEngine usa exclusivamente ChunkIndex"],
                  ["15 testes aprovados",             "Parser, Builder, Index, retrieval, determinismo, imutabilidade"],
                  ["Nenhuma API pública alterada",    "ChunkSelector, KeywordMatcher, RetrievedKnowledge intactos"],
                  ["SRP preservado",                  "5 componentes com responsabilidade única e não sobrepostos"],
                  ["Dashboard operacional",           "Indexer + Visualizador + Recuperação em /sprint-ef425"],
                ].map(([title, desc]) => (
                  <div key={title} className="border border-emerald-800/20 rounded p-2">
                    <div className="text-emerald-300 font-bold">{title}</div>
                    <div className="text-zinc-500">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}